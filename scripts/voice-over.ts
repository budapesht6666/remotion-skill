/**
 * ОЗВУЧКА: реплики сценария → многоголосые аудиофайлы с таймингами слов.
 *
 *   npm run vo -- JuniorKumite                    # приоритет ElevenLabs → Gemini → edge-tts
 *   npm run vo -- JuniorKumite --engine edge      # принудительно один движок
 *   npm run vo -- JuniorKumite --only b03,b07     # переозвучить конкретные биты
 *   npm run vo -- JuniorKumite --force            # игнорировать кэш
 *
 * Движки пробуются по порядку, и если верхний недоступен (нет ключа, кончилась
 * квота), озвучка не падает, а спускается на следующий — и помечает сгоревший
 * движок, чтобы не ждать его таймауты на каждой реплике:
 *
 *   1. ElevenLabs — 22 голоса, ПОСИМВОЛЬНЫЕ тайминги (лучшее караоке), 1 кредит
 *      на символ. Ключ ELEVENLABS_API_KEY.
 *   2. Gemini TTS — подача задаётся ремаркой словами, но бесплатный тир упирается
 *      в лимит запросов после нескольких реплик. Границ слов не отдаёт —
 *      распределяем равномерно. Ключ GEMINI_API_KEY.
 *   3. edge-tts — бесплатно и без лимитов, но два русских голоса на всех.
 *
 * Результат: public/vo/<Comp>/<beat>.m4a + vo.json (длительности и слова).
 * Их читает `npm run cut`, чтобы длина видеофрагмента подчинялась длине реплики.
 */
import "dotenv/config";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { probe, run } from "./lib/media";
import { stripStress } from "./lib/text";
import { applyRules, elevenLocators, loadPronunciation, rulesSignature } from "./lib/pronunciation";

const GEMINI_ROOT = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";
const GEMINI_SAMPLE_RATE = 24000;
/** Пауза между запросами Gemini — бесплатный тир считает запросы в минуту. */
const GEMINI_THROTTLE_MS = 9000;

const ELEVEN_ROOT = "https://api.elevenlabs.io/v1";
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";

export type Engine = "eleven" | "gemini" | "edge";
const ENGINE_ORDER: Engine[] = ["eleven", "gemini", "edge"];

/** Слово с таймингом относительно начала реплики — основа караоке-субтитров. */
export type Word = { w: string; s: number; e: number };

export type VoiceClip = {
  id: string;
  file: string;
  speaker: string;
  line: string;
  engine: Engine;
  durationInSeconds: number;
  words: Word[];
  hash: string;
};

type VoiceDef = {
  elevenVoiceId: string;
  elevenName: string;
  stability: number;
  elevenStyle: number;
  voice: string;
  stylePrompt: string;
  edgeVoice: string;
  pitch: string;
  rate: string;
};

type ScriptBeat = { id: string; speaker?: string; line?: string };

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const onlyIdx = argv.indexOf("--only");
  const engineIdx = argv.indexOf("--engine");
  return {
    comp: positional[0] ?? "",
    only: onlyIdx >= 0 ? (argv[onlyIdx + 1]?.split(",") ?? null) : null,
    force: argv.includes("--force"),
    engine: engineIdx >= 0 ? (argv[engineIdx + 1] as Engine) : null,
  };
}

/** «+24%» → 1.24. Темп применяется одинаково для всех движков. */
function tempoOf(rate: string): number {
  const percent = Number(rate.replace("%", ""));
  return Number.isFinite(percent) ? 1 + percent / 100 : 1;
}

// --- ElevenLabs --------------------------------------------------------------

/**
 * Синтез + посимвольный alignment. Слова собираются склейкой непробельных
 * символов: начало слова — время первого символа, конец — последнего.
 */
async function synthesizeEleven(
  text: string,
  voice: VoiceDef,
  dest: string,
  apiKey: string,
  locators: ReturnType<typeof elevenLocators>,
): Promise<Word[]> {
  const res = await fetch(
    `${ELEVEN_ROOT}/text-to-speech/${voice.elevenVoiceId}/with-timestamps`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: ELEVEN_MODEL,
        ...(locators ? { pronunciation_dictionary_locators: locators } : {}),
        voice_settings: {
          stability: voice.stability,
          similarity_boost: 0.75,
          style: voice.elevenStyle,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    audio_base64: string;
    alignment?: {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    };
  };
  await writeFile(dest, Buffer.from(data.audio_base64, "base64"));

  const al = data.alignment;
  if (!al) return [];
  const words: Word[] = [];
  let current: { w: string; s: number; e: number } | null = null;
  al.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (current) words.push(current);
      current = null;
      return;
    }
    if (!current) {
      current = { w: ch, s: al.character_start_times_seconds[i], e: al.character_end_times_seconds[i] };
    } else {
      current.w += ch;
      current.e = al.character_end_times_seconds[i];
    }
  });
  if (current) words.push(current);
  return words.map((w) => ({ ...w, s: Number(w.s.toFixed(3)), e: Number(w.e.toFixed(3)) }));
}

// --- Gemini TTS --------------------------------------------------------------

/** PCM без контейнера → WAV: 44-байтовый заголовок перед данными. */
function wavHeader(dataLength: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // моно
  header.writeUInt32LE(GEMINI_SAMPLE_RATE, 24);
  header.writeUInt32LE(GEMINI_SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
}

async function synthesizeGemini(
  text: string,
  voice: VoiceDef,
  dest: string,
  apiKey: string,
): Promise<Word[]> {
  const res = await fetch(`${GEMINI_ROOT}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${voice.stylePrompt}: ${text}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.voice } },
        },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data: string } }[] } }[];
  };
  const b64 = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  if (!b64) throw new Error("Gemini не вернул аудио");
  const pcm = Buffer.from(b64, "base64");
  await writeFile(dest, Buffer.concat([wavHeader(pcm.length), pcm]));

  // Границ слов Gemini не отдаёт — раскладываем равномерно, для караоке хватает.
  const total = pcm.length / 2 / GEMINI_SAMPLE_RATE;
  const parts = text.split(/\s+/).filter(Boolean);
  return parts.map((w, i) => ({
    w,
    s: Number(((total / parts.length) * i).toFixed(3)),
    e: Number(((total / parts.length) * (i + 1)).toFixed(3)),
  }));
}

// --- edge-tts ----------------------------------------------------------------

async function synthesizeEdge(text: string, voice: VoiceDef, dest: string): Promise<Word[]> {
  // Текст идёт файлом в UTF-8, а не аргументом: в argv Windows кириллица
  // калечится системной кодировкой, и edge-tts отвечает «No audio received».
  const textPath = `${dest}.txt`;
  const wordsPath = `${dest}.words.json`;
  await writeFile(textPath, text, "utf8");
  try {
    await run("python", [
      path.resolve("scripts/lib/edge_tts_words.py"),
      textPath,
      voice.edgeVoice,
      voice.rate,
      voice.pitch,
      dest,
      wordsPath,
    ]);
    return JSON.parse(await readFile(wordsPath, "utf8")) as Word[];
  } finally {
    await unlink(textPath).catch(() => {});
    await unlink(wordsPath).catch(() => {});
  }
}

// -----------------------------------------------------------------------------

async function main() {
  const { comp, only, force, engine: forcedEngine } = parseArgs(process.argv.slice(2));
  if (!comp) {
    console.error("Укажите композицию: npm run vo -- JuniorKumite");
    process.exit(1);
  }

  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const disabled = new Set<Engine>();
  if (!elevenKey) disabled.add("eleven");
  if (!geminiKey) disabled.add("gemini");

  const order = forcedEngine ? [forcedEngine] : ENGINE_ORDER.filter((e) => !disabled.has(e));
  console.log(`Движки по приоритету: ${order.join(" → ")}`);

  // Словарь произношения: ElevenLabs получает локатор, остальные движки — ту же
  // замену локально, чтобы ударения не зависели от того, какой движок выжил.
  const pron = await loadPronunciation();
  const locators = elevenLocators(pron);
  if (pron.rules.length && !locators) {
    console.log(`⚠ Словарь произношения не синхронизирован — запусти npm run dict`);
  } else if (locators) {
    console.log(`Словарь произношения: ${pron.rules.length} правил (${pron.hash})`);
  }

  const compDir = path.resolve("src/compositions", comp);
  const { SCRIPT } = (await import(pathToFileURL(path.join(compDir, "script.ts")).href)) as {
    SCRIPT: ScriptBeat[];
  };
  const { VOICES } = (await import(pathToFileURL(path.join(compDir, "voices.ts")).href)) as {
    VOICES: Record<string, VoiceDef>;
  };

  const outDir = path.resolve("public/vo", comp);
  await mkdir(outDir, { recursive: true });
  const metaPath = path.join(outDir, "vo.json");
  const previous: VoiceClip[] = existsSync(metaPath)
    ? (JSON.parse(await readFile(metaPath, "utf8")) as VoiceClip[])
    : [];

  const spoken = SCRIPT.filter((b) => b.line && b.speaker);
  const targets = only ? spoken.filter((b) => only.includes(b.id)) : spoken;
  const clips: VoiceClip[] = [];
  let geminiCalls = 0;
  const t0 = Date.now();

  for (const beat of targets) {
    const voice = VOICES[beat.speaker!];
    if (!voice) throw new Error(`Бит ${beat.id}: нет голоса «${beat.speaker}» в voices.ts`);

    const file = path.join(outDir, `${beat.id}.m4a`);
    const cached = previous.find((c) => c.id === beat.id);

    // Перебираем движки сверху вниз: первый, который отработал, и остаётся.
    // Сгоревший (квота, отозванный ключ) выключается на весь прогон.
    let engine: Engine | null = null;
    let words: Word[] = [];
    let rawPath = "";
    let hash = "";

    for (const candidate of order.filter((e) => !disabled.has(e))) {
      const signature =
        candidate === "eleven"
          ? `eleven|${ELEVEN_MODEL}|${voice.elevenVoiceId}|${voice.stability}|${voice.elevenStyle}`
          : candidate === "gemini"
            ? `gemini|${GEMINI_MODEL}|${voice.voice}|${voice.stylePrompt}`
            : `edge|${voice.edgeVoice}|${voice.pitch}`;
      // Правила произношения входят в подпись, но только те, что задевают эту
      // реплику: поменял слово — переозвучились фразы с этим словом, а не весь
      // ролик.
      hash = createHash("sha1")
        .update(`${signature}|${voice.rate}|${rulesSignature(beat.line!, pron.rules)}|${beat.line}`)
        .digest("hex")
        .slice(0, 12);

      if (!force && cached?.hash === hash && existsSync(file)) {
        engine = candidate;
        words = cached.words;
        console.log(`${beat.id}  ${cached.durationInSeconds.toFixed(1)} c  (кэш)`);
        break;
      }

      const label =
        candidate === "eleven"
          ? voice.elevenName
          : candidate === "gemini"
            ? voice.voice
            : voice.edgeVoice;
      process.stdout.write(`${beat.id}  ${beat.speaker}/${label} [${candidate}]… `);
      rawPath = path.join(outDir, `${beat.id}.${candidate === "gemini" ? "wav" : "mp3"}`);
      try {
        if (candidate === "eleven") {
          words = await synthesizeEleven(beat.line!, voice, rawPath, elevenKey!, locators);
        } else if (candidate === "gemini") {
          if (geminiCalls > 0) await new Promise((r) => setTimeout(r, GEMINI_THROTTLE_MS));
          geminiCalls++;
          words = await synthesizeGemini(applyRules(beat.line!, pron.rules), voice, rawPath, geminiKey!);
        } else {
          words = await synthesizeEdge(applyRules(beat.line!, pron.rules), voice, rawPath);
        }
        engine = candidate;
        break;
      } catch (err) {
        disabled.add(candidate);
        console.log(`\n  ↳ ${candidate} отвалился (${String(err).slice(0, 140)}), беру следующий`);
      }
    }

    if (!engine) throw new Error(`Бит ${beat.id}: ни один движок озвучки не отработал`);
    if (cached?.hash === hash && !force && existsSync(file)) {
      clips.push(cached);
      continue;
    }

    // Темп: у edge-tts он уже применён при синтезе, остальным ускоряем через ffmpeg.
    const tempo = engine === "edge" ? 1 : tempoOf(voice.rate);
    const filters = [
      ...(Math.abs(tempo - 1) > 0.01 ? [`atempo=${tempo.toFixed(3)}`] : []),
      "loudnorm=I=-14:TP=-1.5:LRA=11",
    ].join(",");
    await run("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", rawPath,
      "-af", filters,
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      file,
    ]);
    await unlink(rawPath).catch(() => {});

    // Тайминги слов сжимаются вместе со звуком.
    if (Math.abs(tempo - 1) > 0.01) {
      words = words.map((w) => ({
        w: w.w,
        s: Number((w.s / tempo).toFixed(3)),
        e: Number((w.e / tempo).toFixed(3)),
      }));
    }
    // Синтез отдаёт слова очищенными от пунктуации: возвращаем знаки из исходной
    // строки, иначе караоке читается как «Опыт Бесценный опыт».
    const tokens = beat.line!.split(/\s+/).filter(Boolean);
    if (tokens.length === words.length) {
      words = words.map((word, i) => ({ ...word, w: tokens[i] }));
    }
    // Знак ударения нужен был движку, в субтитре он мусор.
    words = words.map((word) => ({ ...word, w: stripStress(word.w) }));

    const info = await probe(file);
    clips.push({
      id: beat.id,
      file: `vo/${comp}/${beat.id}.m4a`,
      speaker: beat.speaker!,
      line: stripStress(beat.line!),
      engine,
      durationInSeconds: Number(info.duration.toFixed(2)),
      words,
      hash,
    });
    console.log(`${info.duration.toFixed(1)} c`);
  }

  const merged = only ? [...previous.filter((p) => !only.includes(p.id)), ...clips] : clips;
  merged.sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(metaPath, JSON.stringify(merged, null, 2), "utf8");

  const total = merged.reduce((s, c) => s + c.durationInSeconds, 0);
  const byEngine = merged.reduce<Record<string, number>>((acc, c) => {
    acc[c.engine] = (acc[c.engine] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `\nГотово за ${((Date.now() - t0) / 1000).toFixed(0)} c: ${merged.length} реплик ` +
      `(${Object.entries(byEngine).map(([e, n]) => `${e}: ${n}`).join(", ")}), ` +
      `${total.toFixed(1)} c речи\n  ${metaPath}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

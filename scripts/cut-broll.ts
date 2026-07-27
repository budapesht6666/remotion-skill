/**
 * СБОРКА РОЛИКА С ЗАКАДРОВЫМ МОНОЛОГОМ: сплошная озвучка + b-roll под неё.
 *
 *   npm run broll -- StethamTales
 *
 * Чем отличается от `npm run cut` (cut-clips.ts). Там монтажной единицей был
 * бит: одна реплика — один кадр, и длина кадра равнялась длине реплики плюс
 * хвост. Для диалога это правильно, но для закадрового рассказа даёт два
 * дефекта: на каждой склейке слышна пауза, а видеоряд не может меняться чаще,
 * чем говорящий заканчивает предложение.
 *
 * Здесь монтажная единица — план (`Shot`), привязанный к фразе (`line`).
 * Скрипт делает два дела:
 *
 *   1. **Склеивает озвучку в одну дорожку.** У каждой фразы по краям срезается
 *      тишина — границы известны точно из пословных таймингов ElevenLabs, так
 *      что резать «на глаз» через silenceremove не нужно. Фразы встают встык,
 *      и рассказ идёт без провалов. Явная пауза задаётся полем `gap`.
 *   2. **Режет планы.** Планы одной фразы делят её длительность по весам:
 *      три плана с weight 1 на фразе в 3.6 c дадут по 1.2 c каждый. Монтаж
 *      привязан к смыслу, а не к секундомеру, — если переозвучить фразу и она
 *      станет длиннее, кадры растянутся вместе с ней.
 *
 * Результат: public/vo/<Comp>/narration.m4a (вся речь одним файлом),
 * public/clips/<Comp>/*.mp4 и broll.json — манифест с абсолютными таймингами
 * слов, по которым композиция рисует караоке.
 */
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { run, tc, probe } from "./lib/media";
import { findFilm } from "./lib/films";
import { FORMAT } from "../src/lib/format";

/** План видеоряда: кусок фильма, привязанный к фразе монолога. */
export type Shot = {
  /** id фразы из SCRIPT, под которую идёт план. */
  line: string;
  /** slug фильма из scripts/lib/films.ts */
  film: string;
  start: number;
  /** Доля длительности фразы. Планы одной фразы делят её пропорционально. */
  weight?: number;
  /** Зачем план в истории (для читаемости сценария). */
  note?: string;
  /** Замедление: 1.4 = в полтора раза медленнее. */
  slow?: number;
  /** Громкость оригинальной дорожки фильма под монологом (0…1). */
  originalVolume?: number;
  /**
   * Не вырезать полосу разборчивости. По умолчанию оригинальные голоса
   * глушатся (под монологом они мешают), но реву титанов и взрыву фильтр
   * не нужен — там нет речи, а есть фактура.
   */
  raw?: boolean;
  /** Кадрирование под вертикаль: увеличение и сдвиг центра, −1…1. */
  zoom?: number;
  panX?: number;
  panY?: number;
};

type Phrase = {
  id: string;
  line: string;
  speaker?: string;
  wisdom?: boolean;
  gap?: number;
};

type VoiceClip = {
  id: string;
  file: string;
  durationInSeconds: number;
  words: { w: string; s: number; e: number }[];
};

export type BrollClip = {
  id: string;
  file: string;
  durationInFrames: number;
  originalVolume: number;
  zoom: number;
  panX: number;
  panY: number;
  note: string | null;
};

/** Слово монолога с таймингом от начала ролика. */
export type NarrationWord = { w: string; s: number; e: number };

/** Фраза на общем таймлайне — по ней композиция подсвечивает караоке и плашки. */
export type NarrationPhrase = {
  id: string;
  line: string;
  start: number;
  end: number;
  wisdom: boolean;
  words: NarrationWord[];
};

export type BrollManifest = {
  narrationFile: string;
  durationInFrames: number;
  clips: BrollClip[];
  phrases: NarrationPhrase[];
};

/** Поля вокруг речи при обрезке тишины: вдох слышен, провал — уже нет. */
const PAD_HEAD = 0.06;
const PAD_TAIL = 0.12;
/** Минимальная длина плана: короче — мельтешение, которое читается как ошибка. */
const MIN_SHOT = 0.5;

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  return {
    comp: positional[0] ?? "",
    only: argv.includes("--only") ? argv[argv.indexOf("--only") + 1]?.split(",") ?? null : null,
    /** Только пересобрать озвучку, не трогая нарезку. */
    voiceOnly: argv.includes("--voice-only"),
  };
}

async function main() {
  const { comp, only, voiceOnly } = parseArgs(process.argv.slice(2));
  if (!comp) {
    console.error("Укажите композицию: npm run broll -- StethamTales");
    process.exit(1);
  }

  const scriptPath = path.resolve("src/compositions", comp, "script.ts");
  if (!existsSync(scriptPath)) {
    console.error(`Нет сценария: ${scriptPath}`);
    process.exit(1);
  }
  const { SCRIPT, SHOTS } = (await import(pathToFileURL(scriptPath).href)) as {
    SCRIPT: Phrase[];
    SHOTS: Shot[];
  };

  const voPath = path.resolve("public/vo", comp, "vo.json");
  if (!existsSync(voPath)) {
    console.error(`Нет озвучки: ${voPath}. Сначала: npm run vo -- ${comp}`);
    process.exit(1);
  }
  const voClips = JSON.parse(await readFile(voPath, "utf8")) as VoiceClip[];

  const voDir = path.resolve("public/vo", comp);
  const clipDir = path.resolve("public/clips", comp);
  const tmpDir = path.join(voDir, ".tmp");
  await mkdir(clipDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  // --- 1. Склейка озвучки встык -------------------------------------------
  // Каждая фраза обрезается по границам речи и получает свой отрезок общего
  // таймлайна. Абсолютные тайминги слов копятся здесь же — второй раз их
  // считать негде, а караоке без них не нарисовать.
  const phrases: NarrationPhrase[] = [];
  const segments: string[] = [];
  let cursor = 0;

  for (const phrase of SCRIPT) {
    const vo = voClips.find((v) => v.id === phrase.id);
    if (!vo) throw new Error(`Фраза ${phrase.id}: нет озвучки в vo.json`);

    const words = vo.words ?? [];
    const head = words.length > 0 ? Math.max(0, words[0].s - PAD_HEAD) : 0;
    const tail =
      words.length > 0
        ? Math.min(vo.durationInSeconds, words[words.length - 1].e + PAD_TAIL)
        : vo.durationInSeconds;
    const speech = tail - head;
    if (speech <= 0) throw new Error(`Фраза ${phrase.id}: пустая озвучка`);

    const gap = phrase.gap ?? 0;
    const segPath = path.join(tmpDir, `${phrase.id}.wav`);
    await run("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-ss", String(head),
      "-t", String(speech),
      "-i", path.resolve("public", vo.file),
      // Тишина после фразы добавляется здесь же — так пауза попадает и в
      // дорожку, и в таймлайн, и они не могут разъехаться.
      "-af", `aresample=48000${gap > 0 ? `,apad=pad_dur=${gap}` : ""}`,
      "-ac", "1",
      "-c:a", "pcm_s16le",
      segPath,
    ]);
    segments.push(segPath);

    phrases.push({
      id: phrase.id,
      line: phrase.line,
      start: Number(cursor.toFixed(3)),
      end: Number((cursor + speech).toFixed(3)),
      wisdom: Boolean(phrase.wisdom),
      words: words.map((w) => ({
        w: w.w,
        s: Number((cursor + Math.max(0, w.s - head)).toFixed(3)),
        e: Number((cursor + Math.max(0, w.e - head)).toFixed(3)),
      })),
    });
    cursor += speech + gap;
  }

  const listPath = path.join(tmpDir, "concat.txt");
  await writeFile(
    listPath,
    segments.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"),
    "utf8",
  );
  const narrationPath = path.join(voDir, "narration.m4a");
  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "concat", "-safe", "0",
    "-i", listPath,
    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    narrationPath,
  ]);
  const narrationInfo = await probe(narrationPath);
  console.log(
    `Озвучка склеена: ${SCRIPT.length} фраз, ${narrationInfo.duration.toFixed(1)} c ` +
      `(по таймлайну ${cursor.toFixed(1)} c)\n  ${narrationPath}`,
  );

  // --- 2. Нарезка планов ---------------------------------------------------
  // Длительности считаются по границам в кадрах, а не сложением секунд: иначе
  // ошибки округления копятся и к концу ролика картинка уезжает от голоса.
  type Plan = Shot & { id: string; duration: number; frames: number };
  const plans: Plan[] = [];
  let timeAcc = 0;
  let index = 0;

  for (const phrase of phrases) {
    const source = SCRIPT.find((p) => p.id === phrase.id)!;
    const own = SHOTS.filter((s) => s.line === phrase.id);
    if (own.length === 0) throw new Error(`Фраза ${phrase.id}: нет ни одного плана в SHOTS`);

    // План покрывает и паузу после фразы — молчание должно чем-то заполняться.
    const span = phrase.end - phrase.start + (source.gap ?? 0);
    const totalWeight = own.reduce((s, sh) => s + (sh.weight ?? 1), 0);

    for (const shot of own) {
      const duration = (span * (shot.weight ?? 1)) / totalWeight;
      const startFrame = Math.round(timeAcc * FORMAT.fps);
      timeAcc += duration;
      const frames = Math.round(timeAcc * FORMAT.fps) - startFrame;
      index += 1;
      plans.push({
        ...shot,
        id: `s${String(index).padStart(2, "0")}_${shot.line}`,
        duration,
        frames,
      });
    }
  }

  const short = plans.filter((p) => p.duration < MIN_SHOT);
  const targets = voiceOnly
    ? []
    : only
      ? plans.filter((p) => only.includes(p.id))
      : plans;
  const t0 = Date.now();

  for (const plan of targets) {
    const film = findFilm(plan.film);
    const slow = plan.slow ?? 1;
    const outDuration = plan.frames / FORMAT.fps;
    const srcDuration = outDuration / slow;
    const file = path.join(clipDir, `${plan.id}.mp4`);

    process.stdout.write(
      `${plan.id}  ${film.slug} ${tc(plan.start)}–${tc(plan.start + srcDuration)}  ` +
        `(${outDuration.toFixed(2)} c${slow !== 1 ? `, ×${slow}` : ""})… `,
    );

    const videoFilter = [
      "scale=1080:-2:flags=lanczos",
      ...(slow !== 1 ? [`setpts=${slow}*PTS`] : []),
      `fps=${FORMAT.fps}`,
    ].join(",");
    // Монолог идёт поверх всего ролика, поэтому оригинальные голоса глушатся
    // всегда, кроме планов с `raw` — там речи нет, а есть рёв и взрывы.
    const audioFilter = [
      ...(slow !== 1 ? [`atempo=${(1 / slow).toFixed(3)}`] : []),
      "loudnorm=I=-16:TP=-1.5:LRA=11",
      ...(plan.raw ? [] : ["lowpass=f=180"]),
    ].join(",");

    await run("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-ss", String(plan.start),
      "-t", String(srcDuration),
      "-i", film.path,
      "-vf", videoFilter,
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-af", audioFilter,
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-movflags", "+faststart",
      file,
    ]);
    console.log("ок");
  }

  const clips: BrollClip[] = plans.map((plan) => ({
    id: plan.id,
    file: `clips/${comp}/${plan.id}.mp4`,
    durationInFrames: plan.frames,
    originalVolume: plan.originalVolume ?? 0.3,
    zoom: plan.zoom ?? 1,
    panX: plan.panX ?? 0,
    panY: plan.panY ?? 0,
    note: plan.note ?? null,
  }));

  const manifest: BrollManifest = {
    narrationFile: `vo/${comp}/narration.m4a`,
    durationInFrames: clips.reduce((s, c) => s + c.durationInFrames, 0),
    clips,
    phrases,
  };
  const manifestPath = path.join(clipDir, "broll.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  await rm(tmpDir, { recursive: true, force: true });

  console.log(
    `\nГотово за ${((Date.now() - t0) / 1000).toFixed(0)} c: ${targets.length} планов перерезано, ` +
      `в манифесте ${clips.length}, ` +
      `${(manifest.durationInFrames / FORMAT.fps).toFixed(1)} c хронометража\n  ${manifestPath}`,
  );
  if (short.length > 0) {
    console.log(`\nСлишком короткие планы (< ${MIN_SHOT} c) — добавьте им weight:`);
    for (const p of short) console.log(`  ${p.id}: ${p.duration.toFixed(2)} c — ${p.note ?? ""}`);
  }
  if (voiceOnly) console.log("\n--voice-only: нарезка не тронута.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

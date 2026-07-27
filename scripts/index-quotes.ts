/**
 * ИНДЕКС РЕПЛИК: фильм → все фразы с точными таймкодами.
 *
 *   npm run quotes -- bloodsport
 *   npm run quotes -- "C:/путь/к/фильму.mkv"
 *   npm run quotes -- bloodsport --force      # переиндексировать
 *
 * Как работает:
 *   1. Если в контейнере есть субтитровая дорожка — предупреждаем (её текст
 *      точнее ASR, но у дублированного кино он расходится с озвучкой).
 *   2. Тянем речь в моно 16 кГц opus 24 кбит/с (~16 МБ на 90 минут).
 *   3. Groq whisper-large-v3-turbo (216× реального времени) → сегменты + слова.
 *   4. Пишем data/index/<slug>/quotes.json (полный, со словами для караоке)
 *      и quotes.txt — грепаемый список строк «[id] MM:SS.d-MM:SS.d текст».
 *
 * Ключ: GROQ_API_KEY в .env. Free tier — 25 МБ на файл, 7200 аудио-секунд в час,
 * то есть один полный фильм. Файлы больше лимита режутся на части автоматически.
 */
import "dotenv/config";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { probe, extractSpeechAudio, run, tc } from "./lib/media";
import { findFilm } from "./lib/films";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo";
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024; // лимит free tier 25 МБ, берём с запасом
const CHUNK_OVERLAP = 5; // c — перекрытие кусков, чтобы не терять фразу на стыке

export type Word = { w: string; s: number; e: number };
export type Quote = {
  id: string;
  start: number;
  end: number;
  text: string;
  words: Word[];
};
export type QuoteIndex = {
  film: string;
  title: string;
  source: string;
  duration: number;
  model: string;
  createdAt: string;
  quotes: Quote[];
};

type GroqSegment = { start: number; end: number; text: string; no_speech_prob?: number };
type GroqWord = { word: string; start: number; end: number };
type GroqResponse = { segments?: GroqSegment[]; words?: GroqWord[]; text?: string };

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  return {
    film: positional[0] ?? "",
    force: argv.includes("--force"),
  };
}

async function transcribeFile(
  file: string,
  language: string,
  apiKey: string,
): Promise<GroqResponse> {
  const buf = await readFile(file);
  const form = new FormData();
  form.append("file", new Blob([buf]), path.basename(file));
  form.append("model", MODEL);
  form.append("language", language);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("timestamp_granularities[]", "word");
  form.append("temperature", "0");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Groq HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  return (await res.json()) as GroqResponse;
}

/** Режет аудио на куски, влезающие в лимит загрузки, с перекрытием. */
async function splitAudio(
  audioPath: string,
  duration: number,
  parts: number,
  outDir: string,
): Promise<{ file: string; offset: number }[]> {
  const span = duration / parts;
  const chunks: { file: string; offset: number }[] = [];
  for (let i = 0; i < parts; i++) {
    const offset = Math.max(0, i * span - (i === 0 ? 0 : CHUNK_OVERLAP));
    const length = span + (i === 0 ? CHUNK_OVERLAP : CHUNK_OVERLAP * 2);
    const file = path.join(outDir, `chunk-${i}.ogg`);
    await run("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-ss", String(offset),
      "-t", String(length),
      "-i", audioPath,
      "-c", "copy",
      file,
    ]);
    chunks.push({ file, offset });
  }
  return chunks;
}

/**
 * Мусор, который whisper выдаёт на музыке и вшитых титрах релиза: подписи
 * рипера, «ПОДПИШИСЬ НА КАНАЛ», ремарки про музыку. В индексе они бесполезны и
 * только мешают искать реплики.
 */
const NOISE = [
  /^субтитры/i,
  /подпишись/i,
  /^[А-ЯЁ\s!,.]{8,}$/,
  /музыка$/i,
  /^редактор субтитров/i,
  /корректор/i,
];

function buildQuotes(
  segments: GroqSegment[],
  words: GroqWord[],
): Quote[] {
  const quotes: Quote[] = [];
  let n = 0;
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;
    // Явный мусор ASR на музыке/шуме: whisper любит галлюцинировать титры.
    if ((seg.no_speech_prob ?? 0) > 0.8) continue;
    if (NOISE.some((re) => re.test(text))) continue;
    const segWords = words
      .filter((w) => w.start >= seg.start - 0.05 && w.end <= seg.end + 0.05)
      .map((w) => ({ w: w.word.trim(), s: w.start, e: w.end }));
    quotes.push({
      id: `q${String(++n).padStart(4, "0")}`,
      start: Number(seg.start.toFixed(2)),
      end: Number(seg.end.toFixed(2)),
      text,
      words: segWords,
    });
  }
  return quotes;
}

async function main() {
  const { film: filmArg, force } = parseArgs(process.argv.slice(2));
  if (!filmArg) {
    console.error("Укажите фильм: npm run quotes -- bloodsport");
    process.exit(1);
  }
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error(
      "Нет GROQ_API_KEY в .env.\n" +
        "Ключ бесплатный: console.groq.com → API Keys. Он нужен для быстрой\n" +
        "транскрипции (92-минутный фильм ≈ 2 минуты вместо 40 на локальном whisper).",
    );
    process.exit(1);
  }

  const film = findFilm(filmArg);
  if (!existsSync(film.path)) {
    console.error(`Файл не найден: ${film.path}`);
    process.exit(1);
  }

  const outDir = path.resolve("data/index", film.slug);
  const jsonPath = path.join(outDir, "quotes.json");
  if (existsSync(jsonPath) && !force) {
    console.log(`Индекс уже есть: ${jsonPath} (--force чтобы пересобрать)`);
    return;
  }
  await mkdir(outDir, { recursive: true });

  const info = await probe(film.path);
  console.log(
    `${film.title}: ${(info.duration / 60).toFixed(1)} мин, ` +
      `аудио ${info.audio?.codec_name}/${info.audio?.channels}ch, ` +
      `субтитров внутри: ${info.subtitles.length}`,
  );
  if (info.subtitles.length > 0) {
    console.log(
      "  ↳ в контейнере есть субтитры — для советского кино их текст точнее ASR;\n" +
        "    при желании извлеките: ffmpeg -i <film> -map 0:s:0 subs.srt",
    );
  }

  const tmpDir = path.join(outDir, ".tmp");
  await mkdir(tmpDir, { recursive: true });
  const audioPath = path.join(tmpDir, "speech.ogg");
  if (!existsSync(audioPath) || force) {
    process.stdout.write("Извлекаю речь… ");
    const t0 = Date.now();
    await extractSpeechAudio(film.path, audioPath, {
      channels: info.audio?.channels ?? 2,
    });
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)} c`);
  }

  const size = (await stat(audioPath)).size;
  const parts = Math.ceil(size / MAX_UPLOAD_BYTES);
  console.log(
    `Аудио ${(size / 1e6).toFixed(1)} МБ → ${parts === 1 ? "один запрос" : `${parts} части`}`,
  );

  const chunks =
    parts === 1
      ? [{ file: audioPath, offset: 0 }]
      : await splitAudio(audioPath, info.duration, parts, tmpDir);

  const segments: GroqSegment[] = [];
  const words: GroqWord[] = [];
  const t0 = Date.now();
  for (const [i, chunk] of chunks.entries()) {
    process.stdout.write(`Распознаю ${i + 1}/${chunks.length}… `);
    const res = await transcribeFile(chunk.file, film.language, apiKey);
    // Сегменты из зоны перекрытия отбрасываем — иначе фраза продублируется.
    const minStart = i === 0 ? -Infinity : chunk.offset + CHUNK_OVERLAP / 2;
    for (const s of res.segments ?? []) {
      const start = s.start + chunk.offset;
      if (start < minStart) continue;
      segments.push({ ...s, start, end: s.end + chunk.offset });
    }
    for (const w of res.words ?? []) {
      const start = w.start + chunk.offset;
      if (start < minStart) continue;
      words.push({ ...w, start, end: w.end + chunk.offset });
    }
    console.log("ок");
  }

  const quotes = buildQuotes(segments, words);
  const index: QuoteIndex = {
    film: film.slug,
    title: film.title,
    source: film.path,
    duration: info.duration,
    model: MODEL,
    createdAt: new Date().toISOString(),
    quotes,
  };
  await writeFile(jsonPath, JSON.stringify(index), "utf8");

  // Плоский текст — по нему ищутся реплики под сценарий (grep быстрее, чем JSON).
  const txt = quotes
    .map((q) => `${q.id}  ${tc(q.start)}-${tc(q.end)}  ${q.text}`)
    .join("\n");
  await writeFile(path.join(outDir, "quotes.txt"), txt, "utf8");

  console.log(
    `\nГотово за ${((Date.now() - t0) / 1000).toFixed(0)} c: ${quotes.length} реплик\n` +
      `  ${jsonPath}\n  ${path.join(outDir, "quotes.txt")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

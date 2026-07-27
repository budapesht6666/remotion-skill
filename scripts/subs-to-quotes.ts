/**
 * ИНДЕКС РЕПЛИК ИЗ ВСТРОЕННЫХ СУБТИТРОВ — бесплатная альтернатива `npm run quotes`.
 *
 *   npm run subs -- godzilla-kong
 *   npm run subs -- godzilla-kong --track 4     # конкретный поток из ffprobe
 *   npm run subs -- godzilla-kong --lang eng
 *
 * Пишет тот же формат, что и index-quotes.ts (quotes.json + грепаемый quotes.txt),
 * поэтому дальше пайплайн не различает, откуда взялся индекс.
 *
 * Когда брать этот путь вместо ASR:
 *   • в раздаче есть русская дорожка субтитров (у WEB-DL почти всегда) — текст
 *     точнее распознавания и содержит имена собственные без искажений;
 *   • Groq упёрся в почасовой лимит (ASPH) и ждать 40+ минут не хочется;
 *   • нужны надписи-локации («ГДЕ-ТО НА ПОЛОЙ ЗЕМЛЕ») — ASR их не слышит вообще,
 *     а для навигации по фильму это лучшие якоря.
 *
 * Ограничение: пословных таймингов в субтитрах нет, слова раскладываются внутри
 * реплики равномерно по длине. Для навигации этого достаточно; караоке в наших
 * роликах рисуется по своей озвучке (vo.json), а не по чужой дорожке.
 */
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { run, probe, tc } from "./lib/media";
import { findFilm } from "./lib/films";
import type { Quote, QuoteIndex, Word } from "./index-quotes";

/** Теги, которыми размечены субтитры: рендерить их в индекс незачем. */
const TAG_RE = /<[^>]*>|\{\\[^}]*\}/g;

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const opt = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    film: positional[0] ?? "",
    track: opt("track") ? Number(opt("track")) : null,
    lang: opt("lang") ?? "rus",
  };
}

/** "00:01:02,345" → секунды. */
function srtTime(value: string): number {
  const m = value.trim().match(/^(\d+):(\d+):(\d+)[,.](\d+)$/);
  if (!m) throw new Error(`Плохой таймкод SRT: ${value}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

/**
 * Разбор SRT. Блоки разделены пустой строкой: номер, таймкод, одна или несколько
 * строк текста. Переносы внутри реплики склеиваются пробелом — в индексе строка
 * должна быть цельной, иначе grep находит половину фразы.
 */
function parseSrt(raw: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  const blocks = raw.replace(/\r/g, "").split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length < 2) continue;
    const tcLine = lines.find((l) => l.includes("-->"));
    if (!tcLine) continue;
    const [from, to] = tcLine.split("-->");
    const text = lines
      .slice(lines.indexOf(tcLine) + 1)
      .join(" ")
      .replace(TAG_RE, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    out.push({ start: srtTime(from), end: srtTime(to), text });
  }
  return out;
}

/** Слова раскладываются пропорционально длине — грубо, но монотонно по времени. */
function spreadWords(text: string, start: number, end: number): Word[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const total = tokens.reduce((acc, t) => acc + t.length, 0) || 1;
  const span = Math.max(end - start, 0.001);
  let cursor = start;
  return tokens.map((w) => {
    const dur = (w.length / total) * span;
    const word = { w, s: Number(cursor.toFixed(3)), e: Number((cursor + dur).toFixed(3)) };
    cursor += dur;
    return word;
  });
}

async function main() {
  const { film: filmArg, track, lang } = parseArgs(process.argv.slice(2));
  if (!filmArg) {
    console.error("Укажите фильм: npm run subs -- godzilla-kong");
    process.exit(1);
  }
  const film = findFilm(filmArg);
  const info = await probe(film.path);
  if (info.subtitles.length === 0) {
    console.error(
      `В «${film.title}» нет субтитров внутри контейнера — используйте npm run quotes (ASR).`,
    );
    process.exit(1);
  }

  // Дорожка: явно заданная, иначе самая длинная на нужном языке. «Полные» весят
  // больше «форсированных», а по размеру потока их не отличить — берём по
  // количеству реплик уже после извлечения.
  const candidates =
    track != null
      ? info.subtitles.filter((s) => s.index === track)
      : info.subtitles.filter((s) => (s.tags?.language ?? "").startsWith(lang.slice(0, 3)));
  const pool = candidates.length > 0 ? candidates : info.subtitles;

  const outDir = path.join("data/index", film.slug);
  const tmpDir = path.join(outDir, ".tmp");
  await mkdir(tmpDir, { recursive: true });

  console.log(
    `${film.title}: ${(info.duration / 60).toFixed(1)} мин, ` +
      `дорожек субтитров: ${info.subtitles.length}, кандидатов «${lang}»: ${pool.length}`,
  );

  let best: { cues: ReturnType<typeof parseSrt>; stream: number } | null = null;
  for (const stream of pool) {
    const dest = path.join(tmpDir, `sub-${stream.index}.srt`);
    try {
      await run("ffmpeg", [
        "-y", "-hide_banner", "-loglevel", "error",
        "-i", film.path,
        "-map", `0:${stream.index}`,
        "-c:s", "srt",
        dest,
      ]);
    } catch (err) {
      console.log(`  поток ${stream.index}: извлечь не вышло (${String(err).slice(0, 80)})`);
      continue;
    }
    const cues = parseSrt(await readFile(dest, "utf8"));
    const title = stream.tags?.title ?? stream.tags?.language ?? "";
    console.log(`  поток ${stream.index} (${title}): ${cues.length} реплик`);
    if (!best || cues.length > best.cues.length) best = { cues, stream: stream.index };
  }

  if (!best || best.cues.length === 0) {
    console.error("Ни одна дорожка не разобралась. Попробуйте --track <index> или ASR.");
    process.exit(1);
  }

  const quotes: Quote[] = best.cues.map((c, i) => ({
    id: `q${String(i + 1).padStart(4, "0")}`,
    start: c.start,
    end: c.end,
    text: c.text,
    words: spreadWords(c.text, c.start, c.end),
  }));

  const index: QuoteIndex = {
    film: film.slug,
    title: film.title,
    source: film.path,
    duration: info.duration,
    model: `embedded-subs:${best.stream}`,
    createdAt: new Date().toISOString(),
    quotes,
  };
  await writeFile(path.join(outDir, "quotes.json"), JSON.stringify(index), "utf8");
  await writeFile(
    path.join(outDir, "quotes.txt"),
    quotes.map((q) => `${q.id}  ${tc(q.start)}-${tc(q.end)}  ${q.text}`).join("\n"),
    "utf8",
  );
  await rm(tmpDir, { recursive: true, force: true });

  console.log(
    `\nГотово: ${quotes.length} реплик из потока ${best.stream}\n` +
      `  ${path.join(outDir, "quotes.json")}\n  ${path.join(outDir, "quotes.txt")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Склейка закадрового монолога встык.
 *
 * Фразы синтезируются по отдельности (так TTS держит интонацию), но в ролике
 * должны звучать одной непрерывной дорожкой. Тишина по краям каждого файла
 * срезается по ПОСЛОВНЫМ таймингам, а не по громкости: движки оставляют разный
 * «воздух» до первого и после последнего слова, и на слух это читается как
 * заикание монтажа.
 *
 * Вынесено из `scripts/cut-broll.ts` — логика уже стоила итераций, и второй
 * её копии в проекте быть не должно.
 */
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { run, probe } from "./media";
import { stripStress } from "./text";

/** Подрезка по краям речи, c. Меньше — рубит придыхание, больше — слышна пауза. */
const PAD_HEAD = 0.06;
const PAD_TAIL = 0.12;

export type VoiceWord = { w: string; s: number; e: number };

/** То, что кладёт в vo.json `npm run vo`. */
export type VoiceClip = {
  id: string;
  /** Путь внутри public/. */
  file: string;
  durationInSeconds: number;
  words?: VoiceWord[];
};

/** Фраза с абсолютными таймингами по всему ролику. */
export type NarrationPhrase = {
  id: string;
  line: string;
  start: number;
  end: number;
  words: VoiceWord[];
};

export type NarrationResult = {
  /** Путь внутри public/ — как его ждёт staticFile(). */
  narrationFile: string;
  phrases: NarrationPhrase[];
  /** Длина таймлайна, c (речь + паузы). */
  totalSeconds: number;
};

export async function buildNarration(args: {
  comp: string;
  script: { id: string; line: string; gap?: number }[];
  voClips: VoiceClip[];
}): Promise<NarrationResult> {
  const { comp, script, voClips } = args;
  const voDir = path.resolve("public/vo", comp);
  const tmpDir = path.join(voDir, ".tmp");
  await mkdir(tmpDir, { recursive: true });

  const phrases: NarrationPhrase[] = [];
  const segments: string[] = [];
  let cursor = 0;

  for (const phrase of script) {
    const vo = voClips.find((v) => v.id === phrase.id);
    if (!vo) throw new Error(`Фраза ${phrase.id}: нет озвучки в vo.json — прогоните npm run vo`);

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
      // Пауза добавляется здесь же — так она попадает и в дорожку, и в
      // таймлайн, и они не могут разъехаться.
      "-af", `aresample=48000${gap > 0 ? `,apad=pad_dur=${gap}` : ""}`,
      "-ac", "1",
      "-c:a", "pcm_s16le",
      segPath,
    ]);
    segments.push(segPath);

    phrases.push({
      id: phrase.id,
      line: stripStress(phrase.line),
      start: Number(cursor.toFixed(3)),
      end: Number((cursor + speech).toFixed(3)),
      words: words.map((w) => ({
        w: w.w,
        s: Number((cursor + Math.max(0, w.s - head)).toFixed(3)),
        e: Number((cursor + Math.max(0, w.e - head)).toFixed(3)),
      })),
    });
    cursor += speech + gap;
  }

  const listPath = path.join(tmpDir, "concat.txt");
  await writeFile(listPath, segments.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"), "utf8");

  const narrationPath = path.join(voDir, "narration.m4a");
  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "concat", "-safe", "0",
    "-i", listPath,
    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    narrationPath,
  ]);

  const info = await probe(narrationPath);
  console.log(
    `Озвучка склеена: ${script.length} фраз, ${info.duration.toFixed(1)} c ` +
      `(по таймлайну ${cursor.toFixed(1)} c)`,
  );

  return {
    narrationFile: path.posix.join("vo", comp, "narration.m4a"),
    phrases,
    totalSeconds: cursor,
  };
}

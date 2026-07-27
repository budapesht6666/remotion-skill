/**
 * Общие ffmpeg/ffprobe-хелперы для пайплайна нарезки чужого видео.
 *
 * Все функции — тонкие обёртки над бинарниками ffmpeg (должен быть в PATH).
 * Никакой логики монтажа здесь нет: только «вытащить», «померить», «порезать».
 */
import { spawn } from "node:child_process";

export type ProbeStream = {
  index: number;
  codec_type: "video" | "audio" | "subtitle" | string;
  codec_name?: string;
  width?: number;
  height?: number;
  channels?: number;
  display_aspect_ratio?: string;
  r_frame_rate?: string;
  tags?: Record<string, string>;
};

export type Probe = {
  duration: number;
  streams: ProbeStream[];
  video: ProbeStream | null;
  audio: ProbeStream | null;
  subtitles: ProbeStream[];
};

/** Запускает процесс и отдаёт stdout. Ошибку кидает вместе с хвостом stderr. */
export function run(
  cmd: string,
  args: string[],
  onStderr?: (chunk: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      onStderr?.(s);
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited with ${code}\n${stderr.slice(-4000)}`));
    });
  });
}

/** Метаданные файла: длительность, дорожки, есть ли субтитры внутри контейнера. */
export async function probe(file: string): Promise<Probe> {
  const out = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-show_streams",
    "-of", "json",
    file,
  ]);
  const data = JSON.parse(out) as {
    format?: { duration?: string };
    streams?: ProbeStream[];
  };
  const streams = data.streams ?? [];
  return {
    duration: Number(data.format?.duration ?? 0),
    streams,
    video: streams.find((s) => s.codec_type === "video") ?? null,
    audio: streams.find((s) => s.codec_type === "audio") ?? null,
    subtitles: streams.filter((s) => s.codec_type === "subtitle"),
  };
}

/**
 * Дорожка речи для ASR: моно 16 кГц opus 24 кбит/с (~16 МБ на 90 минут —
 * помещается в бесплатный лимит Groq в 25 МБ одним куском).
 *
 * Если в источнике 5.1, берём центральный канал: там лежат чистые диалоги без
 * музыки и эффектов — распознавание заметно точнее.
 */
export async function extractSpeechAudio(
  src: string,
  dest: string,
  opts: { channels?: number; bitrate?: string } = {},
): Promise<void> {
  const { channels = 2, bitrate = "24k" } = opts;
  const filter = channels >= 6 ? ["-af", "pan=mono|c0=FC"] : ["-ac", "1"];
  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", src,
    "-vn",
    ...filter,
    "-ar", "16000",
    "-c:a", "libopus",
    "-b:a", bitrate,
    dest,
  ]);
}

/** Секунды → "MM:SS.d" (формат, в котором удобно грепать индекс глазами). */
export function tc(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

/** "MM:SS" | "HH:MM:SS" | "123.4" → секунды. */
export function parseTc(value: string): number {
  const parts = value.trim().split(":").map(Number);
  if (parts.some((p) => Number.isNaN(p))) throw new Error(`Плохой таймкод: ${value}`);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

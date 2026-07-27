/**
 * ИНДЕКС ДЕЙСТВИЙ: что происходит в кадре, с таймкодами — через Gemini video.
 *
 *   npm run shots -- bloodsport --from 38:00 --to 46:00
 *   npm run shots -- bloodsport --from 38:00 --to 46:00 --ask "реакции шока крупным планом"
 *
 * Реплики покрывают ~90 % монтажа, но истории нужны немые планы: реакция,
 * взгляд, удар, уход. Отсматривать их руками дорого, поэтому:
 *   1. Из нужной зоны собирается лёгкая прокси-копия (1 fps, 480p, без звука) —
 *      Gemini всё равно сэмплит видео в 1 fps, качество ему не нужно.
 *   2. Прокси уходит в Gemini, тот возвращает JSON с таймкодами и описанием.
 *   3. Границы уточняются локально детектором сцен в окне ±6 c, чтобы клип
 *      начинался на склейке, а не в середине панорамы.
 *
 * Результат — data/index/<slug>/shots.json (дописывается по зонам).
 * Ключ: GEMINI_API_KEY в .env.
 */
import "dotenv/config";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { probe, run, parseTc, tc } from "./lib/media";
import { findFilm } from "./lib/films";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
const INLINE_LIMIT = 18 * 1024 * 1024; // выше этого — File API

export type Shot = {
  id: string;
  start: number;
  end: number;
  action: string;
  who: string;
  size: "close" | "medium" | "wide" | string;
  speech: boolean;
  zone: string;
};

const PROMPT_BASE = `Ты помогаешь монтажёру искать кадры для короткого ролика.
Посмотри видео и выпиши моменты, пригодные для нарезки: действия, реакции,
выразительные крупные планы, входы и уходы персонажей.

Верни ТОЛЬКО JSON-массив без markdown-обёртки. Каждый элемент:
{
  "time": "MM:SS",        // начало момента в этом видео
  "duration": 2.5,         // сколько секунд момент длится
  "action": "...",        // что происходит, коротко и конкретно, по-русски
  "who": "...",           // кто в кадре (внешность/роль, имён можно не знать)
  "size": "close|medium|wide",
  "speech": true|false     // есть ли в этот момент говорящий человек в кадре
}
Не описывай сюжет целиком, не пересказывай диалоги. Нужны именно монтажные
единицы: 15–40 штук на отрезок, самые выразительные.`;

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else positional.push(a);
  }
  return { film: positional[0] ?? "", flags };
}

/** Имя модели может меняться — если дефолт не отвечает, берём свежую flash из списка. */
async function resolveModel(apiKey: string): Promise<string> {
  const res = await fetch(`${API_ROOT}/models?key=${apiKey}&pageSize=200`);
  if (!res.ok) return DEFAULT_MODEL;
  const data = (await res.json()) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
  };
  const names = (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
  if (names.includes(DEFAULT_MODEL)) return DEFAULT_MODEL;
  const flash = names
    .filter((n) => n.includes("flash") && !n.includes("thinking") && !n.includes("image"))
    .sort()
    .reverse();
  if (flash.length === 0) throw new Error(`Нет доступных моделей: ${names.join(", ")}`);
  console.log(`Модель ${DEFAULT_MODEL} недоступна, беру ${flash[0]}`);
  return flash[0];
}

/** Прокси-копия зоны: 1 fps, 480p, без звука — грузится за секунды. */
async function makeProxy(
  src: string,
  from: number,
  to: number,
  dest: string,
): Promise<void> {
  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-ss", String(from),
    "-t", String(to - from),
    "-i", src,
    "-an",
    "-vf", "fps=1,scale=480:-2",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "30",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    dest,
  ]);
}

async function uploadFile(file: string, apiKey: string): Promise<string> {
  const buf = await readFile(file);
  const startRes = await fetch(`${API_ROOT}/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(buf.length),
      "X-Goog-Upload-Header-Content-Type": "video/mp4",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: path.basename(file) } }),
  });
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error(`Не выдан upload URL: ${await startRes.text()}`);

  const upRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(buf.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: buf,
  });
  const info = (await upRes.json()) as { file?: { uri: string; name: string; state: string } };
  if (!info.file?.uri) throw new Error(`Загрузка не удалась: ${JSON.stringify(info)}`);

  // Видео обрабатывается на их стороне — ждём ACTIVE.
  let state = info.file.state;
  for (let i = 0; state === "PROCESSING" && i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await fetch(`${API_ROOT}/${info.file.name}?key=${apiKey}`);
    state = ((await st.json()) as { state: string }).state;
  }
  if (state !== "ACTIVE") throw new Error(`Файл не готов, состояние ${state}`);
  return info.file.uri;
}

async function askGemini(
  model: string,
  apiKey: string,
  prompt: string,
  video: { inline?: Buffer; uri?: string },
): Promise<string> {
  const part = video.uri
    ? { file_data: { mime_type: "video/mp4", file_uri: video.uri } }
    : { inline_data: { mime_type: "video/mp4", data: video.inline!.toString("base64") } };

  const res = await fetch(`${API_ROOT}/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [part, { text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 600)}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error(`Пустой ответ: ${JSON.stringify(data).slice(0, 600)}`);
  return text;
}

/** Сдвигает начало клипа на ближайшую смену плана — иначе режем посреди движения. */
async function snapToCut(src: string, time: number, window = 6): Promise<number> {
  const from = Math.max(0, time - window / 2);
  let log = "";
  await run(
    "ffmpeg",
    [
      "-hide_banner", "-nostats",
      "-ss", String(from),
      "-t", String(window),
      "-i", src,
      "-vf", "select='gt(scene,0.25)',metadata=print",
      "-an", "-f", "null", "-",
    ],
    (chunk) => (log += chunk),
  );
  const times = [...log.matchAll(/pts_time:([\d.]+)/g)].map((m) => from + Number(m[1]));
  if (times.length === 0) return time;
  return times.reduce((best, t) => (Math.abs(t - time) < Math.abs(best - time) ? t : best), times[0]);
}

async function main() {
  const { film: filmArg, flags } = parseArgs(process.argv.slice(2));
  if (!filmArg) {
    console.error("Укажите фильм: npm run shots -- bloodsport --from 38:00 --to 46:00");
    process.exit(1);
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error(
      "Нет GEMINI_API_KEY в .env (aistudio.google.com/apikey — бесплатный тир).\n" +
        "Без него индекс действий придётся набивать контактными листами: npm run sheet",
    );
    process.exit(1);
  }

  const film = findFilm(filmArg);
  const info = await probe(film.path);
  const from = flags.from ? parseTc(String(flags.from)) : 0;
  const to = flags.to ? parseTc(String(flags.to)) : Math.min(info.duration, from + 600);
  const zone = `${Math.round(from)}-${Math.round(to)}`;
  const ask = flags.ask ? `\n\nОсобое внимание: ${flags.ask}` : "";

  const outDir = path.resolve("data/index", film.slug);
  const tmpDir = path.join(outDir, ".tmp");
  await mkdir(tmpDir, { recursive: true });
  const proxy = path.join(tmpDir, `proxy-${zone}.mp4`);

  console.log(`${film.title}: зона ${tc(from)}–${tc(to)} (${Math.round(to - from)} c)`);
  process.stdout.write("Собираю прокси… ");
  const t0 = Date.now();
  await makeProxy(film.path, from, to, proxy);
  const size = (await stat(proxy)).size;
  console.log(`${(size / 1e6).toFixed(1)} МБ за ${((Date.now() - t0) / 1000).toFixed(0)} c`);

  const model = await resolveModel(apiKey);
  process.stdout.write(`Спрашиваю ${model}… `);
  const t1 = Date.now();
  const buf = await readFile(proxy);
  const video =
    size > INLINE_LIMIT ? { uri: await uploadFile(proxy, apiKey) } : { inline: buf };
  const raw = await askGemini(model, apiKey, PROMPT_BASE + ask, video);
  console.log(`${((Date.now() - t1) / 1000).toFixed(0)} c`);

  const items = JSON.parse(raw.replace(/^```json\s*|```$/g, "")) as {
    time: string;
    duration?: number;
    action: string;
    who?: string;
    size?: string;
    speech?: boolean;
  }[];

  process.stdout.write(`Уточняю границы ${items.length} планов… `);
  const shots: Shot[] = [];
  for (const [i, it] of items.entries()) {
    const rel = parseTc(it.time);
    const abs = from + rel;
    const snapped = await snapToCut(film.path, abs);
    shots.push({
      id: `s${zone}-${String(i + 1).padStart(3, "0")}`,
      start: Number(snapped.toFixed(2)),
      end: Number((snapped + (it.duration ?? 2.5)).toFixed(2)),
      action: it.action,
      who: it.who ?? "",
      size: (it.size as Shot["size"]) ?? "medium",
      speech: it.speech ?? false,
      zone,
    });
  }
  console.log("ок");

  const shotsPath = path.join(outDir, "shots.json");
  const prev: Shot[] = existsSync(shotsPath)
    ? (JSON.parse(await readFile(shotsPath, "utf8")) as Shot[])
    : [];
  const merged = [...prev.filter((s) => s.zone !== zone), ...shots].sort(
    (a, b) => a.start - b.start,
  );
  await writeFile(shotsPath, JSON.stringify(merged, null, 2), "utf8");

  const txt = merged
    .map((s) => `${s.id}  ${tc(s.start)}-${tc(s.end)}  [${s.size}${s.speech ? ",речь" : ""}]  ${s.action} — ${s.who}`)
    .join("\n");
  await writeFile(path.join(outDir, "shots.txt"), txt, "utf8");

  console.log(`\n${shots.length} планов в зоне, всего ${merged.length}: ${shotsPath}`);
  for (const s of shots.slice(0, 10)) console.log(`  ${tc(s.start)}  ${s.action}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

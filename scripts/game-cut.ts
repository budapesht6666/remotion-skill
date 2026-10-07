/**
 * ШОРТС ИЗ СЪЁМКИ СВОЕЙ ИГРЫ: монтажный лист → клипы, раскладка времени, звук.
 *
 *   npm run gamecut -- SpaceFlightShort
 *
 * Читает src/compositions/<Comp>/edit.ts (куски клипов, якоря, speed-ramp) и
 * съёмку игры, на которую он ссылается (`SOURCE`): клипы без звука, дорожки
 * эффектов и пушек каждого клипа, лог событий по кадрам. Кладёт в
 * public/clips/<Comp>/:
 *
 *   • <clip>.mp4   — клипы как есть (композиция выбирает кадры сама);
 *   • edit.json    — таймлайн: какой кадр исходника стоит на каждом кадре
 *                    ролика, удары под панч-зум (из лога: Nova, убийства),
 *                    баннеры игры;
 *   • audio.wav    — ВЕСЬ звук ролика одной дорожкой.
 *
 * Почему звук собирается здесь, а не слоями `<Audio>` в композиции: на границах
 * `<Sequence>` Remotion теряет 20–50 мс звука, и каждая склейка слышна как
 * провал (`ValleyMural`). Здесь же звук идёт за speed-ramp: эффекты и пушки
 * ресемплятся по той же раскладке времени, что и картинка.
 *
 * Музыка — не нарезка по клипам (в каждом клипе свой трек, и склейки рвали бы
 * мелодию), а одна подложка из треков игры: интро босса вступает на ударе Nova,
 * дальше тема босса; на смерти последнего босса музыка обрывается под
 * саб-удар, на баннере MISSION COMPLETE — победный джингл, за ним тема меню,
 * как это делает сама игра.
 */
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { run } from "./lib/media";
import type { ClipId, Piece } from "../src/compositions/SpaceFlightShort/edit";
import { resolveSrc } from "../src/compositions/SpaceFlightShort/timeline";
import type { GameCutManifest } from "../src/compositions/SpaceFlightShort/timeline";

const RATE = 48000;

type GameEvent = {
  f: number;
  type: string;
  size?: string;
  boss?: boolean;
  part?: boolean;
  name?: string;
  style?: string;
  text?: string;
};
type GameLog = { fps: number; frames: number; events: GameEvent[] };

type Edit = {
  FPS: number;
  GRID: number;
  BEAT: number;
  SOURCE: { dir: string; music: string };
  PIECES: Piece[];
  MIX: {
    guns: number;
    hitBoost: Record<string, [number, number, number]>;
    subDrop: Record<string, number>;
    duckOnBoss: [number, number];
    tailFadeFrames: number;
    lufs: number;
    truePeak: number;
  };
};

/**
 * Громкости музыки игры (data/audio.ts) × её настройка по умолчанию (шаг 7 из
 * 10, в квадрате) × 1.35: по одной формуле подложка выходила на 2.6 дБ тише
 * музыкальных стемов съёмки (RMS 0.048 против ≈0.065), а в ролике музыка ведёт
 * монтаж — баланс выровнен по стемам.
 */
const MUSIC_VOLUME = { bossIntro: 0.55, boss: 0.55, jingleWin: 0.6, menu: 0.55 } as const;
const MUSIC_GAIN = 0.49 * 1.35;
/** Интро босса — ровно четыре доли (2 c на 120 BPM): тема босса вступает на пятую. */
const INTRO_BEATS = 4;
/** Джингл победы стихает к 3.4 c — там же, с затуханием, вступает тема меню. */
const MENU_AFTER_JINGLE = 3.4;
const MENU_FADE_IN = 0.8;
/** Короткий фейд на каждом краю куска, чтобы склейка не щёлкала. */
const EDGE_FADE = Math.round(0.012 * RATE);
/**
 * Задержка звука в готовом MP4 от Remotion: дорожка AAC пишется с edit list,
 * начинающимся с нуля, и разгон кодировщика проигрывается — звук отстаёт от
 * картинки ровно на 2048 сэмплов (42.7 мс, 2.5 кадра на 60 fps). Замерено
 * сверкой рендера с исходной дорожкой (SpaceFlightShort v1, ValleyKid v3 —
 * одинаково), поэтому дорожка заранее сдвигается на столько же раньше.
 */
const RENDER_AUDIO_DELAY = 2048;

const log = (...args: unknown[]) => console.log(...args);

async function decode(file: string, tmp: string): Promise<Float32Array> {
  const raw = path.join(tmp, `${path.basename(file)}.f32`);
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", file,
    "-f", "f32le", "-ac", "1", "-ar", String(RATE), raw,
  ]);
  const buf = await readFile(raw);
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

/** Первый слышимый сэмпл трека: mp3 начинается с ~0.08 c тишины кодека. */
function attack(x: Float32Array): number {
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.01) return i;
  return 0;
}

/** Добавляет `src × gain × env(i)` в `out` с сэмпла `at`. */
function place(
  out: Float32Array,
  src: Float32Array,
  at: number,
  gain: number,
  env: (i: number) => number = () => 1,
) {
  const from = Math.max(0, -at);
  const to = Math.min(src.length, out.length - at);
  for (let i = from; i < to; i++) out[at + i] += src[i] * gain * env(at + i);
}

/**
 * Саб-удар под взрыв: свип 120→36 Гц с перегрузом. Чистый саб телефон не
 * воспроизводит, а гармоники от tanh дают удар и на динамике телефона.
 */
function subDrop(seconds = 1.4): Float32Array {
  const n = Math.round(seconds * RATE);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const f = 36 + (120 - 36) * Math.exp(-t / 0.22);
    phase += (2 * Math.PI * f) / RATE;
    const env = Math.min(1, t / 0.004) * Math.exp(-t / 0.42);
    out[i] = (Math.tanh(1.8 * Math.sin(phase)) / Math.tanh(1.8)) * env * 0.5;
  }
  return out;
}

const rms = (x: Float32Array, from = 0, to = x.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
};

async function fileSize(file: string): Promise<number> {
  try {
    return (await stat(file)).size;
  } catch {
    return -1;
  }
}

async function main() {
  const comp = process.argv[2];
  if (!comp) {
    console.error("usage: npm run gamecut -- <Composition>");
    process.exit(1);
  }
  const editPath = path.resolve("src/compositions", comp, "edit.ts");
  if (!existsSync(editPath)) throw new Error(`no ${editPath}`);
  const edit = (await import(pathToFileURL(editPath).href)) as Edit;
  const { FPS, GRID, SOURCE, PIECES, MIX } = edit;
  const SPF = RATE / FPS;

  const outDir = path.resolve("public/clips", comp);
  const tmp = path.join(outDir, ".tmp");
  await mkdir(tmp, { recursive: true });

  // ── Клипы и логи ────────────────────────────────────────────────────────
  const clips = [...new Set(PIECES.map((p) => p.clip))];
  const logs = new Map<ClipId, GameLog>();
  for (const id of clips) {
    const from = path.join(SOURCE.dir, "clips", `${id}.mp4`);
    const to = path.join(outDir, `${id}.mp4`);
    if ((await fileSize(to)) !== (await fileSize(from))) await copyFile(from, to);
    logs.set(id, JSON.parse(await readFile(path.join(SOURCE.dir, "events", `${id}.json`), "utf8")));
  }

  // ── Таймлайн ────────────────────────────────────────────────────────────
  let at = 0;
  const pieces = PIECES.map((p) => {
    const src = resolveSrc(p);
    const game = logs.get(p.clip)!;
    if (game.fps !== FPS) throw new Error(`${p.clip}: shot at ${game.fps} fps, edit is ${FPS}`);
    const first = src[0];
    const last = src[src.length - 1];
    if (first < 0 || last > game.frames - 1) {
      throw new Error(
        `${p.id}: needs source frames ${first.toFixed(1)}…${last.toFixed(1)}, ` +
          `${p.clip} has 0…${game.frames - 1}`,
      );
    }
    const piece = { ...p, src, at };
    at += p.frames;
    return piece;
  });
  const total = at;
  const length = Math.round((total / FPS) * RATE);

  // Кадр ролика, на котором исходник доходит до кадра `f` (или null — не в куске).
  const outFrameOf = (piece: (typeof pieces)[number], f: number): number | null => {
    if (f < piece.src[0] - 0.5 || f > piece.src[piece.src.length - 1] + 0.5) return null;
    const i = piece.src.findIndex((s) => s >= f - 0.5);
    return i < 0 ? null : piece.at + i;
  };

  // ── Удары и баннеры из лога ─────────────────────────────────────────────
  const hits: GameCutManifest["hits"] = [];
  const banners: GameCutManifest["banners"] = [];
  for (const piece of pieces) {
    const focus = piece.focus ?? [0.5, 0.5];
    for (const e of logs.get(piece.clip)!.events) {
      const f = outFrameOf(piece, e.f);
      if (f === null) continue;
      if (e.type === "novaBomb") hits.push({ f, kind: "nova", name: "NOVA", focus });
      else if (e.type === "enemyKilled" && e.boss) hits.push({ f, kind: "boss", name: e.name ?? "", focus });
      else if (e.type === "enemyKilled" && e.size === "medium") {
        hits.push({ f, kind: "part", name: e.name ?? "", focus: [0.5, 0.5] });
      } else if (e.type === "banner") banners.push({ f, style: e.style ?? "", text: e.text ?? "" });
    }
  }
  hits.sort((a, b) => a.f - b.f);
  const bossHits = hits.filter((h) => h.kind === "boss");
  const finalHit = bossHits[bossHits.length - 1];
  if (finalHit) finalHit.kind = "final";

  // ── Эффекты и пушки: каждый кусок по своей раскладке времени ────────────
  const sfx = new Float32Array(length);
  const guns = new Float32Array(length);
  const stems = new Map<string, Float32Array>();
  const stem = async (clip: ClipId, kind: "sfx" | "guns") => {
    const key = `${clip}.${kind}`;
    if (!stems.has(key)) stems.set(key, await decode(path.join(SOURCE.dir, "audio", `${key}.wav`), tmp));
    return stems.get(key)!;
  };
  for (const piece of pieces) {
    const a = await stem(piece.clip, "sfx");
    const g = await stem(piece.clip, "guns");
    const start = Math.round(piece.at * SPF);
    const end = Math.min(length, Math.round((piece.at + piece.frames) * SPF));
    const { src } = piece;
    for (let n = start; n < end; n++) {
      // Дробный кадр куска → дробный кадр исходника → сэмпл дорожки.
      const p = (n - start) / SPF;
      const i = Math.min(Math.floor(p), src.length - 1);
      const next = i + 1 < src.length ? src[i + 1] : src[i] + (src[i] - src[i - 1]);
      const s = (src[i] + (next - src[i]) * (p - i)) * SPF;
      const k = Math.floor(s);
      const t = s - k;
      const edge = Math.min(1, (n - start) / EDGE_FADE, (end - 1 - n) / EDGE_FADE);
      if (k < 0 || k + 1 >= a.length) continue;
      sfx[n] += (a[k] + (a[k + 1] - a[k]) * t) * edge;
      guns[n] += (g[k] + (g[k + 1] - g[k]) * t) * edge;
    }
  }

  // Подъём эффектов вокруг ударов: плавно, за 6 кадров на вход и на выход.
  const boost = new Float32Array(length).fill(1);
  for (const h of hits) {
    const spec = MIX.hitBoost[h.kind === "final" ? "boss" : h.kind];
    if (!spec) continue;
    const [pre, post, k] = spec;
    const a0 = (h.f - pre) * SPF;
    const a1 = h.f * SPF;
    const b0 = (h.f + post - 6) * SPF;
    const b1 = (h.f + post) * SPF;
    for (let n = Math.max(0, Math.floor(a0)); n < Math.min(length, b1); n++) {
      const w = n < a1 ? (n - a0) / (a1 - a0) : n > b0 ? 1 - (n - b0) / (b1 - b0) : 1;
      boost[n] = Math.max(boost[n], 1 + (k - 1) * Math.max(0, Math.min(1, w)));
    }
  }

  // ── Музыка: одна подложка ───────────────────────────────────────────────
  const track = async (name: keyof typeof MUSIC_VOLUME) =>
    decode(path.join(SOURCE.music, `${name}.mp3`), tmp);
  const bed = new Float32Array(length);
  const intro = await track("bossIntro");
  const boss = await track("boss");
  const beat0 = Math.round(GRID * SPF);
  const beatLen = (edit.BEAT / FPS) * RATE;
  // Обрыв музыки за мгновение до последнего удара: тишина перед взрывом бьёт сильнее.
  const stopAt = finalHit ? Math.round(finalHit.f * SPF) : length;
  const stopFade = Math.round(0.03 * RATE);
  const stopEnv = (n: number) => (n < stopAt - stopFade ? 1 : n >= stopAt ? 0 : (stopAt - n) / stopFade);
  place(bed, intro, beat0 - attack(intro), MUSIC_VOLUME.bossIntro * MUSIC_GAIN, stopEnv);
  place(
    bed,
    boss,
    Math.round(beat0 + INTRO_BEATS * beatLen) - attack(boss),
    MUSIC_VOLUME.boss * MUSIC_GAIN,
    stopEnv,
  );
  // Провал музыки под смерть промежуточного босса — взрыв выходит вперёд.
  const [duckDepth, duckFrames] = MIX.duckOnBoss;
  for (const h of hits.filter((x) => x.kind === "boss")) {
    const a = h.f * SPF;
    const hold = 6 * SPF;
    const b = (h.f + duckFrames) * SPF;
    for (let n = Math.max(0, Math.floor(a - 2 * SPF)); n < Math.min(length, b); n++) {
      const w = n < a ? (n - (a - 2 * SPF)) / (2 * SPF) : n < a + hold ? 1 : 1 - (n - a - hold) / (b - a - hold);
      bed[n] *= 1 - duckDepth * Math.max(0, Math.min(1, w));
    }
  }
  // Победный джингл — на баннер MISSION COMPLETE после последнего удара, за ним тема меню.
  const win = finalHit ? banners.find((b) => b.style === "success" && b.f >= finalHit.f) : undefined;
  let jingleAt: number | null = null;
  let menuAt: number | null = null;
  if (win) {
    const jingle = await track("jingleWin");
    const menu = await track("menu");
    jingleAt = Math.round(win.f * SPF);
    place(bed, jingle, jingleAt - attack(jingle), MUSIC_VOLUME.jingleWin * MUSIC_GAIN);
    menuAt = jingleAt + Math.round(MENU_AFTER_JINGLE * RATE);
    const fade = MENU_FADE_IN * RATE;
    place(bed, menu, menuAt - attack(menu), MUSIC_VOLUME.menu * MUSIC_GAIN, (n) =>
      Math.min(1, Math.max(0, (n - menuAt!) / fade)),
    );
  }

  // ── Саб-удары ───────────────────────────────────────────────────────────
  const subs = new Float32Array(length);
  const drop = subDrop();
  for (const h of hits) {
    const volume = MIX.subDrop[h.kind];
    if (volume) place(subs, drop, Math.round(h.f * SPF), volume);
  }

  // ── Сведение ────────────────────────────────────────────────────────────
  const mix = new Float32Array(length);
  const tail = MIX.tailFadeFrames * SPF;
  for (let n = 0; n < length; n++) {
    const fadeOut = Math.min(1, (length - n) / tail);
    mix[n] = (bed[n] + sfx[n] * boost[n] + guns[n] * MIX.guns + subs[n]) * fadeOut;
  }
  log(
    `levels (rms): music ${rms(bed).toFixed(3)} · sfx ${rms(sfx).toFixed(3)} · guns ${rms(guns).toFixed(3)} ` +
      `(game stems: music ≈0.065, sfx ≈0.10, guns ≈0.04–0.10)`,
  );

  // Громкость: лимитер (взрывы пиковее всего остального и душили бы общий
  // подъём), замер, одно усиление до −14 LUFS с true peak ниже −1.5 дБ. Если
  // пики не дают дотянуть — лимитер поджимается сильнее.
  const raw = path.join(tmp, "mix.f32");
  const early = new Float32Array(length);
  early.set(mix.subarray(RENDER_AUDIO_DELAY));
  await writeFile(raw, Buffer.from(early.buffer));
  const input = ["-hide_banner", "-y", "-f", "f32le", "-ar", String(RATE), "-ac", "1", "-i", raw];
  let limiter = "";
  let gain = 0;
  let reached = Number.NEGATIVE_INFINITY;
  for (const levelIn of [1, 1.4, 2, 2.8, 4]) {
    limiter = `alimiter=level_in=${levelIn}:limit=0.71:attack=2:release=80:level=false`;
    let stderr = "";
    await run(
      "ffmpeg",
      [...input, "-af", `${limiter},loudnorm=I=${MIX.lufs}:TP=${MIX.truePeak}:print_format=json`, "-f", "null", "-"],
      (s) => (stderr += s),
    );
    const json = JSON.parse(stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1));
    const loudness = Number(json.input_i);
    const truePeak = Number(json.input_tp);
    gain = Math.min(MIX.lufs - loudness, MIX.truePeak - truePeak);
    reached = loudness + gain;
    log(`loudness: limiter in ×${levelIn} → ${loudness} LUFS, peak ${truePeak} dBTP, gain ${gain.toFixed(2)} dB → ${reached.toFixed(1)} LUFS`);
    if (reached >= MIX.lufs - 0.3) break;
  }
  const audioFile = path.join(outDir, "audio.wav");
  await run("ffmpeg", [
    ...input, "-loglevel", "error", "-af", `${limiter},volume=${gain.toFixed(2)}dB`,
    "-ac", "2", "-ar", String(RATE), "-c:a", "pcm_s16le", audioFile,
  ]);

  // ── Манифест ────────────────────────────────────────────────────────────
  const rel = (f: string) => `clips/${comp}/${f}`;
  const manifest: GameCutManifest = {
    fps: FPS,
    durationInFrames: total,
    grid: GRID,
    beat: edit.BEAT,
    audio: rel("audio.wav"),
    pieces: pieces.map((p) => ({
      id: p.id,
      clip: p.clip,
      file: rel(`${p.clip}.mp4`),
      at: p.at,
      frames: p.frames,
      src: p.src.map((s) => Math.round(s)),
    })),
    hits,
    banners,
  };
  await writeFile(path.join(outDir, "edit.json"), JSON.stringify(manifest, null, 1));
  await rm(tmp, { recursive: true, force: true });

  // ── Отчёт ───────────────────────────────────────────────────────────────
  const sec = (f: number) => (f / FPS).toFixed(2);
  const onBeat = (f: number) => ((f - GRID) % edit.BEAT === 0 ? "♪" : " ");
  log(`\n${comp}: ${total} frames = ${sec(total)} s @ ${FPS} fps`);
  for (const p of pieces) {
    const speeds = p.src.slice(1).map((s, i) => s - p.src[i]);
    log(
      `  ${onBeat(p.at)} ${String(p.at).padStart(5)} (${sec(p.at)} s)  ${p.id.padEnd(10)} ${p.clip.padEnd(15)}` +
        ` src ${p.src[0].toFixed(1)}…${p.src[p.src.length - 1].toFixed(1)}` +
        ` speed ${Math.min(...speeds).toFixed(2)}…${Math.max(...speeds).toFixed(2)}`,
    );
  }
  for (const h of hits) log(`  ${onBeat(h.f)} ${String(h.f).padStart(5)} (${sec(h.f)} s)  hit ${h.kind} ${h.name}`);
  for (const b of banners) log(`    ${String(b.f).padStart(5)} (${sec(b.f)} s)  banner ${b.style} ${b.text}`);
  if (jingleAt !== null) log(`  music: boss theme cut ${sec(stopAt / SPF)} s, jingle ${(jingleAt / RATE).toFixed(2)} s, menu ${(menuAt! / RATE).toFixed(2)} s`);
  log(`  → ${path.relative(process.cwd(), outDir)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

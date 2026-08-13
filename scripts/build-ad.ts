/**
 * СБОРКА ТАЙМЛАЙНА РЕКЛАМНОГО РОЛИКА: озвучка встык + планы под фразы → ad.json.
 *
 *   npm run ad -- DiverBotAd
 *
 * Чем отличается от `npm run broll` (cut-broll.ts). Там планы вырезались из
 * фильма ffmpeg'ом, и скрипт был в первую очередь резаком. Здесь резать нечего:
 * половину планов рисует React (пузырь телеграма, карточка подписки, финальная
 * плашка), а остальные — готовые файлы, которые нужно не нарезать, а РАССТАВИТЬ
 * во времени. Поэтому скрипт занимается только арифметикой таймлайна, а склейку
 * речи берёт из общей `lib/narration.ts`.
 *
 * Что он решает:
 *
 *   1. **Речь идёт одной дорожкой.** Фразы синтезируются по отдельности (так
 *      TTS держит интонацию), но в ролике звучат непрерывно: тишина по краям
 *      срезается по пословным таймингам.
 *   2. **Картинка подчиняется голосу, а не секундомеру.** План привязан к фразе
 *      (`line`); планы одной фразы делят её длительность по весам. Переозвучили
 *      реплику — монтаж поехал вместе с ней, руками ничего не правится.
 *   3. **Ролик собирается даже без части ассетов.** Клипы из Gemini приезжают
 *      позже, чем пишется композиция. Отсутствующий файл не роняет сборку:
 *      план помечается `missing`, и сцена рисует нативный фон.
 *
 * Результат: public/vo/<Comp>/ad.json — озвучка, тайминги слов для караоке и
 * готовый список планов в кадрах. Композиция его только читает.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { probe } from "./lib/media";
import { buildNarration, type VoiceClip } from "./lib/narration";
import { FORMAT } from "../src/lib/format";
import type { Phrase, SceneKind, Shot } from "../src/compositions/DiverBotAd/script";

/** План с абсолютным местом на таймлайне — то, что читает композиция. */
export type AdShot = {
  id: string;
  line: string;
  scene: SceneKind;
  startFrame: number;
  durationInFrames: number;
  /** Путь внутри public/ либо null, если сцена рисуется React'ом. */
  media: string | null;
  /** Файла нет на диске — сцена обязана деградировать до нативного фона. */
  missing: boolean;
  from: number;
  speed: number;
  zoom: number;
  panX: number;
  panY: number;
  overlay: string | null;
  note: string | null;
};

export type AdWord = { w: string; s: number; e: number };

export type AdPhrase = {
  id: string;
  line: string;
  start: number;
  end: number;
  words: AdWord[];
};

export type AdManifest = {
  narrationFile: string;
  durationInFrames: number;
  phrases: AdPhrase[];
  shots: AdShot[];
};

/** Минимальная длина плана: короче — мельтешение, читается как ошибка монтажа. */
const MIN_SHOT = 0.6;

async function main() {
  const comp = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "DiverBotAd";

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

  // --- 1. Речь одной дорожкой ------------------------------------------------
  const narration = await buildNarration({ comp, script: SCRIPT, voClips });
  const phraseById = new Map(narration.phrases.map((p) => [p.id, p]));

  // --- 2. Планы на таймлайн --------------------------------------------------
  // Границы считаются в кадрах, а не сложением секунд: иначе ошибки округления
  // копятся и к концу ролика картинка уезжает от голоса.
  const order = SCRIPT.map((p) => p.id);

  /** Отрезок таймлайна, который занимает план: своя фраза плюс `span - 1` следующих. */
  const spanOf = (shot: Shot): { start: number; end: number } => {
    const first = phraseById.get(shot.line);
    if (!first) throw new Error(`План ссылается на неизвестную фразу «${shot.line}»`);
    const startIdx = order.indexOf(shot.line);
    const lastIdx = Math.min(order.length - 1, startIdx + (shot.span ?? 1) - 1);
    const last = phraseById.get(order[lastIdx])!;
    const tailGap = SCRIPT[lastIdx].gap ?? 0;
    // План покрывает и паузу после последней фразы: молчание тоже надо чем-то
    // заполнить, иначе на стыке мелькнёт пустой кадр.
    return { start: first.start, end: last.end + tailGap };
  };

  const shots: AdShot[] = [];
  let index = 0;

  for (const phraseId of order) {
    // Планы, ЧЬЯ фраза эта. Планы со span захватывают следующие фразы, и те
    // своих планов уже не имеют — иначе картинка наложилась бы сама на себя.
    const own = SHOTS.filter((s) => s.line === phraseId);
    if (own.length === 0) {
      const covered = SHOTS.some((s) => {
        const startIdx = order.indexOf(s.line);
        const lastIdx = startIdx + (s.span ?? 1) - 1;
        const idx = order.indexOf(phraseId);
        return idx > startIdx && idx <= lastIdx;
      });
      if (covered) continue;
      throw new Error(`Фраза ${phraseId}: нет ни одного плана в SHOTS`);
    }

    const totalWeight = own.reduce((sum, s) => sum + (s.weight ?? 1), 0);
    const { start, end } = spanOf(own[0]);
    let cursor = start;

    for (const shot of own) {
      const share = ((end - start) * (shot.weight ?? 1)) / totalWeight;
      const startFrame = Math.round(cursor * FORMAT.fps);
      cursor += share;
      const durationInFrames = Math.round(cursor * FORMAT.fps) - startFrame;

      const media = shot.media ?? null;
      const missing = media !== null && !existsSync(path.resolve("public", media));

      // «fit» растягивает исходник ровно на длину плана. Длину узнаём у файла:
      // держать её числом в сценарии значило бы править сценарий после каждой
      // пересъёмки захвата.
      let speed = typeof shot.speed === "number" ? shot.speed : 1;
      if (shot.speed === "fit") {
        if (missing || media === null) {
          speed = 1;
        } else {
          const info = await probe(path.resolve("public", media));
          const out = durationInFrames / FORMAT.fps;
          speed = out > 0 ? info.duration / out : 1;
        }
      }

      index += 1;
      shots.push({
        id: `s${String(index).padStart(2, "0")}_${shot.line}`,
        line: shot.line,
        scene: shot.scene,
        startFrame,
        durationInFrames,
        media,
        missing,
        from: shot.from ?? 0,
        speed,
        zoom: shot.zoom ?? 1,
        panX: shot.panX ?? 0,
        panY: shot.panY ?? 0,
        overlay: shot.overlay ?? null,
        note: shot.note ?? null,
      });
    }
  }

  const durationInFrames = Math.round(narration.totalSeconds * FORMAT.fps);

  const manifest: AdManifest = {
    narrationFile: narration.narrationFile,
    durationInFrames,
    phrases: narration.phrases,
    shots,
  };

  const outPath = path.resolve("public/vo", comp, "ad.json");
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(manifest, null, 2), "utf8");

  // --- 3. Отчёт, который читается глазами ------------------------------------
  console.log(
    `\nТаймлайн: ${(durationInFrames / FORMAT.fps).toFixed(1)} c ` +
      `(${durationInFrames} кадров), планов ${shots.length}\n  ${outPath}\n`,
  );
  for (const s of shots) {
    const secs = s.durationInFrames / FORMAT.fps;
    const at = (s.startFrame / FORMAT.fps).toFixed(1).padStart(5);
    const flag = s.missing ? "  ← нет файла, нативный фон" : "";
    console.log(
      `  ${at} c  ${s.scene.padEnd(9)} ${secs.toFixed(1).padStart(4)} c  ` +
        `${s.note ?? ""}${flag}`,
    );
  }

  const short = shots.filter((s) => s.durationInFrames / FORMAT.fps < MIN_SHOT);
  if (short.length > 0) {
    console.log(`\nСлишком короткие планы (< ${MIN_SHOT} c) — поправьте weight:`);
    for (const s of short) {
      console.log(`  ${s.id}: ${(s.durationInFrames / FORMAT.fps).toFixed(2)} c — ${s.note ?? ""}`);
    }
  }

  const missing = shots.filter((s) => s.missing);
  if (missing.length > 0) {
    console.log(`\nЖдут ассетов (${missing.length}) — ролик пока рисует на их месте нативный фон:`);
    for (const s of missing) console.log(`  ${s.media}`);
  }

  // Подсказка по захватам, растянутым под план. Замедление ниже единицы
  // означает, что часть кадров источника показывается дважды: на плавной
  // линии это видно как микроджаддер. Лечится не в рендере, а на съёмке —
  // снять ровно столько кадров, сколько занимает план, и скорость станет
  // единицей. Число печатается здесь, потому что известно только тут: длину
  // плана задаёт озвучка, а её меняет каждая переозвучка.
  const fitted = shots.filter((s) => !s.missing && Math.abs(s.speed - 1) > 0.01);
  if (fitted.length > 0) {
    console.log("\nЗахваты, растянутые под план (пересъёмка уберёт микроджаддер):");
    for (const s of fitted) {
      console.log(
        `  ${s.media}: скорость ×${s.speed.toFixed(3)} → снимите ${s.durationInFrames} кадров ` +
          `(--frames ${s.durationInFrames})`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

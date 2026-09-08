/**
 * ТРЕКИНГ ЛИЦ ПОД ВЕРТИКАЛЬНОЕ КАДРИРОВАНИЕ.
 *
 *   npm run track -- ValleyAuction
 *   npm run track -- ValleyAuction --only a05 --step 0.2
 *
 * Для каждого бита сценария:
 *   1) находит границы планов внутри куска (детектор сцен ffmpeg);
 *   2) прогоняет YuNet по кадрам (scripts/lib/face_track.py);
 *   3) в каждом плане выбирает «ведомое» лицо и строит траекторию окна;
 *   4) сглаживает её и ставит переброс ровно на склейке плана.
 * Результат — data/track/<Comp>.json, его читает `npm run cut`.
 *
 * Почему это скрипт, а не ручная работа. В ситкоме план живёт 1–2 секунды,
 * камера ездит, и голова говорящего гуляет по кадру на десятки процентов
 * ширины. Ручная разметка «на глаз» по контактным листам промахивалась
 * систематически: ошибка в 5 % ширины уже срезает лицо в вертикали.
 *
 * Отдельно скрипт предупреждает, если план меняется у самого края бита: такой
 * бит на склейке показывает чужой кадр («лишние кадры»), и границу надо
 * подвинуть в сценарии.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { run } from "./lib/media";
import { findFilm } from "./lib/films";
import type { Beat } from "./cut-clips";

const MODEL = "data/models/face_detection_yunet.onnx";
/** Ближе этого к краю бита смена плана считается «лишними кадрами». */
const EDGE_GUARD = 0.5;
/** Насколько окно может сдвинуться за секунду — против дёрганья на шуме. */
const MAX_SPEED = 0.28;

export type Track = {
  /** Точки траектории: t — секунды от начала бита, x — доля ширины кадра. */
  pan: { t: number; x: number }[];
  /** Границы планов внутри бита (секунды от начала). */
  scenes: number[];
};

type Face = { x: number; y: number; w: number; frontal: number; score: number };
type Sample = { t: number; faces: Face[] };

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flag = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : null;
  };
  return {
    comp: positional[0] ?? "",
    only: flag("only")?.split(",") ?? null,
    step: Number(flag("step") ?? 0.25),
  };
}

/**
 * ffmpeg печатает showinfo в stderr, поэтому границы собираем отдельным
 * прогоном с перехватом потока ошибок.
 */
async function scenesOf(film: string, start: number, duration: number): Promise<number[]> {
  let stderr = "";
  await run(
    "ffmpeg",
    [
      "-hide_banner", "-nostats",
      "-ss", String(start),
      "-t", String(duration),
      "-i", film,
      "-vf", "select='gt(scene,0.25)',showinfo",
      "-f", "null", "-",
    ],
    (chunk: string) => {
      stderr += chunk;
    },
  );
  const times: number[] = [];
  for (const m of stderr.matchAll(/pts_time:([0-9.]+)/g)) {
    const t = Number(m[1]);
    if (t > 0.05 && t < duration - 0.05) times.push(Number(t.toFixed(2)));
  }
  return times;
}

/**
 * Кого ведём в этом плане.
 *
 * Выбор делается СРАЗУ ПО ВСЕМУ ПЛАНУ, а не жадно кадр за кадром. Лица
 * группируются в «дорожки» по близости положения, каждая дорожка получает вес,
 * и окно всю сцену держит победителя. Жадный выбор давал именно ту ошибку, ради
 * которой это переписано: в кабинете врача окно начинало на Ричарде (он в
 * профиль и ближе к камере), а на третьей секунде уезжало к врачу через пустую
 * стену — хотя говорил врач с первого слова.
 *
 * Вес дорожки — сумма по кадрам: разворот лица к камере (`frontal`) весит
 * больше размера, потому что в «восьмёрке» к нам повёрнут говорящий, а
 * собеседник стоит в профиль или затылком.
 */
function trackShot(samples: Sample[], follow: number | null): { t: number; x: number }[] {
  type Lane = { xs: number[]; weight: number; last: number };
  const lanes: Lane[] = [];
  const GAP = 0.12;

  for (const sample of samples) {
    for (const face of sample.faces) {
      const weight =
        (0.25 + face.frontal) * face.score +
        face.w * 0.6 -
        (follow === null ? 0 : Math.abs(face.x - follow) * 1.2);
      const lane = lanes.find((l) => Math.abs(l.last - face.x) < GAP);
      if (lane) {
        lane.xs.push(face.x);
        lane.weight += weight;
        lane.last = face.x;
      } else {
        lanes.push({ xs: [face.x], weight, last: face.x });
      }
    }
  }
  if (lanes.length === 0) return [];
  lanes.sort((a, b) => b.weight - a.weight);
  const target = lanes[0];
  const home = target.xs.reduce((sum, x) => sum + x, 0) / target.xs.length;

  // Ведём выбранного героя: в каждом кадре берём его лицо, а если детектор его
  // потерял — держим последнее положение, но не убегаем к соседу.
  const points: { t: number; x: number }[] = [];
  let previous = home;
  for (const sample of samples) {
    const own = sample.faces
      .filter((f) => Math.abs(f.x - previous) < GAP * 1.6)
      .sort((a, b) => b.frontal * b.score - a.frontal * a.score)[0];
    if (own) previous = own.x;
    points.push({ t: sample.t, x: previous });
  }
  return points;
}

/** Скользящее среднее + ограничение скорости: окно должно ехать, а не дёргаться. */
function smooth(points: { t: number; x: number }[]): { t: number; x: number }[] {
  if (points.length === 0) return [];
  const window = 3;
  const averaged = points.map((p, i) => {
    const from = Math.max(0, i - window);
    const to = Math.min(points.length - 1, i + window);
    let sum = 0;
    for (let j = from; j <= to; j++) sum += points[j].x;
    return { t: p.t, x: sum / (to - from + 1) };
  });
  const limited: { t: number; x: number }[] = [averaged[0]];
  for (let i = 1; i < averaged.length; i++) {
    const previous = limited[i - 1];
    const dt = Math.max(0.001, averaged[i].t - previous.t);
    const maxShift = MAX_SPEED * dt;
    const delta = averaged[i].x - previous.x;
    const clamped = Math.abs(delta) <= maxShift ? delta : Math.sign(delta) * maxShift;
    limited.push({ t: averaged[i].t, x: Number((previous.x + clamped).toFixed(4)) });
  }
  return limited;
}

async function main() {
  const { comp, only, step } = parseArgs(process.argv.slice(2));
  if (!comp) {
    console.error("Укажите композицию: npm run track -- ValleyAuction");
    process.exit(1);
  }
  if (!existsSync(MODEL)) {
    console.error(
      `Нет модели детектора: ${MODEL}\n` +
        "Скачайте: curl -sL -o data/models/face_detection_yunet.onnx " +
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/" +
        "face_detection_yunet_2023mar.onnx",
    );
    process.exit(1);
  }

  const scriptPath = path.resolve("src/compositions", comp, "script.ts");
  const { SCRIPT } = (await import(pathToFileURL(scriptPath).href)) as { SCRIPT: Beat[] };
  const beats = only ? SCRIPT.filter((b) => only.includes(b.id)) : SCRIPT;

  const tracks: Record<string, Track> = {};
  const warnings: string[] = [];

  for (const beat of beats) {
    const film = findFilm(beat.film);
    const duration = beat.end - beat.start;
    const scenes = await scenesOf(film.path, beat.start, duration);

    const raw = await run("python", [
      "scripts/lib/face_track.py",
      film.path,
      String(beat.start),
      String(beat.end),
      String(step),
      MODEL,
    ]);
    const { samples } = JSON.parse(raw) as { samples: Sample[] };

    // Планы режем по границам сцен и ведём в каждом своё лицо: между планами
    // персонаж меняется, и общая траектория «через склейку» бессмысленна.
    const bounds = [0, ...scenes, duration];
    const pan: { t: number; x: number }[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const from = bounds[i];
      const to = bounds[i + 1];
      const shot = samples.filter((s) => s.t >= from - 0.001 && s.t < to);
      // `follow` в сценарии — ручная подсказка «вести того, кто у этой доли
      // ширины»: нужна там, где автоматика всё же путает персонажей.
      const points = smooth(trackShot(shot, beat.follow ?? null));
      if (points.length === 0) {
        pan.push({ t: from, x: 0.5 }, { t: to - 0.01, x: 0.5 });
        continue;
      }
      // Границы плана держим ровно: у начала и конца повторяем крайние точки,
      // чтобы переброс пришёлся точно на склейку, а не размазался по ней.
      pan.push({ t: Number(from.toFixed(2)), x: points[0].x });
      for (const p of points) {
        if (p.t > from + 0.01 && p.t < to - 0.01) {
          pan.push({ t: Number(p.t.toFixed(2)), x: p.x });
        }
      }
      pan.push({ t: Number((to - 0.01).toFixed(2)), x: points[points.length - 1].x });
    }

    tracks[beat.id] = { pan, scenes };

    const nearStart = scenes.filter((t) => t < EDGE_GUARD);
    const nearEnd = scenes.filter((t) => t > duration - EDGE_GUARD);
    if (nearStart.length > 0) {
      warnings.push(
        `${beat.id}: смена плана через ${nearStart[0].toFixed(2)} c после начала — ` +
          `бит открывается чужим кадром, сдвиньте start до ${(beat.start + nearStart[0]).toFixed(2)}`,
      );
    }
    if (nearEnd.length > 0) {
      warnings.push(
        `${beat.id}: смена плана за ${(duration - nearEnd[nearEnd.length - 1]).toFixed(2)} c до конца — ` +
          `бит заканчивается чужим кадром, сдвиньте end до ${(beat.start + nearEnd[nearEnd.length - 1]).toFixed(2)}`,
      );
    }
    console.log(
      `${beat.id}  ${duration.toFixed(1)} c, планов ${scenes.length + 1}, точек ${pan.length}`,
    );
  }

  const outDir = path.resolve("data/track");
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${comp}.json`);
  // При --only пересчитываются отдельные биты, но файл обязан описывать ролик
  // целиком: иначе следующая полная нарезка не найдёт траекторий и поставит
  // окно по центру у всех прочих битов — говорящие уедут за край кадра.
  // (Та же грабля, что когда-то была у `npm run cut --only` с clips.json.)
  const previous: Record<string, Track> =
    only && existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : {};
  const merged = { ...previous, ...tracks };
  await writeFile(file, JSON.stringify(merged, null, 2), "utf8");
  console.log(`\nТреки: ${file}`);

  if (warnings.length > 0) {
    console.log("\nСклейки у краёв битов (иначе на монтаже проскочит чужой кадр):");
    for (const w of warnings) console.log(`  ${w}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

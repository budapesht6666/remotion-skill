/**
 * ПРОВЕРКА СТЫКОВ готового ролика: не проскакивает ли на склейке чужой кадр.
 *
 *   npm run joins -- ValleyAsshole
 *   npm run joins -- ValleyAsshole --video out/ValleyAsshole/valley-asshole-v2.mp4
 *
 * Зачем отдельно от `npm run track`. Трекер предупреждает о сменах плана у
 * краёв БИТА, то есть по таймкодам исходника и ДО нарезки. Этого мало: границы
 * потом двигают, клипы перерезают, `--only` обновляет часть манифеста — и
 * лишний кадр появляется там, где предупреждения не было. Здесь проверяется
 * то, что реально увидит зритель: сами нарезанные клипы и склейки между ними.
 *
 * Что делает:
 *   • меряет в каждом клипе, далеко ли ближайшая смена плана от его краёв. Если
 *     ближе MIN_SHOT — на монтаже мелькнёт обрывок чужого плана, и об этом
 *     печатается предупреждение с готовым решением;
 *   • собирает контактный лист: по нескольку кадров до и после каждого стыка,
 *     строка листа = один стык. Агент читает его глазами — числа не отличают
 *     осмысленный кадр реакции от мусора, а картинка отличает.
 *
 * Порог MIN_SHOT намеренно не «ноль кадров». Короткий чужой обрывок читается
 * как брак склейки, но план длиной от трети секунды зритель воспринимает как
 * нормальный монтажный кадр (реакция, общий план). Поэтому бит, у края которого
 * склейка, чинится в две стороны: границу либо подтягивают ДО склейки, либо
 * наоборот отпускают вперёд, чтобы плану хватило времени прочитаться.
 */
import { mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { run, probe } from "./lib/media";
import { findFilm } from "./lib/films";

/** Короче этого чужой план на краю бита читается как брак склейки. */
/**
 * Сколько кадров хвоста за монтажом считается концовкой, а не расхождением
 * рендера с манифестом: `subscribeOutroFrames` даёт 60 кадров на 23.976 fps,
 * берём с запасом на более высокий fps.
 */
const MAX_OUTRO_FRAMES = 120;

const MIN_SHOT = 0.35;
/**
 * Порог детектора, которым ищем склейки в ИСХОДНИКЕ. Ниже рабочего (0.25),
 * которым пользуются трекер и проверка обрывков: между двумя планами одной
 * сцены — тот же герой, тот же фон, та же экспозиция — разница кадров мала, и
 * на 0.25 такая склейка не находится вовсе. Для трекера это терпимо (он ведёт
 * лицо), а для кадрирования нет: окно едет сквозь ненайденную склейку, и
 * первый кадр нового плана оказывается кадрирован «между» двумя планами.
 * Ложные срабатывания на резком движении здесь не страшны — они попадают в
 * лист, который всё равно читают глазами. Подряд идущие срабатывания (панорама,
 * взмах руки перед камерой) схлопываются в одно: см. `sourceScenes`.
 */
const SCENE_LOW = 0.05;
/** Переброс окна: больше этого считается ступенькой на склейке. */
const PAN_STEP = 0.008;
/** Меньше этого окно считается стоящим на месте. */
const PAN_STILL = 0.004;
/** Сколько кадров показывать по каждую сторону стыка. */
const AROUND = 4;

type Clip = {
  id: string;
  file: string;
  durationInFrames: number;
};

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flag = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : null;
  };
  return {
    comp: positional[0] ?? "",
    video: flag("video"),
    around: Number(flag("around") ?? AROUND),
  };
}

/**
 * Границы планов внутри файла. ffmpeg печатает showinfo в stderr, поэтому
 * прогон отдельный, с перехватом потока ошибок (тот же приём, что в
 * scripts/track-faces.ts).
 */
async function scenesOf(file: string): Promise<number[]> {
  let stderr = "";
  await run(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", file, "-vf", "select='gt(scene,0.25)',showinfo", "-f", "null", "-"],
    (chunk: string) => {
      stderr += chunk;
    },
  );
  const times: number[] = [];
  for (const m of stderr.matchAll(/pts_time:([0-9.]+)/g)) {
    times.push(Number(Number(m[1]).toFixed(2)));
  }
  return times;
}

type PanPoint = { t: number; x: number };

/** Склейки внутри отрезка исходника; время — от начала отрезка. */
async function sourceScenes(file: string, start: number, duration: number): Promise<number[]> {
  let stderr = "";
  await run(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-ss", String(start), "-t", String(duration),
     "-i", file, "-an", "-vf", `select='gt(scene,${SCENE_LOW})',showinfo`, "-f", "null", "-"],
    (chunk: string) => {
      stderr += chunk;
    },
  );
  const times: number[] = [];
  for (const m of stderr.matchAll(/pts_time:([0-9.]+)/g)) {
    const t = Number(m[1]);
    if (t > 0.05 && t < duration - 0.02) times.push(Number(t.toFixed(3)));
  }
  // На низком пороге быстрое движение даёт очередь срабатываний подряд. Склейка
  // одна, поэтому очередь схлопывается в первое событие.
  const merged: number[] = [];
  for (const t of times.sort((a, b) => a - b)) {
    if (merged.length === 0 || t - merged[merged.length - 1] > 0.2) merged.push(t);
  }
  return merged;
}

/**
 * Положение окна в момент `t` — та же арифметика, что у `panExpression`
 * в scripts/cut-clips.ts: пара точек ближе полутора кадров считается
 * мгновенным перебросом, всё остальное интерполируется линейно.
 */
function xAt(points: PanPoint[], t: number, fps: number): number {
  if (points.length === 0) return 0.5;
  if (points.length === 1) return points[0].x;
  const frame = 1 / fps;
  if (t <= points[0].t) return points[0].x;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (t >= a.t && t < b.t) {
      if (b.t - a.t <= 1.5 * frame) return t < b.t - 0.5 * frame ? a.x : b.x;
      return a.x + ((b.x - a.x) * (t - a.t)) / (b.t - a.t);
    }
  }
  return points[points.length - 1].x;
}

/** Модель детектора лиц — та же, что у трекера. */
const FACE_MODEL = "data/models/face_detection_yunet.onnx";

/**
 * Есть ли в отрезке клипа хотя бы одно лицо. Нужно для краёв бита: кадр без
 * человека на стыке читается как мусор («видео не загрузилось», «мелькнуло
 * что-то»), и глазами это ловится только если специально смотреть именно
 * первый и последний кадр каждого бита.
 */
async function faceAt(
  file: string,
  from: number,
  to: number,
): Promise<{ found: boolean; nearest: number }> {
  if (!existsSync(path.resolve(FACE_MODEL))) return { found: true, nearest: 0.5 };
  try {
    const raw = await run("python", [
      "scripts/lib/face_track.py", file, String(from), String(to), "0.04", FACE_MODEL,
    ]);
    const { samples } = JSON.parse(raw) as { samples: { faces: { x: number }[] }[] };
    const xs = samples.flatMap((s) => s.faces.map((f) => f.x));
    if (xs.length === 0) return { found: false, nearest: 0.5 };
    // Насколько лицо близко к краю кадра: 0 — впритык, 0.5 — по центру.
    const nearest = Math.max(...xs.map((x) => Math.min(x, 1 - x)));
    return { found: true, nearest };
  } catch {
    return { found: true, nearest: 0.5 };
  }
}

/** Ближе этой доли ширины к краю герой читается как обрезанный. */
const FACE_EDGE = 0.14;

/** Самый свежий рендер ролика, если файл не назван явно. */
async function latestRender(comp: string): Promise<string | null> {
  const dir = path.resolve("out", comp);
  if (!existsSync(dir)) return null;
  const files = (await readdir(dir)).filter((f) => f.endsWith(".mp4"));
  if (files.length === 0) return null;
  const withTime = await Promise.all(
    files.map(async (f) => ({ f, t: (await stat(path.join(dir, f))).mtimeMs })),
  );
  withTime.sort((a, b) => b.t - a.t);
  return path.join(dir, withTime[0].f);
}

async function main() {
  const { comp, video, around } = parseArgs(process.argv.slice(2));
  if (!comp) {
    console.error("Укажите композицию: npm run joins -- ValleyAsshole");
    process.exit(1);
  }
  const manifest = path.resolve("public/clips", comp, "clips.json");
  if (!existsSync(manifest)) {
    console.error(`Нет манифеста: ${manifest} (сначала npm run cut -- ${comp})`);
    process.exit(1);
  }
  const clips = JSON.parse(await readFile(manifest, "utf8")) as Clip[];
  const file = video ?? (await latestRender(comp));
  if (!file || !existsSync(file)) {
    console.error(`Нет рендера в out/${comp}/ — укажите файл через --video`);
    process.exit(1);
  }

  const meta = await probe(file);
  const rate = meta.video?.r_frame_rate ?? "24000/1001";
  const [num, den] = rate.split("/").map(Number);
  const fps = den ? num / den : num;

  console.log(`Стыки ${comp}: ${path.relative(process.cwd(), file)} (${fps.toFixed(3)} fps)\n`);

  // Хвосты и головы планов внутри клипов: именно они мелькают на склейке.
  const problems: string[] = [];
  /** Склейки внутри каждого клипа — по ним собираются листы «кадр в кадр». */
  const inside = new Map<string, number[]>();
  for (const clip of clips) {
    const clipFile = path.resolve("public", clip.file);
    if (!existsSync(clipFile)) continue;
    const duration = clip.durationInFrames / fps;
    const scenes = await scenesOf(clipFile);
    const head = scenes.filter((t) => t > 0.02).sort((a, b) => a - b)[0];
    const tail = scenes.filter((t) => t < duration - 0.02).sort((a, b) => b - a)[0];
    const notes: string[] = [];
    if (head !== undefined && head < MIN_SHOT) {
      notes.push(
        `открывается чужим планом ${head.toFixed(2)} c (${Math.round(head * fps)} кадр.) — ` +
          `сдвиньте start вперёд на ${head.toFixed(2)} c либо назад, чтобы плану хватило времени`,
      );
    }
    if (tail !== undefined && duration - tail < MIN_SHOT) {
      const rest = duration - tail;
      notes.push(
        `заканчивается чужим планом ${rest.toFixed(2)} c (${Math.round(rest * fps)} кадр.) — ` +
          `сдвиньте end назад на ${rest.toFixed(2)} c либо вперёд, чтобы плану хватило времени`,
      );
    }
    inside.set(clip.id, scenes);
    const mark = notes.length > 0 ? "!" : " ";
    console.log(`${mark} ${clip.id}  ${duration.toFixed(2)} c, планов ${scenes.length + 1}`);
    for (const n of notes) {
      console.log(`    ${n}`);
      problems.push(`${clip.id}: ${n}`);
    }
  }

  // Контактный лист: строка = один стык, слева кадры конца бита, справа начала
  // следующего. Числа выше говорят, ЧТО произошло; лист говорит, ВИДНО ли это.
  const bounds: { at: number; from: string; to: string }[] = [];
  let cursor = 0;
  for (let i = 0; i < clips.length - 1; i++) {
    cursor += clips[i].durationInFrames;
    bounds.push({ at: cursor, from: clips[i].id, to: clips[i + 1].id });
  }

  // Лист снимается из готового ролика, а границы считаются по манифесту: если
  // клипы перерезали после рендера, номера кадров разъедутся и лист покажет не
  // те стыки. Молча этого делать нельзя — проверка стыков стала бы враньём.
  const expected = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
  const actual = Number(
    (
      await run("ffprobe", [
        "-v", "error",
        "-select_streams", "v:0",
        "-count_frames",
        "-show_entries", "stream=nb_read_frames",
        "-of", "default=nokey=1:noprint_wrappers=1",
        file,
      ])
    ).trim(),
  );
  // Ролик может заканчиваться концовкой с кнопкой Subscribe: она живёт хвостом
  // ЗА монтажом (`outroFrames`), поэтому кадров в файле больше, чем в манифесте.
  // Стыки все до неё, и такой рендер устаревшим не считается — а вот файл
  // короче манифеста означает, что клипы перерезали после рендера.
  const tail = actual - expected;
  if (tail < 0 || tail > MAX_OUTRO_FRAMES) {
    console.log(
      `
Лист не собран: рендер устарел (в манифесте ${expected} кадр., в файле ${actual}). ` +
        `Числа выше посчитаны по клипам и верны — пересоберите ролик и повторите.`,
    );
    return;
  }
  if (tail > 0) {
    console.log(`
В файле на ${tail} кадр. больше — это концовка за монтажом, стыки все до неё.`);
  }

  const outDir = path.resolve("out", comp, "joins");
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const selected: number[] = [];
  for (const b of bounds) {
    for (let d = -around; d < around; d++) selected.push(b.at + d);
  }
  const select = selected.map((n) => `eq(n\\,${n})`).join("+");
  const sheet = path.join(outDir, "joins.png");
  await run("ffmpeg", [
    "-v", "error", "-y",
    "-i", file,
    "-vf", `select='${select}',scale=200:-1,tile=${around * 2}x${bounds.length}`,
    "-frames:v", "1", "-update", "1",
    sheet,
  ]);

  console.log("\nЛист стыков (строка = стык, слева конец бита, справа начало следующего):");
  bounds.forEach((b, i) => {
    console.log(`  строка ${i + 1}: ${b.from} → ${b.to}, кадр ${b.at} (${(b.at / fps).toFixed(2)} c)`);
  });
  console.log(`  ${sheet}`);

  // Склейки ВНУТРИ битов — это монтаж самого сериала, и брак там того же рода:
  // окно вертикали перебрасывается на смене плана, и первый кадр нового плана
  // может оказаться кадрирован по-старому. Стыки битов такой кадр не покажут,
  // поэтому на каждый клип со склейками собирается свой лист: слева последний
  // кадр старого плана, дальше три первых кадра нового. Все три должны быть
  // кадрированы одинаково — если первый выбивается, ищите баг перебросa окна,
  // а не монтаж.
  let sheets = 0;
  for (const clip of clips) {
    const scenes = inside.get(clip.id) ?? [];
    if (scenes.length === 0) continue;
    const frames: number[] = [];
    for (const t of scenes) {
      const n = Math.round(t * fps);
      for (const d of [-1, 0, 1, 2]) frames.push(Math.max(0, n + d));
    }
    const sel = frames.map((n) => `eq(n\,${n})`).join("+");
    const out = path.join(outDir, `${clip.id}.png`);
    await run("ffmpeg", [
      "-v", "error", "-y",
      "-i", path.resolve("public", clip.file),
      "-vf", `select='${sel}',scale=200:-1,tile=4x${scenes.length}`,
      "-frames:v", "1", "-update", "1",
      out,
    ]);
    sheets++;
  }
  if (sheets > 0) {
    console.log(
      `
Листы склеек внутри битов в ${outDir} — по файлу на бит (${sheets} шт., строка = склейка, ` +
        `слева последний кадр старого плана, дальше три первых кадра нового — кадрирование должно совпадать).`,
    );
  }


  // --- Края битов: читается ли кадр на стыке -------------------------------
  // Стык склеивает последний кадр одного бита с первым кадром другого, и оба
  // обязаны читаться сами по себе. Хуже всего — кадр, из которого герой уже
  // вышел (спина у края) или ещё не вошёл (пустой коридор): в ленте это
  // выглядит как мусорный кадр на склейке. Детектор лиц ловит такие края
  // автоматически; сцены, снятые со спины, он тоже пометит — их проверяют
  // глазами по листу стыков.
  const edgeProblems: string[] = [];
  {
    let offset = 0;
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const clipFile = path.resolve("public", clip.file);
      const clipStart = offset;
      offset += clip.durationInFrames;
      if (!existsSync(clipFile)) continue;
      const duration = clip.durationInFrames / fps;
      // Полтора кадра: проверяем ИМЕННО первый и последний кадр бита — именно
      // они склеиваются с соседним битом.
      const window = 1.5 / fps;
      const head = await faceAt(clipFile, 0, window);
      const tail = await faceAt(clipFile, Math.max(duration - window, 0), duration);
      const at = (frames: number) => (frames / fps).toFixed(2);
      if (!head.found) {
        edgeProblems.push(
          "  ! " + clip.id + ": в первом кадре бита (" + at(clipStart) +
            " c ролика) нет лица — сдвиньте start вперёд или проверьте кадр глазами.",
        );
      } else if (head.nearest < FACE_EDGE) {
        edgeProblems.push(
          "  ! " + clip.id + ": в первом кадре бита (" + at(clipStart) +
            " c ролика) лицо прижато к краю (" + head.nearest.toFixed(2) + " ширины) — герой обрезан.",
        );
      }
      if (!tail.found) {
        edgeProblems.push(
          "  ! " + clip.id + ": в последнем кадре бита (" + at(clipStart + clip.durationInFrames) +
            " c ролика) нет лица — подтяните end назад или проверьте кадр глазами.",
        );
      } else if (tail.nearest < FACE_EDGE) {
        edgeProblems.push(
          "  ! " + clip.id + ": в последнем кадре бита (" + at(clipStart + clip.durationInFrames) +
            " c ролика) лицо прижато к краю (" + tail.nearest.toFixed(2) + " ширины) — герой обрезан.",
        );
      }
    }
  }
  if (edgeProblems.length > 0) {
    console.log("\nКрая битов без лица в кадре:");
    for (const line of edgeProblems) console.log(line);
  }


  // --- Кадрирование на склейках оригинала ----------------------------------
  // Самая дорогая ошибка рецепта: окно едет сквозь склейку, которую детектор с
  // рабочим порогом не увидел, и один кадр нового плана оказывается кадрирован
  // по-старому. На монтаже это читается как «мусорный кадр», а в контактные
  // листы он не попадает — у них шаг в десятки кадров.
  const panProblems: string[] = [];
  const panSheets: { id: string; clipFile: string; frame: number }[] = [];
  const scriptPath = path.resolve("src/compositions", comp, "script.ts");
  if (existsSync(scriptPath)) {
    const { SCRIPT } = (await import(pathToFileURL(scriptPath).href)) as {
      SCRIPT: { id: string; film: string; start: number; end: number; pan?: PanPoint[] }[];
    };
    const trackPath = path.resolve("data/track", comp + ".json");
    const tracks: Record<string, { pan: PanPoint[] }> = existsSync(trackPath)
      ? JSON.parse(await readFile(trackPath, "utf8"))
      : {};
    let offset = 0;
    for (const clip of clips) {
      const beat = SCRIPT.find((b) => b.id === clip.id);
      const clipFile = path.resolve("public", clip.file);
      const clipStart = offset;
      offset += clip.durationInFrames;
      if (!beat || !existsSync(clipFile)) continue;
      const points = beat.pan ?? tracks[beat.id]?.pan ?? [];
      if (points.length < 2) continue;
      const film = findFilm(beat.film);
      const cuts = await sourceScenes(film.path, beat.start, beat.end - beat.start);
      for (const cut of cuts) {
        const kNew = Math.round(cut * fps);
        if (kNew < 2 || kNew >= clip.durationInFrames - 1) continue;
        const mid = (k: number) => (k + 0.5) / fps;
        const xPrev = xAt(points, mid(kNew - 2), fps);
        const xOld = xAt(points, mid(kNew - 1), fps);
        const xNew = xAt(points, mid(kNew), fps);
        const xNext = xAt(points, mid(kNew + 1), fps);
        const step = Math.abs(xNew - xOld);
        if (step >= PAN_STEP) continue;
        let why = "";
        if (Math.abs(xOld - xPrev) > PAN_STEP) why = "переброс окна стоит на кадр раньше склейки";
        else if (Math.abs(xNext - xNew) > PAN_STEP) why = "переброс окна стоит на кадр позже склейки";
        else if (Math.abs(xOld - xPrev) > PAN_STILL || Math.abs(xNext - xNew) > PAN_STILL)
          why = "окно едет сквозь склейку — переброса нет";
        if (!why) continue;
        panProblems.push(
          "  ! " + beat.id + ": склейка на " + (beat.start + cut).toFixed(2) +
            " c исходника (" + ((clipStart + kNew) / fps).toFixed(2) + " c ролика) — " + why + ".",
        );
        panSheets.push({ id: beat.id, clipFile, frame: kNew });
      }
    }
  }
  if (panProblems.length > 0) {
    console.log("\nКадрирование на склейках оригинала:");
    for (const line of panProblems) console.log(line);
    const sheetDir = path.resolve(outDir, "pan-cuts");
    await mkdir(sheetDir, { recursive: true });
    for (const item of panSheets) {
      await run("ffmpeg", [
        "-y", "-hide_banner", "-loglevel", "error",
        "-i", item.clipFile,
        "-vf", "select='between(n," + Math.max(item.frame - 2, 0) + "," + (item.frame + 2) + ")',scale=200:-1,tile=5x1",
        "-frames:v", "1", "-vsync", "0",
        path.join(sheetDir, item.id + "-" + item.frame + ".png"),
      ]);
    }
    console.log(
      "  Листы: " + path.relative(process.cwd(), sheetDir) +
        " — по пять кадров вокруг склейки (два старого плана, три нового): кадрирование обязано меняться ровно между вторым и третьим.",
    );
  } else if (existsSync(scriptPath)) {
    console.log("\nВсе склейки оригинала отработаны перебросом окна.");
  }

  if (problems.length > 0) {
    console.log(`\nПроблемных стыков: ${problems.length} — смотрите лист и правьте границы в script.ts`);
  } else {
    console.log("\nОбрывков плана короче " + MIN_SHOT + " c на краях битов нет.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

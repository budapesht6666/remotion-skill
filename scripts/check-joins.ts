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
import { run, probe } from "./lib/media";

/** Короче этого чужой план на краю бита читается как брак склейки. */
const MIN_SHOT = 0.35;
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
  if (actual !== expected) {
    console.log(
      `
Лист не собран: рендер устарел (в манифесте ${expected} кадр., в файле ${actual}). ` +
        `Числа выше посчитаны по клипам и верны — пересоберите ролик и повторите.`,
    );
    return;
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

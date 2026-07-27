/**
 * КОНТАКТНЫЙ ЛИСТ: десятки кадров фильма в одну картинку с таймкодом на каждом.
 *
 *   npm run sheet -- bloodsport --every 20            # обзор всего фильма
 *   npm run sheet -- bloodsport --from 41:00 --to 44:00 --every 1
 *   npm run sheet -- bloodsport --from 41:00 --to 44:00 --scenes   # только смены планов
 *
 * Флаги:
 *   --from, --to   границы (MM:SS или секунды), по умолчанию весь фильм
 *   --every        шаг в секундах (по умолчанию 20)
 *   --scenes       вместо равномерного шага брать кадры на сменах планов
 *   --threshold    порог детектора сцен (по умолчанию 0.3)
 *   --grid         сетка листа, по умолчанию 5x6
 *   --out          каталог, по умолчанию out/sheets/<slug>
 *
 * Зачем: агент читает такой лист глазами и выбирает точный кадр под бит сценария.
 * Таймкод выжигается прямо в миниатюру, поэтому по листу можно сразу резать.
 */
import { mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { probe, run, parseTc } from "./lib/media";
import { findFilm } from "./lib/films";

const FONT = "C\\:/Windows/Fonts/arialbd.ttf";

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

async function main() {
  const { film: filmArg, flags } = parseArgs(process.argv.slice(2));
  if (!filmArg) {
    console.error("Укажите фильм: npm run sheet -- bloodsport --every 20");
    process.exit(1);
  }
  const film = findFilm(filmArg);
  if (!existsSync(film.path)) {
    console.error(`Файл не найден: ${film.path}`);
    process.exit(1);
  }

  const info = await probe(film.path);
  const from = flags.from ? parseTc(String(flags.from)) : 0;
  const to = flags.to ? parseTc(String(flags.to)) : info.duration;
  const every = Number(flags.every ?? 20);
  const grid = String(flags.grid ?? "5x6");
  const [cols, rows] = grid.split("x").map(Number);
  const threshold = Number(flags.threshold ?? 0.3);
  const scenes = Boolean(flags.scenes);
  // Раскладка out/: у каждого проекта своя папка, служебное лежит внутри неё.
  const outDir = path.resolve(
    String(flags.out ?? path.join("out", film.slug, "sheets")),
    `${Math.round(from)}-${Math.round(to)}${scenes ? "-scenes" : ""}`,
  );
  await mkdir(outDir, { recursive: true });

  // Отбор кадров: либо равномерно, либо по сменам планов (для экшн-сцен точнее).
  const select = scenes
    ? `select='gt(scene\\,${threshold})'`
    : `fps=1/${every}`;

  // Таймкод исходника: -ss обнуляет pts, поэтому возвращаем смещение третьим
  // аргументом %{pts:hms:offset}. Плашка снизу слева, чтобы не спорить с кадром.
  const drawtext =
    `drawtext=fontfile='${FONT}':text='%{pts\\:hms\\:${from}}':` +
    `x=6:y=h-th-6:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.65:boxborderw=4`;

  const filter = `${select},scale=360:-2,${drawtext},tile=${cols}x${rows}:padding=4:margin=4`;

  console.log(
    `${film.title}: ${Math.round(from)}–${Math.round(to)} c, ` +
      `${scenes ? `смены планов (порог ${threshold})` : `кадр каждые ${every} c`}, сетка ${grid}`,
  );

  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-ss", String(from),
    "-t", String(to - from),
    "-i", film.path,
    "-vf", filter,
    "-vsync", "vfr",
    "-qscale:v", "3",
    path.join(outDir, "sheet-%02d.jpg"),
  ]);

  const files = (await readdir(outDir)).filter((f) => f.endsWith(".jpg")).sort();
  console.log(`Готово: ${files.length} листов в ${outDir}`);
  for (const f of files) console.log(`  ${path.join(outDir, f)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

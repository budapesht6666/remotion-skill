/**
 * СНЯТИЕ ВОДЯНОГО ЗНАКА ГЕНЕРАТОРА с клипов, приехавших из видеомодели.
 *
 *   npm run unmark -- public/assets/diverbot          # вся папка
 *   npm run unmark -- public/assets/diverbot --show   # только показать рамку
 *   npm run unmark -- public/assets/diverbot/a.mp4 --box 0.816,0.883,0.086,0.048
 *
 * Зачем. Gemini ставит в правый нижний угол свою «искру» — маленький
 * четырёхлучевой значок. В рекламном ролике он рекламирует не тот продукт, и
 * это не придирка: ролик уходит на площадки как коммерческий материал.
 *
 * Почему не обрезкой кадра. Знак сидит на 89% высоты, и чтобы увести его за
 * край, пришлось бы срезать нижнюю восьмую часть, а с ней и половину сюжета —
 * в ночных кадрах предмет обычно стоит внизу. `delogo` вместо этого затягивает
 * прямоугольник интерполяцией от его же границ: на тёмном малодетальном фоне,
 * где знак и живёт, следа не остаётся, а кадр сохраняется целиком.
 *
 * Оригиналы не теряются: перед первой обработкой файл уезжает в `raw/` рядом,
 * и дальше чистая версия всегда пересобирается оттуда. Поэтому скрипт можно
 * запускать сколько угодно раз — второй прогон не «зачистит зачищенное».
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename } from "node:fs/promises";
import { run, probe } from "./lib/media";

/**
 * Где сидит знак, в долях кадра: x, y, ширина, высота.
 *
 * Границы сняты не на глаз, а перебором пикселей: в правой нижней четверти
 * тёмного кадра всё, что светлее порога, — это и есть знак. На кадре 720×1280
 * он занимает ровно 48×48 px от (576, 1136) до (623, 1183).
 *
 * Доли, а не пиксели, потому что модель отдаёт клипы в разном разрешении, а
 * место знака у неё всегда одно. Рамка расширена на ~6 px во все стороны:
 * delogo тянет цвет от СВОИХ ГРАНИЦ, и если граница пройдёт по краю значка,
 * он размажется вместо того, чтобы исчезнуть.
 */
const DEFAULT_BOX = { x: 0.792, y: 0.8815, w: 0.0827, h: 0.0495 };

type Args = {
  targets: string[];
  show: boolean;
  box: { x: number; y: number; w: number; h: number };
};

function parseArgs(argv: string[]): Args {
  const boxIdx = argv.indexOf("--box");
  let box = DEFAULT_BOX;
  if (boxIdx >= 0) {
    const [x, y, w, h] = (argv[boxIdx + 1] ?? "").split(",").map(Number);
    if ([x, y, w, h].some((v) => !Number.isFinite(v))) {
      throw new Error("--box ждёт четыре доли через запятую: x,y,w,h");
    }
    box = { x, y, w, h };
  }
  return {
    targets: argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--box"),
    show: argv.includes("--show"),
    box,
  };
}

/** Файлы к обработке: одиночный mp4 или все mp4 папки, кроме служебных. */
async function collect(target: string): Promise<string[]> {
  const abs = path.resolve(target);
  if (!existsSync(abs)) throw new Error(`Нет пути: ${abs}`);
  if (abs.endsWith(".mp4")) return [abs];

  const entries = await readdir(abs, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".mp4"))
    .map((e) => path.join(abs, e.name));
}

async function main() {
  const { targets, show, box } = parseArgs(process.argv.slice(2));
  if (targets.length === 0) {
    console.error("Укажите файл или папку: npm run unmark -- public/assets/diverbot");
    process.exit(1);
  }

  const files: string[] = [];
  for (const t of targets) files.push(...(await collect(t)));
  if (files.length === 0) {
    console.error("Не нашлось ни одного mp4");
    process.exit(1);
  }

  for (const file of files) {
    const dir = path.dirname(file);
    const name = path.basename(file);
    const rawDir = path.join(dir, "raw");
    const raw = path.join(rawDir, name);

    const info = await probe(file);
    const width = info.video?.width ?? 0;
    const height = info.video?.height ?? 0;
    if (!width || !height) {
      console.log(`${name}: нет видеодорожки, пропускаю`);
      continue;
    }

    // delogo требует, чтобы рамка не касалась края: он берёт цвет с её границ.
    const x = Math.max(1, Math.round(box.x * width));
    const y = Math.max(1, Math.round(box.y * height));
    const w = Math.min(Math.round(box.w * width), width - x - 1);
    const h = Math.min(Math.round(box.h * height), height - y - 1);
    const delogo = `delogo=x=${x}:y=${y}:w=${w}:h=${h}`;

    if (show) {
      // Проверка глазами перед необратимой обработкой: рисуем ту же рамку на
      // одном кадре. Дешевле, чем обнаружить промах по готовому ролику.
      const out = path.join(dir, `${path.parse(name).name}.box.png`);
      await run("ffmpeg", [
        "-y", "-hide_banner", "-loglevel", "error",
        "-ss", "2",
        "-i", file,
        "-frames:v", "1",
        "-vf", `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=red@0.9:t=3`,
        out,
      ]);
      console.log(`${name}: рамка ${w}×${h} в (${x}, ${y}) → ${path.basename(out)}`);
      continue;
    }

    // Первый прогон прячет оригинал; последующие берут исходник уже оттуда,
    // поэтому обработка не накладывается сама на себя.
    if (!existsSync(raw)) {
      await mkdir(rawDir, { recursive: true });
      await rename(file, raw);
    }

    process.stdout.write(`${name}: ${width}×${height}, рамка ${w}×${h} в (${x}, ${y})… `);
    await run("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", raw,
      "-vf", delogo,
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", "16",
      "-pix_fmt", "yuv420p",
      // Звук клипам не нужен: в ролике поверх идёт своя дорожка.
      "-an",
      "-movflags", "+faststart",
      file,
    ]);
    console.log("ок");
  }

  if (show) {
    console.log("\nЭто была проверка (--show). Уберите флаг, чтобы обработать.");
  } else {
    console.log(`\nГотово: ${files.length} файлов. Оригиналы — в raw/ рядом.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

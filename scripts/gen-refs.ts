/**
 * РЕФЕРЕНСНЫЕ КАДРЫ для генерации видео: текст → стартовая картинка.
 *
 *   npm run refs -- DiverBotAd                       # догенерить недостающее
 *   npm run refs -- DiverBotAd --only clock-night    # точечно
 *   npm run refs -- DiverBotAd --force               # перегенерить всё
 *   npm run refs -- DiverBotAd --model gemini-3-pro-image
 *
 * Зачем это отдельный шаг. Видеомодели принимают стартовый кадр, и это меняет
 * работу с ними принципиально. По одному тексту пять планов одного ролика
 * приедут пятью разными фильмами: свой контраст, своя температура, своя оптика,
 * и склеить их в одну половину уже нечем. Референс переносит выбор стиля из
 * недетерминированной видеомодели в картиночную, где кадр можно посмотреть,
 * забраковать и перегенерить за копейки, — а видеомодель получает готовый кадр
 * и только оживляет его.
 *
 * Результат: `public/assets/diverbot/refs/<имя>.png` рядом с будущими клипами
 * плюс `PROMPTS.md` — текст движения для второго шага, чтобы не собирать его
 * руками из двух файлов.
 *
 * Стоит денег: у image-моделей Gemini нет бесплатной квоты, нужен включённый
 * биллинг. Поэтому уже сгенерированное по умолчанию не трогается — только
 * `--force`.
 */
import "dotenv/config";
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { generateImage, DEFAULT_MODEL, type ImageModel } from "./lib/gen-image";
import type { Ref } from "../src/compositions/DiverBotAd/refs";

type Args = {
  comp: string;
  force: boolean;
  only: string[] | null;
  model: ImageModel;
};

function parseArgs(argv: string[]): Args {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const onlyIdx = argv.indexOf("--only");
  const modelIdx = argv.indexOf("--model");
  return {
    comp: positional[0] ?? "DiverBotAd",
    force: argv.includes("--force"),
    only: onlyIdx >= 0 ? (argv[onlyIdx + 1]?.split(",") ?? null) : null,
    model: modelIdx >= 0 ? (argv[modelIdx + 1] as ImageModel) : DEFAULT_MODEL,
  };
}

async function main() {
  const { comp, force, only, model } = parseArgs(process.argv.slice(2));

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Нет GEMINI_API_KEY в .env");
    process.exit(1);
  }

  const refsPath = path.resolve("src/compositions", comp, "refs.ts");
  if (!existsSync(refsPath)) {
    console.error(`Нет списка референсов: ${refsPath}`);
    process.exit(1);
  }
  const { REFS, refPrompt } = (await import(pathToFileURL(refsPath).href)) as {
    REFS: Ref[];
    refPrompt: (ref: Ref) => string;
  };

  const outDir = path.resolve("public/assets/diverbot/refs");
  await mkdir(outDir, { recursive: true });

  const targets = only ? REFS.filter((r) => only.includes(r.name)) : REFS;
  if (targets.length === 0) {
    console.error(`Ничего не выбрано. Есть: ${REFS.map((r) => r.name).join(", ")}`);
    process.exit(1);
  }

  console.log(`Модель: ${model}, кадры вертикальные 9:16\n`);

  let made = 0;
  for (const ref of targets) {
    const file = path.join(outDir, `${ref.name}.png`);
    if (existsSync(file) && !force) {
      console.log(`${ref.name.padEnd(16)} уже есть, пропускаю (--force перегенерит)`);
      continue;
    }

    process.stdout.write(`${ref.name.padEnd(16)} [${ref.world}] генерю… `);
    const png = await generateImage(refPrompt(ref), {
      apiKey,
      model,
      // Вертикаль просим у самой модели: кроп из горизонтали срезал бы ровно
      // тот воздух сверху и снизу, ради которого кадр и компонуется.
      aspectRatio: "9:16",
    });
    // Приводим к настоящему PNG: Gemini отдаёт JPEG независимо от того, как мы
    // назовём файл, и «png» в имени начинает врать — ffmpeg на такой набор
    // падает с «Invalid PNG signature», а редактор молча показывает мусор.
    const out = await sharp(png).png().toBuffer();
    await writeFile(file, out);
    made += 1;
    console.log(`ок, ${(out.length / 1024).toFixed(0)} КБ`);
  }

  // Шпаргалка для второго шага. Без неё автор собирает промпт движения из
  // refs.ts руками, а это ровно то место, где стиль и начинает разъезжаться.
  const md = [
    "# Референсы → видео: что вставлять в Gemini",
    "",
    "На каждый клип: приложите картинку `refs/<имя>.png` как стартовый кадр и",
    "дайте текст движения ниже. Стиль, свет и композиция уже в картинке —",
    "описывать их второй раз не нужно и вредно: модель начнёт спорить сама с собой.",
    "",
    "Готовый клип кладите в `public/assets/diverbot/<имя>.mp4`, потом",
    "`npm run ad -- " + comp + "` и рендер.",
    "",
    ...REFS.flatMap((ref) => [
      `## ${ref.name}`,
      "",
      "```",
      ref.motion,
      "```",
      "",
    ]),
  ].join("\n");
  await writeFile(path.join(outDir, "PROMPTS.md"), md, "utf8");

  console.log(
    `\nГотово: сгенерировано ${made}, всего ${REFS.length} референсов\n  ${outDir}\n` +
      `  PROMPTS.md — тексты движения для второго шага`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

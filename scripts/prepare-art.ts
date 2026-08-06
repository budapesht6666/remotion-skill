/**
 * ПОДГОТОВКА АССЕТОВ ДОСКИ: генерация иллюстраций → нормализация → трассировка.
 *
 * Читает `src/compositions/<Композиция>/script.ts` (экспорт `BOARD`), берёт из
 * него элементы `kind: "art"` и для каждого:
 *   1. генерит PNG по `subject`, если его ещё нет (Gemini Image);
 *   2. сводит на белый и гасит полутона (иначе potrace ловит мусор);
 *   3. трассирует в контуры и считает их длины и порядок рисования.
 * Результат — `public/whiteboard/art/<Композиция>/art.json`, его читает
 * компилятор доски.
 *
 * Примеры:
 *   npm run art -- Demo                  # догенерить недостающее + трассировать
 *   npm run art -- Demo --trace          # только трассировка того, что лежит
 *   npm run art -- Demo --force          # перегенерить всё заново
 *   npm run art -- Demo --only fish,net  # точечно, по id элементов
 *   npm run art -- --hand                # сгенерить руку с маркером (один раз)
 *
 * Картинки и art.json КОММИТЯТСЯ: генерация стоит денег и недетерминирована,
 * перегенерировать их на каждой машине незачем.
 */
import "dotenv/config";
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { cutoutHand, normalizeArtwork, traceArtwork, writeJson, type TracedArtwork } from "./lib/artwork";
import { artworkPrompt, generateImage, handPrompt, DEFAULT_MODEL, type ImageModel } from "./lib/gen-image";
import type { BoardItem, ArtItem } from "../src/compositions/Whiteboard/types";

type Args = {
  comp: string | null;
  trace: boolean;
  force: boolean;
  hand: boolean;
  only: string[] | null;
  model: ImageModel;
};

function parseArgs(argv: string[]): Args {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const onlyIdx = argv.indexOf("--only");
  const modelIdx = argv.indexOf("--model");
  return {
    comp: positional[0] ?? null,
    trace: argv.includes("--trace"),
    force: argv.includes("--force"),
    hand: argv.includes("--hand"),
    only: onlyIdx >= 0 ? (argv[onlyIdx + 1] ?? "").split(",").filter(Boolean) : null,
    model: modelIdx >= 0 ? (argv[modelIdx + 1] as ImageModel) : DEFAULT_MODEL,
  };
}

/** Запись трассировки одной картинки. Формат читается глазами при отладке. */
export type ArtRecord = {
  id: string;
  subject: string;
  /** Путь внутри public/ — как его ждёт staticFile(). */
  src: string;
  width: number;
  height: number;
  viewBox: string;
  inkBox: { x: number; y: number; w: number; h: number };
  contours: { d: string; length: number; solid: boolean }[];
  model: string;
  generatedAt: string;
};

export type ArtFile = { composition: string; items: Record<string, ArtRecord> };

async function generateHand(apiKey: string, model: ImageModel, force: boolean): Promise<void> {
  const dir = path.resolve("public/whiteboard/hand");
  const raw = path.resolve("out/hand-raw.png");
  const file = path.join(dir, "right-marker.png");

  await mkdir(dir, { recursive: true });
  if (!existsSync(raw) || force) {
    process.stdout.write("рука с маркером… ");
    const png = await generateImage(handPrompt(), { apiKey, model, aspectRatio: "1:1" });
    await writeFile(raw, png);
    process.stdout.write("сгенерена, ");
  } else {
    process.stdout.write("исходник есть, ");
  }

  const { width, height, tipX, tipY } = await cutoutHand(raw, file);
  console.log(`фон вырезан → ${path.relative(process.cwd(), file)} (${width}×${height})`);
  console.log(
    `Кончик маркера найден в (${Math.round(tipX * width)}, ${Math.round(tipY * height)}) px.\n` +
      `  Впишите в defaultProps: handTipX: ${tipX.toFixed(3)}, handTipY: ${tipY.toFixed(3)}\n` +
      `  Если перо промахивается мимо линии — доводите ползунками в студии.`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GEMINI_API_KEY;

  if (args.hand) {
    if (!apiKey) throw new Error("Нет GEMINI_API_KEY в .env");
    await generateHand(apiKey, args.model, args.force);
    if (!args.comp) return;
  }

  if (!args.comp) {
    console.error("Укажите композицию: npm run art -- <Композиция>  (или --hand)");
    process.exit(1);
  }

  const compDir = path.resolve("src/compositions", args.comp);
  if (!existsSync(compDir)) throw new Error(`Нет такой композиции: ${compDir}`);

  const mod = (await import(pathToFileURL(path.join(compDir, "script.ts")).href)) as { BOARD?: BoardItem[] };
  if (!mod.BOARD) throw new Error(`${args.comp}/script.ts не экспортирует BOARD`);

  let items = mod.BOARD.filter((i): i is ArtItem => i.kind === "art");
  if (args.only) items = items.filter((i) => args.only!.includes(i.id));
  if (items.length === 0) {
    console.log("Иллюстраций в BOARD нет — нечего готовить.");
    return;
  }

  const artDir = path.resolve("public/whiteboard/art", args.comp);
  const workDir = path.resolve("out", args.comp, "art-work");
  await mkdir(artDir, { recursive: true });
  await mkdir(workDir, { recursive: true });

  const t0 = Date.now();
  const out: ArtFile = { composition: args.comp, items: {} };

  for (const item of items) {
    const png = path.join(artDir, `${item.id}.png`);
    const rel = path.posix.join("whiteboard/art", args.comp, `${item.id}.png`);

    if (!existsSync(png) || args.force) {
      if (args.trace) {
        console.log(`⚠ ${item.id}: файла нет, а стоит --trace — пропускаю`);
        continue;
      }
      if (!apiKey) throw new Error("Нет GEMINI_API_KEY в .env");
      process.stdout.write(`${item.id}: генерю… `);
      const buf = await generateImage(artworkPrompt(item.subject), {
        apiKey,
        model: args.model,
        aspectRatio: item.aspect ?? "1:1",
      });
      await writeFile(png, buf);
      process.stdout.write("ок, ");
    } else {
      process.stdout.write(`${item.id}: есть, `);
    }

    const norm = path.join(workDir, `${item.id}-norm.png`);
    const size = await normalizeArtwork(png, norm);
    let art: TracedArtwork;
    try {
      art = await traceArtwork(norm);
    } catch (err) {
      console.log(`✗ ${(err as Error).message}`);
      continue;
    }

    out.items[item.id] = {
      id: item.id,
      subject: item.subject,
      src: rel,
      width: art.width || size.width,
      height: art.height || size.height,
      viewBox: art.viewBox,
      inkBox: art.inkBox,
      contours: art.contours.map((c) => ({ d: c.d, length: c.length, solid: c.solid })),
      model: args.model,
      generatedAt: new Date().toISOString(),
    };
    console.log(`контуров ${art.contours.length}, чернила ${Math.round(art.inkBox.w)}×${Math.round(art.inkBox.h)}`);
  }

  const file = path.join(artDir, "art.json");
  await writeJson(file, out);
  console.log(
    `\nготово за ${((Date.now() - t0) / 1000).toFixed(0)} c → ${path.relative(process.cwd(), file)} ` +
      `(${Object.keys(out.items).length} из ${items.length})`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

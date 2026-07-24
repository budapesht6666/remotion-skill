/**
 * CLI: поиск и скачивание бесплатного стока в public/assets.
 *
 *   npm run assets -- --query "ocean waves" --kind video --count 2
 *   npm run assets -- -q "coffee" -k photo -n 3
 *
 * Флаги:
 *   --query, -q   поисковый запрос (обязателен)
 *   --kind,  -k   photo | video   (по умолчанию photo)
 *   --count, -n   сколько файлов   (по умолчанию 3)
 *   --out         каталог вывода    (по умолчанию public/assets)
 *
 * Скачанные файлы попадают в public/assets и доступны в композиции через
 * staticFile("assets/<имя>"). Атрибуция авторов пишется в public/assets/manifest.json.
 */
import "dotenv/config";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { searchStock, type StockItem, type StockKind } from "./lib/stock";

type Args = { query: string; kind: StockKind; count: number; out: string };

function parseArgs(argv: string[]): Args {
  const out: Args = { query: "", kind: "photo", count: 3, out: "public/assets" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--query" || a === "-q") out.query = next();
    else if (a === "--kind" || a === "-k") out.kind = next() as StockKind;
    else if (a === "--count" || a === "-n") out.count = Number(next());
    else if (a === "--out") out.out = next();
  }
  return out;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9а-я]+/gi, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "asset"
  );
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

type ManifestEntry = {
  file: string;
  source: string;
  credit: string;
  creditUrl: string;
  query: string;
};

async function readManifest(file: string): Promise<ManifestEntry[]> {
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(await readFile(file, "utf8")) as ManifestEntry[];
  } catch {
    return [];
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.query) {
    console.error(
      'Нужен запрос. Пример: npm run assets -- --query "ocean" --kind video --count 2',
    );
    process.exit(1);
  }

  console.log(`Поиск: "${args.query}" [${args.kind}] × ${args.count}`);
  const items = await searchStock(args.query, args.kind, args.count);
  if (items.length === 0) {
    console.error(
      "Ничего не найдено. Проверьте, что заданы ключи в .env (UNSPLASH_ACCESS_KEY / PEXELS_API_KEY / PIXABAY_API_KEY).",
    );
    process.exit(1);
  }

  await mkdir(args.out, { recursive: true });
  const slug = slugify(args.query);
  const manifestPath = path.join(args.out, "manifest.json");
  const manifest = await readManifest(manifestPath);

  let ok = 0;
  for (let i = 0; i < items.length; i++) {
    const item: StockItem = items[i];
    const name = `${slug}-${item.source}-${i + 1}.${item.ext}`;
    const dest = path.join(args.out, name);
    try {
      await download(item.downloadUrl, dest);
      manifest.push({
        file: name,
        source: item.source,
        credit: item.credit,
        creditUrl: item.creditUrl,
        query: args.query,
      });
      console.log(`  ✓ ${name}  — ${item.credit}`);
      ok++;
    } catch (e) {
      console.warn(`  ✗ ${name}: ${(e as Error).message}`);
    }
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(
    `\nГотово: ${ok}/${items.length} → ${args.out}\n` +
      `В композиции используйте: staticFile("assets/${slug}-${items[0].source}-1.${items[0].ext}")`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

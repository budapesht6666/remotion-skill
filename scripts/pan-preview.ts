/**
 * ПРЕДПРОСМОТР КАДРИРОВАНИЯ: как лягут вертикальные клипы.
 *
 *   npm run pan -- ValleyAuction
 *   npm run pan -- ValleyAuction --only a05 --every 0.4
 *
 * Снимает кадры нарезанных клипов и складывает их в листы out/<Comp>/pan/.
 * Клипы уже вертикальные (окно вырезано на этапе `npm run cut` по траектории
 * детектора лиц), поэтому проверять нужно ровно то, что увидит зритель: не
 * срезан ли говорящий, не проскакивает ли на краях бита чужой план.
 *
 * Дешевле рендера: весь ролик проверяется за секунды вместо минут.
 */
import { mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { probe, run } from "./lib/media";

type Clip = {
  id: string;
  /** Путь клипа относительно public/ */
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
    only: flag("only")?.split(",") ?? null,
    every: Number(flag("every") ?? 0.6),
  };
}

async function main() {
  const { comp, only, every } = parseArgs(process.argv.slice(2));
  if (!comp) {
    console.error("Укажите композицию: npm run pan -- ValleyAuction");
    process.exit(1);
  }
  const manifest = path.resolve("public/clips", comp, "clips.json");
  if (!existsSync(manifest)) {
    console.error(`Нет манифеста: ${manifest} (сначала npm run cut -- ${comp})`);
    process.exit(1);
  }
  const clips = (JSON.parse(await readFile(manifest, "utf8")) as Clip[]).filter(
    (c) => !only || only.includes(c.id),
  );

  const outDir = path.resolve("out", comp, "pan");
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const clip of clips) {
    const source = path.resolve("public", clip.file);
    // Длительность — у самого файла, а не `durationInFrames / FORMAT.fps`:
    // нарезки чужого видео идут на родных 23.976, и деление на 30 показывало
    // лишь первые 80 % бита — хвост с последним планом в лист не попадал.
    const { duration } = await probe(source);
    const shots: string[] = [];
    // Последние кадры не снимаем: на самом хвосте ffmpeg возвращает пустоту,
    // и склейка листа падает на несуществующем файле.
    for (let t = 0.05; t < duration - 0.15; t += every) {
      const file = path.join(outDir, `${clip.id}-${t.toFixed(1)}.png`);
      await run("ffmpeg", [
        "-y", "-hide_banner", "-loglevel", "error",
        "-ss", String(t),
        "-i", source,
        "-frames:v", "1",
        "-vf", "scale=200:-2",
        file,
      ]);
      shots.push(file);
    }
    const inputs = shots.flatMap((f) => ["-i", f]);
    const cols = Math.min(8, shots.length);
    const layout = shots
      .map((_, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col === 0 ? "0" : Array.from({ length: col }, (__, j) => `w${j}`).join("+");
        const y = row === 0 ? "0" : Array.from({ length: row }, (__, j) => `h${j * cols}`).join("+");
        return `${x}_${y}`;
      })
      .join("|");
    await run("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      ...inputs,
      "-filter_complex",
      `${shots.map((_, i) => `[${i}]`).join("")}xstack=inputs=${shots.length}:layout=${layout}`,
      path.join(outDir, `${clip.id}.png`),
    ]);
    for (const f of shots) await rm(f, { force: true });
    console.log(`${clip.id}: ${shots.length} кадров`);
  }

  const sheets = (await readdir(outDir)).filter((f) => f.endsWith(".png"));
  console.log(`
Листы в ${outDir} (${sheets.length})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

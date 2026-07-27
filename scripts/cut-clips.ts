/**
 * НАРЕЗКА КЛИПОВ по сценарию композиции.
 *
 *   npm run cut -- JuniorKumite
 *   npm run cut -- JuniorKumite --only b03,b07
 *
 * Читает src/compositions/<Comp>/script.ts, вырезает каждый бит из исходного
 * фильма и складывает в public/clips/<Comp>/. Рядом пишет clips.json с
 * длительностями в кадрах — композиция строит по нему таймлайн, не гадая.
 *
 * Что делается с материалом:
 *   • апскейл до ширины 1080 (lanczos) — один раз здесь, чтобы Remotion не
 *     ресайзил каждый кадр на рендере;
 *   • приведение к 30 fps проекта;
 *   • loudnorm — иначе тихая реплика и удар в гонг звучат несопоставимо;
 *   • для битов с mute звук выбрасывается (под них кладётся свой).
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { run, tc } from "./lib/media";
import { findFilm } from "./lib/films";
import { FORMAT } from "../src/lib/format";

export type Beat = {
  id: string;
  /** slug фильма из scripts/lib/films.ts */
  film: string;
  start: number;
  end: number;
  kind: "quote" | "action";
  /** Кто говорит — ключ из voices.ts. Пусто у немых планов. */
  speaker?: string;
  /** Наша реплика: её озвучивает `npm run vo`, она же задаёт длину бита. */
  line?: string;
  /** Текст субтитра, если субтитры включены (по умолчанию берётся `line`). */
  caption?: string;
  /** Зачем бит в истории (для читаемости сценария). */
  note?: string;
  /** Выбросить оригинальный звук (обычно для немых планов-реакций). */
  mute?: boolean;
  /** Замедление: 2 = вдвое медленнее. Для кульминаций вроде удара. */
  slow?: number;
  /** Громкость оригинальной дорожки в этом бите (0…1). */
  originalVolume?: number;
  /** Оставить оригинальные голоса нетронутыми (по умолчанию их вырезает фильтр). */
  keepDialogue?: boolean;
  /** Кадрирование под вертикаль: увеличение и сдвиг центра, −1…1. */
  zoom?: number;
  panX?: number;
  panY?: number;
};

export type ClipMeta = {
  id: string;
  file: string;
  durationInFrames: number;
  caption: string | null;
  kind: Beat["kind"];
  zoom: number;
  panX: number;
  panY: number;
  originalVolume: number;
  /** Файл озвучки в public/, если реплика есть. */
  voFile: string | null;
  /** Слова реплики с таймингами — по ним рисуется караоке. */
  words: { w: string; s: number; e: number }[];
};

/** Пауза после реплики, чтобы склейка не наступала на последнее слово. */
const VO_TAIL = 0.35;

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const onlyIdx = argv.indexOf("--only");
  return {
    comp: positional[0] ?? "",
    only: onlyIdx >= 0 ? argv[onlyIdx + 1]?.split(",") ?? null : null,
  };
}

async function main() {
  const { comp, only } = parseArgs(process.argv.slice(2));
  if (!comp) {
    console.error("Укажите композицию: npm run cut -- JuniorKumite");
    process.exit(1);
  }

  const scriptPath = path.resolve("src/compositions", comp, "script.ts");
  if (!existsSync(scriptPath)) {
    console.error(`Нет сценария: ${scriptPath}`);
    process.exit(1);
  }
  const { SCRIPT } = (await import(pathToFileURL(scriptPath).href)) as { SCRIPT: Beat[] };
  const beats = only ? SCRIPT.filter((b) => only.includes(b.id)) : SCRIPT;

  const outDir = path.resolve("public/clips", comp);
  await mkdir(outDir, { recursive: true });

  // Озвучка задаёт длину бита: реплика не должна обрываться склейкой.
  const voPath = path.resolve("public/vo", comp, "vo.json");
  const voClips: {
    id: string;
    file: string;
    durationInSeconds: number;
    words?: { w: string; s: number; e: number }[];
  }[] = existsSync(voPath)
    ? JSON.parse(await readFile(voPath, "utf8"))
    : [];
  if (voClips.length === 0) {
    console.log("vo.json не найден — режу по таймкодам сценария (сначала npm run vo).\n");
  }

  const metas: ClipMeta[] = [];
  const stretched: string[] = [];
  const t0 = Date.now();
  for (const beat of beats) {
    const film = findFilm(beat.film);
    const rawDuration = beat.end - beat.start;
    if (rawDuration <= 0) throw new Error(`Бит ${beat.id}: end должен быть больше start`);

    const slow = beat.slow ?? 1;
    const vo = voClips.find((v) => v.id === beat.id);
    const voNeeds = vo ? vo.durationInSeconds + VO_TAIL : 0;
    // Итоговая длина — что длиннее: замедленный фрагмент или реплика поверх него.
    const outDuration = Math.max(rawDuration * slow, voNeeds);
    const srcDuration = outDuration / slow;
    if (srcDuration > rawDuration + 0.05) {
      stretched.push(
        `${beat.id}: +${(srcDuration - rawDuration).toFixed(1)} c под реплику`,
      );
    }
    const file = path.join(outDir, `${beat.id}.mp4`);

    process.stdout.write(
      `${beat.id}  ${tc(beat.start)}–${tc(beat.start + srcDuration)}  ` +
        `(${outDuration.toFixed(1)} c${slow !== 1 ? `, ×${slow} замедление` : ""})… `,
    );
    const videoFilter = [
      "scale=1080:-2:flags=lanczos",
      ...(slow !== 1 ? [`setpts=${slow}*PTS`] : []),
      `fps=${FORMAT.fps}`,
    ].join(",");
    // Под нашей репликой оригинальные голоса мешают, поэтому режем полосу
    // разборчивости (речь живёт в 300–3400 Гц) — остаётся низкий гул зала и
    // удары, атмосфера не пропадает. В сценах без наших слов дорожка не трогается.
    const killDialogue = Boolean(beat.line) && !beat.keepDialogue;
    const audioFilter = [
      ...(slow !== 1 ? [`atempo=${(1 / slow).toFixed(3)}`] : []),
      "loudnorm=I=-16:TP=-1.5:LRA=11",
      ...(killDialogue ? ["lowpass=f=180"] : []),
    ].join(",");

    await run("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-ss", String(beat.start),
      "-t", String(srcDuration),
      "-i", film.path,
      "-vf", videoFilter,
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      ...(beat.mute
        ? ["-an"]
        : [
            "-af", audioFilter,
            "-c:a", "aac",
            "-b:a", "192k",
            "-ar", "48000",
          ]),
      "-movflags", "+faststart",
      file,
    ]);

    metas.push({
      id: beat.id,
      file: `clips/${comp}/${beat.id}.mp4`,
      durationInFrames: Math.round(outDuration * FORMAT.fps),
      voFile: vo?.file ?? null,
      words: vo?.words ?? [],
      // Под репликой звучит уже безречевой гул — его можно держать заметнее,
      // чем раньше приглушённые диалоги.
      originalVolume: beat.originalVolume ?? (beat.line ? 0.4 : 0.6),
      caption: beat.caption ?? beat.line ?? null,
      kind: beat.kind,
      zoom: beat.zoom ?? 1,
      panX: beat.panX ?? 0,
      panY: beat.panY ?? 0,
    });
    console.log("ок");
  }

  const metaPath = path.join(outDir, "clips.json");
  // При --only перерезаются отдельные биты, но манифест обязан описывать ролик
  // целиком: иначе композиция соберётся из двух клипов, а остальные пропадут с
  // таймлайна. Поэтому обновляем записи поверх прежнего манифеста и раскладываем
  // их в порядке SCRIPT — он и есть монтажный лист.
  const previous: ClipMeta[] = only && existsSync(metaPath)
    ? (JSON.parse(await readFile(metaPath, "utf8")) as ClipMeta[])
    : [];
  const merged = only
    ? SCRIPT.map((b) => metas.find((m) => m.id === b.id) ?? previous.find((m) => m.id === b.id))
        .filter((m): m is ClipMeta => Boolean(m))
    : metas;
  await writeFile(metaPath, JSON.stringify(merged, null, 2), "utf8");

  const total = merged.reduce((s, m) => s + m.durationInFrames, 0);
  console.log(
    `\nГотово за ${((Date.now() - t0) / 1000).toFixed(0)} c: ` +
      `${metas.length} клипов перерезано, в манифесте ${merged.length}, ` +
      `${(total / FORMAT.fps).toFixed(1)} c хронометража\n  ${metaPath}`,
  );
  if (stretched.length > 0) {
    console.log(
      `\nФрагменты растянуты под озвучку (проверьте, что не залезли в следующую сцену):`,
    );
    for (const s of stretched) console.log(`  ${s}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

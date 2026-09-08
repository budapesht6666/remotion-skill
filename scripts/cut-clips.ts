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
 *   • ВЫРЕЗКА ВЕРТИКАЛИ. Кадр 16:9 кропается в 9:16 прямо здесь, окном, которое
 *     едет за головой говорящего (траектория из `npm run track` или поле `pan`
 *     бита). Так кадр масштабируется ровно один раз — из нативных пикселей
 *     исходника в 1080×1920 (lanczos + лёгкий unsharp). Раньше кроп делал
 *     браузер поверх уже отмасштабированного клипа, и двойной ресемплинг было
 *     видно как «пиксели» на телефоне;
 *   • приведение к 30 fps проекта;
 *   • loudnorm — иначе тихая реплика и удар в гонг звучат несопоставимо;
 *   • для битов с mute звук выбрасывается (под них кладётся свой).
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { probe, run, tc } from "./lib/media";
import { findFilm } from "./lib/films";
import { stripStress, maskProfanity } from "./lib/text";
import { FORMAT } from "../src/lib/format";
import type { Track } from "./track-faces";

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
  /**
   * Откуда брать субтитры. "source" — из индекса реплик самого фильма
   * (data/index/<slug>/quotes.json): в ролике звучит оригинальная дорожка, а
   * караоке идёт по её же словам. Мат в тексте маскируется звёздочками, в
   * звуке остаётся.
   */
  subs?: "source";
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
  /**
   * Траектория вертикального окна по кадру: куда смотреть в каждый момент бита.
   * `t` — секунды от начала бита, `x` — доля ШИРИНЫ исходного кадра (0 — левый
   * край, 1 — правый), которая должна оказаться в центре вертикали.
   *
   * Ею окно «ведёт» персонажа: на смене плана ставятся две точки с почти
   * одинаковым `t` (мгновенный переброс), при проходе героя по кадру — точки
   * подальше друг от друга (плавное сопровождение). Один элемент = статичный
   * кадр, смещённый к герою. Если не задано, работает `panX`.
   */
  pan?: { t: number; x: number }[];
  /**
   * Подсказка трекеру: доля ширины кадра, ближе к которой стоит нужный герой.
   * Пригодится, когда в плане двое и автоматика ведёт не того.
   */
  follow?: number;
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
  /** Траектория вертикального окна: доля ширины кадра в центре вертикали. */
  pan: { t: number; x: number }[];
  /** Размеры нарезанного клипа — по ним считается ширина видимого окна. */
  width: number;
  height: number;
  /** Файл озвучки в public/, если реплика есть. */
  voFile: string | null;
  /** Слова реплики с таймингами — по ним рисуется караоке. */
  words: { w: string; s: number; e: number }[];
};

/** Пауза после реплики, чтобы склейка не наступала на последнее слово. */
const VO_TAIL = 0.35;

/**
 * Выражение для ffmpeg: положение левого края вертикального окна во времени.
 *
 * Траектория задана точками «доля ширины кадра», между ними идёт линейная
 * интерполяция, поэтому выражение — вложенные if по времени. Крайние значения
 * зажимаются, чтобы окно не вышло за кадр.
 */
function panExpression(
  points: { t: number; x: number }[],
  srcWidth: number,
  winWidth: number,
): string {
  const maxX = Math.max(0, srcWidth - winWidth);
  const at = (x: number) =>
    Math.round(Math.max(0, Math.min(maxX, x * srcWidth - winWidth / 2)));
  if (points.length === 0) return String(Math.round(maxX / 2));
  if (points.length === 1) return String(at(points[0].x));

  let expr = String(at(points[points.length - 1].x));
  for (let i = points.length - 2; i >= 0; i--) {
    const a = points[i];
    const b = points[i + 1];
    const dt = Math.max(0.001, b.t - a.t);
    const from = at(a.x);
    const delta = at(b.x) - from;
    const segment = `(${from}+(${delta})*(t-${a.t.toFixed(2)})/${dt.toFixed(3)})`;
    expr = `if(lt(t,${b.t.toFixed(2)}),${segment},${expr})`;
  }
  return expr;
}

type IndexQuote = {
  start: number;
  end: number;
  text: string;
  words: { w: string; s: number; e: number }[];
};

/** Индексы реплик читаются по одному разу на фильм — в сценарии их немного. */
const quoteCache = new Map<string, IndexQuote[]>();

async function loadQuotes(slug: string): Promise<IndexQuote[]> {
  const cached = quoteCache.get(slug);
  if (cached) return cached;
  const file = path.resolve("data/index", slug, "quotes.json");
  if (!existsSync(file)) {
    throw new Error(
      `Нет индекса реплик для «${slug}»: ${file}
` +
        `Соберите его: npm run quotes -- ${slug}`,
    );
  }
  const index = JSON.parse(await readFile(file, "utf8")) as { quotes: IndexQuote[] };
  quoteCache.set(slug, index.quotes);
  return index.quotes;
}

/**
 * Слова оригинальной дорожки, попавшие в бит, с таймингами от начала клипа.
 *
 * Короткие реплики («А?», «Нет.») whisper иногда отдаёт без разбивки по словам —
 * для них тайминги раскладываются равномерно внутри сегмента, иначе фраза
 * исчезнет из субтитра.
 */
function sourceWords(
  quotes: IndexQuote[],
  start: number,
  end: number,
  slow: number,
): { w: string; s: number; e: number }[] {
  const out: { w: string; s: number; e: number }[] = [];
  for (const q of quotes) {
    if (q.end <= start || q.start >= end) continue;
    const words =
      q.words.length > 0
        ? q.words
        : q.text
            .split(/\s+/)
            .filter(Boolean)
            .map((w, i, arr) => {
              const step = (q.end - q.start) / arr.length;
              return { w, s: q.start + i * step, e: q.start + (i + 1) * step };
            });
    for (const w of words) {
      // Слово, наполовину оставшееся за склейкой, в субтитре только мешает.
      if ((w.s + w.e) / 2 <= start || (w.s + w.e) / 2 >= end) continue;
      // Соседние сегменты whisper иногда перекрываются и отдают одно и то же
      // слово дважды — в субтитре это выглядит как «атака. атака.».
      const previous = out[out.length - 1];
      if (previous && previous.w === maskProfanity(w.w) && w.s - start < previous.e + 0.02) {
        continue;
      }
      out.push({
        w: maskProfanity(w.w),
        s: Number(((w.s - start) * slow).toFixed(2)),
        e: Number(((w.e - start) * slow).toFixed(2)),
      });
    }
  }
  return out.sort((a, b) => a.s - b.s);
}

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
  const { SCRIPT, FPS } = (await import(pathToFileURL(scriptPath).href)) as {
    SCRIPT: Beat[];
    FPS?: number;
  };
  // Кадровая частота ролика. Если исходник снят в 23.976, приведение к 30
  // дублирует каждый пятый кадр — на панорамировании это читается как
  // микрорывки, поэтому такие нарезки держим на родном fps исходника.
  const fps = FPS ?? FORMAT.fps;
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

  // Траектории окна из `npm run track`: их считает детектор лиц, а сценарий
  // может перебить своим `pan` там, где вести надо не самого заметного героя.
  const trackPath = path.resolve("data/track", `${comp}.json`);
  const tracks: Record<string, Track> = existsSync(trackPath)
    ? JSON.parse(await readFile(trackPath, "utf8"))
    : {};
  // Молча резать без траекторий нельзя: окно встанет по центру, и говорящие
  // окажутся за краем вертикали. Лучше остановиться, чем отдать такой монтаж.
  const missing = beats.filter((b) => !b.pan && !tracks[b.id]).map((b) => b.id);
  if (missing.length > 0) {
    console.error(
      `Нет траекторий окна для битов: ${missing.join(", ")}
` +
        `Сначала: npm run track -- ${comp}`,
    );
    process.exit(1);
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
    // Кадр сначала увеличивается до финальной высоты, и только потом из него
    // вырезается вертикальное окно. Порядок важен для ПЛАВНОСТИ: если кропать
    // до апскейла, шаг окна равен пикселю исходника — то есть почти пяти
    // пикселям экрана, и медленное панорамирование идёт заметными ступеньками.
    // После апскейла шаг равен экранному пикселю, движение получается гладким,
    // а качество не страдает: масштабирование по-прежнему одно.
    const source = await probe(film.path);
    const srcWidth = source.video?.width ?? 704;
    const srcHeight = source.video?.height ?? 400;
    const zoom = beat.zoom ?? 1;
    const stageHeight = Math.round((FORMAT.height * zoom) / 2) * 2;
    const stageWidth = Math.round((srcWidth * stageHeight) / srcHeight / 2) * 2;
    const points = beat.pan ?? tracks[beat.id]?.pan ?? [];
    const xExpr = panExpression(points, stageWidth, FORMAT.width);

    const videoFilter = [
      // Денойз до апскейла: иначе увеличение вытягивает шум рипа вместе с
      // деталями и картинка «сыпется».
      "hqdn3d=1.5:1.2:6:6",
      `scale=${stageWidth}:${stageHeight}:flags=lanczos`,
      // Выражения crop в ffmpeg 8 пересчитываются на каждом кадре сами
      // (параметры помечены как timeline-aware), отдельный eval=frame больше не
      // нужен — и не принимается.
      `crop=${FORMAT.width}:${FORMAT.height}:x='${xExpr}':y=${Math.round((stageHeight - FORMAT.height) / 2)}`,
      // Мягкая резкость возвращает контур после четырёхкратного увеличения.
      "unsharp=5:5:0.7:5:5:0.0",
      ...(slow !== 1 ? [`setpts=${slow}*PTS`] : []),
      // Дробный fps отдаём точной дробью (24000/1001), а не десятичной записью:
      // накопленная ошибка округления сдвигает кадры на длинных клипах.
      `fps=${Number.isInteger(fps) ? fps : `${Math.round(fps * 1001)}/1001`}`,
    ].join(",");
    // Под нашей репликой оригинальные голоса мешают, поэтому режем полосу
    // разборчивости (речь живёт в 300–3400 Гц) — остаётся низкий гул зала и
    // удары, атмосфера не пропадает. В сценах без наших слов дорожка не трогается.
    const killDialogue = Boolean(beat.line) && !beat.keepDialogue;
    // Клип с оригинальной дорожкой звучит в ролике сам за себя, без озвучки
    // поверх, поэтому его нормируем громче: −16 LUFS хороши как подложка под
    // голос, но для ленты шортсов, где решает первая секунда, это глухо.
    const target = beat.subs === "source" ? "I=-13:TP=-1.0:LRA=11" : "I=-16:TP=-1.5:LRA=11";
    const audioFilter = [
      ...(slow !== 1 ? [`atempo=${(1 / slow).toFixed(3)}`] : []),
      `loudnorm=${target}`,
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
            // Сводим в стерео до нормализации: у 5.1-дорожек речь живёт в
            // центральном канале, а браузер в рендере микширует такой клип
            // сам и делает это тише и глуше. Здесь downmix выполняет ffmpeg,
            // и loudnorm меряет уже то, что реально услышит зритель.
            "-ac", "2",
            "-af", audioFilter,
            "-c:a", "aac",
            "-b:a", "192k",
            "-ar", "48000",
          ]),
      "-movflags", "+faststart",
      file,
    ]);

    // Ролик на оригинальной дорожке: караоке идёт по словам самого фильма,
    // поэтому слова берутся из индекса реплик и сдвигаются к началу клипа.
    const fromSource =
      beat.subs === "source"
        ? sourceWords(await loadQuotes(film.slug), beat.start, beat.start + srcDuration, slow)
        : [];
    const words = vo?.words ?? fromSource;

    // Реальные размеры нарезанного клипа: по ним композиция считает, какая
    // доля ширины помещается в вертикальное окно, и переводит `pan` в проценты.
    const shot = await probe(file);

    metas.push({
      id: beat.id,
      file: `clips/${comp}/${beat.id}.mp4`,
      durationInFrames: Math.round(outDuration * fps),
      voFile: vo?.file ?? null,
      words,
      // Под репликой звучит уже безречевой гул — его можно держать заметнее,
      // чем раньше приглушённые диалоги. В режиме subs:"source" говорят сами
      // герои, поэтому дорожка идёт на полной громкости.
      originalVolume:
        beat.originalVolume ?? (beat.subs === "source" ? 1 : beat.line ? 0.4 : 0.6),
      pan: points,
      width: shot.video?.width ?? 0,
      height: shot.video?.height ?? 0,
      caption:
        stripStress(
          beat.caption ??
            beat.line ??
            (beat.subs === "source" ? fromSource.map((w) => w.w).join(" ") : ""),
        ) || null,
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
      `${(total / fps).toFixed(1)} c хронометража при ${fps.toFixed(3)} fps\n  ${metaPath}`,
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

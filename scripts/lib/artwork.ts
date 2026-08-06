/**
 * Векторизация растра в штрихи маски: контуры (обводка) и серпантин (штриховка).
 *
 * Зачем это вообще. Растр нельзя «нарисовать пером»: `stroke-dasharray` работает
 * только по обводке SVG. Поэтому картинка проявляется через анимированную маску:
 * контуры рисунка обводятся толстым пером внутри `<mask>`, и по мере роста
 * обводки картинка открывается. Рука едет по тому же контуру — получается, что
 * она рисует именно этот объект, а не абстрактно «стирает шторку».
 *
 * potrace отдаёт ОБВОДКИ чёрных областей, а не centerline. Для штриха line-art
 * это две линии по краям — для маски ровно то, что нужно: перо толщиной чуть
 * больше толщины штриха закрывает его целиком.
 *
 * ДВА РЕЖИМА, по числу стилей генерации (см. lib/gen-image.ts).
 *
 *   line     — плоский контурный рисунок. Порог фиксирован, контуры и есть
 *              весь рисунок: обвели — открылось всё.
 *   graphite — реалистичный карандаш. Обводка одна картинку не откроет: тон
 *              лежит по всей площади, а не вдоль линий. Поэтому:
 *                • порог АДАПТИВНЫЙ (перцентиль гистограммы) — «тёмное» у
 *                  рисунка на белой бумаге и у рисунка с залитым чёрным фоном
 *                  это разные абсолютные величины;
 *                • контуров берём только несколько самых длинных — остальное
 *                  всё равно закроет вторая фаза;
 *                • вторая фаза — `planShading`: серпантин широким пером по
 *                  площади рисунка, ровно как растушёвывают карандашом.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import potrace from "potrace";
import sharp from "sharp";
import { getSubpaths, getLength, getBoundingBox } from "@remotion/paths";

export type Contour = {
  d: string;
  length: number;
  bbox: { x1: number; y1: number; x2: number; y2: number; width: number; height: number };
  /**
   * Контур обводит СПЛОШНУЮ фигуру (залитая стрелка, серая тень), а не линию.
   *
   * Различать обязательно: маска открывает картинку обводкой контура, и у
   * сплошной фигуры шире пера серединка так и осталась бы скрытой. Такие
   * контуры после отрисовки ещё и заливаются в маске — читается как «обвёл и
   * закрасил», ровно как рисует человек.
   */
  solid: boolean;
};

export type TracedArtwork = {
  /** Размеры исходного растра, px. */
  width: number;
  height: number;
  /** viewBox трассировки — совпадает с растром. */
  viewBox: string;
  /** Контуры В ПОРЯДКЕ РИСОВАНИЯ. */
  contours: Contour[];
  /** Тесный бокс по всем чернилам. */
  inkBox: { x: number; y: number; w: number; h: number };
};

/** Режим обработки: плоский line-art или реалистичный графит. */
export type TraceMode = "line" | "graphite";

/**
 * Что считается фигурой, а что фоном.
 *
 * Для line-art вопроса нет: чернила тёмные, бумага светлая. Для графита с
 * залитым фоном всё наоборот — объект СВЕТЛЫЙ на тёмном, и трассировка «тёмного
 * на светлом» обвела бы не Луну, а виньетку по краю кадра. Полярность задаётся
 * тем же полем `backdrop`, что и промпт генерации, поэтому автору её выбирать
 * не приходится.
 */
export type Polarity = "dark-on-light" | "light-on-dark";

export type TraceOptions = {
  mode?: TraceMode;
  polarity?: Polarity;
  /** Порог бинаризации 0…255. Ниже — тоньше линия. У graphite считается сам. */
  threshold?: number;
  /** Крапинки мельче этого (в пикселях площади) выбрасываются. */
  turdSize?: number;
  /** Контуры короче этого (в px длины) выбрасываются как мусор трассировки. */
  minLength?: number;
  /** Сколько самых длинных контуров оставить. У graphite обязательно. */
  maxContours?: number;
  /**
   * Граница «фон / рисунок» для посадки по чернилам у graphite.
   * `ALL_CONTENT` — весь кадр (картинка с залитым фоном).
   */
  paperLevel?: number;
};

const DEFAULTS: Record<TraceMode, Required<Omit<TraceOptions, "mode" | "threshold">> & { threshold: number | null }> = {
  line: { threshold: 160, turdSize: 12, minLength: 24, maxContours: Infinity },
  /**
   * threshold: null → считается по гистограмме. turdSize/minLength подняты на
   * порядок: у карандашного рисунка порог отсекает не линии, а тёмные ПЯТНА
   * тона, и мелких огрызков там сотни.
   */
  graphite: { threshold: null, turdSize: 300, minLength: 220, maxContours: 10 },
};

/**
 * Уровень бумаги: светлее — фон, темнее — рисунок.
 *
 * Константой это задать нельзя. Генератор отдаёт «белую бумагу» кремовой и с
 * зерном, и фиксированные 242 объявляли содержимым весь кадр: рисунок садился
 * в рамку вдвое мельче задуманного (посадка идёт по чернилам), а рука
 * растушёвывала пустые поля. Поэтому уровень СНИМАЕТСЯ С УГЛОВ кадра — там
 * заведомо фон — и от него отступается запас.
 *
 * У картинок с залитым фоном (`backdrop: "dark"`) вопроса нет вообще:
 * содержимое — весь кадр, включая фон, его и надо закрасить. Такой вызов
 * передаёт `paperLevel = 256`.
 */
const PAPER_MARGIN = 14;
const CORNER_FRACTION = 0.06;

export function estimatePaperLevel(raster: Raster): number {
  const { data, info } = raster;
  const cw = Math.max(2, Math.round(info.width * CORNER_FRACTION));
  const ch = Math.max(2, Math.round(info.height * CORNER_FRACTION));
  const samples: number[] = [];
  for (const [ox, oy] of [
    [0, 0],
    [info.width - cw, 0],
    [0, info.height - ch],
    [info.width - cw, info.height - ch],
  ]) {
    for (let y = oy; y < oy + ch; y += 2) {
      for (let x = ox; x < ox + cw; x += 2) samples.push(data[y * info.width + x]);
    }
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  return Math.min(250, Math.max(190, median - PAPER_MARGIN));
}

/** Весь кадр — содержимое: так зовут функции для картинок с залитым фоном. */
export const ALL_CONTENT = 256;

/**
 * Доля самых тёмных пикселей, которая считается «контуром» у графита.
 *
 * Абсолютный порог здесь не работает в принципе: у рисунка на белой бумаге
 * тёмное — это 10% площади, у рисунка с залитым чёрным фоном — 70%. Перцентиль
 * даёт в обоих случаях границу главной тёмной массы, то есть ровно тот контур,
 * который человек обвёл бы первым.
 */
const GRAPHITE_PERCENTILE = 0.22;

/**
 * Готовит растр к трассировке: убирает альфу на белый (генераторы часто отдают
 * PNG с прозрачностью, и potrace принял бы прозрачное за чёрное), гасит
 * полутона и лёгкий шум JPEG-подобных артефактов.
 *
 * У графита добавляется размытие: без него потрейс идёт по зерну бумаги и
 * фактуре карандаша, а это тысячи микроконтуров вместо формы.
 */
export async function normalizeArtwork(
  src: string,
  dest: string,
  mode: TraceMode = "line",
): Promise<{ width: number; height: number }> {
  let img = sharp(src).flatten({ background: "#ffffff" }).greyscale().normalise();
  if (mode === "graphite") img = img.blur(2);
  const meta = await img.metadata();
  await img.toFile(dest);
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

/** Порог как перцентиль гистограммы яркости, считая от тёмного конца. */
function percentileThreshold(lum: Uint8Array | Buffer, fraction: number): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < lum.length; i++) hist[lum[i]]++;
  const target = lum.length * fraction;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    // Кламп: на совсем контрастной картинке перцентиль уезжает в 0 или 255,
    // и potrace отдаёт либо пустоту, либо один контур во весь кадр.
    if (acc >= target) return Math.min(210, Math.max(45, v));
  }
  return 160;
}

/** Трассирует нормализованный растр в контуры. */
export async function traceArtwork(file: string, opts: TraceOptions = {}): Promise<TracedArtwork> {
  const mode = opts.mode ?? "line";
  const polarity = opts.polarity ?? "dark-on-light";
  const base = DEFAULTS[mode];
  const turdSize = opts.turdSize ?? base.turdSize;
  const minLength = opts.minLength ?? base.minLength;
  const maxContours = opts.maxContours ?? base.maxContours;

  const grey = await readGrey(file);
  const blackOnWhite = polarity === "dark-on-light";
  // Фигура — это доля площади кадра, а не абсолютная яркость. У «светлого на
  // тёмном» отсчитываем перцентиль с другого конца гистограммы.
  const threshold =
    opts.threshold ??
    base.threshold ??
    percentileThreshold(grey.data, blackOnWhite ? GRAPHITE_PERCENTILE : 1 - GRAPHITE_PERCENTILE);

  const svg = await new Promise<string>((resolve, reject) => {
    potrace.trace(
      file,
      { threshold, turdSize, alphaMax: 1, optCurve: true, optTolerance: 0.3, blackOnWhite },
      (err: Error | null, out: string) => (err ? reject(err) : resolve(out)),
    );
  });

  const d = svg.match(/\sd="([^"]+)"/)?.[1];
  if (!d) throw new Error(`potrace не отдал ни одного пути для ${path.basename(file)}`);

  const vb = svg.match(/viewBox="([^"]+)"/)?.[1] ?? "";
  const [, , vw, vh] = vb.split(/\s+/).map(Number);

  // Пиксели нужны, чтобы отличить контур сплошной фигуры от контура линии:
  // смотрим яркость в центре бокса. Для линии там бумага, для залитой фигуры —
  // чернила. Эвристика промахнётся на сильно вогнутых фигурах (центр бокса
  // вне самой фигуры) — тогда правится вручную в art.json.
  const { data, info } = grey;
  const sampleDark = (x: number, y: number): boolean => {
    const px = Math.min(info.width - 1, Math.max(0, Math.round(x)));
    const py = Math.min(info.height - 1, Math.max(0, Math.round(y)));
    return data[py * info.width + px] < threshold;
  };

  const contours: Contour[] = [];
  for (const sub of getSubpaths(d)) {
    const length = getLength(sub);
    if (length < minLength) continue; // мусор трассировки: точки, зазубрины
    const bbox = getBoundingBox(sub);
    contours.push({
      d: sub,
      length,
      bbox,
      // У графита заливки нет НИКОГДА: контур там очерчивает не фигуру, а
      // тёмную массу тона, и залитый разом он выбросил бы половину картинки за
      // один кадр. Тон приносит штриховка.
      solid: mode === "graphite" ? false : sampleDark((bbox.x1 + bbox.x2) / 2, (bbox.y1 + bbox.y2) / 2),
    });
  }
  if (contours.length === 0) {
    throw new Error(
      `${path.basename(file)}: после фильтра не осталось контуров. ` +
        `Картинка слишком светлая или это не line-art — проверь threshold/minLength.`,
    );
  }

  /**
   * Остатки светлой каймы. `trimLightBorder` срезает только ряды, где светлого
   * подавляющее большинство, и переживают обрезку две формы:
   *   • рамка по всему периметру — даёт длиннющий контур вокруг кадра, и рука
   *     начинала бы с обводки прямоугольника;
   *   • ЛОСКУТ вдоль одной стороны — узкая полоска, прижатая к краю. В ролике
   *     она открывала кусок фона в углу картинки, будто там что-то нарисовано.
   *
   * Отбрасываем только в полярности «светлое на тёмном»: там фон у краёв тёмный
   * по построению, и светлое, прилипшее к кромке, — заведомо артефакт. У
   * «тёмного на светлом» так выглядит нормальный объект, и трогать его нельзя.
   */
  const EDGE = 0.01;
  /**
   * Мелочь относительно ГЛАВНОГО контура, а не относительно кадра: порог по
   * абсолютной толщине не ловил лоскут 56×270 на холсте 1024, а по площади он
   * составляет 3% от диска Луны — то есть заведомо не сюжет.
   */
  const SCRAP_AREA = 0.12;
  const maxArea = Math.max(...contours.map((c) => c.bbox.width * c.bbox.height));
  const edgeArtifact = (c: Contour): boolean => {
    if (blackOnWhite) return false;
    const touchesEdge =
      c.bbox.x1 <= vw * EDGE || c.bbox.y1 <= vh * EDGE || c.bbox.x2 >= vw * (1 - EDGE) || c.bbox.y2 >= vh * (1 - EDGE);
    if (!touchesEdge) return false;
    const frame =
      c.bbox.x1 <= vw * EDGE &&
      c.bbox.y1 <= vh * EDGE &&
      c.bbox.x2 >= vw * (1 - EDGE) &&
      c.bbox.y2 >= vh * (1 - EDGE);
    return frame || c.bbox.width * c.bbox.height < maxArea * SCRAP_AREA;
  };
  const artifacts = contours.filter(edgeArtifact).length;
  if (artifacts > 0 && artifacts < contours.length) {
    contours.splice(0, contours.length, ...contours.filter((c) => !edgeArtifact(c)));
  }

  // Лишние контуры отбрасываем ПО ДЛИНЕ, до сортировки в порядок рисования:
  // у графита их десятки, и рисовать надо главные формы. Безопасно это только
  // во второй фазе — то, что не обвели, откроет штриховка.
  const kept =
    contours.length > maxContours
      ? [...contours].sort((a, b) => b.length - a.length).slice(0, maxContours)
      : contours;

  const ordered = orderContours(kept);
  // Границы рисунка считаем ПО ПИКСЕЛЯМ, а не по оставленным контурам: у графита
  // тон выходит далеко за главные формы, и посадка по контурам обрезала бы его.
  const inkBox =
    mode === "graphite"
      ? contentBox(grey, opts.paperLevel ?? estimatePaperLevel(grey))
      : (() => {
          const box = {
            x: Math.min(...kept.map((c) => c.bbox.x1)),
            y: Math.min(...kept.map((c) => c.bbox.y1)),
            w: 0,
            h: 0,
          };
          box.w = Math.max(...kept.map((c) => c.bbox.x2)) - box.x;
          box.h = Math.max(...kept.map((c) => c.bbox.y2)) - box.y;
          return box;
        })();

  return { width: vw, height: vh, viewBox: vb, contours: ordered, inkBox };
}

export type Raster = { data: Buffer | Uint8Array; info: { width: number; height: number } };

/** Тесный бокс по всему, что темнее бумаги. */
function contentBox(raster: Raster, paperLevel: number): { x: number; y: number; w: number; h: number } {
  const { data, info } = raster;
  let x1 = info.width;
  let y1 = info.height;
  let x2 = -1;
  let y2 = -1;
  for (let y = 0; y < info.height; y++) {
    const row = y * info.width;
    for (let x = 0; x < info.width; x++) {
      if (data[row + x] >= paperLevel) continue;
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;
    }
  }
  if (x2 < 0) return { x: 0, y: 0, w: info.width, h: info.height };
  return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
}

/**
 * Детерминированный ГПСЧ: и волна штриховки, и дрожание акцентов должны быть
 * одинаковыми в `still` и в полном рендере, иначе кадры разойдутся.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ShadingPlan = {
  /** Штрихи серпантина в порядке рисования. */
  strokes: { d: string; length: number }[];
  /** Толщина пера маски для них, в единицах viewBox. */
  penWidth: number;
};

export type ShadingOptions = {
  /** Граница «фон / рисунок». `ALL_CONTENT` — закрашивать весь кадр. */
  paperLevel?: number;
  /** Толщина пера в долях большей стороны растра. */
  widthRatio?: number;
  /** Шаг строк в долях толщины пера. Меньше 1 — строки перекрываются. */
  gapRatio?: number;
  /** Потолок числа строк: каждая строка — свой слот кадров. */
  maxRows?: number;
};

/**
 * `maxRows` — не про качество, а про бюджет кадров: каждая полоса это свой
 * слот, и 18 полос поверх обводки не влезали в четырёхсекундную фразу даже по
 * минимуму в 3 кадра на штрих. Уменьшать безопасно: шаг пересчитывается под
 * фактическое число полос, а перо шире шага, так что рисунок всё равно
 * закрывается целиком.
 */
const SHADING_DEFAULTS = { widthRatio: 0.08, gapRatio: 0.8, maxRows: 14 } as const;

/**
 * ВТОРАЯ ФАЗА РИСОВАНИЯ: серпантин широким пером по площади рисунка.
 *
 * Обводка контуров открывает картинку только вдоль линий — для плоского
 * line-art этого достаточно (всё остальное там бумага), для карандашного тона
 * нет. Поэтому после обводки рука растушёвывает: идёт строками сверху вниз,
 * разворачиваясь на краях, и маска открывает полосу за полосой.
 *
 * Три вещи, без которых это выглядит шторкой, а не рукой:
 *   1. строка идёт ТОЛЬКО по фактическому размаху рисунка в этой полосе (скан
 *      пикселей), иначе рука возит пером по чистой бумаге;
 *   2. пустые полосы пропускаются целиком;
 *   3. направление чередуется — конец строки лежит над началом следующей, и
 *      перелёт между ними короткий, как у настоящей растушёвки.
 */
export function planShading(raster: Raster, opts: ShadingOptions = {}): ShadingPlan {
  const { widthRatio, gapRatio, maxRows } = { ...SHADING_DEFAULTS, ...opts };
  const { data, info } = raster;
  const paperLevel = opts.paperLevel ?? estimatePaperLevel(raster);

  const box = contentBox(raster, paperLevel);
  const penWidth = Math.max(8, Math.round(Math.max(info.width, info.height) * widthRatio));
  const step = Math.max(4, penWidth * gapRatio);
  const rows = Math.min(maxRows, Math.max(1, Math.ceil(box.h / step)));
  // Шаг пересчитываем под фактическое число строк: упёршись в потолок, полосы
  // должны стать шире и всё равно накрыть рисунок целиком.
  const pitch = box.h / rows;

  const rnd = mulberry32(0x5eed);
  const strokes: ShadingPlan["strokes"] = [];

  for (let i = 0; i < rows; i++) {
    const top = Math.floor(box.y + i * pitch);
    const bottom = Math.min(info.height - 1, Math.ceil(box.y + (i + 1) * pitch) - 1);

    let x1 = info.width;
    let x2 = -1;
    for (let y = top; y <= bottom; y++) {
      const row = y * info.width;
      for (let x = 0; x < info.width; x++) {
        if (data[row + x] >= paperLevel) continue;
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
      }
    }
    if (x2 < 0) continue; // полоса пустая — руке тут делать нечего

    const y = (top + bottom) / 2;
    // Запас на полперa по краям: иначе у самой кромки рисунка остаётся
    // неоткрытая полоска шириной в половину пера.
    const from = Math.max(0, x1 - penWidth * 0.3);
    const to = Math.min(info.width, x2 + penWidth * 0.3);
    const leftToRight = strokes.length % 2 === 0;
    const [sx, ex] = leftToRight ? [from, to] : [to, from];

    const SEGMENTS = 6;
    const pts: { x: number; y: number }[] = [];
    for (let s = 0; s <= SEGMENTS; s++) {
      const t = s / SEGMENTS;
      // Волна вдоль строки. Идеально прямая линия читается как шторка, а не как
      // карандаш; амплитуда в четверть шага, чтобы полосы всё равно смыкались.
      const wave = s === 0 || s === SEGMENTS ? 0 : (rnd() - 0.5) * pitch * 0.25;
      pts.push({ x: sx + (ex - sx) * t, y: y + wave });
    }

    let length = 0;
    for (let s = 1; s < pts.length; s++) {
      length += Math.hypot(pts[s].x - pts[s - 1].x, pts[s].y - pts[s - 1].y);
    }
    const d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} ${pts
      .slice(1)
      .map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ")}`;
    strokes.push({ d, length });
  }

  return { strokes, penWidth };
}

/**
 * Обрезает картинку по САМОМУ РИСУНКУ, ПЕРЕЗАПИСЫВАЯ файл.
 *
 * Для рисунка на бумаге это правильный способ убрать поля, а `trimLightBorder`
 * — неправильный: тот отшелушивает светлые ряды с краю и останавливается на
 * первом же тёмном, а генератор регулярно кладёт по кромке лёгкую виньетку.
 * Одного такого ряда хватало, чтобы поля не срезались вовсе.
 *
 * Для залитого фона, наоборот, годится только `trimLightBorder`: там «поля» это
 * СВЕТЛАЯ кайма вокруг тёмного кадра, и по содержимому её не отличить.
 */
export async function cropToContent(
  file: string,
  paperLevel: number,
  padFraction = 0.02,
): Promise<{ cropped: boolean; width: number; height: number }> {
  const source = await fs.readFile(file);
  const raster = await sharp(source)
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { info } = raster;
  const box = contentBox(raster, paperLevel);

  const pad = Math.round(Math.min(info.width, info.height) * padFraction);
  const left = Math.max(0, box.x - pad);
  const top = Math.max(0, box.y - pad);
  const width = Math.min(info.width - left, box.w + pad * 2);
  const height = Math.min(info.height - top, box.h + pad * 2);

  if (width >= info.width && height >= info.height) {
    return { cropped: false, width: info.width, height: info.height };
  }
  const buf = await sharp(source).extract({ left, top, width, height }).png().toBuffer();
  await fs.writeFile(file, buf);
  return { cropped: true, width, height };
}

/**
 * Переводит бумагу картинки в прозрачность, ПЕРЕЗАПИСЫВАЯ файл.
 *
 * Зачем. У графитного рисунка «на бумаге» генератор отдаёт свой лист — чуть
 * кремовый и с зерном. На доске он ложится ВИДИМЫМ ПРЯМОУГОЛЬНИКОМ: холст
 * картинки всегда заметно больше самого рисунка, и этот прямоугольник закрывал
 * соседнюю надпись, а при качании от клика перчаткой поворачивался целиком.
 *
 * Прозрачность делается мягкой: у карандаша тон уходит в бумагу плавно, и
 * жёсткий порог обрубил бы светлые полутона ступенькой. Светлое становится
 * полупрозрачным — ровно так графит и лежит на настоящем листе.
 *
 * Картинкам с залитым фоном это НЕ делается: там заливка и есть содержание.
 */
export async function keyPaperToAlpha(file: string, paperLevel: number): Promise<void> {
  const source = await fs.readFile(file);
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  // Ниже этой яркости пиксель непрозрачен целиком; между ней и бумагой — рампа.
  const solid = Math.max(0, paperLevel - 45);

  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    if (lum >= paperLevel) data[o + 3] = 0;
    else if (lum > solid) data[o + 3] = Math.round(data[o + 3] * ((paperLevel - lum) / (paperLevel - solid)));
  }

  await sharp(data, { raw: { width, height, channels } }).png().toFile(file);
}

/**
 * Растр в градациях серого — вход для `planShading` и сканов по содержимому.
 *
 * `flatten` перед `greyscale` обязателен, и это не про внешний вид. У картинки
 * с альфой (а `keyPaperToAlpha` делает такими все рисунки на бумаге)
 * `greyscale().raw()` отдаёт ДВА канала на пиксель — серый и альфу, — и любой
 * скан вида `data[y * width + x]` читает мусор через раз. Ловится это не
 * ошибкой, а тем, что обрезка полей молча перестаёт срабатывать.
 *
 * Сведение на белый заодно делает всё идемпотентным: прозрачная бумага читается
 * как белая бумага, то есть повторный прогон даёт те же числа.
 */
export async function readGrey(file: string): Promise<Raster> {
  return sharp(file)
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

/**
 * Срезает светлую кайму у картинки с залитым фоном, ПЕРЕЗАПИСЫВАЯ файл.
 *
 * Генератор регулярно оставляет вокруг тёмной заливки светлую полоску, хотя
 * промпт прямо просит бликовать до краёв. Для трассировки это фатально: самый
 * длинный светлый контур — эта самая рамка, и рука первым делом обводит
 * прямоугольник по периметру кадра, а посадка по чернилам считает полями весь
 * кадр. Обрезка идемпотентна: на уже обрезанной картинке светлых рядов нет.
 *
 * Правим ИСХОДНИК, а не нормализованную копию: рендер показывает исходник, и
 * геометрия трассировки должна совпадать с ним пиксель в пиксель.
 */
export async function trimLightBorder(
  file: string,
  /**
   * Сколько площади должно остаться, иначе обрезка считается ошибкой. Для
   * залитого фона это страховка (там «каймой» не может быть половина кадра),
   * а для рисунка на бумаге поля бывают и в 80% кадра — туда передают малое.
   */
  minAreaFraction = 0.5,
): Promise<{ trimmed: boolean; width: number; height: number }> {
  // Файл читаем в память ЦЕЛИКОМ: sharp держит дескриптор открытым лениво, и
  // запись поверх собственного источника падает на Windows с UNKNOWN errno.
  const source = await fs.readFile(file);
  // flatten — по той же причине, что и в readGrey: с альфой каналов два.
  const { data, info } = await sharp(source)
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const LIGHT = 200;
  /** Ряд считается каймой, если светлых пикселей в нём подавляющее большинство. */
  const isLightRow = (y: number): boolean => {
    let light = 0;
    for (let x = 0; x < info.width; x++) if (data[y * info.width + x] > LIGHT) light++;
    return light > info.width * 0.9;
  };
  const isLightCol = (x: number): boolean => {
    let light = 0;
    for (let y = 0; y < info.height; y++) if (data[y * info.width + x] > LIGHT) light++;
    return light > info.height * 0.9;
  };

  let top = 0;
  let bottom = info.height - 1;
  let left = 0;
  let right = info.width - 1;
  while (top < bottom && isLightRow(top)) top++;
  while (bottom > top && isLightRow(bottom)) bottom--;
  while (left < right && isLightCol(left)) left++;
  while (right > left && isLightCol(right)) right--;

  const w = right - left + 1;
  const h = bottom - top + 1;
  if (
    (top === 0 && left === 0 && w === info.width && h === info.height) ||
    w * h < info.width * info.height * minAreaFraction
  ) {
    return { trimmed: false, width: info.width, height: info.height };
  }

  const buf = await sharp(source).extract({ left, top, width: w, height: h }).png().toBuffer();
  await fs.writeFile(file, buf);
  return { trimmed: true, width: w, height: h };
}

/**
 * Порядок рисования. Три корзины по значимости (скелет → деталь → мелочь),
 * внутри корзины — как ведёт руку человек: сверху вниз, слева направо.
 *
 * Полосы вместо чистой сортировки по y: у почти-одинаковых по высоте объектов
 * шум в пару пикселей иначе переставлял бы их случайным образом, и порядок
 * менялся бы при каждой перегенерации картинки.
 */
export function orderContours(contours: Contour[]): Contour[] {
  const maxLen = Math.max(...contours.map((c) => c.length));
  const maxArea = Math.max(...contours.map((c) => c.bbox.width * c.bbox.height));
  const totalLen = contours.reduce((s, c) => s + c.length, 0);

  const height = Math.max(...contours.map((c) => c.bbox.y2)) - Math.min(...contours.map((c) => c.bbox.y1));
  const band = Math.max(1, height / 4);

  const bucket = (c: Contour): number => {
    const area = c.bbox.width * c.bbox.height;
    if (area >= 0.45 * maxArea || c.length >= 0.45 * maxLen) return 0;
    if (c.length >= 0.06 * totalLen) return 1;
    return 2;
  };

  return contours
    .map((c, i) => ({ c, i, b: bucket(c), band: Math.round(c.bbox.y1 / band), x: c.bbox.x1 }))
    .sort((a, z) => a.b - z.b || a.band - z.band || a.x - z.x || a.i - z.i)
    .map((r) => r.c);
}

/**
 * Вырезает белый фон в альфу и находит кончик маркера.
 *
 * Зачем альфа: рука должна ПЕРЕКРЫВАТЬ нарисованное, как в референсе. С белым
 * прямоугольником вокруг она стирала бы доску под собой.
 *
 * Порог мягкий, а не бинарный: у сгенерированной руки под кистью лежит мягкая
 * контактная тень, и жёсткое отсечение либо срезало бы её начисто, либо
 * оставило серый ореол. Плавный переход в диапазоне почти-белого превращает
 * тень в полупрозрачную — ровно так она и должна ложиться на бумагу.
 *
 * Кончик ищется как самый ЛЕВЫЙ тёмный пиксель: фетровый нос маркера темнее
 * и корпуса, и кожи, а левее него на картинке нет ничего. У перчатки-курсора
 * палец смотрит вверх, и там ищется самый ВЕРХНИЙ (`tip: "top"`).
 */
export async function cutoutHand(
  src: string,
  dest: string,
  tip: "left" | "top" = "left",
): Promise<{ width: number; height: number; tipX: number; tipY: number }> {
  const img = sharp(src).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  /**
   * Фон ищем ЗАЛИВКОЙ ОТ ГРАНИЦ, а не порогом яркости. У сгенерированной руки
   * фон не идеально белый: по краям лежит лёгкая виньетка, и абсолютный порог
   * оставлял вокруг кисти светлый прямоугольник — он был отчётливо виден на
   * бумаге. Связность решает это без подбора чисел: всё светлое, что дотянулось
   * до края кадра, — фон; светлое внутри кисти (блик на маркере) остаётся.
   */
  const BG_MIN = 228; // светлее этого и связано с краем → фон
  const SOLID = 205; // темнее этого → объект целиком
  const DARK = 96; // фетр носа темнее корпуса маркера (~#7b8288)
  /**
   * Затухание по краям кадра, в долях меньшей стороны.
   *
   * Предплечье уходит за границу картинки, и на доске рука обрывалась ПРЯМЫМ
   * СРЕЗОМ ровно там, где кончается PNG, — посреди белого листа это читается
   * как обрезанная фотография. Плавный сход альфы у самой кромки превращает
   * срез в «рука уходит из кадра». Кисти и инструмента это не касается: они
   * лежат далеко от краёв.
   */
  const EDGE_FADE = 0.07;

  const lum = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    lum[i] = Math.round(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]);
  }

  const isBg = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!isBg[i] && lum[i] >= BG_MIN) {
      isBg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }

  let tipX = 0;
  let tipY = 0;
  let bestScore = Infinity;

  const fade = Math.max(1, Math.round(Math.min(width, height) * EDGE_FADE));
  /** 0 у самой кромки кадра, 1 глубже `fade` пикселей от неё. */
  const edgeAlpha = (x: number, y: number): number => {
    const d = Math.min(x, y, width - 1 - x, height - 1 - y);
    return d >= fade ? 1 : d / fade;
  };

  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    if (isBg[i]) {
      data[o + 3] = 0;
    } else if (lum[i] > SOLID) {
      // Бахрома антиалиасинга и мягкая контактная тень: плавная альфа, иначе
      // по краю кисти идёт лесенка, а тень обрывается ступенькой.
      data[o + 3] = Math.round(255 * Math.min(1, (BG_MIN - lum[i]) / (BG_MIN - SOLID)));
    } else {
      data[o + 3] = 255;
    }

    {
      const x = i % width;
      const y = (i - x) / width;
      const k = edgeAlpha(x, y);
      if (k < 1) data[o + 3] = Math.round(data[o + 3] * k);
    }

    if (lum[i] < DARK) {
      const x = i % width;
      const y = (i - x) / width;
      // Крайняя левая тёмная точка (при равенстве x — верхняя) либо, для
      // перчатки с поднятым пальцем, крайняя верхняя.
      const score = tip === "top" ? y * 4 + x : x * 4 + y;
      if (score < bestScore) {
        bestScore = score;
        tipX = x;
        tipY = y;
      }
    }
  }

  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile(dest);

  return { width, height, tipX: tipX / width, tipY: tipY / height };
}

/**
 * Сажает рисунок в заданный прямоугольник доски ПО ЧЕРНИЛАМ, а не по холсту.
 *
 * Генераторы почти всегда оставляют вокруг объекта широкие поля (мы сами просим
 * «generous white margin», иначе картинка липнет к краю). Если масштабировать по
 * холсту, объект выходит вдвое мельче задуманного и кадр выглядит пустым —
 * ровно та жалоба, из-за которой первая проба не прошла гейт.
 *
 * Возвращает `box`/`transform` для элемента: сам растр не трогаем, двигаем окно.
 */
export function fitInkToBox(
  art: Pick<TracedArtwork, "width" | "height" | "inkBox">,
  target: { x: number; y: number; w: number; h: number },
): { box: { x: number; y: number; w: number; h: number }; transform: { tx: number; ty: number; scale: number } } {
  const scale = Math.min(target.w / art.inkBox.w, target.h / art.inkBox.h);
  // Центрируем чернила внутри целевого прямоугольника.
  const padX = (target.w - art.inkBox.w * scale) / 2;
  const padY = (target.h - art.inkBox.h * scale) / 2;
  const tx = target.x + padX - art.inkBox.x * scale;
  const ty = target.y + padY - art.inkBox.y * scale;
  return {
    box: { x: tx, y: ty, w: art.width * scale, h: art.height * scale },
    transform: { tx, ty, scale },
  };
}

/** Записывает JSON с отступами — файлы читаются глазами при отладке раскладки. */
export async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

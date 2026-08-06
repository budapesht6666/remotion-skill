/**
 * Векторизация растрового line-art в контуры, пригодные как штрихи маски.
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

export type TraceOptions = {
  /** Порог бинаризации 0…255. Ниже — тоньше линия. */
  threshold?: number;
  /** Крапинки мельче этого (в пикселях площади) выбрасываются. */
  turdSize?: number;
  /** Контуры короче этого (в px длины) выбрасываются как мусор трассировки. */
  minLength?: number;
};

const DEFAULTS = { threshold: 160, turdSize: 12, minLength: 24 } as const;

/**
 * Готовит растр к трассировке: убирает альфу на белый (генераторы часто отдают
 * PNG с прозрачностью, и potrace принял бы прозрачное за чёрное), гасит
 * полутона и лёгкий шум JPEG-подобных артефактов.
 */
export async function normalizeArtwork(src: string, dest: string): Promise<{ width: number; height: number }> {
  const img = sharp(src).flatten({ background: "#ffffff" }).greyscale().normalise();
  const meta = await img.metadata();
  await img.toFile(dest);
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

/** Трассирует нормализованный растр в контуры. */
export async function traceArtwork(file: string, opts: TraceOptions = {}): Promise<TracedArtwork> {
  const { threshold, turdSize, minLength } = { ...DEFAULTS, ...opts };

  const svg = await new Promise<string>((resolve, reject) => {
    potrace.trace(
      file,
      { threshold, turdSize, alphaMax: 1, optCurve: true, optTolerance: 0.3, blackOnWhite: true },
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
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
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
      solid: sampleDark((bbox.x1 + bbox.x2) / 2, (bbox.y1 + bbox.y2) / 2),
    });
  }
  if (contours.length === 0) {
    throw new Error(
      `${path.basename(file)}: после фильтра не осталось контуров. ` +
        `Картинка слишком светлая или это не line-art — проверь threshold/minLength.`,
    );
  }

  const ordered = orderContours(contours);
  const inkBox = {
    x: Math.min(...contours.map((c) => c.bbox.x1)),
    y: Math.min(...contours.map((c) => c.bbox.y1)),
    w: 0,
    h: 0,
  };
  inkBox.w = Math.max(...contours.map((c) => c.bbox.x2)) - inkBox.x;
  inkBox.h = Math.max(...contours.map((c) => c.bbox.y2)) - inkBox.y;

  return { width: vw, height: vh, viewBox: vb, contours: ordered, inkBox };
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
 * и корпуса, и кожи, а левее него на картинке нет ничего.
 */
export async function cutoutHand(
  src: string,
  dest: string,
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

    if (lum[i] < DARK) {
      const x = i % width;
      const y = (i - x) / width;
      // Ищем крайнюю левую тёмную точку; при равенстве x берём верхнюю.
      const score = x * 4 + y;
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

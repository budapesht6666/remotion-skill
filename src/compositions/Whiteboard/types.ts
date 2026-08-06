/**
 * Модель доски. Единственный источник правды: импортируется и сценарием
 * (`script.ts`), и компилятором (`scripts/compile-board.ts`), и композицией.
 * Дублировать её по трём местам, как сделано у `cut-broll`, здесь нельзя —
 * модель большая, рассинхрон гарантирован.
 *
 * Делится на два слоя:
 *   АВТОРСКИЙ  — что человек пишет руками в script.ts;
 *   СОБРАННЫЙ  — что компилятор кладёт в board.json и читает композиция.
 * В собранном слое нет ни одной величины, которую рендер должен был бы
 * досчитывать по геометрии путей: длины, боксы, кадры — всё посчитано в Node.
 */

// ─────────────────────────── АВТОРСКИЙ СЛОЙ ───────────────────────────

/** Фраза закадрового монолога. Формат 1-в-1 совместим с `npm run vo`. */
export type Phrase = {
  id: string;
  speaker: string;
  /** Ударение — комбинируемый акут U+0301 прямо в строке («пче́ла»). */
  line: string;
  /** Пауза ПОСЛЕ фразы, c. Рисование в паузе продолжается. */
  gap?: number;
};

export type Rect = { x: number; y: number; w: number; h: number };

type ItemBase = {
  /** Уникальный id: на него ссылаются акценты, им же зовётся файл картинки. */
  id: string;
  /** id фразы из SCRIPT, под которую рисуется элемент. */
  line: string;
  /** Экран доски, 0 — первый. Камера прокручивается на экран элемента. */
  screen: number;
  /** Доля бюджета фразы между её элементами. По умолчанию 1. */
  weight?: number;
  /** Кадры выдержки в хвосте слота: элемент дорисован, рука уже поехала дальше. */
  hold?: number;
  /** Зачем элемент в кадре — для читаемости сценария. */
  note?: string;
};

/**
 * Растровая иллюстрация. Генерится по `subject`, проявляется через маску по
 * собственным контурам.
 *
 * `rect` — прямоугольник ЧЕРНИЛ внутри экрана (0…1080 / 0…1920), а не холста
 * картинки: генератор всегда оставляет широкие поля, и посадка идёт по чернилам
 * (`fitInkToBox`), иначе объект выходит вдвое мельче задуманного.
 */
export type ArtItem = ItemBase & {
  kind: "art";
  /** Сюжет для генератора. Стиль подставляется в scripts/lib/gen-image.ts. */
  subject: string;
  rect: Rect;
  aspect?: "1:1" | "4:3" | "3:4";
};

/**
 * Надпись. Переносы ТОЛЬКО вручную через `\n`: метрик шрифта в Node нет,
 * автопереноса не будет.
 *
 * Держите надписи короткими. Авто-дубляж YouTube переводит только звук —
 * нарисованное на доске останется на языке оригинала поверх чужой озвучки.
 */
export type TextItem = ItemBase & {
  kind: "text";
  text: string;
  x: number;
  y: number;
  size?: number;
  color?: string;
  /**
   * По умолчанию `sans` (печатный) — так в референсе. Текст открывается
   * протяжкой, то есть рука его закрашивает; рукописный `hand` под протяжкой
   * выглядит подделкой почерка. Берите `hand` только для коротких акцентов,
   * где протяжка почти мгновенна.
   */
  font?: "hand" | "sans";
  align?: "left" | "center";
};

/** Маркерный акцент вокруг другого элемента: обводка, подчёркивание, рамка. */
export type AccentItem = ItemBase & {
  kind: "accent";
  /** id элемента, вокруг которого рисуется акцент. Своих координат нет. */
  target: string;
  style: "circle" | "underline" | "box";
  color?: string;
  strokeWidth?: number;
  padding?: number;
  /** Детерминизм дрожания: без него `still` и полный рендер разойдутся. */
  seed?: number;
};

export type BoardItem = ArtItem | TextItem | AccentItem;

// ─────────────────────────── СОБРАННЫЙ СЛОЙ ───────────────────────────

/** Один штрих. `length` посчитан в Node — рендер НИКОГДА не зовёт getLength. */
export type Stroke = {
  d: string;
  length: number;
  /** Глобальный кадр начала. */
  from: number;
  frames: number;
  /**
   * Только для `masked-art`: контур обводит сплошную фигуру. Дорисованный такой
   * контур в маске ещё и заливается, иначе у залитой стрелки открылась бы одна
   * кромка, а середина осталась бы скрытой.
   */
  fill?: boolean;
};

type CompiledBase = {
  id: string;
  line: string;
  screen: number;
  /** Локальная система координат путей, напр. "0 0 1024 1024". */
  viewBox: string;
  /** Куда элемент кладётся на доску, px. */
  box: Rect;
  /** Локальные → доска: board = t + scale * local. Нужен, чтобы вести перо. */
  transform: { tx: number; ty: number; scale: number };
  strokes: Stroke[];
};

/** Элемент, нарисованный краской: акценты, стрелки, рамки. */
export type StrokesElement = CompiledBase & {
  render: "strokes";
  color: string;
  /** Толщина в ЛОКАЛЬНЫХ единицах viewBox (экранные px делятся на scale). */
  strokeWidth: number;
};

/** Растр, проявляющийся через маску по своим же контурам. */
export type MaskedArtElement = CompiledBase & {
  render: "masked-art";
  /** Путь внутри public/, напр. "whiteboard/art/Demo/monitor.png". */
  src: string;
  /**
   * Толщина пера маски в ЛОКАЛЬНЫХ единицах. Заметно больше толщины линии
   * рисунка, иначе обводка контура откроет половину штриха и останется кромка.
   */
  maskWidth: number;
};

/**
 * Надпись: проявляется горизонтальной протяжкой, рука едет по строке.
 *
 * Строки живут в общей схеме штрихов: `strokes[i]` — прямой отрезок слева
 * направо по i-й строке. Благодаря этому текст не требует ни отдельного поиска
 * активного элемента, ни своей математики пера: рука ведёт его ровно так же,
 * как контур рисунка, а прогресс штриха и есть доля написанной строки.
 */
export type TextElement = CompiledBase & {
  render: "text";
  color: string;
  fontSize: number;
  font: "hand" | "sans";
  align: "left" | "center";
  /** i-я строка соответствует i-му штриху. */
  lines: { text: string; top: number; width: number }[];
};

export type BoardElement = StrokesElement | MaskedArtElement | TextElement;

/** transform: translate(x, y) scale(s); transformOrigin: "0 0". */
export type CameraMove = {
  from: number;
  to: number;
  yFrom: number;
  yTo: number;
};

export type NarrationWord = { w: string; s: number; e: number };
export type NarrationPhrase = {
  id: string;
  line: string;
  start: number;
  end: number;
  words: NarrationWord[];
};

export type BoardManifest = {
  /** Пустая строка — ролик без голоса. Не null: пропсы редактируются в студии. */
  narrationFile: string;
  durationInFrames: number;
  board: { width: number; height: number; screens: number; screenStep: number };
  elements: BoardElement[];
  camera: CameraMove[];
  phrases: NarrationPhrase[];
  hand: { exitFrom: number; exitFrames: number };
};

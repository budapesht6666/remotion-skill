/**
 * Сценарий DogWalk поверх монтажного листа edit.json.
 *
 * Время каждого события — пара «план + секунда от начала плана», а не абсолютная
 * секунда ролика: план можно удлинить или переставить в edit.json, и всё, что на
 * нём висит, переедет вместе с ним. Координаты — пиксели кадра 1080×1920.
 */
export type ShotId =
  | "hook" | "hookFreeze" | "rewind" | "selfie" | "street1" | "street2" | "street3"
  | "nietzsche" | "nietzscheCard" | "chaos" | "slam" | "hug" | "beg" | "hop" | "jump"
  | "woodpecker" | "woodpeckerCard" | "bag" | "leaves" | "lemons" | "pomelo" | "lanterns"
  | "ending";

export type At = { shot: ShotId; at: number };

/** Надпись сверху крупно: подводка, заголовок сцены. */
export type Title = At & { dur: number; text: string; y?: number; size?: number };
/** Живая реплика из ролика: субтитр в кавычках-ёлочках. */
export type Caption = At & { dur: number; text: string };
/** Наклейка с текстом: пружинит при появлении, чуть повёрнута. */
export type Sticker = At & {
  dur: number;
  text: string;
  x: number;
  y: number;
  rot?: number;
  size?: number;
  bg?: string;
  color?: string;
  small?: string;
};
/** Нарисованная стрелка с подписью у хвоста. */
export type Arrow = At & {
  dur: number;
  from: [number, number];
  to: [number, number];
  bend?: number;
  label?: string;
  labelAt?: [number, number];
  /** Цель движется: ключи острия по времени плана; хвост и подпись едут следом. */
  track?: { t: number; x: number; y: number }[];
};
/** Карточка персонажа на стоп-кадре. */
export type NameCard = At & { dur: number; name: string; role: string; quote: string; color: string };
/** Штамп поперёк кадра. */
export type Stamp = At & { dur: number; text: string; color: string; y?: number; rot?: number; size?: number };
/** Таблички судей. */
export type Scores = At & { dur: number; values: string[]; note?: string };
/** Чек-лист плана: строки появляются и зачёркиваются в своё время. */
export type ChecklistItem = { text: string; show: At; cross?: At };
export type Checklist = { from: At; to: At; title: string; items: ChecklistItem[] };
/** Линии скорости в стиле аниме. */
export type Speedlines = At & { dur: number };
/** Удар зумом по видео плана и вспышка. */
export type Punch = At & { scale?: number; flash?: boolean; shake?: boolean };
/** Размытие прямоугольника (номера машин) по ключам внутри плана. */
export type BlurBox = { shot: ShotId; keys: { t: number; x: number; y: number; w: number; h: number }[] };
/** Звук из public/clips/DogWalk/sfx. */
export type Sfx = At & { name: string; volume?: number; dur?: number };

export const titles: Title[] = [
  { shot: "hook", at: 0, dur: 1.4, text: "Вышли тихо погулять под дождём…" },
  { shot: "rewind", at: 0, dur: 0.75, text: "◀◀ 10 минут назад", y: 860, size: 92 },
  { shot: "selfie", at: 0.15, dur: 2.15, text: "Пасмурно. Дождь. Красота." },
  { shot: "chaos", at: 1.7, dur: 3.2, text: "Философ выбрал ХАОС 🌀" },
  { shot: "slam", at: 0, dur: 1.3, text: "Повторим в замедлении 🎬" },
  { shot: "hop", at: 0, dur: 1.2, text: "Разминка…" },
  { shot: "jump", at: 0, dur: 1.5, text: "Прыжок за вкусняшкой" },
  { shot: "leaves", at: 0.15, dur: 2.0, text: "…и ушёл к другому 💔" },
  { shot: "ending", at: 0.2, dur: 2.8, text: "Мокрые. Грязные. Счастливые." },
];

export const captions: Caption[] = [
  { shot: "hook", at: 0.0, dur: 1.4, text: "Нет-нет-нет!" },
  { shot: "nietzsche", at: 1.5, dur: 1.1, text: "Ницше!" },
  { shot: "chaos", at: 0.55, dur: 0.9, text: "Нет!" },
  { shot: "chaos", at: 2.95, dur: 1.0, text: "Фу! Фу!" },
  { shot: "slam", at: 0.1, dur: 2.1, text: "Нееее-еееет…" },
  { shot: "hug", at: 0.2, dur: 1.5, text: "Всё, успокойся!" },
  { shot: "beg", at: 0.2, dur: 1.5, text: "Собака-бабака" },
  { shot: "woodpecker", at: 1.3, dur: 1.1, text: "Привет!" },
];

export const stickers: Sticker[] = [
  { shot: "hookFreeze", at: 0.1, dur: 1.6, text: "Да, это Ницше 🐶", x: 540, y: 470, rot: -4, size: 84 },
  { shot: "hookFreeze", at: 0.65, dur: 1.05, text: "Сейчас объясню 👇", x: 560, y: 1230, rot: 3, size: 64, bg: "#ffd60a" },
  { shot: "selfie", at: 0.9, dur: 1.4, text: "уверен в плане 😎", x: 690, y: 1080, rot: -6, size: 56, bg: "#ffd60a" },
  { shot: "nietzsche", at: 1.6, dur: 1.0, text: "ТУРБОРЕЖИМ 🚀", x: 540, y: 1180, rot: -5, size: 76, bg: "#ff3b30", color: "#fff" },
  { shot: "slam", at: 1.45, dur: 0.75, text: "Поцелуй камеры: засчитан 💋", x: 540, y: 1200, rot: 4, size: 58, bg: "#ff8fab" },
  { shot: "hug", at: 1.8, dur: 1.1, text: "Объятия обязательны 🤗", x: 540, y: 520, rot: -3, size: 64 },
  {
    shot: "beg", at: 1.7, dur: 1.7, text: "Теперь он с нами. Навсегда*", x: 540, y: 520, rot: 2, size: 60,
    small: "*минут на пятнадцать",
  },
  { shot: "lemons", at: 0.05, dur: 0.85, text: "А мы нашли лимоны 🍋", x: 540, y: 1250, rot: -3, size: 66, bg: "#ffd60a" },
  { shot: "pomelo", at: 0.05, dur: 0.85, text: "помело с голову Ницше", x: 540, y: 1250, rot: 3, size: 64, bg: "#b7f171" },
  { shot: "lanterns", at: 0.05, dur: 0.85, text: "и цветы-фонарики 🏮", x: 540, y: 1250, rot: -2, size: 66, bg: "#ff8fab" },
];

export const arrows: Arrow[] = [
  { shot: "selfie", at: 0.9, dur: 1.4, from: [700, 1020], to: [760, 870], bend: -40 },
  {
    shot: "nietzsche", at: 0.15, dur: 1.35, from: [790, 1010], to: [545, 805], bend: 50,
    label: "⚠ приключение\nприближается", labelAt: [770, 1060],
  },
  {
    shot: "woodpecker", at: 0.25, dur: 1.0, from: [740, 880], to: [470, 660], bend: -50,
    label: "а это кто?", labelAt: [770, 920],
  },
  {
    // Пакет уезжает вниз кадра: камера идёт за собакой.
    shot: "bag", at: 0.3, dur: 1.6, from: [413, 900], to: [713, 1160], bend: -40,
    label: "🔍 досмотр пакета", labelAt: [400, 780],
    track: [
      { t: 0.3, x: 713, y: 1160 },
      { t: 1.2, x: 606, y: 1300 },
      { t: 1.9, x: 616, y: 1480 },
    ],
  },
];

export const nameCards: NameCard[] = [
  {
    shot: "nietzscheCard", at: 0.0, dur: 1.8, name: "НИЦШЕ", role: "уличный философ",
    quote: "«Что нас не убивает,\nделает нас мокрее»", color: "#ff9f1c",
  },
  {
    shot: "woodpeckerCard", at: 0.0, dur: 1.6, name: "ДЯТЕЛ", role: "охранник района",
    quote: "проверяет каждый пакет", color: "#4cc9f0",
  },
];

export const stamps: Stamp[] = [
  { shot: "bag", at: 2.0, dur: 1.0, text: "НЕ КОЛБАСА ❌", color: "#e63946", y: 760, rot: -8 },
  { shot: "ending", at: 1.6, dur: 1.4, text: "ПЛАН ПРОВАЛЕН ✅", color: "#2a9d8f", y: 1180, rot: -6, size: 78 },
];

export const scores: Scores[] = [
  { shot: "jump", at: 1.6, dur: 2.0, values: ["10", "10", "9.8"], note: "судья из Дананга придирается" },
];

export const checklist: Checklist = {
  from: { shot: "street1", at: 0 },
  to: { shot: "nietzsche", at: 1.5 },
  title: "ПЛАН НА ДЕНЬ",
  items: [
    { text: "тихо погулять ☔", show: { shot: "street1", at: 0.1 } },
    { text: "улицы пустые", show: { shot: "street1", at: 0.55 } },
    { text: "дождик", show: { shot: "street2", at: 0.25 } },
    { text: "никаких приключений", show: { shot: "street3", at: 0.15 }, cross: { shot: "nietzsche", at: 0.9 } },
  ],
};

export const speedlines: Speedlines[] = [{ shot: "nietzsche", at: 1.55, dur: 1.05 }];

export const punches: Punch[] = [
  { shot: "hookFreeze", at: 0, scale: 0.12, flash: true },
  { shot: "nietzscheCard", at: 0, scale: 0.08, flash: true },
  { shot: "slam", at: 1.4, scale: 0.15, shake: true },
  { shot: "woodpeckerCard", at: 0, scale: 0.08, flash: true },
  { shot: "bag", at: 2.0, scale: 0.08, shake: true },
];

/** Номер чёрной машины: ключи сняты по кадрам с сеткой (out/dogwalk/fr). */
export const blurs: BlurBox[] = [
  {
    shot: "chaos",
    keys: [
      { t: 1.0, x: 400, y: 90, w: 180, h: 120 },
      { t: 1.2, x: 410, y: 100, w: 170, h: 110 },
      { t: 1.4, x: 510, y: 0, w: 300, h: 90 },
      { t: 1.55, x: 600, y: -60, w: 300, h: 90 },
    ],
  },
  {
    shot: "hug",
    keys: [
      { t: 0.75, x: 320, y: 230, w: 120, h: 70 },
      { t: 0.9, x: 320, y: 235, w: 120, h: 70 },
      { t: 1.2, x: 215, y: 395, w: 140, h: 70 },
      { t: 1.5, x: 110, y: 550, w: 160, h: 70 },
      { t: 1.8, x: 105, y: 570, w: 170, h: 70 },
      { t: 2.1, x: 150, y: 625, w: 180, h: 70 },
      { t: 2.4, x: 180, y: 652, w: 190, h: 70 },
      { t: 2.7, x: 235, y: 688, w: 210, h: 70 },
      { t: 2.9, x: 312, y: 707, w: 210, h: 70 },
    ],
  },
];

export const sfx: Sfx[] = [
  { shot: "hook", at: 1.2, name: "boing", volume: 0.8 },
  { shot: "rewind", at: 0, name: "rewind", volume: 0.9 },
  { shot: "selfie", at: 0, name: "thunder", volume: 0.7, dur: 2.3 },
  { shot: "street1", at: 0, name: "rain", volume: 0.45, dur: 2.9 },
  { shot: "street1", at: 0.1, name: "check", volume: 0.6 },
  { shot: "street1", at: 0.55, name: "check", volume: 0.6 },
  { shot: "street2", at: 0.25, name: "check", volume: 0.6 },
  { shot: "street3", at: 0.15, name: "check", volume: 0.6 },
  { shot: "nietzsche", at: 0.9, name: "glitch", volume: 0.6 },
  { shot: "nietzsche", at: 1.55, name: "whoosh", volume: 0.8 },
  { shot: "nietzscheCard", at: 0, name: "braam", volume: 0.55 },
  { shot: "slam", at: 1.4, name: "boing", volume: 0.9 },
  { shot: "slam", at: 1.45, name: "dizzy", volume: 0.6 },
  { shot: "jump", at: 1.6, name: "pop", volume: 0.7 },
  { shot: "jump", at: 1.85, name: "pop", volume: 0.7 },
  { shot: "jump", at: 2.1, name: "pop", volume: 0.7 },
  { shot: "jump", at: 1.7, name: "cheer", volume: 0.55, dur: 2.0 },
  { shot: "woodpeckerCard", at: 0, name: "whoosh", volume: 0.8 },
  { shot: "bag", at: 2.0, name: "smack", volume: 0.9 },
  { shot: "leaves", at: 0.15, name: "trombone", volume: 0.7 },
  { shot: "lemons", at: 0, name: "pop", volume: 0.7 },
  { shot: "pomelo", at: 0, name: "pop", volume: 0.7 },
  { shot: "lanterns", at: 0, name: "pop", volume: 0.7 },
  { shot: "ending", at: 1.6, name: "smack", volume: 0.8 },
  { shot: "ending", at: 1.65, name: "confetti", volume: 0.7 },
];

/** Где лежит каждое фото в кадре (object-position) и куда едет наезд. */
export const photoFocus: Partial<Record<ShotId, string>> = {
  selfie: "60% 70%",
  lemons: "50% 40%",
  pomelo: "50% 70%",
  lanterns: "40% 40%",
};

/** Музыка: громкость подложки и провал под живые реплики и голос. */
export const MUSIC = { base: 0.2, duck: 0.07, fadeOut: 1.2 };

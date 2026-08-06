import type { Phrase, BoardItem } from "./types";

/**
 * ДЕМО-СЦЕНАРИЙ ДОСКИ — «что рыба умеет такого, чего не умеешь ты».
 *
 * Задача демо — прогнать механику целиком: составной экран (заголовок +
 * иллюстрация + подпись), прокрутка на следующий экран, закадровый монолог,
 * уход руки. Тема меняется правкой этого файла и `npm run art` — остальной
 * пайплайн от неё не зависит.
 *
 * Порядок сборки:
 *   npm run art   -- Whiteboard     # сгенерить и оттрассировать иллюстрации
 *   npm run vo    -- Whiteboard     # озвучка фраз
 *   npm run board -- Whiteboard     # раскладка, тайминги, манифест
 *
 * ПРАВИЛО ТЕКСТА НА ДОСКЕ. Ролик рассчитан на авто-дубляж YouTube, а тот
 * переводит только звук: всё нарисованное останется на русском поверх чужой
 * озвучки. Поэтому надписи — 1–3 слова, приоритет цифрам и символам, а смысл
 * несёт голос, не доска.
 */
export const SCRIPT: Phrase[] = [
  { id: "n01", speaker: "narrator", line: "Ты дышишь воздухом и считаешь это нормальным." },
  { id: "n02", speaker: "narrator", line: "А рыба достаёт кислород прямо из воды." },
  { id: "n03", speaker: "narrator", line: "В воде его в тридцать раз меньше, чем в воздухе." },
  { id: "n04", speaker: "narrator", line: "Жабры прогоняют воду через себя и забирают почти всё." },

  { id: "n05", speaker: "narrator", line: "Дальше — глубина." },
  { id: "n06", speaker: "narrator", line: "Внутри рыбы есть пузырь, который она поддува́ет и стравливает." },
  { id: "n07", speaker: "narrator", line: "Так она висит на любой глубине и не тратит ни одного движения." },

  { id: "n08", speaker: "narrator", line: "И самое обидное." },
  { id: "n09", speaker: "narrator", line: "Вдоль тела у неё идёт боковая линия." },
  { id: "n10", speaker: "narrator", line: "Это орган, который чувствует движение воды вокруг." },
  { id: "n11", speaker: "narrator", line: "Рыба буквально осязает то, что происходит за спиной.", gap: 0.5 },
  { id: "n12", speaker: "narrator", line: "А ты даже не заметил, что это нарисовала машина.", gap: 1.2 },
];

/**
 * Раскладка доски. `rect` — прямоугольник ЧЕРНИЛ внутри экрана (0…1080 / 0…1920),
 * а не холста картинки: генератор оставляет широкие поля, посадка идёт по
 * чернилам. `weight` делит длительность фразы между её элементами.
 */
export const BOARD: BoardItem[] = [
  // ─── Экран 0: жабры ───────────────────────────────────────────────────
  {
    id: "title",
    kind: "text",
    line: "n01",
    screen: 0,
    text: "РЫБА",
    x: 90,
    y: 250,
    size: 130,
    font: "sans",
    note: "заголовок доски, пишется под первой фразой",
  },
  {
    id: "fish",
    kind: "art",
    line: "n02",
    screen: 0,
    subject: "a fish seen from the side, simple and friendly, mouth slightly open",
    rect: { x: 120, y: 440, w: 840, h: 470 },
  },
  {
    id: "o2",
    kind: "text",
    line: "n03",
    screen: 0,
    text: "O₂ ×30",
    x: 90,
    y: 970,
    size: 96,
    font: "sans",
    note: "цифра вместо фразы — переживёт дубляж на любой язык",
  },
  {
    id: "gills",
    kind: "art",
    line: "n04",
    screen: 0,
    subject: "a close-up of fish gills with arrows showing water flowing in and out",
    rect: { x: 140, y: 1120, w: 800, h: 440 },
  },

  // ─── Экран 1: плавательный пузырь ─────────────────────────────────────
  {
    id: "bladder",
    kind: "art",
    line: "n06",
    screen: 1,
    subject:
      "a cross-section of a fish showing a large oval swim bladder inside its body, with a small up-down arrow next to it",
    rect: { x: 110, y: 420, w: 860, h: 620 },
    weight: 2,
  },
  {
    id: "depth",
    kind: "text",
    line: "n07",
    screen: 1,
    text: "0 усилий",
    x: 90,
    y: 1180,
    size: 100,
    font: "sans",
  },
  {
    id: "depth-accent",
    kind: "accent",
    line: "n07",
    screen: 1,
    target: "depth",
    style: "underline",
    weight: 0.4,
  },

  // ─── Экран 2: боковая линия ───────────────────────────────────────────
  {
    id: "lateral",
    kind: "art",
    line: "n09",
    screen: 2,
    subject:
      "a fish seen from the side with a dotted line running along its body from head to tail, and small ripple waves around it",
    rect: { x: 110, y: 460, w: 860, h: 580 },
    weight: 2,
  },
  {
    id: "sense",
    kind: "text",
    line: "n11",
    screen: 2,
    text: "чувствует\nспиной",
    x: 90,
    y: 1180,
    size: 104,
    font: "sans",
    note: "перенос строки только вручную — метрик шрифта в Node нет",
  },
  {
    id: "sense-accent",
    kind: "accent",
    line: "n12",
    screen: 2,
    target: "sense",
    style: "circle",
    weight: 1,
  },
];

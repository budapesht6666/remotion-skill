import type { BoardItem, Phrase } from "../Whiteboard/types";

/**
 * «We just punched a hole in the Moon» — англоязычная доска по горячему тренду
 * `spacex rocket crashes on the moon` (всплеск 05.08.2026, 100 тыс.+ запросов).
 *
 * Почему тема взята под рисованный ролик, хотя в трендах были куски крупнее:
 * съёмки удара НЕ СУЩЕСТВУЕТ ни у кого — его зафиксировали только как вспышку
 * спектральных линий в телескоп VLT. Конкурент с нарезками вынужден лить сток,
 * а схема на доске здесь объективно лучший визуал. Плюс сами запросы внутри
 * тренда сформулированы вопросами («did the rocket hit the moon», «what
 * happened»), то есть спрос ровно на объяснение.
 *
 * Дуга удержания: шок → механизм → масштаб → ТВИСТ «закон не нарушен, потому
 * что закона нет» → вечный шрам. Провокация целиком собрана из фактов, ничего
 * не додумано:
 *
 *   ступень 2025-010D, 4 т, брошена после доставки Blue Ghost-1 и Hakuto-R;
 *   удар 05.08.2026 06:35 UTC, 8 700 км/ч, ~3 т в тротиловом эквиваленте;
 *   кратер ~18 м у кратера Эйнштейна, выброс грунта до 100 км;
 *   натрий и литий в спектре (VLT, Чили) — единственная запись события;
 *   Договор о космосе 1967 не обязывает убирать за собой за орбитой Земли;
 *   ~3 000 объектов и 209 т мусора на Луне, впереди 100+ миссий за десятилетие.
 *
 * Фразы n12 и (частично) n14 нарочно без элементов доски: это воздух под самым
 * тяжёлым по смыслу местом — время идёт, рука летит, зритель слушает.
 */
export const SCRIPT: Phrase[] = [
  // ─── Экран 0: что произошло ───────────────────────────────────────────
  { id: "n01", speaker: "narrator", line: "We just punched a fresh hole in the Moon." },
  { id: "n02", speaker: "narrator", line: "Nobody meant to. Nobody was steering." },
  { id: "n03", speaker: "narrator", line: "It was a dead rocket stage. Four tonnes of empty metal." },
  { id: "n04", speaker: "narrator", line: "It hit at eight thousand seven hundred kilometres an hour." },

  // ─── Экран 1: как оно там оказалось ───────────────────────────────────
  { id: "n05", speaker: "narrator", line: "SpaceX left it adrift in space after a Moon delivery." },
  { id: "n06", speaker: "narrator", line: "Sunlight and gravity slowly bent its path into the Moon's." },
  { id: "n07", speaker: "narrator", line: "No engine. No brakes. Nobody watching." },

  // ─── Экран 2: масштаб удара ───────────────────────────────────────────
  { id: "n08", speaker: "narrator", line: "The impact landed with the energy of three tonnes of TNT." },
  { id: "n09", speaker: "narrator", line: "It cut a crater eighteen metres wide." },
  { id: "n10", speaker: "narrator", line: "One telescope in Chile caught the flash. That is the only record." },

  // ─── Экран 3: твист ───────────────────────────────────────────────────
  { id: "n11", speaker: "narrator", line: "And here is what nobody is saying. No law was broken." },
  { id: "n12", speaker: "narrator", line: "There is no treaty that makes anyone clean up past Earth's orbit." },
  {
    id: "n13",
    speaker: "narrator",
    line: "We have already dumped three thousand objects up there. Two hundred nine tonnes.",
  },

  // ─── Экран 4: финал ───────────────────────────────────────────────────
  {
    id: "n14",
    speaker: "narrator",
    line: "Footprints from nineteen sixty-nine are still up there, sharp as day one.",
    gap: 0.4,
  },
  { id: "n15", speaker: "narrator", line: "So is the hole we just made.", gap: 1.2 },
];

/**
 * Раскладка доски. Координаты ЛОКАЛЬНЫЕ для своего экрана (компилятор сам
 * добавляет `screen * 1560`), safe-полоса по чернилам — y ∈ [240, 1580].
 *
 * Все надписи — 1–3 слова, цифры и символы. Причина не эстетическая:
 * автодубляж YouTube переводит только звук, и для испанского или хинди зрителя
 * доска останется английской. Поэтому смысл несёт голос, а доска даёт число.
 */
export const BOARD: BoardItem[] = [
  // ─── Экран 0: что произошло ───────────────────────────────────────────
  {
    id: "title",
    kind: "text",
    line: "n01",
    screen: 0,
    text: "THE MOON",
    x: 90,
    y: 300,
    size: 126,
    font: "sans",
    note: "заголовок доски; красный круг на n02 превращает его в мишень",
  },
  {
    id: "title-mark",
    kind: "accent",
    line: "n02",
    screen: 0,
    target: "title",
    style: "circle",
    note: "рисуется под «никто не рулил» — заголовок читается как перечёркнутая цель",
  },
  {
    id: "stage",
    kind: "art",
    line: "n03",
    screen: 0,
    subject:
      "a spent cylindrical rocket upper stage tumbling in empty space, one end open where the engine nozzle is, no flame",
    rect: { x: 120, y: 560, w: 840, h: 500 },
    aspect: "4:3",
  },
  {
    id: "speed",
    kind: "text",
    line: "n04",
    screen: 0,
    text: "8,700 km/h",
    x: 90,
    y: 1200,
    size: 104,
    font: "sans",
  },

  // ─── Экран 1: как оно там оказалось ───────────────────────────────────
  {
    id: "handoff",
    kind: "art",
    line: "n05",
    screen: 1,
    subject:
      "a rocket stage releasing two small four-legged landers that fly toward a crescent moon, while the stage drifts away in the opposite direction",
    rect: { x: 110, y: 300, w: 860, h: 460 },
    aspect: "4:3",
  },
  {
    id: "path",
    kind: "art",
    line: "n06",
    screen: 1,
    subject:
      "a plain circle planet on the left and a smaller plain circle moon on the right, connected by one single long smooth solid curved line that loops around the planet and ends with an arrowhead touching the moon, plus a small plain sun with three short straight arrows in the top right corner. Everything is drawn small and sits fully inside the frame with a wide empty margin on all four sides, nothing touches or crosses the edges",
    rect: { x: 100, y: 820, w: 880, h: 480 },
    aspect: "4:3",
    note: "пунктир траектории давал по контуру на штрих (113) — линия сплошная нарочно",
  },
  {
    id: "control",
    kind: "text",
    line: "n07",
    screen: 1,
    text: "0 control",
    x: 90,
    y: 1370,
    size: 104,
    font: "sans",
    weight: 1,
  },
  {
    id: "control-mark",
    kind: "accent",
    line: "n07",
    screen: 1,
    target: "control",
    style: "underline",
    weight: 0.4,
  },

  // ─── Экран 2: масштаб удара ───────────────────────────────────────────
  {
    id: "impact",
    kind: "art",
    line: "n08",
    screen: 2,
    subject:
      "a simple cutaway block of ground with one wide smooth bowl-shaped crater scooped out of the top, and a single plume of dust rising straight up out of the crater, drawn with a few smooth outlines only, completely blank inside the ground with no texture lines and no layers",
    rect: { x: 150, y: 300, w: 780, h: 520 },
    note: "штриховка слоёв грунта давала 128 контуров — внутренности убраны из сюжета",
  },
  {
    id: "size18",
    kind: "text",
    line: "n09",
    screen: 2,
    text: "18 m",
    x: 90,
    y: 880,
    size: 120,
    font: "sans",
  },
  {
    id: "scope",
    kind: "art",
    line: "n10",
    screen: 2,
    subject:
      "a telescope on a tripod standing on the ground and pointing up at a moon in the sky, with one thin straight line connecting them",
    rect: { x: 120, y: 1070, w: 840, h: 450 },
    aspect: "4:3",
  },

  // ─── Экран 3: твист ───────────────────────────────────────────────────
  {
    id: "nolaw",
    kind: "text",
    line: "n11",
    screen: 3,
    text: "0 LAWS",
    x: 90,
    y: 320,
    size: 130,
    font: "sans",
    weight: 1,
    note: "смысловой центр ролика — самый крупный кегль на доске",
  },
  {
    id: "nolaw-mark",
    kind: "accent",
    line: "n11",
    screen: 3,
    target: "nolaw",
    style: "circle",
    weight: 0.4,
  },
  {
    id: "junk",
    kind: "art",
    line: "n12",
    screen: 3,
    subject:
      "three big blocky abandoned objects standing on one plain straight horizon line: a plain cylinder rocket lying on its side, a simple box lander on four straight legs, and a flag on a pole. Draw them as large simple shapes with no small parts at all: no ladders, no struts, no antennae, no wheels, no panels, no ground texture, no rocks. Everything sits fully inside the frame with a wide empty margin on all four sides",
    rect: { x: 100, y: 560, w: 880, h: 560 },
    aspect: "4:3",
    note:
      "волнистая текстура грунта и мелкие детали аппаратов давали 257 контуров — убраны из сюжета. " +
      "Висит на n12, а не на n13: без этого фраза про отсутствие договора оставляла 4.3 c " +
      "почти статичной доски в самом центре ролика (поймано freezedetect)",
  },
  {
    id: "objects",
    kind: "text",
    line: "n13",
    screen: 3,
    text: "3,000",
    x: 90,
    y: 1250,
    size: 104,
    font: "sans",
    weight: 1,
  },
  {
    id: "tons",
    kind: "text",
    line: "n13",
    screen: 3,
    text: "209 t",
    x: 620,
    y: 1250,
    size: 104,
    font: "sans",
    weight: 1,
    note: "два числа рядом — по двум фактам внутри одной фразы n13",
  },

  // ─── Экран 4: финал ───────────────────────────────────────────────────
  {
    id: "footprint",
    kind: "art",
    line: "n14",
    screen: 4,
    subject:
      "a single boot footprint pressed deep into fine dust, seen close up from above, with a sharp tread pattern",
    rect: { x: 190, y: 340, w: 700, h: 620 },
  },
  {
    id: "forever",
    kind: "text",
    line: "n15",
    screen: 4,
    text: "FOREVER",
    x: 90,
    y: 1120,
    size: 130,
    font: "sans",
    weight: 1,
  },
  {
    id: "forever-mark",
    kind: "accent",
    line: "n15",
    screen: 4,
    target: "forever",
    style: "underline",
    weight: 0.4,
  },
];

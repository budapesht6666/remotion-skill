import type { BoardItem, Phrase } from "../Whiteboard/types";

/**
 * «The Moon got a new crater» — англоязычная доска по тренду
 * `spacex rocket crashes on the moon` (US, 100 тыс.+, всплеск 05.08.2026).
 *
 * Отличие от `MoonScar`, снятого по тому же событию: тот ролик обвинял
 * («никто не обязан убирать»), этот РАССЛЕДУЕТ — как деталь с именем и
 * рабочей биографией превратилась в кратер, и почему единственное
 * доказательство события это дрожь спектральной линии. Провокация та же, но
 * приходит в конце и с другой стороны: стереть это невозможно в принципе.
 *
 * Визуально ролик другой целиком: рисунки не контурные, а РЕАЛИСТИЧНЫЕ
 * КАРАНДАШНЫЕ (`style: "graphite"`, референс `public/temp/moon_v2`), фон
 * космических кадров залит графитом (`backdrop: "dark"`), а цвет допущен ровно
 * в трёх местах на весь ролик — вспышка удара, спектральные линии и флаг.
 * Рисуется всё в две фазы: обводка главных форм, потом растушёвка тона.
 *
 * Факты (Wikipedia «2026 SpaceX lunar impact», NPR, Forbes, ESO):
 *   ступень 2025-010D, 4 т, доставила Blue Ghost-1 и Hakuto-R M2 в 2025;
 *   брошена, 18 месяцев дрейфа под тяготением Земли/Луны/Солнца и давлением
 *     солнечного света;
 *   удар 05.08.2026 06:35 UTC у кратера Эйнштейна, 8 700 км/ч;
 *   ~3 т в тротиловом эквиваленте, кратер 18 м шириной и 4 м глубиной;
 *   натрий и литий в плюме, 5–10 минут, зафиксировал VLT в Паранале (Чили);
 *   на Луне уже ~209 т рукотворного железа.
 *
 * Фразы n09, n13, n20 нарочно без элементов доски: пауза в рисовании там, где
 * фраза сама по себе точка. Время идёт, рука летит к следующему элементу.
 */
export const SCRIPT: Phrase[] = [
  // ─── Экран 0: удар ────────────────────────────────────────────────────
  { id: "n01", speaker: "narrator", line: "On August fifth, the Moon got a new crater." },
  { id: "n02", speaker: "narrator", line: "Nobody launched it. Nobody aimed it. Nobody was watching." },
  { id: "n03", speaker: "narrator", line: "It happened at six thirty-five in the morning, on the edge we never see." },
  { id: "n04", speaker: "narrator", line: "And it was ours." },

  // ─── Экран 1: что это было ────────────────────────────────────────────
  { id: "n05", speaker: "narrator", line: "Four tonnes of empty rocket. The upper stage of a Falcon nine." },
  { id: "n06", speaker: "narrator", line: "It had a job once." },
  { id: "n07", speaker: "narrator", line: "In twenty twenty-five it carried two landers all the way to the Moon." },

  // ─── Экран 2: как оно осталось одно ───────────────────────────────────
  { id: "n08", speaker: "narrator", line: "It let them go, one after the other, and that was the whole mission." },
  { id: "n09", speaker: "narrator", line: "Nobody brings the upper stage home. There is never enough fuel left." },
  { id: "n10", speaker: "narrator", line: "So it drifted. For eighteen months." },

  // ─── Экран 3: физика дрейфа ───────────────────────────────────────────
  { id: "n11", speaker: "narrator", line: "No engine. No radio. No way to steer." },
  { id: "n12", speaker: "narrator", line: "Earth pulled on it. The Moon pulled on it. Sunlight pushed on it." },
  { id: "n13", speaker: "narrator", line: "And a drift with nobody at the wheel slowly became a collision course." },

  // ─── Экран 4: удар ────────────────────────────────────────────────────
  { id: "n14", speaker: "narrator", line: "It arrived at eight thousand seven hundred kilometres an hour." },
  { id: "n15", speaker: "narrator", line: "Three tonnes of TNT, delivered by accident." },
  { id: "n16", speaker: "narrator", line: "It dug a hole eighteen metres across and four metres deep." },

  // ─── Экран 5: единственный свидетель ──────────────────────────────────
  { id: "n17", speaker: "narrator", line: "Here is the part that should bother you. There is no footage of it." },
  { id: "n18", speaker: "narrator", line: "One telescope in Chile watched the light shiver for a few minutes." },
  { id: "n19", speaker: "narrator", line: "Sodium and lithium, boiling off the surface of the Moon." },
  { id: "n20", speaker: "narrator", line: "That shiver is the only proof any of this happened." },

  // ─── Экран 6: твист ───────────────────────────────────────────────────
  { id: "n21", speaker: "narrator", line: "And nobody broke a single rule." },
  { id: "n22", speaker: "narrator", line: "No treaty makes anyone clean up past Earth's orbit. There is nothing to break." },
  { id: "n23", speaker: "narrator", line: "Two hundred and nine tonnes of our hardware is already lying up there." },

  // ─── Экран 7: финал ───────────────────────────────────────────────────
  {
    id: "n24",
    speaker: "narrator",
    line: "The Moon has no wind and no rain. Nothing on it ever gets cleaned up.",
    gap: 0.4,
  },
  {
    id: "n25",
    speaker: "narrator",
    line: "A million years from now, that hole will look exactly like it does tonight.",
    gap: 0.6,
  },

  // ─── Экран 8: концовка ────────────────────────────────────────────────
  { id: "n26", speaker: "narrator", line: "One last thing. Subscribe to the channel, and leave a like." },
  { id: "n27", speaker: "narrator", line: "Tap the bell, so the next one finds you." },
  {
    id: "n28",
    speaker: "narrator",
    line: "And tell me in the comments what you make of all this.",
    gap: 1.2,
  },
];

/**
 * Раскладка доски. Координаты ЛОКАЛЬНЫЕ для своего экрана (компилятор сам
 * добавляет `screen * 1560`), safe-полоса по чернилам — y ∈ [240, 1580].
 *
 * Про сюжеты картинок. Графит прощает больше деталей, чем контурный стиль
 * (тон приходит растушёвкой, а не сотней контуров), но кадрирование он не
 * прощает так же: «всё целиком в кадре с широкими полями» пишется в `subject`
 * прямым текстом, иначе объект уезжает за край.
 *
 * Про надписи: 1–3 слова, приоритет цифрам. Авто-дубляж YouTube переводит
 * только звук, и для испаноязычного зрителя доска останется английской.
 */
export const BOARD: BoardItem[] = [
  // ─── Экран 0: удар ────────────────────────────────────────────────────
  {
    id: "date",
    kind: "text",
    line: "n01",
    screen: 0,
    text: "AUGUST 5",
    x: 90,
    y: 300,
    size: 118,
    font: "sans",
    note: "дата вместо заголовка: ролик про конкретное утро, а не про Луну вообще",
  },
  {
    id: "moon",
    kind: "art",
    line: "n02",
    screen: 0,
    style: "graphite",
    backdrop: "dark",
    accent: "the small impact flash on the Moon's surface, in hot orange",
    subject:
      "the full Moon seen from space, filling most of the frame, with its dark maria and bright cratered highlands, " +
      "and one small bright impact flash near the left edge of the disc. " +
      "The Moon sits fully inside the frame and does not touch the edges",
    rect: { x: 90, y: 470, w: 900, h: 900 },
    aspect: "1:1",
    note: "герой-кадр по референсу: залитое графитом небо, тональный диск, единственное цветное пятно",
  },
  {
    id: "time",
    kind: "text",
    line: "n03",
    screen: 0,
    text: "06:35 UTC",
    x: 90,
    // Подчёркивание добавляет снизу padding + запас на дрожание пера, и на
    // 1420 акцент вылезал в нижнюю safe-area.
    y: 1370,
    size: 104,
    font: "sans",
  },
  {
    id: "time-mark",
    kind: "accent",
    // Висит на n04, а не на n03: фраза «And it was ours» иначе оставалась без
    // единого нового штриха, и доска замирала (поймано freezedetect).
    line: "n04",
    screen: 0,
    target: "time",
    style: "underline",
  },

  // ─── Экран 1: что это было ────────────────────────────────────────────
  {
    id: "stage",
    kind: "art",
    line: "n05",
    screen: 1,
    style: "graphite",
    backdrop: "dark",
    subject:
      "a spent cylindrical rocket upper stage tumbling in empty space, one end open where the engine nozzle is, no flame. " +
      "One single large simple object, no small parts, no antennae, no struts. " +
      "It sits fully inside the frame with a wide margin",
    rect: { x: 90, y: 300, w: 900, h: 660 },
    aspect: "4:3",
  },
  {
    id: "mass",
    kind: "text",
    line: "n06",
    screen: 1,
    text: "4 TONNES",
    x: 90,
    y: 1090,
    size: 118,
    font: "sans",
    weight: 1,
  },
  {
    id: "mass-mark",
    kind: "accent",
    line: "n06",
    screen: 1,
    target: "mass",
    style: "circle",
    weight: 0.4,
  },

  // ─── Экран 2: как оно осталось одно ───────────────────────────────────
  {
    id: "handoff",
    kind: "art",
    line: "n07",
    screen: 2,
    style: "graphite",
    backdrop: "dark",
    subject:
      "a rocket stage in space releasing two small four-legged landers that fly away toward a crescent moon, " +
      "while the stage drifts off in the opposite direction. " +
      "Three large simple shapes only, no small parts. Everything sits fully inside the frame with a wide margin",
    rect: { x: 90, y: 300, w: 900, h: 620 },
    aspect: "4:3",
  },
  {
    id: "landers",
    kind: "text",
    line: "n08",
    screen: 2,
    text: "2 LANDERS",
    x: 90,
    y: 1000,
    size: 104,
    font: "sans",
    note: "фразы n08 и n09 были без элементов — доска стояла восемь секунд подряд",
  },
  {
    id: "landers-mark",
    kind: "accent",
    line: "n09",
    screen: 2,
    target: "landers",
    style: "circle",
  },
  {
    id: "adrift",
    kind: "text",
    line: "n10",
    screen: 2,
    text: "18 MONTHS",
    x: 90,
    y: 1250,
    size: 112,
    font: "sans",
    weight: 1,
  },
  {
    id: "adrift-mark",
    kind: "accent",
    line: "n10",
    screen: 2,
    target: "adrift",
    style: "underline",
    weight: 0.35,
  },

  // ─── Экран 3: физика дрейфа ───────────────────────────────────────────
  {
    id: "nocontrol",
    kind: "text",
    // Стоит ПЕРЕД картинкой и на своей фразе («No engine. No radio.»): раньше
    // текст висел на n13, а n11 оставалась пустой и доска замирала на секунду.
    line: "n11",
    screen: 3,
    text: "0 ENGINES",
    x: 90,
    y: 300,
    size: 112,
    font: "sans",
  },
  {
    id: "drift",
    kind: "art",
    line: "n12",
    screen: 3,
    style: "graphite",
    backdrop: "dark",
    subject:
      "a big sphere planet on the left and a smaller sphere moon on the right, joined by one single long smooth curved " +
      "line that loops around the planet and ends touching the moon, plus a small sun in the top right corner with " +
      "three straight rays. Everything is drawn small and sits fully inside the frame with a wide empty margin on all " +
      "four sides, nothing touches or crosses the edges",
    rect: { x: 90, y: 520, w: 900, h: 620 },
    aspect: "4:3",
    note: "пунктирная траектория дала бы контур на каждый штрих — линия сплошная нарочно",
  },
  {
    id: "nocontrol-mark",
    kind: "accent",
    line: "n13",
    screen: 3,
    target: "nocontrol",
    style: "underline",
  },

  // ─── Экран 4: удар ────────────────────────────────────────────────────
  {
    id: "crater",
    kind: "art",
    line: "n14",
    screen: 4,
    style: "graphite",
    backdrop: "paper",
    subject:
      "a cutaway block of lunar ground with one wide smooth bowl-shaped crater scooped out of the top and a plume of " +
      "dust rising straight out of it. One simple solid form, no layers, no rocks, no small debris. " +
      "It sits fully inside the frame with a wide empty margin on all four sides",
    rect: { x: 90, y: 300, w: 900, h: 640 },
    aspect: "4:3",
    note: "единственный кадр экрана на чистой бумаге: после трёх тёмных окон подряд контраст держит внимание",
  },
  {
    id: "tnt",
    kind: "text",
    line: "n15",
    screen: 4,
    text: "3 t TNT",
    x: 90,
    y: 1060,
    size: 110,
    font: "sans",
    weight: 1,
  },
  {
    id: "width",
    kind: "text",
    line: "n16",
    screen: 4,
    text: "18 m",
    x: 90,
    y: 1260,
    size: 132,
    font: "sans",
    weight: 1,
  },
  {
    id: "width-mark",
    kind: "accent",
    line: "n16",
    screen: 4,
    target: "width",
    style: "circle",
    weight: 0.4,
  },

  // ─── Экран 5: единственный свидетель ──────────────────────────────────
  {
    id: "nofootage",
    kind: "text",
    // Ключевая мысль экрана и заодно затычка простоя: n17 и n20 были пустыми,
    // и между картинками доска стояла по секунде-две.
    line: "n17",
    screen: 5,
    text: "NO FOOTAGE",
    x: 90,
    y: 290,
    size: 108,
    font: "sans",
  },
  {
    id: "scope",
    kind: "art",
    line: "n18",
    screen: 5,
    style: "graphite",
    backdrop: "dark",
    subject:
      "a domed observatory building standing alone on a bare mountain ridge under a night sky, its shutter open and one " +
      "thin straight beam going up to a small moon in the upper corner. " +
      "Two large simple shapes only, no windows, no doors, no rocks. Everything sits fully inside the frame with a wide margin",
    rect: { x: 90, y: 460, w: 900, h: 540 },
    aspect: "4:3",
  },
  {
    id: "spectrum",
    kind: "art",
    line: "n19",
    screen: 5,
    style: "graphite",
    backdrop: "dark",
    accent: "the two bright emission lines in the spectrum, one orange and one deep red",
    subject:
      "a wide horizontal band of a light spectrum, smooth and even, crossed by two narrow vertical bright lines standing " +
      "clearly apart from each other. Nothing else in the frame: no scale, no ticks, no arrows, no axis. " +
      "The band stretches across the middle of the frame with empty space above and below it",
    rect: { x: 90, y: 1080, w: 900, h: 380 },
    aspect: "4:3",
    note: "второе и последнее место цвета: линии натрия и лития — то самое единственное доказательство",
  },
  {
    id: "nofootage-mark",
    kind: "accent",
    line: "n20",
    screen: 5,
    target: "nofootage",
    style: "underline",
  },

  // ─── Экран 6: твист ───────────────────────────────────────────────────
  {
    id: "nolaw",
    kind: "text",
    line: "n21",
    screen: 6,
    text: "0 LAWS",
    x: 90,
    y: 300,
    size: 138,
    font: "sans",
    weight: 1,
    note: "смысловой центр ролика — самый крупный кегль на доске",
  },
  {
    id: "nolaw-mark",
    kind: "accent",
    line: "n21",
    screen: 6,
    target: "nolaw",
    style: "circle",
    weight: 0.4,
  },
  {
    id: "junk",
    kind: "art",
    line: "n22",
    screen: 6,
    style: "graphite",
    backdrop: "paper",
    accent: "the flag on the pole, in faded red and blue",
    subject:
      "three big abandoned objects standing on one plain straight horizon line: a plain cylinder rocket lying on its " +
      "side, a simple box lander on four straight legs, and a flag on a pole. Large simple shapes with no small parts " +
      "at all: no ladders, no struts, no antennae, no wheels, no panels, no rocks. " +
      "Everything sits fully inside the frame with a wide empty margin on all four sides",
    rect: { x: 90, y: 620, w: 900, h: 620 },
    aspect: "4:3",
    note: "третье и последнее место цвета: выцветший флаг — единственное человеческое в свалке",
  },
  {
    id: "tons",
    kind: "text",
    line: "n23",
    screen: 6,
    text: "209 t",
    x: 90,
    y: 1360,
    size: 122,
    font: "sans",
    weight: 1,
  },

  // ─── Экран 7: финал ───────────────────────────────────────────────────
  {
    id: "scar",
    kind: "art",
    line: "n24",
    screen: 7,
    style: "graphite",
    backdrop: "dark",
    subject:
      "a close view of a fresh small crater in fine lunar dust, seen from just above the surface, with a smooth rim and " +
      "a dark bowl, and the black sky behind it. One simple form, no rocks, no footprints, no equipment. " +
      "It sits fully inside the frame with a wide margin",
    rect: { x: 90, y: 340, w: 900, h: 700 },
    aspect: "1:1",
  },
  {
    id: "forever",
    kind: "text",
    line: "n25",
    screen: 7,
    text: "FOREVER",
    x: 90,
    y: 1160,
    size: 138,
    font: "sans",
    weight: 1,
  },
  {
    id: "forever-mark",
    kind: "accent",
    line: "n25",
    screen: 7,
    target: "forever",
    style: "underline",
    weight: 0.35,
  },

  // ─── Экран 8: концовка ────────────────────────────────────────────────
  {
    id: "subscribe",
    kind: "text",
    line: "n26",
    screen: 8,
    text: "SUBSCRIBE",
    x: 90,
    y: 300,
    size: 132,
    font: "sans",
    note: "самая крупная надпись ролика: последнее, что остаётся на экране",
  },
  {
    id: "bell",
    kind: "art",
    line: "n27",
    screen: 8,
    style: "graphite",
    backdrop: "paper",
    subject:
      "a single notification bell icon, the classic rounded bell shape with a small ball clapper hanging under it, " +
      "seen straight from the front. One simple solid form, no ribbons, no cracks, no rays, no sparkles, no text. " +
      "It sits fully inside the frame with a wide empty margin on all four sides",
    rect: { x: 330, y: 620, w: 420, h: 480 },
    aspect: "1:1",
  },
  {
    id: "bell-click",
    kind: "click",
    line: "n28",
    screen: 8,
    target: "bell",
    note:
      "единственный элемент доски, который не рисуется пером: рисующая рука уже ушла, " +
      "перчатка прилетает снизу, жмёт по колокольчику, тот качается под звон",
  },
];

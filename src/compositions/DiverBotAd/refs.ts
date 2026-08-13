/**
 * РЕФЕРЕНСНЫЕ КАДРЫ для генерации видео в Gemini.
 *
 * Зачем они. Текстовый промпт в видеомодели каждый раз даёт новую трактовку:
 * пять тёмных планов ролика, сгенерированные по описаниям, приедут пятью
 * разными фильмами — свой контраст, своя температура, своя оптика. Стартовая
 * картинка снимает эту неопределённость: модель получает готовый кадр и
 * оживляет его, а не придумывает заново. Поэтому единый стиль задаётся ОДИН
 * РАЗ здесь, в блоках `DARK_WORLD` / `WHITE_WORLD`, а сюжет автор пишет
 * отдельной строкой — ровно как это сделано у доски в `lib/gen-image.ts`.
 *
 * Файлы кладутся рядом с будущими клипами: `public/assets/diverbot/refs/`.
 * Имя референса совпадает с именем клипа из `script.ts`, поэтому видно, что
 * к чему относится, и не нужен третий список соответствий.
 *
 * Генерация: `npm run refs -- DiverBotAd`
 */

/**
 * Тёмный мир — первые десять секунд ролика.
 *
 * Требования собраны под то, что с этими кадрами делает композиция:
 *
 *  • «very low key, deep blacks» — поверх кадра ложится общий холодный грейд и
 *    затемнение по краям (`NightGrade`). Светлый кадр после него станет серым,
 *    а не тёмным, и половина потеряет тяжесть;
 *  • «cold blue-teal ambient» — грейд подмешивает синий, и если исходник тёплый,
 *    получится грязь; лучше прийти уже холодным;
 *  • «generous negative space top and bottom» — сверху ложится надпись, снизу
 *    субтитры, а верх и низ вертикального кадра ещё и перекрыты интерфейсом
 *    площадки;
 *  • «no readable text, no recognizable exchange interface» — чужой интерфейс в
 *    рекламе это чужой бренд, а буквы модель всё равно рисует с ошибками.
 */
const DARK_WORLD = [
  "Photorealistic cinematic photograph, shot on a full-frame camera with a fast prime lens.",
  "Night interior, very low key lighting: deep blacks, a single motivated light source,",
  "cold blue-teal ambient light, muted desaturated palette.",
  "Shallow depth of field with soft round bokeh, fine natural grain.",
  // Два требования ниже дописаны после первой пробы, и оба — про рамку.
  // «Film still» модель понимает как КАДР ПЛЁНКИ и рисует его вещественно:
  // чёрные полосы сверху и снизу, скруглённые углы, тяжёлая виньетка. А
  // «subject in the middle third» она читает как раскладку и честно делит
  // холст на три полосы, размывая верхнюю и нижнюю. В ролике такой край
  // виден как брак, поэтому оба места переформулированы, а запрет выписан
  // явно — намёка модель не понимает.
  "The photograph fills the entire vertical frame edge to edge, one continuous image.",
  "No letterboxing, no black bars, no split bands, no film frame, no border, no rounded corners,",
  "no sprocket holes, no heavy vignette.",
  "Vertical 9:16 framing, the subject sits slightly above the centre and the rest of the frame",
  "is quiet darkness, so there is room for a caption at the bottom.",
  "No text, no letters, no numbers, no logos, no watermark, no user interface,",
  "no recognizable exchange or app screen, no human faces.",
].join(" ");

/**
 * Светлый мир — половина промо-сайта.
 *
 * Здесь требование жёстче, чем у тёмных кадров, и оно ровно одно: **фон обязан
 * быть чистым белым**. Кадр встаёт встык с промо-видео сайта (чёрная
 * механическая рука на белой циклораме) и с белой бумагой самой композиции;
 * серый или градиентный фон вырежет клип из кадра прямоугольником, и никакой
 * грейд этого уже не спасёт.
 */
const WHITE_WORLD = [
  "Photorealistic product packshot of a matte black object isolated on a pure white background.",
  // Формулировка выстрадана: «studio product photograph» модель понимает
  // буквально и ставит в кадр софтбокс со стойкой, а «seamless background»
  // рисует настоящей циклорамой — с завалом в серый и линией горизонта.
  // Нужен не павильон, а вырезанный объект: отсюда «isolated», «blown out»
  // и явный перечень того, чего в кадре быть не может.
  "The background is completely blown out to solid pure white #FFFFFF:",
  "no gradient, no grey falloff, no horizon line, no visible backdrop or studio equipment.",
  "Soft even high-key lighting, one subtle contact shadow directly beneath the object.",
  "Clean minimal commercial aesthetic, sharp detail, shallow depth of field.",
  "Vertical 9:16 composition, object centred with generous white space around it.",
  "Nothing else in the frame: no softbox, no light stand, no reflector, no props,",
  "no text, no letters, no logos, no watermark.",
].join(" ");

export type RefWorld = "dark" | "white";

export type Ref = {
  /** Совпадает с именем клипа в SHOTS: refs/<name>.png → assets/diverbot/<name>.mp4 */
  name: string;
  world: RefWorld;
  /** Сюжет кадра. Стиль подставляется миром, здесь только что в кадре. */
  subject: string;
  /**
   * Что этот кадр должен сделать в видеомодели. В генерацию картинки НЕ идёт —
   * это текст для второго шага, когда автор оживляет референс.
   */
  motion: string;
};

export const REFS: Ref[] = [
  {
    name: "clock-night",
    world: "dark",
    // Циферблат нарочно уведён за край кадра. Стрелки «на 3:14» модель ставит
    // как угодно — её учили на рекламных 10:10, — и неверное время рядом с
    // репликой «в три часа ночи» заметит именно внимательный зритель. Раз
    // время всё равно не удержать, пусть его нельзя будет и прочесть: в кадре
    // остаётся только кончик секундной стрелки, а час называет диктор.
    subject:
      "an extreme macro of the thin second hand of an old matte black analog clock, " +
      "sweeping across a dark textured dial whose numerals fall outside the frame, " +
      "a single hard rim light from the left catching the edge of the hand and the bezel, " +
      "everything else falling away into darkness",
    motion: "The second hand sweeps forward one tick at a time. Very slow subtle push-in. Nothing else moves.",
  },
  {
    name: "candles-fall",
    world: "dark",
    // Первая проба дала ноутбук на столе с аккуратным читаемым графиком —
    // модель услышала «chart on a screen» и нарисовала устройство. Здесь
    // важно обратное: не предмет в интерьере, а фактура вплотную. Отсюда
    // «the screen surface fills the entire frame» и явный запрет на корпус:
    // как только в кадре появляется рамка монитора, это уже чужой интерфейс.
    subject:
      "an extreme close-up macro of glowing candlesticks on a dark screen, so close that " +
      "the screen surface fills the entire frame and individual pixels and glass texture are visible; " +
      "one tall red candle in the centre plunges far below the others to a new low, " +
      "the candles at the edges dissolve into soft round bokeh; " +
      "no device body, no monitor bezel, no laptop, no desk, no room around it, " +
      "no readable scales, no grid labels — the chart is pure abstract texture",
    motion:
      "The red candle grows downward as it prints a new low. Slow drift to the right, focus stays on the falling candle.",
  },
  {
    name: "morning-blinds",
    world: "dark",
    subject:
      "hard morning sunlight through venetian blinds striping a bedside table " +
      "where a phone lies face down, dust suspended in the light beams, " +
      "warm light cutting across cold blue shadows",
    motion: "The stripes of light creep slowly across the table and the phone. Dust drifts in the beams.",
  },
  {
    name: "night-desk",
    world: "dark",
    subject:
      "an empty desk chair pushed back from a dark wooden desk at night, " +
      "a phone lying face down next to a cold cup of coffee, " +
      "a monitor glowing just outside the frame and lighting the edge of the desk",
    motion: "Very slow push-in towards the face-down phone. The room is completely still.",
  },
  // Здесь были ещё два кадра — «стена экранов» и «чёрный механизм на белом».
  // Их сняли со списка не из-за лимитов генерации, а потому что обе реплики
  // ПЕРЕЧИСЛЯЮТ («два индикатора на четырёх таймфреймах и двух монетах»,
  // «девять типов событий»), а перечисление невозможно снять: снятая стена
  // экранов сообщает только «много», вращающийся механизм — вообще ничего.
  // Оба плана рисует теперь код (`scenes/NativeScenes.tsx`): панели набираются
  // ровно по счёту, а события показаны настоящими значками продукта. Если
  // когда-нибудь понадобится снятый вариант — промпты лежат в истории git.
];

/** Полный промпт картинки: стиль мира + сюжет. */
export function refPrompt(ref: Ref): string {
  const style = ref.world === "dark" ? DARK_WORLD : WHITE_WORLD;
  return `${style} Subject: ${ref.subject}.`;
}

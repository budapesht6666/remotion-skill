/**
 * ВТОРОЙ МОНТАЖ рекламного ролика diverBot.
 *
 * Зачем он есть. Первые две публикации на канале оказались одним и тем же
 * монтажом (одна озвучка, те же четырнадцать планов, те же 42.700 с) — площадка
 * такое считает дублем и режет охват второму ролику. Этот файл существует
 * ровно для того, чтобы второй заход отличался от первого не пересжатием, а
 * монтажом: другое открытие, другая длина, свой хук и своя музыка.
 *
 * Что НЕ отличается: голос, стиль, дизайн-система и — главное — ограничения по
 * формулировкам. Шапка `../DiverBotAd/script.ts` действует здесь целиком:
 * продукт read-only, дохода и процентов не обещаем, каждое утверждение
 * проверяется по `promo/src/i18n/en.ts`. Реплики ниже — те же самые тексты, что
 * в основном ролике, поэтому они и озвучены теми же файлами (см. ниже).
 *
 * ЧЕМ ОТЛИЧАЕТСЯ ОТ `DiverBotAd`:
 *   1. Открывается падающей свечой, а не часами. Часы — расфокусированное
 *      макро, и на первом кадре ленты они не читаются; свеча читается сразу.
 *      Часы никуда не деваются, просто идут вторым планом.
 *   2. Снята реплика n02 («You saw it at breakfast») вместе с её планом. Тёмная
 *      половина становится на один план короче и перестаёт провисать.
 *   3. Свой хук и своя музыка задаются пропами в `src/Root.tsx`.
 *
 * Порядок сборки — как у основного ролика, но озвучку почти целиком берём
 * готовой: тексты реплик не менялись, а `npm run vo` кэширует по хэшу текста.
 *   cp public/vo/DiverBotAd/{vo.json,n*.m4a} public/vo/DiverBotAdCut/
 *   npm run vo -- DiverBotAdCut     # всё из кэша, синтеза не будет
 *   npm run ad -- DiverBotAdCut
 */

import type { Phrase, Shot } from "../DiverBotAd/script";

export type { Phrase, Shot };

/**
 * Реплики. Идентификаторы намеренно сохранены от основного ролика (n01, n03,
 * n04, …) — по ним ищется кэш озвучки, и перенумеровать их значило бы
 * переозвучить весь монолог заново без единой правки в тексте.
 */
export const SCRIPT: Phrase[] = [
  // --- Тьма: ты проспал движение ------------------------------------------
  { id: "n01", speaker: "narrator", line: "At three in the morning, ETH set a lower low." },
  // n02 («You saw it at breakfast») снята: мысль «ты узнал позже» полностью
  // держится следующей репликой и кадром пустого стола, а лишняя пауза в
  // первые пять секунд — это ровно то место, где зритель уходит.
  {
    id: "n03",
    speaker: "narrator",
    line: "Catching that yourself means two indicator panels in your head — four timeframes, two coins, all day.",
  },

  // --- Стык: вспышка в белое ------------------------------------------------
  { id: "n04", speaker: "narrator", line: "So don't.", gap: 0.7 },

  // --- Свет: что делает бот -------------------------------------------------
  { id: "n05", speaker: "narrator", line: "diverBot watches Bybit for you." },
  { id: "n06", speaker: "narrator", line: "Price sets a lower low. The indicator does not follow." },
  {
    id: "n07",
    speaker: "narrator",
    line: "That disagreement is a divergence — the oldest warning a move is running out of fuel.",
  },
  { id: "n08", speaker: "narrator", line: "It does that on every closed candle." },

  { id: "n09", speaker: "narrator", line: "Nine event types, four timeframes, BTC and ETH, around the clock." },
  { id: "n10", speaker: "narrator", line: "The second an event fires, the message is in your chat." },
  {
    id: "n11",
    speaker: "narrator",
    line: "Every signal keeps its own page — the feed and the whole history are free for everyone.",
  },

  // --- Оффер и CTA ----------------------------------------------------------
  // Сумма звучит, но на экране её нет — разбор этой асимметрии и что с ней
  // делать, когда вернётся квота озвучки, в `../DiverBotAd/script.ts`.
  {
    id: "n12",
    speaker: "narrator",
    line: "Ten dollars for thirty days buys one thing: being told the moment it happens.",
  },
  { id: "n13", speaker: "narrator", line: "Not finding out later. First three days free." },
  { id: "n14", speaker: "narrator", line: "Press start. It begins watching within the same minute.", gap: 1.2 },
];

/**
 * МОНТАЖНЫЙ ЛИСТ. Отличия от основного ролика — только в тёмной половине;
 * светлая совпадает план в план, потому что она и так работает: там продукт
 * показывает себя сам, и переставлять там нечего ради одной лишь непохожести.
 */
export const SHOTS: Shot[] = [
  // --- Тьма -----------------------------------------------------------------
  // Порядок перевёрнут относительно основного ролика: сначала свеча, потом
  // часы. Причина не в разнообразии — в читаемости нулевого кадра. Часы сняты
  // расфокусированным макро, и на первом кадре ленты это тёмное пятно, которое
  // зритель принимает за незагрузившееся видео. Свеча даёт форму и цвет сразу.
  {
    line: "n01",
    scene: "dark",
    media: "assets/diverbot/candles-fall.mp4",
    from: 3.2,
    weight: 2,
    note: "макро свечей, красная печатает lower low — открывающий кадр",
    zoom: 1.06,
  },
  {
    line: "n01",
    scene: "dark",
    media: "assets/diverbot/clock-night.mp4",
    from: 1.2,
    weight: 1,
    note: "часы в темноте — три часа ночи",
    // Надпись переехала сюда вместе с часами: время уместнее на циферблате,
    // чем на свече, и здесь она не спорит с хуком — тот к этому кадру гаснет.
    overlay: "03:14",
  },
  {
    line: "n03",
    scene: "dark",
    media: "assets/diverbot/night-desk.mp4",
    from: 0.6,
    weight: 1,
    note: "телефон экраном вниз: смотреть за рынком некому",
  },
  {
    line: "n03",
    scene: "wall",
    weight: 2,
    note: "панели множатся до 36, камера отъезжает — перегруз",
  },

  // --- Стык -----------------------------------------------------------------
  { line: "n04", scene: "flash", note: "звук алерта, кадр выбеливается" },

  // --- Свет -----------------------------------------------------------------
  {
    line: "n05",
    scene: "hero",
    media: "assets/diverbot/hero.mp4",
    from: 4.6,
    note: "чёрная робо-рука раскрывает пальцы — механизм, а не человек",
  },
  {
    line: "n06",
    scene: "chart",
    span: 3,
    media: "clips/DiverBotAd/promo-chart.mp4",
    speed: "fit",
    note: "цена и RSI рисуют сами себя, расхождение размечается на глазах",
  },
  {
    line: "n09",
    scene: "events",
    note: "девять значков событий продукта, счётчики набегают",
    overlay: "9 · 4 · 2 · 24/7",
  },
  {
    line: "n10",
    scene: "telegram",
    note: "сообщение прилетает в чат, палец жмёт кнопку под ним",
  },
  {
    line: "n11",
    scene: "app",
    media: "clips/DiverBotAd/app-card.mp4",
    weight: 1,
    note: "карточка сигнала: у каждого события своя страница",
  },
  {
    line: "n11",
    scene: "app",
    media: "clips/DiverBotAd/app-feed.mp4",
    weight: 1,
    note: "лента прокручивается — вся история открыта всем",
    overlay: "free forever",
  },

  // --- Оффер и CTA ----------------------------------------------------------
  { line: "n12", scene: "offer", span: 2, note: "карточка подписки без суммы" },
  { line: "n14", scene: "end", note: "логотип, зелёная кнопка, хендл, дисклеймер" },
];

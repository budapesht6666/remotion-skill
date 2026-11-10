/**
 * ТРЕТИЙ МОНТАЖ рекламы diverBot — под Reels и рекламу в Meta (09.11.2026).
 *
 * Зачем он есть. Первые два монтажа (`DiverBotAd`, `DiverBotAdCut`) сняты в
 * августе 2026 и с тех пор продукт поменялся: семь инструментов вместо двух,
 * демо сутки вместо трёх дней, подписка 29.99 $ за 30 дней вместо 10 $. Ролик,
 * который обещает «десять долларов» и «три дня», в платной рекламе — это
 * обещание не того продукта, что откроется по кнопке.
 *
 * Ограничения по формулировкам — те же, что в шапке `../DiverBotAd/script.ts`:
 * продукт read-only, дохода и процентов не обещаем, каждое утверждение
 * сверяется с `diverBot/promo/src/i18n/en.ts`. Для рекламы в Meta это не
 * вкусовщина: криптовалютная политика площадки пускает аналитику и обучение
 * без лицензии, а «торговые инструменты» — нет.
 *
 * ЧТО ПОМЕНЯЛОСЬ ОТНОСИТЕЛЬНО `DiverBotAdCut`:
 *   1. r03 и r09 — «seven instruments» вместо «two coins» и «BTC and ETH».
 *   2. r12 — без суммы. Цена в голосе при её отсутствии на экране была
 *      вынужденной асимметрией (квота озвучки), теперь её нет ни там, ни там:
 *      цифру платного финансового сервиса в рекламе лучше не называть вовсе.
 *   3. r13 — «The first 24 hours are free» вместо трёх дней.
 *   4. Снята n08 («It does that on every closed candle»): ролик короче, а
 *      график свою мысль договаривает сам.
 * Остальные реплики дословно прежние и озвучены теми же файлами (кэш по хэшу
 * текста), поэтому весь ролик звучит одним диктором.
 *
 * Порядок сборки:
 *   cp public/vo/DiverBotAdCut/{vo.json,n*.m4a} public/vo/DiverBotReel/
 *   npm run vo -- DiverBotReel      # синтез только r03, r09, r12, r13
 *   npm run ad -- DiverBotReel
 *   npx remotion render DiverBotReel out/DiverBotReel/diverbot-reel.mp4
 */

import type { Phrase, Shot } from "../DiverBotAd/script";

export type { Phrase, Shot };

export const SCRIPT: Phrase[] = [
  // --- Тьма: ты проспал движение ------------------------------------------
  { id: "n01", speaker: "narrator", line: "At three in the morning, ETH set a lower low." },
  {
    id: "r03",
    speaker: "narrator",
    line: "Catching that yourself means two indicator panels in your head — four timeframes, seven instruments, all day.",
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

  {
    id: "r09",
    speaker: "narrator",
    line: "Nine event types, four timeframes, seven instruments, around the clock.",
  },
  { id: "n10", speaker: "narrator", line: "The second an event fires, the message is in your chat." },
  {
    id: "n11",
    speaker: "narrator",
    line: "Every signal keeps its own page — the feed and the whole history are free for everyone.",
  },

  // --- Оффер и CTA ----------------------------------------------------------
  { id: "r12", speaker: "narrator", line: "A subscription buys one thing: being told the moment it happens." },
  { id: "r13", speaker: "narrator", line: "Not finding out later. The first 24 hours are free." },
  { id: "n14", speaker: "narrator", line: "Press start. It begins watching within the same minute.", gap: 1.2 },
];

/**
 * МОНТАЖНЫЙ ЛИСТ — план в план как у `DiverBotAdCut`, кроме двух мест: график
 * держит две реплики вместо трёх (n08 снята), а счётчики под сеткой событий
 * говорят «7» инструментов вместо «2» монет.
 */
export const SHOTS: Shot[] = [
  // --- Тьма -----------------------------------------------------------------
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
    overlay: "03:14",
  },
  {
    line: "r03",
    scene: "dark",
    media: "assets/diverbot/night-desk.mp4",
    from: 0.6,
    weight: 1,
    note: "телефон экраном вниз: смотреть за рынком некому",
  },
  {
    line: "r03",
    scene: "wall",
    weight: 2,
    note: "панели множатся, камера отъезжает — перегруз",
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
    span: 2,
    media: "clips/DiverBotAd/promo-chart.mp4",
    speed: "fit",
    note: "цена и RSI рисуют сами себя, расхождение размечается на глазах",
  },
  {
    line: "r09",
    scene: "events",
    note: "девять значков событий продукта, счётчики набегают",
    overlay: "9 · 4 · 7 · 24/7",
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
  { line: "r12", scene: "offer", span: 2, note: "карточка подписки без суммы, подсветка суток демо" },
  { line: "n14", scene: "end", note: "знак, зелёная кнопка, хендл, дисклеймер" },
];

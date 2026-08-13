/**
 * ЗАХВАТ ЖИВОГО ПРОДУКТА: промо-сайт diverBot и его телеграм-мини-аппка → mp4/png.
 *
 *   npm run capture -- DiverBotAd                 # всё
 *   npm run capture -- DiverBotAd --only chart    # одна цель
 *
 * Зачем скрипт существует. Рекламный ролик обязан показывать работающий продукт,
 * а не его макет. Рисовать интерфейс заново в React значило бы рекламировать
 * то, чего нет: расхождение вылезет в первом же комментарии. Поэтому UI
 * снимается настоящим браузером с настоящего кода.
 *
 * ГЛАВНОЕ РЕШЕНИЕ — почему кадры, а не видеозапись браузера. У записи экрана
 * плавающий фреймрейт, и на 30fps она даёт микрорывки, которые в вертикальном
 * ролике читаются как брак рендера. Здесь каждый кадр снимается отдельным
 * скриншотом, а положение сцены задаётся ЯВНО (позиция прокрутки), а не
 * временем. Кадр — чистая функция номера кадра, ровно как золотое правило
 * требует от самой композиции. Склейка ffmpeg'ом даёт идеально ровные 30fps.
 *
 * Что снимается:
 *
 *   chart  ★ закреплённая секция промо-сайта, где цена и RSI рисуются сами.
 *            Это главный кадр ролика — см. подробный разбор у captureChart().
 *   feed     лента сигналов мини-аппки, прокрутка.
 *   card     карточка одного сигнала, прокрутка.
 *   shots    статичные снимки про запас (подписка, первый экран сайта, цены).
 *
 * Требуется: системный Chrome (CHROME_PATH), ffmpeg в PATH, собранные dist
 * промо-сайта и аппки, .venv и .env в самом diverBot (их поднимает
 * tools/serve_webapp.py — боевой бот для этого запускать не нужно).
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { run } from "./lib/media";
import { FORMAT } from "../src/lib/format";

/** Корень соседнего проекта. Переопределяется, если репозиторий лежит иначе. */
const DIVERBOT = process.env.DIVERBOT_ROOT ?? "C:/projects/claude/diverBot";

const CHROME =
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

/** Порт статики промо-сайта. Свой, чтобы не спорить с `astro dev` в соседнем окне. */
const PROMO_PORT = 4399;
/** Порт API мини-аппки задан в её же настройках; smoke-тест аппки ходит сюда же. */
const APP_PORT = 8080;

const PYTHON = path.join(DIVERBOT, ".venv/Scripts/python.exe");
const SERVE_WEBAPP = path.join(DIVERBOT, "tools/serve_webapp.py");
const PROMO_DIST = path.join(DIVERBOT, "promo/dist");

/** От чьего имени открываем аппку. Тот же пользователь, что и в smoke-тесте. */
const DEV_USER = 1;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════════════════
// Инфраструктура: серверы и браузер
// ═══════════════════════════════════════════════════════════════════════════

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * Статика промо-сайта своими руками. `astro preview` умеет то же самое, но
 * тянуть за собой npm-процесс соседнего проекта ради отдачи готовых файлов
 * значит получить лишнюю точку отказа: свой сервер поднимается за миллисекунды
 * и гарантированно слушает известный порт.
 */
function servePromo(): Promise<Server> {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      let file = path.join(PROMO_DIST, decodeURIComponent(url.pathname));
      if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
      if (!existsSync(file)) file = path.join(file, "index.html");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => server.listen(PROMO_PORT, () => resolve(server)));
}

/** Ждём, пока адрес начнёт отвечать. Питон поднимается не мгновенно. */
async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* ещё не слушает */
    }
    await sleep(300);
  }
  throw new Error(`Сервер не поднялся: ${url}`);
}

/** API мини-аппки без бота: он на сервере, и трогать его отсюда нельзя. */
async function serveApp(): Promise<ChildProcess> {
  if (!existsSync(PYTHON)) throw new Error(`Нет окружения diverBot: ${PYTHON}`);
  const child = spawn(PYTHON, [SERVE_WEBAPP], {
    cwd: DIVERBOT,
    stdio: "ignore",
    windowsHide: true,
  });
  await waitForServer(`http://127.0.0.1:${APP_PORT}/`);
  return child;
}

/** Подписанный initData: без него аппка не пустит дальше первого экрана. */
function initData(): string {
  return execFileSync(PYTHON, [SERVE_WEBAPP, "--print-init-data", String(DEV_USER)], {
    cwd: DIVERBOT,
    encoding: "utf8",
  }).trim();
}

async function launch(): Promise<Browser> {
  if (!existsSync(CHROME)) throw new Error(`Нет Chrome: ${CHROME} (задайте CHROME_PATH)`);
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--hide-scrollbars", "--disable-gpu", "--force-color-profile=srgb"],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Съёмка: кадры → mp4
// ═══════════════════════════════════════════════════════════════════════════

type Clip = { name: string; frames: number; seconds: number };

/** Прямоугольник вырезки в координатах ДОКУМЕНТА — их и ждёт puppeteer. */
type Box = { x: number; y: number; width: number; height: number };

/**
 * Снимает `frames` кадров, вызывая перед каждым `place(i)` — она обязана
 * поставить сцену в положение, однозначно определённое номером кадра.
 * Собирает mp4 без потерь по времени: ffmpeg получает готовую
 * последовательность и просто присваивает ей частоту проекта.
 *
 * `place` может вернуть прямоугольник вырезки. Возвращать его приходится
 * покадрово, а не задавать один раз: puppeteer отсчитывает `clip` от начала
 * ДОКУМЕНТА, а закреплённая секция стоит на месте относительно ЭКРАНА — то
 * есть её документные координаты уезжают вместе с прокруткой. Один раз
 * посчитанная вырезка попала бы в первый экран сайта.
 */
async function shootFrames(args: {
  page: Page;
  outFile: string;
  frames: number;
  place: (i: number) => Promise<Box | void>;
}): Promise<Clip> {
  const { page, outFile, frames, place } = args;
  const name = path.basename(outFile);
  const tmp = path.join(path.dirname(outFile), `.frames-${path.parse(outFile).name}`);
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });

  const t0 = Date.now();
  for (let i = 0; i < frames; i += 1) {
    const clip = (await place(i)) || undefined;
    await page.screenshot({
      path: path.join(tmp, `${String(i).padStart(5, "0")}.png`) as `${string}.png`,
      clip,
      optimizeForSpeed: true,
    });
    if (i % 30 === 0) {
      process.stdout.write(`\r  ${name}: ${i + 1}/${frames} кадров…`);
    }
  }

  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-framerate", String(FORMAT.fps),
    "-i", path.join(tmp, "%05d.png"),
    // Нечётные стороны libx264 не берёт, а размеры вырезки диктует вёрстка.
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "16",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outFile,
  ]);
  await rm(tmp, { recursive: true, force: true });

  const seconds = frames / FORMAT.fps;
  console.log(
    `\r  ${name}: ${frames} кадров, ${seconds.toFixed(1)} c ` +
      `(снято за ${((Date.now() - t0) / 1000).toFixed(0)} c)`,
  );
  return { name, frames, seconds };
}

// ═══════════════════════════════════════════════════════════════════════════
// ★ Цель chart: анимация цены и RSI на промо-сайте
// ═══════════════════════════════════════════════════════════════════════════

/** Сколько кадров рисуется анимация. 240 при 30fps — восемь секунд с запасом. */
const CHART_FRAMES = 240;
/** Длина закрепления секции, px. Задана в promo/src/scripts/motion.js: `end: "+=2000"`. */
const CHART_SCROLL = 2000;
/**
 * Выдержка перед снимком, мс. У секции `scrub: 1`: GSAP не прыгает за
 * прокруткой, а ДОГОНЯЕТ её твином длиной ровно в секунду. Снимок без выдержки
 * поймал бы недоехавшее состояние, причём на каждом кадре — своё, и линия RSI
 * пошла бы рывками. Секунда с небольшим гарантирует, что твин доигран.
 */
const CHART_SETTLE = 1200;

/**
 * Снимает ту самую секцию, ради которой всё затевалось.
 *
 * Почему это вообще получается ровно. На широком экране секция закреплена
 * (`pin: true`) и привязана к прокрутке (`scrub`): кадр стоит на месте, а
 * колесо работает ползунком анимации. Значит картинка — чистая функция позиции
 * прокрутки, и мы вольны идти по ней с любым шагом и собирать любой фреймрейт.
 * Вживую человек проматывает эти 2000 px за пару секунд рывками; здесь те же
 * 2000 px раскладываются на 240 ровных шагов.
 *
 * Снимаем вырезкой по самой фигуре, а не страницей целиком: на десктопе
 * заголовок лежит СЛЕВА от графика, и в вертикальный кадр такая раскладка не
 * ложится. Берём только фигуру, а заголовок ролик рисует сам тем же шрифтом.
 */
async function captureChart(browser: Browser, outDir: string, frames: number): Promise<Clip> {
  const page = await browser.newPage();
  // Ширина 1440 обязательна: закрепление живёт в ветке `(min-width: 900px)`,
  // на узком экране секция едет вместе со страницей и снять её ровно нельзя.
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${PROMO_PORT}/`, { waitUntil: "networkidle2" });
  // Вступительная лента первого экрана идёт около двух секунд.
  await sleep(3000);

  const chartTop = await page.evaluate(() => {
    const section = document.querySelector("[data-chart-section]");
    if (!section) throw new Error("Нет [data-chart-section] — промо-сайт пересобран?");
    return section.getBoundingClientRect().top + window.scrollY;
  });

  /**
   * Вырезка по фигуре в координатах документа. Экранный прямоугольник у
   * закреплённой секции постоянен, документный — нет, поэтому считаем его на
   * каждом кадре: `rect.top + scrollY`.
   */
  const boxNow = () =>
    page.evaluate(() => {
      const figure = document.querySelector("[data-chart-figure]");
      if (!figure) throw new Error("Нет [data-chart-figure]");
      const r = figure.getBoundingClientRect();
      // Небольшой запас по краям: у линии RSI и подписей зон есть свес.
      const pad = 16;
      return {
        x: Math.max(0, Math.floor(r.x + window.scrollX - pad)),
        y: Math.max(0, Math.floor(r.y + window.scrollY - pad)),
        width: Math.ceil(r.width + pad * 2),
        height: Math.ceil(r.height + pad * 2),
        screenTop: Math.round(r.top),
      };
    });

  // Входим в зону закрепления и даём сцене осесть: до этого фигура ещё едет.
  await page.evaluate((y) => window.scrollTo(0, y), chartTop);
  await sleep(1600);
  const first = await boxNow();

  // Проверка закрепления: если экранная позиция фигуры уезжает вместе с
  // прокруткой, значит ветка `wide` не сработала и снимать нечего — секция
  // проедет мимо кадра, и это надо увидеть здесь, а не через шесть минут.
  await page.evaluate((y) => window.scrollTo(0, y), chartTop + CHART_SCROLL / 2);
  await sleep(1600);
  const mid = await boxNow();
  if (Math.abs(mid.screenTop - first.screenTop) > 8) {
    throw new Error(
      `Секция не закреплена: фигура уехала на ${mid.screenTop - first.screenTop} px. ` +
        `Проверьте ветку (min-width: 900px) в promo/src/scripts/motion.js`,
    );
  }
  console.log(
    `  фигура ${first.width}×${first.height} @ dSF 2 → ` +
      `${first.width * 2}×${first.height * 2} px, закрепление держит`,
  );

  const clip = await shootFrames({
    page,
    outFile: path.join(outDir, "promo-chart.mp4"),
    frames,
    place: async (i) => {
      const y = chartTop + (CHART_SCROLL * i) / (frames - 1);
      await page.evaluate((to) => window.scrollTo(0, to), y);
      await sleep(CHART_SETTLE);
      return boxNow();
    },
  });

  await page.close();
  return clip;
}

// ═══════════════════════════════════════════════════════════════════════════
// Цели аппки: лента и карточка сигнала
// ═══════════════════════════════════════════════════════════════════════════

/** Тёмная тема клиента телеграма — по этим значениям аппка решает, что тема тёмная. */
const DARK_THEME = {
  bg_color: "#17212b",
  text_color: "#ffffff",
  hint_color: "#708499",
  link_color: "#6ab7ff",
  button_color: "#5288c1",
  button_text_color: "#ffffff",
  secondary_bg_color: "#232e3c",
};

/**
 * Открывает аппку в телефонном окне и приводит её к виду, в котором снимаем:
 * тёмная тема и английский язык.
 *
 * Язык — единственное неочевидное место. `dev_init_data` подписывает
 * `language_code: "ru"`, но истина для аппки не в нём, а в колонке `viewer.lang`,
 * которую отдаёт `/api/meta`. Поэтому язык не подсовывается снаружи, а
 * переключается изнутри — тем же родным `<select>` в шторке настроек, которым
 * его меняет живой человек. Выбор уезжает в базу, аппка перерисовывается, и
 * дальше всё снимается по-английски.
 */
async function openApp(browser: Browser, data: string, route = ""): Promise<Page> {
  const page = await browser.newPage();
  // Телефонное окно × 3: 1125 px по ширине — с запасом на 1080-широкий кадр.
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 3 });

  // Телеграм передаёт подпись фрагментом адреса, и его скрипт читает оттуда.
  const fragment =
    `#tgWebAppData=${encodeURIComponent(data)}` +
    `&tgWebAppVersion=8.0&tgWebAppPlatform=android` +
    `&tgWebAppThemeParams=${encodeURIComponent(JSON.stringify(DARK_THEME))}`;
  await page.goto(`http://127.0.0.1:${APP_PORT}/${route}${fragment}`, {
    waitUntil: "networkidle2",
  });
  await sleep(1500);

  await page.evaluate((params) => {
    (window as unknown as {
      Telegram: { WebView: { receiveEvent: (e: string, p: unknown) => void } };
    }).Telegram.WebView.receiveEvent("theme_changed", { theme_params: params });
  }, DARK_THEME);
  await sleep(400);

  return page;
}

/** Переключает аппку на английский. Делается один раз: язык хранится в базе. */
async function switchToEnglish(page: Page): Promise<void> {
  const lang = await page.evaluate(() => document.documentElement.lang);
  if (lang === "en") return;

  // Шестерёнка — вторая иконка шапки, первая открывает меню разделов.
  const buttons = await page.$$(".header .icon-button");
  if (buttons.length < 2) throw new Error("Не нашлась шестерёнка настроек в шапке");
  await buttons[1].click();
  await sleep(700);

  const select = await page.$("select");
  if (!select) throw new Error("В шторке настроек нет выпадающего списка языка");
  await page.select("select", "en");
  // Смена языка уходит на сервер и возвращается новым словарём.
  await sleep(1800);

  // Закрываем шторку тем же способом, что и человек, — клавишей.
  await page.keyboard.press("Escape");
  await sleep(700);

  // Снимаем фокус: браузер рисует вокруг нажатой шестерёнки светлое кольцо, и
  // в кадре оно читается как подсветка кнопки, которой в продукте нет.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await sleep(200);
}

/** Максимальная прокрутка внутреннего скроллера аппки. */
async function scrollerMax(page: Page): Promise<number> {
  return page.evaluate(() => {
    const area = document.querySelector("[data-role='scroller']");
    if (!area) throw new Error("Нет [data-role='scroller']");
    return Math.max(0, area.scrollHeight - area.clientHeight);
  });
}

/**
 * Прокрутка экрана аппки. Положение задаётся присвоением `scrollTop`, а не
 * анимацией: присвоение мгновенно и точно, поэтому кадр однозначно определён
 * своим номером и выдержка нужна только на перерисовку.
 *
 * `limit` ограничивает ход: у ленты сигналов дальше идёт кнопка «показать ещё»,
 * и упираться в неё в рекламе незачем — интереснее сами строки.
 */
async function captureScroll(args: {
  page: Page;
  outFile: string;
  frames: number;
  limit?: number;
}): Promise<Clip> {
  const { page, outFile, frames, limit = 1 } = args;
  const max = (await scrollerMax(page)) * limit;
  if (max <= 0) console.log(`  ${path.basename(outFile)}: содержимое влезло целиком, снимаем статикой`);

  return shootFrames({
    page,
    outFile,
    frames,
    place: async (i) => {
      // Плавный старт и остановка: рывок в первом кадре читается как склейка.
      const t = i / (frames - 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      await page.evaluate(
        (top) => {
          const area = document.querySelector("[data-role='scroller']");
          if (area) area.scrollTop = top;
        },
        max * eased,
      );
      await sleep(60);
    },
  });
}

/** Первый сигнал ленты — его карточку и снимаем. */
async function firstSignalId(data: string): Promise<number> {
  const res = await fetch(`http://127.0.0.1:${APP_PORT}/api/signals?limit=1`, {
    headers: { Authorization: `tma ${data}` },
  });
  const body = (await res.json()) as { items?: { id: number }[] };
  const id = body.items?.[0]?.id;
  if (!id) throw new Error("В базе нет ни одного сигнала — снимать нечего");
  return id;
}

// ═══════════════════════════════════════════════════════════════════════════
// Статичные снимки про запас
// ═══════════════════════════════════════════════════════════════════════════

async function captureStills(browser: Browser, data: string, outDir: string): Promise<void> {
  const subscribe = await openApp(browser, data, "?screen=subscribe");
  await switchToEnglish(subscribe);
  await sleep(1200);
  await subscribe.screenshot({ path: path.join(outDir, "app-subscribe.png") as `${string}.png` });
  await subscribe.close();
  console.log("  app-subscribe.png");

  const promo = await browser.newPage();
  await promo.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });
  await promo.goto(`http://127.0.0.1:${PROMO_PORT}/`, { waitUntil: "networkidle2" });
  await sleep(3000);
  await promo.screenshot({ path: path.join(outDir, "promo-hero.png") as `${string}.png` });
  console.log("  promo-hero.png");

  await promo.evaluate(() => document.querySelector("#pricing")?.scrollIntoView({ block: "start" }));
  await sleep(1800);
  await promo.screenshot({ path: path.join(outDir, "promo-pricing.png") as `${string}.png` });
  console.log("  promo-pricing.png");
  await promo.close();
}

// ═══════════════════════════════════════════════════════════════════════════

const TARGETS = ["chart", "feed", "card", "stills"] as const;
type Target = (typeof TARGETS)[number];

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const onlyIdx = argv.indexOf("--only");
  const framesIdx = argv.indexOf("--frames");
  return {
    comp: positional[0] ?? "DiverBotAd",
    only: onlyIdx >= 0 ? ((argv[onlyIdx + 1]?.split(",") ?? []) as Target[]) : null,
    // Проба: прогнать ту же траекторию десятком кадров и посмотреть глазами,
    // прежде чем отдавать шесть минут полному прогону.
    frames: framesIdx >= 0 ? Number(argv[framesIdx + 1]) : CHART_FRAMES,
  };
}

async function main() {
  const { comp, only, frames } = parseArgs(process.argv.slice(2));
  const targets = only ?? [...TARGETS];
  const bad = targets.filter((t) => !TARGETS.includes(t));
  if (bad.length > 0) {
    console.error(`Неизвестные цели: ${bad.join(", ")}. Есть: ${TARGETS.join(", ")}`);
    process.exit(1);
  }

  const outDir = path.resolve("public/clips", comp);
  await mkdir(outDir, { recursive: true });

  const needsPromo = targets.includes("chart") || targets.includes("stills");
  const needsApp = targets.includes("feed") || targets.includes("card") || targets.includes("stills");

  let promoServer: Server | null = null;
  let appServer: ChildProcess | null = null;
  let browser: Browser | null = null;
  const clips: Clip[] = [];

  try {
    if (needsPromo) {
      promoServer = await servePromo();
      console.log(`Промо-сайт: http://127.0.0.1:${PROMO_PORT}/ (${PROMO_DIST})`);
    }
    let data = "";
    if (needsApp) {
      appServer = await serveApp();
      data = initData();
      console.log(`Мини-аппка: http://127.0.0.1:${APP_PORT}/`);
    }

    browser = await launch();

    if (targets.includes("chart")) {
      console.log("\n★ chart — анимация цены и RSI");
      clips.push(await captureChart(browser, outDir, frames));
    }

    if (targets.includes("feed") || targets.includes("card")) {
      console.log("\napp — мини-аппка");
      const page = await openApp(browser, data);
      await switchToEnglish(page);

      if (targets.includes("feed")) {
        // Лента длинная; берём верхние две трети — там плотные строки сигналов.
        clips.push(
          await captureScroll({
            page,
            outFile: path.join(outDir, "app-feed.mp4"),
            frames: 120,
            limit: 0.65,
          }),
        );
      }
      await page.close();

      if (targets.includes("card")) {
        const id = await firstSignalId(data);
        const card = await openApp(browser, data, `?signal=${id}`);
        await sleep(1200);
        clips.push(
          await captureScroll({
            page: card,
            outFile: path.join(outDir, "app-card.mp4"),
            frames: 90,
            limit: 0.8,
          }),
        );
        await card.close();
      }
    }

    if (targets.includes("stills")) {
      console.log("\nstills — статичные снимки");
      await captureStills(browser, data, outDir);
    }

    const manifest = {
      capturedAt: new Date().toISOString(),
      fps: FORMAT.fps,
      clips: clips.map((c) => ({ file: `clips/${comp}/${c.name}`, ...c })),
    };
    await writeFile(
      path.join(outDir, "capture.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    console.log(`\nГотово: ${clips.length} клипов в ${outDir}`);
    for (const c of clips) console.log(`  ${c.name.padEnd(20)} ${c.seconds.toFixed(1)} c`);
  } finally {
    await browser?.close();
    promoServer?.close();
    appServer?.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * КОМПИЛЯТОР ДОСКИ: сценарий + озвучка + трассированные картинки → board.json.
 *
 * Считает в Node всё, что рендер иначе досчитывал бы по геометрии путей: длины
 * штрихов, боксы, посадку картинок по чернилам, расписание кадров, движение
 * камеры. В манифест не попадает ни одной величины, ради которой композиции
 * пришлось бы звать `@remotion/paths` чаще одного раза за кадр.
 *
 * Примеры:
 *   npm run board -- Whiteboard            # полная сборка
 *   npm run board -- Whiteboard --dry      # только раскладка, без ffmpeg (секунды)
 *   npm run board -- Whiteboard --silent   # без озвучки: тайминги по --seconds
 *
 * ГЛАВНОЕ ПРАВИЛО ТАЙМИНГОВ. Длительности копятся во ВРЕМЕНИ и округляются к
 * кадру на каждой границе (`Math.round(acc*fps) - startFrame`), а не
 * складываются в кадрах. Иначе ошибка округления копится, и к концу ролика
 * картинка уезжает от голоса.
 */
import "dotenv/config";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { FORMAT } from "../src/lib/format";
import { fitInkToBox, writeJson } from "./lib/artwork";
import { buildNarration, type VoiceClip } from "./lib/narration";
import type { ArtFile } from "./prepare-art";
import type {
  Phrase,
  BoardItem,
  ArtItem,
  TextItem,
  AccentItem,
  Stroke,
  BoardElement,
  CameraMove,
  NarrationPhrase,
  BoardManifest,
  Rect,
} from "../src/compositions/Whiteboard/types";

// ─── Константы раскладки (каждая с обоснованием — их крутят по фильмстрипу) ───

/** Шаг экрана. 1920 − 360 нахлёста: кусок предыдущего экрана остаётся виден. */
const SCREEN_STEP = 1560;
/** Прокрутка камеры на следующий экран. */
const SCROLL_FRAMES = 18;
/** Перелёт руки к новому элементу. */
const TRAVEL_FRAMES = 6;
/** Отрыв пера между штрихами внутри элемента. */
const PEN_UP_FRAMES = 2;
/** Короче — штрих читается как глитч, а не как движение. */
const MIN_STROKE_FRAMES = 3;
/**
 * Сублинейное распределение бюджета по длине штриха. Чистая пропорция отдаёт
 * длинному контуру почти весь бюджет, а мелкая деталь мелькает за кадр.
 * Одного показателя мало — нужен ещё и пол MIN_STROKE_FRAMES: на реальной
 * иконке разброс длин доходил до 84×.
 */
const STROKE_EXP = 0.7;
/** Хвост после последнего элемента: уход руки и финальный холд. */
const TAIL_FRAMES = 40;
/** Толщина пера маски относительно толщины линии рисунка. */
const MASK_WIDTH_RATIO = 0.02;
/** Толщина краски акцентов, экранные px. */
const ACCENT_WIDTH = 12;
/**
 * Потолок числа штрихов на одну иллюстрацию. Больше — рисунок «проявляется
 * рябью»: глаз не успевает проследить за пером, и эффект рисования пропадает.
 */
const MAX_CONTOURS = 16;
/**
 * Ширина знака относительно кегля — ОЦЕНКА для позиции руки по строке.
 * Метрик шрифта в Node нет. Клип текста считается в браузере по фактическому
 * контенту (`width: max-content`), так что от этой оценки зависит только то,
 * насколько точно перо стоит на кромке буквы. Значения подняты по факту:
 * кириллический капс в Caveat заметно шире строчных.
 */
const ADVANCE = { hand: 0.5, sans: 0.58 } as const;

type Args = { comp: string | null; dry: boolean; silent: boolean; seconds: number };

function parseArgs(argv: string[]): Args {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const secIdx = argv.indexOf("--seconds");
  return {
    comp: positional[0] ?? null,
    dry: argv.includes("--dry"),
    silent: argv.includes("--silent"),
    seconds: secIdx >= 0 ? Number(argv[secIdx + 1]) : 3,
  };
}

/** Детерминированный ГПСЧ: без него `still` и полный рендер разойдутся. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Раскладывает бюджет кадров по штрихам: вес ∝ length^0.7, плюс пол в кадрах.
 *
 * Гарантирует, что сумма РОВНО равна выданному бюджету: пол в кадрах раздаётся
 * всем сразу, а по весам делится только остаток. Наивная версия («взять
 * максимум из веса и пола») переполняла слот на плотных картинках — 19 контуров
 * при поле в 3 кадра требуют 93 кадра, а слот был 90, и элементы наезжали друг
 * на друга, ломая инвариант «активный штрих в кадре ровно один».
 *
 * Если бюджета не хватает даже на пол, сначала схлопываются отрывы пера, потом
 * снижается сам пол. Об этом сообщает `tight` — вызывающий печатает предупреждение.
 */
function scheduleStrokes(
  lengths: number[],
  drawFrom: number,
  drawFrames: number,
): { schedule: { from: number; frames: number }[]; tight: boolean } {
  const n = lengths.length;

  let penUp = PEN_UP_FRAMES;
  let minFrames = MIN_STROKE_FRAMES;
  let tight = false;

  if (n * minFrames + penUp * (n - 1) > drawFrames) {
    penUp = 0;
    tight = true;
  }
  const budget = Math.max(n, drawFrames - penUp * (n - 1));
  if (n * minFrames > budget) {
    minFrames = Math.max(1, Math.floor(budget / n));
    tight = true;
  }

  // Пол раздаём всем, по весам делим только остаток — так сумма сходится точно.
  const extra = Math.max(0, budget - n * minFrames);
  const w = lengths.map((l) => Math.max(l, 1e-3) ** STROKE_EXP);
  const total = w.reduce((a, b) => a + b, 0);

  let cursor = drawFrom;
  let acc = 0;
  let done = 0;
  const schedule = lengths.map((_, i) => {
    acc += w[i];
    const target = Math.round((extra * acc) / total);
    const frames = minFrames + (target - done);
    done = target;
    const out = { from: cursor, frames };
    cursor += frames + (i < n - 1 ? penUp : 0);
    return out;
  });

  return { schedule, tight };
}

/**
 * Сливает мелкие контуры, пока их не станет не больше `max`.
 *
 * Зачем: богатая иллюстрация даёт 30+ контуров, и на четырёхсекундной фразе
 * каждому достаётся по два кадра — рисунок «проявляется рябью», а не рисуется.
 * Слитые контуры остаются отдельными подпутями внутри одного `d`: dasharray
 * идёт по суммарной длине, поэтому они всё равно рисуются по очереди, просто
 * делят один слот и одно перо.
 *
 * Сливаются только соседи по порядку рисования и только с одинаковым `solid`:
 * иначе заливка сплошной стрелки перекинулась бы на контур линии рядом.
 */
function mergeContours(
  contours: { d: string; length: number; solid: boolean }[],
  max: number,
): { d: string; length: number; solid: boolean }[] {
  const out = contours.map((c) => ({ ...c }));
  while (out.length > max) {
    let bestIdx = -1;
    let bestLen = Infinity;
    for (let i = 0; i < out.length - 1; i++) {
      if (out[i].solid !== out[i + 1].solid) continue;
      const pairLen = out[i].length + out[i + 1].length;
      if (pairLen < bestLen) {
        bestLen = pairLen;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break; // соседей с одинаковым solid не осталось
    const [a, b] = [out[bestIdx], out[bestIdx + 1]];
    out.splice(bestIdx, 2, { d: `${a.d} ${b.d}`, length: a.length + b.length, solid: a.solid });
  }
  return out;
}

/** Прямая слева направо — по ней рука ведёт строку текста. */
function lineStroke(y: number, width: number): { d: string; length: number } {
  return { d: `M 0 ${y} L ${width} ${y}`, length: Math.max(width, 1) };
}

/**
 * «Нарисованная от руки» фигура вокруг цели: дрожащая, но детерминированная.
 *
 * Координаты ЛОКАЛЬНЫЕ — начало в левом верхнем углу собственного бокса
 * акцента, сама цель лежит внутри со смещением `pad`. Иначе пришлось бы давать
 * акценту бокс во всю доску, и проверка safe-area начинала ругаться на него
 * при каждом прогоне.
 */
function accentPath(
  style: AccentItem["style"],
  target: Rect,
  pad: number,
  seed: number,
): { d: string; box: Rect; length: number } {
  const rnd = mulberry32(seed);
  const jitter = (amp: number) => (rnd() - 0.5) * 2 * amp;

  // Запас поверх padding: дрожание и полтолщины пера не должны обрезаться.
  const margin = pad + 24;
  const box: Rect = {
    x: target.x - margin,
    y: target.y - margin,
    w: target.w + margin * 2,
    h: target.h + margin * 2,
  };
  // Цель в локальных координатах бокса.
  const t = { x: margin, y: margin, w: target.w, h: target.h };
  const join = (pts: string[]) => `M ${pts[0]} ${pts.slice(1).map((p) => `L ${p}`).join(" ")}`;

  if (style === "underline") {
    const y = t.y + t.h + pad * 0.6;
    const pts: string[] = [];
    for (let i = 0; i <= 8; i++) {
      pts.push(`${(t.x - pad + ((t.w + pad * 2) * i) / 8).toFixed(1)} ${(y + jitter(5)).toFixed(1)}`);
    }
    return { d: join(pts), box, length: t.w + pad * 2 };
  }

  if (style === "box") {
    const x0 = t.x - pad;
    const y0 = t.y - pad;
    const x1 = t.x + t.w + pad;
    const y1 = t.y + t.h + pad;
    const j = () => jitter(6);
    const pts = [
      `${(x0 + j()).toFixed(1)} ${(y0 + j()).toFixed(1)}`,
      `${(x1 + j()).toFixed(1)} ${(y0 + j()).toFixed(1)}`,
      `${(x1 + j()).toFixed(1)} ${(y1 + j()).toFixed(1)}`,
      `${(x0 + j()).toFixed(1)} ${(y1 + j()).toFixed(1)}`,
      `${x0.toFixed(1)} ${(y0 + 10).toFixed(1)}`,
    ];
    return { d: join(pts), box, length: 2 * (t.w + t.h + pad * 4) };
  }

  // circle: эллипс с перехлёстом на 380° — так обводят от руки
  const cx = t.x + t.w / 2;
  const cy = t.y + t.h / 2;
  const rx = t.w / 2 + pad;
  const ry = t.h / 2 + pad;
  const start = -Math.PI / 2 - 0.5;
  const pts: string[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const a = start + (i / steps) * Math.PI * 2 * (380 / 360);
    const k = 1 + jitter(0.03);
    pts.push(`${(cx + Math.cos(a) * rx * k).toFixed(1)} ${(cy + Math.sin(a) * ry * k).toFixed(1)}`);
  }
  // Периметр эллипса по Рамануджану — оценки хватает, штрих всё равно один.
  const length = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry))) * (380 / 360);
  return { d: join(pts), box, length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.comp) {
    console.error("Укажите композицию: npm run board -- <Композиция>");
    process.exit(1);
  }
  const comp = args.comp;
  const compDir = path.resolve("src/compositions", comp);
  const t0 = Date.now();

  const mod = (await import(pathToFileURL(path.join(compDir, "script.ts")).href)) as {
    SCRIPT?: Phrase[];
    BOARD?: BoardItem[];
  };
  if (!mod.SCRIPT || !mod.BOARD) throw new Error(`${comp}/script.ts должен экспортировать SCRIPT и BOARD`);
  const { SCRIPT, BOARD } = mod;

  // --- 1. Трассированные картинки -----------------------------------------
  const artPath = path.resolve("public/whiteboard/art", comp, "art.json");
  const art: ArtFile = existsSync(artPath)
    ? (JSON.parse(await readFile(artPath, "utf8")) as ArtFile)
    : { composition: comp, items: {} };

  // --- 2. Озвучка ----------------------------------------------------------
  let phrases: NarrationPhrase[];
  // Пустая строка, а не null: пропсы композиции редактируются в студии, а
  // nullable-поля она показывает неудобно.
  let narrationFile = "";

  const voPath = path.resolve("public/vo", comp, "vo.json");
  if (args.silent || args.dry || !existsSync(voPath)) {
    if (!args.silent && !args.dry) {
      console.log(`⚠ Нет ${path.relative(process.cwd(), voPath)} — раскладка по ${args.seconds} c на фразу`);
    }
    let cursor = 0;
    phrases = SCRIPT.map((p) => {
      const start = cursor;
      cursor += args.seconds + (p.gap ?? 0);
      return { id: p.id, line: p.line, start, end: start + args.seconds, words: [] };
    });
  } else {
    const voClips = JSON.parse(await readFile(voPath, "utf8")) as VoiceClip[];
    const narration = await buildNarration({ comp, script: SCRIPT, voClips });
    phrases = narration.phrases;
    narrationFile = narration.narrationFile;
  }

  // --- 3. Раскладка: фраза → её элементы → штрихи ---------------------------
  const warnings: string[] = [];
  const elements: BoardElement[] = [];
  const boxes = new Map<string, Rect>(); // id элемента → бокс на доске, для акцентов
  const report: string[] = [];

  let timeAcc = 0;
  let prevScreen = BOARD[0]?.screen ?? 0;
  const camera: CameraMove[] = [];

  for (const phrase of phrases) {
    const source = SCRIPT.find((p) => p.id === phrase.id);
    const own = BOARD.filter((i) => i.line === phrase.id);
    const span = phrase.end - phrase.start + (source?.gap ?? 0);

    if (own.length === 0) {
      // Фраза без элементов — это нормально (пауза в рисовании), но время идёт.
      timeAcc += span;
      continue;
    }
    const totalWeight = own.reduce((s, i) => s + (i.weight ?? 1), 0);

    for (const item of own) {
      const duration = (span * (item.weight ?? 1)) / totalWeight;
      const startFrame = Math.round(timeAcc * FORMAT.fps);
      timeAcc += duration;
      const frames = Math.round(timeAcc * FORMAT.fps) - startFrame;

      // Смена экрана: камера едет, и рука летит вместе с бумагой.
      const isNewScreen = item.screen !== prevScreen;
      if (isNewScreen) {
        camera.push({
          from: startFrame,
          to: startFrame + SCROLL_FRAMES,
          yFrom: -prevScreen * SCREEN_STEP,
          yTo: -item.screen * SCREEN_STEP,
        });
        prevScreen = item.screen;
      }

      const travel = isNewScreen
        ? Math.max(SCROLL_FRAMES, TRAVEL_FRAMES)
        : Math.min(TRAVEL_FRAMES, Math.floor(frames * 0.3));
      const hold = Math.max(0, Math.min(item.hold ?? 0, frames - travel - MIN_STROKE_FRAMES));
      const drawFrom = startFrame + travel;
      const drawFrames = Math.max(MIN_STROKE_FRAMES, frames - travel - hold);
      const screenY = item.screen * SCREEN_STEP;

      if (item.kind === "art") {
        const rec = art.items[item.id];
        if (!rec) {
          warnings.push(`${item.id}: нет в art.json — прогоните npm run art -- ${comp}`);
          continue;
        }
        const target: Rect = { ...item.rect, y: item.rect.y + screenY };
        const fit = fitInkToBox({ width: rec.width, height: rec.height, inkBox: rec.inkBox }, target);
        // Столько контуров умещается в слот, не опускаясь ниже читаемого
        // минимума кадров на штрих.
        const affordable = Math.max(4, Math.floor(drawFrames / (MIN_STROKE_FRAMES + PEN_UP_FRAMES)));
        const contours = mergeContours(rec.contours, Math.min(MAX_CONTOURS, affordable));
        if (contours.length < rec.contours.length) {
          report.push(
            `${"".padEnd(14)}      слито контуров: ${rec.contours.length} → ${contours.length}`,
          );
        }
        const { schedule, tight } = scheduleStrokes(
          contours.map((c) => c.length),
          drawFrom,
          drawFrames,
        );
        const strokes: Stroke[] = contours.map((c, i) => ({
          d: c.d,
          length: c.length,
          from: schedule[i].from,
          frames: schedule[i].frames,
          // Сплошная фигура: после обводки контур заливается в маске, иначе у
          // залитой стрелки открылась бы кромка, а середина осталась скрытой.
          ...(c.solid ? { fill: true } : {}),
        }));
        const perStroke = drawFrames / strokes.length;
        if (tight) {
          warnings.push(
            `${item.id}: ${strokes.length} контуров на ${drawFrames} кадрах ` +
              `(${perStroke.toFixed(1)} кадра на контур) — дайте weight, удлините фразу ` +
              `или упростите сюжет картинки`,
          );
        }

        elements.push({
          id: item.id,
          line: item.line,
          screen: item.screen,
          render: "masked-art",
          src: rec.src,
          viewBox: rec.viewBox,
          box: fit.box,
          transform: fit.transform,
          // Контур идёт по КРАЮ чернил: перо маски должно перекрыть штрих с запасом.
          maskWidth: Math.max(rec.width, rec.height) * MASK_WIDTH_RATIO,
          strokes,
        });
        boxes.set(item.id, target);
        report.push(
          `${item.id.padEnd(14)} art   кадры ${String(startFrame).padStart(4)}–${String(startFrame + frames).padStart(4)}  контуров ${String(strokes.length).padStart(3)}  ${perStroke.toFixed(1)} к/контур`,
        );
      } else if (item.kind === "text") {
        const t = item as TextItem;
        const size = t.size ?? 92;
        // Дефолт — печатный, как в референсе. Текст открывается протяжкой, то
        // есть рука его ЗАКРАШИВАЕТ; рукописный шрифт под протяжкой обещает
        // письмо по буквам, которого протяжка дать не может, и читается фальшью.
        const font = t.font ?? "sans";
        const rawLines = t.text.split("\n");
        // Метрик шрифта в Node нет: ширина оценивается по кеглю. Ошибка ±10%
        // сдвигает руку на размер пера — заметно только на длинных строках,
        // а их на доске по определению нет.
        const widths = rawLines.map((l) => Math.max(1, l.length * size * ADVANCE[font]));
        const lineH = size * 1.15;
        const boxW = Math.max(...widths);
        const boxH = lineH * rawLines.length;
        const { schedule } = scheduleStrokes(widths, drawFrom, drawFrames);

        elements.push({
          id: item.id,
          line: item.line,
          screen: item.screen,
          render: "text",
          viewBox: `0 0 ${boxW} ${boxH}`,
          box: { x: t.x, y: t.y + screenY, w: boxW, h: boxH },
          transform: { tx: t.x, ty: t.y + screenY, scale: 1 },
          color: t.color ?? "#1f2937",
          fontSize: size,
          font,
          align: t.align ?? "left",
          lines: rawLines.map((text, i) => ({ text, top: i * lineH, width: widths[i] })),
          strokes: rawLines.map((_, i) => {
            const s = lineStroke(i * lineH + size * 0.78, widths[i]);
            return { ...s, from: schedule[i].from, frames: schedule[i].frames };
          }),
        });
        boxes.set(item.id, { x: t.x, y: t.y + screenY, w: boxW, h: boxH });
        report.push(
          `${item.id.padEnd(14)} text  кадры ${String(startFrame).padStart(4)}–${String(startFrame + frames).padStart(4)}  строк ${rawLines.length}`,
        );
      } else {
        const a = item as AccentItem;
        const target = boxes.get(a.target);
        if (!target) {
          warnings.push(`${a.id}: акцент ссылается на «${a.target}», а тот ещё не нарисован`);
          continue;
        }
        const pad = a.padding ?? 26;
        const { d, box, length } = accentPath(a.style, target, pad, a.seed ?? hashId(a.id));
        boxes.set(a.id, box);
        const { schedule } = scheduleStrokes([length], drawFrom, drawFrames);
        elements.push({
          id: a.id,
          line: a.line,
          screen: a.screen,
          render: "strokes",
          viewBox: `0 0 ${box.w} ${box.h}`,
          box,
          transform: { tx: box.x, ty: box.y, scale: 1 },
          color: a.color ?? "#e11d48",
          strokeWidth: a.strokeWidth ?? ACCENT_WIDTH,
          strokes: [{ d, length, from: schedule[0].from, frames: schedule[0].frames }],
        });
        report.push(
          `${a.id.padEnd(14)} acc   кадры ${String(startFrame).padStart(4)}–${String(startFrame + frames).padStart(4)}  вокруг ${a.target}`,
        );
      }
    }
  }

  if (elements.length === 0) throw new Error("Ни одного элемента не собралось — смотрите предупреждения выше");

  // --- 4. Валидация --------------------------------------------------------
  const screens = Math.max(...BOARD.map((i) => i.screen)) + 1;
  for (const item of BOARD) {
    if (!SCRIPT.some((p) => p.id === item.line)) {
      warnings.push(`${item.id}: ссылается на несуществующую фразу «${item.line}»`);
    }
  }
  // Проверяем ЧЕРНИЛА, а не холст: у картинки холст всегда больше рисунка на
  // ширину полей генератора, и проверка по нему ругалась бы на каждый элемент.
  for (const [id, rect] of boxes) {
    const el = elements.find((e) => e.id === id);
    if (!el) continue;
    const localY = rect.y - el.screen * SCREEN_STEP;
    // Числа из src/components/SafeArea.tsx: верх/низ перекрыты интерфейсом платформ.
    if (localY < 240) warnings.push(`${id}: заезжает в верхнюю safe-area (y=${Math.round(localY)} < 240)`);
    if (localY + rect.h > FORMAT.height - 340) {
      warnings.push(`${id}: заезжает в нижнюю safe-area (низ=${Math.round(localY + rect.h)} > 1580)`);
    }
  }
  // Пересечение слотов сломало бы инвариант «активный штрих ровно один».
  const spans = elements
    .map((el) => ({
      id: el.id,
      from: el.strokes[0].from,
      to: el.strokes[el.strokes.length - 1].from + el.strokes[el.strokes.length - 1].frames,
    }))
    .sort((a, b) => a.from - b.from);
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].from < spans[i - 1].to) {
      warnings.push(`Слоты пересекаются: ${spans[i - 1].id} (до ${spans[i - 1].to}) и ${spans[i].id} (с ${spans[i].from})`);
    }
  }

  const lastFrame = Math.max(...spans.map((s) => s.to));
  const durationInFrames = Math.max(lastFrame, Math.round(timeAcc * FORMAT.fps)) + TAIL_FRAMES;

  const manifest: BoardManifest = {
    narrationFile,
    durationInFrames,
    board: { width: FORMAT.width, height: (screens - 1) * SCREEN_STEP + FORMAT.height, screens, screenStep: SCREEN_STEP },
    elements,
    camera,
    phrases,
    hand: { exitFrom: lastFrame + 6, exitFrames: 22 },
  };

  const out = path.resolve("public/clips", comp, "board.json");
  await writeJson(out, manifest);

  console.log(`\n${report.join("\n")}`);
  if (warnings.length > 0) {
    console.log(`\n⚠ Предупреждения (${warnings.length}):`);
    warnings.forEach((w) => console.log(`  • ${w}`));
  }
  console.log(
    `\nГотово за ${((Date.now() - t0) / 1000).toFixed(0)} c → ${path.relative(process.cwd(), out)}\n` +
      `  ${elements.length} элементов, ${screens} экрана, ${durationInFrames} кадров ` +
      `(${(durationInFrames / FORMAT.fps).toFixed(1)} c)${narrationFile ? "" : ", БЕЗ озвучки"}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

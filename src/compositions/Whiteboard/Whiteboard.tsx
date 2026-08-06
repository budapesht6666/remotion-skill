import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  staticFile,
  Img,
  Audio,
} from "remotion";
import { evolvePath, getPointAtLength } from "@remotion/paths";
import { handFamily, interFamily } from "../../lib/fonts";

/**
 * WHITEBOARD — доска в стиле VideoScribe/Doodly: рука с маркером прогрессивно
 * рисует контент, камера скроллит к следующему экрану, в конце рука уходит.
 *
 * ДВА СПОСОБА «НАРИСОВАТЬ», оба сводятся к одному примитиву — штриху со своим
 * окном кадров:
 *
 *   render: "strokes"     — путь рисуется краской (evolvePath по обводке).
 *                           Годится для схем, стрелок, акцентов, рамок.
 *   render: "masked-art"  — растровая картинка проявляется через маску, штрихи
 *                           которой обводят её контуры. Растр нельзя «нарисовать
 *                           пером» напрямую: stroke-dasharray работает только по
 *                           обводке SVG. Контуры даёт potrace в scripts/lib/artwork.ts.
 *
 * ГЛАВНОЕ АРХИТЕКТУРНОЕ ПРАВИЛО (не нарушать при развитии).
 * `@remotion/paths` не кэширует ничего: каждый вызов getLength/getPointAtLength/
 * evolvePath заново парсит и семплирует весь путь. Наивная реализация даёт
 * ~100 000 таких вызовов за ролик и убивает рендер. Поэтому:
 *   1. длины штрихов считаются в Node и приезжают готовыми (Stroke.length) —
 *      getLength в браузере не вызывается НИ РАЗУ;
 *   2. не начатые штрихи не рендерятся вообще;
 *   3. дорисованные — обычный <path d> без dash-атрибутов (это ~99% путей в кадре);
 *   4. активный штрих в кадре ровно один (штрихи внутри элемента идут
 *      последовательно, слоты элементов не пересекаются).
 * Итого ≤3 вызова API на кадр на весь ролик, НЕЗАВИСИМО от числа контуров.
 */

import type { Stroke, BoardElement, CameraMove, ClickMove } from "./types";

export type { Stroke, BoardElement } from "./types";

/**
 * Пропсы выведены из Zod-схемы (`schema.ts`) — она включает редактор в правой
 * панели студии. Отсюда же требование: никаких `null` в полях-путях, только
 * пустая строка как «ничего». Nullable-поля студия показывает неудобно, а
 * пустая строка редактируется одинаково хорошо и в панели, и в коде.
 */
export type WhiteboardProps = {
  elements: BoardElement[];
  /** Прокрутка холста. Спец-API камеры в Remotion нет — это CSS transform. */
  camera: CameraMove[];
  board: { width: number; height: number; screens: number; screenStep: number };
  /** Путь внутри public/ к склеенному монологу. Пусто — ролик без голоса. */
  narrationFile: string;
  /** Пусто — без музыки. */
  musicSrc: string;
  musicVolume: number;
  paper: string;
  /**
   * PNG руки внутри public/ (напр. "whiteboard/hand/right-marker.png").
   * Пусто — векторный маркер: им отлаживается геометрия, когда руки ещё нет.
   */
  handSrc: string;
  /** Ширина руки/маркера на доске, px. */
  handWidth: number;
  /** Где кончик маркера внутри картинки, в долях 0…1. Подбирается в студии. */
  handTipX: number;
  handTipY: number;
  /** Зеркало для левши. Кончик отражается вместе с картинкой. */
  handFlip: boolean;
  /** Постоянный наклон маркера, град. Касательную не используем — см. ниже. */
  handTilt: number;
  /**
   * Период подёргивания кисти при письме, В КАДРАХ. Это физика руки, а не
   * свойство текста: 8 кадров при 30fps ≈ 3.75 Гц — темп настоящего письма.
   */
  handWobbleFrames: number;
  /** Размах подёргивания, px на доске. Тоже свойство руки, не кегля. */
  handWobbleAmp: number;
  /** Кадр, с которого рука уходит за кадр. */
  exitFrom: number;
  exitFrames: number;

  /**
   * Клики мультяшной перчаткой по уже нарисованному (финальный «жми на
   * колокольчик»). Пустой массив — ролик без кликов.
   */
  clicks: ClickMove[];
  /** PNG перчатки внутри public/. Пусто — кликов не будет даже при clicks. */
  gloveSrc: string;
  gloveWidth: number;
  /** Где кончик указательного пальца внутри картинки, доли 0…1. */
  gloveTipX: number;
  gloveTipY: number;
};

/** Активный штрих кадра: ровно один на весь ролик (см. правило 4 выше). */
type Active = { el: BoardElement; stroke: Stroke; progress: number };

const findActive = (elements: BoardElement[], frame: number): Active | null => {
  for (const el of elements) {
    for (const stroke of el.strokes) {
      if (frame < stroke.from) continue;
      if (frame >= stroke.from + stroke.frames) continue;
      return { el, stroke, progress: (frame - stroke.from) / stroke.frames };
    }
  }
  return null;
};

/** Локальная точка пути → координаты доски. */
const toBoard = (el: BoardElement, p: { x: number; y: number }) => ({
  x: el.transform.tx + el.transform.scale * p.x,
  y: el.transform.ty + el.transform.scale * p.y,
});

/**
 * Где перо в этом кадре.
 *
 * Активный штрих — перо на нём. В паузе между штрихами рука НЕ замирает, а
 * летит к началу следующего: настоящая кисть между линиями перемещается, и
 * замершая рука сразу выдаёт, что кадры считает машина. Заодно это убирает
 * дубли кадров — четверть ролика была статикой именно из-за парковки.
 *
 * Максимум два вызова getPointAtLength на кадр — бюджет правила выше соблюдён.
 */
const penPosition = (
  elements: BoardElement[],
  frame: number,
  active: Active | null,
): { x: number; y: number } | null => {
  if (active) {
    // Клампим: за границей пути getPointAtLength возвращает null (уже в 4.0.498,
    // хотя доки обещают это только с v5).
    const len = Math.min(active.progress * active.stroke.length, active.stroke.length - 1e-3);
    const p = getPointAtLength(active.stroke.d, Math.max(0, len));
    return p ? toBoard(active.el, p) : null;
  }

  // Ближайший дорисованный слева и ближайший не начатый справа.
  let prev: { el: BoardElement; stroke: Stroke } | null = null;
  let next: { el: BoardElement; stroke: Stroke } | null = null;

  for (const el of elements) {
    for (const stroke of el.strokes) {
      const end = stroke.from + stroke.frames;
      if (frame >= end) {
        if (!prev || end > prev.stroke.from + prev.stroke.frames) prev = { el, stroke };
      } else if (frame < stroke.from) {
        if (!next || stroke.from < next.stroke.from) next = { el, stroke };
      }
    }
  }

  const endOf = (x: { el: BoardElement; stroke: Stroke }) => {
    const p = getPointAtLength(x.stroke.d, Math.max(0, x.stroke.length - 1e-3));
    return p ? toBoard(x.el, p) : null;
  };
  const startOf = (x: { el: BoardElement; stroke: Stroke }) => {
    const p = getPointAtLength(x.stroke.d, 0);
    return p ? toBoard(x.el, p) : null;
  };

  if (prev && next) {
    const from = endOf(prev);
    const to = startOf(next);
    if (!from || !to) return from ?? to;
    const gapStart = prev.stroke.from + prev.stroke.frames;
    const gapEnd = next.stroke.from;
    if (gapEnd <= gapStart) return to;
    const t = interpolate(frame, [gapStart, gapEnd], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    });
    // Дуга вверх: рука отрывает перо от бумаги, а не тащит его напрямик.
    // Высота растёт с длиной перелёта, но упирается в потолок — иначе на
    // перелёте через весь экран кисть улетала бы за кадр.
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const lift = Math.min(dist * 0.18, 120) * Math.sin(t * Math.PI);
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - lift };
  }
  if (prev) return endOf(prev);
  if (next) return startOf(next);
  return null;
};

/**
 * Векторный маркер: кончик в (12,12) локальных координат, корпус уходит
 * вниз-вправо. Фолбэк, когда PNG руки ещё нет — на нём отлаживается геометрия
 * пера, и сразу видно, что виновата математика, а не картинка.
 */
const MARKER_TIP = { x: 12 / 120, y: 12 / 120 };

const VectorMarker: React.FC<{ width: number; tilt: number }> = ({ width, tilt }) => (
  <svg width={width} height={width} viewBox="0 0 120 120" style={{ display: "block", overflow: "visible" }}>
    {/* Поворот ОТРИЦАТЕЛЬНЫЙ: в SVG положительный угол крутит по часовой, и корпус
        ушёл бы влево за пределы viewBox (там его резало). Минус уводит его
        вниз-вправо — как настоящий маркер в правой руке. */}
    <g transform={`rotate(${-35 + tilt} 12 12)`}>
      <path d="M12 12 L4.5 27 H19.5 Z" fill="#4b5563" />
      <rect x="3.5" y="27" width="17" height="6" fill="#9ca3af" />
      <rect x="1.5" y="33" width="21" height="62" rx="6" fill="#6b7280" />
      <rect x="5" y="39" width="4.5" height="49" rx="2.2" fill="#d1d5db" opacity={0.75} />
      <rect x="4" y="95" width="16" height="7" rx="3" fill="#4b5563" />
    </g>
  </svg>
);

/** Насколько глубоко палец «продавливает» цель в момент нажатия, px доски. */
const PRESS_DEPTH = 26;
const PRESS_FRAMES = 7;
/** Затухающее качание цели после нажатия. */
const SHAKE_FRAMES = 22;
const SHAKE_DEGREES = 7;

/**
 * Поза перчатки в этом кадре: подлёт снизу → нажатие → уход вниз.
 *
 * Всё считается от номера кадра, как и остальная доска. Точка `x/y` из
 * манифеста — это место, куда встаёт КОНЧИК ПАЛЬЦА; смещение картинки под него
 * делает сам рендер, ровно как у рисующей руки.
 */
const glovePose = (c: ClickMove, frame: number): { x: number; y: number; opacity: number } | null => {
  if (frame < c.from) return null;

  const approach = interpolate(frame, [c.from, c.press], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  // Уход отсчитывается ОТ НАЖАТИЯ, а не от конца слота: слот длиной во фразу,
  // и перчатка, дождавшись его конца, две секунды висела неподвижно — ровно
  // тот застой, который ловит freezedetect. Нажал и убрал, как живой палец.
  const leaveFrom = Math.min(c.press + PRESS_FRAMES + 8, c.to - 12);
  const leave = interpolate(frame, [leaveFrom, leaveFrom + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  // Нажатие: палец коротко идёт вверх, в цель, и возвращается. Синус даёт
  // ровно одно движение туда-обратно без отдельных ключей.
  const pressT = interpolate(frame, [c.press, c.press + PRESS_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const push = Math.sin(pressT * Math.PI) * PRESS_DEPTH;

  if (leave >= 1) return null; // ушла — узла в DOM нет
  return {
    x: c.x,
    // Перчатка приходит снизу и туда же уходит: она не рисует, а «тыкает»,
    // поэтому появляться из-за края естественнее, чем возникать на месте.
    y: c.y + approach * 420 + leave * 420 - push,
    opacity: Math.min(1 - approach * 0.6, 1 - leave),
  };
};

/** Затухающее качание элемента, по которому щёлкнули. */
const shakeFor = (clicks: ClickMove[], id: string, frame: number): number => {
  for (const c of clicks) {
    if (c.target !== id) continue;
    const t = frame - c.press;
    if (t < 0 || t > SHAKE_FRAMES) continue;
    return Math.sin((t / SHAKE_FRAMES) * Math.PI * 3) * SHAKE_DEGREES * (1 - t / SHAKE_FRAMES);
  }
  return 0;
};

type Phase = "pending" | "drawing" | "done";

/**
 * Один штрих в нужной фазе. Вынесено, чтобы оба рендерера считали одинаково.
 *
 * `fill` заливает уже дорисованный контур — нужен маске сплошных фигур
 * (залитая стрелка, серая тень). Пока контур рисуется, заливки нет: сначала
 * обводим, потом закрашиваем, как человек.
 */
const strokePath = (s: Stroke, frame: number, key: string): React.ReactElement | null => {
  // Своя толщина — у штрихов растушёвки: перо кладут плашмя, оно в разы шире
  // обводочного. Атрибут на путь перебивает групповой strokeWidth.
  const width = s.w === undefined ? undefined : s.w;
  // дорисован — без dash-атрибутов, ноль вызовов API
  if (frame >= s.from + s.frames) {
    return <path key={key} d={s.d} strokeWidth={width} fill={s.fill ? "currentColor" : "none"} />;
  }
  // не начат — узла нет в DOM
  if (frame < s.from) return null;
  // ровно один такой путь на кадр во всём ролике
  const progress = Math.min(1, Math.max(0, (frame - s.from) / s.frames));
  return <path key={key} d={s.d} strokeWidth={width} {...evolvePath(progress, s.d)} />;
};

/**
 * `phase` в пропах — не украшение: у дорисованного элемента пропы перестают
 * меняться, и React.memo выключает его перерисовку, хотя кадр тикает.
 */
const ElementLayer: React.FC<{ el: BoardElement; frame: number; phase: Phase; shake: number }> = React.memo(
  ({ el, frame, phase, shake }) => {
    if (phase === "pending") return null;

    const common: React.CSSProperties = {
      position: "absolute",
      left: el.box.x,
      top: el.box.y,
      overflow: "visible",
      // Качание после клика перчаткой. Ноль в 99% кадров, и тогда transform не
      // ставится вовсе — лишний слой композитинга элементу ни к чему.
      // Ось качания — верх по центру: так качается всё, что «висит» (колокольчик
      // на подвесе), и не разъезжается всё остальное.
      ...(shake === 0
        ? {}
        : { transform: `rotate(${shake.toFixed(2)}deg)`, transformOrigin: "50% 0%" }),
    };

    if (el.render === "strokes") {
      return (
        <svg viewBox={el.viewBox} width={el.box.w} height={el.box.h} style={common}>
          <g
            fill="none"
            stroke={el.color}
            strokeWidth={el.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {el.strokes.map((s, i) => strokePath(s, frame, `${el.id}-${i}`))}
          </g>
        </svg>
      );
    }

    if (el.render === "text") {
      return (
        <div
          style={{
            ...common,
            width: el.box.w,
            height: el.box.h,
            fontFamily: el.font === "hand" ? handFamily : interFamily,
            fontWeight: el.font === "hand" ? 700 : 800,
            fontSize: el.fontSize,
            color: el.color,
            lineHeight: 1.15,
            whiteSpace: "pre",
          }}
        >
          {el.lines.map((line, i) => {
            const s = el.strokes[i];
            if (!s || frame < s.from) return null;
            const p = Math.min(1, Math.max(0, (frame - s.from) / s.frames));
            return (
              <div
                key={line.text + String(i)}
                style={{
                  position: "absolute",
                  top: line.top,
                  left: el.align === "center" ? "50%" : 0,
                  transform: el.align === "center" ? "translateX(-50%)" : undefined,
                  // width: max-content — принципиально. Ширина строки из
                  // манифеста лишь ОЦЕНКА (метрик шрифта в Node нет), и если
                  // задать её жёстко, длинное слово обрезается: заголовок
                  // «РЫБА» превращался в «РЫБ». Так протяжка считается от
                  // фактического контента и всегда точна, а оценка остаётся
                  // нужна только для позиции руки, где ±10% незаметны.
                  width: "max-content",
                  clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
                }}
              >
                {line.text}
              </div>
            );
          })}
        </div>
      );
    }

    // Растр: маска — те же штрихи, но белым по прозрачному. Незакрашенное в маске
    // прозрачно-чёрное, то есть скрыто, поэтому фоновый прямоугольник не нужен.
    const maskId = `mask-${el.id}`;
    const [, , vw, vh] = el.viewBox.split(/\s+/).map(Number);

    // Графит: дорисованный элемент показываем целиком. Обводка там берёт лишь
    // несколько главных контуров, а растушёвка идёт полосами, так что по маске
    // всегда остаются крохи — и они бы застряли невидимыми до конца ролика.
    // Заодно из DOM уходит самый тяжёлый узел кадра.
    if (el.revealAll && phase === "done") {
      return (
        <svg viewBox={el.viewBox} width={el.box.w} height={el.box.h} style={common}>
          <image href={staticFile(el.src)} x={0} y={0} width={vw} height={vh} />
        </svg>
      );
    }

    return (
      <svg viewBox={el.viewBox} width={el.box.w} height={el.box.h} style={common}>
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={vw} height={vh}>
            {/* color="#fff" — чтобы currentColor у заливки сплошных контуров
                стал белым, то есть «показать» в терминах маски. */}
            <g
              color="#fff"
              fill="none"
              stroke="#fff"
              strokeWidth={el.maskWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {el.strokes.map((s, i) => strokePath(s, frame, `${el.id}-${i}`))}
            </g>
          </mask>
        </defs>
        <image href={staticFile(el.src)} x={0} y={0} width={vw} height={vh} mask={`url(#${maskId})`} />
      </svg>
    );
  },
);
ElementLayer.displayName = "ElementLayer";

/**
 * Рука в кадре. Кончик маркера сажается ровно в точку пера: картинка сдвигается
 * на долю своего размера (`tip`), поэтому подбор сводится к двум ползункам.
 *
 * Тень руки должна быть ЗАПЕЧЕНА в PNG: `filter: drop-shadow()` — прямое
 * предупреждение доков Remotion про GPU, а рука двигается каждый кадр.
 */
const Hand: React.FC<{
  src: string;
  width: number;
  tipX: number;
  tipY: number;
  flip: boolean;
  tilt: number;
  pen: { x: number; y: number };
  offsetX: number;
  offsetY: number;
  /** Доворот кисти вокруг кончика — покачивание при письме. */
  rotate: number;
  opacity: number;
}> = ({ src, width, tipX, tipY, flip, tilt, pen, offsetX, offsetY, rotate, opacity }) => {
  const tip = src === "" ? MARKER_TIP : { x: flip ? 1 - tipX : tipX, y: tipY };
  return (
    <div
      style={{
        position: "absolute",
        left: pen.x - tip.x * width + offsetX,
        top: pen.y - tip.y * width + offsetY,
        opacity,
        // Вращение идёт вокруг КОНЧИКА, а не центра: иначе доворот сдвигал бы
        // перо с кромки штриха, и рука писала бы мимо собственной линии.
        transform: `${flip ? "scaleX(-1) " : ""}rotate(${rotate}deg)`,
        transformOrigin: `${tip.x * 100}% ${tip.y * 100}%`,
      }}
    >
      {src === "" ? (
        <VectorMarker width={width} tilt={tilt} />
      ) : (
        <Img src={staticFile(src)} style={{ width, display: "block" }} />
      )}
    </div>
  );
};

/**
 * Положение холста в этом кадре. Между прокрутками камера стоит, во время —
 * едет с ease-in-out: резкий старт прокрутки читается как рывок склейки.
 */
const cameraY = (camera: CameraMove[], frame: number): number => {
  if (camera.length === 0) return 0;
  let y = camera[0].yFrom;
  for (const move of camera) {
    if (frame >= move.to) {
      y = move.yTo;
      continue;
    }
    if (frame >= move.from) {
      return interpolate(frame, [move.from, move.to], [move.yFrom, move.yTo], {
        easing: Easing.inOut(Easing.cubic),
      });
    }
    break;
  }
  return y;
};

export const Whiteboard: React.FC<WhiteboardProps> = ({
  elements,
  camera,
  board,
  narrationFile,
  musicSrc,
  musicVolume,
  paper,
  handSrc,
  handWidth,
  handTipX,
  handTipY,
  handFlip,
  handTilt,
  handWobbleFrames,
  handWobbleAmp,
  exitFrom,
  exitFrames,
  clicks,
  gloveSrc,
  gloveWidth,
  gloveTipX,
  gloveTipY,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const active = useMemo(() => findActive(elements, frame), [elements, frame]);
  const pen = useMemo(() => penPosition(elements, frame, active), [elements, frame, active]);
  const y = cameraY(camera, frame);

  /**
   * Подёргивание кисти при письме. Штрих строки — идеально прямой отрезок, и
   * рука, едущая по нему равномерно, выдаёт шторку с головой.
   *
   * ЧАСТОТА И РАЗМАХ — СВОЙСТВА РУКИ, А НЕ ТЕКСТА. Фаза считается от номера
   * кадра, размах задан в пикселях доски. Раньше и то, и другое зависело от
   * содержимого (период — от числа букв, размах — от кегля), и одна и та же
   * рука дёргалась на «O₂ ×30» вдвое медленнее, чем на «чувствует спиной», да
   * ещё и с разным размахом. Разнобой видно сразу: читается как разные люди.
   *
   * Скорость появления самого текста при этом не трогается — она по-прежнему
   * задаётся бюджетом кадров штриха, то есть длительностью фразы.
   */
  const wobble = useMemo(() => {
    if (!active || active.el.render !== "text") return { dx: 0, dy: 0, rot: 0 };
    const phase = (frame / Math.max(1, handWobbleFrames)) * Math.PI * 2;
    return {
      // Эллипс, а не вертикаль: при письме перо ходит и вперёд-назад тоже.
      // Горизонталь в четверть периода впереди вертикали — так рука обходит
      // букву, а не трясётся на месте.
      dx: Math.cos(phase) * handWobbleAmp * 0.45,
      dy: Math.sin(phase) * handWobbleAmp,
      // Доворот отстаёт от вертикали на ~40° фазы: кисть сначала идёт вниз и
      // только потом доворачивается, как настоящая.
      rot: Math.sin(phase + 0.7) * 4,
    };
  }, [active, frame, handWobbleFrames, handWobbleAmp]);

  const exitProgress = interpolate(frame, [exitFrom, exitFrom + exitFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: paper }}>
      {/* Холст целиком. transformOrigin "0 0" обязателен: иначе прокрутка
          считалась бы от центра и уезжала бы вдвое. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: board.width,
          height: board.height,
          transform: `translateY(${y}px)`,
          transformOrigin: "0 0",
          willChange: "transform",
        }}
      >
        {elements.map((el) => {
          const first = el.strokes[0];
          const last = el.strokes[el.strokes.length - 1];
          const phase: Phase =
            frame < first.from ? "pending" : frame >= last.from + last.frames ? "done" : "drawing";
          return (
            <ElementLayer
              key={el.id}
              el={el}
              frame={frame}
              phase={phase}
              shake={shakeFor(clicks, el.id, frame)}
            />
          );
        })}

        {/* Перчатка живёт ВНУТРИ холста: точка нажатия задана в координатах
            доски, и прокрутка камеры должна двигать её вместе с целью. */}
        {gloveSrc === ""
          ? null
          : clicks.map((c) => {
              const pose = glovePose(c, frame);
              if (!pose) return null;
              return (
                <div
                  key={`${c.target}-${c.from}`}
                  style={{
                    position: "absolute",
                    left: pose.x - gloveTipX * gloveWidth,
                    top: pose.y - gloveTipY * gloveWidth,
                    opacity: pose.opacity,
                  }}
                >
                  <Img src={staticFile(gloveSrc)} style={{ width: gloveWidth, display: "block" }} />
                </div>
              );
            })}

        {pen && exitProgress < 1 ? (
          <Hand
            src={handSrc}
            width={handWidth}
            tipX={handTipX}
            tipY={handTipY}
            flip={handFlip}
            tilt={handTilt}
            pen={pen}
            offsetX={exitProgress * 900 + wobble.dx}
            offsetY={exitProgress * 700 + wobble.dy}
            rotate={wobble.rot}
            opacity={1 - exitProgress * 0.4}
          />
        ) : null}
      </div>

      {narrationFile === "" ? null : <Audio src={staticFile(narrationFile)} />}

      {/* Звон по нажатию. Через Sequence, а не через startFrom: нам нужно,
          чтобы звук НАЧАЛСЯ на кадре нажатия, а не проигрывался со смещением. */}
      {clicks.map((c) =>
        c.sfx === "" ? null : (
          <Sequence key={`sfx-${c.press}`} from={c.press} durationInFrames={durationInFrames - c.press}>
            <Audio src={staticFile(c.sfx)} />
          </Sequence>
        ),
      )}
      {musicSrc === "" ? null : (
        <Audio
          src={staticFile(musicSrc)}
          volume={(f) =>
            interpolate(
              f,
              [0, 30, durationInFrames - 45, durationInFrames],
              [0, musicVolume, musicVolume, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      )}
    </AbsoluteFill>
  );
};

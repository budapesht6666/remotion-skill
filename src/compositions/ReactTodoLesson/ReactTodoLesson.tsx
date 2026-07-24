import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { interFamily, monoFamily } from "../../lib/fonts";
import { GradientBackground } from "../../components/GradientBackground";
import {
  ADD_EVENTS,
  CAPTIONS,
  CODE,
  DEMO_FOCUS_FROM,
  DEMO_FOCUS_TO,
  INPUT_TYPES,
  OUTRO_FROM,
  TOGGLE_EVENTS,
  TYPE_END,
  TYPE_START,
} from "./script";

export type ReactTodoLessonProps = {
  filename: string;
  accent: string;
  /**
   * Фоновая музыка из public/ (напр. "music.mp3"). null — без музыки.
   * Голоса нет, поэтому громкость держим на ~0.4 с fade-in/out по краям.
   * Трек бери из YouTube Audio Library / Pixabay Music (YouTube-safe).
   */
  musicSrc?: string | null;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * РЕЦЕПТ: обучающий кодинг-ролик «за 60 секунд».
 *
 * Совмещает три вещи, все — чистые функции кадра (золотое правило №1):
 *  1) редактор печатает код React-компонента (авто-скролл к каретке);
 *  2) живое превью Todo-приложения: элементы UI «поп-ают» ровно в тот кадр,
 *     когда печатается их код, затем приложение реально используется (ввод,
 *     добавление, отметка выполненных) — состояние выведено из номера кадра;
 *  3) караоке-комментарии внизу с пословной подсветкой.
 *
 * Никакого requestAnimationFrame / setInterval / setState по времени — всё
 * восстанавливается из frame, поэтому рендер детерминирован и не мигает.
 */
export const ReactTodoLesson: React.FC<ReactTodoLessonProps> = ({
  filename,
  accent,
  musicSrc = null,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const sec = frame / fps;

  // Скорость печати выводим из длины кода, чтобы он «допечатался» ровно к TYPE_END.
  const cps = CODE.length / (TYPE_END - TYPE_START);
  const typeStartF = TYPE_START * fps;

  // Демо-фокус: 0 — split-режим (пишем код), 1 — крупный план приложения.
  const dp = interpolate(
    sec,
    [DEMO_FOCUS_FROM, DEMO_FOCUS_TO],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Гасим сцену под финальную плашку.
  const stageOpacity = interpolate(
    sec,
    [OUTRO_FROM - 0.2, OUTRO_FROM + 0.8],
    [1, 0.12],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#070b16" }}>
      {/* Фоновая музыка (если задана): плавный fade-in/out, громкость ~0.4. */}
      {musicSrc ? (
        <Audio
          src={staticFile(musicSrc)}
          volume={(f) =>
            interpolate(
              f,
              [0, 20, durationInFrames - 45, durationInFrames],
              [0, 0.4, 0.4, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      ) : null}
      <GradientBackground from="#0b1225" to="#111a3a" />
      <AnimatedGlow accent={accent} frame={frame} />
      <TopProgress accent={accent} progress={frame / durationInFrames} />

      <AbsoluteFill style={{ opacity: stageOpacity }}>
        <EditorPanel
          filename={filename}
          accent={accent}
          frame={frame}
          fps={fps}
          typeStartF={typeStartF}
          cps={cps}
          demoProgress={dp}
        />
        <PreviewApp
          accent={accent}
          frame={frame}
          fps={fps}
          sec={sec}
          typeStartF={typeStartF}
          cps={cps}
          demoProgress={dp}
        />
      </AbsoluteFill>

      <KaraokeBar accent={accent} sec={sec} />
      <IntroOverlay accent={accent} sec={sec} />
      <OutroOverlay accent={accent} sec={sec} fps={fps} frame={frame} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Дрейфующий ambient-свет — непрерывное лёгкое движение фона на все   */
/* 60 c (чистая функция кадра): картинка «живая», без мёртвой статики. */
/* ------------------------------------------------------------------ */
const AnimatedGlow: React.FC<{ accent: string; frame: number }> = ({
  accent,
  frame,
}) => {
  const gx = 50 + 26 * Math.sin(frame / 42);
  const gy = 34 + 16 * Math.cos(frame / 58);
  const gx2 = 50 + 30 * Math.cos(frame / 67);
  const gy2 = 72 + 14 * Math.sin(frame / 49);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(760px 760px at ${gx}% ${gy}%, ${accent}22, transparent 70%), radial-gradient(680px 680px at ${gx2}% ${gy2}%, rgba(167,139,250,0.13), transparent 72%)`,
      }}
    />
  );
};

/* ------------------------------------------------------------------ */
/* Тонкий прогресс-бар «за 60 секунд» сверху                          */
/* ------------------------------------------------------------------ */
const TopProgress: React.FC<{ accent: string; progress: number }> = ({
  accent,
  progress,
}) => (
  <div
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 8,
      backgroundColor: "rgba(255,255,255,0.08)",
    }}
  >
    <div
      style={{
        height: "100%",
        width: `${clamp01(progress) * 100}%`,
        background: `linear-gradient(90deg, ${accent}, #a78bfa)`,
        boxShadow: `0 0 18px ${accent}`,
      }}
    />
  </div>
);

/* ------------------------------------------------------------------ */
/* Редактор кода с печатью и авто-скроллом к каретке                  */
/* ------------------------------------------------------------------ */
const CODE_FONT = 30;
const CODE_LH = 1.42;
const EDITOR_BODY_H = 828;

const EditorPanel: React.FC<{
  filename: string;
  accent: string;
  frame: number;
  fps: number;
  typeStartF: number;
  cps: number;
  demoProgress: number;
}> = ({ filename, accent, frame, fps, typeStartF, cps, demoProgress }) => {
  const windowIn = spring({ frame: frame - 4, fps, config: { damping: 200 } });

  const visibleChars = Math.max(
    0,
    Math.min(CODE.length, Math.floor(((frame - typeStartF) / fps) * cps)),
  );
  const shown = CODE.slice(0, visibleChars);
  const isTyping = frame > typeStartF && visibleChars < CODE.length;
  const caretOn = Math.floor(frame / 14) % 2 === 0;

  // Авто-скролл: держим строку с кареткой в зоне видимости.
  const linePx = CODE_FONT * CODE_LH;
  const currentLine = (shown.match(/\n/g) || []).length;
  const scroll = Math.min(0, EDITOR_BODY_H - (currentLine + 3) * linePx);

  return (
    <div
      style={{
        position: "absolute",
        top: 168,
        left: 30,
        right: 30,
        height: 946,
        opacity: interpolate(demoProgress, [0, 1], [1, 0.09]) * windowIn,
        transform: `translateY(${interpolate(demoProgress, [0, 1], [0, -26])}px) scale(${
          interpolate(demoProgress, [0, 1], [1, 0.94]) *
          interpolate(windowIn, [0, 1], [0.94, 1])
        })`,
      }}
    >
      <div
        style={{
          height: "100%",
          borderRadius: 26,
          overflow: "hidden",
          border: "1px solid #24304d",
          boxShadow: "0 40px 120px rgba(0,0,0,0.55)",
          backgroundColor: "#0d1424",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Заголовок окна */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "18px 26px",
            backgroundColor: "#131c31",
            borderBottom: "1px solid #24304d",
          }}
        >
          <span style={dot("#ff5f56")} />
          <span style={dot("#ffbd2e")} />
          <span style={dot("#27c93f")} />
          <span
            style={{
              marginLeft: 16,
              color: "#8ea0c4",
              fontFamily: monoFamily,
              fontSize: 26,
            }}
          >
            {filename}
          </span>
          <span
            style={{
              marginLeft: "auto",
              color: accent,
              fontFamily: interFamily,
              fontWeight: 700,
              fontSize: 22,
            }}
          >
            {isTyping ? "● запись" : "React"}
          </span>
        </div>

        {/* Тело редактора с авто-скроллом */}
        <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
          <pre
            style={{
              position: "absolute",
              top: 22,
              left: 30,
              right: 24,
              margin: 0,
              transform: `translateY(${scroll}px)`,
              color: "#c9d5ef",
              fontFamily: monoFamily,
              fontSize: CODE_FONT,
              lineHeight: CODE_LH,
              whiteSpace: "pre",
              // Лигатуры выключены: в обучающем ролике важно видеть => и === как есть.
              fontVariantLigatures: "none",
              fontFeatureSettings: '"liga" 0, "calt" 0',
            }}
          >
            {shown}
            <span
              style={{
                display: "inline-block",
                width: 14,
                height: CODE_FONT,
                transform: "translateY(5px)",
                backgroundColor: accent,
                opacity: isTyping || caretOn ? 1 : 0,
              }}
            />
          </pre>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Живое превью Todo-приложения                                       */
/* ------------------------------------------------------------------ */
type PreviewItem = { text: string; addSec: number; done: boolean; doneSec: number };

const buildItems = (sec: number): PreviewItem[] => {
  const items: PreviewItem[] = ADD_EVENTS.filter((a) => sec >= a.sec).map(
    (a) => ({ text: a.text, addSec: a.sec, done: false, doneSec: 0 }),
  );
  for (const t of TOGGLE_EVENTS) {
    if (sec >= t.sec && items[t.index]) {
      items[t.index].done = !items[t.index].done;
      items[t.index].doneSec = t.sec;
    }
  }
  return items;
};

const inputValue = (sec: number): string => {
  let value = "";
  for (const t of INPUT_TYPES) {
    if (sec >= t.start && sec < t.clearAt) {
      const p = clamp01((sec - t.start) / (t.end - t.start));
      value = t.text.slice(0, Math.round(p * t.text.length));
    }
  }
  return value;
};

const PreviewApp: React.FC<{
  accent: string;
  frame: number;
  fps: number;
  sec: number;
  typeStartF: number;
  cps: number;
  demoProgress: number;
}> = ({ accent, frame, fps, sec, typeStartF, cps, demoProgress }) => {
  // Кадр, в котором печать доходит до якорной подстроки кода.
  const crossFrame = (anchor: string) =>
    typeStartF + (CODE.indexOf(anchor) / cps) * fps;
  const pop = (anchor: string) => {
    const f = frame - crossFrame(anchor);
    return f <= 0 ? 0 : spring({ frame: f, fps, config: { damping: 18, mass: 0.7 } });
  };

  const titleR = pop("<h1>");
  const inputR = pop("<input");
  const buttonR = pop("<button");
  const listR = pop("<ul>");
  // Карточка приложения появляется вместе с первым свёрстанным элементом (<h1>),
  // а не отдельно — чтобы не было пустого белого прямоугольника до вёрстки UI.
  const cardR = titleR;

  const items = buildItems(sec);
  const value = inputValue(sec);
  const remaining = items.filter((i) => !i.done).length;

  const caretShow =
    sec >= INPUT_TYPES[0].start - 0.4 &&
    sec < OUTRO_FROM &&
    Math.floor(frame / 11) % 2 === 0;

  // Пульс кнопки в момент «Добавить».
  const nearestAdd = Math.min(
    ...ADD_EVENTS.map((a) => Math.abs(sec - a.sec)),
  );
  const btnPulse = interpolate(nearestAdd, [0, 0.16], [1, 0], {
    extrapolateRight: "clamp",
  });

  // Браузер-«шторка»: та же ширина, что окно редактора (left/right 30). Выезжает
  // снизу вверх; высота растёт от split-режима к крупному плану демо, нижняя
  // кромка зафиксирована над строкой караоке.
  const DOCK_BOTTOM = 400; // px от низа экрана до нижней кромки браузера
  const H = interpolate(demoProgress, [0, 1], [430, 1180]);
  const dockTop = 1920 - DOCK_BOTTOM - H;
  const slideY = (1 - cardR) * (H + DOCK_BOTTOM + 60); // старт — ниже экрана

  return (
    <div
      style={{
        position: "absolute",
        top: dockTop,
        left: 30,
        right: 30,
        height: H,
        transform: `translateY(${slideY}px)`,
        borderRadius: 26,
        overflow: "hidden",
        border: "1px solid #24304d",
        boxShadow: "0 40px 120px rgba(0,0,0,0.5)",
        background: "#0d1424",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Хром браузера: светофор + адресная строка localhost:3000 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 22px",
          background: "#eef1f7",
          borderBottom: "1px solid #dbe1ec",
          flexShrink: 0,
        }}
      >
        <span style={dot("#ff5f56")} />
        <span style={dot("#ffbd2e")} />
        <span style={dot("#27c93f")} />
        <div
          style={{
            marginLeft: 14,
            flex: 1,
            height: 52,
            borderRadius: 13,
            background: "#ffffff",
            border: "1px solid #dbe1ec",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 20px",
            fontFamily: interFamily,
            fontSize: 26,
            color: "#64748b",
          }}
        >
          <span style={{ fontSize: 24 }}>🔒</span>
          localhost:3000
        </div>
      </div>

      {/* Тело — белая страница приложения */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          background: "linear-gradient(180deg, #ffffff 0%, #f4f6fc 100%)",
          padding: "34px 46px",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        {/* Шапка приложения */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: titleR,
            transform: `translateY(${interpolate(titleR, [0, 1], [18, 0])}px)`,
          }}
        >
          <span
            style={{
              fontFamily: interFamily,
              fontWeight: 800,
              fontSize: 52,
              color: "#0f172a",
            }}
          >
            Мои задачи
          </span>
          <span
            style={{
              fontFamily: interFamily,
              fontWeight: 700,
              fontSize: 28,
              color: accent,
              background: "rgba(56,189,248,0.14)",
              borderRadius: 999,
              padding: "8px 20px",
            }}
          >
            осталось {remaining}
          </span>
        </div>

        {/* Строка ввода + кнопка */}
        <div
          style={{
            display: "flex",
            gap: 16,
            opacity: inputR,
            transform: `translateY(${interpolate(inputR, [0, 1], [18, 0])}px)`,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              background: "#eef1f8",
              border: "2px solid #d7deec",
              borderRadius: 18,
              padding: "0 22px",
              height: 78,
              fontFamily: interFamily,
              fontSize: 34,
              color: value ? "#0f172a" : "#9aa6bd",
            }}
          >
            {value || "Новая задача…"}
            <span
              style={{
                display: "inline-block",
                width: 3,
                height: 40,
                marginLeft: 3,
                background: "#0f172a",
                opacity: caretShow ? 1 : 0,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 78,
              padding: "0 30px",
              borderRadius: 18,
              background: `linear-gradient(180deg, ${accent}, #0ea5e9)`,
              color: "#062033",
              fontFamily: interFamily,
              fontWeight: 800,
              fontSize: 32,
              opacity: buttonR,
              transform: `scale(${1 - 0.12 * btnPulse})`,
              boxShadow: `0 12px 30px rgba(14,165,233,0.4)`,
            }}
          >
            Добавить
          </div>
        </div>

        {/* Список задач */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            opacity: listR,
          }}
        >
          {items.length === 0 ? (
            <div
              style={{
                fontFamily: interFamily,
                fontSize: 30,
                color: "#9aa6bd",
                padding: "18px 6px",
              }}
            >
              Здесь появятся задачи…
            </div>
          ) : (
            items.map((it, i) => {
              const enter = spring({
                frame: frame - it.addSec * fps,
                fps,
                config: { damping: 15, mass: 0.7, stiffness: 130 },
              });
              const doneP = it.done
                ? spring({
                    frame: frame - it.doneSec * fps,
                    fps,
                    config: { damping: 200 },
                  })
                : 0;
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                    background: "#ffffff",
                    border: "2px solid #e6ebf5",
                    borderRadius: 18,
                    padding: "18px 22px",
                    opacity: enter,
                    transform: `translateX(${interpolate(enter, [0, 1], [40, 0])}px) scale(${interpolate(enter, [0, 1], [0.96, 1])})`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 40,
                      transform: `scale(${1 + 0.25 * doneP * (1 - doneP) * 4})`,
                    }}
                  >
                    {doneP > 0.5 ? "✅" : "⬜"}
                  </span>
                  <span
                    style={{
                      position: "relative",
                      fontFamily: interFamily,
                      fontWeight: 600,
                      fontSize: 36,
                      color: interpolateColor(doneP),
                    }}
                  >
                    {it.text}
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        top: "52%",
                        height: 3,
                        width: "100%",
                        background: "#94a3b8",
                        transform: `scaleX(${doneP})`,
                        transformOrigin: "left center",
                      }}
                    />
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Курсор мыши: наводится на «Добавить» и на задачи ровно в момент клика. */}
      <PreviewCursor accent={accent} sec={sec} />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Курсор мыши в превью                                               */
/* Геометрия в координатах контейнера браузера (0,0 — его левый-верх). */
/* По ним же считаем и точки клика, поэтому курсор и UI не расходятся. */
/* ------------------------------------------------------------------ */
const PV_WIDTH = 1020; // 1080 − left30 − right30
const PV_CHROME_H = 85; // хром браузера (светофор + адресная строка)
const PV_PAD_T = 34; // верхний padding тела
const PV_PAD_X = 46;
const PV_HEADER_H = 62; // «Мои задачи» + бейдж
const PV_GAP = 22; // gap между секциями тела
const PV_INPUT_H = 78; // строка ввода/кнопки
const PV_ITEM_H = 88; // карточка задачи
const PV_ITEM_GAP = 14;

const PV_CONTENT_TOP = PV_CHROME_H + PV_PAD_T; // 119
const PV_INPUT_TOP = PV_CONTENT_TOP + PV_HEADER_H + PV_GAP; // 203
const PV_LIST_TOP = PV_INPUT_TOP + PV_INPUT_H + PV_GAP; // 303
// Центр кнопки «Добавить» (прижата к правому краю тела) и центр i-й задачи.
const BTN_TARGET = { x: PV_WIDTH - PV_PAD_X - 108, y: PV_INPUT_TOP + PV_INPUT_H / 2 };
const TASK_X = PV_PAD_X + 22 + 20; // над чекбоксом слева
const taskCenterY = (i: number) =>
  PV_LIST_TOP + i * (PV_ITEM_H + PV_ITEM_GAP) + PV_ITEM_H / 2;

const PreviewCursor: React.FC<{
  accent: string;
  sec: number;
}> = ({ accent, sec }) => {
  // Точки клика тянем прямо из сценария → курсор всегда синхронен с UI.
  const targets = [
    ...ADD_EVENTS.map((a) => ({ sec: a.sec, x: BTN_TARGET.x, y: BTN_TARGET.y })),
    ...TOGGLE_EVENTS.map((t) => ({
      sec: t.sec,
      x: TASK_X,
      y: taskCenterY(t.index),
    })),
  ].sort((a, b) => a.sec - b.sec);

  const APPEAR = ADD_EVENTS[0].sec - 0.8; // влетает перед первым «Добавить»
  const LEAD = 0.3; // за столько до клика курсор уже на месте
  const START = { x: 620, y: 900 }; // откуда «влетает» снизу
  const lastSec = targets[targets.length - 1].sec;

  // Ключевые кадры движения: доезжаем к цели за LEAD и «стоим» на ней до клика.
  const times = [APPEAR];
  const xs = [START.x];
  const ys = [START.y];
  for (const t of targets) {
    times.push(t.sec - LEAD, t.sec);
    xs.push(t.x, t.x);
    ys.push(t.y, t.y);
  }
  const ease = { easing: Easing.inOut(Easing.ease) } as const;
  const x = interpolate(sec, times, xs, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    ...ease,
  });
  const y = interpolate(sec, times, ys, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    ...ease,
  });

  const opacity = interpolate(
    sec,
    [APPEAR - 0.2, APPEAR + 0.2, lastSec + 0.6, lastSec + 1.2],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  if (opacity <= 0) return null;

  // Нажатие (курсор «клюёт») + расходящееся кольцо-рипл в момент клика.
  let press = 0;
  let ripple = -1;
  for (const t of targets) {
    const d = sec - t.sec;
    if (d >= -0.06 && d <= 0.18) {
      press = Math.max(press, 1 - Math.abs(d - 0.06) / 0.12);
    }
    if (d >= 0 && d <= 0.45) {
      ripple = Math.max(ripple, d / 0.45);
    }
  }
  const pressScale = 1 - 0.18 * clamp01(press);

  return (
    <>
      {ripple >= 0 ? (
        <div
          style={{
            position: "absolute",
            left: x - interpolate(ripple, [0, 1], [6, 44]),
            top: y - interpolate(ripple, [0, 1], [6, 44]),
            width: interpolate(ripple, [0, 1], [12, 88]),
            height: interpolate(ripple, [0, 1], [12, 88]),
            borderRadius: "50%",
            border: `4px solid ${accent}`,
            opacity: interpolate(ripple, [0, 1], [0.55, 0]),
            pointerEvents: "none",
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          opacity,
          transform: `scale(${pressScale})`,
          transformOrigin: "0 0",
          filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.45))",
          pointerEvents: "none",
        }}
      >
        <svg width={40} height={56} viewBox="0 0 15 21" fill="none">
          <path
            d="M0 0 L0 19 L5 14 L8 21 L11 20 L8 13 L15 13 Z"
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </>
  );
};

// Цвет текста задачи: тёмный → серый по мере «выполнения».
const interpolateColor = (p: number): string => {
  const v = Math.round(interpolate(p, [0, 1], [15, 148]));
  return `rgb(${v}, ${Math.round(interpolate(p, [0, 1], [23, 163]))}, ${Math.round(
    interpolate(p, [0, 1], [42, 184]),
  )})`;
};

/* ------------------------------------------------------------------ */
/* Караоке-комментарии внизу (пословная подсветка)                    */
/* ------------------------------------------------------------------ */
const KaraokeBar: React.FC<{ accent: string; sec: number }> = ({
  accent,
  sec,
}) => {
  const line = CAPTIONS.find((l) => sec >= l.start - 0.25 && sec < l.end + 0.4);
  if (!line) return null;

  const lineOpacity = interpolate(
    sec,
    [line.start - 0.25, line.start, line.end, line.end + 0.4],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const words = line.text.split(" ");
  const weights = words.map((w) => Math.max(2, w.length));
  const total = weights.reduce((a, b) => a + b, 0);
  const dur = line.end - line.start;

  let acc = 0;
  const rendered = words.map((w, i) => {
    const wStart = line.start + (acc / total) * dur;
    acc += weights[i];
    const wEnd = line.start + (acc / total) * dur;
    const active = sec >= wStart && sec < wEnd;
    const sung = sec >= wEnd;
    return { w, active, sung };
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 44,
        right: 44,
        bottom: 236,
        display: "flex",
        justifyContent: "center",
        opacity: lineOpacity,
      }}
    >
      <div
        style={{
          maxWidth: 940,
          textAlign: "center",
          padding: "22px 34px",
          borderRadius: 28,
          background: "rgba(6,10,22,0.72)",
          border: "1px solid rgba(148,163,184,0.22)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          fontFamily: interFamily,
          fontWeight: 800,
          fontSize: 52,
          lineHeight: 1.2,
        }}
      >
        {rendered.map((r, i) => (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: 14,
              color: r.active ? accent : r.sung ? "#ffffff" : "rgba(255,255,255,0.34)",
              transform: r.active ? "translateY(-4px) scale(1.06)" : "none",
              textShadow: r.active ? `0 0 26px ${accent}` : "none",
            }}
          >
            {r.w}
          </span>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Интро и аутро                                                      */
/* ------------------------------------------------------------------ */
const IntroOverlay: React.FC<{ accent: string; sec: number }> = ({
  accent,
  sec,
}) => {
  const opacity = interpolate(sec, [0, 0.4, 2.4, 3.2], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (opacity <= 0) return null;
  const rise = interpolate(sec, [0, 3.2], [0, -30]);
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        opacity,
        background: "rgba(7,11,22,0.55)",
      }}
    >
      <div style={{ textAlign: "center", transform: `translateY(${rise}px)` }}>
        <div
          style={{
            fontFamily: interFamily,
            fontWeight: 800,
            fontSize: 40,
            color: accent,
            letterSpacing: 2,
          }}
        >
          ⚛️ REACT · ЗА 60 СЕКУНД
        </div>
        <div
          style={{
            marginTop: 18,
            fontFamily: interFamily,
            fontWeight: 800,
            fontSize: 108,
            color: "#ffffff",
            lineHeight: 1.05,
          }}
        >
          Todo-приложение
          <br />с нуля
        </div>
      </div>
    </AbsoluteFill>
  );
};

const OutroOverlay: React.FC<{
  accent: string;
  sec: number;
  fps: number;
  frame: number;
}> = ({ accent, sec, fps, frame }) => {
  const opacity = interpolate(sec, [OUTRO_FROM - 0.2, OUTRO_FROM + 0.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (opacity <= 0) return null;
  const pop = spring({
    frame: frame - OUTRO_FROM * fps,
    fps,
    config: { damping: 14, mass: 0.8 },
  });
  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", opacity }}
    >
      <div style={{ textAlign: "center", transform: `scale(${interpolate(pop, [0, 1], [0.8, 1])})` }}>
        <div style={{ fontSize: 150 }}>✅</div>
        <div
          style={{
            marginTop: 10,
            fontFamily: interFamily,
            fontWeight: 800,
            fontSize: 96,
            color: "#ffffff",
          }}
        >
          Готово!
        </div>
        <div
          style={{
            marginTop: 12,
            fontFamily: interFamily,
            fontWeight: 700,
            fontSize: 46,
            color: accent,
          }}
        >
          Рабочее Todo на React
        </div>
        <div
          style={{
            marginTop: 40,
            fontFamily: interFamily,
            fontWeight: 700,
            fontSize: 38,
            color: "rgba(255,255,255,0.72)",
          }}
        >
          Сохрани · Повтори · Подпишись
        </div>
      </div>
    </AbsoluteFill>
  );
};

const dot = (color: string): React.CSSProperties => ({
  width: 22,
  height: 22,
  borderRadius: "50%",
  backgroundColor: color,
});

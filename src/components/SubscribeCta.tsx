import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { interFamily as fontFamily } from "../lib/fonts";

/**
 * Финальный призыв: красная кнопка «Subscribe» с колокольчиком, по которой
 * жмёт курсор-рука (референс — стандартная плашка YouTube).
 *
 * Плашка нарисована в SVG/CSS и ассетов не требует, поэтому её можно повесить
 * на конец любого ролика. Единственный внешний файл — звон в момент нажатия:
 * `sfx/subscribe-bell.mp3`, настоящая запись металлического колокольчика (CC0,
 * см. `public/sfx/CREDITS.md`). Синтезированный `sfx/bell.mp3` тут не годится —
 * рядом с живым кадром он слышен как «пиип» из телефона 2005 года.
 *
 * Обычно вызывается не напрямую, а через `SubscribeOutro` — хвост со
 * стоп-кадром, наездом и затемнением.
 *
 * Тайминги заданы в секундах и переводятся в кадры через fps: концовка одинаково
 * живёт и в 30 fps, и в 23.976 fps нарезках чужого кино.
 */

/** Кнопка выезжает снизу. */
const T_BUTTON = 0;
/** Курсор въезжает из-за правого нижнего угла. */
const T_CURSOR = 0.34;
/** Палец продавливает кнопку. */
const T_CLICK = 1.02;

export type SubscribeCtaProps = {
  /** Подпись на кнопке. */
  label: string;
  /** Центр кнопки по вертикали, доля высоты кадра. */
  centerY: number;
  /** Громкость звона на клике; 0 — беззвучно. */
  bellVolume: number;
};

/** Колокольчик. Качание задаёт родитель — тут только форма. */
const Bell: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ overflow: "visible" }}>
    <path
      d="M12 22c1.15 0 2.1-.95 2.1-2.1H9.9c0 1.15.95 2.1 2.1 2.1zm6.3-6.3v-5.25c0-3.22-1.72-5.92-4.73-6.63v-.72c0-.87-.7-1.58-1.57-1.58s-1.57.71-1.57 1.58v.72C7.42 4.53 5.7 7.22 5.7 10.45v5.25L3.6 17.8v1.05h16.8V17.8l-2.1-2.1z"
      fill="currentColor"
    />
  </svg>
);

/**
 * Курсор-рука. Силуэт собран из скруглённых прямоугольников и рисуется дважды:
 * сначала толстой чёрной обводкой (она даёт общий контур), сверху — белая
 * заливка. Так внутренние стыки форм не проступают.
 */
const HandCursor: React.FC<{ size: number; press: number }> = ({ size, press }) => {
  const shapes = (
    <>
      {/* указательный палец: при нажатии он укорачивается — рука «надавила» */}
      <rect x="42" y={10 + press * 7} width="24" height={74 - press * 7} rx="12" />
      {/* согнутые пальцы */}
      <rect x="64" y="50" width="21" height="34" rx="10.5" />
      <rect x="82" y="56" width="20" height="30" rx="10" />
      {/* ладонь */}
      <rect x="38" y="62" width="66" height="62" rx="26" />
      {/* большой палец */}
      <rect x="26" y="76" width="34" height="23" rx="11.5" />
    </>
  );

  return (
    <svg
      width={size}
      height={size * 1.15}
      viewBox="0 0 130 145"
      style={{ overflow: "visible" }}
    >
      <g transform="rotate(-10 65 70)" filter="drop-shadow(0 12px 20px rgba(0,0,0,0.45))">
        <g fill="#111" stroke="#111" strokeWidth="13" strokeLinejoin="round">
          {shapes}
        </g>
        <g fill="#fff">{shapes}</g>
      </g>
    </svg>
  );
};

export const SubscribeCta: React.FC<SubscribeCtaProps> = ({ label, centerY, bellVolume }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const time = frame / fps;

  const enter = spring({
    frame: frame - Math.round(T_BUTTON * fps),
    fps,
    config: { damping: 13, mass: 0.7 },
  });

  const cursorIn = spring({
    frame: frame - Math.round(T_CURSOR * fps),
    fps,
    config: { damping: 15, mass: 0.9 },
  });

  // Нажатие: короткий импульс вниз и обратно.
  const press = interpolate(
    time,
    [T_CLICK - 0.08, T_CLICK, T_CLICK + 0.14, T_CLICK + 0.32],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // После клика колокольчик звонит: затухающее качание.
  const sinceClick = Math.max(0, time - T_CLICK);
  const ring = time < T_CLICK ? 0 : Math.exp(-2.6 * sinceClick);
  const swing = Math.sin(sinceClick * Math.PI * 2 * 6) * 22 * ring;

  // Волна от точки нажатия — расходящееся кольцо.
  const shock = interpolate(time, [T_CLICK, T_CLICK + 0.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const buttonTop = height * centerY;

  return (
    <AbsoluteFill>
      {bellVolume > 0 ? (
        <Sequence from={Math.round(T_CLICK * fps)} name="bell">
          <Audio src={staticFile("sfx/subscribe-bell.mp3")} volume={bellVolume} />
        </Sequence>
      ) : null}

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: buttonTop,
          display: "flex",
          justifyContent: "center",
          transform: `translateY(${(1 - enter) * 240}px)`,
          opacity: Math.min(1, enter * 1.6),
        }}
      >
        <div style={{ position: "relative" }}>
          {/* Ударная волна клика */}
          <div
            style={{
              position: "absolute",
              inset: -34,
              borderRadius: 76,
              border: "6px solid rgba(255,72,72,0.85)",
              transform: `scale(${1 + shock * 0.4})`,
              opacity: shock > 0 && shock < 1 ? (1 - shock) * 0.9 : 0,
            }}
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 32,
              padding: "28px 54px 28px 32px",
              borderRadius: 38,
              background: "linear-gradient(180deg, #ff2b2b 0%, #e40000 62%, #c30000 100%)",
              // Тёмная подложка снизу даёт кнопке объём, как на референсе; при
              // нажатии она схлопывается — кнопка «проваливается» под пальцем.
              boxShadow: `0 ${18 - press * 13}px 0 #7c0000, 0 ${28 - press * 14}px 46px rgba(0,0,0,0.5)`,
              transform: `scale(${1 - press * 0.04}) translateY(${press * 11}px)`,
            }}
          >
            <div
              style={{
                position: "relative",
                width: 118,
                height: 118,
                borderRadius: 28,
                backgroundColor: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#e00000",
                flexShrink: 0,
              }}
            >
              <div style={{ transform: `rotate(${swing}deg)`, transformOrigin: "50% 16%" }}>
                <Bell size={76} />
              </div>
            </div>

            <div
              style={{
                fontFamily,
                fontSize: 92,
                fontWeight: 800,
                letterSpacing: "0.02em",
                color: "#fff",
                whiteSpace: "nowrap",
                textShadow: "0 3px 0 rgba(0,0,0,0.18)",
              }}
            >
              {label}
            </div>

          </div>
        </div>
      </div>

      {/* Курсор въезжает из-за правого нижнего угла и жмёт нижнюю кромку
          кнопки: кончик пальца в SVG — примерно (54, 12) от левого верха,
          поэтому ладонь остаётся под кнопкой и не закрывает надпись. */}
      <div
        style={{
          position: "absolute",
          left: width * 0.63,
          top: buttonTop + 126,
          transform: `translate(${(1 - cursorIn) * 460}px, ${(1 - cursorIn) * 540 + press * 18}px)`,
          opacity: cursorIn,
        }}
      >
        <HandCursor size={158} press={press} />
      </div>
    </AbsoluteFill>
  );
};

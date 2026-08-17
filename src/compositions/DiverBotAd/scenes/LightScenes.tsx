import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND, EASE_OUT, RADIUS, TRACKING, TYPE, WEIGHT } from "../brand";
import { BRAND_FONT } from "../fonts";
import type { AdShot } from "../types";
import { Clip } from "./Clip";

/** Надзаголовок секции: точка и текст вразрядку капителью — как на сайте. */
export const Eyebrow: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0 }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontFamily: BRAND_FONT,
        fontWeight: WEIGHT.medium,
        fontSize: TYPE.micro,
        letterSpacing: TRACKING.micro,
        textTransform: "uppercase",
        color: BRAND.textFaint,
        opacity,
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: BRAND.ink }} />
      {children}
    </div>
  );
};

/**
 * Дисплейный заголовок. Вес 300 — правило дизайн-системы продукта, а не вкус:
 * «в больших кеглях тонкий шрифт выглядит дорого, жирный — кричит».
 * Строки выезжают по одной с той же кривой, что и вся анимация сайта.
 */
export const Display: React.FC<{ lines: string[]; size?: number; delay?: number }> = ({
  lines,
  size = TYPE.h2,
  delay = 6,
}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {lines.map((line, i) => {
        const start = delay + i * 7;
        const t = interpolate(frame, [start, start + 22], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(...EASE_OUT),
        });
        return (
          <span
            key={line}
            style={{
              fontFamily: BRAND_FONT,
              fontWeight: WEIGHT.light,
              fontSize: size,
              lineHeight: 1.1,
              letterSpacing: TRACKING.display,
              color: BRAND.ink,
              opacity: t,
              translate: `0px ${(1 - t) * 26}px`,
            }}
          >
            {line}
          </span>
        );
      })}
    </div>
  );
};

/**
 * Промо-видео сайта: чёрная механическая рука на белом.
 *
 * Кадрирование под вертикаль. Исходник 1920×1082, рука занимает примерно
 * x∈[700,1250] — центр приходится на 51% ширины. При `cover` кадр 1080×1920
 * покрывается масштабом 1.774, по вертикали обрезки нет вовсе, а по горизонтали
 * `objectPosition: 51%` оставляет в кадре исходные 666…1275 px, то есть руку
 * целиком с воздухом по краям.
 *
 * Метафора сайта переносится в ролик без правок: за рынком следит механизм,
 * а не человек.
 */
export const HeroScene: React.FC<{ shot: AdShot }> = ({ shot }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const push = interpolate(frame, [0, durationInFrames], [1.02, 1.09], {
    easing: Easing.bezier(...EASE_OUT),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.paper }}>
      <AbsoluteFill style={{ scale: push }}>
        {shot.media && !shot.missing ? (
          <Clip shot={shot} objectPosition="51% 50%" />
        ) : (
          <WhiteMechanismFallback />
        )}
      </AbsoluteFill>
      {shot.overlay ? <Counters text={shot.overlay} /> : null}
    </AbsoluteFill>
  );
};

/**
 * Подложка светлого кадра, пока не приехал клип «чёрный механизм на белом».
 * Знак diverBot — две линии, расходящиеся из одной точки, — медленно чертит
 * сам себя. Это тот же жест, что и у настоящей сцены: механизм в работе.
 */
const WhiteMechanismFallback: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // Начинаем не с нуля: при нулевой длине штриха скруглённый конец пера рисует
  // на белом поле одинокую чёрную кляксу, и первые кадры плана читаются как
  // артефакт, а не как начало движения.
  const draw = interpolate(frame, [0, Math.round(durationInFrames * 0.7)], [0.14, 1], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(...EASE_OUT),
  });
  const spin = interpolate(frame, [0, durationInFrames], [-6, 6]);

  return (
    <AbsoluteFill
      style={{ backgroundColor: BRAND.paper, justifyContent: "center", alignItems: "center" }}
    >
      <svg viewBox="0 0 24 24" width={620} height={620} fill="none" style={{ rotate: `${spin}deg` }}>
        {[
          "M4.5 12 20 4.5",
          "M4.5 12 20 19.5",
        ].map((d) => (
          <path
            key={d}
            d={d}
            stroke={BRAND.ink}
            strokeWidth={2.6}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - draw}
          />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

/** Счётчики «9 · 4 · 2 · 24/7»: разряды набегают по одному. */
const Counters: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const parts = text.split("·").map((p) => p.trim());

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 520 }}>
      <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
        {parts.map((part, i) => {
          const start = 6 + i * 8;
          const t = interpolate(frame, [start, start + 16], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(...EASE_OUT),
          });
          return (
            <span
              key={part}
              style={{
                fontFamily: BRAND_FONT,
                fontWeight: WEIGHT.semibold,
                fontSize: TYPE.h3,
                letterSpacing: TRACKING.heading,
                color: BRAND.ink,
                backgroundColor: BRAND.surface,
                borderRadius: RADIUS.pill,
                padding: "14px 30px",
                opacity: t,
                translate: `0px ${(1 - t) * 18}px`,
              }}
            >
              {part}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/**
 * ★ ГЛАВНЫЙ КАДР: живая анимация цены и RSI, снятая с промо-сайта.
 *
 * Захват — настоящая секция страницы: свечи проступают, линия RSI чертит сама
 * себя, вспыхивают две точки, между ними вытягиваются пунктиры, и приезжает
 * карточка «PRICE −1.33%, RSI +18.7 — THEY DISAGREE». Ролик ничего из этого не
 * рисует заново: объяснение дивергенции целиком отдано продукту.
 *
 * Заголовок набирается здесь, а не берётся из захвата, по одной причине: на
 * десктопе он лежит СЛЕВА от графика, и в вертикальный кадр такая раскладка не
 * ложится. Текст и шрифт — те же самые (`promo/src/i18n/en.ts`), поэтому стык
 * незаметен: у захвата фон белый и переходит в бумагу кадра без границы.
 */
export const ChartScene: React.FC<{ shot: AdShot }> = ({ shot }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.paper, alignItems: "center", paddingTop: 250 }}>
      <div style={{ width: 950, display: "flex", flexDirection: "column", gap: 26 }}>
        <Eyebrow>Reading the chart</Eyebrow>
        <Display lines={["Price sets a lower low.", "The indicator does not follow."]} size={62} />
      </div>

      <div style={{ width: 1010, height: 964, marginTop: 44 }}>
        {shot.media && !shot.missing ? (
          <Clip shot={shot} objectFit="contain" />
        ) : (
          // Захват ещё не снят: `npm run capture -- DiverBotAd --only chart`.
          // Плашка честно называет, чего не хватает, — молчаливая пустота на
          // главном кадре ролика прошла бы незамеченной до самого рендера.
          <div
            style={{
              width: "100%",
              height: "100%",
              border: `2px dashed ${BRAND.border}`,
              borderRadius: RADIUS.md,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: BRAND_FONT,
              fontWeight: WEIGHT.regular,
              fontSize: TYPE.small,
              color: BRAND.textFaint,
            }}
          >
            npm run capture -- DiverBotAd --only chart
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Рамка телефона вокруг захвата мини-аппки.
 *
 * Тёмный экран на белом поле работает как продуктовая съёмка: аппка в кадре
 * читается предметом, а не скриншотом, вставленным в презентацию. Пропорции
 * взяты у самого захвата (375×812 — окно, в котором он снят), чтобы картинка
 * села в рамку без растяжения.
 */
export const AppScene: React.FC<{ shot: AdShot }> = ({ shot }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const enter = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...EASE_OUT),
  });
  const push = interpolate(frame, [0, durationInFrames], [1, 1.04], {
    easing: Easing.bezier(...EASE_OUT),
  });

  // Ширина подобрана не «на глаз»: телефон обязан кончиться выше строки
  // субтитров, иначе текст ложится на экран аппки и нечитаемы оба.
  //
  // Пересчитано после того, как субтитры уехали вверх из-под интерфейса Shorts
  // (`Captions.tsx`): их верхний край поднялся с 1500 до ~1353 px, и прежняя
  // рамка 540 px наезжала на текст. Теперь при 510 px рамка занимает 1128 px по
  // высоте, центрируется в поле 1470 (то есть 171…1299) и даже на пике наезда
  // `push` (+1.04 от центра, это ещё 22 px вниз) кончается на 1321 — с запасом
  // в три десятка пикселей до текста.
  const width = 510;
  const height = Math.round((width * 812) / 375);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND.paper,
        justifyContent: "center",
        alignItems: "center",
        paddingBottom: 450,
      }}
    >
      <div
        style={{
          width: width + 24,
          height: height + 24,
          borderRadius: 56,
          backgroundColor: BRAND.ink,
          padding: 12,
          boxShadow: "0 40px 90px rgba(10, 10, 11, 0.22)",
          opacity: enter,
          scale: push * (0.96 + enter * 0.04),
          translate: `0px ${(1 - enter) * 30}px`,
        }}
      >
        <div style={{ width, height, borderRadius: 44, overflow: "hidden", backgroundColor: BRAND.darkPaper }}>
          {shot.media && !shot.missing ? <Clip shot={shot} objectFit="cover" /> : null}
        </div>
      </div>

      {shot.overlay ? <FreeBadge text={shot.overlay} /> : null}
    </AbsoluteFill>
  );
};

/** Плашка «free forever» поверх телефона: единственный факт, который экран не проговаривает сам. */
const FreeBadge: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [10, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...EASE_OUT),
  });

  // Плашка переехала под верхний край кадра. Раньше она жила в зазоре между
  // низом телефона и строкой субтитров, но субтитры поднялись из-под
  // интерфейса Shorts, зазор схлопнулся до трёх десятков пикселей, и плашка
  // села прямо на текст. Белое поле над телефоном (0…171) — единственное
  // свободное место, которое осталось: поверх экрана её ставить нельзя, она
  // закрыла бы то самое, ради чего экран в кадре, — настоящие строки сигналов.
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 62 }}>
      <span
        style={{
          fontFamily: BRAND_FONT,
          fontWeight: WEIGHT.medium,
          fontSize: TYPE.small,
          letterSpacing: TRACKING.micro,
          textTransform: "uppercase",
          color: BRAND.cta,
          border: `2px solid ${BRAND.cta}`,
          borderRadius: RADIUS.pill,
          padding: "12px 28px",
          opacity: t,
          scale: 0.94 + t * 0.06,
        }}
      >
        {text}
      </span>
    </AbsoluteFill>
  );
};

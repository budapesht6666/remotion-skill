import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND, EASE_OUT, TRACKING, TYPE, WEIGHT } from "../brand";
import { BRAND_FONT } from "../fonts";
import type { AdShot } from "../types";
import { Clip, NativeCandles, NightGrade } from "./Clip";

/**
 * Тёмная половина ролика: рынок двинулся, а вы спали.
 *
 * Кадр строится тремя слоями и всегда в одном порядке: подложка (снятый клип
 * либо нарисованные свечи), общий холодный грейд, надпись. Порядок важен —
 * грейд обязан ложиться и на нарисованный фон тоже, иначе подмена подложки
 * будет видна как смена температуры.
 */
export const DarkScene: React.FC<{ shot: AdShot; index: number }> = ({ shot, index }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Медленный наезд на весь план: статичный тёмный кадр в рекламе читается
  // как стоп-кадр, то есть как поломка.
  const push = interpolate(frame, [0, durationInFrames], [1, 1.05], {
    easing: Easing.bezier(...EASE_OUT),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.darkPaper }}>
      <AbsoluteFill style={{ scale: push }}>
        {shot.media && !shot.missing ? <Clip shot={shot} /> : <NativeCandles seed={index * 977 + 13} />}
      </AbsoluteFill>

      <NightGrade />

      {shot.overlay ? <DarkLabel text={shot.overlay} /> : null}
    </AbsoluteFill>
  );
};

/**
 * Надпись поверх тёмного кадра. Не дублирует субтитр, а добавляет факт,
 * которого в реплике нет: время на часах, сколько прошло. Появляется
 * проявлением, а не выездом: движение в кадре уже есть, второе спорило бы с ним.
 */
const DarkLabel: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Проявление пропорционально длине плана, а не фиксированные 12 кадров: на
  // коротком плане фиксированная кривая съела бы его целиком и надпись успела
  // бы только моргнуть.
  const ramp = Math.min(12, Math.round(durationInFrames * 0.22));
  const opacity = interpolate(
    frame,
    [0, ramp, durationInFrames - ramp, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(...EASE_OUT) },
  );

  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 420 }}>
      <div
        style={{
          fontFamily: BRAND_FONT,
          fontWeight: WEIGHT.light,
          fontSize: TYPE.h3,
          letterSpacing: TRACKING.micro,
          textTransform: "uppercase",
          color: "rgba(242, 242, 245, 0.8)",
          opacity,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Стык двух миров: пришло уведомление — и кадр выбеливается.
 *
 * Это единственная резкая склейка в ролике, и она несёт смысл: до неё зритель
 * смотрел на свою проблему, после — на продукт. Поэтому вспышка не плавная:
 * девять кадров на выбеливание (около трёх десятых секунды), затем белое
 * поле, по которому расходится кольцо — знак уведомления, нарисованный
 * фирменным зелёным. Кольцо здесь единственная заливка цветом, и это ровно то
 * исключение, которое разрешает дизайн-система продукта: цвет = действие.
 *
 * Почему не четыре кадра, как было сперва. Полный переход из `darkPaper` в
 * чистое белое за 133 мс — это скачок светимости во весь экран, и на телефоне
 * в темноте он бьёт по глазам сильнее, чем работает драматургически. Девять
 * кадров сохраняют характер удара (это по-прежнему втрое быстрее любой другой
 * склейки ролика), но перестают быть вспышкой в буквальном смысле. По той же
 * причине кольцо гасится с 0.6, а не с 0.9.
 */
export const FlashScene: React.FC = () => {
  const frame = useCurrentFrame();

  const white = interpolate(frame, [0, 9], [0, 1], { extrapolateRight: "clamp" });
  const ring = interpolate(frame, [2, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...EASE_OUT),
  });
  // Хвост плана — уже чистая бумага: следующая сцена начинается с неё же, и
  // стыка между ними быть не должно.
  const ringOpacity = interpolate(frame, [2, 8, 30], [0, 0.6, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.darkPaper }}>
      <AbsoluteFill style={{ backgroundColor: BRAND.paper, opacity: white }} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            width: 300,
            height: 300,
            borderRadius: 999,
            border: `6px solid ${BRAND.cta}`,
            opacity: ringOpacity,
            scale: 0.2 + ring * 4.4,
          }}
        />
      </AbsoluteFill>
      {/* Затемнение по краям гасится вместе со вспышкой — иначе на белом
          останется серый ободок от тёмной половины. */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(70% 50% at 50% 45%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.7) 100%)",
          opacity: 1 - white,
        }}
      />
    </AbsoluteFill>
  );
};

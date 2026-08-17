import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { BRAND, EASE_OUT, TRACKING, TYPE, WEIGHT } from "../brand";
import { BRAND_FONT } from "../fonts";

/**
 * Хук: крупная строка в верхней трети первых секунд ролика.
 *
 * ЗАЧЕМ ОН НУЖЕН ОТДЕЛЬНО ОТ СУБТИТРА. В ленте решение «смотреть или смахнуть»
 * принимается за первую секунду, и принимается по картинке: звук выключен, а
 * субтитр стоит внизу мелким кеглем и читается вторым. У первой версии ролика
 * весь смысл первых трёх секунд жил в голосе диктора и в этом мелком субтитре,
 * то есть для листающего зрителя ролик открывался тёмным кадром ни о чём.
 * Хук закрывает ровно эту дыру: он говорит, про что видео, до того как зритель
 * успел решить.
 *
 * ПОЧЕМУ ВВЕРХУ. Низ кадра занимает интерфейс площадки, центр — сам план.
 * Верхняя треть — единственное место, где крупный текст не спорит ни с тем,
 * ни с другим. Отступ 210 px выбран так, чтобы двухстрочный хук закончился
 * выше `DarkLabel` (он живёт на 420 px и в это же время показывает «03:14»):
 * две надписи в одной колонке слиплись бы в кашу.
 *
 * ПОЧЕМУ НЕ ДВИЖЕТСЯ. Под хуком уже едет наезд плана. Второе движение в тех же
 * кадрах заставляет глаз выбирать, за чем следить, — а выбирать ему сейчас
 * нечем, он ещё не понял, что смотрит. Поэтому только проявление и уход.
 */
export const Hook: React.FC<{ lines: string[]; durationInFrames: number }> = ({
  lines,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();

  if (lines.length === 0 || frame >= durationInFrames) return null;

  // Вход быстрый, уход медленный. Быстрый вход — потому что опоздавший хук
  // бесполезен: к двадцатому кадру зритель уже решил. Медленный уход — потому
  // что резкое исчезновение читается как склейка и обещает смену плана,
  // которой здесь нет.
  const opacity = interpolate(
    frame,
    [0, 5, durationInFrames - 14, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(...EASE_OUT) },
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-start",
        alignItems: "center",
        paddingTop: 210,
        paddingLeft: 90,
        paddingRight: 90,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          fontFamily: BRAND_FONT,
          fontWeight: WEIGHT.light,
          fontSize: TYPE.h2,
          lineHeight: 1.14,
          letterSpacing: TRACKING.display,
          color: BRAND.paper,
          // Под текстом снятый кадр произвольной яркости — без тени хук
          // проваливается на светлых участках подложки.
          textShadow: "0 2px 24px rgba(0, 0, 0, 0.6)",
          opacity,
        }}
      >
        {lines.map((line, i) => (
          <span key={`${i}-${line}`}>{line}</span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

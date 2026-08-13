import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND, TRACKING, TYPE, WEIGHT } from "../brand";
import { BRAND_FONT } from "../fonts";
import type { AdPhrase } from "../types";

/**
 * Караоке-субтитры по пословным таймингам ElevenLabs.
 *
 * Зачем они обязательны именно в рекламе: в лентах Shorts/Reels/TikTok звук
 * выключен по умолчанию, и без текста ролик немой — а весь оффер здесь
 * проговаривается голосом. Поэтому субтитры не «дополнение для доступности»,
 * а второй, равноправный канал.
 *
 * Механика подачи: вся фраза видна сразу приглушённой, произнесённые слова
 * набирают полный контраст. Так зритель читает мысль целиком, а не гадает по
 * одному слову, но при этом видит, где сейчас голос. Слова не двигаются и не
 * меняют кегль: прыгающая строка на 1080 px по ширине заставляет глаз
 * перечитывать, и текст перестаёт успевать за речью.
 *
 * Цвет ведётся снаружи (`dark`): половины ролика противоположны по фону, и
 * субтитр обязан переключиться вместе с ними.
 */
export const Captions: React.FC<{ phrases: AdPhrase[]; dark: boolean }> = ({ phrases, dark }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;

  const current = phrases.find((p) => time >= p.start - 0.12 && time <= p.end + 0.28);
  if (!current) return null;

  const spoken = dark ? "rgba(255, 255, 255, 0.97)" : BRAND.ink;
  const pending = dark ? "rgba(255, 255, 255, 0.42)" : "rgba(10, 10, 11, 0.34)";

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 268,
        paddingLeft: 96,
        paddingRight: 96,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0 14px",
          maxWidth: 880,
          textAlign: "center",
          fontFamily: BRAND_FONT,
          fontWeight: WEIGHT.medium,
          fontSize: TYPE.lead,
          lineHeight: 1.35,
          letterSpacing: TRACKING.heading,
          // Тень нужна только на тёмной половине: там под текстом снятый кадр
          // произвольной яркости. На белом поле она читалась бы грязью.
          textShadow: dark ? "0 2px 18px rgba(0, 0, 0, 0.55)" : "none",
        }}
      >
        {current.words.map((word, i) => (
          <span key={`${word.s}-${i}`} style={{ color: time >= word.s ? spoken : pending }}>
            {word.w}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

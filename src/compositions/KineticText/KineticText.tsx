import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { interFamily as fontFamily } from "../../lib/fonts";
import { GradientBackground } from "../../components/GradientBackground";
import { SafeArea } from "../../components/SafeArea";

export type KineticTextProps = {
  /** Небольшой заголовок-надзаголовок сверху (капсом). */
  kicker: string;
  /** Основные слова, влетают по одному. */
  words: string[];
  /** Акцентный цвет для выделенных слов. */
  accent: string;
  from: string;
  to: string;
};

/**
 * РЕЦЕПТ: кинетическая типографика. Слова влетают по очереди на градиентном
 * фоне. Хорош для цитат, фактов, хуков — самый быстрый в рендере формат.
 */
export const KineticText: React.FC<KineticTextProps> = ({
  kicker,
  words,
  accent,
  from,
  to,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const kickerIn = spring({ frame, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ fontFamily }}>
      <GradientBackground from={from} to={to} />
      <SafeArea style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            color: "rgba(255,255,255,0.72)",
            fontSize: 40,
            fontWeight: 600,
            letterSpacing: 8,
            textTransform: "uppercase",
            marginBottom: 48,
            opacity: kickerIn,
            transform: `translateY(${interpolate(kickerIn, [0, 1], [-40, 0])}px)`,
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            columnGap: 24,
            rowGap: 8,
          }}
        >
          {words.map((word, i) => {
            const delay = 8 + i * 6;
            const enter = spring({
              frame: frame - delay,
              fps,
              config: { damping: 200 },
            });
            const y = interpolate(enter, [0, 1], [90, 0]);
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  fontSize: 128,
                  fontWeight: 800,
                  lineHeight: 1.02,
                  color: i % 3 === 1 ? accent : "white",
                  opacity: enter,
                  transform: `translateY(${y}px)`,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      </SafeArea>
    </AbsoluteFill>
  );
};

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

export type Bar = { label: string; value: number };

export type DataChartProps = {
  title: string;
  bars: Bar[];
  accent: string;
};

/**
 * РЕЦЕПТ: data-ролик. Анимированный бар-чарт на чистом SVG (без внешних либ).
 * Бары «вырастают» по пружине с задержкой. Для сложных графиков можно
 * подключить Recharts/D3 — принцип тот же: прогресс берём из useCurrentFrame().
 */
export const DataChart: React.FC<DataChartProps> = ({ title, bars, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const maxValue = Math.max(...bars.map((b) => b.value), 1);

  const titleIn = spring({ frame, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ fontFamily }}>
      <GradientBackground from="#0b1220" to="#132a4a" />
      <SafeArea style={{ justifyContent: "center" }}>
        <div
          style={{
            color: "white",
            fontSize: 76,
            fontWeight: 800,
            marginBottom: 72,
            opacity: titleIn,
            transform: `translateY(${interpolate(titleIn, [0, 1], [-40, 0])}px)`,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
          {bars.map((bar, i) => {
            const delay = 10 + i * 8;
            const grow = spring({
              frame: frame - delay,
              fps,
              config: { damping: 200 },
            });
            const widthPct = (bar.value / maxValue) * 100 * grow;
            const shownValue = Math.round(bar.value * grow);
            return (
              <div key={i}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "white",
                    fontSize: 44,
                    fontWeight: 600,
                    marginBottom: 16,
                  }}
                >
                  <span>{bar.label}</span>
                  <span style={{ color: accent, fontWeight: 800 }}>
                    {shownValue}
                  </span>
                </div>
                <div
                  style={{
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: "rgba(255,255,255,0.10)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${widthPct}%`,
                      borderRadius: 22,
                      background: `linear-gradient(90deg, ${accent}, #ffffff)`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </SafeArea>
    </AbsoluteFill>
  );
};

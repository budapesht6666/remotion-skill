import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

/**
 * Плавно «дышащий» градиентный фон. Универсальная подложка для текстовых
 * и data-роликов, когда нет видео-фона. Анимация детерминирована по кадру.
 */
export const GradientBackground: React.FC<{
  from?: string;
  to?: string;
}> = ({ from = "#0f172a", to = "#1e3a8a" }) => {
  const frame = useCurrentFrame();
  const angle = interpolate(frame, [0, 300], [120, 210], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${angle}deg, ${from}, ${to})`,
      }}
    />
  );
};

import React from "react";
import { AbsoluteFill } from "remotion";

/**
 * Безопасная зона для вертикального видео. Верх/низ перекрываются интерфейсом
 * YouTube Shorts / TikTok / Reels (аватар, описание, кнопки), поэтому важный
 * контент держим в центральной области.
 */
export const SafeArea: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => {
  return (
    <AbsoluteFill
      style={{
        paddingTop: 240,
        paddingBottom: 340,
        paddingLeft: 64,
        paddingRight: 64,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

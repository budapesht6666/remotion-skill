/** Плёночные эффекты: зерно, виньетка, дрожание кадра, мерцание, царапины, ирис. Всё — чистая функция кадра. */
import React, { useId } from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";

/** Зерно 35 мм: шум feTurbulence с новым зерном каждый кадр. */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.14 }) => {
  const frame = useCurrentFrame();
  const id = useId().replace(/:/g, "");
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "overlay", opacity }}>
      <svg width="100%" height="100%">
        <filter id={`grain${id}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame % 97} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain${id})`} />
      </svg>
    </AbsoluteFill>
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.55 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(20,10,0,${strength}) 100%)`,
    }}
  />
);

/** Редкие вертикальные царапины и пылинки старой копии. */
export const Scratches: React.FC<{ density?: number }> = ({ density = 0.25 }) => {
  const frame = useCurrentFrame();
  const items = [0, 1, 2].filter((i) => random(`s${frame}-${i}`) < density);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {items.map((i) => {
        const x = random(`x${frame}-${i}`) * 100;
        const o = 0.15 + random(`o${frame}-${i}`) * 0.25;
        return <div key={i} style={{ position: "absolute", left: `${x}%`, top: 0, bottom: 0, width: 2, background: `rgba(255,248,230,${o})` }} />;
      })}
      {random(`d${frame}`) < density * 0.6 && (
        <div
          style={{
            position: "absolute",
            left: `${random(`dx${frame}`) * 100}%`,
            top: `${random(`dy${frame}`) * 100}%`,
            width: 6 + random(`ds${frame}`) * 10,
            height: 4 + random(`dh${frame}`) * 6,
            borderRadius: "50%",
            background: "rgba(20,12,4,0.55)",
          }}
        />
      )}
    </AbsoluteFill>
  );
};

/** Дрожание кадра и мерцание яркости УБРАНЫ (2026-11-08): пользователь — «тряска и мерцание способны вызвать
 *  рвоту и эпилепсию». Хук оставлен пустым, чтобы не трогать вызовы. Царапины плёнки — можно. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const useWeave = (_amount = 1): React.CSSProperties => ({});

/** Грейд «Совколор-66» для живых кадров: тёплый, чуть выцветший, приподнятые тени. */
export const SOVCOLOR = "sepia(0.22) saturate(1.18) contrast(1.04) brightness(1.03) hue-rotate(-6deg)";
export const Warmth: React.FC = () => (
  <>
    <AbsoluteFill style={{ background: "#ffb36b", mixBlendMode: "soft-light", opacity: 0.22, pointerEvents: "none" }} />
    <AbsoluteFill style={{ background: "#3a2410", mixBlendMode: "lighten", opacity: 0.1, pointerEvents: "none" }} />
  </>
);

/** Ирис: p=0 открыт, p=1 закрыт в точку (cx, cy в долях кадра). */
export const Iris: React.FC<{ p: number; cx?: number; cy?: number }> = ({ p, cx = 0.5, cy = 0.5 }) => {
  if (p <= 0) return null;
  const r = Math.max(0, (1 - p) * 1250);
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background: `radial-gradient(circle at ${cx * 100}% ${cy * 100}%, transparent ${r}px, #0b0906 ${r + 1.5}px)`,
      }}
    />
  );
};

/** Вся «плёнка» поверх сцены одной строкой. */
export const FilmLook: React.FC<{ grain?: number; vignette?: number; scratches?: number }> = ({
  grain = 0.14,
  vignette = 0.5,
  scratches = 0.2,
}) => (
  <>
    <Grain opacity={grain} />
    <Scratches density={scratches} />
    <Vignette strength={vignette} />
  </>
);

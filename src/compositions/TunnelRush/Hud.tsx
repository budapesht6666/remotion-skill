import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { SafeArea } from "../../components/SafeArea";
import { interFamily, monoFamily } from "../../lib/fonts";
import { ACTS, actAt, type CameraState } from "./flight";

/**
 * DOM-оверлей поверх 3D: приборы кокпита, титры, атмосфера.
 *
 * Приборы здесь не украшение: телеметрия (скорость, перегрузка, авиагоризонт)
 * — это то, чем зритель считывает физику. Плюс статичная рамка кокпита и
 * прицел дают глазу неподвижную опору — приём против укачивания, когда
 * периферия несётся.
 */

const CLAMP = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// --- Приборы --------------------------------------------------------------
const panel = (accent: string): React.CSSProperties => ({
  fontFamily: monoFamily,
  color: "#eafcff",
  padding: "10px 18px",
  border: "2px solid rgba(180,230,255,.28)",
  borderRadius: 4,
  background: "rgba(4,12,24,.42)",
  textShadow: `0 0 14px ${accent}`,
  letterSpacing: 3,
});

/** Авиагоризонт: крен и тангаж относительно мира. */
const Horizon: React.FC<{ cam: CameraState; accent: string }> = ({
  cam,
  accent,
}) => {
  const size = 168;
  const deg = (r: number) => (r * 180) / Math.PI;
  // У вертикали тангажа мировой крен вырождается (как у настоящей авиагоризонт-
  // ной гировертикали) — вместо дёрганья гасим прибор.
  const valid = 1 - smoothstep(1.0, 1.35, Math.abs(cam.climb));
  const pitchShift = Math.max(-1, Math.min(1, deg(cam.climb) / 60)) * (size * 0.42);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: "2px solid rgba(180,230,255,.35)",
        background: "rgba(4,12,24,.5)",
        overflow: "hidden",
        position: "relative",
        boxShadow: `0 0 26px rgba(0,0,0,.55)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -size * 0.5,
          opacity: 0.85 * valid,
          transform: `rotate(${-deg(cam.bank)}deg) translateY(${pitchShift}px)`,
          background: `linear-gradient(180deg, ${accent}44 0%, ${accent}22 49.6%, rgba(255,190,120,.30) 50.4%, rgba(255,150,70,.16) 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: -size * 0.5,
          opacity: 0.9 * valid,
          transform: `rotate(${-deg(cam.bank)}deg) translateY(${pitchShift}px)`,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 49.6%, rgba(234,252,255,.85) 49.6%, rgba(234,252,255,.85) 50.4%, rgba(0,0,0,0) 50.4%)",
        }}
      />
      {/* Символ аппарата — неподвижен, это опора для глаза. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 76,
          height: 2,
          marginLeft: -38,
          background: "#ffd76a",
          boxShadow: "0 0 10px #ffd76a",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 8,
          height: 8,
          margin: "-4px 0 0 -4px",
          borderRadius: "50%",
          border: "2px solid #ffd76a",
        }}
      />
    </div>
  );
};

/** Шкала перегрузки: −1…+7 g, красная зона с 5 g. */
const GMeter: React.FC<{ g: number; danger: string }> = ({ g, danger }) => {
  const t = Math.max(0, Math.min(1, (g + 1) / 8));
  const hot = smoothstep(4.6, 6.2, g);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 210 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: monoFamily,
          fontSize: 26,
          letterSpacing: 3,
          color: "#eafcff",
        }}
      >
        <span style={{ opacity: 0.65 }}>G-LOAD</span>
        <span style={{ color: hot > 0.5 ? danger : "#eafcff", fontWeight: 700 }}>
          {g >= 0 ? " " : ""}
          {g.toFixed(1)}
        </span>
      </div>
      <div
        style={{
          position: "relative",
          height: 12,
          borderRadius: 2,
          background: "rgba(180,230,255,.16)",
          border: "1px solid rgba(180,230,255,.25)",
        }}
      >
        {/* Отметка 1 g — «просто прямой полёт». */}
        <div
          style={{
            position: "absolute",
            left: `${(2 / 8) * 100}%`,
            top: -3,
            bottom: -3,
            width: 2,
            background: "rgba(234,252,255,.55)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${t * 100}%`,
            background: `linear-gradient(90deg, #8ef2ff, ${hot > 0.4 ? danger : "#ffffff"})`,
            boxShadow: `0 0 16px ${hot > 0.4 ? danger : "#8ef2ff"}`,
          }}
        />
      </div>
    </div>
  );
};

export const Hud: React.FC<{
  cam: CameraState;
  accent: string;
  danger: string;
}> = ({ cam, accent, danger }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const act = actAt(t);

  const kmh = Math.round(cam.speed * 3.6);
  const mach = cam.speed / 343;
  const left = Math.max(0, (durationInFrames - frame) / fps);
  const progress = frame / durationInFrames;
  const appear = interpolate(frame, [10, 46], [0, 1], CLAMP);

  return (
    <SafeArea
      style={{
        justifyContent: "space-between",
        opacity: appear,
        pointerEvents: "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ ...panel(accent), fontSize: 30 }}>{act.label}</div>
        <div style={{ ...panel(accent), textAlign: "right", padding: "8px 18px" }}>
          <div style={{ fontSize: 46, fontWeight: 700, lineHeight: 1.1 }}>
            {kmh}
            <span style={{ fontSize: 22, opacity: 0.7 }}> KM/H</span>
          </div>
          <div style={{ fontSize: 22, opacity: 0.72 }}>MACH {mach.toFixed(2)}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <Horizon cam={cam} accent={accent} />
          <GMeter g={cam.gy} danger={danger} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: monoFamily,
              fontSize: 28,
              letterSpacing: 4,
              color: "#eafcff",
              textShadow: `0 0 14px ${accent}`,
            }}
          >
            <span>45s · ONE TAKE</span>
            <span>{left.toFixed(1)}s</span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: "rgba(234,252,255,.16)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress * 100}%`,
                height: "100%",
                background: `linear-gradient(90deg, ${accent}, #ffffff)`,
                boxShadow: `0 0 18px ${accent}`,
              }}
            />
          </div>
        </div>
      </div>
    </SafeArea>
  );
};

// --- Титры ----------------------------------------------------------------
/** Окно показа титра: наплыв → выдержка → уход. */
const flash = (frame: number, start: number, hold: number, fade = 16): number =>
  interpolate(
    frame,
    [start, start + fade, start + fade + hold, start + fade + hold + fade],
    [0, 1, 1, 0],
    CLAMP,
  );

const Caption: React.FC<{
  opacity: number;
  children: React.ReactNode;
  size?: number;
  color?: string;
  glow: string;
}> = ({ opacity, children, size = 96, color = "#ffffff", glow }) => {
  if (opacity <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute",
        opacity,
        fontFamily: interFamily,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.05,
        letterSpacing: -1,
        textTransform: "uppercase",
        textAlign: "center",
        color,
        textShadow: `0 0 16px ${glow}, 0 0 54px ${glow}, 0 6px 28px rgba(0,0,0,.75)`,
      }}
    >
      {children}
    </div>
  );
};

const secAt = (id: string): number =>
  (ACTS.find((a) => a.id === id)?.from ?? 0) * 60;

export const Titles: React.FC<{
  hook: string;
  taunt: string;
  outroTitle: string;
  outroSub: string;
  accent: string;
  danger: string;
}> = ({ hook, taunt, outroTitle, outroSub, accent, danger }) => {
  const frame = useCurrentFrame();
  const hookOpacity = flash(frame, 6, 104, 18);
  const hookScale = interpolate(frame, [6, 150], [1.1, 1], {
    ...CLAMP,
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        padding: "0 70px",
      }}
    >
      <div style={{ position: "absolute", transform: `scale(${hookScale})` }}>
        <Caption opacity={hookOpacity} size={92} glow={accent}>
          {hook}
        </Caption>
      </div>
      <Caption opacity={flash(frame, secAt("roll") - 8, 46)} size={104} glow={accent}>
        Barrel
        <br />
        Roll
      </Caption>
      <Caption opacity={flash(frame, secAt("brake") - 8, 40)} size={104} glow={danger}>
        Brake
        <br />5 G
      </Caption>
      <Caption opacity={flash(frame, secAt("loop") - 8, 52)} size={112} glow={accent}>
        Full
        <br />
        Loop
      </Caption>
      <Caption
        opacity={flash(frame, secAt("bank") + 120, 96, 18)}
        size={84}
        glow={danger}
      >
        {taunt}
      </Caption>
      <Caption opacity={flash(frame, secAt("hyper") - 8, 54)} size={112} glow={danger}>
        Hyper
        <br />
        Run
      </Caption>
      <div
        style={{
          position: "absolute",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 30,
        }}
      >
        <Caption opacity={flash(frame, secAt("clear") + 14, 150, 22)} size={116} glow={accent}>
          {outroTitle}
        </Caption>
      </div>
      <div style={{ position: "absolute", marginTop: 230 }}>
        <Caption
          opacity={flash(frame, secAt("clear") + 40, 120, 22)}
          size={46}
          color="#cbf7ff"
          glow={accent}
        >
          {outroSub}
        </Caption>
      </div>
    </AbsoluteFill>
  );
};

// --- Атмосфера ------------------------------------------------------------
export const Atmosphere: React.FC<{
  cam: CameraState;
  accent: string;
  danger: string;
}> = ({ cam, accent, danger }) => {
  const frame = useCurrentFrame();

  // Свет «в конце тоннеля» — тем ярче, чем быстрее идём.
  const core = 0.08 + 0.34 * smoothstep(0, 480, cam.speed);
  // Виньетка поджимается на скорости: приём VR-комфорта (гасим периферийный
  // оптический поток, от которого и укачивает), плюс кадр читается собраннее.
  const vig = 46 - 14 * smoothstep(60, 480, cam.speed);
  // Портал: мягкий налив за 0.35 с и спад за 1.2 с. Потолок 0.5 и холодный
  // оттенок вместо белой вспышки на весь кадр.
  const warp = interpolate(
    frame,
    [2515, 2545, 2578, 2650],
    [0, 0.34, 0.2, 0],
    CLAMP,
  );
  const heat = 0.14 * cam.tone;

  return (
    <>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 47%, ${accent} 0%, rgba(0,0,0,0) 34%)`,
          opacity: core,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{
          background: danger,
          opacity: heat,
          mixBlendMode: "overlay",
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 47%, rgba(0,0,0,0) ${vig}%, rgba(0,0,0,.72) 100%)`,
          pointerEvents: "none",
        }}
      />
      {/* Рамка «шлема»: неподвижная опора для глаза = меньше укачивания. */}
      <AbsoluteFill
        style={{
          boxShadow: "inset 0 0 180px 60px rgba(0,0,0,.55)",
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 47%, #dff6ff 0%, #9fe4ff 42%, rgba(160,220,255,0) 76%)",
          opacity: warp,
          pointerEvents: "none",
        }}
      />
      {/* Прицел: статичен в кадре, глазу есть за что держаться. */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          opacity: 0.3,
        }}
      >
        <div
          style={{
            width: 190,
            height: 190,
            borderRadius: "50%",
            border: "1px solid rgba(200,240,255,.5)",
            position: "relative",
          }}
        >
          {[
            { top: "50%", left: -26, width: 22, height: 1 },
            { top: "50%", right: -26, width: 22, height: 1 },
            { left: "50%", top: -26, width: 1, height: 22 },
            { left: "50%", bottom: -26, width: 1, height: 22 },
          ].map((s, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                background: "rgba(200,240,255,.75)",
                ...s,
              }}
            />
          ))}
        </div>
      </AbsoluteFill>
    </>
  );
};

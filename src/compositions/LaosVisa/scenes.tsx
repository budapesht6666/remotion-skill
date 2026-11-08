/** Сцены монтажа «Лаосской визы», которых нет на доске стиля: живой клип, картинка, сумма, паспорт, записка, концовка. */
import React from "react";
import { AbsoluteFill, Easing, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { SubscribeCta } from "../../components/SubscribeCta";
import { C, F, H, W } from "./theme";
import { FilmLook, Iris, SOVCOLOR, Warmth, useWeave } from "./fx";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.22, 1, 0.36, 1);

/* ---------- Подписи поверх плана ---------- */
export const Caption: React.FC<{ text: string }> = ({ text }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [4, 12], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", left: 60, bottom: 56, maxWidth: 1300, opacity: o, transform: `translateX(${(1 - o) * -30}px)` }}>
      <span style={{ fontFamily: F.hand, fontSize: 44, color: C.cream, background: "rgba(20,14,8,0.72)", padding: "6px 22px", borderRadius: 8, borderLeft: `6px solid ${C.mustard}` }}>
        {text}
      </span>
    </div>
  );
};

export const Badge: React.FC<{ text: string }> = ({ text }) => {
  const f = useCurrentFrame();
  const s = interpolate(f, [0, 7], [0, 1], { ...clamp, easing: Easing.out(Easing.back(2)) });
  return (
    <div
      style={{
        position: "absolute",
        left: 70,
        top: 60,
        width: 170,
        height: 170,
        borderRadius: "50%",
        background: C.brick,
        border: `6px solid ${C.cream}`,
        color: C.cream,
        fontFamily: F.title,
        fontSize: 76,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `scale(${s}) rotate(${(1 - s) * -40}deg)`,
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
      }}
    >
      {text}
    </div>
  );
};

/** Кнопка подписки — общая плашка проекта (src/components/SubscribeCta), подписи по-русски.
 *  Стартует за 3.2 c до конца плана; звон на клике — внутри плашки. */
const Subscribe: React.FC<{ d: number }> = ({ d }) => {
  const start = Math.max(0, d - 96);
  return (
    <Sequence from={start} durationInFrames={d - start}>
      <SubscribeLabelled />
    </Sequence>
  );
};
const SubscribeLabelled: React.FC = () => {
  const f = useCurrentFrame();
  const clicked = f >= Math.round(1.02 * 30) + 3;
  return <SubscribeCta label={clicked ? "ВЫ ПОДПИСАНЫ" : "ПОДПИСАТЬСЯ"} centerY={0.7} bellVolume={0.35} />;
};

/* ---------- Живой клип: гориз. на весь кадр, вертик. — по центру поверх размытой копии ---------- */
export const ClipSeg: React.FC<{ src: string; vertical?: boolean; d: number; stock?: boolean; fast?: boolean; night?: boolean }> = ({ src, vertical, fast }) => {
  const weave = useWeave(fast ? 2.5 : 0);
  const grade = SOVCOLOR;
  return (
    <AbsoluteFill style={{ background: "#000", ...(fast ? weave : {}) }}>
      {vertical ? (
        <>
          <OffthreadVideo src={staticFile(src)} muted style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", filter: "blur(36px) brightness(0.5) sepia(0.4)", transform: "scale(1.15)" }} />
          <div style={{ position: "absolute", left: (W - (H * 9) / 16) / 2, top: 0, width: (H * 9) / 16, height: H, boxShadow: "0 0 60px rgba(0,0,0,0.7)" }}>
            <OffthreadVideo src={staticFile(src)} muted style={{ width: "100%", height: "100%", filter: grade }} />
          </div>
        </>
      ) : (
        <OffthreadVideo src={staticFile(src)} muted style={{ width: "100%", height: "100%", filter: grade }} />
      )}
      <Warmth />
      {fast && (
        <div style={{ position: "absolute", right: 60, top: 50, fontFamily: F.title, fontSize: 64, color: C.cream, textShadow: "3px 3px 0 #000", transform: "rotate(-6deg)" }}>
          ×6
        </div>
      )}
      <FilmLook grain={fast ? 0.2 : 0.1} vignette={fast ? 0.55 : 0.38} scratches={fast ? 0.5 : 0.06} />
    </AbsoluteFill>
  );
};

/* ---------- Картинка: наезд/панорама, ч/б архив, рисунок без грейда ---------- */
export const StillSeg: React.FC<{
  src: string;
  d: number;
  vertical?: boolean;
  push?: number;
  pan?: [number, number];
  bw?: boolean;
  gen?: boolean;
  flip?: boolean;
}> = ({ src, d, vertical, push = 0.06, pan, bw, gen, flip }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [0, d], [0, 1], { easing: Easing.inOut(Easing.quad) });
  const z = 1 + push * p;
  const origin = pan ? `${pan[0] * 100}% ${pan[1] * 100}%` : "50% 50%";
  const filter = bw ? "grayscale(1) contrast(1.15) sepia(0.25)" : gen ? "saturate(1.02)" : SOVCOLOR;
  const img = (
    <Img
      src={staticFile(src)}
      style={{ width: "100%", height: "100%", objectFit: vertical ? "contain" : "cover", transform: `scale(${z}) scaleX(${flip ? -1 : 1})`, transformOrigin: origin, filter }}
    />
  );
  return (
    <AbsoluteFill style={{ background: gen ? C.paper : "#000" }}>
      {vertical && (
        <Img src={staticFile(src)} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", filter: "blur(36px) brightness(0.5) sepia(0.4)", transform: "scale(1.15)" }} />
      )}
      <AbsoluteFill>{img}</AbsoluteFill>
      {!gen && !bw && <Warmth />}
      <FilmLook grain={gen ? 0.08 : bw ? 0.2 : 0.1} vignette={gen ? 0.3 : 0.45} scratches={bw ? 0.4 : gen ? 0.04 : 0.06} />
    </AbsoluteFill>
  );
};

/* ---------- Крупные цифры на бумаге ---------- */
export const SumScene: React.FC<{ a: string; b: string; c: string; d?: string; done?: boolean }> = ({ a, b, c, d, done }) => {
  const f0 = useCurrentFrame();
  const f = f0 + (done ? 200 : 0);
  const weave = useWeave(0.8);
  const line = (txt: string, at: number, size: number, color: string = C.ink) => {
    const o = interpolate(f, [at, at + 8], [0, 1], { ...clamp, easing: ease });
    return (
      <div style={{ fontFamily: F.title, fontSize: size, color, opacity: o, transform: `translateY(${(1 - o) * 30}px) scale(${0.9 + 0.1 * o})`, lineHeight: 1.15 }}>
        {txt}
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ background: C.paper, justifyContent: "center", alignItems: "center", textAlign: "center", ...weave }}>
      {line(a, 4, 110)}
      {line(b, 22, 84, C.teal)}
      {line(c, 44, 150, C.brick)}
      {d && line(d, 64, 70, C.ink)}
      <FilmLook grain={0.12} vignette={0.35} scratches={0.15} />
    </AbsoluteFill>
  );
};

/* ---------- Паспорт и четыре штампа ---------- */
const STAMPS = [
  { t: "VIỆT NAM", s: "XUẤT CẢNH · ВЫЕЗД", c: "#7a2a8a", x: 330, y: 300, r: -12 },
  { t: "LAO PDR", s: "ARRIVAL · ВЪЕЗД", c: "#1f5ea8", x: 980, y: 320, r: 9 },
  { t: "LAO PDR", s: "DEPARTURE · ВЫЕЗД", c: "#1f5ea8", x: 380, y: 640, r: 6 },
  { t: "VIỆT NAM", s: "NHẬP CẢNH · ВЪЕЗД", c: "#b8432f", x: 1000, y: 650, r: -8 },
];

export const PassportScene: React.FC<{ n: number; slam: number; fee?: boolean }> = ({ n, slam, fee }) => {
  const f = useCurrentFrame();
  const shake = 0; // без тряски на ударе — только масштаб штампа
  return (
    <AbsoluteFill style={{ background: "#2b3a33", justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          position: "relative",
          width: 1560,
          height: 960,
          background: "repeating-radial-gradient(circle at 50% 50%, #efe6cf 0 6px, #ebe0c5 6px 12px)",
          borderRadius: 20,
          boxShadow: "0 30px 70px rgba(0,0,0,0.5)",
          transform: `translate(${shake}px, ${shake * 0.6}px)`,
        }}
      >
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 4, background: "rgba(0,0,0,0.15)" }} />
        <div style={{ position: "absolute", left: 40, top: 26, fontFamily: F.mono, fontSize: 30, color: "rgba(0,0,0,0.35)", letterSpacing: 8 }}>ВИЗЫ · VISAS</div>
        {STAMPS.slice(0, n).map((s, i) => {
          const isNew = i === n - 1;
          const k = isNew ? interpolate(f, [slam - 3, slam], [0, 1], clamp) : 1;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: s.x,
                top: s.y,
                width: 420,
                padding: "16px 10px",
                border: `7px double ${s.c}`,
                borderRadius: 18,
                color: s.c,
                textAlign: "center",
                fontFamily: F.mono,
                opacity: k * 0.88,
                transform: `rotate(${s.r}deg) scale(${interpolate(k, [0, 1], [2.2, 1])})`,
                mixBlendMode: "multiply",
              }}
            >
              <div style={{ fontSize: 50, fontWeight: 700, letterSpacing: 4 }}>{s.t}</div>
              <div style={{ fontSize: 26 }}>{s.s}</div>
              <div style={{ fontSize: 30, marginTop: 4 }}>07 NOV 2026</div>
              {fee && <div style={{ fontFamily: F.hand, fontSize: 44, color: C.brick, marginTop: 6 }}>+ 50 000 ₫</div>}
            </div>
          );
        })}
      </div>
      <FilmLook grain={0.1} vignette={0.45} scratches={0.08} />
    </AbsoluteFill>
  );
};

/* ---------- Записка-совет ---------- */
export const NoteScene: React.FC<{ title: string; lines: string[] }> = ({ title, lines }) => {
  const f = useCurrentFrame();
  const drop = interpolate(f, [0, 10], [-700, 0], { ...clamp, easing: Easing.out(Easing.back(1.2)) });
  return (
    <AbsoluteFill style={{ background: C.olive, justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          width: 1180,
          padding: "70px 80px 80px",
          background: "#fff6c8",
          transform: `translateY(${drop}px) rotate(-2.5deg)`,
          boxShadow: "0 30px 60px rgba(0,0,0,0.4)",
          backgroundImage: "repeating-linear-gradient(0deg, transparent 0 74px, rgba(47,127,122,0.25) 74px 77px)",
        }}
      >
        <div style={{ position: "absolute", left: "50%", top: -26, width: 52, height: 52, borderRadius: "50%", background: C.brick, boxShadow: "0 6px 10px rgba(0,0,0,0.4)" }} />
        <div style={{ fontFamily: F.title, fontSize: 88, color: C.brick, marginBottom: 18 }}>{title}</div>
        {lines.map((l, i) => {
          const o = interpolate(f, [12 + i * 10, 20 + i * 10], [0, 1], clamp);
          return (
            <div key={i} style={{ fontFamily: F.hand, fontSize: 76, lineHeight: 1.0, color: C.ink, opacity: o, clipPath: `inset(0 ${(1 - o) * 100}% 0 0)`, marginTop: 4 }}>
              {l}
            </div>
          );
        })}
      </div>
      <FilmLook grain={0.1} vignette={0.4} scratches={0.08} />
    </AbsoluteFill>
  );
};

/* ---------- Концовка ---------- */
export const EndScene: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const weave = useWeave(1.4);
  const o = interpolate(f, [0, 8], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: "#0d0b08", justifyContent: "center", alignItems: "center", ...weave, opacity: o }}>
      <div style={{ fontFamily: F.deco, fontSize: 170, color: C.cream, letterSpacing: 6 }}>Конец фильма</div>
      <div style={{ fontFamily: F.title, fontSize: 48, color: C.cream, opacity: 0.75, marginTop: 20 }}>Tropinkin travel · 2026</div>
      <FilmLook grain={0.08} vignette={0.6} scratches={0.3} />
      <Iris p={interpolate(f, [d - 40, d - 5], [0, 1], clamp)} />
    </AbsoluteFill>
  );
};

/** Надпись в верхней полосе кадра (финальная картинка оставляет сверху пустую кремовую полосу). */
export const TopTitle: React.FC<{ text: string }> = ({ text }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [6, 20], [0, 1], { ...clamp, easing: ease });
  return (
    <div style={{ position: "absolute", top: 34, width: "100%", textAlign: "center", opacity: o, transform: `scale(${0.9 + 0.1 * o})` }}>
      <span style={{ fontFamily: F.deco, fontSize: 66, color: C.brick, textShadow: `3px 3px 0 ${C.ink}`, letterSpacing: 2 }}>{text}</span>
    </div>
  );
};

export { Subscribe };

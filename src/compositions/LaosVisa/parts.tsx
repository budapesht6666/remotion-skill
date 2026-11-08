/** Сцены-заготовки «Лаосской визы»: название, интертитр, карточка персонажа, карта, чек, цитата в телевизоре. */
import React from "react";
import { AbsoluteFill, Easing, Img, OffthreadVideo, interpolate, random, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { getLength, getPointAtLength } from "@remotion/paths";
import { C, F, H, W } from "./theme";
import { FilmLook, Iris, SOVCOLOR, Warmth, useWeave } from "./fx";
import { GEO } from "./geo";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.22, 1, 0.36, 1);

/** Рисованная дрожащая линия: контур с шумом, перерисовывается раз в 3 кадра (как «живая» линия мультфильма). */
const boil = (frame: number) => Math.floor(frame / 3);
const wobblyCircle = (cx: number, cy: number, r: number, seed: number) => {
  const n = 28;
  const pts = Array.from({ length: n + 3 }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - 0.3;
    const rr = r * (1 + (random(`${seed}-${i % n}`) - 0.5) * 0.06) + i * 0.6;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });
  return "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L");
};

/* ---------- Название ---------- */
export const TitleScene: React.FC<{ art: string; dur: number }> = ({ art, dur }) => {
  const f = useCurrentFrame();
  const weave = useWeave(1);
  const z = interpolate(f, [0, dur], [1.04, 1.12]);
  const t1 = interpolate(f, [8, 22], [0, 1], { ...clamp, easing: ease });
  const t2 = interpolate(f, [22, 36], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ background: C.paper, ...weave }}>
      <Img src={staticFile(art)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${z})` }} />
      <div style={{ position: "absolute", top: 70, width: "100%", textAlign: "center" }}>
        <div
          style={{
            fontFamily: F.deco,
            fontSize: 150,
            color: C.brick,
            letterSpacing: 4,
            textShadow: `5px 5px 0 ${C.ink}`,
            transform: `scale(${0.6 + 0.4 * t1}) rotate(${(1 - t1) * -8}deg)`,
            opacity: t1,
          }}
        >
          Лаосская виза
        </div>
        <div style={{ fontFamily: F.title, fontSize: 64, color: C.ink, marginTop: -6, opacity: t2, transform: `translateY(${(1 - t2) * 30}px)` }}>
          или Новые приключения Павлика
        </div>
      </div>
      <FilmLook grain={0.12} vignette={0.35} scratches={0.3} />
    </AbsoluteFill>
  );
};

/* ---------- Интертитр немого кино ---------- */
export const Intertitle: React.FC<{ kicker?: string; lines: string[]; sub?: string }> = ({ kicker, lines, sub }) => {
  const f = useCurrentFrame();
  const weave = useWeave(1.4);
  const o = interpolate(f, [0, 6], [0, 1], clamp);
  const frame = (inset: number, sw: number) => (
    <rect x={inset} y={inset} width={W - inset * 2} height={H - inset * 2} rx={18} fill="none" stroke={C.cream} strokeWidth={sw} />
  );
  const corner = (x: number, y: number, sx: number, sy: number) => (
    <g transform={`translate(${x},${y}) scale(${sx},${sy})`} stroke={C.cream} strokeWidth={4} fill="none">
      <path d="M0,60 C0,20 20,0 60,0 M14,60 C14,30 30,14 60,14" />
      <circle cx={34} cy={34} r={7} fill={C.cream} />
      <path d="M60,0 C90,0 100,20 130,12 M0,60 C0,90 20,100 12,130" />
    </g>
  );
  return (
    <AbsoluteFill style={{ background: "#0d0b08", ...weave, opacity: o }}>
      <svg width={W} height={H} style={{ position: "absolute" }}>
        {frame(70, 5)}
        {frame(92, 2)}
        {corner(110, 110, 1, 1)}
        {corner(W - 110, 110, -1, 1)}
        {corner(110, H - 110, 1, -1)}
        {corner(W - 110, H - 110, -1, -1)}
      </svg>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", color: C.cream }}>
        {kicker && <div style={{ fontFamily: F.title, fontSize: 46, letterSpacing: 10, opacity: 0.8, marginBottom: 30 }}>{kicker}</div>}
        {lines.map((l, i) => (
          <div key={i} style={{ fontFamily: F.title, fontSize: 112, lineHeight: 1.12 }}>
            {l}
          </div>
        ))}
        {sub && <div style={{ fontFamily: F.title, fontSize: 58, marginTop: 26, opacity: 0.85 }}>{sub}</div>}
      </AbsoluteFill>
      <FilmLook grain={0.08} vignette={0.6} scratches={0.3} />
    </AbsoluteFill>
  );
};

/* ---------- Карточка персонажа: стоп-кадр, лицо в светлом ирисе ---------- */
export const IrisCard: React.FC<{
  src: string; // вертикальный кадр 1080x1920
  face: [number, number]; // центр лица в пикселях исходника
  radius: number;
  name: string;
  sub: string;
}> = ({ src, face, radius, name, sub }) => {
  const f = useCurrentFrame();
  const snap = interpolate(f, [0, 4], [0, 1], { ...clamp, easing: ease });
  // вертикаль 1080x1920 вписана по высоте: 607.5 x 1080, стоит левее центра
  const k = H / 1920;
  const left = 360;
  const zoom = 1 + 0.18 * snap;
  const fx = left + face[0] * k;
  const fy = face[1] * k;
  const r = radius * k * zoom;
  const tx = interpolate(f, [6, 16], [0, 1], { ...clamp, easing: ease });
  const tx2 = interpolate(f, [12, 22], [0, 1], { ...clamp, easing: ease });
  const dark = `radial-gradient(circle at ${fx}px ${fy}px, transparent ${r}px, rgba(14,8,3,${0.72 * snap}) ${r + 2}px)`;
  return (
    <AbsoluteFill style={{ background: C.ink, overflow: "hidden" }}>
      <Img src={staticFile(src)} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", filter: "blur(40px) brightness(0.45) sepia(0.6)", transform: "scale(1.2)" }} />
      <div style={{ position: "absolute", inset: 0, transform: `scale(${zoom})`, transformOrigin: `${fx}px ${fy}px` }}>
        <Img src={staticFile(src)} style={{ position: "absolute", left, top: 0, height: H, width: 1080 * k, filter: SOVCOLOR }} />
      </div>
      <AbsoluteFill style={{ background: dark, filter: "none" }} />
      <AbsoluteFill style={{ backdropFilter: undefined }} />
      <svg width={W} height={H} style={{ position: "absolute" }}>
        <path d={wobblyCircle(fx, fy, r + 10, boil(f))} stroke={C.cream} strokeWidth={7} fill="none" strokeLinecap="round" opacity={snap} />
        <path
          d={`M${fx + r + 30},${fy - 20} C${fx + r + 160},${fy - 120} ${1010},${430} ${1090},${400}`}
          stroke={C.cream}
          strokeWidth={6}
          fill="none"
          strokeDasharray="900"
          strokeDashoffset={900 * (1 - tx)}
          strokeLinecap="round"
        />
      </svg>
      <div style={{ position: "absolute", left: 1110, top: 300, width: 760, color: C.cream }}>
        <div style={{ fontFamily: F.hand, fontSize: 132, lineHeight: 1, opacity: tx, transform: `translateX(${(1 - tx) * 40}px)` }}>{name}</div>
        <div style={{ fontFamily: F.hand, fontSize: 60, lineHeight: 1.15, marginTop: 24, color: C.mustard, opacity: tx2 }}>{sub}</div>
      </div>
      <Warmth />
      <FilmLook grain={0.13} vignette={0.45} scratches={0.15} />
    </AbsoluteFill>
  );
};

/* ---------- Карта маршрута ---------- */
const ROUTE_LEN = getLength(GEO.route);
const MOUNTAINS = GEO.mountains.map(([x, y, s]) => ({ x, y, s }));

const Bus: React.FC<{ x: number; y: number; a: number; flip: boolean }> = ({ x, y, a, flip }) => (
  <g transform={`translate(${x},${y}) rotate(${Math.max(-22, Math.min(22, flip ? ((a + 360) % 360) - 180 : a))}) scale(${flip ? -1.25 : 1.25},1.25)`}>
    <rect x={-26} y={-15} width={52} height={30} rx={7} fill={C.brick} stroke={C.ink} strokeWidth={3} />
    <rect x={-20} y={-10} width={13} height={9} fill={C.cream} stroke={C.ink} strokeWidth={1.5} />
    <rect x={-4} y={-10} width={13} height={9} fill={C.cream} stroke={C.ink} strokeWidth={1.5} />
    <rect x={12} y={-10} width={9} height={9} fill={C.cream} stroke={C.ink} strokeWidth={1.5} />
    <rect x={-26} y={4} width={52} height={5} fill={C.mustard} />
    <circle cx={-14} cy={16} r={6} fill={C.ink} />
    <circle cx={14} cy={16} r={6} fill={C.ink} />
  </g>
);

const CITY_LABELS: { id: keyof typeof GEO.cities; name: string; dx: number; dy: number }[] = [
  { id: "danang", name: "Дананг", dx: -40, dy: 70 },
  { id: "hue", name: "Хюэ", dx: 26, dy: 58 },
  { id: "dongha", name: "Донгха", dx: 24, dy: -26 },
  { id: "khesanh", name: "Кхесань", dx: 6, dy: 66 },
  { id: "laobao", name: "Лао Бао", dx: -170, dy: -26 },
];

export const RouteMap: React.FC<{ from: number; to: number; dur: number; clock?: [string, string] }> = ({ from, to, dur, clock }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [10, dur - 15], [from, to], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const L = ROUTE_LEN * p;
  const pt = getPointAtLength(GEO.route, Math.max(1, L)) ?? { x: 0, y: 0 };
  const pt2 = getPointAtLength(GEO.route, Math.max(0, L - 45)) ?? pt;
  const ang = (Math.atan2(pt.y - pt2.y, pt.x - pt2.x) * 180) / Math.PI;
  const flip = Math.abs(ang) > 90;
  // a — угол из atan2; при движении влево автобус зеркалится, наклон ограничен ±22°
  const weave = useWeave(0.6);
  const z = interpolate(f, [0, dur], [1.02, 1.07]);
  return (
    <AbsoluteFill style={{ background: C.sea, ...weave }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ transform: `scale(${z})` }}>
        <defs>
          <pattern id="waves" width="90" height="40" patternUnits="userSpaceOnUse">
            <path d="M5,25 q10,-10 20,0 t20,0" stroke="#5f9c92" strokeWidth={3} fill="none" />
          </pattern>
          <mask id="routeReveal">
            <path d={GEO.route} stroke="#fff" strokeWidth={14} fill="none" strokeDasharray={ROUTE_LEN} strokeDashoffset={ROUTE_LEN - L} />
          </mask>
        </defs>
        <rect width={W} height={H} fill="url(#waves)" opacity={0.6} />
        <pattern id="hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="14" stroke="#b79a5c" strokeWidth={3} /></pattern>
        <path d={GEO.land.LAO} fill="#d9c089" stroke={C.ink} strokeWidth={3} strokeLinejoin="round" />
        <path d={GEO.land.LAO} fill="url(#hatch)" opacity={0.5} />
        <path d={GEO.land.VNM} fill={C.paper} stroke={C.ink} strokeWidth={3.5} strokeLinejoin="round" />
        {MOUNTAINS.map((m, i) => (
          <path
            key={i}
            d={`M${m.x - m.s},${m.y + m.s * 0.6} L${m.x},${m.y - m.s * 0.7} L${m.x + m.s},${m.y + m.s * 0.6} Z`}
            fill={i % 3 ? C.olive : C.teal}
            stroke={C.ink}
            strokeWidth={2.5}
            opacity={0.85}
          />
        ))}
        <text x={200} y={640} fontFamily={F.title} fontSize={70} letterSpacing={22} fill={C.ink} opacity={0.35}>
          ЛАОС
        </text>
        <text x={1150} y={330} fontFamily={F.title} fontSize={70} letterSpacing={22} fill={C.ink} opacity={0.35}>
          ВЬЕТНАМ
        </text>
        <path d={GEO.route} stroke={C.brick} strokeWidth={7} fill="none" strokeDasharray="18 13" strokeLinecap="round" mask="url(#routeReveal)" />
        {CITY_LABELS.map((c) => {
          const [x, y] = GEO.cities[c.id];
          return (
            <g key={c.id}>
              <circle cx={x} cy={y} r={11} fill={C.cream} stroke={C.ink} strokeWidth={4} />
              <text x={x + c.dx} y={y + c.dy} fontFamily={F.hand} fontSize={50} fill={C.ink}>
                {c.name}
              </text>
            </g>
          );
        })}
        <Bus x={pt.x} y={pt.y - 6} a={ang} flip={flip} />
      </svg>
      {clock && <Clock from={clock[0]} to={clock[1]} p={interpolate(f, [10, dur - 15], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) })} />}
      <FilmLook grain={0.1} vignette={0.4} scratches={0.12} />
    </AbsoluteFill>
  );
};

const Clock: React.FC<{ from: string; to: string; p: number }> = ({ from, to, p }) => {
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const t = Math.round((m(from) + (m(to) - m(from)) * Math.min(1, Math.max(0, p))) / 10) * 10; // шаг 10 мин — цифры не мелькают
  const hh = String(Math.floor(t / 60) % 24).padStart(2, "0");
  const mm = String(t % 60).padStart(2, "0");
  return (
    <div style={{ position: "absolute", left: 70, top: 60, background: C.ink, color: C.cream, borderRadius: 18, padding: "10px 30px", fontFamily: F.mono, fontSize: 72, border: `4px solid ${C.cream}` }}>
      {hh}:{mm}
    </div>
  );
};

/* ---------- Чек ---------- */
export type ReceiptLine = { label: string; value: number; hidden?: boolean };
const money = (v: number) => v.toLocaleString("ru-RU").replace(/,/g, " ");

export const Receipt: React.FC<{ lines: ReceiptLine[]; before: number; stamp: string; instant?: boolean; reveal?: boolean }> = ({ lines, before, stamp, instant, reveal }) => {
  const f = useCurrentFrame() + (instant ? 400 : 0);
  const rv = reveal ? interpolate(useCurrentFrame(), [10, 22], [0, 1], clamp) : 0;
  const { fps } = useVideoConfig();
  const total = lines.reduce((s, l) => s + l.value, 0);
  const lineAt = (i: number) => 14 + i * 9;
  const totalStart = lineAt(lines.length) + 4;
  const tv = interpolate(f, [totalStart, totalStart + fps * 1.2], [before, total], { ...clamp, easing: Easing.out(Easing.cubic) });
  const st = interpolate(f, [totalStart + fps * 1.4, totalStart + fps * 1.4 + 5], [0, 1], clamp);
  const zig = Array.from({ length: 31 }, (_, i) => `${i * 26},${i % 2 ? 0 : 18}`).join(" ");
  return (
    <AbsoluteFill style={{ background: C.teal, justifyContent: "center", alignItems: "center" }}>
      <div style={{ position: "relative", width: 780, background: "#fbf6ea", padding: "50px 56px 70px", fontFamily: F.mono, color: C.ink, boxShadow: "0 30px 60px rgba(0,0,0,0.35)", transform: "rotate(-1.5deg) scale(1.3)" }}>
        <div style={{ textAlign: "center", fontSize: 44, letterSpacing: 6 }}>ВИЗАРАН · ЛАО БАО</div>
        <div style={{ textAlign: "center", fontSize: 30, opacity: 0.6, marginBottom: 26 }}>07.11.2026 · 3 пассажира</div>
        {lines.map((l, i) => {
          const o = interpolate(f, [lineAt(i), lineAt(i) + 4], [0, 1], clamp);
          return (
            <div key={i} style={{ display: "flex", fontSize: 40, lineHeight: 1.6, opacity: o }}>
              <span>{l.label}</span>
              <span style={{ flex: 1, borderBottom: "3px dotted rgba(0,0,0,0.35)", margin: "0 12px 16px" }} />
              <span style={{ filter: l.hidden && rv < 1 ? `blur(${9 * (1 - rv)}px)` : undefined, color: l.hidden && reveal ? C.brick : undefined, transform: l.hidden && reveal ? `scale(${1 + 0.25 * Math.sin(rv * Math.PI)})` : undefined }}>{money(l.value)}</span>
            </div>
          );
        })}
        <div style={{ borderTop: `4px dashed ${C.ink}`, marginTop: 18, paddingTop: 16, display: "flex", fontSize: 54, opacity: f >= totalStart ? 1 : 0 }}>
          <span>ИТОГО</span>
          <span style={{ flex: 1 }} />
          <span>{money(Math.round(tv / 1000) * 1000)} ₫</span>
        </div>
        <svg width={780} height={18} style={{ position: "absolute", left: 0, bottom: -17 }}>
          <polygon points={`0,0 ${zig} 780,0`} fill="#fbf6ea" />
        </svg>
        <div
          style={{
            position: "absolute",
            right: -110,
            bottom: -70,
            border: `8px solid ${C.brick}`,
            color: C.brick,
            fontFamily: F.title,
            fontSize: 64,
            padding: "6px 26px",
            borderRadius: 14,
            transform: `rotate(-14deg) scale(${interpolate(st, [0, 1], [2.4, 1])})`,
            opacity: st * 0.9,
            background: "rgba(251,246,234,0.6)",
          }}
        >
          {stamp}
        </div>
      </div>
      <FilmLook grain={0.1} vignette={0.45} scratches={0.12} />
    </AbsoluteFill>
  );
};

/* ---------- Живой кадр с грейдом (для доски стиля) ---------- */
export const GradedStill: React.FC<{ src: string; split?: boolean; push?: number; dur: number; bw?: boolean }> = ({ src, split, push = 0.06, dur, bw }) => {
  const f = useCurrentFrame();
  const z = 1 + push * (f / dur);
  const img = (filter: string) => (
    <Img src={staticFile(src)} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", transform: `scale(${z})`, filter }} />
  );
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {img(bw ? "grayscale(1) contrast(1.2)" : SOVCOLOR)}
      {!bw && <Warmth />}
      {split && (
        <>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "50%", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, width: W }}>{img("none")}</div>
          </div>
          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 4, background: C.cream }} />
          <div style={{ position: "absolute", left: 40, bottom: 40, fontFamily: F.hand, fontSize: 52, color: C.cream, textShadow: "0 2px 8px #000" }}>исходник</div>
          <div style={{ position: "absolute", right: 40, bottom: 40, fontFamily: F.hand, fontSize: 52, color: C.cream, textShadow: "0 2px 8px #000" }}>«Совколор-66»</div>
        </>
      )}
      <FilmLook grain={0.12} vignette={0.42} scratches={0.12} />
    </AbsoluteFill>
  );
};

/* ---------- Цитата из фильма в старом телевизоре ---------- */
export const TvQuote: React.FC<{ quote: string; screen?: string; bg?: string; video?: string }> = ({ quote, screen, bg, video }) => {
  const f = useCurrentFrame();
  const on = interpolate(f, [0, 6], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: C.mustard }}>
      {bg && <Img src={staticFile(bg)} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", filter: "blur(18px) brightness(0.6) sepia(0.5)" }} />}
      <div style={{ position: "absolute", left: 460, top: 90, width: 1000, height: 760, background: "#6b3b22", borderRadius: 60, border: `8px solid ${C.ink}`, boxShadow: "0 30px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ position: "absolute", left: 50, top: 50, width: 720, height: 560, borderRadius: "70px / 50px", background: "#111", overflow: "hidden", border: `10px solid #2b1a10` }}>
          {video ? (
            <OffthreadVideo src={staticFile(video)} muted style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(0.25) contrast(1.1) sepia(0.15)", transform: `scaleY(${on})` }} />
          ) : screen ? (
            <Img src={staticFile(screen)} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(0.35) contrast(1.1)", transform: `scaleY(${on})` }} />
          ) : (
            <svg width="100%" height="100%">
              <filter id="tvnoise">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" seed={f % 50} />
                <feColorMatrix type="saturate" values="0" />
              </filter>
              <rect width="100%" height="100%" filter="url(#tvnoise)" />
            </svg>
          )}
          <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0 2px, transparent 2px 5px)" }} />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.6) 100%)" }} />
        </div>
        {[180, 330].map((y) => (
          <div key={y} style={{ position: "absolute", left: 845, top: y, width: 90, height: 90, borderRadius: "50%", background: C.mustard, border: `6px solid ${C.ink}` }} />
        ))}
        <div style={{ position: "absolute", left: 830, top: 480, width: 120, height: 110, background: "repeating-linear-gradient(0deg, #2b1a10 0 6px, transparent 6px 14px)" }} />
        <div style={{ position: "absolute", left: 50, top: 640, fontFamily: F.title, fontSize: 40, color: C.cream, letterSpacing: 10 }}>РУБИН</div>
      </div>
      <div style={{ position: "absolute", bottom: 70, width: "100%", textAlign: "center" }}>
        <span style={{ display: "inline-block", maxWidth: 1640, fontFamily: F.title, fontSize: quote.length > 60 ? 50 : quote.length > 40 ? 60 : 76, lineHeight: 1.15, color: C.ink, background: C.cream, padding: "8px 34px", borderRadius: 10, border: `5px solid ${C.ink}` }}>
          {quote}
        </span>
      </div>
      <div style={{ position: "absolute", bottom: 22, right: 40, fontFamily: F.hand, fontSize: 44, color: C.ink, opacity: 0.85 }}>«Кавказская пленница», 1966</div>
      <FilmLook grain={0.1} vignette={0.4} scratches={0.1} />
    </AbsoluteFill>
  );
};

export { Iris };

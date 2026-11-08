import React from "react";
import {
  AbsoluteFill,
  Audio,
  Freeze,
  Img,
  interpolate,
  OffthreadVideo,
  random,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Rubik";
import { SubscribeOutro, subscribeOutroFrames } from "../../components/SubscribeOutro";
import edit from "./edit.json";
import {
  arrows,
  blurs,
  captions,
  checklist,
  MUSIC,
  nameCards,
  photoFocus,
  punches,
  scores,
  sfx,
  speedlines,
  stamps,
  stickers,
  titles,
  type Arrow,
  type At,
  type NameCard,
  type Scores,
  type ShotId,
  type Stamp,
  type Sticker,
} from "./script";

/**
 * РЕЦЕПТ: смешной шортс из своих съёмок на телефон («как мы вышли гулять в дождь,
 * а нас выгуляли уличные собаки»). Материал — 12 коротких вертикальных роликов и
 * 4 фото из Google Фото; юмор держат живые реплики, стоп-кадры с карточками
 * персонажей, стрелки, штампы и мультяшные звуки поверх.
 *
 * Монтаж двухслойный. edit.json — что и с какой скоростью показываем (по нему
 * `scripts/dogwalk-prep.py` режет копии и собирает живой звук одной дорожкой),
 * script.ts — что поверх. События сценария привязаны к плану, а не к секунде
 * ролика, поэтому план можно удлинить, и надписи переедут вместе с ним.
 *
 * Драматургия: крючок с конца (нос Ницше влетает в камеру, стоп-кадр, лента
 * тормозит) → перемотка назад → «план на день» чек-листом → план рушится
 * появлением Ницше → хаос → замедленный повтор крючка → Дятел и пакет →
 * лимоны → «план провален ✅» → кнопка «ПОДПИШИСЬ» хвостом.
 *
 * Версия с голосом (`narration`) кладёт поверх закадр из vo.json и глубже
 * приглушает под ним музыку; монтаж у версий общий.
 */

const { fontFamily } = loadFont("normal", { weights: ["700", "800", "900"], subsets: ["latin", "cyrillic"] });

export const FPS = edit.fps;

type EditShot = {
  id: ShotId;
  src?: string;
  photo?: string;
  from?: number;
  to?: number;
  speed?: number;
  freeze?: number;
  dur?: number;
  reverse?: boolean;
};

const SHOTS = edit.shots as EditShot[];

/** Длина плана в кадрах — та же формула, что в dogwalk-prep.py. */
const shotFrames = (s: EditShot): number => {
  const sec = s.dur ?? ((s.to ?? 0) - (s.from ?? 0)) / (s.speed ?? 1);
  return Math.floor(sec * FPS + 0.5);
};

const START = {} as Record<ShotId, number>;
const LENGTH = {} as Record<ShotId, number>;
let cursor = 0;
for (const s of SHOTS) {
  START[s.id] = cursor;
  LENGTH[s.id] = shotFrames(s);
  cursor += LENGTH[s.id];
}
export const CLIP_FRAMES = cursor;
export const OUTRO_FRAMES = subscribeOutroFrames(FPS);
export const TOTAL_FRAMES = CLIP_FRAMES + OUTRO_FRAMES;

const frameOf = (a: At): number => START[a.shot] + Math.round(a.at * FPS);
const secs = (s: number): number => Math.max(1, Math.round(s * FPS));
const clip = (path: string) => staticFile(`clips/DogWalk/${path}`);

const mediaOf = (s: EditShot): string =>
  s.photo ? `${s.id}.jpg` : s.freeze !== undefined ? `${s.id}.png` : `${s.id}.mp4`;

const OUTLINE: React.CSSProperties = {
  WebkitTextStroke: "14px #111",
  paintOrder: "stroke fill",
};

// --- кадр плана -------------------------------------------------------------

const ShotMedia: React.FC<{ shot: EditShot }> = ({ shot }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const len = LENGTH[shot.id] / FPS;
  const isStill = shot.photo !== undefined || shot.freeze !== undefined;

  // Стоп-кадр в ленте читается как зависшее видео — он обязан двигаться.
  let scale = isStill ? 1 + (shot.freeze !== undefined ? 0.1 : 0.06) * (t / len) : 1;
  let dx = 0;
  let dy = 0;
  for (const p of punches.filter((q) => q.shot === shot.id)) {
    const since = t - p.at;
    if (since < 0) continue;
    scale += (p.scale ?? 0.1) * Math.exp(-since * 9);
    if (p.shake && since < 0.35) {
      const k = 26 * (1 - since / 0.35);
      dx += (random(`sx${frame}`) - 0.5) * k;
      dy += (random(`sy${frame}`) - 0.5) * k;
    }
  }

  const style: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: photoFocus[shot.id] ?? "50% 50%",
  };

  return (
    <AbsoluteFill style={{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }}>
      {isStill ? (
        <Img src={clip(mediaOf(shot))} style={style} />
      ) : (
        <OffthreadVideo src={clip(mediaOf(shot))} muted style={style} />
      )}
      {blurs
        .filter((b) => b.shot === shot.id)
        .map((b, i) => {
          const ts = b.keys.map((k) => k.t);
          const k = (f: "x" | "y" | "w" | "h") =>
            interpolate(t, ts, b.keys.map((key) => key[f]), { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          if (t < ts[0] - 0.05 || t > ts[ts.length - 1] + 0.05) return null;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: k("x"),
                top: k("y"),
                width: k("w"),
                height: k("h"),
                backdropFilter: "blur(22px)",
                borderRadius: 12,
              }}
            />
          );
        })}
    </AbsoluteFill>
  );
};

const Flash: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 6], [0.85, 0], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ backgroundColor: `rgba(255,255,255,${o})` }} />;
};

// --- надписи ----------------------------------------------------------------

const usePop = (durFrames: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 9, mass: 0.6, stiffness: 160 } });
  const leave = interpolate(frame, [durFrames - 5, durFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { enter, leave, frame };
};

const TitleText: React.FC<{ text: string; dur: number; y?: number; size?: number }> = ({ text, dur, y, size }) => {
  const { enter, leave } = usePop(secs(dur));
  return (
    <div
      style={{
        position: "absolute",
        top: y ?? 250,
        left: 60,
        right: 60,
        textAlign: "center",
        fontFamily,
        fontWeight: 900,
        fontSize: size ?? 78,
        lineHeight: 1.08,
        color: "#fff",
        ...OUTLINE,
        transform: `scale(${0.6 + 0.4 * enter})`,
        opacity: Math.min(enter * 1.5, 1) * leave,
        textShadow: "0 8px 0 rgba(0,0,0,0.35)",
      }}
    >
      {text}
    </div>
  );
};

const CaptionText: React.FC<{ text: string; dur: number }> = ({ text, dur }) => {
  const { enter, leave } = usePop(secs(dur));
  return (
    <div
      style={{
        position: "absolute",
        top: 1330,
        left: 60,
        right: 60,
        textAlign: "center",
        fontFamily,
        fontWeight: 800,
        fontSize: 74,
        color: "#ffd60a",
        ...OUTLINE,
        transform: `scale(${0.8 + 0.2 * enter})`,
        opacity: leave,
      }}
    >
      «{text}»
    </div>
  );
};

const StickerCard: React.FC<{ s: Sticker }> = ({ s }) => {
  const { enter, leave, frame } = usePop(secs(s.dur));
  const wobble = Math.sin(frame / 5) * 1.2;
  return (
    <div
      style={{
        position: "absolute",
        left: s.x,
        top: s.y,
        transform: `translate(-50%, -50%) rotate(${(s.rot ?? 0) + wobble}deg) scale(${enter})`,
        opacity: leave,
        background: s.bg ?? "#fff",
        color: s.color ?? "#111",
        border: "6px solid #111",
        borderRadius: 30,
        padding: "18px 34px",
        boxShadow: "10px 12px 0 rgba(0,0,0,0.45)",
        fontFamily,
        fontWeight: 900,
        fontSize: s.size ?? 64,
        lineHeight: 1.05,
        whiteSpace: "nowrap",
        textAlign: "center",
      }}
    >
      {s.text}
      {s.small ? (
        <div style={{ fontSize: (s.size ?? 64) * 0.45, fontWeight: 700, marginTop: 6, opacity: 0.8 }}>{s.small}</div>
      ) : null}
    </div>
  );
};

const ArrowSvg: React.FC<{ a: Arrow }> = ({ a }) => {
  const { leave, frame } = usePop(secs(a.dur));
  const draw = interpolate(frame, [0, 9], [0, 1], { extrapolateRight: "clamp" });
  // Движущаяся цель: острие по ключам трека, хвост и подпись — тем же сдвигом.
  let sx = 0;
  let sy = 0;
  if (a.track) {
    const t = a.at + frame / FPS;
    const opts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
    const ts = a.track.map((k) => k.t);
    sx = interpolate(t, ts, a.track.map((k) => k.x), opts) - a.to[0];
    sy = interpolate(t, ts, a.track.map((k) => k.y), opts) - a.to[1];
  }
  const [x1, y1] = [a.from[0] + sx, a.from[1] + sy];
  const [x2, y2] = [a.to[0] + sx, a.to[1] + sy];
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  const cx = mx + nx * (a.bend ?? 0);
  const cy = my + ny * (a.bend ?? 0);
  const d = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  // Наконечник — по касательной в конце кривой.
  const tx = x2 - cx;
  const ty = y2 - cy;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl;
  const uy = ty / tl;
  const head = (side: number) =>
    `M ${x2} ${y2} L ${x2 - ux * 46 + side * uy * 30} ${y2 - uy * 46 - side * ux * 30}`;
  const total = len * 1.3 + 100;
  const headOn = draw >= 1 ? 1 : 0;
  return (
    <AbsoluteFill style={{ opacity: leave }}>
      <svg width={1080} height={1920} style={{ position: "absolute" }}>
        {["#111", "#ffd60a"].map((c, i) => (
          <g key={c} stroke={c} strokeWidth={i === 0 ? 26 : 13} fill="none" strokeLinecap="round">
            <path d={d} strokeDasharray={total} strokeDashoffset={total * (1 - draw)} />
            <path d={head(1)} opacity={headOn} />
            <path d={head(-1)} opacity={headOn} />
          </g>
        ))}
      </svg>
      {a.label && a.labelAt ? (
        <div
          style={{
            position: "absolute",
            left: a.labelAt[0] + sx,
            top: a.labelAt[1] + sy,
            transform: `translate(-50%, 0) scale(${draw})`,
            fontFamily,
            fontWeight: 900,
            fontSize: 58,
            lineHeight: 1.05,
            color: "#fff",
            ...OUTLINE,
            whiteSpace: "pre",
            textAlign: "center",
          }}
        >
          {a.label}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const NameCardView: React.FC<{ c: NameCard }> = ({ c }) => {
  const { enter, leave, frame } = usePop(secs(c.dur));
  const slide = interpolate(enter, [0, 1], [-900, 0]);
  const quoteIn = interpolate(frame, [8, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 50, top: 1000, opacity: leave, transform: `translateX(${slide}px)` }}>
      <div
        style={{
          display: "inline-block",
          background: "#111",
          color: "#fff",
          fontFamily,
          fontWeight: 800,
          fontSize: 34,
          letterSpacing: 4,
          padding: "8px 20px",
          borderRadius: 10,
          transform: "rotate(-3deg)",
        }}
      >
        ПЕРСОНАЖ
      </div>
      <div style={{ fontFamily, fontWeight: 900, fontSize: 170, lineHeight: 1, color: c.color, ...OUTLINE }}>
        {c.name}
      </div>
      <div style={{ fontFamily, fontWeight: 800, fontSize: 60, color: "#fff", ...OUTLINE, WebkitTextStroke: "10px #111" }}>
        {c.role}
      </div>
      <div
        style={{
          marginTop: 18,
          fontFamily,
          fontWeight: 700,
          fontStyle: "italic",
          fontSize: 48,
          lineHeight: 1.15,
          color: "#111",
          background: "#fff",
          border: "5px solid #111",
          borderRadius: 22,
          padding: "14px 24px",
          whiteSpace: "pre",
          display: "inline-block",
          opacity: quoteIn,
          transform: `scale(${0.85 + 0.15 * quoteIn})`,
          transformOrigin: "left center",
        }}
      >
        {c.quote}
      </div>
    </div>
  );
};

const StampView: React.FC<{ s: Stamp }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hit = spring({ frame, fps, config: { damping: 14, mass: 0.5, stiffness: 260 } });
  const leave = interpolate(frame, [secs(s.dur) - 5, secs(s.dur)], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 540,
        top: s.y ?? 900,
        transform: `translate(-50%, -50%) rotate(${s.rot ?? -8}deg) scale(${2.4 - 1.4 * hit})`,
        opacity: Math.min(1, hit * 2) * leave,
        border: `12px solid ${s.color}`,
        borderRadius: 24,
        padding: "16px 38px",
        background: "rgba(255,255,255,0.88)",
        color: s.color,
        fontFamily,
        fontWeight: 900,
        fontSize: s.size ?? 96,
        letterSpacing: 2,
        whiteSpace: "nowrap",
        boxShadow: "0 0 0 6px rgba(255,255,255,0.6)",
      }}
    >
      {s.text}
    </div>
  );
};

const ScoresView: React.FC<{ s: Scores }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const leave = interpolate(frame, [secs(s.dur) - 5, secs(s.dur)], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ opacity: leave }}>
      {s.values.map((v, i) => {
        const p = spring({ frame: frame - Math.round(i * 0.25 * fps), fps, config: { damping: 10, mass: 0.6 } });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 200 + i * 340,
              top: 1150,
              transform: `translate(-50%, -50%) rotate(${(i - 1) * 6}deg) scale(${p})`,
              width: 250,
              height: 210,
              background: "#fff",
              border: "8px solid #111",
              borderRadius: 26,
              boxShadow: "10px 12px 0 rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily,
              fontWeight: 900,
              fontSize: 130,
              color: i === 2 ? "#e63946" : "#111",
            }}
          >
            {v}
          </div>
        );
      })}
      {s.note ? (
        <div
          style={{
            position: "absolute",
            top: 1290,
            left: 60,
            right: 60,
            textAlign: "center",
            fontFamily,
            fontWeight: 800,
            fontSize: 44,
            color: "#fff",
            ...OUTLINE,
            WebkitTextStroke: "10px #111",
            opacity: interpolate(frame, [Math.round(0.8 * fps), Math.round(1 * fps)], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {s.note}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const ChecklistView: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const base = frameOf(checklist.from);
  const len = frameOf(checklist.to) - base;
  const enter = spring({ frame, fps, config: { damping: 12, mass: 0.7 } });
  const leave = interpolate(frame, [len - 6, len], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        top: 190,
        padding: "22px 34px",
        whiteSpace: "nowrap",
        background: "rgba(255,255,255,0.93)",
        border: "7px solid #111",
        borderRadius: 30,
        boxShadow: "12px 14px 0 rgba(0,0,0,0.4)",
        transform: `translateX(${(1 - enter) * -820}px) rotate(-2deg)`,
        opacity: leave,
        fontFamily,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 46, letterSpacing: 3, color: "#111", marginBottom: 10 }}>
        📝 {checklist.title}
      </div>
      {checklist.items.map((it) => {
        const shown = frameOf(it.show) - base;
        if (frame < shown) return null;
        const pop = spring({ frame: frame - shown, fps, config: { damping: 11, mass: 0.5 } });
        const crossAt = it.cross ? frameOf(it.cross) - base : null;
        const strike =
          crossAt === null
            ? 0
            : interpolate(frame, [crossAt, crossAt + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const crossed = crossAt !== null && frame >= crossAt;
        return (
          <div
            key={it.text}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 18,
              fontWeight: 800,
              fontSize: 48,
              color: crossed ? "#e63946" : "#111",
              transform: `scale(${0.7 + 0.3 * pop})`,
              transformOrigin: "left center",
              opacity: pop,
              margin: "6px 0",
            }}
          >
            <span style={{ color: crossed ? "#e63946" : "#2a9d8f", fontSize: 60, width: 50 }}>{crossed ? "✗" : "✓"}</span>
            <span style={{ position: "relative" }}>
              {it.text}
              <span
                style={{
                  position: "absolute",
                  left: -6,
                  top: "52%",
                  height: 9,
                  width: `${strike * 104}%`,
                  background: "#e63946",
                  borderRadius: 5,
                  transform: "rotate(-3deg)",
                }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
};

const SpeedlinesView: React.FC = () => {
  const frame = useCurrentFrame();
  const lines = Array.from({ length: 46 }, (_, i) => {
    const seed = `${i}-${Math.floor(frame / 2)}`;
    const ang = random(`a${seed}`) * Math.PI * 2;
    const r0 = 380 + random(`r${seed}`) * 260;
    const r1 = 1300;
    const w = 6 + random(`w${seed}`) * 16;
    return { ang, r0, r1, w };
  });
  return (
    <svg width={1080} height={1920} style={{ position: "absolute" }}>
      {lines.map((l, i) => {
        const cx = 540;
        const cy = 900;
        return (
          <line
            key={i}
            x1={cx + Math.cos(l.ang) * l.r0}
            y1={cy + Math.sin(l.ang) * l.r0}
            x2={cx + Math.cos(l.ang) * l.r1}
            y2={cy + Math.sin(l.ang) * l.r1}
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={l.w}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
};

/** Перемотка на VHS: строки развёртки, бегущая полоса помех, подпись режима. */
const RewindOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const bandY = (frame * 97) % 1920;
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0 3px, transparent 3px 7px)",
          mixBlendMode: "multiply",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: bandY,
          height: 120,
          background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.45), transparent)",
          filter: "blur(2px)",
        }}
      />
      <AbsoluteFill style={{ backgroundColor: "rgba(40,60,160,0.22)", mixBlendMode: "screen" }} />
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 200,
          fontFamily: "monospace",
          fontWeight: 700,
          fontSize: 64,
          color: "#fff",
          textShadow: "4px 0 #f0f, -4px 0 #0ff",
        }}
      >
        ◀◀ REW
      </div>
    </AbsoluteFill>
  );
};

// --- звук -------------------------------------------------------------------

/** Музыка проваливается под живые реплики и голос, иначе их не разобрать. */
const musicVolume = (frame: number, start: number, voiceWindows: [number, number][]) => {
  const g = frame + start;
  const ramp = 0.15 * FPS;
  let duck = 0;
  for (const [a, b] of voiceWindows) {
    const k = Math.min(
      interpolate(g, [a - ramp, a], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      interpolate(g, [b, b + ramp], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    );
    duck = Math.max(duck, k);
  }
  const fadeIn = interpolate(frame, [0, 0.4 * FPS], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(g, [TOTAL_FRAMES - MUSIC.fadeOut * FPS, TOTAL_FRAMES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (MUSIC.base - (MUSIC.base - MUSIC.duck) * duck) * fadeIn * fadeOut;
};

export type VoPhrase = At & { file: string; dur: number; text: string };

export type DogWalkProps = {
  /** Закадровый голос из vo.json (версия B); пусто — версия без голоса. */
  vo: VoPhrase[];
};

export const DogWalk: React.FC<DogWalkProps> = ({ vo }) => {
  const last = SHOTS[SHOTS.length - 1];
  const voiceWindows: [number, number][] = [
    ...captions.map((c): [number, number] => [frameOf(c), frameOf(c) + secs(c.dur)]),
    ...vo.map((p): [number, number] => [frameOf(p), frameOf(p) + secs(p.dur)]),
  ];
  const musicStart = START.selfie;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {SHOTS.map((s) => (
        <Sequence key={s.id} from={START[s.id]} durationInFrames={LENGTH[s.id]} name={s.id}>
          <ShotMedia shot={s} />
        </Sequence>
      ))}

      <Sequence from={START.rewind} durationInFrames={LENGTH.rewind} name="rewind-fx">
        <RewindOverlay />
      </Sequence>
      {speedlines.map((s, i) => (
        <Sequence key={`sl${i}`} from={frameOf(s)} durationInFrames={secs(s.dur)} name="speedlines">
          <SpeedlinesView />
        </Sequence>
      ))}
      {punches
        .filter((p) => p.flash)
        .map((p, i) => (
          <Sequence key={`fl${i}`} from={frameOf(p)} durationInFrames={8} name="flash">
            <Flash />
          </Sequence>
        ))}

      <Sequence from={frameOf(checklist.from)} durationInFrames={frameOf(checklist.to) - frameOf(checklist.from)} name="checklist">
        <ChecklistView />
      </Sequence>
      {titles.map((t, i) => (
        <Sequence key={`t${i}`} from={frameOf(t)} durationInFrames={secs(t.dur)} name={`title: ${t.text}`}>
          <TitleText text={t.text} dur={t.dur} y={t.y} size={t.size} />
        </Sequence>
      ))}
      {arrows.map((a, i) => (
        <Sequence key={`a${i}`} from={frameOf(a)} durationInFrames={secs(a.dur)} name="arrow">
          <ArrowSvg a={a} />
        </Sequence>
      ))}
      {nameCards.map((c, i) => (
        <Sequence key={`n${i}`} from={frameOf(c)} durationInFrames={secs(c.dur)} name={`card: ${c.name}`}>
          <NameCardView c={c} />
        </Sequence>
      ))}
      {stickers.map((s, i) => (
        <Sequence key={`s${i}`} from={frameOf(s)} durationInFrames={secs(s.dur)} name={`sticker: ${s.text}`}>
          <StickerCard s={s} />
        </Sequence>
      ))}
      {scores.map((s, i) => (
        <Sequence key={`sc${i}`} from={frameOf(s)} durationInFrames={secs(s.dur)} name="scores">
          <ScoresView s={s} />
        </Sequence>
      ))}
      {stamps.map((s, i) => (
        <Sequence key={`st${i}`} from={frameOf(s)} durationInFrames={secs(s.dur)} name={`stamp: ${s.text}`}>
          <StampView s={s} />
        </Sequence>
      ))}
      {captions.map((c, i) => (
        <Sequence key={`c${i}`} from={frameOf(c)} durationInFrames={secs(c.dur)} name={`caption: ${c.text}`}>
          <CaptionText text={c.text} dur={c.dur} />
        </Sequence>
      ))}

      <Sequence from={CLIP_FRAMES} durationInFrames={OUTRO_FRAMES} name="outro">
        <SubscribeOutro label="ПОДПИШИСЬ" bellVolume={0.5}>
          <Freeze frame={0}>
            <OffthreadVideo
              src={clip(mediaOf(last))}
              muted
              trimBefore={LENGTH[last.id] - 1}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </Freeze>
        </SubscribeOutro>
      </Sequence>

      {/* Звук. Живые реплики — одна непрерывная дорожка (см. dogwalk-prep.py). */}
      <Sequence durationInFrames={CLIP_FRAMES} name="live">
        <Audio src={clip("live.wav")} />
      </Sequence>
      <Sequence durationInFrames={START.rewind} name="music-hook">
        <Audio src={clip("sfx/tapestop.wav")} volume={() => MUSIC.base} />
      </Sequence>
      <Sequence from={musicStart} durationInFrames={TOTAL_FRAMES - musicStart} name="music">
        <Audio src={clip("sfx/music.wav")} volume={(f) => musicVolume(f, musicStart, voiceWindows)} />
      </Sequence>
      {sfx.map((s, i) => {
        // Под голосом эффект тише: тромбон поверх «И ушёл к другому» глушил слова.
        const f = frameOf(s);
        const underVo = vo.some((p) => f >= frameOf(p) - 3 && f < frameOf(p) + secs(p.dur));
        return (
          <Sequence key={`fx${i}`} from={f} durationInFrames={secs(s.dur ?? 3)} name={`sfx: ${s.name}`}>
            <Audio src={clip(`sfx/${s.name}.wav`)} volume={() => (s.volume ?? 1) * (underVo ? 0.55 : 1)} />
          </Sequence>
        );
      })}
      {vo.map((p, i) => (
        <Sequence key={`vo${i}`} from={frameOf(p)} durationInFrames={secs(p.dur) + 6} name={`vo: ${p.text}`}>
          <Audio src={clip(p.file)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

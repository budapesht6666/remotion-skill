import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Freeze,
  OffthreadVideo,
  Sequence,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Orbitron";
import type { GameCutManifest, HitKind } from "./timeline";

/**
 * Шортс по своей игре Space Flight: геймплей, снятый самой игрой (60 к/с, HUD
 * в кадре), монтаж в такт её же музыке, панчи на ударах из лога событий,
 * плашки боссов и призыв сыграть на титульном экране.
 *
 * Всё время ролика — в public/clips/SpaceFlightShort/edit.json (`npm run
 * gamecut`): какой кадр исходника стоит на каждом кадре ролика (speed-ramp
 * сделан там), где удары, где баннеры игры. Звук — там же, одной дорожкой.
 *
 * Где можно писать: верх кадра занят HUD игры (полоски, счёт, имя босса —
 * до ~17 % высоты), внизу справа кнопка NOVA, корабль держится на 60–66 %
 * высоты, а баннер MISSION COMPLETE игра ставит на 37–43 %. Надписи живут в
 * полосе 41–55 % и уходят до смерти босса — баннер игры не перекрываем.
 */

const { fontFamily } = loadFont("normal", {
  weights: ["700", "900"],
  subsets: ["latin"],
});

export type SpaceFlightShortProps = {
  /** Манифест сборки: public/clips/SpaceFlightShort/edit.json. */
  editFile: string;
  /** Подставляется в calculateMetadata из editFile. */
  edit?: GameCutManifest;
  hookKicker: string;
  hookBig: string;
  browserKicker: string;
  browserBig: string;
  challengeKicker: string;
  challengeBig: string;
  ctaMain: string;
  ctaSub: string;
};

// ── Видео ──────────────────────────────────────────────────────────────────

/**
 * Кусок клипа по раскладке времени. Кадр выбирается обрезкой (`trimBefore`)
 * под `<Freeze frame={0}>`: нулевой кадр обрезанного клипа и есть нужный кадр
 * исходника. Так speed-ramp любой формы попадает в кадр точно, без
 * `playbackRate` и без дублей кадров.
 */
const PieceVideo: React.FC<{ piece: GameCutManifest["pieces"][number] }> = ({ piece }) => {
  const frame = useCurrentFrame();
  const src = piece.src[Math.min(Math.max(frame, 0), piece.src.length - 1)];
  return (
    <Freeze frame={0}>
      <OffthreadVideo
        src={staticFile(piece.file)}
        trimBefore={src}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </Freeze>
  );
};

/** Сила панча по типу удара: зум, тряска (px), вспышка, длительности в кадрах. */
const PUNCH: Record<HitKind, { zoom: number; shake: number; flash: number; decay: number }> = {
  nova: { zoom: 0.06, shake: 18, flash: 0.75, decay: 9 },
  boss: { zoom: 0.1, shake: 28, flash: 0.9, decay: 11 },
  final: { zoom: 0.14, shake: 36, flash: 1, decay: 14 },
  part: { zoom: 0.025, shake: 9, flash: 0, decay: 6 },
};
/** После последнего удара — медленный наезд на взрыв до конца куска. */
const FINAL_PUSH = 0.06;

/** Затухающая огибающая удара: подъём за 2 кадра, дальше экспонента. */
const hitEnvelope = (d: number, decay: number) =>
  d < 0 ? 0 : d < 2 ? (d + 1) / 3 : Math.exp(-(d - 2) / decay);

/** Плавный шум тряски: случайная точка раз в 2 кадра, между ними — линейно. */
const shakeNoise = (seed: string, frame: number) => {
  const k = Math.floor(frame / 2);
  const t = (frame % 2) / 2;
  const a = random(`${seed}-${k}`) * 2 - 1;
  const b = random(`${seed}-${k + 1}`) * 2 - 1;
  return a + (b - a) * t;
};

const Camera: React.FC<{ edit: GameCutManifest; children: React.ReactNode }> = ({ edit, children }) => {
  const frame = useCurrentFrame();
  let zoom = 0;
  let shake = 0;
  let focus: [number, number] = [0.5, 0.5];
  for (const h of edit.hits) {
    const d = frame - h.f;
    if (d < 0 || d > 90) continue;
    const p = PUNCH[h.kind];
    const env = hitEnvelope(d, p.decay);
    zoom += p.zoom * env;
    shake = Math.max(shake, p.shake * hitEnvelope(d, p.decay * 1.4));
    if (h.kind !== "part") focus = h.focus;
  }
  // Наезд на взрыв последнего босса — пока идёт его кусок, со склейкой сбрасывается.
  const final = edit.hits.find((h) => h.kind === "final");
  if (final) {
    const piece = edit.pieces.find((p) => final.f >= p.at && final.f < p.at + p.frames);
    const end = piece ? piece.at + piece.frames : final.f;
    if (frame >= final.f && frame < end) {
      zoom += FINAL_PUSH * interpolate(frame, [final.f, end], [0, 1], { easing: Easing.out(Easing.quad) });
      focus = final.focus;
    }
  }
  const dx = shake * shakeNoise("sx", frame);
  const dy = shake * shakeNoise("sy", frame);
  const rot = (shake / 36) * 0.9 * shakeNoise("sr", frame);
  // Запас масштаба под тряску, чтобы не открывались края кадра.
  const scale = 1 + zoom + (shake * 2.4) / 1080;

  return (
    <AbsoluteFill
      style={{
        transformOrigin: `${focus[0] * 100}% ${focus[1] * 100}%`,
        scale: String(scale),
        translate: `${dx}px ${dy}px`,
        rotate: `${rot}deg`,
        filter: "saturate(1.12) contrast(1.04)",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Белая вспышка на 2–3 кадра поверх удара. */
const Flash: React.FC<{ edit: GameCutManifest }> = ({ edit }) => {
  const frame = useCurrentFrame();
  let opacity = 0;
  for (const h of edit.hits) {
    const peak = PUNCH[h.kind].flash;
    if (!peak) continue;
    const d = frame - h.f;
    if (d < 0 || d > 4) continue;
    opacity = Math.max(opacity, interpolate(d, [0, 1, 2, 3], [peak, peak * 0.55, peak * 0.2, 0], { extrapolateRight: "clamp" }));
  }
  if (opacity <= 0) return null;
  return <AbsoluteFill style={{ backgroundColor: "#f4fdff", opacity }} />;
};

// ── Надписи ────────────────────────────────────────────────────────────────

/** Обводка тенью по кругу + свечение: текст читается поверх пуль и взрывов. */
const outline = (r: number, color: string, glow: string) => {
  const ring: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ring.push(`${(Math.cos(a) * r).toFixed(1)}px ${(Math.sin(a) * r).toFixed(1)}px 0 ${color}`);
  }
  return [...ring, `0 0 ${r * 4}px ${glow}`, `0 0 ${r * 10}px ${glow}`].join(", ");
};

/** Импульс на каждой доле: надпись дышит в такт музыке. */
const beatPulse = (frame: number, grid: number, beat: number) => {
  const since = (((frame - grid) % beat) + beat) % beat;
  return 0.045 * Math.exp(-since / 5);
};

/** Появление «с ударом»: из крупного в свой размер с перелётом. */
const slam = (frame: number, from: number) =>
  interpolate(frame, [from, from + 7], [1.35, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(1.6)),
  });

/** Уход: сжатие и прозрачность за 5 кадров до `to`. */
const leave = (frame: number, to: number) =>
  interpolate(frame, [to - 5, to], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

type CalloutProps = {
  kicker: string;
  big: string;
  /** Кадры ролика: появление подводки, удар большого слова, уход. */
  from: number;
  bigFrom: number;
  to: number;
  size: number;
  /** Кегль подводки: у хука крупнее — она одна держит нулевой кадр. */
  kickerSize?: number;
  /** Центр блока по высоте, доля кадра. */
  y: number;
  color: string;
  glow: string;
  grid: number;
  beat: number;
};

/** Подводка мелким + большое слово на сильную долю. */
const Callout: React.FC<CalloutProps> = ({
  kicker,
  big,
  from,
  bigFrom,
  to,
  size,
  kickerSize = 50,
  y,
  color,
  glow,
  grid,
  beat,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const out = leave(frame, to);
  // Подводка на нулевом кадре ролика видна сразу: первый кадр обязан читаться.
  const kickerIn = from === 0 ? 1 : interpolate(frame, [from, from + 4], [0, 1], { extrapolateRight: "clamp" });
  const bigOn = frame >= bigFrom;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", fontFamily }}>
      <div
        style={{
          position: "absolute",
          top: `${y * 100}%`,
          width: 920,
          translate: "0 -50%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: out,
          scale: String(0.92 + 0.08 * out),
        }}
      >
        <div
          style={{
            fontSize: kickerSize,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "#e6f7ff",
            textShadow: outline(4, "#020611", "rgba(58,215,255,0.35)"),
            opacity: kickerIn,
            translate: `0 ${interpolate(kickerIn, [0, 1], [18, 0])}px`,
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: size,
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: "0.02em",
            color,
            textAlign: "center",
            whiteSpace: "nowrap",
            textShadow: outline(6, "#020611", glow),
            opacity: bigOn ? 1 : 0,
            scale: String(bigOn ? slam(frame, bigFrom) + beatPulse(frame, grid, beat) : 1),
          }}
        >
          {big}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Плашка-представление босса: полоса с опасной разметкой въезжает слева, уезжает вправо. */
const BossPlate: React.FC<{ tag: string; name: string; from: number; to: number; size: number }> = ({
  tag,
  name,
  from,
  to,
  size,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const d = frame - from;
  const band = interpolate(d, [0, 7], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const textIn = interpolate(d, [3, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const exit = interpolate(frame, [to - 7, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  const stripes = "repeating-linear-gradient(135deg, #ffc21a 0 22px, #120404 22px 44px)";
  return (
    <AbsoluteFill style={{ fontFamily }}>
      <div
        style={{
          position: "absolute",
          top: "47%",
          left: -40,
          width: 1160,
          height: 236,
          translate: `${exit * 1200}px -50%`,
          rotate: "-4deg",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            transformOrigin: "left center",
            scale: `${band} 1`,
            background:
              "linear-gradient(90deg, rgba(90,0,8,0) 0%, rgba(150,8,20,0.88) 12%, rgba(150,8,20,0.88) 88%, rgba(90,0,8,0) 100%)",
          }}
        >
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 12, background: stripes }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 12, background: stripes }} />
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            opacity: textIn,
            translate: `${interpolate(textIn, [0, 1], [-90, 0]) + d * 0.35}px 0`,
          }}
        >
          <div
            style={{
              fontSize: 40,
              fontWeight: 900,
              letterSpacing: "0.3em",
              color: "#120404",
              background: "#ffc21a",
              padding: "4px 18px 4px 26px",
              borderRadius: 6,
            }}
          >
            {tag}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: size,
              fontWeight: 900,
              letterSpacing: "0.04em",
              color: "#ffffff",
              whiteSpace: "nowrap",
              textShadow: outline(5, "#2a0005", "rgba(255,60,60,0.7)"),
            }}
          >
            {name}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Призыв на титульном экране: факты чипами, затем кнопка «играть». */
const TitleCta: React.FC<{
  from: number;
  main: string;
  sub: string;
  grid: number;
  beat: number;
}> = ({ from, main, sub, grid, beat }) => {
  const frame = useCurrentFrame();
  if (frame < from) return null;
  const pop = (at: number) => ({
    opacity: interpolate(frame, [at, at + 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    scale: String(
      interpolate(frame, [at, at + 7], [1.4, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.back(1.8)),
      }),
    ),
  });
  const chip = (text: string, at: number, color: string, key: string) => (
    <div
      key={key}
      style={{
        ...pop(at),
        fontSize: 34,
        fontWeight: 900,
        letterSpacing: "0.06em",
        color,
        padding: "10px 20px",
        border: `3px solid ${color}`,
        borderRadius: 10,
        background: "rgba(2,6,17,0.72)",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
  const ctaAt = from + 2 * beat;
  const pulse = frame >= ctaAt + 7 ? beatPulse(frame, grid, beat) : 0;
  return (
    <AbsoluteFill style={{ fontFamily, alignItems: "center" }}>
      <div style={{ position: "absolute", top: 905, display: "flex", gap: 16 }}>
        {[
          ["3 SECTORS", 0],
          ["9 MISSIONS", 4],
          ["3 BOSSES", 8],
        ].map(([t, k]) => chip(t as string, from + (k as number), "#7fe3ff", t as string))}
      </div>
      <div style={{ position: "absolute", top: 1000, display: "flex", gap: 16 }}>
        {[
          ["FREE", 0],
          ["NO ADS", 4],
          ["NO DOWNLOAD", 8],
        ].map(([t, k]) => chip(t as string, from + beat + (k as number), "#ffd84a", t as string))}
      </div>
      <div
        style={{
          position: "absolute",
          top: 1110,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          ...pop(ctaAt),
        }}
      >
        <div
          style={{
            scale: String(1 + pulse),
            fontSize: 84,
            fontWeight: 900,
            letterSpacing: "0.04em",
            color: "#03140a",
            padding: "16px 56px",
            borderRadius: 999,
            background: "linear-gradient(180deg, #8dffb4 0%, #36e27a 55%, #1fb85c 100%)",
            boxShadow: "0 0 40px rgba(60,240,130,0.55), 0 8px 0 #0d6e35",
            whiteSpace: "nowrap",
          }}
        >
          {main}
        </div>
        <div
          style={{
            marginTop: 26,
            fontSize: 44,
            fontWeight: 900,
            letterSpacing: "0.06em",
            color: "#ffffff",
            textShadow: outline(4, "#020611", "rgba(58,215,255,0.5)"),
            whiteSpace: "nowrap",
          }}
        >
          {sub}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Ролик ──────────────────────────────────────────────────────────────────

export const SpaceFlightShort: React.FC<SpaceFlightShortProps> = (props) => {
  const { edit } = props;
  if (!edit) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#05070f", color: "#fff", fontFamily, fontSize: 40, padding: 80, justifyContent: "center" }}>
        Нет {props.editFile} — соберите: npm run gamecut -- SpaceFlightShort
      </AbsoluteFill>
    );
  }
  const at = (id: string) => {
    const piece = edit.pieces.find((p) => p.id === id);
    if (!piece) throw new Error(`edit.json: no piece "${id}"`);
    return piece.at;
  };
  const { grid, beat } = edit;
  const deathOf = (name: string) => edit.hits.find((h) => h.name === name)?.f ?? 0;
  const text = { grid, beat };

  return (
    <AbsoluteFill style={{ backgroundColor: "#05070f" }}>
      <Camera edit={edit}>
        {edit.pieces.map((p) => (
          <Sequence key={p.id} name={p.id} from={p.at} durationInFrames={p.frames}>
            <PieceVideo piece={p} />
          </Sequence>
        ))}
      </Camera>
      <Flash edit={edit} />

      {/* Хук: подводка видна с нулевого кадра, большое слово бьёт вместе с Nova. */}
      <Callout
        {...text}
        kicker={props.hookKicker}
        big={props.hookBig}
        from={0}
        bigFrom={grid}
        to={at("beams")}
        size={88}
        kickerSize={66}
        y={0.45}
        color="#ffffff"
        glow="rgba(58,215,255,0.8)"
      />
      <Callout
        {...text}
        kicker={props.browserKicker}
        big={props.browserBig}
        from={at("beams")}
        bigFrom={at("beams") + beat}
        to={at("hive")}
        size={124}
        y={0.45}
        color="#7fe3ff"
        glow="rgba(58,215,255,0.8)"
      />
      <BossPlate tag="BOSS" name="HIVE MOTHER" from={at("hive") + 4} to={at("hive") + 3 * beat} size={92} />
      <BossPlate tag="BOSS" name="WARDEN" from={at("warden")} to={deathOf("WARDEN") - 6} size={112} />
      <BossPlate tag="FINAL BOSS" name="LEVIATHAN" from={at("leviathan")} to={at("leviathan") + 3 * beat} size={104} />
      {/* Вызов зрителю — до удара: смерть босса отвечает на вопрос. */}
      <Callout
        {...text}
        kicker={props.challengeKicker}
        big={props.challengeBig}
        from={at("leviathan") + 4 * beat}
        bigFrom={at("leviathan") + 5 * beat}
        to={deathOf("LEVIATHAN") - 4}
        size={124}
        y={0.47}
        color="#ffd84a"
        glow="rgba(255,150,40,0.75)"
      />
      <TitleCta from={at("title") + 12} main={props.ctaMain} sub={props.ctaSub} {...text} />

      <Audio src={staticFile(edit.audio)} />
    </AbsoluteFill>
  );
};

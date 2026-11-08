import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Oswald";
import { loadFont as loadSubFont } from "@remotion/google-fonts/Montserrat";
import { SubscribeOutro, subscribeOutroFrames } from "../../components/SubscribeOutro";
import edit from "./edit.json";
import { cards, MUSIC, sfx, titles, type At, type Card, type ShotId, type SubPlace } from "./script";

/**
 * РЕЦЕПТ: та же прогулка, что в DogWalk, но криминальной комедией в духе Гая
 * Ричи («Большой куш»): закадровый рассказчик, «киношный» грейд с зерном и
 * Character Intro Freeze Frame на каждого героя — Турист, Ницше, Банк, Дятел.
 *
 * Стоп-кадр с представлением собран по уроку (Premiere) и по самим фильмам:
 * герой вырезан и обведён белым, фон размыт и утоплен в тёмный холодный тон,
 * камера за 3 кадра наезжает на героя и за 3 кадра до конца откатывается,
 * вход — вспышка, вжух и глухой удар. Текст один на весь ролик: белый Oswald
 * заглавными между двумя тонкими линиями, слева сверху, держится весь стоп-кадр
 * (не меньше 2.8 c — успеть прочитать).
 *
 * Живой звук съёмки приглушён до ~13 % и срезан сверху (liveFilter в edit.json):
 * реакции и смех слышны, слова — нет. Говорит только рассказчик, его фразы идут
 * субтитрами внизу.
 */

const { fontFamily } = loadFont("normal", { weights: ["400", "500", "700"], subsets: ["latin", "cyrillic"] });
/** Субтитры — другим шрифтом и цветом, чтобы не спорить с табличками героев. */
const { fontFamily: subFamily } = loadSubFont("normal", { weights: ["800"], subsets: ["latin", "cyrillic"] });

/**
 * Зона субтитров Shorts: снизу ~300 px закрывает подпись и описание (~400 px,
 * если описание раскрыто), справа ~100–140 px — кнопки. Субтитр стоит низом на
 * 380 px от края кадра и не заходит в правую колонку.
 */
const SUB_DEFAULT: SubPlace = { left: 70, width: 860, align: "center" };
const SUB_BOTTOM = 380;

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
};

const SHOTS = edit.shots as EditShot[];

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
const clip = (path: string) => staticFile(`clips/DogWalkRitchie/${path}`);
const isStill = (s: EditShot) => s.photo !== undefined || s.freeze !== undefined;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const COVER: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

// --- текст: один стиль на весь ролик -----------------------------------------

/** Имя между двумя линиями, кличка, подпись. Линии раскрываются за 5 кадров. */
const Plate: React.FC<{ name: string; nick?: string; tag?: string; delay?: number }> = ({
  name,
  nick,
  tag,
  delay = 3,
}) => {
  const frame = useCurrentFrame() - delay;
  const lines = interpolate(frame, [0, 5], [0, 1], clamp);
  const text = interpolate(frame, [2, 6], [0, 1], clamp);
  const line: React.CSSProperties = {
    height: 5,
    background: "#fff",
    width: `${lines * 100}%`,
    boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
  };
  const shadow = "0 4px 18px rgba(0,0,0,0.65), 0 2px 3px rgba(0,0,0,0.8)";
  return (
    <div style={{ position: "absolute", left: 70, top: 270, display: "inline-block", fontFamily, color: "#fff" }}>
      <div style={line} />
      <div
        style={{
          fontWeight: 700,
          fontSize: 168,
          lineHeight: 1.02,
          letterSpacing: 6,
          padding: "10px 0 2px",
          textShadow: shadow,
          opacity: text,
          transform: `translateX(${(1 - text) * -30}px)`,
        }}
      >
        {name}
      </div>
      <div style={line} />
      {nick ? (
        <div style={{ fontWeight: 500, fontSize: 64, letterSpacing: 4, marginTop: 14, textShadow: shadow, opacity: text }}>
          {nick}
        </div>
      ) : null}
      {tag ? (
        <div
          style={{
            fontWeight: 400,
            fontSize: 46,
            lineHeight: 1.2,
            letterSpacing: 3,
            textTransform: "uppercase",
            marginTop: 14,
            whiteSpace: "pre",
            textShadow: shadow,
            opacity: interpolate(frame, [5, 9], [0, 1], clamp),
          }}
        >
          {tag}
        </div>
      ) : null}
    </div>
  );
};

/** Субтитр рассказчика: вся фраза целиком, пока она звучит. */
const Subtitle: React.FC<{ text: string; place?: SubPlace }> = ({ text, place = SUB_DEFAULT }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        left: place.left,
        width: place.width,
        ...(place.top !== undefined ? { top: place.top } : { bottom: SUB_BOTTOM }),
        textAlign: place.align,
        fontFamily: subFamily,
        fontWeight: 800,
        fontSize: 54,
        lineHeight: 1.18,
        color: "#ffd60a",
        WebkitTextStroke: "9px #000",
        paintOrder: "stroke fill",
        textShadow: "0 4px 10px rgba(0,0,0,0.55)",
        opacity: interpolate(frame, [0, 3], [0, 1], clamp),
      }}
    >
      {text}
    </div>
  );
};

// --- кадр -------------------------------------------------------------------

const Flash: React.FC = () => {
  const o = interpolate(useCurrentFrame(), [0, 4], [0.9, 0], clamp);
  return <AbsoluteFill style={{ backgroundColor: `rgba(255,255,255,${o})` }} />;
};

/** Обычный план: видео или стоп-кадр с медленным наездом (замерший кадр в ленте читается как зависание). */
const ShotMedia: React.FC<{ shot: EditShot }> = ({ shot }) => {
  const frame = useCurrentFrame();
  const len = LENGTH[shot.id];
  if (!isStill(shot)) return <OffthreadVideo src={clip(`${shot.id}.mp4`)} muted style={COVER} />;
  const push = 1 + 0.05 * (frame / len);
  const punch = shot.id === "hookFreeze" ? 0.1 * Math.exp(-frame / 4) : 0;
  return (
    <AbsoluteFill style={{ transform: `scale(${push + punch})` }}>
      <Img src={clip(`${shot.id}.png`)} style={COVER} />
    </AbsoluteFill>
  );
};

/** Character Intro Freeze Frame. */
const CardShot: React.FC<{ card: Card }> = ({ card }) => {
  const frame = useCurrentFrame();
  const len = LENGTH[card.shot];
  // Наезд за 3 кадра, откат за 3 кадра до конца; между ними медленный дрейф.
  const k = Math.min(interpolate(frame, [0, 3], [0, 1], clamp), interpolate(frame, [len - 3, len], [1, 0], clamp));
  const drift = 0.03 * (frame / len) * k;
  const s = 1 + (card.zoom - 1) * k + drift;
  const fx = card.focus[0] + (card.anchor[0] - card.focus[0]) * k;
  const fy = card.focus[1] + (card.anchor[1] - card.focus[1]) * k;
  const tx = fx - s * card.focus[0];
  const ty = fy - s * card.focus[1];
  const camera: React.CSSProperties = { transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${s})` };
  // Фон размыт, ему не нужно ехать точно с героем: сдвиг ограничен так, чтобы
  // кадр всегда был закрыт (при сильном наезде на край кадра слева открывалась чёрная полоса).
  const bx = Math.min(0, Math.max(1080 - 1080 * s, tx));
  const by = Math.min(0, Math.max(1920 - 1920 * s, ty));
  const backdrop: React.CSSProperties = { transformOrigin: "0 0", transform: `translate(${bx}px, ${by}px) scale(${s})` };
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
      <AbsoluteFill style={backdrop}>
        <Img
          src={clip(`${card.shot}.png`)}
          style={{ ...COVER, filter: `blur(${12 * k}px) grayscale(${0.85 * k}) brightness(${1 - 0.55 * k}) contrast(1.1)` }}
        />
        <AbsoluteFill style={{ backgroundColor: `rgba(14,32,58,${0.45 * k})`, mixBlendMode: "multiply" }} />
      </AbsoluteFill>
      <AbsoluteFill style={camera}>
        {/* Обводка — готовая маска, расширенная кругом на 14 px (dogwalk-cutout.py):
            ровная толстая линия без лесенки, под ней мягкая тень отрывает героя от фона. */}
        <Img
          src={clip(`${card.shot}_outline.png`)}
          style={{ ...COVER, position: "absolute", opacity: k, filter: "drop-shadow(0 16px 26px rgba(0,0,0,0.65))" }}
        />
        <Img src={clip(`${card.shot}_cut.png`)} style={{ ...COVER, position: "absolute", filter: "contrast(1.08)" }} />
      </AbsoluteFill>
      <Sequence durationInFrames={len - 3} layout="none">
        <Plate name={card.name} nick={card.nick} tag={card.tag} />
      </Sequence>
    </AbsoluteFill>
  );
};

// --- звук -------------------------------------------------------------------

const musicVolume = (frame: number, start: number, voice: [number, number][]) => {
  const g = frame + start;
  const ramp = 0.2 * FPS;
  let duck = 0;
  for (const [a, b] of voice) {
    duck = Math.max(
      duck,
      Math.min(interpolate(g, [a - ramp, a], [0, 1], clamp), interpolate(g, [b, b + ramp], [1, 0], clamp)),
    );
  }
  const fadeIn = interpolate(frame, [0, 0.3 * FPS], [0, 1], clamp);
  const fadeOut = interpolate(g, [TOTAL_FRAMES - MUSIC.fadeOut * FPS, TOTAL_FRAMES], [1, 0], clamp);
  return (MUSIC.base - (MUSIC.base - MUSIC.duck) * duck) * fadeIn * fadeOut;
};

export type VoPhrase = At & { file: string; dur: number; text: string };
export type DogWalkRitchieProps = { vo: VoPhrase[] };

export const DogWalkRitchie: React.FC<DogWalkRitchieProps> = ({ vo }) => {
  const cardOf = (id: ShotId) => cards.find((c) => c.shot === id);
  const voice: [number, number][] = vo.map((p) => [frameOf(p), frameOf(p) + secs(p.dur)]);
  const musicStart = START.street1;
  const last = SHOTS[SHOTS.length - 1];

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {SHOTS.map((s) => {
        const card = cardOf(s.id);
        return (
          <Sequence key={s.id} from={START[s.id]} durationInFrames={LENGTH[s.id]} name={s.id}>
            {card ? <CardShot card={card} /> : <ShotMedia shot={s} />}
          </Sequence>
        );
      })}

      {[...cards.map((c) => c.shot), "hookFreeze" as ShotId, "finalCard" as ShotId].map((id) => (
        <Sequence key={`fl-${id}`} from={START[id]} durationInFrames={5} name="flash">
          <Flash />
        </Sequence>
      ))}
      {titles.map((t) => (
        <Sequence key={`t-${t.name}`} from={frameOf(t)} durationInFrames={secs(t.dur)} name={`title: ${t.name}`}>
          <Plate name={t.name} tag={t.tag} delay={0} />
        </Sequence>
      ))}
      {vo.map((p, i) => {
        // Субтитр живёт до конца фразы плюс 0.2 c, но не налезает на следующий.
        const from = frameOf(p);
        const next = i + 1 < vo.length ? frameOf(vo[i + 1]) : TOTAL_FRAMES;
        return (
          <Sequence key={`sub${i}`} from={from} durationInFrames={Math.max(1, Math.min(secs(p.dur) + 6, next - from))} name={`sub: ${p.text}`}>
            <Subtitle text={p.text} place={cardOf(p.shot)?.sub} />
          </Sequence>
        );
      })}

      <Sequence from={CLIP_FRAMES} durationInFrames={OUTRO_FRAMES} name="outro">
        <SubscribeOutro label="ПОДПИШИСЬ" bellVolume={0.4}>
          <Img src={clip(`${last.id}.png`)} style={COVER} />
        </SubscribeOutro>
      </Sequence>

      {/* Звук. Живой — одна дорожка, уже приглушённая в dogwalk-prep.py. */}
      <Sequence durationInFrames={CLIP_FRAMES} name="live">
        <Audio src={clip("live.wav")} />
      </Sequence>
      <Sequence durationInFrames={START.rewind} name="music-hook">
        <Audio src={clip("sfx/tapestop.wav")} volume={() => MUSIC.base} />
      </Sequence>
      <Sequence from={musicStart} durationInFrames={TOTAL_FRAMES - musicStart} name="music">
        <Audio src={clip("sfx/music.wav")} volume={(f) => musicVolume(f, musicStart, voice)} />
      </Sequence>
      {sfx.map((s, i) => (
        <Sequence key={`fx${i}`} from={frameOf(s)} durationInFrames={secs(s.dur ?? 2)} name={`sfx: ${s.name}`}>
          <Audio src={clip(`sfx/${s.name}.wav`)} volume={() => s.volume ?? 1} />
        </Sequence>
      ))}
      {vo.map((p, i) => (
        <Sequence key={`vo${i}`} from={frameOf(p)} durationInFrames={secs(p.dur) + 6} name={`vo: ${p.text}`}>
          <Audio src={clip(p.file)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

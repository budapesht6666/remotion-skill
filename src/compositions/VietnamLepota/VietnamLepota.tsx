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
import { loadFont as loadRuslan } from "@remotion/google-fonts/RuslanDisplay";
import { interFamily } from "../../lib/fonts";
import shortEdit from "./edit.json";
import longEdit from "../VietnamLepotaLong/edit.json";

/**
 * РЕЦЕПТ: мем на чужой узнаваемой фразе поверх своей съёмки. «Красота-то какая!
 * Лепота!» — голос Юрия Яковлева (Иван Грозный, «Иван Васильевич меняет
 * профессию», 1973), вырезан из 5-секундного ролика сцены.
 *
 * Шутка в подмене: «Красота-то какая!» звучит над Мраморными горами Дананга, а
 * «Лепота!» прилетает уже на шашлык — склейка со вспышкой ровно перед словом и
 * удар-наезд. Короткий монтаж (6.4 c) без концовки: последний кадр упирается в
 * первый, Shorts крутит ролик, и фраза запускается заново. Длинный (~21 c)
 * повторяет фразу трижды с нарастанием: виды → шашлык, «Татьяна жарит шашлык.
 * Круто.» → «Лепота!» на отдыхающем, сытые → виды снова «лепота».
 *
 * Весь монтаж — в edit.json (проп `cut` выбирает лист): планы, движения камеры,
 * где звучит «Лепота!» (`lepota`), подложки, субтитры живой речи, титры. Копии —
 * `python scripts/dogwalk-prep.py <Комп>`, звук — `python scripts/lepota-audio.py <Комп>`.
 */

const { fontFamily: oldFamily } = loadRuslan("normal", { weights: ["400"], subsets: ["latin", "cyrillic"] });

type EditShot = {
  id: string;
  src?: string;
  photo?: string;
  from?: number;
  to?: number;
  speed?: number;
  dur?: number;
  live?: number;
  move: number[];
  origin: string;
};
/** «Лепота!» слышна на `at` секунде плана `shot`; надпись держится до конца плана `until`. */
type Lepota = { shot: string; at: number; part: string; until: string };
type Bed = { file: string; from: string; to: string; volume: number; skip?: number };
/** Субтитр живой речи: время — секунды исходника, как в ASR. */
type Sub = { shot: string; from: number; to: number; text: string };
type Title = { shot: string; at: number; dur: number; text: string };
type Edit = {
  fps: number;
  outDir: string;
  shots: EditShot[];
  lepota: Lepota[];
  beds: Bed[];
  subs: Sub[];
  titles: Title[];
};

export type LepotaCut = "VietnamLepota" | "VietnamLepotaLong";
export type VietnamLepotaProps = { cut: LepotaCut };

const EDITS: Record<LepotaCut, Edit> = { VietnamLepota: shortEdit, VietnamLepotaLong: longEdit };

/** Где в файле звучит «Лепота!» (см. scripts/lepota-audio.py) и с какой секунды до неё «Красота-то», «какая!». */
const VOICE = {
  full: { file: "voice.wav", lepota: 3.27, krasota: 3.0, kakaya: 1.94 },
  word: { file: "lepota.wav", lepota: 0.1 },
} as const;

const shotFrames = (s: EditShot, fps: number): number => {
  const sec = s.dur ?? ((s.to ?? 0) - (s.from ?? 0)) / (s.speed ?? 1);
  return Math.floor(sec * fps + 0.5);
};

/** Раскладка листа по кадрам: начало и длина каждого плана, кадры «Лепоты». */
const layout = (edit: Edit) => {
  const start: Record<string, number> = {};
  const length: Record<string, number> = {};
  let cursor = 0;
  for (const s of edit.shots) {
    start[s.id] = cursor;
    length[s.id] = shotFrames(s, edit.fps);
    cursor += length[s.id];
  }
  const end = (id: string) => start[id] + length[id];
  const sec = (s: number) => Math.round(s * edit.fps);
  const cues = edit.lepota.map((c) => {
    const at = start[c.shot] + sec(c.at);
    return { ...c, at, punch: Math.max(start[c.shot], at - 2), until: end(c.until) };
  });
  return { start, length, end, sec, cues, total: cursor };
};

export const totalFrames = (cut: LepotaCut): number => layout(EDITS[cut]).total;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * План с медленным наездом; на ударе крупность скачком растёт в 1.18 раза и дальше
 * плавно доезжает до 1.22. Скачок, а не наезд за 3 кадра с тряской: тряска на
 * склейке читалась как подёргивание (пользователь, v3).
 */
const Shot: React.FC<{ shot: EditShot; length: number; punch?: number; dir: string }> = ({
  shot,
  length,
  punch,
  dir,
}) => {
  const frame = useCurrentFrame();
  let scale = interpolate(frame, [0, length], [shot.move[0], shot.move[1]], clamp);
  if (punch !== undefined && frame >= punch) {
    scale *= interpolate(frame - punch, [0, 45], [1.18, 1.22], clamp);
  }
  const style: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: `scale(${scale})`,
    transformOrigin: shot.origin,
  };
  const src = staticFile(`${dir}/${shot.id}.${shot.photo ? "png" : "mp4"}`);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
      {shot.photo ? <Img src={src} style={style} /> : <OffthreadVideo src={src} muted style={style} />}
    </AbsoluteFill>
  );
};

/** Старорусская надпись: золото с тёмной обводкой, как титр сказки. */
const oldText = (size: number): React.CSSProperties => ({
  display: "inline-block",
  fontFamily: oldFamily,
  fontSize: size,
  color: "#ffd86b",
  WebkitTextStroke: `${Math.round(size / 18)}px #3a1a05`,
  paintOrder: "stroke fill",
  textShadow: "0 6px 18px rgba(0,0,0,0.55)",
  letterSpacing: 2,
  lineHeight: 1.05,
});

/** Слово появляется с «выдохом»: из 1.25 в 1 за 4 кадра. */
const pop = (frame: number, at: number) => ({
  opacity: interpolate(frame, [at, at + 2], [0, 1], clamp),
  transform: `scale(${interpolate(frame, [at, at + 4], [1.25, 1], clamp)})`,
});

/**
 * Нижняя строка: низ на 380 px от края кадра (ниже Shorts закрывает описанием),
 * справа — колонка кнопок.
 */
const Bottom: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: "absolute", left: 50, right: 130, bottom: 380, textAlign: "center" }}>{children}</div>
);

/** Фраза Грозного: «Красота-то какая!» до склейки, «ЛЕПОТА!» после — до конца плана `until`. */
const Phrase: React.FC<{ cue: ReturnType<typeof layout>["cues"][number]; fps: number }> = ({ cue, fps }) => {
  const frame = useCurrentFrame();
  if (cue.part === "full") {
    const k = cue.at - Math.round(VOICE.full.krasota * fps);
    const ka = cue.at - Math.round(VOICE.full.kakaya * fps);
    if (frame >= k && frame < cue.punch) {
      return (
        <Bottom>
          <span style={{ ...oldText(96), ...pop(frame, k) }}>Красота-то</span>{" "}
          {frame >= ka && <span style={{ ...oldText(96), ...pop(frame, ka) }}>какая!</span>}
        </Bottom>
      );
    }
  }
  if (frame < cue.at || frame >= cue.until) return null;
  return (
    <Bottom>
      <span style={{ ...oldText(170), ...pop(frame, cue.at) }}>ЛЕПОТА!</span>
    </Bottom>
  );
};

/** Субтитр живой речи: белый, с чёрной обводкой — не спорит с золотом Грозного. */
const SubLine: React.FC<{ text: string }> = ({ text }) => (
  <Bottom>
    <span
      style={{
        fontFamily: interFamily,
        fontWeight: 800,
        fontSize: 72,
        color: "#fff",
        WebkitTextStroke: "10px #000",
        paintOrder: "stroke fill",
        lineHeight: 1.15,
      }}
    >
      {text}
    </span>
  </Bottom>
);

export const VietnamLepota: React.FC<VietnamLepotaProps> = ({ cut }) => {
  const edit = EDITS[cut];
  const { start, length, end, sec, cues } = layout(edit);
  const dir = edit.outDir.replace(/^public\//, "");
  const frame = useCurrentFrame();
  const flash = Math.max(0, ...cues.map((c) => interpolate(frame, [c.punch, c.punch + 3], [0.55, 0], clamp) * (frame >= c.punch ? 1 : 0)));
  // Живая речь уходит вниз под «Лепоту», чтобы слово Грозного не спорило с хвостом фразы.
  const liveVolume = (f: number) =>
    Math.min(1, ...cues.map((c) => interpolate(f, [c.at - 4, c.at, c.at + 30, c.at + 36], [1, 0.25, 0.25, 1], clamp)));
  const hasLive = edit.shots.some((s) => s.live);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {edit.shots.map((s) => {
        const cue = cues.find((c) => c.shot === s.id);
        return (
          <Sequence key={s.id} from={start[s.id]} durationInFrames={length[s.id]}>
            <Shot shot={s} length={length[s.id]} punch={cue ? cue.punch - start[s.id] : undefined} dir={dir} />
          </Sequence>
        );
      })}
      {flash > 0 && <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash }} />}

      {edit.subs.map((s) => {
        const shot = edit.shots.find((x) => x.id === s.shot)!;
        const at = (t: number) => start[s.shot] + sec((t - (shot.from ?? 0)) / (shot.speed ?? 1));
        return (
          <Sequence key={`${s.shot}-${s.from}`} from={at(s.from)} durationInFrames={Math.max(1, at(s.to) - at(s.from))}>
            <SubLine text={s.text} />
          </Sequence>
        );
      })}
      {edit.titles.map((t) => (
        <Sequence key={t.text} from={start[t.shot] + sec(t.at)} durationInFrames={sec(t.dur)}>
          <div style={{ position: "absolute", top: 300, left: 0, right: 0, textAlign: "center" }}>
            <span style={oldText(110)}>{t.text}</span>
          </div>
        </Sequence>
      ))}
      {cues.map((c) => (
        <Phrase key={c.at} cue={c} fps={edit.fps} />
      ))}

      {cues.map((c) => {
        const v = VOICE[c.part as keyof typeof VOICE];
        const from = c.at - sec(v.lepota);
        // Начало фразы до нуля ролика срезаем, а не сдвигаем.
        return (
          <Sequence key={`v${c.at}`} from={Math.max(0, from)}>
            <Audio src={staticFile(`${dir}/${v.file}`)} trimBefore={Math.max(0, -from)} />
          </Sequence>
        );
      })}
      {hasLive && <Audio src={staticFile(`${dir}/live.wav`)} volume={liveVolume} />}
      {edit.beds.map((b, i) => {
        const from = start[b.from];
        const dur = end(b.to) - from;
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <Audio
              src={staticFile(`${dir}/${b.file}.wav`)}
              trimBefore={sec(b.skip ?? 0)}
              volume={(f) => interpolate(f, [0, 3, dur - 4, dur], [0, b.volume, b.volume, 0], clamp)}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

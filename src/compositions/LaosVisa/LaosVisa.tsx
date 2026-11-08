/** «Лаосская виза, или Новые приключения Павлика» — длинный горизонтальный ролик (1920x1080, 30 fps).
 *  Монтаж — public/clips/LaosVisa/timeline.json (собирает `python scripts/laos-build.py` из beats.json),
 *  звук — одна дорожка audio.wav (голос, живые реплики, цитаты, шумы, музыка уже сведены). */
import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Intertitle, IrisCard, Receipt, RouteMap, TitleScene, TvQuote, type ReceiptLine } from "./parts";
import { Badge, Caption, ClipSeg, EndScene, NoteScene, PassportScene, StillSeg, Subscribe, SumScene, TopTitle } from "./scenes";
import { Iris } from "./fx";

export type Seg = {
  f: number;
  d: number;
  k: string;
  beat: string;
  src?: string;
  vertical?: boolean;
  [key: string]: unknown;
};
export type Timeline = { fps: number; frames: number; segs: Seg[] };
export type LaosVisaProps = { timeline: Timeline | null };

const RECEIPT: ReceiptLine[] = [
  { label: "Автобус ×6", value: 1320000 },
  { label: "Такси", value: 300000 },
  { label: "Обед", value: 500000 },
  { label: "«Сборы»", value: 600000, hidden: true },
];

const IrisEnd: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  return <Iris p={interpolate(f, [d - 16, d - 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />;
};

/** Графика без движения читается как зависшее видео (freezedetect ловил чек на 16 c) — медленный наезд камеры. */
const DRIFT = new Set(["receipt", "passport", "note", "sum", "map", "intertitle", "end"]);
const Drift: React.FC<{ d: number; children: React.ReactNode }> = ({ d, children }) => {
  const f = useCurrentFrame();
  const z = interpolate(f, [0, d], [1, 1.06]);
  const x = interpolate(f, [0, d], [0, -18]);
  return <AbsoluteFill style={{ transform: `translateX(${x}px) scale(${z})` }}>{children}</AbsoluteFill>;
};

const SegView: React.FC<{ s: Seg }> = ({ s }) => {
  const p = s as Record<string, unknown>;
  switch (s.k) {
    case "clip":
      return <ClipSeg src={s.src!} vertical={s.vertical} d={s.d} fast={Boolean(p.fast)} />;
    case "still":
      return (
        <StillSeg
          src={s.src!}
          d={s.d}
          vertical={s.vertical}
          push={p.push as number | undefined}
          pan={p.pan as [number, number] | undefined}
          bw={Boolean(p.bw)}
          gen={Boolean(p.gen)}
          flip={Boolean(p.flip)}
        />
      );
    case "title":
      return <TitleScene art={s.src!} dur={s.d} />;
    case "intertitle":
      return <Intertitle kicker={p.kicker as string} lines={p.lines as string[]} sub={p.sub as string} />;
    case "card":
      return <IrisCard src={s.src!} face={p.face as [number, number]} radius={p.r as number} name={p.name as string} sub={p.sub as string} />;
    case "map": {
      const from = p.from as number;
      const to = p.to as number;
      return <RouteMap from={from} to={to} dur={s.d} clock={p.clock as [string, string] | undefined} />;
    }
    case "receipt":
      return <Receipt lines={RECEIPT} before={8250000} stamp="ЭКОНОМИЯ ≈ $210" instant={Boolean(p.done)} reveal={Boolean(p.reveal)} />;
    case "sum":
      return <SumScene a={p.a as string} b={p.b as string} c={p.c as string} d={p.note as string | undefined} done={Boolean(p.done)} />;
    case "passport":
      return <PassportScene n={p.n as number} slam={(p.slam as number) ?? 6} fee={Boolean(p.fee)} />;
    case "note":
      return <NoteScene title={p.title as string} lines={p.lines as string[]} />;
    case "tv":
      return <TvQuote quote={p.quote as string} video={s.src} />;
    case "end":
      return <EndScene d={s.d} />;
    default:
      return <AbsoluteFill style={{ background: "#300" }} />;
  }
};

export const LaosVisa: React.FC<LaosVisaProps> = ({ timeline }) => {
  if (!timeline) {
    return <AbsoluteFill style={{ background: "#000", color: "#fff", fontSize: 48, justifyContent: "center", alignItems: "center" }}>нет timeline.json — python scripts/laos-build.py</AbsoluteFill>;
  }
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {timeline.segs.map((s, i) => (
        <Sequence key={i} from={s.f} durationInFrames={s.d} premountFor={30}>
          {DRIFT.has(s.k) ? (
            <Drift d={s.d}>
              <SegView s={s} />
            </Drift>
          ) : (
            <SegView s={s} />
          )}
          {typeof s.cap === "string" && <Caption text={s.cap} />}
          {typeof s.badge === "string" && <Badge text={s.badge} />}
          {typeof s.top === "string" && <TopTitle text={s.top} />}
          {Boolean(s.subscribe) && <Subscribe d={s.d} />}
          {Boolean(s.iris) && <IrisEnd d={s.d} />}
        </Sequence>
      ))}
      <Audio src={staticFile("clips/LaosVisa/audio.wav")} />
    </AbsoluteFill>
  );
};

import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { interFamily as fontFamily } from "../../lib/fonts";

/**
 * РЕЦЕПТ: закадровый монолог + b-roll из двух чужих фильмов.
 *
 * Отличие от `BeekeeperKong`, ради которого заведён отдельный рецепт: там
 * говорили персонажи, и каждая реплика владела своим кадром. Здесь говорит
 * рассказчик, и речь идёт **одной непрерывной дорожкой** поверх всего ролика
 * (`narrationFile`), а видеоряд нарезан независимо — планов больше, чем фраз.
 * Отсюда три следствия для разметки:
 *
 *   • Караоке не может жить внутри клипа: фраза свободно переезжает через
 *     склейку. Поэтому субтитры — глобальный слой, читающий абсолютное время.
 *   • Планы не знают текста вообще: они только картинка и приглушённый
 *     оригинальный звук.
 *   • Псевдо-мудрости (`wisdom`) выносятся крупной плашкой по центру вместо
 *     нижней строки — их зритель должен прочитать, даже листая без звука.
 *
 * Музыка ломается пополам: спокойный блюз под рассказ и фонк с финального
 * акта. Стык проложен бас-дропом, иначе смена трека читается как ошибка
 * монтажа, а не как приём.
 *
 * Материал готовит `npm run broll -- StethamTales`, манифест приезжает через
 * calculateMetadata из public/clips/StethamTales/broll.json.
 */

export type Clip = {
  id: string;
  file: string;
  durationInFrames: number;
  originalVolume: number;
  zoom: number;
  panX: number;
  panY: number;
  note: string | null;
};

export type Phrase = {
  id: string;
  line: string;
  start: number;
  end: number;
  wisdom: boolean;
  words: { w: string; s: number; e: number }[];
};

export type StethamTalesProps = {
  clips: Clip[];
  phrases: Phrase[];
  narrationFile: string;
  accent: string;
  showCaptions: boolean;
  /** Постоянная плашка сверху — объясняет ролик тем, кто листает без звука. */
  title: string;
  videoScale: number;
  videoShiftY: number;
  bandStyle: "blur" | "black";
  /** С какой фразы музыка рвётся в фонк, а монтаж начинает частить. */
  finalePhrase: string;
  /** Спокойный трек под рассказ и взрывной под финал. */
  musicSrc: string | null;
  finaleMusicSrc: string | null;
  musicVolume: number;
  finaleMusicVolume: number;
  /** Финальная плашка поверх последнего кадра. */
  outroMain: string;
  outroCta: string;
};

/** Базовое увеличение относительно вписывания по ширине (см. JuniorKumite). */
const BASE_SCALE = 1.75;

/**
 * План видеоряда. Текста не знает: под ним идёт общая дорожка монолога, а его
 * дело — картинка и остатки оригинального звука.
 */
const ClipShot: React.FC<{
  clip: Clip;
  videoScale: number;
  videoShiftY: number;
  bandStyle: "blur" | "black";
}> = ({ clip, videoScale, videoShiftY, bandStyle }) => {
  const frame = useCurrentFrame();
  const src = staticFile(clip.file);

  // Медленный наезд внутри плана: статичный кадр в вертикали выглядит мёртвым.
  const kenBurns = interpolate(frame, [0, clip.durationInFrames], [1, 1.04], {
    extrapolateRight: "clamp",
  });
  // Короткий «удар» на склейке — держит ритм монтажа.
  const punch = interpolate(frame, [0, 4], [1.035, 1], { extrapolateRight: "clamp" });
  const scale = clip.zoom * BASE_SCALE * videoScale * kenBurns * punch;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Полосы сверху и снизу: размытая копия кадра либо чистый чёрный. */}
      {bandStyle === "blur" ? (
        <AbsoluteFill
          style={{
            transform: "scale(2.4)",
            filter: "blur(24px) saturate(1.5) brightness(0.7)",
          }}
        >
          <OffthreadVideo
            src={src}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </AbsoluteFill>
      ) : null}

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            width: "100%",
            transform:
              `translateY(${videoShiftY}px) scale(${scale}) ` +
              `translate(${clip.panX * 12}%, ${clip.panY * 12}%)`,
          }}
        >
          <OffthreadVideo
            src={src}
            volume={clip.originalVolume}
            style={{
              width: "100%",
              display: "block",
              filter: "brightness(1.08) contrast(1.06) saturate(1.1)",
            }}
          />
        </div>
      </AbsoluteFill>

      {/* Виньетка — собирает внимание в центр и прячет стык кадра с фоном. */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 66%, rgba(0,0,0,0.34) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * Субтитры монолога. Слой глобальный: ищет фразу, звучащую прямо сейчас, и
 * подсвечивает в ней текущее слово. Обычная фраза идёт строкой внизу,
 * «мудрость» — крупным блоком по центру.
 */
const Narration: React.FC<{ phrases: Phrase[]; accent: string }> = ({ phrases, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;

  // Небольшие поля вокруг фразы: строка успевает появиться до первого слова и
  // не срезается на последнем. Пересечений нет — фразы идут встык.
  const active = phrases.find((p) => now >= p.start - 0.12 && now < p.end + 0.22);
  if (!active) return null;

  const appear = interpolate(now, [active.start - 0.12, active.start + 0.06], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const wisdom = active.wisdom;

  return (
    <AbsoluteFill
      style={{
        justifyContent: wisdom ? "center" : "flex-end",
        alignItems: "center",
        paddingBottom: wisdom ? 0 : 210,
        paddingLeft: wisdom ? 76 : 96,
        paddingRight: wisdom ? 76 : 96,
      }}
    >
      <div
        style={{
          fontFamily,
          fontSize: wisdom ? 92 : 58,
          fontWeight: wisdom ? 900 : 800,
          lineHeight: wisdom ? 1.08 : 1.2,
          textAlign: "center",
          textWrap: "balance",
          letterSpacing: wisdom ? "-0.03em" : "-0.01em",
          textTransform: wisdom ? "uppercase" : "none",
          opacity: appear,
          transform: `scale(${interpolate(appear, [0, 1], [0.94, 1])})`,
          textShadow: "0 4px 22px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.9)",
          WebkitTextStroke: wisdom ? "4px rgba(0,0,0,0.55)" : "3px rgba(0,0,0,0.6)",
          paintOrder: "stroke fill",
        }}
      >
        {active.words.map((word, i) => {
          const isActive = now >= word.s && now < word.e;
          return (
            <span
              key={`${word.w}-${i}`}
              style={{
                color: isActive ? accent : "white",
                display: "inline-block",
                transform: isActive ? "scale(1.06)" : "none",
                marginRight: "0.28em",
              }}
            >
              {word.w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Финальная плашка поверх последнего кадра: мораль уже прозвучала, это CTA. */
const Outro: React.FC<{ main: string; cta: string; accent: string }> = ({
  main,
  cta,
  accent,
}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 5, 9], [1.3, 0.98, 1], { extrapolateRight: "clamp" });
  const opacity = interpolate(frame, [0, 4], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", padding: 80 }}
    >
      <div style={{ transform: `scale(${scale})`, opacity, textAlign: "center" }}>
        <div
          style={{
            fontFamily,
            fontSize: 104,
            fontWeight: 900,
            color: "white",
            lineHeight: 1.02,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            textShadow: "0 6px 30px rgba(0,0,0,0.95)",
          }}
        >
          {main}
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 76,
            fontWeight: 900,
            color: accent,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            marginTop: 18,
            textShadow: "0 6px 30px rgba(0,0,0,0.95)",
          }}
        >
          {cta}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const StethamTales: React.FC<StethamTalesProps> = ({
  clips,
  phrases,
  narrationFile,
  accent,
  showCaptions,
  title,
  videoScale,
  videoShiftY,
  bandStyle,
  finalePhrase,
  musicSrc,
  finaleMusicSrc,
  musicVolume,
  finaleMusicVolume,
  outroMain,
  outroCta,
}) => {
  const { durationInFrames, fps } = useVideoConfig();

  // Раскладка: планы идут подряд, длительности уже посчитаны в манифесте.
  const placed: { clip: Clip; from: number }[] = [];
  let cursor = 0;
  for (const clip of clips) {
    placed.push({ clip, from: cursor });
    cursor += clip.durationInFrames;
  }

  // Точка слома: с неё блюз обрывается, начинается фонк и частый монтаж.
  const finale = phrases.find((p) => p.id === finalePhrase);
  const finaleFrame = finale ? Math.round(finale.start * fps) : durationInFrames;

  // Плашка встаёт на последней фразе и держится до конца — под неё в сценарии
  // оставлена пауза (gap), поэтому она не перекрывает ни одного слова.
  // Задержка 0.3 c обязательна: предыдущая «мудрость» гаснет не на последнем
  // слове, а чуть позже, и без зазора две крупные надписи по центру рисуются
  // друг поверх друга.
  const last = phrases[phrases.length - 1];
  const outroFrame = last ? Math.round((last.start + 0.3) * fps) : durationInFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {placed.map(({ clip, from }) => (
        <Sequence key={clip.id} from={from} durationInFrames={clip.durationInFrames}>
          <ClipShot
            clip={clip}
            videoScale={videoScale}
            videoShiftY={videoShiftY}
            bandStyle={bandStyle}
          />
        </Sequence>
      ))}

      {/* Монолог одной дорожкой на весь ролик — ради этого и затевался рецепт. */}
      <Audio src={staticFile(narrationFile)} />

      {/* Блюз под рассказ: входит из тишины и обрывается ровно на финале. */}
      {musicSrc ? (
        <Sequence durationInFrames={finaleFrame}>
          <Audio
            src={staticFile(musicSrc)}
            volume={(f) =>
              interpolate(
                f,
                [0, 24, Math.max(finaleFrame - 12, 25), finaleFrame],
                [0, musicVolume, musicVolume, musicVolume * 0.6],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              )
            }
          />
        </Sequence>
      ) : null}

      {/* Бас-дроп на стыке: без него смена трека читается как склейка-ошибка. */}
      <Sequence from={Math.max(finaleFrame - 6, 0)}>
        <Audio src={staticFile("sfx/bass-drop.mp3")} volume={0.85} />
      </Sequence>

      {/* Фонк с финального акта до конца ролика. */}
      {finaleMusicSrc ? (
        <Sequence from={finaleFrame}>
          <Audio
            src={staticFile(finaleMusicSrc)}
            volume={(f) =>
              interpolate(
                f,
                [0, 8, Math.max(durationInFrames - finaleFrame - 20, 9), durationInFrames - finaleFrame],
                [0, finaleMusicVolume, finaleMusicVolume, 0],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              )
            }
          />
        </Sequence>
      ) : null}

      {/* Заголовок сверху: ролик должен читаться с первого кадра и без звука. */}
      {title ? (
        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 118 }}>
          <div
            style={{
              fontFamily,
              fontSize: 40,
              fontWeight: 800,
              color: "white",
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              padding: "14px 26px",
              borderRadius: 14,
              backgroundColor: "rgba(0,0,0,0.42)",
              textShadow: "0 3px 14px rgba(0,0,0,0.9)",
            }}
          >
            {title}
          </div>
        </AbsoluteFill>
      ) : null}

      {showCaptions ? <Narration phrases={phrases} accent={accent} /> : null}

      <Sequence from={outroFrame}>
        <Outro main={outroMain} cta={outroCta} accent={accent} />
      </Sequence>
    </AbsoluteFill>
  );
};

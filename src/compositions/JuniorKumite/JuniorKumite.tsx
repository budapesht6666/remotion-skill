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
 * РЕЦЕПТ: сквозная история из нарезки чужого фильма.
 *
 * Клипы режутся заранее (npm run cut -- JuniorKumite) по сценарию script.ts,
 * их список и длительности лежат в public/clips/<Comp>/clips.json и приезжают
 * сюда через calculateMetadata — композиция ничего не догружает на лету и
 * остаётся чистой функцией кадра.
 *
 * Кадрирование: исходник почти всегда шире вертикали, поэтому кадр вписывается
 * по ширине с увеличением (zoom) и сдвигом центра (panX) — это ручной pan&scan
 * под каждый бит. Пустоту сверху и снизу закрывает размытая копия того же
 * кадра, иначе вертикаль зияет чёрным.
 */

export type Clip = {
  id: string;
  file: string;
  durationInFrames: number;
  caption: string | null;
  kind: "quote" | "action";
  /** Во сколько раз увеличить кадр относительно вписывания по ширине. */
  zoom: number;
  /** Сдвиг центра кадра по горизонтали, −1…1 (доля от запаса ширины). */
  panX: number;
  /** Сдвиг центра по вертикали, −1…1. */
  panY: number;
  /** Громкость оригинальной дорожки фильма в этом бите. */
  originalVolume: number;
  /** Файл нашей озвучки в public/, если у бита есть реплика. */
  voFile: string | null;
  /** Слова реплики с таймингами относительно начала озвучки. */
  words: { w: string; s: number; e: number }[];
};

export type JuniorKumiteProps = {
  clips: Clip[];
  accent: string;
  showCaptions: boolean;
  /** Постоянная плашка сверху: о чём ролик. Висит от первого кадра до последнего. */
  title: string;
  /**
   * Кадрирование видео — крутится прямо в студии.
   * 1 = кадр занимает ~52 % высоты (полосы сверху и снизу примерно равны заголовку
   * и субтитрам), больше 1 — крупнее и уже, меньше 1 — мельче.
   */
  videoScale: number;
  /** Сдвиг кадра по вертикали в пикселях: минус — вверх, плюс — вниз. */
  videoShiftY: number;
  /** Чем заполнять полосы: размытым кадром или чистым чёрным. */
  bandStyle: "blur" | "black";
  musicSrc: string | null;
  musicVolume: number;
};

/** Задержка озвучки от начала бита (кадры) — от неё же отсчитывается караоке. */
const VO_DELAY_FRAMES = 4;

/**
 * Базовое увеличение относительно вписывания по ширине. Исходник 1.85:1 при
 * вписывании занимает лишь треть вертикали — кадр приходится «наезжать», жертвуя
 * краями. 1.75 держит лицо крупным и оставляет место под субтитр.
 */
const BASE_SCALE = 1.75;

const ClipShot: React.FC<{
  clip: Clip;
  accent: string;
  showCaptions: boolean;
  videoScale: number;
  videoShiftY: number;
  bandStyle: "blur" | "black";
}> = ({ clip, accent, showCaptions, videoScale, videoShiftY, bandStyle }) => {
  const frame = useCurrentFrame();
  const src = staticFile(clip.file);

  // Медленный наезд внутри бита: статичный план в вертикали выглядит мёртвым.
  const kenBurns = interpolate(
    frame,
    [0, clip.durationInFrames],
    [1, 1.05],
    { extrapolateRight: "clamp" },
  );
  // Короткий «удар» на склейке — держит ритм монтажа.
  const punch = interpolate(frame, [0, 4], [1.04, 1], { extrapolateRight: "clamp" });
  const scale = clip.zoom * BASE_SCALE * videoScale * kenBurns * punch;

  const captionIn = interpolate(frame, [1, 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Полосы сверху и снизу: либо размытая копия кадра, либо чистый чёрный. */}
      {bandStyle === "blur" ? (
        <AbsoluteFill
          style={{
            transform: "scale(2.4)",
            filter: "blur(24px) saturate(1.5) brightness(0.72)",
          }}
        >
          <OffthreadVideo
            src={src}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </AbsoluteFill>
      ) : null}

      {/* Основной кадр. Оригинальная дорожка приглушена — поверх идёт наша
          озвучка; на кульминациях громкость поднимается через originalVolume. */}
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
              // Плёнка 1988-го в вертикали на телефоне выглядит мутной — подтягиваем.
              filter: "brightness(1.18) contrast(1.07) saturate(1.14)",
            }}
          />
        </div>
      </AbsoluteFill>

      {/* Виньетка — собирает внимание в центр и прячет стык кадра с фоном. */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 68%, rgba(0,0,0,0.3) 100%)",
        }}
      />

      {/* Наша реплика: небольшая задержка, чтобы голос не начинался ровно на
          склейке — иначе первое слово съедается сменой кадра. */}
      {clip.voFile ? (
        <Sequence from={4}>
          <Audio src={staticFile(clip.voFile)} />
        </Sequence>
      ) : null}

      {/* Караоке в нижней полосе: подсвечивается слово, которое звучит сейчас. */}
      {showCaptions && clip.words.length > 0 ? (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            paddingBottom: 210,
            paddingLeft: 96,
            paddingRight: 96,
          }}
        >
          <div
            style={{
              fontFamily,
              fontSize: 58,
              fontWeight: 800,
              lineHeight: 1.2,
              textAlign: "center",
              textWrap: "balance",
              letterSpacing: "-0.01em",
              opacity: captionIn,
              textShadow: "0 4px 22px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.9)",
              WebkitTextStroke: "3px rgba(0,0,0,0.6)",
              paintOrder: "stroke fill",
            }}
          >
            {clip.words.map((word, i) => {
              const spoken = (frame - VO_DELAY_FRAMES) / 30;
              const isActive = spoken >= word.s && spoken < word.e;
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
      ) : null}
    </AbsoluteFill>
  );
};

export const JuniorKumite: React.FC<JuniorKumiteProps> = ({
  clips,
  accent,
  showCaptions,
  title,
  videoScale,
  videoShiftY,
  bandStyle,
  musicSrc,
  musicVolume,
}) => {
  const { durationInFrames } = useVideoConfig();
  let cursor = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {clips.map((clip) => {
        const from = cursor;
        cursor += clip.durationInFrames;
        return (
          <Sequence key={clip.id} from={from} durationInFrames={clip.durationInFrames}>
            <ClipShot
              clip={clip}
              accent={accent}
              showCaptions={showCaptions}
              videoScale={videoScale}
              videoShiftY={videoShiftY}
              bandStyle={bandStyle}
            />
          </Sequence>
        );
      })}

      {/* Заголовок в верхней полосе — висит весь ролик, объясняет происходящее
          тем, кто пролистывает ленту без звука. */}
      {title ? (
        <AbsoluteFill
          style={{
            justifyContent: "flex-start",
            alignItems: "center",
            paddingTop: 232,
            paddingLeft: 88,
            paddingRight: 88,
          }}
        >
          <div
            style={{
              fontFamily,
              fontSize: 62,
              fontWeight: 800,
              color: "white",
              textAlign: "center",
              lineHeight: 1.16,
              textWrap: "balance",
              letterSpacing: "-0.02em",
              textShadow: "0 4px 24px rgba(0,0,0,0.9)",
              WebkitTextStroke: "3px rgba(0,0,0,0.5)",
              paintOrder: "stroke fill",
            }}
          >
            {title}
          </div>
        </AbsoluteFill>
      ) : null}

      {musicSrc ? (
        <Audio
          src={staticFile(musicSrc)}
          loop
          volume={(f) =>
            interpolate(
              f,
              [0, 30, durationInFrames - 45, durationInFrames],
              [0, musicVolume, musicVolume, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      ) : null}
    </AbsoluteFill>
  );
};

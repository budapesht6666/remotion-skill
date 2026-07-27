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
 * РЕЦЕПТ: смешной перевод на кадрах ДВУХ фильмов + звуковая комедия.
 *
 * Отличия от базового `JuniorKumite`, ради которых заведён отдельный рецепт:
 *
 *   • **Бип-цензура.** Мат остаётся в озвучке (иначе интонация ломается), но в
 *     ролике не звучит: голос глушится ровно на интервале слова, поверх ложится
 *     бип, в субтитре слово превращается в звёздочки. Интервалы известны из
 *     пословных таймингов ElevenLabs, так что попадание точное.
 *   • **Чёрно-белый удар с басом** на битах из `bwBeats` — жанровая отбивка
 *     «псевдо-мудрость», которая отделяет один панч от другого.
 *   • **Сверчки** на битах из `cricketBeats`: пауза после шутки читается как
 *     часть шутки, только если её слышно.
 *   • **Титульная плашка** посреди таймлайна (не в конце): после неё идёт ещё
 *     один кадр-стингер, ради которого зритель досматривает до конца.
 *
 * Клипы режутся заранее (npm run cut -- BeekeeperKong), их список и длительности
 * приезжают из public/clips/BeekeeperKong/clips.json через calculateMetadata.
 */

export type Clip = {
  id: string;
  file: string;
  durationInFrames: number;
  caption: string | null;
  kind: "quote" | "action";
  zoom: number;
  panX: number;
  panY: number;
  originalVolume: number;
  voFile: string | null;
  words: { w: string; s: number; e: number }[];
};

export type BeekeeperKongProps = {
  clips: Clip[];
  accent: string;
  showCaptions: boolean;
  /** Постоянная плашка сверху — объясняет ролик тем, кто листает без звука. */
  title: string;
  videoScale: number;
  videoShiftY: number;
  bandStyle: "blur" | "black";
  /** Биты, которые уходят в чёрно-белое и получают бас-дроп. */
  bwBeats: string[];
  /** Биты, под которые подкладываются сверчки. */
  cricketBeats: string[];
  /** После какого бита встаёт титульная плашка. */
  titleCardAfter: string;
  titleCardMain: string;
  titleCardSub: string;
  /** Подпись поверх последнего кадра-стингера. */
  stingerText: string;
  musicSrc: string | null;
  /** Громкость музыки в теле ролика и на финале (с плашки). */
  musicVolume: number;
  musicFinaleVolume: number;
};

/** Задержка озвучки от начала бита (кадры) — от неё же отсчитывается караоке. */
const VO_DELAY_FRAMES = 4;

/** Базовое увеличение относительно вписывания по ширине (см. JuniorKumite). */
const BASE_SCALE = 1.75;

/** Сколько кадров висит титульная плашка. */
export const TITLE_CARD_FRAMES = 60;

/**
 * Корни, которые глушим бипом. Список намеренно короткий и «корневой»: нужно
 * поймать словоформы из сценария («охуеют», «охуели»), не задев обычные слова.
 */
const CENSOR_RE = /(охуе|ахуе|хуй|хуе|пизд|бляд|ебан|ебал|уёб|ёб)/i;

const isCensored = (word: string) => CENSOR_RE.test(word);

/** «охуеют» → «о****т»: первая и последняя буквы остаются, середина под звёздочки. */
const maskWord = (word: string) => {
  const letters = word.replace(/[^\p{L}]/gu, "");
  const tail = word.slice(letters.length);
  if (letters.length <= 2) return "*".repeat(letters.length) + tail;
  return letters[0] + "*".repeat(letters.length - 2) + letters[letters.length - 1] + tail;
};

const ClipShot: React.FC<{
  clip: Clip;
  accent: string;
  showCaptions: boolean;
  videoScale: number;
  videoShiftY: number;
  bandStyle: "blur" | "black";
  blackAndWhite: boolean;
  crickets: boolean;
}> = ({
  clip,
  accent,
  showCaptions,
  videoScale,
  videoShiftY,
  bandStyle,
  blackAndWhite,
  crickets,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const src = staticFile(clip.file);

  // Медленный наезд внутри бита: статичный план в вертикали выглядит мёртвым.
  const kenBurns = interpolate(frame, [0, clip.durationInFrames], [1, 1.05], {
    extrapolateRight: "clamp",
  });
  // Короткий «удар» на склейке — держит ритм монтажа.
  const punch = interpolate(frame, [0, 4], [1.04, 1], { extrapolateRight: "clamp" });
  const scale = clip.zoom * BASE_SCALE * videoScale * kenBurns * punch;

  const captionIn = interpolate(frame, [1, 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Интервалы цензуры в кадрах бита (озвучка сдвинута на VO_DELAY_FRAMES).
  const censorRanges = clip.words
    .filter((w) => isCensored(w.w))
    .map((w) => ({
      from: Math.round(w.s * fps) + VO_DELAY_FRAMES,
      to: Math.round(w.e * fps) + VO_DELAY_FRAMES,
    }));

  /**
   * Голос глушится на интервале слова. Один кадр на спад и подъём: резкий ноль
   * щёлкает, а длинный фейд съедает соседние слоги.
   */
  const voVolume = (f: number) => {
    // f отсчитывается от начала Sequence с озвучкой, censorRanges — от начала бита.
    const local = f + VO_DELAY_FRAMES;
    for (const r of censorRanges) {
      if (local >= r.from - 1 && local <= r.to + 1) return 0;
    }
    return 1;
  };

  const bwFilter = blackAndWhite ? "grayscale(1) contrast(1.45) brightness(1.05) " : "";

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Полосы сверху и снизу: размытая копия кадра либо чистый чёрный. */}
      {bandStyle === "blur" ? (
        <AbsoluteFill
          style={{
            transform: "scale(2.4)",
            filter: `${bwFilter}blur(24px) saturate(1.5) brightness(0.72)`,
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
              filter: `${bwFilter}brightness(1.1) contrast(1.05) saturate(1.08)`,
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

      {/* Наша реплика. Небольшая задержка, чтобы первое слово не съедала склейка. */}
      {clip.voFile ? (
        <Sequence from={VO_DELAY_FRAMES}>
          {/* Без цензурных слов voVolume — константная единица, отдельная ветка не нужна. */}
          <Audio src={staticFile(clip.voFile)} volume={voVolume} />
        </Sequence>
      ) : null}

      {/* Бип ровно на заглушённом слове. */}
      {censorRanges.map((r) => (
        <Sequence
          key={`beep-${r.from}`}
          from={r.from}
          durationInFrames={Math.max(r.to - r.from, 4)}
        >
          <Audio src={staticFile("sfx/beep.mp3")} volume={0.55} />
        </Sequence>
      ))}

      {/* Бас-дроп на чёрно-белой отбивке. */}
      {blackAndWhite ? <Audio src={staticFile("sfx/bass-drop.mp3")} volume={0.9} /> : null}

      {/* Сверчки в повисшей паузе. */}
      {crickets ? <Audio src={staticFile("sfx/crickets.mp3")} volume={0.75} /> : null}

      {/* Караоке: подсвечивается звучащее слово, мат показан звёздочками. */}
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
              const spoken = (frame - VO_DELAY_FRAMES) / fps;
              const isActive = spoken >= word.s && spoken < word.e;
              const censored = isCensored(word.w);
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
                  {censored ? maskWord(word.w) : word.w}
                </span>
              );
            })}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

/** Чёрная плашка-титр: жанровый маркер «это был трейлер несуществующего фильма». */
const TitleCard: React.FC<{ main: string; sub: string; accent: string }> = ({
  main,
  sub,
  accent,
}) => {
  const frame = useCurrentFrame();
  // Титр «прилетает» ударом: за 5 кадров с перелётом, дальше стоит намертво.
  const scale = interpolate(frame, [0, 5, 9], [1.35, 0.97, 1], {
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(frame, [0, 4], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000",
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
      }}
    >
      <div style={{ transform: `scale(${scale})`, opacity, textAlign: "center" }}>
        <div
          style={{
            fontFamily,
            fontSize: 112,
            fontWeight: 900,
            color: "white",
            lineHeight: 1.02,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
          }}
        >
          {main}
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 96,
            fontWeight: 900,
            color: accent,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            marginTop: 10,
          }}
        >
          {sub}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const BeekeeperKong: React.FC<BeekeeperKongProps> = ({
  clips,
  accent,
  showCaptions,
  title,
  videoScale,
  videoShiftY,
  bandStyle,
  bwBeats,
  cricketBeats,
  titleCardAfter,
  titleCardMain,
  titleCardSub,
  stingerText,
  musicSrc,
  musicVolume,
  musicFinaleVolume,
}) => {
  const { durationInFrames } = useVideoConfig();

  // Раскладка таймлайна: клипы подряд, после titleCardAfter вставляется плашка.
  const placed: { clip: Clip; from: number }[] = [];
  let cursor = 0;
  let titleCardFrom: number | null = null;
  for (const clip of clips) {
    placed.push({ clip, from: cursor });
    cursor += clip.durationInFrames;
    if (clip.id === titleCardAfter) {
      titleCardFrom = cursor;
      cursor += TITLE_CARD_FRAMES;
    }
  }
  // Стингер — всё, что идёт после плашки: там заголовок уже не нужен.
  const stingerFrom = titleCardFrom === null ? cursor : titleCardFrom + TITLE_CARD_FRAMES;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {placed.map(({ clip, from }) => (
        <Sequence key={clip.id} from={from} durationInFrames={clip.durationInFrames}>
          <ClipShot
            clip={clip}
            accent={accent}
            showCaptions={showCaptions}
            videoScale={videoScale}
            videoShiftY={videoShiftY}
            bandStyle={bandStyle}
            blackAndWhite={bwBeats.includes(clip.id)}
            crickets={cricketBeats.includes(clip.id)}
          />
        </Sequence>
      ))}

      {titleCardFrom !== null ? (
        <Sequence from={titleCardFrom} durationInFrames={TITLE_CARD_FRAMES}>
          <TitleCard main={titleCardMain} sub={titleCardSub} accent={accent} />
        </Sequence>
      ) : null}

      {/* Заголовок сверху: висит, пока идёт история, и уходит на плашке — дальше
          он мешал бы титру и стингеру. */}
      {title && titleCardFrom !== null ? (
        <Sequence durationInFrames={titleCardFrom}>
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
        </Sequence>
      ) : null}

      {/* Подпись на стингере — последняя шутка ролика. */}
      {stingerText && stingerFrom < durationInFrames ? (
        <Sequence from={stingerFrom}>
          <AbsoluteFill
            style={{
              justifyContent: "flex-end",
              alignItems: "center",
              paddingBottom: 300,
              paddingLeft: 80,
              paddingRight: 80,
            }}
          >
            <div
              style={{
                fontFamily,
                fontSize: 66,
                fontWeight: 900,
                color: "white",
                textAlign: "center",
                lineHeight: 1.1,
                textWrap: "balance",
                letterSpacing: "-0.02em",
                textShadow: "0 4px 26px rgba(0,0,0,0.95)",
                WebkitTextStroke: "3px rgba(0,0,0,0.6)",
                paintOrder: "stroke fill",
              }}
            >
              {stingerText}
            </div>
          </AbsoluteFill>
        </Sequence>
      ) : null}

      {/* Музыка: под голосом держится тихо, на плашке выходит вперёд — финальный
          фонк должен «качнуть» ровно там, где кончается текст. */}
      {musicSrc ? (
        <Audio
          src={staticFile(musicSrc)}
          loop
          volume={(f) =>
            interpolate(
              f,
              [
                0,
                30,
                Math.max(stingerFrom - 40, 31),
                Math.max(stingerFrom - 10, 41),
                durationInFrames - 12,
                durationInFrames,
              ],
              [0, musicVolume, musicVolume, musicFinaleVolume, musicFinaleVolume, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      ) : null}
    </AbsoluteFill>
  );
};

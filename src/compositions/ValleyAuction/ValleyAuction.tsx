import React from "react";
import {
  AbsoluteFill,
  Audio,
  Freeze,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { interFamily as fontFamily } from "../../lib/fonts";
import { SubscribeOutro } from "../../components/SubscribeOutro";

/**
 * РЕЦЕПТ: нарезка сериала со своими субтитрами, но чужими голосами.
 *
 * Отличие от `JuniorKumite`: там поверх чужих кадров шла наша озвучка, здесь
 * звучит оригинальная дорожка целиком, а караоке рисуется по словам из индекса
 * реплик фильма (их кладёт в clips.json `npm run cut` при `subs: "source"`).
 * Синхронизировать вручную нечего: тайминги приходят из той же ASR-разметки, по
 * которой выбирались куски.
 *
 * Кадрирование сюда не входит: клипы приезжают уже вертикальными. Окно 9:16
 * вырезает `npm run cut` прямо из исходника по траектории детектора лиц
 * (`npm run track`), поэтому кадр масштабируется один раз, а голова говорящего
 * держится в центре даже когда камера едет. Композиция просто показывает клип
 * целиком — ни object-position, ни увеличения здесь нет и быть не должно.
 *
 * Никаких титров и плашек поверх кадра: ролик держится на самом материале.
 *
 * Единственное исключение — концовка (`outroFrames`): реплика в нарезке обычно
 * договаривается до последнего кадра клипа, поэтому призыв подписаться некуда
 * положить внутри сцены. Хвост держит последний кадр `<Freeze>` (отдельный файл
 * стоп-кадра не нужен), затемняет его и показывает кнопку Subscribe. Ноль в
 * пропе — концовки нет.
 *
 * Субтитры разбиваются на короткие строки по паузам в речи и живут в нижней
 * трети, выше зоны интерфейса площадок.
 */

export type Clip = {
  id: string;
  file: string;
  durationInFrames: number;
  caption: string | null;
  kind: "quote" | "action";
  /** Громкость оригинальной дорожки: у этого рецепта она и есть звук ролика. */
  originalVolume: number;
  voFile: string | null;
  /**
   * Слова оригинальной дорожки с таймингами от начала клипа. `q` — первое слово
   * реплики: по нему строка субтитра начинается заново (см. buildChunks).
   */
  words: { w: string; s: number; e: number; q?: boolean }[];
};

export type ValleyAuctionProps = {
  clips: Clip[];
  /**
   * Манифест нарезки. Развязан пропом, поэтому на одном компоненте живёт
   * сколько угодно монтажей: у каждого своя папка public/clips/<Композиция>/.
   */
  clipsFile: string;
  /** Цвет подсветки звучащего слова. */
  accent: string;
  showCaptions: boolean;
  /** Общее увеличение кадра поверх пер-битного zoom. */
  videoScale: number;
  /** Сдвиг кадра по вертикали в пикселях: минус — вверх. */
  videoShiftY: number;
  /** Длина концовки с кнопкой Subscribe в кадрах; 0 — без концовки. */
  outroFrames: number;
  /** Подпись на кнопке концовки. */
  subscribeLabel: string;
  /**
   * Фоновая музыка под оригинальной дорожкой. Пустая строка — без музыки
   * (у первых двух нарезок «Долины» её и нет). Путь в public/, не null:
   * `null` в defaultProps гасит редактор пропсов в студии.
   */
  musicFile: string;
  /** Громкость музыки под речью. */
  musicVolume: number;
  /** Громкость к панчу: трек подводит к последнему кадру монтажа. */
  musicPeakVolume: number;
};

/** Пауза в речи, с которой начинается новая строка субтитра. */
const CHUNK_GAP = 0.45;
/** Длиннее этого строка не набирается — иначе она не читается за свою секунду. */
const CHUNK_CHARS = 34;
/** Строка появляется чуть раньше первого слова и держится после последнего. */
const CHUNK_LEAD = 0.18;
const CHUNK_TAIL = 0.5;

type Chunk = {
  words: { w: string; s: number; e: number }[];
  from: number;
  to: number;
};

/**
 * Режет слова клипа на строки субтитра: по началу новой реплики, по паузе
 * между словами и по длине. Границы строк расширяются до соседей, чтобы между
 * ними не было пустого кадра — субтитр в вертикали должен висеть непрерывно.
 *
 * Начало реплики (`q`) рвёт строку даже без паузы: в живом диалоге ответ
 * наступает на вопрос (у «Я ем рыбу» / «Я понял, что ты ешь рыбу» зазор 0.12 c),
 * и одна плашка на двух говорящих читается как оговорка одного из них.
 */
function buildChunks(words: Clip["words"], durationInSeconds: number): Chunk[] {
  const groups: Clip["words"][] = [];
  let current: Clip["words"] = [];
  let chars = 0;
  for (const word of words) {
    const previous = current[current.length - 1];
    const gap = previous ? word.s - previous.e : 0;
    if (
      current.length > 0 &&
      (word.q || gap > CHUNK_GAP || chars + word.w.length + 1 > CHUNK_CHARS)
    ) {
      groups.push(current);
      current = [];
      chars = 0;
    }
    current.push(word);
    chars += word.w.length + 1;
  }
  if (current.length > 0) groups.push(current);

  return groups.map((group, i) => {
    const next = groups[i + 1];
    const rawTo = group[group.length - 1].e + CHUNK_TAIL;
    return {
      words: group,
      from: Math.max(0, group[0].s - CHUNK_LEAD),
      to: Math.min(next ? Math.min(rawTo, next[0].s - 0.02) : rawTo, durationInSeconds),
    };
  });
}

const Caption: React.FC<{ chunk: Chunk; accent: string; time: number }> = ({
  chunk,
  accent,
  time,
}) => {
  // Строка не выпрыгивает, а проявляется: резкий скачок на каждой фразе
  // превращает низ кадра в мигалку.
  const appear = interpolate(time, [chunk.from, chunk.from + 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        // Плашка под текстом: кадры сериала светлые и пёстрые, обводка на них
        // не спасает — читаемость держит именно фон.
        backgroundColor: "rgba(8, 10, 14, 0.82)",
        borderRadius: 24,
        padding: "22px 34px 26px",
        maxWidth: 940,
        transform: `translateY(${(1 - appear) * 14}px)`,
        opacity: appear,
        boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
      }}
    >
      <div
        style={{
          fontFamily,
          fontSize: 60,
          fontWeight: 800,
          lineHeight: 1.18,
          textAlign: "center",
          textWrap: "balance",
          letterSpacing: "-0.015em",
          color: "white",
        }}
      >
        {chunk.words.map((word, i) => {
          const isActive = time >= word.s && time < word.e;
          return (
            <span
              key={`${word.w}-${i}`}
              style={{
                color: isActive ? accent : "white",
                display: "inline-block",
                marginRight: "0.26em",
              }}
            >
              {word.w}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const ClipShot: React.FC<{
  clip: Clip;
  accent: string;
  showCaptions: boolean;
  videoScale: number;
  videoShiftY: number;
}> = ({ clip, accent, showCaptions, videoScale, videoShiftY }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const durationInSeconds = clip.durationInFrames / fps;
  const src = staticFile(clip.file);

  const chunks = React.useMemo(
    () => buildChunks(clip.words, durationInSeconds),
    [clip.words, durationInSeconds],
  );
  const chunk = chunks.find((c) => time >= c.from && time < c.to);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill
        style={{ transform: `translateY(${videoShiftY}px) scale(${videoScale})` }}
      >
        <OffthreadVideo
          src={src}
          volume={clip.originalVolume}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            // Web-DLRip 2014 года на телефоне выглядит вяло — подтягиваем.
            filter: "brightness(1.06) contrast(1.06) saturate(1.1)",
          }}
        />
      </AbsoluteFill>

      {/* Лёгкое затемнение к низу — под ним плашка субтитра не выглядит
          наклейкой, а лица остаются нетронутыми. */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0) 55%, rgba(0,0,0,0.35) 100%)",
        }}
      />

      {showCaptions && chunk ? (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            // Нижние ~20 % экрана перекрыты интерфейсом площадок — субтитр
            // держится выше этой зоны и ниже самого кадра.
            paddingBottom: 400,
            paddingLeft: 60,
            paddingRight: 60,
          }}
        >
          <Caption chunk={chunk} accent={accent} time={time} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

/**
 * Стоп-кадр концовки: последний кадр нарезки, замороженный `<Freeze>`.
 * Наезд и затемнение делает `SubscribeOutro` снаружи — внутри `<Freeze>`
 * `useCurrentFrame()` заморожен вместе с картинкой.
 */
const FrozenLastFrame: React.FC<{
  clip: Clip;
  videoScale: number;
  videoShiftY: number;
}> = ({ clip, videoScale, videoShiftY }) => (
  <AbsoluteFill
    style={{ transform: `translateY(${videoShiftY}px) scale(${videoScale})` }}
  >
    {/* Кадр выбирается ОБРЕЗКОЙ клипа (`trimBefore`), а не номером в `Freeze`.
        Так было раньше — `<Freeze frame={длина клипа − 1}>` — и это молча
        показывало не тот кадр: внутри хвоста живёт своя `<Sequence>` на 60
        кадров, время видео считается относительно неё, и номер за её пределами
        упирался в потолок. На последнем клипе «Долины» разница была не видна
        (весь план — один и тот же герой), а на «Офисе» панч висит 1.4 c, и в
        концовке замирал кадр из середины бита. Теперь клип обрезан так, что его
        нулевой кадр И ЕСТЬ последний, а `<Freeze frame={0}>` его держит. */}
    <Freeze frame={0}>
      <OffthreadVideo
        src={staticFile(clip.file)}
        trimBefore={clip.durationInFrames - 1}
        volume={0}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "brightness(1.06) contrast(1.06) saturate(1.1)",
        }}
      />
    </Freeze>
  </AbsoluteFill>
);

export const ValleyAuction: React.FC<ValleyAuctionProps> = ({
  clips,
  accent,
  showCaptions,
  videoScale,
  videoShiftY,
  outroFrames,
  subscribeLabel,
  musicFile,
  musicVolume,
  musicPeakVolume,
}) => {
  const { durationInFrames } = useVideoConfig();
  let cursor = 0;
  const totalClipFrames = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
  const lastClip = clips[clips.length - 1];
  const showOutro = outroFrames > 0 && lastClip !== undefined;

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
            />
          </Sequence>
        );
      })}

      {/* Музыка идёт под оригинальной дорожкой и потому держится тихо: её
          задача — не звучать, а не дать сцене провалиться в паузах, которых у
          Питера Грегори много. К последнему кадру монтажа громкость подводится
          вверх, а в концовке уходит в ноль, чтобы не спорить со звоном
          колокольчика. */}
      {musicFile ? (
        <Audio
          src={staticFile(musicFile)}
          loop
          volume={(f) =>
            interpolate(
              f,
              [
                0,
                24,
                Math.max(Math.round(totalClipFrames * 0.55), 25),
                Math.max(totalClipFrames - 1, 26),
                durationInFrames,
              ],
              [0, musicVolume, musicVolume, musicPeakVolume, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      ) : null}

      {showOutro ? (
        <Sequence
          from={totalClipFrames}
          durationInFrames={outroFrames}
          name="outro"
        >
          <SubscribeOutro label={subscribeLabel}>
            <FrozenLastFrame
              clip={lastClip}
              videoScale={videoScale}
              videoShiftY={videoShiftY}
            />
          </SubscribeOutro>
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

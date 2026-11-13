import "./index.css";
import React from "react";
import { Composition, Still, staticFile, type CalculateMetadataFunction } from "remotion";
import { FORMAT, seconds } from "./lib/format";
import { LaosStyle, LAOS_STYLE_FRAMES } from "./compositions/LaosVisa/LaosStyle";
import { LaosThumb } from "./compositions/LaosVisa/LaosThumb";
import { LaosVisa, type LaosVisaProps, type Timeline as LaosTimeline } from "./compositions/LaosVisa/LaosVisa";
import { KineticText } from "./compositions/KineticText/KineticText";
import { CaptionedVideo } from "./compositions/CaptionedVideo/CaptionedVideo";
import { PixiScene } from "./compositions/PixiScene/PixiScene";
import { CodeReveal } from "./compositions/CodeReveal/CodeReveal";
import { DataChart } from "./compositions/DataChart/DataChart";
import { MatrixRain } from "./compositions/MatrixRain/MatrixRain";
import { ReactTodoLesson } from "./compositions/ReactTodoLesson/ReactTodoLesson";
import { PhysicsScene } from "./compositions/PhysicsScene/PhysicsScene";
import { ShellEject } from "./compositions/ShellEject/ShellEject";
import { TunnelRush } from "./compositions/TunnelRush/TunnelRush";
import { JuniorKumite, type Clip } from "./compositions/JuniorKumite/JuniorKumite";
import {
  ValleyAuction,
  type Clip as ValleyClip,
  type ValleyAuctionProps,
} from "./compositions/ValleyAuction/ValleyAuction";
import { FPS as VALLEY_FPS } from "./compositions/ValleyAuction/script";
import { FPS as ASSHOLE_FPS } from "./compositions/ValleyAsshole/script";
import { FPS as CICADAS_FPS } from "./compositions/ValleyCicadas/script";
import { FPS as FISH_FPS } from "./compositions/ValleyFish/script";
import { FPS as SCRUM_FPS } from "./compositions/ValleyScrum/script";
import { FPS as MURAL_FPS } from "./compositions/ValleyMural/script";
import { FPS as KID_FPS } from "./compositions/ValleyKid/script";
import { FPS as MIDDLE_FPS } from "./compositions/ValleyMiddleOut/script";
import { FPS as CODE_FPS } from "./compositions/ValleyCode/script";
import { FPS as OFFICE_FPS } from "./compositions/OfficeMufasa/script";
import { FPS as PENCIL_FPS } from "./compositions/OfficePencil/script";
import { FPS as RIDDLES_FPS } from "./compositions/OfficeRiddles/script";
import { FPS as KURTA_FPS } from "./compositions/OfficeKurta/script";
import { FPS as DIWALI_FPS } from "./compositions/OfficeDiwaliSong/script";
import { FPS as RUDE_FPS } from "./compositions/ValleyRude/script";
import { FPS as HIPPO_FPS } from "./compositions/ValleyHippo/script";
import { FPS as LAURIE_FPS } from "./compositions/ValleyLaurie/script";
import { FPS as REVENUE_FPS } from "./compositions/ValleyRevenue/script";
import { FPS as BRO_FPS } from "./compositions/ValleyBro/script";
import { FPS as BALLS_FPS } from "./compositions/ValleyBalls/script";
import { FPS as RUSS_FPS } from "./compositions/ValleyRuss/script";
import {
  BeekeeperKong,
  TITLE_CARD_FRAMES,
  type Clip as BeekeeperClip,
} from "./compositions/BeekeeperKong/BeekeeperKong";
import {
  StethamTales,
  type Clip as StethamClip,
  type Phrase as StethamPhrase,
} from "./compositions/StethamTales/StethamTales";
import { Whiteboard } from "./compositions/Whiteboard/Whiteboard";
import { whiteboardSchema, type WhiteboardSchema } from "./compositions/Whiteboard/schema";
import type { BoardManifest as WhiteboardManifest } from "./compositions/Whiteboard/types";
import { DiverBotAd } from "./compositions/DiverBotAd/DiverBotAd";
import { diverBotAdSchema, type DiverBotAdSchema } from "./compositions/DiverBotAd/schema";
import {
  SpaceFlightShort,
  type SpaceFlightShortProps,
} from "./compositions/SpaceFlightShort/SpaceFlightShort";
import type { GameCutManifest } from "./compositions/SpaceFlightShort/timeline";
import type { AdManifest } from "./compositions/DiverBotAd/types";
import {
  DogWalk,
  TOTAL_FRAMES as DOGWALK_FRAMES,
  type DogWalkProps,
  type VoPhrase,
} from "./compositions/DogWalk/DogWalk";
import {
  DogWalkRitchie,
  TOTAL_FRAMES as RITCHIE_FRAMES,
  type DogWalkRitchieProps,
  type VoPhrase as RitchieVoPhrase,
} from "./compositions/DogWalkRitchie/DogWalkRitchie";
import { VietnamLepota, totalFrames as lepotaFrames } from "./compositions/VietnamLepota/VietnamLepota";

/**
 * Общий загрузчик доски для всех композиций на рецепте Whiteboard: контуры
 * трассировки слишком объёмные, чтобы держать их в реестре, поэтому они
 * приезжают из board.json. Какого именно ролика — говорит проп `boardFile`.
 */
const loadBoard: CalculateMetadataFunction<WhiteboardSchema> = async ({ props }) => {
  const res = await fetch(staticFile(props.boardFile));
  if (!res.ok) {
    // Доска ещё не скомпилирована — композиция должна открываться в студии.
    return { durationInFrames: seconds(1), props };
  }
  const manifest = (await res.json()) as WhiteboardManifest;
  return {
    durationInFrames: Math.max(manifest.durationInFrames, 1),
    props: {
      ...props,
      elements: manifest.elements,
      camera: manifest.camera,
      // Клики появились позже манифестов первых роликов — у них поля нет.
      clicks: manifest.clicks ?? [],
      board: manifest.board,
      narrationFile: manifest.narrationFile,
      exitFrom: manifest.hand.exitFrom,
      exitFrames: manifest.hand.exitFrames,
    },
  };
};

/**
 * Таймлайн рекламного ролика приезжает из ad.json: там уже склеена речь и
 * посчитаны границы планов в кадрах. Длительность композиции — оттуда же,
 * поэтому переозвучка меняет хронометраж сама, без правок в реестре.
 */
const loadAd: CalculateMetadataFunction<DiverBotAdSchema> = async ({ props }) => {
  const res = await fetch(staticFile(props.adFile));
  if (!res.ok) {
    // Таймлайн ещё не собран — композиция обязана открываться в студии.
    return { durationInFrames: seconds(1), props };
  }
  const manifest = (await res.json()) as AdManifest;
  return {
    durationInFrames: Math.max(manifest.durationInFrames, 1),
    props: {
      ...props,
      narrationFile: manifest.narrationFile,
      phrases: manifest.phrases,
      shots: manifest.shots,
    },
  };
};

/**
 * Нарезки сериалов на компоненте ValleyAuction: клипы и длина — из clips.json,
 * который пишет `npm run cut`. Длина = сумма клипов + хвост концовки.
 */
const loadValleyClips: CalculateMetadataFunction<ValleyAuctionProps> = async ({ props }) => {
  const res = await fetch(staticFile(props.clipsFile));
  if (!res.ok) {
    // Клипы ещё не нарезаны — композиция обязана открываться в студии.
    return { durationInFrames: seconds(1), props };
  }
  const clips = (await res.json()) as ValleyClip[];
  const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
  return {
    durationInFrames: Math.max(total + props.outroFrames, 1),
    props: { ...props, clips },
  };
};

/** DogWalkVO: фразы закадра с длительностями — из vo.json, который пишет dogwalk-vo.py. */
const loadDogWalkVo: CalculateMetadataFunction<DogWalkProps> = async ({ props }) => {
  const res = await fetch(staticFile("clips/DogWalk/vo.json"));
  if (!res.ok) return { props };
  return { props: { ...props, vo: (await res.json()) as VoPhrase[] } };
};

/** DogWalkRitchie: закадр рассказчика из vo.json (`python scripts/dogwalk-vo.py DogWalkRitchie`). */
/** LaosVisa: таймлайн и длина — из `python scripts/laos-build.py`. */
const loadLaosTimeline: CalculateMetadataFunction<LaosVisaProps> = async ({ props }) => {
  const res = await fetch(staticFile("clips/LaosVisa/timeline.json"));
  if (!res.ok) return { durationInFrames: 60, props };
  const timeline = (await res.json()) as LaosTimeline;
  return { durationInFrames: timeline.frames, props: { ...props, timeline } };
};

const loadRitchieVo: CalculateMetadataFunction<DogWalkRitchieProps> = async ({ props }) => {
  const res = await fetch(staticFile("clips/DogWalkRitchie/vo.json"));
  if (!res.ok) return { props };
  return { props: { ...props, vo: (await res.json()) as RitchieVoPhrase[] } };
};

/** SpaceFlightShort: таймлайн, длительность и fps — из манифеста `npm run gamecut`. */
const loadGameCut: CalculateMetadataFunction<SpaceFlightShortProps> = async ({ props }) => {
  const res = await fetch(staticFile(props.editFile));
  if (!res.ok) return { durationInFrames: 60, props };
  const edit = (await res.json()) as GameCutManifest;
  return { durationInFrames: edit.durationInFrames, fps: edit.fps, props: { ...props, edit } };
};

/**
 * Реестр композиций. Каждая — самостоятельный «рецепт» под свой тип ролика.
 * Все композиции вертикальные (1080×1920, 30fps) через общий FORMAT.
 *
 * Как добавить свою: создайте компонент в src/compositions/<Имя>/ и
 * зарегистрируйте <Composition/> здесь. Подробности — в CLAUDE.md.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="KineticText"
        component={KineticText}
        durationInFrames={seconds(6)}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          kicker: "Правило дня",
          words: ["Пиши", "видео", "как", "код"],
          accent: "#38bdf8",
          from: "#0f172a",
          to: "#1e3a8a",
        }}
      />

      <Composition
        id="CaptionedVideo"
        component={CaptionedVideo}
        durationInFrames={seconds(6)}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          captionsSrc: "captions.json",
          videoSrc: null,
          highlightColor: "#39E508",
        }}
      />

      <Composition
        id="PixiScene"
        component={PixiScene}
        durationInFrames={seconds(8)}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          count: 60,
          accent: "#f472b6",
          background: "#0b1020",
        }}
      />

      <Composition
        id="CodeReveal"
        component={CodeReveal}
        durationInFrames={seconds(8)}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          filename: "useCurrentFrame.ts",
          code: `const frame = useCurrentFrame();

const opacity = interpolate(
  frame,
  [0, 30],
  [0, 1],
);

// каждый кадр детерминирован`,
          charsPerSecond: 18,
          accent: "#38bdf8",
        }}
      />

      <Composition
        id="DataChart"
        component={DataChart}
        durationInFrames={seconds(7)}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          title: "Языки в проекте, %",
          bars: [
            { label: "TypeScript", value: 68 },
            { label: "CSS", value: 21 },
            { label: "Shell", value: 11 },
          ],
          accent: "#38bdf8",
        }}
      />

      {/* Обучающий кодинг-ролик: пишем Todo на React за 60 сек + караоке-комментарии. */}
      <Composition
        id="ReactTodoLesson"
        component={ReactTodoLesson}
        durationInFrames={seconds(60)}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          filename: "App.jsx",
          accent: "#38bdf8",
          // Трек лежит в public/music.mp3 (lo-fi из YouTube Audio Library).
          musicSrc: "music.mp3" as string | null,
        }}
      />

      {/* Премиум 3D «цифровой дождь» Матрицы: 60fps, 30 c, вертикаль. */}
      <Composition
        id="MatrixRain"
        component={MatrixRain}
        durationInFrames={1800}
        fps={60}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          title: "The Matrix Has You",
          headColor: "#d8ffe4",
          tailColor: "#00ff41",
        }}
      />

      {/* PoC-пайплайн физики: запечённая cannon-es-симуляция + облёт камеры.
          Запечь перед рендером: npm run bake (→ PhysicsScene/sim.json). */}
      <Composition
        id="PhysicsScene"
        component={PhysicsScene}
        durationInFrames={seconds(6)}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{}}
      />

      {/* Герой-сцена: выстрел + вылет гильз (запечённая физика cannon-es).
          Запечь перед рендером: npm run bake -- shells (→ ShellEject/sim.json). */}
      <Composition
        id="ShellEject"
        component={ShellEject}
        durationInFrames={seconds(5)}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{}}
      />

      {/* Полёт по трубе на полётной физике: 60fps, 45 c, вертикаль.
          Телеметрию полётного плана можно проверить без рендера: npm run flight */}
      <Composition
        id="TunnelRush"
        component={TunnelRush}
        durationInFrames={2700}
        fps={60}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          hook: "6.5 G in 45 seconds",
          taunt: "Feel that in your chest",
          outroTitle: "You made it",
          outroSub: "Barrel roll · 5G brake · full loop · Mach 1.3",
          neonA: "#22d3ee",
          neonB: "#a855f7",
          // Тёплый красно-янтарный вместо чистого красного: насыщенный красный
          // на весь кадр — главный раздражитель для светочувствительных.
          danger: "#ff6a3d",
          // Kevin MacLeod «Space Fighter Loop» (CC BY 4.0) — см. public/MUSIC-CREDITS.md.
          // null = тихий рендер.
          musicSrc: "tunnel-music.mp3" as string | null,
        }}
      />

      {/* Сквозная история из нарезки чужого фильма. Клипы режет
          `npm run cut -- JuniorKumite` по src/compositions/JuniorKumite/script.ts;
          длительность композиции считается из public/clips/JuniorKumite/clips.json. */}
      <Composition
        id="JuniorKumite"
        component={JuniorKumite}
        durationInFrames={seconds(60)}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as Clip[],
          accent: "#fbbf24",
          title: "Джун пришёл устраиваться на работу",
          // Караоке по словам нашей озвучки в нижней полосе кадра.
          showCaptions: true,
          // Кадрирование крутится в студии: правая панель props, ползунки
          // применяются к превью сразу. Подобранные значения сохраняются
          // кнопкой «Save» — она пишет их сюда, в defaultProps.
          videoScale: 1,
          videoShiftY: 0,
          bandStyle: "blur" as "blur" | "black",
          // Kevin MacLeod «Sneaky Snitch» (CC BY 4.0) — см. public/MUSIC-CREDITS.md.
          musicSrc: "comedy-music.mp3" as string | null,
          musicVolume: 0.1,
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile("clips/JuniorKumite/clips.json"));
          if (!res.ok) {
            // Клипы ещё не нарезаны — композиция должна открываться в студии.
            return { durationInFrames: seconds(1), props };
          }
          const clips = (await res.json()) as Clip[];
          const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
          return {
            durationInFrames: Math.max(total, 1),
            props: { ...props, clips },
          };
        }}
      />

      {/* «Кремниевая долина»: торги за стартап — одна сцена s01e01 с
          оригинальным звуком дубляжа и караоке по словам из индекса реплик.
          Одна сцена вместо компиляции держит досмотр: зритель ждёт, чем
          кончится торг, а не въезжает в новый контекст каждые четыре секунды.
          Сборка: `npm run cut -- ValleyAuction`; длительность — сумма клипов
          из public/clips/ValleyAuction/clips.json. */}
      <Composition
        id="ValleyAuction"
        component={ValleyAuction}
        durationInFrames={Math.round(53 * VALLEY_FPS)}
        fps={VALLEY_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/ValleyAuction/clips.json",
          accent: "#38e07b",
          showCaptions: true,
          videoScale: 1,
          // Кадр чуть выше центра: под ним живёт субтитр, и так они не спорят.
          videoShiftY: -70,
          // Ролик уже сдан без концовки — не трогаем.
          outroFrames: 0,
          subscribeLabel: "SUBSCRIBE",
          // Музыки в этом ролике нет: звучит только оригинальная дорожка.
          musicFile: "",
          musicVolume: 0,
          musicPeakVolume: 0,
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile(props.clipsFile));
          if (!res.ok) {
            return { durationInFrames: seconds(1), props };
          }
          const clips = (await res.json()) as ValleyClip[];
          const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
          return {
            durationInFrames: Math.max(total + props.outroFrames, 1),
            props: { ...props, clips },
          };
        }}
      />

      {/* «Кремниевая долина»: «стань мудаком» — сцена s01e02 «The Cap Table» с
          оригинальным звуком. Второй монтаж на компоненте ValleyAuction:
          развязка через проп `clipsFile`, поэтому на рецепте живёт сколько
          угодно нарезок — у каждой своя папка public/clips/<Композиция>/ и
          свой script.ts. Сборка: `npm run track -- ValleyAsshole` →
          `npm run cut -- ValleyAsshole`. */}
      <Composition
        id="ValleyAsshole"
        component={ValleyAuction}
        durationInFrames={Math.round(55 * ASSHOLE_FPS)}
        fps={ASSHOLE_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/ValleyAsshole/clips.json",
          accent: "#38e07b",
          showCaptions: true,
          videoScale: 1,
          videoShiftY: -70,
          // Реплика договаривается до последнего кадра сцены, поэтому призыв
          // подписаться живёт в хвосте на стоп-кадре: 60 кадров ≈ 2.5 с.
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          musicFile: "",
          musicVolume: 0,
          musicPeakVolume: 0,
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile(props.clipsFile));
          if (!res.ok) {
            return { durationInFrames: seconds(1), props };
          }
          const clips = (await res.json()) as ValleyClip[];
          const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
          return {
            durationInFrames: Math.max(total + props.outroFrames, 1),
            props: { ...props, clips },
          };
        }}
      />

      {/* «Кремниевая долина»: цикады — линия Питера Грегори из s01e03 «Articles
          of Incorporation», собранная из двух разнесённых по серии сцен: залипание
          на кунжутном зёрнышке и объяснение, как из него вышли 68 миллионов.
          Третий монтаж на компоненте ValleyAuction, и первый с музыкой: под
          оригинальной дорожкой тихо идёт трек, который подводит к панчу.
          Сборка: `npm run track -- ValleyCicadas` → `npm run cut -- ValleyCicadas`. */}
      <Composition
        id="ValleyCicadas"
        component={ValleyAuction}
        durationInFrames={Math.round(80 * CICADAS_FPS)}
        fps={CICADAS_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/ValleyCicadas/clips.json",
          accent: "#38e07b",
          showCaptions: true,
          videoScale: 1,
          // Ноль, а не -70 как у соседних нарезок: клип приезжает ровно
          // 1080x1920, и любой сдвиг открывает снизу чёрную полосу.
          videoShiftY: 0,
          // Панч договаривается до последнего кадра сцены, поэтому призыв
          // подписаться живёт в хвосте на стоп-кадре: 60 кадров ≈ 2.5 с.
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          musicFile: "cicadas-music.mp3",
          musicVolume: 0.07,
          musicPeakVolume: 0.14,
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile(props.clipsFile));
          if (!res.ok) {
            return { durationInFrames: seconds(1), props };
          }
          const clips = (await res.json()) as ValleyClip[];
          const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
          return {
            durationInFrames: Math.max(total + props.outroFrames, 1),
            props: { ...props, clips },
          };
        }}
      />

      {/* «Кремниевая долина»: «Я ем рыбу» — сцена s01e04 «Fiduciary Duties»,
          дебют Цзянь-Яна и первая его стычка с Эрлихом из-за рыбьих голов в
          раковине. Четвёртый монтаж на компоненте ValleyAuction. Самый короткий
          из нарезок (21 c): сцена держится на одном гэге и обрывается панчем,
          растягивать её нечем и незачем.
          Сборка: `npm run track -- ValleyFish` → `npm run cut -- ValleyFish`. */}
      <Composition
        id="ValleyFish"
        component={ValleyAuction}
        durationInFrames={Math.round(24 * FISH_FPS)}
        fps={FISH_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/ValleyFish/clips.json",
          accent: "#38e07b",
          showCaptions: true,
          videoScale: 1,
          // Ноль: клип приезжает ровно 1080x1920, любой сдвиг открыл бы снизу
          // чёрную полосу.
          videoShiftY: 0,
          // Панч — последняя реплика сцены, поэтому призыв подписаться живёт в
          // хвосте на стоп-кадре: 60 кадров ≈ 2.5 c.
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          musicFile: "fish-music.mp3",
          musicVolume: 0.07,
          musicPeakVolume: 0.14,
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile(props.clipsFile));
          if (!res.ok) {
            return { durationInFrames: seconds(1), props };
          }
          const clips = (await res.json()) as ValleyClip[];
          const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
          return {
            durationInFrames: Math.max(total + props.outroFrames, 1),
            props: { ...props, clips },
          };
        }}
      />

      {/* «Кремниевая долина»: «Скрам» — сцена s01e05 «Signaling Risk»: Джаред
          внедряет скрам и стравливает Динеша с Гилфойлом; те раскусывают приём
          и всё равно ведутся. Пятый монтаж на компоненте ValleyAuction.
          Ролик держится на крупных планах и заканчивается улыбкой Ричарда и
          Джареда — «система сработала».
          Сборка: `npm run track -- ValleyScrum` → `npm run cut -- ValleyScrum`. */}
      <Composition
        id="ValleyScrum"
        component={ValleyAuction}
        durationInFrames={Math.round(62 * SCRUM_FPS)}
        fps={SCRUM_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/ValleyScrum/clips.json",
          // Звук одной дорожкой: на стыках <Sequence> Remotion теряет 20–50 мс
          // звука клипов, слышно как провал на каждой склейке битов.
          audioFile: "clips/ValleyScrum/audio.m4a",
          accent: "#38e07b",
          showCaptions: true,
          videoScale: 1,
          // Ноль: клип приезжает ровно 1080x1920, любой сдвиг открыл бы снизу
          // чёрную полосу.
          videoShiftY: 0,
          // Панч — улыбка Ричарда и Джареда в последнем кадре сцены, поэтому
          // призыв подписаться живёт в хвосте на стоп-кадре: 60 кадров ≈ 2.5 c.
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          musicFile: "scrum-music.mp3",
          musicVolume: 0.07,
          musicPeakVolume: 0.14,
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile(props.clipsFile));
          if (!res.ok) {
            return { durationInFrames: seconds(1), props };
          }
          const clips = (await res.json()) as ValleyClip[];
          const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
          return {
            durationInFrames: Math.max(total + props.outroFrames, 1),
            props: { ...props, clips },
          };
        }}
      />

      {/* «Кремниевая долина»: «Картина» — финал s01e05: Гэвин Белсон в холле
          Hooli оценивает похабную картину Чуя, сотрудник с яблоком смотрит на
          неё пустым взглядом. Шестой монтаж на компоненте ValleyAuction, 19 c.
          Картина показана режимом `view` (на всю ширину, полосы размыты), пах
          на ней замазан `blur`. Без музыки — по просьбе пользователя.
          Сборка: `npm run track -- ValleyMural` → `npm run cut -- ValleyMural`. */}
      <Composition
        id="ValleyMural"
        component={ValleyAuction}
        durationInFrames={Math.round(22 * MURAL_FPS)}
        fps={MURAL_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/ValleyMural/clips.json",
          // Звук одной дорожкой: на стыках <Sequence> Remotion теряет 20–50 мс
          // звука клипов, слышно как провал на каждой склейке битов.
          audioFile: "clips/ValleyMural/audio.m4a",
          accent: "#38e07b",
          showCaptions: true,
          videoScale: 1,
          videoShiftY: 0,
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          // Без музыки: пустая строка, не null (иначе панель пропсов студии
          // молча исчезает).
          musicFile: "",
          musicVolume: 0,
          musicPeakVolume: 0,
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile(props.clipsFile));
          if (!res.ok) {
            return { durationInFrames: seconds(1), props };
          }
          const clips = (await res.json()) as ValleyClip[];
          const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
          return {
            durationInFrames: Math.max(total + props.outroFrames, 1),
            props: { ...props, clips },
          };
        }}
      />

      {/* «Кремниевая долина»: «Мелкий» — s01e06 «Third Party Insourcing»:
          ребёнок-дилер бьёт Ричарда и гонит прочь, Ричард плачет, Эрлих в
          халате идёт мстить — затрещина, велосипед в кусты, угрозы, «Пять
          штук, живо». Седьмой монтаж на компоненте ValleyAuction, 52 c, из двух
          разнесённых кусков серии (21:28 и 22:28). Музыка «Mischief Maker».
          Сборка: `npm run track -- ValleyKid` → `npm run cut -- ValleyKid`. */}
      <Composition
        id="ValleyKid"
        component={ValleyAuction}
        durationInFrames={Math.round(55 * KID_FPS)}
        fps={KID_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/ValleyKid/clips.json",
          // Звук одной дорожкой: на стыках <Sequence> Remotion теряет 20–50 мс
          // звука клипов, слышно как провал на каждой склейке битов. Здесь же
          // дорожка на 0.25 c длиннее монтажа: «Простите» договаривается под
          // стоп-кадром концовки (audioTail в script.ts).
          audioFile: "clips/ValleyKid/audio.m4a",
          accent: "#38e07b",
          showCaptions: true,
          videoScale: 1,
          // Ноль: клип приезжает ровно 1080x1920, любой сдвиг открыл бы снизу
          // чёрную полосу.
          videoShiftY: 0,
          // Панч — ребёнок убегает с криком «Простите» в последнем кадре сцены,
          // призыв подписаться живёт в хвосте на стоп-кадре: 60 кадров ≈ 2.5 c.
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          // Трек громче обычных (−15 дБ против −19), поэтому 0.05/0.10 вместо
          // 0.07/0.14 — см. public/MUSIC-CREDITS.md.
          musicFile: "kid-music.mp3",
          musicVolume: 0.05,
          musicPeakVolume: 0.1,
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile(props.clipsFile));
          if (!res.ok) {
            return { durationInFrames: seconds(1), props };
          }
          const clips = (await res.json()) as ValleyClip[];
          const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
          return {
            durationInFrames: Math.max(total + props.outroFrames, 1),
            props: { ...props, clips },
          };
        }}
      />

      {/* «Из центра наружу» — s01e08 «Optimal Tip-to-Tip Efficiency»: серьёзный
          расчёт, сколько времени нужно, чтобы подрочить всему залу, и рождённый
          из него алгоритм. Три куска серии (12:43, 21:13, 25:42). Музыка
          «Sneaky Snitch».
          Сборка: `npm run track -- ValleyMiddleOut` → `npm run cut -- ValleyMiddleOut`. */}
      <Composition
        id="ValleyMiddleOut"
        component={ValleyAuction}
        durationInFrames={Math.round(78 * MIDDLE_FPS)}
        fps={MIDDLE_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/ValleyMiddleOut/clips.json",
          // Звук одной дорожкой: на стыках <Sequence> Remotion теряет 20–50 мс
          // звука клипов.
          audioFile: "clips/ValleyMiddleOut/audio.m4a",
          accent: "#ffd23f",
          showCaptions: true,
          videoScale: 1,
          // Ноль: клип приезжает ровно 1080x1920, любой сдвиг открыл бы снизу
          // чёрную полосу.
          videoShiftY: 0,
          // Панч «И могу это доказать» договаривает до последнего кадра плана,
          // призыв подписаться живёт в хвосте на стоп-кадре: 60 кадров ≈ 2.5 c.
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          musicFile: "middle-music.mp3",
          musicVolume: 0.07,
          musicPeakVolume: 0.14,
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile(props.clipsFile));
          if (!res.ok) {
            return { durationInFrames: seconds(1), props };
          }
          const clips = (await res.json()) as ValleyClip[];
          const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
          return {
            durationInFrames: Math.max(total + props.outroFrames, 1),
            props: { ...props, clips },
          };
        }}
      />

      {/* Та же дорожка и те же субтитры, что у `ValleyMiddleOut`, но в кадре только
          планы с доской из серии: основной монтаж заблокирован Content ID.
          Сборка: `npm run cut -- ValleyMiddleOutBoard`. */}
      <Composition
        id="ValleyMiddleOutBoard"
        component={ValleyAuction}
        durationInFrames={Math.round(78 * MIDDLE_FPS)}
        fps={MIDDLE_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/ValleyMiddleOutBoard/clips.json",
          audioFile: "clips/ValleyMiddleOut/audio.m4a",
          accent: "#ffd23f",
          showCaptions: true,
          videoScale: 1,
          videoShiftY: 0,
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          musicFile: "middle-music.mp3",
          musicVolume: 0.07,
          musicPeakVolume: 0.14,
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile(props.clipsFile));
          if (!res.ok) {
            return { durationInFrames: seconds(1), props };
          }
          const clips = (await res.json()) as ValleyClip[];
          const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
          return {
            durationInFrames: Math.max(total + props.outroFrames, 1),
            props: { ...props, clips },
          };
        }}
      />

      {/* «Программный гей» — нарезка «Кремниевой долины» s01e07 на компоненте
          ValleyAuction: развязка через `clipsFile`, свой script.ts и своя папка
          public/clips/. Динеш влюбился в джава-метод девушки, а метод написал
          Гилфойл. Сборка: `npm run track -- ValleyCode` → `npm run cut -- ValleyCode`. */}
      <Composition
        id="ValleyCode"
        component={ValleyAuction}
        durationInFrames={Math.round(63 * CODE_FPS)}
        fps={CODE_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/ValleyCode/clips.json",
          audioFile: "clips/ValleyCode/audio.m4a",
          accent: "#38e07b",
          showCaptions: true,
          videoScale: 1,
          videoShiftY: 0,
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          // Тот же крадущийся джаз, что у ValleyScrum: та же пара героев, а
          // ValleyScrum на канале нет (блок HBO), трек зритель не слышал.
          musicFile: "scrum-music.mp3",
          musicVolume: 0.07,
          musicPeakVolume: 0.14,
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile(props.clipsFile));
          if (!res.ok) {
            return { durationInFrames: seconds(1), props };
          }
          const clips = (await res.json()) as ValleyClip[];
          const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
          return {
            durationInFrames: Math.max(total + props.outroFrames, 1),
            props: { ...props, clips },
          };
        }}
      />

      {/* «Мой кузен Муфаса» — нарезка «Офиса» s03e04 на компоненте ValleyAuction:
          развязка через `clipsFile`, свой script.ts и своя папка public/clips/.
          Сцена «кружка горя»: три истории, где сотрудники выдают сюжеты фильмов
          за свои трагедии. Первая нарезка проекта с музыкой поверх диалога —
          «Офис» держит долгие неловкие паузы, и в вертикали они провисают.
          Сборка: `npm run track -- OfficeMufasa` → `npm run cut -- OfficeMufasa`. */}
      <Composition
        id="OfficeMufasa"
        component={ValleyAuction}
        durationInFrames={Math.round(78 * OFFICE_FPS)}
        fps={OFFICE_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/OfficeMufasa/clips.json",
          accent: "#38e07b",
          showCaptions: true,
          videoScale: 1,
          // Ноль: клип приезжает ровно 1080x1920, любой сдвиг открыл бы снизу
          // чёрную полосу.
          videoShiftY: 0,
          // Панч — последняя реплика сцены, поэтому призыв подписаться живёт в
          // хвосте на стоп-кадре: 60 кадров ≈ 2.5 c.
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          // «Backbay Lounge»: из четырёх кандидатов у него самый большой разрыв
          // низ/речь (9.4 дБ) — ленивый контрабас держит паузы и не лезет в
          // голоса. У напрашивавшегося «Amazing Plan» разрыв −2.9: пиццикато
          // сидело бы ровно на репликах.
          musicFile: "office-music.mp3",
          musicVolume: 0.07,
          musicPeakVolume: 0.14,
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile(props.clipsFile));
          if (!res.ok) {
            return { durationInFrames: seconds(1), props };
          }
          const clips = (await res.json()) as ValleyClip[];
          const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
          return {
            durationInFrames: Math.max(total + props.outroFrames, 1),
            props: { ...props, clips },
          };
        }}
      />

      {/* «Карандаш со склада» — вторая нарезка «Офиса» s03e04 на том же
          компоненте: холодная открывашка про несуществующую лестницу. В отличие
          от OfficeMufasa сцена держится не на репликах, а на пантомиме, и почти
          все планы здесь общие — кадрирование в вертикаль расписано вручную
          почти во всех битах.
          Сборка: `npm run track -- OfficePencil` → `npm run cut -- OfficePencil`. */}
      <Composition
        id="OfficePencil"
        component={ValleyAuction}
        durationInFrames={Math.round(63 * PENCIL_FPS)}
        fps={PENCIL_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/OfficePencil/clips.json",
          accent: "#38e07b",
          showCaptions: true,
          videoScale: 1,
          videoShiftY: 0,
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          // «Life of Riley» — тот же трек, что у ValleyFish. Здесь он на месте:
          // половина ролика идёт без слов (спуск, ползание), и лёгкое укулеле
          // держит эти куски, не мешая репликам (разрыв низ/речь 6.1 дБ).
          musicFile: "fish-music.mp3",
          musicVolume: 0.08,
          musicPeakVolume: 0.15,
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile(props.clipsFile));
          if (!res.ok) {
            return { durationInFrames: seconds(1), props };
          }
          const clips = (await res.json()) as ValleyClip[];
          const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
          return {
            durationInFrames: Math.max(total + props.outroFrames, 1),
            props: { ...props, clips },
          };
        }}
      />

      {/* «Загадки» — холодная открывашка «Офиса» s03e05: Дуайт проверяет Райана
          загадками и проигрывает все четыре. Один бит, склейки ведёт ручной `pan`.
          Сборка: `npm run cut -- OfficeRiddles`. */}
      <Composition
        id="OfficeRiddles"
        component={ValleyAuction}
        durationInFrames={Math.round(37 * RIDDLES_FPS)}
        fps={RIDDLES_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/OfficeRiddles/clips.json",
          // Звук одной дорожкой: на стыках <Sequence> Remotion теряет 20–50 мс.
          audioFile: "clips/OfficeRiddles/audio.m4a",
          accent: "#ffd23f",
          showCaptions: true,
          videoScale: 1,
          // Клип приезжает ровно 1080x1920, сдвиг открыл бы чёрную полосу.
          videoShiftY: 0,
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          // «Thief in the Night» (Kevin MacLeod) — крадущийся джаз под дуэль
          // загадок; разрыв низ/речь 12.9 дБ, лучший из замеренных.
          musicFile: "scrum-music.mp3",
          musicVolume: 0.07,
          musicPeakVolume: 0.14,
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile(props.clipsFile));
          if (!res.ok) {
            return { durationInFrames: seconds(1), props };
          }
          const clips = (await res.json()) as ValleyClip[];
          const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
          return {
            durationInFrames: Math.max(total + props.outroFrames, 1),
            props: { ...props, clips },
          };
        }}
      />

      {/* «Курта» — холодная открывашка «Офиса» s03e06: «Классное платье, Райан»,
          «индусский Хэллоуин» и «А почему ты мне не принесла?».
          Сборка: `npm run cut -- OfficeKurta`. */}
      <Composition
        id="OfficeKurta"
        component={ValleyAuction}
        durationInFrames={Math.round(50 * KURTA_FPS)}
        fps={KURTA_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/OfficeKurta/clips.json",
          // Звук одной дорожкой: на стыках <Sequence> Remotion теряет 20–50 мс.
          audioFile: "clips/OfficeKurta/audio.m4a",
          accent: "#ff8a3d",
          showCaptions: true,
          videoScale: 1,
          // Клип приезжает ровно 1080x1920, сдвиг открыл бы чёрную полосу.
          videoShiftY: 0,
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          // «Desert City» (Kevin MacLeod) — восточный колорит под праздник,
          // разрыв низ/речь 13.5 дБ, лучший из замеренных. Под монологом Майкла
          // 27 c одним планом подложка держит паузы.
          musicFile: "kurta-music.mp3",
          musicVolume: 0.07,
          musicPeakVolume: 0.14,
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile(props.clipsFile));
          if (!res.ok) {
            return { durationInFrames: seconds(1), props };
          }
          const clips = (await res.json()) as ValleyClip[];
          const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
          return {
            durationInFrames: Math.max(total + props.outroFrames, 1),
            props: { ...props, clips },
          };
        }}
      />

      {/* «Песня про Дивали» — финальный тег «Офиса» s03e06, одним планом: Майкл
          поёт, Дуайт на гитаре, зал ликует. Самая популярная сцена серии (1.13 млн).
          Сборка: `npm run cut -- OfficeDiwaliSong`. */}
      <Composition
        id="OfficeDiwaliSong"
        component={ValleyAuction}
        durationInFrames={Math.round(79 * DIWALI_FPS)}
        fps={DIWALI_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/OfficeDiwaliSong/clips.json",
          // Звук одной дорожкой: на стыках <Sequence> Remotion теряет 20–50 мс.
          audioFile: "clips/OfficeDiwaliSong/audio.m4a",
          accent: "#ffb000",
          showCaptions: true,
          videoScale: 1,
          // Клип приезжает ровно 1080x1920, сдвиг открыл бы чёрную полосу.
          videoShiftY: 0,
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          // Без музыки: у сцены своя гитара.
          musicFile: "",
          musicVolume: 0,
          musicPeakVolume: 0,
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile(props.clipsFile));
          if (!res.ok) {
            return { durationInFrames: seconds(1), props };
          }
          const clips = (await res.json()) as ValleyClip[];
          const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
          return {
            durationInFrames: Math.max(total + props.outroFrames, 1),
            props: { ...props, clips },
          };
        }}
      />

      {/* «Хамство как стратегия» — «Кремниевая долина» s02e01: Эрлих хамит
          фондам (картина, рубашка, кексики), и Pied Piper оценивают в 75 млн.
          Сборка: `npm run track -- ValleyRude` → `npm run cut -- ValleyRude`. */}
      <Composition
        id="ValleyRude"
        component={ValleyAuction}
        durationInFrames={Math.round(70 * RUDE_FPS)}
        fps={RUDE_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/ValleyRude/clips.json",
          audioFile: "clips/ValleyRude/audio.m4a",
          accent: "#38e07b",
          showCaptions: true,
          videoScale: 1,
          videoShiftY: 0,
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          musicFile: "rude-music.mp3",
          musicVolume: 0.04,
          musicPeakVolume: 0.08,
        }}
        calculateMetadata={loadValleyClips}
      />

      {/* «Бегемот» — «Кремниевая долина» s02e01: Моника рассказывает, как умер
          Питер Грегори (сафари, бегемот, выстрел мимо — «он не бегал очень
          давно»). Вся сцена режимом `view`: двойной план в окно 0.32 не влезает.
          Сборка: `npm run cut -- ValleyHippo`. */}
      <Composition
        id="ValleyHippo"
        component={ValleyAuction}
        durationInFrames={Math.round(71 * HIPPO_FPS)}
        fps={HIPPO_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/ValleyHippo/clips.json",
          audioFile: "clips/ValleyHippo/audio.m4a",
          accent: "#38e07b",
          showCaptions: true,
          videoScale: 1,
          videoShiftY: 0,
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          // Кончается полосой `view` — кнопка в размытом поле сверху, не на лицах.
          subscribeCenterY: 0.14,
          musicFile: "hippo-music.mp3",
          musicVolume: 0.06,
          musicPeakVolume: 0.12,
        }}
        calculateMetadata={loadValleyClips}
      />

      {/* «Питер Грегори мёртв» — «Кремниевая долина» s02e01: Лори Брим не умеет
          общаться с людьми и трижды сообщает Монике новость, которую та знает.
          Сборка: `npm run track -- ValleyLaurie` → `npm run cut -- ValleyLaurie`. */}
      <Composition
        id="ValleyLaurie"
        component={ValleyAuction}
        durationInFrames={Math.round(66 * LAURIE_FPS)}
        fps={LAURIE_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/ValleyLaurie/clips.json",
          audioFile: "clips/ValleyLaurie/audio.m4a",
          accent: "#38e07b",
          showCaptions: true,
          videoScale: 1,
          videoShiftY: 0,
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          musicFile: "laurie-music.mp3",
          musicVolume: 0.06,
          musicPeakVolume: 0.12,
        }}
        calculateMetadata={loadValleyClips}
      />

      {/* «Прибыль никому не нужна» — «Кремниевая долина» s02e03: Расс Ханнеман
          объясняет, почему прибыль вредна, и «ОРВИ» — Радио В Интернет.
          Сборка: `npm run track -- ValleyRevenue` → `npm run cut -- ValleyRevenue`. */}
      <Composition
        id="ValleyRevenue"
        component={ValleyAuction}
        durationInFrames={Math.round(73 * REVENUE_FPS)}
        fps={REVENUE_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/ValleyRevenue/clips.json",
          audioFile: "clips/ValleyRevenue/audio.m4a",
          accent: "#38e07b",
          showCaptions: true,
          videoScale: 1,
          videoShiftY: 0,
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          musicFile: "revenue-music.mp3",
          musicVolume: 0.055,
          musicPeakVolume: 0.11,
        }}
        calculateMetadata={loadValleyClips}
      />

      {/* «Клёвый брат» — «Кремниевая долина» s02e02: Динеш «всегда был клёвым братом»,
          Гилфойл выясняет, в чём это выражалось.
          Сборка: `npm run track -- ValleyBro` → `npm run cut -- ValleyBro`. */}
      <Composition
        id="ValleyBro"
        component={ValleyAuction}
        durationInFrames={Math.round(73 * BRO_FPS)}
        fps={BRO_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/ValleyBro/clips.json",
          audioFile: "clips/ValleyBro/audio.m4a",
          accent: "#38e07b",
          showCaptions: true,
          videoScale: 1,
          videoShiftY: 0,
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          musicFile: "bro-music.mp3",
          musicVolume: 0.1,
          musicPeakVolume: 0.2,
        }}
        calculateMetadata={loadValleyClips}
      />

      {/* «Моя очередь» — «Кремниевая долина» s02e02: инвестор дослушивает извинения
          Эрлиха и отвечает тем же, что тот сделал у него на столе.
          Сборка: `npm run track -- ValleyBalls` → `npm run cut -- ValleyBalls`. */}
      <Composition
        id="ValleyBalls"
        component={ValleyAuction}
        durationInFrames={Math.round(57 * BALLS_FPS)}
        fps={BALLS_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/ValleyBalls/clips.json",
          audioFile: "clips/ValleyBalls/audio.m4a",
          accent: "#38e07b",
          showCaptions: true,
          videoScale: 1,
          videoShiftY: 0,
          // Хвост на 3 c: панч «Пожалуйста, не надо» звучит под стоп-кадром (audioTail).
          outroFrames: 72,
          subscribeLabel: "SUBSCRIBE",
          // Кончается полосой `view` — кнопка в размытом поле сверху, не на лицах.
          subscribeCenterY: 0.14,
          musicFile: "balls-music.mp3",
          musicVolume: 0.05,
          musicPeakVolume: 0.1,
        }}
        calculateMetadata={loadValleyClips}
      />

      {/* «Вся ебля его» — «Кремниевая долина» s02e03: Расс Ханнеман вваливается к
          ребятам, чек-«декорация» и ответ Эрлиха в финале.
          Сборка: `npm run track -- ValleyRuss` → `npm run cut -- ValleyRuss`. */}
      <Composition
        id="ValleyRuss"
        component={ValleyAuction}
        durationInFrames={Math.round(75 * RUSS_FPS)}
        fps={RUSS_FPS}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as ValleyClip[],
          clipsFile: "clips/ValleyRuss/clips.json",
          audioFile: "clips/ValleyRuss/audio.m4a",
          accent: "#38e07b",
          showCaptions: true,
          videoScale: 1,
          videoShiftY: 0,
          outroFrames: 60,
          subscribeLabel: "SUBSCRIBE",
          musicFile: "russ-music.mp3",
          musicVolume: 0.055,
          musicPeakVolume: 0.11,
        }}
        calculateMetadata={loadValleyClips}
      />

      {/* «Пчеловод 3: Опекунство» — смешной перевод на кадрах ДВУХ фильмов
          («Годзилла и Конг» + «Пчеловод»). Сборка:
          `npm run vo -- BeekeeperKong` → `npm run cut -- BeekeeperKong`;
          длительность = сумма клипов + кадры титульной плашки. */}
      <Composition
        id="BeekeeperKong"
        component={BeekeeperKong}
        durationInFrames={seconds(60)}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as BeekeeperClip[],
          accent: "#fbbf24",
          title: "Стетхем воспитывает титанов",
          showCaptions: true,
          // Исходники 2.39:1 — шире, чем 1.85:1 у «Кровавого спорта», поэтому
          // при videoScale 1 кадр занимал бы лишь ~40 % вертикали. 1.35 доводит
          // его до ~55 %: лица читаются, полосы под текст остаются.
          videoScale: 1.35,
          videoShiftY: 0,
          bandStyle: "blur" as "blur" | "black",
          // Псевдо-мудрость про арифметику ошибок — уходит в ч/б с бас-дропом.
          bwBeats: ["b16"],
          // Повисшая пауза после первого панча.
          cricketBeats: ["b08"],
          titleCardAfter: "b27",
          titleCardMain: "Пчеловод 3",
          titleCardSub: "Опекунство",
          stingerText: "А ульи теперь возят они",
          // Kevin MacLeod «Volatile Reaction» (CC BY 4.0) — см. public/MUSIC-CREDITS.md.
          musicSrc: "phonk-heavy.mp3" as string | null,
          musicVolume: 0.12,
          musicFinaleVolume: 0.5,
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile("clips/BeekeeperKong/clips.json"));
          if (!res.ok) {
            // Клипы ещё не нарезаны — композиция должна открываться в студии.
            return { durationInFrames: seconds(1), props };
          }
          const clips = (await res.json()) as BeekeeperClip[];
          const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
          const hasTitleCard = clips.some((c) => c.id === props.titleCardAfter);
          return {
            durationInFrames: Math.max(total + (hasTitleCard ? TITLE_CARD_FRAMES : 0), 1),
            props: { ...props, clips },
          };
        }}
      />

      {/* «Стетхем поясняет монстрам за пасеку» — закадровый монолог поверх кадров
          двух фильмов. Готовится: `npm run vo -- StethamTales` →
          `npm run broll -- StethamTales`; длительность и тайминги слов целиком
          приезжают из broll.json, руками ничего считать не нужно. */}
      <Composition
        id="StethamTales"
        component={StethamTales}
        durationInFrames={seconds(70)}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{
          clips: [] as StethamClip[],
          phrases: [] as StethamPhrase[],
          narrationFile: "vo/StethamTales/narration.m4a",
          accent: "#fbbf24",
          title: "Пчеловод против титанов",
          showCaptions: true,
          // Те же 2.39:1, что и в BeekeeperKong: 1.35 доводит кадр до ~55 %
          // вертикали — лица читаются, полосы под текст остаются.
          videoScale: 1.35,
          videoShiftY: 0,
          bandStyle: "blur" as "blur" | "black",
          // С этой фразы («отмудохал я их по-пацански») блюз сменяется фонком.
          finalePhrase: "n20",
          // Kevin MacLeod, CC BY 4.0 — см. public/MUSIC-CREDITS.md.
          musicSrc: "blues-calm.mp3" as string | null,
          finaleMusicSrc: "phonk-heavy.mp3" as string | null,
          musicVolume: 0.16,
          finaleMusicVolume: 0.42,
          outroMain: "Важно, что у тебя есть ноги",
          outroCta: "Подписывайся",
        }}
        calculateMetadata={async ({ props }) => {
          const res = await fetch(staticFile("clips/StethamTales/broll.json"));
          if (!res.ok) {
            // Планы ещё не нарезаны — композиция должна открываться в студии.
            return { durationInFrames: seconds(1), props };
          }
          const manifest = (await res.json()) as {
            narrationFile: string;
            durationInFrames: number;
            clips: StethamClip[];
            phrases: StethamPhrase[];
          };
          return {
            durationInFrames: Math.max(manifest.durationInFrames, 1),
            props: {
              ...props,
              clips: manifest.clips,
              phrases: manifest.phrases,
              narrationFile: manifest.narrationFile,
            },
          };
        }}
      />

      {/*
        Доска VideoScribe/Doodly. Растровый line-art проявляется через маску,
        штрихи которой обводят контуры рисунка (potrace, scripts/lib/artwork.ts),
        и по ним же едет рука. Данные приезжают из board.json — контуры
        трассировки слишком объёмные, чтобы держать их в реестре.
      */}
      <Composition
        id="Whiteboard"
        component={Whiteboard}
        durationInFrames={seconds(5)}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        schema={whiteboardSchema}
        // ВНИМАНИЕ: ни приведений типов (`as`), ни ссылок на константы, ни
        // арифметики внутри defaultProps. Всё это глушит редактор пропсов в
        // студии — правая панель просто перестаёт его показывать. Числа здесь
        // намеренно записаны литералами, даже там, где просился FORMAT.
        defaultProps={{
          paper: "#fbfbf7",
          boardFile: "clips/Whiteboard/board.json",
          handSrc: "whiteboard/hand/right-marker.png",
          handWidth: 620,
          handTipX: 0.282,
          handTipY: 0.454,
          handFlip: false,
          handTilt: 0,
          // Подёргивание кисти при письме — свойство РУКИ, а не текста: период
          // в кадрах, размах в пикселях доски, поэтому они одинаковы для любой
          // надписи, любого кегля и любой скорости появления. Скорость самого
          // текста задаётся отдельно — длительностью фразы.
          //
          // Подобрано ползунками в студии. Эллипс 15×6.75 px за 7 кадров даёт
          // ~14.4 px/кадр против 4.3 без подёргивания: рука заметно работает,
          // но не размахивает. Для сравнения, на иллюстрациях перо идёт
          // 148–275 px/кадр — полностью догонять рисунок и не надо, письмо
          // физически медленнее размашистой обводки контура.
          handWobbleFrames: 7,
          handWobbleAmp: 15,
          // Финального клика перчаткой в этом ролике нет — пустой путь.
          gloveSrc: "",
          gloveWidth: 340,
          gloveTipX: 0.486,
          gloveTipY: 0.183,
          musicSrc: "whiteboard-music.mp3",
          musicVolume: 0.085,
          exitFrom: 0,
          exitFrames: 22,
          narrationFile: "",
          elements: [],
          camera: [],
          clicks: [],
          board: { width: 1080, height: 1920, screens: 1, screenStep: 1560 },
        }}
        calculateMetadata={loadBoard}
      />

      {/*
        Тот же рецепт доски на другом материале: англоязычный ролик про то, как
        брошенная ступень Falcon 9 пробила новый кратер в Луне (05.08.2026).
        Композиция отличается от Whiteboard ровно тремя вещами — своей папкой
        с иллюстрациями, своей озвучкой и своим board.json; компонент, схема и
        скрипты пайплайна общие.
      */}
      <Composition
        id="MoonScar"
        component={Whiteboard}
        durationInFrames={seconds(5)}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        schema={whiteboardSchema}
        // Те же правила, что и у Whiteboard выше: в defaultProps только литералы.
        defaultProps={{
          paper: "#fbfbf7",
          boardFile: "clips/MoonScar/board.json",
          handSrc: "whiteboard/hand/right-marker.png",
          handWidth: 620,
          handTipX: 0.282,
          handTipY: 0.454,
          handFlip: false,
          handTilt: 0,
          handWobbleFrames: 7,
          handWobbleAmp: 15,
          gloveSrc: "",
          gloveWidth: 340,
          gloveTipX: 0.486,
          gloveTipY: 0.183,
          musicSrc: "moonscar-music.mp3",
          musicVolume: 0.085,
          exitFrom: 0,
          exitFrames: 22,
          narrationFile: "",
          elements: [],
          camera: [],
          clicks: [],
          board: { width: 1080, height: 1920, screens: 1, screenStep: 1560 },
        }}
        calculateMetadata={loadBoard}
      />

      {/*
        Тот же рецепт доски, но рисунки РЕАЛИСТИЧНЫЕ КАРАНДАШНЫЕ: тон и
        растушёвка вместо плоского контура, залитый графитом фон у космических
        кадров, цвет ровно в трёх местах на весь ролик. Рисуется в две фазы
        (обводка → растушёвка), поэтому и рука здесь с карандашом, а не с
        маркером: инструмент в кадре должен уметь то, что появляется на бумаге.
      */}
      <Composition
        id="MoonStrike"
        component={Whiteboard}
        durationInFrames={seconds(5)}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        schema={whiteboardSchema}
        // Те же правила, что и выше: в defaultProps только литералы.
        defaultProps={{
          paper: "#fbfbf7",
          boardFile: "clips/MoonStrike/board.json",
          handSrc: "whiteboard/hand/right-pencil.png",
          handWidth: 620,
          // Кончик грифеля, найденный cutoutHand при генерации руки.
          handTipX: 0.245,
          handTipY: 0.514,
          handFlip: false,
          handTilt: 0,
          handWobbleFrames: 7,
          handWobbleAmp: 15,
          // Перчатка-курсор для финального клика по колокольчику. Кончик
          // указательного пальца найден cutoutHand при генерации.
          gloveSrc: "whiteboard/hand/glove-cursor.png",
          gloveWidth: 340,
          gloveTipX: 0.486,
          gloveTipY: 0.183,
          musicSrc: "moonstrike-music.mp3",
          musicVolume: 0.085,
          exitFrom: 0,
          exitFrames: 22,
          narrationFile: "",
          elements: [],
          camera: [],
          clicks: [],
          board: { width: 1080, height: 1920, screens: 1, screenStep: 1560 },
        }}
        calculateMetadata={loadBoard}
      />

      {/*
        Реклама продукта на его же материале: промо-видео сайта, живой захват
        мини-аппки и настоящая анимация цены и RSI с промо-страницы. Ролик
        строится на смене палитры — тёмная половина про пропущенное движение,
        светлая про продукт, — и музыка ломается ровно на вспышке.
      */}
      <Composition
        id="DiverBotAd"
        component={DiverBotAd}
        durationInFrames={seconds(5)}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        schema={diverBotAdSchema}
        // Как и у доски: в defaultProps только литералы, иначе панель пропсов
        // в студии молча пропадает.
        defaultProps={{
          adFile: "vo/DiverBotAd/ad.json",
          // ОБЕ половины на новых треках — и это вынужденно, а не для красоты.
          // Реплика про оффер осталась прежней (переозвучка упёрлась в квоту),
          // поэтому дорожка речи у этого монтажа совпадает с уже опубликованным
          // роликом секунда в секунду. Совпадения площадка ищет перцептивным
          // отпечатком, где аудио весит больше видео, так что развести две
          // публикации здесь может только музыка — значит, меняем её целиком.
          //
          // Треки подобраны замером полос, а не по названию. «Long Note Two»:
          // low −27.5 / high −71.5 дБ против −32.9 / −63.6 у прежней «Ossuary 6
          // - Air» — та же разреженная тревога, но громче в низах, отсюда
          // пониженная громкость. «Newer Wave»: −16.1 / −25.8 против −17.4 /
          // −28.5 у «Digital Lemonade» — та же яркость и ровность под голосом.
          musicDark: "diverbot-dark-2.mp3",
          musicLight: "diverbot-light-2.mp3",
          musicDarkVolume: 0.11,
          musicLightVolume: 0.1,
          alertVolume: 0.5,
          dropVolume: 0.35,
          tickVolume: 0.28,
          showCaptions: true,
          captionsOffFor: ["n12"],
          hookLines: ["ETH moved at 3:14 AM.", "You slept."],
          hookFrames: 72,
          narrationFile: "",
          phrases: [],
          shots: [],
        }}
        calculateMetadata={loadAd}
      />

      {/*
        Второй монтаж той же рекламы. Отдельная композиция, а не правка первой:
        путь к манифесту развязан пропом `adFile` — тем же приёмом, которым
        `MoonScar` переиспользует компонент `Whiteboard`, — поэтому оба ролика
        воспроизводимы одновременно и ни один не затирает другой.

        Чем отличается от `DiverBotAd`: открывается не часами, а падающей
        свечой, тёмная половина короче на один план, снята реплика про завтрак,
        свой хук и своя музыка. Это нужно не ради разнообразия — два почти
        одинаковых ролика на одном канале площадка считает дублем и режет охват
        второму.
      */}
      <Composition
        id="DiverBotAdCut"
        component={DiverBotAd}
        durationInFrames={seconds(5)}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        schema={diverBotAdSchema}
        defaultProps={{
          adFile: "vo/DiverBotAdCut/ad.json",
          // Здесь остаётся исходная пара треков, и новые не нужны: у этого
          // монтажа снята целая реплика, поэтому речь идёт другой длиной и все
          // границы после третьей секунды разъезжаются сами. От основного
          // ролика он отличается музыкой ровно потому, что тот ушёл на новую.
          musicDark: "diverbot-dark.mp3",
          musicLight: "diverbot-light.mp3",
          musicDarkVolume: 0.16,
          musicLightVolume: 0.11,
          alertVolume: 0.5,
          dropVolume: 0.35,
          tickVolume: 0.28,
          showCaptions: true,
          captionsOffFor: ["n12"],
          hookLines: ["This candle printed", "while you slept."],
          hookFrames: 72,
          narrationFile: "",
          phrases: [],
          shots: [],
        }}
        calculateMetadata={loadAd}
      />

      {/*
        Третий монтаж — под Reels и рекламу в Meta (09.11.2026). Монтаж как у
        `DiverBotAdCut`, но факты нынешнего продукта: семь инструментов, демо
        на сутки, без суммы в голосе. Разбор — в `DiverBotReel/script.ts`.
        Субтитры идут на всех репликах: прятать на оффере больше нечего, цены
        в голосе нет.
      */}
      <Composition
        id="DiverBotReel"
        component={DiverBotAd}
        durationInFrames={seconds(5)}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        schema={diverBotAdSchema}
        defaultProps={{
          adFile: "vo/DiverBotReel/ad.json",
          musicDark: "diverbot-dark.mp3",
          musicLight: "diverbot-light.mp3",
          musicDarkVolume: 0.16,
          musicLightVolume: 0.11,
          alertVolume: 0.5,
          dropVolume: 0.35,
          tickVolume: 0.28,
          showCaptions: true,
          captionsOffFor: [],
          hookLines: ["This candle printed", "while you slept."],
          hookFrames: 72,
          narrationFile: "",
          phrases: [],
          shots: [],
        }}
        calculateMetadata={loadAd}
      />

      {/* Шортс по своей игре Space Flight: геймплей, снятый самой игрой на 60 к/с,
          монтаж в такт её музыке, панчи на ударах из лога событий. Сборка:
          `npm run gamecut -- SpaceFlightShort` → public/clips/SpaceFlightShort/
          (клипы, edit.json с таймлайном, audio.wav). Длительность и fps — из edit.json. */}
      <Composition
        id="SpaceFlightShort"
        component={SpaceFlightShort}
        durationInFrames={1215}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{
          editFile: "clips/SpaceFlightShort/edit.json",
          hookKicker: "I MADE A",
          hookBig: "SPACE SHOOTER",
          browserKicker: "THAT RUNS IN YOUR",
          browserBig: "BROWSER",
          challengeKicker: "CAN YOU",
          challengeBig: "BEAT IT?",
          ctaMain: "PLAY FREE",
          ctaSub: "LINK IN COMMENTS",
        }}
        calculateMetadata={loadGameCut}
      />

      {/* Шортс из своих съёмок: прогулка под дождём и уличные собаки Ницше и Дятел.
          Копии исходников режет `python scripts/dogwalk-prep.py` (монтажный лист
          edit.json), звуки — `python scripts/dogwalk-sfx.py`, всё в public/clips/DogWalk/.
          Две версии: без голоса и с закадром клона рассказчика (vo.json). */}
      <Composition
        id="DogWalk"
        component={DogWalk}
        durationInFrames={DOGWALK_FRAMES}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{ vo: [] }}
      />
      <Composition
        id="DogWalkVO"
        component={DogWalk}
        durationInFrames={DOGWALK_FRAMES}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{ vo: [] }}
        calculateMetadata={loadDogWalkVo}
      />

      {/* Та же прогулка криминальной комедией в духе Гая Ричи: рассказчик, грейд,
          стоп-кадры с представлением героев. Копии — `python scripts/dogwalk-prep.py
          DogWalkRitchie`, вырезка героев — PhotoCraft + `scripts/dogwalk-cutout.py`,
          звуки — `dogwalk-sfx.py DogWalkRitchie`, голос — `dogwalk-vo.py DogWalkRitchie`. */}
      <Composition
        id="DogWalkRitchie"
        component={DogWalkRitchie}
        durationInFrames={RITCHIE_FRAMES}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{ vo: [] }}
        calculateMetadata={loadRitchieVo}
      />

      {/* Мем «Красота-то какая! Лепота!» на Вьетнаме: виды → шашлык, 6.4 c по кругу;
          длинный монтаж ~21 c — та же фраза трижды. Монтаж — edit.json каждой композиции,
          копии — `python scripts/dogwalk-prep.py <Комп>`, звук — `python scripts/lepota-audio.py <Комп>`. */}
      <Composition
        id="VietnamLepota"
        component={VietnamLepota}
        durationInFrames={lepotaFrames("VietnamLepota")}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{ cut: "VietnamLepota" as const }}
      />
      <Composition
        id="VietnamLepotaLong"
        component={VietnamLepota}
        durationInFrames={lepotaFrames("VietnamLepotaLong")}
        fps={FORMAT.fps}
        width={FORMAT.width}
        height={FORMAT.height}
        defaultProps={{ cut: "VietnamLepotaLong" as const }}
      />
      {/* «Лаосская виза, или Новые приключения Павлика» — длинный горизонтальный ролик для @Tropinkin_travel.
          LaosStyle — доска стиля (9 приёмов по 4 c), сценарий: me/laos_journey_2/script.md. */}
      <Composition
        id="LaosVisa"
        component={LaosVisa}
        durationInFrames={60}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ timeline: null } as LaosVisaProps}
        calculateMetadata={loadLaosTimeline}
      />
      <Still id="LaosThumb" component={LaosThumb} width={1280} height={720} />
      <Composition id="LaosStyle" component={LaosStyle} durationInFrames={LAOS_STYLE_FRAMES} fps={30} width={1920} height={1080} />
    </>
  );
};

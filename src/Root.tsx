import "./index.css";
import React from "react";
import { Composition, staticFile, type CalculateMetadataFunction } from "remotion";
import { FORMAT, seconds } from "./lib/format";
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
    </>
  );
};

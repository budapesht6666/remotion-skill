import "./index.css";
import React from "react";
import { Composition } from "remotion";
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
    </>
  );
};

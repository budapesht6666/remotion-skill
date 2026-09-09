import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { SubscribeCta } from "./SubscribeCta";

/**
 * Хвост-концовка с кнопкой Subscribe: общий блок для всех роликов проекта.
 *
 * Зачем отдельный хвост, а не плашка поверх последней сцены: в хорошо собранном
 * шортсе последняя реплика договаривает до последнего кадра, и кнопка поверх
 * панча его убивает. Хвост отдаёт призыву свои ~2.5 с и ничего не ломает.
 *
 * Фон приходит снаружи (`children`) — это может быть стоп-кадр нарезки
 * (`<Freeze>` вокруг `<OffthreadVideo>`), последний экран доски, финальный кадр
 * 3D-сцены. Замерший кадр в ленте читается как зависшее видео, поэтому фон
 * медленно наезжает и темнеет. Наезд и затемнение считаются ЗДЕСЬ, снаружи
 * возможного `<Freeze>`: внутри него `useCurrentFrame()` заморожен.
 *
 * Длину хвоста берите из `subscribeOutroFrames(fps)` и прибавляйте к
 * длительности композиции (обычно в `calculateMetadata`).
 */

/** Столько длится концовка: успевает выезд кнопки, клик и звон. */
export const SUBSCRIBE_OUTRO_SECONDS = 2.5;

/** Длина хвоста в кадрах для текущего fps (нарезки кино идут на 23.976). */
export const subscribeOutroFrames = (fps: number): number =>
  Math.round(SUBSCRIBE_OUTRO_SECONDS * fps);

export type SubscribeOutroProps = {
  /** Фон хвоста: стоп-кадр, последний экран, что угодно. */
  children?: React.ReactNode;
  /** Подпись на кнопке. */
  label?: string;
  /** Громкость звона; 0 — беззвучно (например, если поверх играет музыка). */
  bellVolume?: number;
  /** До какой доли затемняется фон к концу хвоста. */
  dim?: number;
  /** Наезд на фон, доля масштаба в секунду: движение спасает стоп-кадр. */
  zoomPerSecond?: number;
  /** Верх кнопки, доля высоты кадра. */
  centerY?: number;
};

export const SubscribeOutro: React.FC<SubscribeOutroProps> = ({
  children,
  label = "SUBSCRIBE",
  bellVolume = 0.4,
  dim = 0.5,
  zoomPerSecond = 0.022,
  centerY = 0.45,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;

  const darkness = interpolate(time, [0, 0.6], [0, dim], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill style={{ transform: `scale(${1 + time * zoomPerSecond})` }}>
        {children}
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${darkness})` }} />
      <SubscribeCta label={label} centerY={centerY} bellVolume={bellVolume} />
    </AbsoluteFill>
  );
};

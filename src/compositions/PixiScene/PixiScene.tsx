import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Application, Container, Graphics } from "pixi.js";

export type PixiSceneProps = {
  /** Сколько частиц в сцене. */
  count: number;
  accent: string;
  background: string;
};

/**
 * РЕЦЕПТ: любая imperative canvas/WebGL-библиотека (Pixi, p5, plain canvas).
 *
 * ГЛАВНОЕ ПРАВИЛО: Pixi не должен крутить свой ticker (autoStart: false).
 * Состояние сцены на каждом кадре вычисляется ДЕТЕРМИНИРОВАННО из
 * useCurrentFrame(), после чего мы вызываем renderer.render() вручную.
 * Иначе в рендере будет мигание и рассинхрон.
 *
 * Для headless-рендера нужен WebGL через ANGLE — уже включено в remotion.config.ts
 * (Config.setChromiumOpenGlRenderer("angle")).
 */
export const PixiScene: React.FC<PixiSceneProps> = ({
  count,
  accent,
  background,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<Application | null>(null);
  const dotsRef = useRef<Graphics[]>([]);
  const [handle] = useState(() => delayRender("Инициализация Pixi"));
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();

  // Держим актуальный кадр в ref, чтобы рисовать текущий кадр в т.ч. сразу
  // после инициализации (важно для одиночного кадра / первого кадра рендера).
  const frameRef = useRef(frame);
  frameRef.current = frame;

  // Детерминированная отрисовка одного кадра из frameRef.
  const renderFrame = useCallback(() => {
    const app = appRef.current;
    const dots = dotsRef.current;
    if (!app || dots.length === 0) {
      return;
    }
    const t = frameRef.current / fps;
    dots.forEach((g, i) => {
      const angle = (i / dots.length) * Math.PI * 2 + t * 0.8;
      const radius = 260 + Math.sin(t * 2 + i * 0.5) * 140;
      g.x = width / 2 + Math.cos(angle) * radius;
      g.y = height / 2 + Math.sin(angle) * radius;
      const s = 0.5 + 0.5 * Math.abs(Math.sin(t * 3 + i));
      g.scale.set(s);
      g.alpha = 0.35 + 0.65 * s;
    });
    app.renderer.render(app.stage);
  }, [fps, width, height]);

  // Инициализация Pixi один раз. В v8 app.init() асинхронный, поэтому держим
  // рендер через delayRender, пока сцена не готова. КРИТИЧНО: рисуем текущий
  // кадр сразу после init — иначе для одиночного кадра (still/первый кадр)
  // renderer.render() не вызовется и скриншот будет чёрным.
  useEffect(() => {
    let disposed = false;
    const app = new Application();
    app
      .init({
        canvas: canvasRef.current!,
        width,
        height,
        background,
        antialias: true,
        autoStart: false,
        // Для headless-рендера: не очищаем буфер до скриншота.
        preference: "webgl",
        preserveDrawingBuffer: true,
      })
      .then(() => {
        if (disposed) {
          app.destroy();
          return;
        }
        const container = new Container();
        app.stage.addChild(container);
        const dots: Graphics[] = [];
        for (let i = 0; i < count; i++) {
          const g = new Graphics();
          g.circle(0, 0, 36).fill(accent);
          container.addChild(g);
          dots.push(g);
        }
        appRef.current = app;
        dotsRef.current = dots;
        renderFrame();
        continueRender(handle);
      })
      .catch((e) => cancelRender(e));

    return () => {
      disposed = true;
      appRef.current?.destroy();
      appRef.current = null;
      dotsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Каждый следующий кадр: пересчитываем позиции и рисуем синхронно до скриншота.
  useLayoutEffect(() => {
    renderFrame();
  }, [frame, renderFrame]);

  return (
    <AbsoluteFill style={{ backgroundColor: background }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
    </AbsoluteFill>
  );
};

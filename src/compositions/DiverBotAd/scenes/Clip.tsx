import React from "react";
import { AbsoluteFill, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND } from "../brand";
import type { AdShot } from "../types";

/**
 * Проигрыватель плана: кусок готового файла с кадрированием.
 *
 * Вся арифметика уже сделана на сборке (`npm run ad`), поэтому здесь нет ни
 * одного вычисления, зависящего от длины ассета: `trimBefore` и `playbackRate`
 * приезжают числами из манифеста. Это и есть условие, при котором превью в
 * студии и финальный рендер показывают одно и то же.
 */
export const Clip: React.FC<{ shot: AdShot; objectFit?: "cover" | "contain"; objectPosition?: string }> = ({
  shot,
  objectFit = "cover",
  objectPosition = "50% 50%",
}) => {
  const { fps } = useVideoConfig();
  if (!shot.media) return null;

  return (
    <OffthreadVideo
      src={staticFile(shot.media)}
      muted
      trimBefore={Math.round(shot.from * fps)}
      playbackRate={shot.speed}
      style={{
        width: "100%",
        height: "100%",
        objectFit,
        objectPosition,
        scale: shot.zoom,
        // Сдвиг в процентах от кадра, а не в пикселях: клипы приезжают разного
        // разрешения, и «сдвинуть на 100 px» означало бы у каждого своё.
        // panX = 1 уводит кадр ровно на половину ширины.
        translate: `${shot.panX * 50}% ${shot.panY * 50}%`,
      }}
    />
  );
};

/** Детерминированный шум: одно и то же зерно даёт одну и ту же картинку. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

type Candle = { open: number; close: number; high: number; low: number };

/**
 * Свечи, нарисованные кодом, — подложка тёмных кадров, пока не приехали клипы.
 *
 * Смысл не в том, чтобы «чем-то закрыть дыру»: ролик должен собираться и
 * выглядеть законченным в любой момент, иначе работа встаёт до последнего
 * ассета. Поэтому фон не абстрактный, а по теме кадра — рынок, который печатает
 * новый минимум, пока никто не смотрит. Когда придёт снятый клип, сцена
 * подменит подложку на него, и монтаж не поедет: длительность плана от этого
 * не зависит.
 *
 * Ряд строится один раз по зерну и не меняется во времени — во времени едет
 * только камера. Так фон остаётся фоном и не спорит с текстом.
 *
 * `box` и `count` нужны второму применению — стене панелей, где тот же рисунок
 * живёт в плитке 170×290, а не в кадре 1080×1920. Пропорции viewBox обязаны
 * совпасть с пропорциями контейнера: иначе SVG вписывается «по меньшей стороне»
 * и от графика остаётся тонкая полоска посреди черноты. Свечей в плитке нужно
 * меньше — шестьдесят четыре на 170 px по ширине сливаются в шум.
 */
export const NativeCandles: React.FC<{
  seed: number;
  drift?: number;
  /** Пропорции холста. По умолчанию — весь кадр композиции. */
  box?: { width: number; height: number };
  count?: number;
  opacity?: number;
}> = ({ seed, drift = 1, box, count = 64, opacity = 0.55 }) => {
  const frame = useCurrentFrame();
  const config = useVideoConfig();
  const durationInFrames = config.durationInFrames;
  const width = box?.width ?? config.width;
  const height = box?.height ?? config.height;

  const candles = React.useMemo<Candle[]>(() => {
    const rand = seeded(seed);
    const out: Candle[] = [];
    let price = 0.62;
    for (let i = 0; i < count; i += 1) {
      // Лёгкий нисходящий снос: кадр рассказывает про новый минимум, и ряд
      // обязан идти вниз, а не гулять вокруг середины.
      const step = (rand() - 0.56) * 0.045;
      const open = price;
      const close = Math.min(0.95, Math.max(0.05, price + step));
      out.push({
        open,
        close,
        high: Math.max(open, close) + rand() * 0.022,
        low: Math.min(open, close) - rand() * 0.022,
      });
      price = close;
    }

    // Растягиваем ряд на всю высоту холста. Без этого рисунок зависит от числа
    // свечей: случайное блуждание расходится примерно как корень из длины, и на
    // шестнадцати свечах вместо графика получается тонкая полоска у середины.
    // Нормализация линейная, поэтому форма и нисходящий характер сохраняются —
    // меняется только масштаб. Заодно исчезает magic number «амплитуда шага».
    const lo = Math.min(...out.map((c) => c.low));
    const hi = Math.max(...out.map((c) => c.high));
    const span = hi - lo || 1;
    const fit = (v: number) => 0.12 + ((v - lo) / span) * 0.76;
    return out.map((c) => ({
      open: fit(c.open),
      close: fit(c.close),
      high: fit(c.high),
      low: fit(c.low),
    }));
  }, [seed, count]);

  // Снос заметный: подложка обязана читаться движущейся сама по себе, иначе
  // на планах короче секунды тёмная половина выглядит серией стоп-кадров.
  // Ряд рисуется шире холста, и «камера» едет по нему вбок. Сдвиг задан в долях
  // ширины, а не в пикселях: в плитке 170 px и в кадре 1080 px одно и то же
  // число пикселей означало бы совершенно разную скорость.
  const shift = interpolate(frame, [0, durationInFrames], [0, -0.18 * width * drift]);
  const rise = interpolate(frame, [0, durationInFrames], [1.04, 1.13]);
  const step = (width * 1.6) / candles.length;
  const wick = Math.max(1, width / 540);

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.darkPaper }}>
      <svg
        viewBox={`0 0 ${width * 1.6} ${height}`}
        width="100%"
        height="100%"
        // Холст шире контейнера, и вписывать его целиком нельзя: «meet» оставил
        // бы поля сверху и снизу. Заполняем по большей стороне и обрезаем.
        preserveAspectRatio="xMidYMid slice"
        style={{ translate: `${shift}px 0px`, scale: rise, opacity }}
      >
        {candles.map((c, i) => {
          const x = i * step + step / 2;
          const bull = c.close >= c.open;
          const color = bull ? BRAND.bull : BRAND.bear;
          const y = (v: number) => height * (1 - v);
          return (
            <g key={i} opacity={0.5 + (i / candles.length) * 0.5}>
              <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth={wick} />
              <rect
                x={x - step * 0.3}
                width={step * 0.6}
                y={y(Math.max(c.open, c.close))}
                height={Math.max(wick * 1.5, Math.abs(y(c.open) - y(c.close)))}
                fill={color}
              />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

/**
 * Единый холод тёмной половины. Клипы из Gemini приедут разной температуры, и
 * без общего тонирующего слоя они рассыплются на набор чужих друг другу кадров.
 */
export const NightGrade: React.FC = () => (
  <>
    <AbsoluteFill style={{ backgroundColor: BRAND.darkTint, opacity: 0.42, mixBlendMode: "color" }} />
    <AbsoluteFill
      style={{
        background: `radial-gradient(72% 52% at 50% 42%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.72) 100%)`,
      }}
    />
  </>
);

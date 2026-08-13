import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND, EASE_OUT, RADIUS, TRACKING, TYPE, WEIGHT } from "../brand";
import { EVENTS } from "../events";
import { BRAND_FONT } from "../fonts";
import { NativeCandles } from "./Clip";

/**
 * Две сцены, которые рисует код, а не камера.
 *
 * Обе появились на месте клипов, которых не хватило по лимитам генерации, — но
 * остались и после, потому что оказались точнее снятого материала. Причина одна
 * и та же: обе реплики ПЕРЕЧИСЛЯЮТ, а перечисление невозможно снять. «Два
 * индикатора на четырёх таймфреймах и двух монетах» — это про количество, и
 * абстрактная стена экранов сообщает только «много»; настоящий ответ — показать,
 * как из двух получается тридцать шесть. «Девять типов событий» — это про
 * содержание, и вращающийся механизм не говорит о нём ничего, а девять
 * настоящих значков продукта говорят всё.
 */

/**
 * ПЕРЕГРУЗ: панелей становится столько, сколько их на самом деле.
 *
 * Сетка набирается по репликам диктора: сначала два индикатора, потом четыре
 * таймфрейма, потом две монеты — 2 × 4 × 2 = 36 панелей за четыре секунды.
 * Камера при этом отъезжает, поэтому кадр не «заполняется до края», а
 * проваливается вглубь: ощущение не «много окон», а «их больше, чем помещается
 * в голову». Ровно это и говорит реплика.
 *
 * Панели — те же нарисованные свечи, что служат подложкой остальным тёмным
 * планам, так что сцена не выпадает из половины по фактуре.
 */
export const ChartWallScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const cols = 6;
  const rows = 6;
  const total = cols * rows;

  // Панели зажигаются волной от центра: линейное «слева направо» читалось бы
  // как загрузка страницы, а не как нарастающий вал.
  const filled = interpolate(frame, [4, durationInFrames - 10], [1, total], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...EASE_OUT),
  });

  // Отъезд: начинаем почти вплотную к одной панели и уходим на всю сетку.
  const pull = interpolate(frame, [0, durationInFrames], [3.1, 1], {
    easing: Easing.bezier(...EASE_OUT),
  });

  const order = React.useMemo(() => {
    const cells = Array.from({ length: total }, (_, i) => ({
      i,
      // Расстояние от центра сетки — по нему и идёт волна.
      d: Math.hypot((i % cols) - (cols - 1) / 2, Math.floor(i / cols) - (rows - 1) / 2),
    }));
    cells.sort((a, b) => a.d - b.d);
    return cells.map((c) => c.i);
  }, [total]);

  const rank = React.useMemo(() => {
    const r = new Array<number>(total);
    order.forEach((cell, position) => (r[cell] = position));
    return r;
  }, [order, total]);

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.darkPaper }}>
      <AbsoluteFill
        style={{
          scale: pull,
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gap: 10,
          padding: 10,
        }}
      >
        {Array.from({ length: total }, (_, i) => {
          const appear = interpolate(filled, [rank[i], rank[i] + 4], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={i}
              style={{
                position: "relative",
                overflow: "hidden",
                borderRadius: RADIUS.sm,
                backgroundColor: BRAND.darkSurface,
                // Рамка обязательна: без неё панели сливаются в одно поле —
                // подложка плитки и фон кадра почти одного тона, — и сцена
                // читается как «один график», а не как «их тридцать шесть».
                border: "1px solid rgba(242, 242, 245, 0.09)",
                opacity: appear,
              }}
            >
              <NativeCandles
                seed={i * 131 + 7}
                drift={0.35}
                // Пропорции плитки, а не кадра, и вчетверо меньше свечей:
                // иначе график схлопывается в неразличимую полоску.
                box={{ width: 170, height: 290 }}
                count={16}
                opacity={0.85}
              />
            </div>
          );
        })}
      </AbsoluteFill>

      {/* Здесь нужна только виньетка, а не полный `NightGrade`: тот сводит
          снятые клипы к одной температуре, а сцена и так нарисована палитрой
          тёмной темы — его синий слой лишь погасил бы панели до черноты. */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(76% 56% at 50% 46%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * ДЕВЯТЬ СОБЫТИЙ: значки продукта, а не метафора продукта.
 *
 * Значки настоящие — те же контуры фосфора, которыми рисует лента сигналов и
 * секция событий сайта (см. `events.ts`). Поэтому сцена работает дважды: она
 * перечисляет то, о чём говорит диктор, и заранее знакомит зрителя с языком
 * интерфейса, в который он через десять секунд попадёт.
 *
 * Цвет здесь не украшение и подчиняется правилу дизайн-системы продукта:
 * зелёным и красным отмечены только те события, у которых есть направление
 * (`tone`), остальные шесть чёрные. Так же они выглядят и в аппке.
 */
export const EventGridScene: React.FC<{ overlay: string | null }> = ({ overlay }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const push = interpolate(frame, [0, durationInFrames], [1, 1.04], {
    easing: Easing.bezier(...EASE_OUT),
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND.paper,
        justifyContent: "center",
        alignItems: "center",
        paddingBottom: 300,
        scale: push,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 268px)",
          gap: 26,
        }}
      >
        {EVENTS.map((event, i) => {
          const start = 3 + i * 4;
          const t = interpolate(frame, [start, start + 16], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(...EASE_OUT),
          });
          const tone =
            event.tone === "bull" ? BRAND.bull : event.tone === "bear" ? BRAND.bear : BRAND.ink;

          return (
            <div
              key={event.id}
              style={{
                height: 268,
                border: `2px solid ${BRAND.border}`,
                borderRadius: RADIUS.md,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                opacity: t,
                scale: 0.9 + t * 0.1,
              }}
            >
              <span
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: RADIUS.pill,
                  backgroundColor: BRAND.surface,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg viewBox="0 0 256 256" width={52} height={52} fill={tone}>
                  {event.paths.map((d) => (
                    <path key={d} d={d} />
                  ))}
                </svg>
              </span>

              <span
                style={{
                  fontFamily: BRAND_FONT,
                  fontWeight: WEIGHT.medium,
                  fontSize: 25,
                  lineHeight: 1.2,
                  letterSpacing: TRACKING.heading,
                  color: BRAND.ink,
                }}
              >
                {event.title}
              </span>
            </div>
          );
        })}
      </div>

      {overlay ? <Counters text={overlay} /> : null}
    </AbsoluteFill>
  );
};

/** Счётчики «9 · 4 · 2 · 24/7» под сеткой: разряды набегают по одному. */
const Counters: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const parts = text.split("·").map((p) => p.trim());

  return (
    <div style={{ display: "flex", gap: 20, marginTop: 44 }}>
      {parts.map((part, i) => {
        const start = 46 + i * 6;
        const t = interpolate(frame, [start, start + 14], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(...EASE_OUT),
        });
        return (
          <span
            key={part}
            style={{
              fontFamily: BRAND_FONT,
              fontWeight: WEIGHT.semibold,
              fontSize: TYPE.h3,
              letterSpacing: TRACKING.heading,
              color: BRAND.ink,
              backgroundColor: BRAND.surface,
              borderRadius: RADIUS.pill,
              padding: "12px 28px",
              opacity: t,
              translate: `0px ${(1 - t) * 16}px`,
            }}
          >
            {part}
          </span>
        );
      })}
    </div>
  );
};

import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { BRAND, EASE_OUT, PRODUCT, RADIUS, TRACKING, TYPE, WEIGHT } from "../brand";
import { BRAND_FONT } from "../fonts";
import { Display, Eyebrow } from "./LightScenes";

/** Знак diverBot: две линии, расходящиеся из одной точки, — это и есть дивергенция. */
export const Mark: React.FC<{ size: number; color?: string }> = ({ size, color = BRAND.ink }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M4.5 12 20 4.5" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
    <path d="M4.5 12 20 19.5" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
  </svg>
);

/**
 * Сообщение бота в чате.
 *
 * Единственный собранный, а не снятый элемент ролика: живого клиента телеграма
 * headless-браузером не снять. Поэтому пузырь нарисован здесь, но **текст в нём
 * настоящий** — по каркасу из `diverBot/docs/ALERTS.md`: полоса, тип, таймфрейм,
 * монета, цена и стрелка одной первой строкой. Строка собрана так намеренно:
 * её одну показывают умные часы и превью уведомления, и ровно об этом говорит
 * закадровый текст на этом бите.
 *
 * Блок деталей ужат до трёх строк: в кадре 1080 px по ширине полная карточка
 * либо не читается, либо съедает весь экран. Всё, что показано, — из реального
 * сообщения, ничего не дорисовано.
 */
export const TelegramScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Сообщение прилетает: короткий выезд снизу с оседанием — так его показывает
  // сам телеграм, и подделывать другую механику незачем.
  const arrive = interpolate(frame, [4, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...EASE_OUT),
  });
  const tap = interpolate(frame, [46, 54, 62], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{ backgroundColor: BRAND.paper, justifyContent: "center", alignItems: "center" }}
    >
      {/* После прилёта сообщение медленно наезжает: без этого бит провисает
          почти двумя секундами полной статики ровно там, где ролик обещает
          мгновенность. */}
      <div
        style={{
          width: 900,
          opacity: arrive,
          translate: `0px ${(1 - arrive) * 60}px`,
          scale: interpolate(frame, [0, 78], [0.98, 1.04], {
            extrapolateRight: "clamp",
            easing: Easing.bezier(...EASE_OUT),
          }),
        }}
      >
        <div
          style={{
            backgroundColor: BRAND.surface,
            borderRadius: RADIUS.lg,
            padding: "38px 40px 30px",
            boxShadow: "0 24px 60px rgba(10, 10, 11, 0.1)",
          }}
        >
          {/* Шапка: всё главное одной строкой. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontFamily: BRAND_FONT,
              fontWeight: WEIGHT.semibold,
              fontSize: TYPE.body,
              letterSpacing: TRACKING.heading,
              color: BRAND.ink,
            }}
          >
            <span style={{ display: "flex", gap: 5 }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: BRAND.bull }}
                />
              ))}
            </span>
            <span>DIVERGENCE · 4h · ETH · 1 910.70</span>
            <span style={{ color: BRAND.bull }}>↑</span>
          </div>
          <div
            style={{
              fontFamily: BRAND_FONT,
              fontWeight: WEIGHT.regular,
              fontSize: TYPE.micro,
              color: BRAND.textMuted,
              marginTop: 8,
            }}
          >
            price at the moment of the signal
          </div>

          <div style={{ height: 1, backgroundColor: BRAND.border, margin: "26px 0" }} />

          {[
            ["low 1", "24 Jul 19:00 — 1 872.40"],
            ["RSI(6)", "31.40 → 54.01"],
            ["CMF(20)", "−0.14 → −0.05"],
          ].map(([label, value], i) => {
            const t = interpolate(frame, [18 + i * 5, 32 + i * 5], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: BRAND_FONT,
                  fontSize: TYPE.small,
                  color: BRAND.textMuted,
                  padding: "7px 0",
                  opacity: t,
                }}
              >
                <span>{label}</span>
                <span style={{ color: BRAND.ink, fontWeight: WEIGHT.medium }}>{value}</span>
              </div>
            );
          })}
        </div>

        {/* Кнопка под сообщением — вход в мини-аппку, следующая сцена ролика. */}
        <div
          style={{
            marginTop: 14,
            backgroundColor: BRAND.surface,
            borderRadius: RADIUS.md,
            padding: "24px 0",
            textAlign: "center",
            fontFamily: BRAND_FONT,
            fontWeight: WEIGHT.medium,
            fontSize: TYPE.small,
            color: "#2e7cd6",
            scale: 1 - tap * 0.02,
          }}
        >
          Open in the app
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * Оффер. Карточка повторяет секцию цен промо-сайта, но **без самой суммы**.
 *
 * Почему цены нет. На сайте она уместна: туда приходят читать условия. В
 * шортсе цифра платного финансового сервиса стоит на экране шесть секунд перед
 * холодной аудиторией — это лишний повод для ограничений площадки, а решение
 * зритель всё равно принимает не по ней, а по «первые три дня бесплатно».
 * Поэтому карточка ведёт пробным периодом, а сумма ждёт зрителя в боте.
 *
 * Дизайн-система продукта требовала, чтобы сумма не анимировалась («цена —
 * обещание, а не эффект»). Строка пробного периода унаследовала это правило:
 * она не набегает и не выезжает, а только подсвечивается — под фразу «Not
 * finding out later. First three days free» на втором плане бита.
 */
export const OfferScene: React.FC<{ highlightFrom: number | null }> = ({ highlightFrom }) => {
  const frame = useCurrentFrame();

  const enter = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...EASE_OUT),
  });
  // Подсветка приходит внутри того же плана, когда диктор доходит до трёх
  // бесплатных дней. План один на обе фразы намеренно: разбей его надвое —
  // и карточка размонтируется, проиграв вход заново посреди оффера.
  const glow =
    highlightFrom === null
      ? 0
      : interpolate(frame, [highlightFrom, highlightFrom + 14], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(...EASE_OUT),
        });

  // Оффер — самый длинный план ролика (шесть секунд) и стоит там, где зритель
  // решает, досматривать ли. Наезд общий и очень медленный: он оживляет кадр,
  // но не трогает содержимое карточки построчно.
  const push = interpolate(frame, [0, 186], [1, 1.035], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(...EASE_OUT),
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND.paper,
        alignItems: "center",
        paddingTop: 300,
        scale: push,
      }}
    >
      <div style={{ width: 900, display: "flex", flexDirection: "column", gap: 24 }}>
        <Eyebrow>Pricing</Eyebrow>
        <Display lines={["Only the alert is paid.", "Everything else is open."]} size={58} />
      </div>

      <div
        style={{
          width: 900,
          marginTop: 60,
          border: `2px solid ${BRAND.cta}`,
          borderRadius: RADIUS.lg,
          padding: "48px 52px",
          opacity: enter,
          translate: `0px ${(1 - enter) * 26}px`,
        }}
      >
        <div
          style={{
            fontFamily: BRAND_FONT,
            fontWeight: WEIGHT.medium,
            fontSize: TYPE.micro,
            letterSpacing: TRACKING.micro,
            textTransform: "uppercase",
            color: BRAND.textFaint,
          }}
        >
          Subscription
        </div>

        {/* Суммы на экране нет намеренно. Ролик уезжает на площадку, где
            демонстрация цены платного финансового сервиса — лишний повод для
            ограничений, а конверсию она здесь всё равно не делает: решение
            принимается на «первые три дня бесплатно», и до цены зритель
            доходит уже в боте. Карточку это не ломает — она держится рамкой,
            надзаголовком и строкой пробного периода, которая занимает
            освободившееся место сверху. */}

        {/* Подложка растёт вместе с подсветкой, а не появляется скачком:
            смена padding по булеву флагу дёрнула бы строку на 20 px в тот
            самый момент, когда на неё смотрят. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: 26,
            padding: `${14 * glow}px ${20 * glow}px`,
            marginLeft: -20 * glow,
            borderRadius: RADIUS.sm,
            backgroundColor: `rgba(8, 128, 69, ${0.1 * glow})`,
          }}
        >
          <Check />
          {/* Кегль на ступень выше остальных строк: убрав сумму, карточка
              осталась без якоря, и эта строка занимает его место. */}
          <span
            style={{
              fontFamily: BRAND_FONT,
              fontWeight: WEIGHT.semibold,
              fontSize: TYPE.lead,
              color: BRAND.ink,
            }}
          >
            First {PRODUCT.trialDays} days free, once per person
          </span>
        </div>

        <div style={{ height: 1, backgroundColor: BRAND.border, margin: "34px 0 28px" }} />

        {[
          "Alerts the moment an event fires",
          "All nine event types, all four timeframes",
          "BTC and ETH, analysed independently",
        ].map((row, i) => {
          const t = interpolate(frame, [10 + i * 6, 26 + i * 6], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={row}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "10px 0",
                opacity: t,
                fontFamily: BRAND_FONT,
                fontSize: TYPE.small,
                color: BRAND.textMuted,
              }}
            >
              <Check />
              {row}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Check: React.FC = () => (
  <svg viewBox="0 0 20 20" width={26} height={26} fill="none" style={{ flex: "none" }}>
    <circle cx="10" cy="10" r="9" stroke={BRAND.cta} strokeWidth="1.6" />
    <path d="M6 10.4l2.6 2.6L14 7.6" stroke={BRAND.cta} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/**
 * Финальная плашка. Здесь стоит единственная крупная заливка цветом на весь
 * ролик — зелёная кнопка, и это прямое следствие правила дизайн-системы
 * продукта: цвет означает действие. Всё, что было цветного до неё, — это данные
 * (рост, падение, расхождение), а не призыв.
 *
 * Дисклеймер набран мелко, но он обязателен: ровно он отличает честную рекламу
 * сигналов от обещания дохода, и он же дословно стоит в подвале сайта.
 */
export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();

  const mark = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...EASE_OUT),
  });
  const cta = interpolate(frame, [16, 34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...EASE_OUT),
  });
  const tail = interpolate(frame, [28, 46], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND.paper,
        justifyContent: "center",
        alignItems: "center",
        paddingBottom: 120,
        // Еле заметный наезд на холде: в ленте ролик крутится по кругу, и
        // застывший на две с половиной секунды финал читается как обрыв файла.
        scale: interpolate(frame, [0, 111], [1, 1.02], {
          extrapolateRight: "clamp",
          easing: Easing.bezier(...EASE_OUT),
        }),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 22,
          opacity: mark,
          scale: 0.94 + mark * 0.06,
        }}
      >
        <Mark size={92} />
        <span
          style={{
            fontFamily: BRAND_FONT,
            fontWeight: WEIGHT.semibold,
            fontSize: 84,
            letterSpacing: TRACKING.display,
            color: BRAND.ink,
          }}
        >
          {PRODUCT.name}
        </span>
      </div>

      <div
        style={{
          marginTop: 26,
          fontFamily: BRAND_FONT,
          fontWeight: WEIGHT.medium,
          fontSize: TYPE.micro,
          letterSpacing: TRACKING.micro,
          textTransform: "uppercase",
          color: BRAND.textFaint,
          opacity: mark,
        }}
      >
        Bybit · BTC &amp; ETH
      </div>

      <div
        style={{
          marginTop: 64,
          backgroundColor: BRAND.cta,
          color: BRAND.ctaInk,
          borderRadius: RADIUS.pill,
          padding: "30px 86px",
          fontFamily: BRAND_FONT,
          fontWeight: WEIGHT.medium,
          fontSize: TYPE.h3,
          letterSpacing: TRACKING.micro,
          textTransform: "uppercase",
          opacity: cta,
          scale: 0.92 + cta * 0.08,
        }}
      >
        Try free
      </div>

      <div
        style={{
          marginTop: 44,
          fontFamily: BRAND_FONT,
          fontWeight: WEIGHT.medium,
          fontSize: TYPE.lead,
          color: BRAND.ink,
          opacity: tail,
        }}
      >
        {PRODUCT.handle}
      </div>
      <div
        style={{
          marginTop: 10,
          fontFamily: BRAND_FONT,
          fontWeight: WEIGHT.regular,
          fontSize: TYPE.body,
          color: BRAND.textMuted,
          opacity: tail,
        }}
      >
        {PRODUCT.site}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 96,
          left: 90,
          right: 90,
          textAlign: "center",
          fontFamily: BRAND_FONT,
          fontWeight: WEIGHT.regular,
          fontSize: 20,
          lineHeight: 1.45,
          color: BRAND.textFaint,
          opacity: tail * 0.9,
        }}
      >
        {PRODUCT.disclaimer}
      </div>
    </AbsoluteFill>
  );
};

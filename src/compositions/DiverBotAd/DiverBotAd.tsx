import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND } from "./brand";
import type { DiverBotAdSchema } from "./schema";
import type { AdPhrase, AdShot } from "./types";
import { Captions } from "./scenes/Captions";
import { DarkScene, FlashScene } from "./scenes/DarkScenes";
import { AppScene, ChartScene, HeroScene } from "./scenes/LightScenes";
import { ChartWallScene, EventGridScene } from "./scenes/NativeScenes";
import { EndCard, OfferScene, TelegramScene } from "./scenes/ProductScenes";

/**
 * РЕКЛАМНЫЙ РОЛИК diverBot — «The market doesn't sleep. You can.»
 *
 * Вертикальный шортс на английском, который ведёт трафик в телеграм-бота и его
 * мини-аппку. Разбор идеи, ограничений по формулировкам и порядка сборки — в
 * `script.ts`; фирменный стиль и его правила — в `brand.ts`.
 *
 * ЧТО ЗДЕСЬ ПРОИСХОДИТ. Компонент ничего не считает: он выкладывает готовый
 * таймлайн из `ad.json`, который собрал `npm run ad`. Там уже склеена речь,
 * поделены длительности между планами и подогнана скорость захвата. Это не
 * педантизм: любое вычисление от длины аудио внутри рендера разъезжается между
 * превью в студии и финальным файлом, потому что аудио декодируется по-разному.
 *
 * СМЕНА ПАЛИТРЫ КАК СЮЖЕТ. Первая треть тёмная (вы проспали движение), дальше
 * вспышка от уведомления, дальше белый мир промо-сайта. Из этого следует всё
 * остальное: музыка ломается на том же кадре, субтитры переключают цвет, а
 * реальные захваты ложатся каждый в свою половину — тёмная тема мини-аппки в
 * тёмную, светлый промо-сайт в светлую.
 */
export const DiverBotAd: React.FC<DiverBotAdSchema> = ({
  narrationFile,
  phrases,
  shots,
  musicDark,
  musicLight,
  musicDarkVolume,
  musicLightVolume,
  alertVolume,
  dropVolume,
  tickVolume,
  showCaptions,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const list = shots as AdShot[];
  const lines = phrases as AdPhrase[];

  // Кадр стыка: до него мир тёмный, после — белый. Одна точка правды на всё,
  // что обязано переключиться вместе с палитрой.
  const flash = list.find((s) => s.scene === "flash");
  const flashFrame = flash ? flash.startFrame : 0;

  // Тёмный мир кончается не на границе плана, а на четвёртом кадре вспышки —
  // там, где фон уже стал белым. Считать по сцене нельзя: вспышка формально
  // «тёмный» план, и субтитр остался бы белым по белому почти на полторы
  // секунды, то есть исчез бы ровно на повороте ролика.
  const dark = frame < flashFrame + 4;

  return (
    <AbsoluteFill style={{ backgroundColor: dark ? BRAND.darkPaper : BRAND.paper }}>
      {list.map((shot) => (
        <Sequence
          key={shot.id}
          name={`${shot.scene} · ${shot.note ?? shot.line}`}
          from={shot.startFrame}
          durationInFrames={shot.durationInFrames}
        >
          <Scene shot={shot} secondPhraseFrame={secondPhraseFrame(shot, lines, fps)} />
        </Sequence>
      ))}

      {showCaptions ? <Captions phrases={lines} dark={dark} /> : null}

      {/* ─── Звук ─────────────────────────────────────────────────────────
          Речь идёт одной непрерывной дорожкой: она склеена на сборке, поэтому
          здесь ей не нужны ни секвенции, ни подрезка. */}
      {narrationFile ? <Audio src={staticFile(narrationFile)} /> : null}

      {/* Ход секундной стрелки в первом бите: три удара, дальше тишина —
          дальше говорит диктор, и тикать под ним значит спорить с ним. */}
      {tickVolume > 0
        ? [0, 1, 2].map((i) => (
            <Sequence key={i} name={`tick ${i + 1}`} from={i * fps} durationInFrames={fps}>
              <Audio src={staticFile("sfx/tick.mp3")} volume={tickVolume} />
            </Sequence>
          ))
        : null}

      {/* Стык: уведомление и бас-удар приходят вместе, на первом кадре вспышки. */}
      <Sequence name="alert" from={flashFrame} durationInFrames={Math.round(fps * 2)}>
        <Audio src={staticFile("sfx/alert.mp3")} volume={alertVolume} />
        <Audio src={staticFile("sfx/bass-drop.mp3")} volume={dropVolume} />
      </Sequence>

      {musicDark ? (
        <Sequence name="music · dark" durationInFrames={flashFrame + 6}>
          <Audio
            src={staticFile(musicDark)}
            volume={(f) =>
              interpolate(
                f,
                [0, fps, flashFrame - 8, flashFrame + 6],
                [0, musicDarkVolume, musicDarkVolume, 0],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              )
            }
          />
        </Sequence>
      ) : null}

      {musicLight ? (
        <Sequence name="music · light" from={flashFrame}>
          <Audio
            src={staticFile(musicLight)}
            volume={(f) => {
              const tail = durationInFrames - flashFrame;
              return interpolate(
                f,
                [0, Math.round(fps * 0.6), tail - Math.round(fps * 1.6), tail],
                [0, musicLightVolume, musicLightVolume, 0],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              );
            }}
          />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

/**
 * Кадр, на котором внутри плана начинается ЕГО ВТОРАЯ фраза (или null, если
 * план занимает одну). Нужен сценам, которые живут дольше одной реплики и
 * обязаны отреагировать на смену текста, не перезапускаясь: карточка оффера
 * подсвечивает строку про бесплатные дни ровно тогда, когда диктор о них
 * заговорил. Считается от данных, а не от доли длительности, — переозвучка
 * сдвинет подсветку сама.
 */
function secondPhraseFrame(shot: AdShot, phrases: AdPhrase[], fps: number): number | null {
  const index = phrases.findIndex((p) => p.id === shot.line);
  const next = index >= 0 ? phrases[index + 1] : undefined;
  if (!next) return null;
  const local = Math.round(next.start * fps) - shot.startFrame;
  return local > 0 && local < shot.durationInFrames ? local : null;
}

/**
 * Какой компонент рисует план. Развилка одна на весь ролик и живёт здесь, а не
 * в манифесте: сборщик знает про тайминги, но не должен знать про React.
 */
const Scene: React.FC<{ shot: AdShot; secondPhraseFrame: number | null }> = ({
  shot,
  secondPhraseFrame: highlightFrom,
}) => {
  switch (shot.scene) {
    case "dark":
      return <DarkScene shot={shot} index={Number(shot.id.slice(1, 3))} />;
    case "flash":
      return <FlashScene />;
    case "wall":
      return <ChartWallScene />;
    case "events":
      return <EventGridScene overlay={shot.overlay} />;
    case "hero":
      return <HeroScene shot={shot} />;
    case "chart":
      return <ChartScene shot={shot} />;
    case "app":
      return <AppScene shot={shot} />;
    case "telegram":
      return <TelegramScene />;
    case "offer":
      return <OfferScene highlightFrom={highlightFrom} />;
    case "end":
      return <EndCard />;
    default:
      return null;
  }
};

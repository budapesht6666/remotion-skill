import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption, TikTokPage } from "@remotion/captions";
import { interFamily as fontFamily } from "../../lib/fonts";
import { GradientBackground } from "../../components/GradientBackground";

// Каждая «страница» субтитров держится на экране не дольше этого времени.
const SWITCH_CAPTIONS_EVERY_MS = 1200;

export type CaptionedVideoProps = {
  /** Файл с субтитрами в public/. Формат — массив Caption[] (@remotion/captions). */
  captionsSrc: string;
  /** Необязательный видео-фон в public/. Если пусто — используется градиент. */
  videoSrc: string | null;
  highlightColor: string;
};

const CaptionPage: React.FC<{ page: TikTokPage; highlightColor: string }> = ({
  page,
  highlightColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;
  const absoluteMs = page.startMs + currentMs;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 480,
        paddingLeft: 64,
        paddingRight: 64,
      }}
    >
      <div
        style={{
          fontFamily,
          fontSize: 84,
          fontWeight: 800,
          textAlign: "center",
          lineHeight: 1.15,
          textShadow: "0 6px 24px rgba(0,0,0,0.55)",
          textWrap: "balance",
        }}
      >
        {page.tokens.map((token) => {
          const isActive =
            token.fromMs <= absoluteMs && token.toMs > absoluteMs;
          return (
            <span
              key={token.fromMs}
              style={{ color: isActive ? highlightColor : "white" }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/**
 * РЕЦЕПТ: faceless-ролик. Видео-фон + караоке-субтитры с подсветкой активного
 * слова по таймингам. Тайминги берутся из public/captions.json (его можно
 * написать руками или сгенерировать из аудио через @remotion/install-whisper-cpp).
 */
export const CaptionedVideo: React.FC<CaptionedVideoProps> = ({
  captionsSrc,
  videoSrc,
  highlightColor,
}) => {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const [handle] = useState(() => delayRender("Загрузка субтитров"));
  const { fps } = useVideoConfig();

  const fetchCaptions = useCallback(async () => {
    try {
      const res = await fetch(staticFile(captionsSrc));
      const data = (await res.json()) as Caption[];
      setCaptions(data);
      continueRender(handle);
    } catch (e) {
      cancelRender(e);
    }
  }, [captionsSrc, handle]);

  useEffect(() => {
    fetchCaptions();
  }, [fetchCaptions]);

  const { pages } = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions: captions ?? [],
        combineTokensWithinMilliseconds: SWITCH_CAPTIONS_EVERY_MS,
      }),
    [captions],
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {videoSrc ? (
        <OffthreadVideo src={staticFile(videoSrc)} muted />
      ) : (
        <GradientBackground from="#111827" to="#0b3b5a" />
      )}
      {/* Затемнение для читаемости субтитров */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      {pages.map((page, index) => {
        const nextPage = pages[index + 1] ?? null;
        const startFrame = (page.startMs / 1000) * fps;
        const endFrame = Math.min(
          nextPage ? (nextPage.startMs / 1000) * fps : Infinity,
          startFrame + (SWITCH_CAPTIONS_EVERY_MS / 1000) * fps,
        );
        const durationInFrames = endFrame - startFrame;
        if (durationInFrames <= 0) {
          return null;
        }
        return (
          <Sequence
            key={index}
            from={startFrame}
            durationInFrames={durationInFrames}
          >
            <CaptionPage page={page} highlightColor={highlightColor} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

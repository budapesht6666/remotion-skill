import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { monoFamily as fontFamily } from "../../lib/fonts";

export type CodeRevealProps = {
  filename: string;
  code: string;
  /** Скорость «печати», символов в секунду. */
  charsPerSecond: number;
  accent: string;
};

/**
 * РЕЦЕПТ: кодинг-ролик. Код «печатается» в окне-редакторе с курсором.
 *
 * Для настоящей подсветки синтаксиса подключите @remotion/shiki или shiki и
 * пред-токенизируйте код. Здесь — лёгкая версия без зависимостей: моноширинный
 * текст + курсор, детерминированно по кадру.
 *
 * Чтобы «показать, как рендерится сайт» — вставьте <iframe> с локальной
 * страницей из public/ (обернув загрузку в delayRender) или запись экрана через
 * <OffthreadVideo>. См. CLAUDE.md, раздел про кодинг-ролики.
 */
export const CodeReveal: React.FC<CodeRevealProps> = ({
  filename,
  code,
  charsPerSecond,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const windowIn = spring({ frame, fps, config: { damping: 200 } });
  const visibleChars = Math.floor((frame / fps) * charsPerSecond);
  const shown = code.slice(0, visibleChars);
  const isTyping = visibleChars < code.length;
  const caretOn = Math.floor(frame / 15) % 2 === 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0d1117",
        justifyContent: "center",
        alignItems: "center",
        padding: 64,
      }}
    >
      <div
        style={{
          width: "100%",
          borderRadius: 28,
          overflow: "hidden",
          boxShadow: "0 40px 120px rgba(0,0,0,0.6)",
          border: "1px solid #262b33",
          transform: `scale(${interpolate(windowIn, [0, 1], [0.9, 1])})`,
          opacity: windowIn,
        }}
      >
        {/* Заголовок окна с «светофором» */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "22px 28px",
            backgroundColor: "#161b22",
            borderBottom: "1px solid #262b33",
          }}
        >
          <span style={dot("#ff5f56")} />
          <span style={dot("#ffbd2e")} />
          <span style={dot("#27c93f")} />
          <span
            style={{
              marginLeft: 20,
              color: "#8b949e",
              fontFamily,
              fontSize: 30,
            }}
          >
            {filename}
          </span>
        </div>
        {/* Тело редактора */}
        <pre
          style={{
            margin: 0,
            padding: "36px 40px",
            backgroundColor: "#0d1117",
            color: "#c9d1d9",
            fontFamily,
            fontSize: 40,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            minHeight: 900,
          }}
        >
          {shown}
          <span
            style={{
              display: "inline-block",
              width: 18,
              height: 44,
              transform: "translateY(8px)",
              backgroundColor: accent,
              opacity: isTyping || caretOn ? 1 : 0,
            }}
          />
        </pre>
      </div>
    </AbsoluteFill>
  );
};

const dot = (color: string): React.CSSProperties => ({
  width: 26,
  height: 26,
  borderRadius: "50%",
  backgroundColor: color,
});

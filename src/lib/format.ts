/**
 * Единый вертикальный формат для Shorts / Reels / TikTok.
 * 1080×1920, 30fps — оптимально для локального рендера и качества на мобильных.
 */
export const FORMAT = {
  width: 1080,
  height: 1920,
  fps: 30,
} as const;

/** Перевод секунд в кадры при текущем fps. */
export const seconds = (s: number): number => Math.round(s * FORMAT.fps);

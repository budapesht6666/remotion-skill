import { z } from "zod";

/**
 * Схема пропсов доски — она включает редактор в правой панели студии
 * (`schema` у `<Composition>`), и параметры руки можно крутить без перерендера.
 *
 * Что ломает редактор, если про это забыть (проверено на этой композиции):
 *   • приведения типов `as` внутри `defaultProps`;
 *   • ссылки на константы (`FORMAT.width`) и любая арифметика там же;
 *   • спреды объектов.
 * Всё перечисленное глушит панель целиком — она просто перестаёт показываться,
 * без ошибки и предупреждения. Поэтому в `defaultProps` только литералы.
 *
 * Поля, которые заполняет `calculateMetadata` из `board.json`, описаны здесь
 * нарочито слабо (`z.array(z.any())`): править их руками нечего, они всё равно
 * будут перезаписаны при следующем `npm run board`, и подробная схема на сотни
 * контуров только замусорила бы панель.
 */
export const whiteboardSchema = z.object({
  // ─── доска ───────────────────────────────────────────────────────────
  paper: z.string(),
  /**
   * Путь к манифесту внутри public/, например «clips/MoonScar/board.json».
   * Именно он развязывает рецепт от одной композиции: компонент, схема и все
   * скрипты пайплайна общие, а роликов на доске может быть сколько угодно —
   * различаются они только своей папкой в public/clips.
   */
  boardFile: z.string(),

  // ─── рука ────────────────────────────────────────────────────────────
  /** Путь внутри public/. Пустая строка → векторный маркер вместо фото. */
  handSrc: z.string(),
  handWidth: z.number().min(120).max(1200),
  /** Где кончик маркера внутри картинки, в долях 0…1. */
  handTipX: z.number().min(0).max(1),
  handTipY: z.number().min(0).max(1),
  handFlip: z.boolean(),
  handTilt: z.number().min(-45).max(45),
  /** Период подёргивания при письме, кадры. 8 при 30fps ≈ 3.75 Гц. */
  handWobbleFrames: z.number().min(2).max(40),
  /** Размах подёргивания, px на доске. Ниже ~15 на кадре 1080 не видно. */
  handWobbleAmp: z.number().min(0).max(160),

  // ─── звук ────────────────────────────────────────────────────────────
  /** Пустая строка → без музыки. */
  musicSrc: z.string(),
  musicVolume: z.number().min(0).max(1),

  // ─── из board.json, руками не трогать ────────────────────────────────
  exitFrom: z.number(),
  exitFrames: z.number(),
  narrationFile: z.string(),
  elements: z.array(z.any()),
  camera: z.array(z.any()),
  board: z.object({
    width: z.number(),
    height: z.number(),
    screens: z.number(),
    screenStep: z.number(),
  }),
});

export type WhiteboardSchema = z.infer<typeof whiteboardSchema>;

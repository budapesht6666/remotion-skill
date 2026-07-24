// Атлас глифов + детерминированный ГПСЧ для поля «цифрового дождя».
// Всё синхронно и детерминировано — чтобы одиночный кадр (still) и полный
// рендер всегда совпадали.

/** Детерминированный ГПСЧ (mulberry32). Один seed → одинаковое поле каждый раз. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 54 полуширинных катаканы (канонические глифы «Матрицы») + 10 цифр = 64,
// ровно 8×8 ячеек атласа.
const KATAKANA = Array.from({ length: 54 }, (_, i) =>
  String.fromCharCode(0xff66 + i),
);
const DIGITS = "0123456789".split("");
export const GLYPHS = [...KATAKANA, ...DIGITS];
export const GLYPH_COUNT = GLYPHS.length; // 64
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 8;
const KATAKANA_COUNT = KATAKANA.length;

/**
 * Рисует все глифы в один канвас-атлас (белым по прозрачному) для CanvasTexture.
 * Катакана зеркалится по горизонтали — как в фильме; цифры не зеркалим.
 * Шрифт — системный моноширинный (на Windows это «MS Gothic», покрывает катакану).
 */
export function buildGlyphAtlasCanvas(cell = 64): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_COLS * cell;
  canvas.height = ATLAS_ROWS * cell;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(cell * 0.74)}px "MS Gothic", "Yu Gothic", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  GLYPHS.forEach((ch, i) => {
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    const cx = col * cell + cell / 2;
    const cy = row * cell + cell / 2;
    ctx.save();
    ctx.translate(cx, cy);
    if (i < KATAKANA_COUNT) {
      ctx.scale(-1, 1); // зеркалим катакану
    }
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  return canvas;
}

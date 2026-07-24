/**
 * Единая загрузка шрифтов. Грузим только нужные веса и субсеты (latin + cyrillic),
 * иначе @remotion/google-fonts тянет десятки файлов и замедляет рендер.
 */
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const { fontFamily: interFamily } = loadInter("normal", {
  weights: ["600", "700", "800"],
  subsets: ["latin", "cyrillic"],
});

export const { fontFamily: monoFamily } = loadMono("normal", {
  weights: ["400", "700"],
  subsets: ["latin", "cyrillic"],
});

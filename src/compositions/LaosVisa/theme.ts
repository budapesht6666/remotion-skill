/** Стиль «Лаосской визы»: палитра советской мультзаставки 60-х и шрифты с кириллицей. */
import { loadFont as loadKurale } from "@remotion/google-fonts/Kurale";
import { loadFont as loadNeucha } from "@remotion/google-fonts/Neucha";
import { loadFont as loadRuslan } from "@remotion/google-fonts/RuslanDisplay";
import { loadFont as loadMono } from "@remotion/google-fonts/PTMono";

const SUB = { subsets: ["latin", "cyrillic"] as ("latin" | "cyrillic")[] };

export const F = {
  /** заголовки, интертитры */
  title: loadKurale("normal", { weights: ["400"], ...SUB }).fontFamily,
  /** подписи «от руки» */
  hand: loadNeucha("normal", { weights: ["400"], ...SUB }).fontFamily,
  /** декоративный, только для названия */
  deco: loadRuslan("normal", { weights: ["400"], ...SUB }).fontFamily,
  /** чек */
  mono: loadMono("normal", { weights: ["400"], ...SUB }).fontFamily,
};

export const C = {
  paper: "#f2e6c9",
  paperDark: "#e3d3ad",
  ink: "#1d1a16",
  cream: "#f3e9d2",
  brick: "#b8432f",
  mustard: "#d9a53a",
  teal: "#2f7f7a",
  sea: "#9cc4bb",
  olive: "#7d8b3a",
};

export const W = 1920;
export const H = 1080;
export const FPS = 30;

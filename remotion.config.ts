/**
 * Конфиг применяется только к CLI/Studio. При рендере через Node API
 * (@remotion/renderer) эти опции НЕ действуют — передавайте их напрямую в API.
 *
 * Все опции: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.overrideWebpackConfig(enableTailwind);

// WebGL (Pixi / Three.js) в headless-рендере. ANGLE даёт стабильную картинку
// без артефактов software-рендера. Нужно для композиций с canvas/WebGL.
Config.setChromiumOpenGlRenderer("angle");

// Разумный дефолт под ноутбук (напр. Ryzen 5800H, 16 ГБ). Каждая вкладка Chrome
// ест 300–500 МБ — не отдаём рендеру все потоки, чтобы не уйти в своп.
// Поднимайте/опускайте под своё железо или переопределяйте флагом --concurrency.
Config.setConcurrency(6);

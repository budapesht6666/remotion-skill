/**
 * Что кладёт в `public/vo/DiverBotAd/ad.json` скрипт `npm run ad`.
 *
 * Композиция манифест только читает: вся арифметика таймлайна (склейка речи
 * встык, деление длительности фразы между планами, подгонка скорости захвата)
 * уже сделана на сборке. В рендере не должно быть ни одного вычисления,
 * зависящего от длины аудио, — иначе картинка и звук разъедутся между
 * превью в студии и финальным рендером.
 */
import type { SceneKind } from "./script";

/** Слово с таймингом от начала ролика — по ним рисуется караоке. */
export type AdWord = { w: string; s: number; e: number };

export type AdPhrase = {
  id: string;
  line: string;
  start: number;
  end: number;
  words: AdWord[];
};

export type AdShot = {
  id: string;
  line: string;
  scene: SceneKind;
  startFrame: number;
  durationInFrames: number;
  /** Путь внутри public/ либо null, если сцену рисует React. */
  media: string | null;
  /** Файла нет на диске — сцена обязана нарисовать нативный фон. */
  missing: boolean;
  from: number;
  speed: number;
  zoom: number;
  panX: number;
  panY: number;
  overlay: string | null;
  note: string | null;
};

export type AdManifest = {
  narrationFile: string;
  durationInFrames: number;
  phrases: AdPhrase[];
  shots: AdShot[];
};

/** Пустой манифест: с ним композиция открывается в студии до первой сборки. */
export const EMPTY_MANIFEST: AdManifest = {
  narrationFile: "",
  durationInFrames: 0,
  phrases: [],
  shots: [],
};

/**
 * Раскладка времени куска: какой кадр исходника стоит на каждом кадре ролика.
 *
 * Одна и та же функция ведёт и картинку (композиция берёт округлённый кадр),
 * и звук (`npm run gamecut` ресемплит дорожки эффектов по тем же дробным
 * кадрам) — поэтому speed-ramp любой формы остаётся синхронным со звуком:
 * выстрелы и взрывы на разгоне звучат выше, как плёнка на перемотке, и
 * возвращаются к своему тону вместе с картинкой.
 */
import type { ClipId, Piece } from "./edit";

/** Удар под панч-зум: Nova, смерть босса (последняя — `final`), сегмент/средний враг. */
export type HitKind = "nova" | "boss" | "final" | "part";

/** Формат public/clips/<Comp>/edit.json: его пишет `npm run gamecut`, читает композиция. */
export type GameCutManifest = {
  fps: number;
  durationInFrames: number;
  /** Кадр первой сильной доли и длина доли в кадрах. */
  grid: number;
  beat: number;
  audio: string;
  pieces: {
    id: string;
    clip: ClipId;
    file: string;
    /** Кадр ролика, с которого идёт кусок, и его длина. */
    at: number;
    frames: number;
    /** Кадр исходника на каждом кадре куска. */
    src: number[];
  }[];
  hits: { f: number; kind: HitKind; name: string; focus: [number, number] }[];
  banners: { f: number; style: string; text: string }[];
};

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Скорость (кадров исходника на кадр ролика) в точке исходника `s`. */
export function speedAt(piece: Piece, s: number): number {
  const keys = piece.speed;
  if (!keys || keys.length === 0) return 1;
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [s1, v1] = keys[i];
    if (s <= s1) {
      const [s0, v0] = keys[i - 1];
      return v0 + (v1 - v0) * smoothstep((s - s0) / (s1 - s0));
    }
  }
  return keys[keys.length - 1][1];
}

/**
 * Дробный кадр исходника на каждом кадре куска. Интегрируется от якоря в обе
 * стороны (метод средней точки — на плавной кривой ошибка меньше сотой кадра).
 */
export function resolveSrc(piece: Piece): number[] {
  const src = new Array<number>(piece.frames);
  const { at } = piece.anchor;
  if (at < 0 || at >= piece.frames) {
    throw new Error(`${piece.id}: anchor.at ${at} is outside 0…${piece.frames - 1}`);
  }
  src[at] = piece.anchor.src;
  for (let i = at; i < piece.frames - 1; i++) {
    const s = src[i];
    src[i + 1] = s + speedAt(piece, s + speedAt(piece, s) / 2);
  }
  for (let i = at; i > 0; i--) {
    const s = src[i];
    src[i - 1] = s - speedAt(piece, s - speedAt(piece, s) / 2);
  }
  return src;
}

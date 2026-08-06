/**
 * Генерация whiteboard-иллюстраций через Gemini Image API.
 *
 * Промпт — половина результата. Всё, что не «чёрные линии равной толщины на
 * белом», ломает трассировку: полутона превращаются в лишние контуры, заливка
 * даёт один контур вместо рисунка, тень уезжает в чернила. Поэтому стилевая
 * часть промпта зафиксирована здесь и не редактируется на уровне сценария —
 * автор задаёт только сюжет.
 */
import { Buffer } from "node:buffer";

export type ImageModel =
  | "gemini-2.5-flash-image"
  | "gemini-3.1-flash-image"
  | "gemini-3-pro-image";

/** Дефолт — самая дешёвая из моделей, которой хватает на чистый line-art. */
export const DEFAULT_MODEL: ImageModel = "gemini-2.5-flash-image";

/**
 * Стиль иллюстраций. Требования собраны под трассировщик:
 *  - «uniform thick black outlines» → potrace даёт ровные парные контуры;
 *  - «no shading/gradients/hatching» → нет паразитных мелких контуров;
 *  - «no text» → надписи рисует композиция шрифтом, их надо уметь переводить;
 *  - «generous white margin» → объект не липнет к краю; поля потом съедает
 *    посадка по чернилам (fitInkToBox), так что кадр от них не пустеет.
 */
const ARTWORK_STYLE = [
  "Black marker line drawing on a pure white background, whiteboard explainer illustration.",
  "Uniform thick black outlines of even weight, confident hand-drawn marker strokes with slight natural wobble.",
  "Line art only: no shading, no gradients, no grey fills, no hatching, no cross-hatching, no stippling.",
  "No color, no text, no letters, no numbers, no labels, no watermark, no signature, no drop shadow, no frame.",
  "Generous white margin around the drawing.",
].join(" ");

/**
 * Рука генерится один раз и живёт в public/whiteboard/hand/.
 * Промпт списан с референса (docs/reference/1.png): правая кисть сверху,
 * СЕРЫЙ маркер (не чёрный — чёрный сливается с нарисованной линией), хват
 * щепотью, запястье уходит вниз-вправо, мягкая контактная тень.
 */
const HAND_PROMPT = [
  "Photorealistic human right hand holding a grey whiteboard marker, photographed from directly above,",
  "as if drawing on a sheet of white paper. The marker is angled about 45 degrees pointing up and to the left,",
  "its tip clearly visible and unobstructed at the upper left of the marker.",
  "Fingers curled in a relaxed natural writing grip, thumb and index finger pinching the marker barrel.",
  "The wrist and part of the forearm exit toward the bottom right corner of the image.",
  "Plain pure white background, soft realistic contact shadow beneath the hand.",
  "Sharp focus, even bright studio lighting, natural skin tone, no color cast,",
  "no text, no watermark, no border, nothing else in the frame.",
].join(" ");

export type GenerateOptions = {
  apiKey: string;
  model?: ImageModel;
  /** "1:1" для объектов, "4:3"/"3:4" — если сюжет просит. */
  aspectRatio?: string;
  signal?: AbortSignal;
};

/**
 * Генерит одну картинку. Возвращает PNG-буфер.
 * Ошибки НЕ глотаем: 429 на free tier у image-моделей — это «включите биллинг»,
 * и об этом надо сказать прямо, а не свалиться в непонятный фолбэк.
 */
export async function generateImage(prompt: string, opts: GenerateOptions): Promise<Buffer> {
  const model = opts.model ?? DEFAULT_MODEL;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${opts.apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          ...(opts.aspectRatio ? { imageConfig: { aspectRatio: opts.aspectRatio } } : {}),
        },
      }),
      signal: opts.signal,
    },
  );

  const json = (await res.json()) as {
    error?: { code: number; message: string };
    candidates?: { content?: { parts?: { inlineData?: { data: string } }[] } }[];
  };

  if (!res.ok) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    if (json.error?.code === 429) {
      throw new Error(
        `Gemini отказал (429). У image-моделей нет бесплатной квоты: включите биллинг ` +
          `в Google AI Studio для проекта этого ключа. Ответ API: ${msg.split("\n")[0]}`,
      );
    }
    throw new Error(`Gemini отказал: ${msg}`);
  }

  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part?.inlineData) {
    throw new Error("Gemini вернул ответ без картинки — возможно, промпт зарезан фильтром безопасности");
  }
  return Buffer.from(part.inlineData.data, "base64");
}

/** Иллюстрация объекта: автор пишет только сюжет, стиль подставляется. */
export function artworkPrompt(subject: string): string {
  return `${ARTWORK_STYLE} Subject: ${subject}.`;
}

/** Промпт руки — константа, чтобы рука была одна и та же во всех роликах. */
export function handPrompt(): string {
  return HAND_PROMPT;
}

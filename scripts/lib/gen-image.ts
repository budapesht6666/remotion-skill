/**
 * Генерация whiteboard-иллюстраций через Gemini Image API.
 *
 * Промпт — половина результата, поэтому стилевая часть зафиксирована здесь и не
 * редактируется на уровне сценария: автор задаёт только сюжет.
 *
 * СТИЛЕЙ ДВА, и они противоположны по требованиям к трассировщику.
 *
 *   line     — плоский контурный рисунок. Всё, что не «чёрные линии равной
 *              толщины на белом», ломает трассировку: полутона превращаются в
 *              лишние контуры, заливка даёт один контур вместо рисунка.
 *   graphite — реалистичный карандаш с тоном и растушёвкой (референс
 *              docs/reference/moon.jpg). Здесь полутона, наоборот, и есть
 *              содержание: контуры трассируются только по САМОМУ ТЁМНОМУ
 *              (адаптивный порог в artwork.ts), а тон приносит вторая фаза
 *              рисования — штриховка широким пером. Отсюда единственное жёсткое
 *              требование к промпту: у форм должны быть отчётливые тёмные
 *              границы, иначе обводке нечего вести.
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
 * Реалистичный графит. Требования собраны под ДВУХФАЗНОЕ рисование:
 *  - «full tonal range, smooth blending» → есть что открывать штриховкой;
 *  - «distinct dark edges where forms meet» → есть что вести обводкой; без
 *    этого адаптивный порог ловит случайные пятна тона и контур гуляет;
 *  - «no cross-hatching, no stippling» → фактура должна быть РАСТУШЁВАННОЙ, а
 *    не набранной штрихами: сетка штрихов даёт сотни микроконтуров;
 *  - «no text/frame/border» → рамку трассировщик принял бы за главный контур.
 */
const GRAPHITE_STYLE = [
  "Realistic graphite pencil drawing on white paper, in the style of a careful hand-made study.",
  "Full tonal range from bright white paper to deep near-black graphite, smooth blended shading,",
  "soft velvety pencil texture, subtle paper grain.",
  "Forms are separated by distinct dark edges, so every shape reads clearly on its own.",
  "Blended tone only: no cross-hatching, no stippling, no visible parallel hatch lines, no ink outlines.",
  "No text, no letters, no numbers, no labels, no watermark, no signature, no border, no frame, no vignette.",
].join(" ");

/** Фон вокруг объекта: чистая бумага или плотно залитый графитом мрак. */
export type Backdrop = "paper" | "dark";

const BACKDROP_PROMPT: Record<Backdrop, string> = {
  paper: "The paper around the subject is left blank and pure white, with a generous empty margin on all four sides.",
  dark:
    "The background around the subject is filled with dense dark graphite, deep and even, " +
    "so the subject reads bright against the darkness. The dark fill bleeds off all four edges of the image: " +
    "there is no white margin, no light strip and no border anywhere along the edges.",
};

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

/**
 * Рука с ГРАФИТНЫМ КАРАНДАШОМ — под графитный стиль доски. Маркерная рука над
 * растушёванным карандашным рисунком читается как чужая: инструмент в кадре
 * должен уметь то, что появляется на бумаге.
 *
 * Геометрия списана с маркерной руки один в один (кончик вверху слева, запястье
 * уходит вниз-вправо), потому что `cutoutHand` ищет кончик как самый ЛЕВЫЙ
 * тёмный пиксель. Грифель для этого подходит даже лучше маркерного фетра: он
 * почти чёрный, а деревянный корпус светлый.
 *
 * Про угол отдельно и настойчиво: предплечье должно уходить именно В УГОЛ, по
 * диагонали. Первая генерация вывела его вбок, к середине правого края, и в
 * кадре рука обрывалась прямым вертикальным срезом посреди доски — картинка
 * руки кончается там, где кончается PNG.
 */
const PENCIL_HAND_PROMPT = [
  "Photorealistic human right hand holding a sharpened wooden graphite pencil, photographed from directly above,",
  "as if drawing on a sheet of white paper. The pencil is angled about 45 degrees pointing up and to the left,",
  "its sharp dark graphite tip clearly visible and unobstructed at the upper left of the pencil.",
  "The pencil barrel is plain light natural wood with no paint, no lettering and no metal ferrule.",
  "Fingers curled in a relaxed natural writing grip, thumb and index finger pinching the pencil.",
  "The wrist and forearm run diagonally down and to the right and leave the frame exactly at the bottom right corner,",
  "not through the middle of the right edge and not through the middle of the bottom edge.",
  "The hand itself sits in the upper left half of the frame.",
  "Plain pure white background, soft realistic contact shadow beneath the hand.",
  // Генератор охотно дорисовывает «уже нарисованное»: пара штрихов у грифеля.
  // В ролике они ездят вместе с рукой по всей доске, поэтому запрет отдельной
  // строкой и в самых прямых словах.
  "The paper is completely blank: no pencil strokes, no scribbles, no lines, nothing drawn on it anywhere.",
  "Sharp focus, even bright studio lighting, natural skin tone, no color cast,",
  "no text, no watermark, no border, nothing else in the frame.",
].join(" ");

/**
 * Мультяшная перчатка-курсор для финального клика по колокольчику.
 *
 * Указательный палец смотрит ВВЕРХ, а не влево: перчатка прилетает снизу и
 * жмёт по тому, что нарисовано над ней. Отсюда же и поиск кончика — у этой
 * картинки он ищется как самая ВЕРХНЯЯ тёмная точка (`tip: "top"`).
 *
 * Жирный чёрный контур обязателен: заливка перчатки белая, и без контура
 * вырезание фона по связности съело бы её целиком вместе с фоном.
 */
const GLOVE_PROMPT = [
  "A classic cartoon white glove hand in the style of vintage rubber-hose animation, pointing straight up with the index finger.",
  "Plain white glove with a bold even black outline, three short black seam lines on the back of the hand, rounded puffy fingers,",
  "and a soft rounded cuff at the wrist. Flat cartoon shading only, no gradients, no texture.",
  "The extended index finger points straight up and its tip is at the very top of the image, clearly separated and unobstructed.",
  "The cuff is at the bottom of the image. The whole glove is centred with an even white margin around it.",
  "Plain pure white background, no shadow, no text, no watermark, no border, nothing else in the frame.",
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

export type ArtStyle = "line" | "graphite";

export type PromptOptions = {
  style?: ArtStyle;
  /** Только для graphite. Дефолт — чистая бумага. */
  backdrop?: Backdrop;
  /**
   * Единственный цветной объект в кадре, обычной фразой: «the impact flash».
   * Всё остальное остаётся графитным — контраст работает на смысл, а не на
   * украшение, и трассировка не страдает: цветное пятно окружено тем же тоном.
   */
  accent?: string;
};

/** Иллюстрация объекта: автор пишет только сюжет, стиль подставляется. */
export function artworkPrompt(subject: string, opts: PromptOptions = {}): string {
  if ((opts.style ?? "line") === "line") return `${ARTWORK_STYLE} Subject: ${subject}.`;

  const parts = [GRAPHITE_STYLE, BACKDROP_PROMPT[opts.backdrop ?? "paper"]];
  if (opts.accent) {
    parts.push(
      `The whole drawing is monochrome graphite except for one thing: ${opts.accent}. ` +
        "That one element is drawn with coloured pencil, saturated and unmistakable, " +
        "and nothing else in the frame carries any colour at all.",
    );
  }
  parts.push(`Subject: ${subject}.`);
  return parts.join(" ");
}

/** Промпт руки — константа, чтобы рука была одна и та же во всех роликах. */
export function handPrompt(pencil = false): string {
  return pencil ? PENCIL_HAND_PROMPT : HAND_PROMPT;
}

/** Промпт перчатки-курсора. Тоже константа и по той же причине. */
export function glovePrompt(): string {
  return GLOVE_PROMPT;
}

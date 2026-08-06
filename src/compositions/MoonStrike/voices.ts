/**
 * Голос доски — англоязычный рассказчик, но не тот же, что у `MoonScar`.
 *
 * Там была обвинительная речь, и голос держали максимально ровным, чтобы цифры
 * били сами. Здесь материал другой: это расследование, где рассказчик по ходу
 * дела сам обнаруживает, что доказательств почти нет. Отсюда правки:
 *
 *   • stability 0.55 вместо 0.7 — интонация должна двигаться, иначе цепочка
 *     «была деталь → её бросили → она попала» звучит как список, а не как
 *     история;
 *   • style 0.4 — рассказчику разрешено удивляться вместе со зрителем, ровно
 *     в одном месте («no footage of it»), и ради этого места держится весь
 *     запас выразительности;
 *   • rate +6% — доска рисуется небыстро, а фраз тут двадцать пять; без
 *     лёгкого ускорения ролик переваливает за две минуты.
 *
 * Adam — нативный американский голос ElevenLabs, ниже и суше британского
 * Daniel из `MoonScar`: два ролика по одному событию не должны звучать одним
 * человеком.
 */
export type VoiceId = "narrator";

export type VoiceDef = {
  /** ElevenLabs */
  elevenVoiceId: string;
  elevenName: string;
  stability: number;
  elevenStyle: number;
  /** Gemini TTS */
  voice: string;
  stylePrompt: string;
  /** edge-tts */
  edgeVoice: string;
  pitch: string;
  /** Общий для всех движков темп, например «+22%». */
  rate: string;
};

export const VOICES: Record<VoiceId, VoiceDef> = {
  narrator: {
    elevenVoiceId: "pNInz6obpgDQGcFmaJgB",
    elevenName: "Adam — Deep, Narrative",
    stability: 0.55,
    elevenStyle: 0.4,
    voice: "Orus",
    stylePrompt:
      "Read this like someone telling a true story he has just finished piecing together: " +
      "low, unhurried, curious rather than outraged. Let the numbers land plainly. " +
      "Lean in slightly on the line about there being no footage — that is the turn of the whole piece — " +
      "and end the last line quietly, without punching it",
    // Фолбэк-движок. Меняется вместе со stylePrompt при переезде на другой язык.
    edgeVoice: "en-US-AndrewNeural",
    pitch: "-12Hz",
    rate: "+6%",
  },
};

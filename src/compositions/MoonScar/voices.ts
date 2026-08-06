/**
 * Голос доски — англоязычный вариант рассказчика из `Whiteboard`.
 *
 * Роль та же (автор, а не персонаж), но материал другой: это не научпоп с
 * улыбкой, а обвинение, собранное из фактов. Отсюда правки настроек:
 *
 *   • stability 0.7 вместо 0.6 — чем ровнее голос, тем сильнее бьют цифры.
 *     Провокация работает на контрасте: текст резкий, подача бесстрастная;
 *   • style 0.25 — чуть суше оригинала, без «удивления вместе со зрителем»:
 *     здесь удивляться должен зритель, а не диктор;
 *   • rate +4% — как в эталоне, доска рисуется небыстро и провисает без
 *     лёгкого ускорения.
 *
 * Daniel — нативный британский голос ElevenLabs, поэтому `elevenVoiceId`
 * переносится из `Whiteboard` без изменений: там он читал по-русски через
 * eleven_multilingual_v2, здесь работает на родном языке.
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
    elevenVoiceId: "onwK4e9ZLuTAKqWW03F9",
    elevenName: "Daniel — Authoritative, Calm",
    stability: 0.7,
    elevenStyle: 0.25,
    voice: "Charon",
    stylePrompt:
      "Read this like the narrator of a serious documentary: calm, level, unhurried, " +
      "with quiet weight behind every number. Never sell it and never sound outraged — " +
      "let the facts do that. Land the final line flat and let it sit",
    // Фолбэк-движок. В эталоне тут был ru-RU-DmitryNeural — единственное, что
    // обязательно меняется при переезде рецепта на другой язык.
    edgeVoice: "en-US-GuyNeural",
    pitch: "-10Hz",
    rate: "+4%",
  },
};

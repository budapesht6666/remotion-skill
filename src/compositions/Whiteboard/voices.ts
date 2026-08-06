/**
 * Голос доски. Один рассказчик на весь ролик — закадровый монолог поверх
 * рисования, поэтому голос должен не играть, а вести.
 *
 *   • stability 0.6 — эксплейнеру нужна ровная подача, но не мёртвая: чуть
 *     ниже, чем у монолога Стетхема, чтобы держалась живая интонация вопроса
 *     и панча в финале;
 *   • style 0.3 — немного больше эмоции, чем в байке: здесь голос удивляется
 *     фактам вместе со зрителем, и на этом держится вовлечение;
 *   • rate +4% — доска рисуется небыстро, и совсем спокойный темп начинает
 *     провисать. Небольшое ускорение подтягивает пейсинг, не съедая дикцию.
 *
 * Голос отличается от `StethamTales` намеренно: тот — персонаж, этот — автор.
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
    stability: 0.6,
    elevenStyle: 0.3,
    voice: "Charon",
    stylePrompt:
      "Прочитай как ведущий научно-популярного ролика: спокойно, внятно, с живым " +
      "интересом к тому, о чём говоришь. Без пафоса и без диктора из рекламы, " +
      "ровным темпом, с лёгкой улыбкой на последней фразе",
    edgeVoice: "ru-RU-DmitryNeural",
    pitch: "-10Hz",
    rate: "+4%",
  },
};

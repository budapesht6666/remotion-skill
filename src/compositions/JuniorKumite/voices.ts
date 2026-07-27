/**
 * Персонажи ролика и их голоса.
 *
 * Один и тот же персонаж описан для трёх движков — озвучка выбирает движок по
 * приоритету ElevenLabs → Gemini → edge-tts (см. scripts/voice-over.ts):
 *
 * - **ElevenLabs** (основной): 22 голоса, посимвольные тайминги для караоке,
 *   1 кредит на символ. Подача правится `stability` (ниже — эмоциональнее) и
 *   `style` (выше — выразительнее).
 * - **Gemini TTS**: подача задаётся ремаркой словами, но бесплатный тир упирается
 *   в лимит запросов после нескольких реплик подряд.
 * - **edge-tts**: бесплатный запасной, всего два русских голоса — персонажи
 *   разводятся только тоном и темпом.
 *
 * `rate` работает во всех трёх: у edge-tts это параметр синтеза, у остальных —
 * ускорение через ffmpeg (тайминги слов пересчитываются автоматически).
 */
export type VoiceId = "hr" | "tech" | "junior" | "chief" | "member";

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
  member: {
    elevenVoiceId: "onwK4e9ZLuTAKqWW03F9",
    elevenName: "Daniel — Steady Broadcaster",
    stability: 0.55,
    elevenStyle: 0.25,
    voice: "Kore",
    stylePrompt: "Произнеси сухо и отрывисто, без эмоций, как член комиссии с блокнотом",
    // Мужской: реплики комиссии звучат поверх мужских лиц. Женский голос
    // оставлен только за журналисткой (роль hr) — у неё есть свои планы.
    edgeVoice: "ru-RU-DmitryNeural",
    pitch: "+6Hz",
    rate: "+16%",
  },
  hr: {
    elevenVoiceId: "FGY2WhTYpPnrIDTdsKH5",
    elevenName: "Laura — Enthusiast, Quirky Attitude",
    stability: 0.3,
    elevenStyle: 0.7,
    voice: "Leda",
    stylePrompt:
      "Произнеси быстро и звонко, с приклеенным корпоративным энтузиазмом, " +
      "как HR, которая говорит это двадцатый раз за день",
    edgeVoice: "ru-RU-SvetlanaNeural",
    pitch: "+22Hz",
    rate: "+30%",
  },
  tech: {
    elevenVoiceId: "nPczCjzI2devNBz1zQrb",
    elevenName: "Brian — Deep, Resonant",
    stability: 0.6,
    elevenStyle: 0.2,
    voice: "Charon",
    stylePrompt: "Произнеси ровно, устало и снисходительно, как технический интервьюер",
    edgeVoice: "ru-RU-DmitryNeural",
    pitch: "-16Hz",
    rate: "+4%",
  },
  junior: {
    elevenVoiceId: "TX3LPaxmHKxFdv7VOQHJ",
    elevenName: "Liam — Energetic, Young",
    stability: 0.25,
    elevenStyle: 0.75,
    voice: "Fenrir",
    stylePrompt:
      "Произнеси быстро, нервно и заискивающе, как джуниор, которого вот-вот раскусят",
    edgeVoice: "ru-RU-DmitryNeural",
    pitch: "+38Hz",
    rate: "+24%",
  },
  chief: {
    elevenVoiceId: "pNInz6obpgDQGcFmaJgB",
    elevenName: "Adam — Dominant, Firm",
    stability: 0.5,
    elevenStyle: 0.45,
    voice: "Algieba",
    stylePrompt:
      "Произнеси вкрадчиво, негромко и с угрозой, как человек, которого здесь боятся",
    edgeVoice: "ru-RU-DmitryNeural",
    pitch: "-38Hz",
    rate: "-4%",
  },
};

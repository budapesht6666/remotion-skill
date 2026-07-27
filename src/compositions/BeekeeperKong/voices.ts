/**
 * Голоса ролика «Пчеловод 3: Опекунство».
 *
 * Ролик держится на контрасте двух подач: пафосный трейлерный закадр, который
 * обещает эпос про титанов, и предельно спокойный Стетхем, который этот эпос
 * обнуляет. Поэтому narrator звучит громче и быстрее, чем стоило бы для эпоса,
 * а stetham — медленнее и тише, чем ждёшь от боевика: спокойный голос после
 * крика читается как угроза.
 *
 * Движок выбирается по приоритету ElevenLabs → Gemini → edge-tts
 * (см. scripts/voice-over.ts). Здесь заполнены все три, чтобы озвучка не
 * встала, если верхний движок кончится.
 */
export type VoiceId = "narrator" | "stetham";

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
    elevenVoiceId: "nPczCjzI2devNBz1zQrb",
    elevenName: "Brian — Deep, Resonant",
    // Низкая стабильность дала бы «актёрскую» дрожь; трейлерный закадр должен
    // быть ровным и весомым, вся эмоция — в style.
    stability: 0.55,
    elevenStyle: 0.45,
    voice: "Charon",
    stylePrompt:
      "Прочитай как закадровый голос в трейлере блокбастера: торжественно, " +
      "весомо, с нагнетанием, будто анонсируешь конец света",
    edgeVoice: "ru-RU-DmitryNeural",
    pitch: "-22Hz",
    rate: "+2%",
  },
  stetham: {
    elevenVoiceId: "pNInz6obpgDQGcFmaJgB",
    elevenName: "Adam — Dominant, Firm",
    // Высокая стабильность + низкий style = ровная бесстрастная подача. Шутки
    // должны звучать как инструктаж, а не как шутки — в этом весь приём.
    stability: 0.65,
    elevenStyle: 0.25,
    voice: "Algieba",
    stylePrompt:
      "Произнеси очень спокойно, негромко и веско, без тени улыбки, " +
      "как человек, который объясняет очевидное и не собирается повторять",
    edgeVoice: "ru-RU-DmitryNeural",
    pitch: "-42Hz",
    rate: "-6%",
  },
};

/**
 * Голос рекламного ролика diverBot — один диктор на весь хронометраж.
 *
 * Выбор голоса продиктован тем, что продаёт ролик. У diverBot центральное
 * обещание — не доход, а доверие: «read-only, ключей нет, до твоих денег бот
 * дотянуться не может даже в принципе». Поэтому взят **Eric — Smooth,
 * Trustworthy** (american, middle_aged, conversational): спокойный ровный
 * американец, который звучит как человек, а не как диктор распродажи.
 * Проверенные альтернативы на этом же аккаунте, если Eric разонравится:
 * `nPczCjzI2devNBz1zQrb` (Brian, глубже и мягче) и `pqHfZKP75CvOlQylNhV4`
 * (Bill, единственный голос с меткой use_case=advertisement, но заметно старше).
 *
 * Настройки против рекламного пережима:
 *
 *   • stability 0.62 — чуть живее документалки (`MoonScar` держит 0.7), но
 *     далеко от эмоциональных качелей: текст сам по себе с иронией в начале
 *     («ты узнал за завтраком»), и подыгрывать ей голосом значит переиграть;
 *   • style 0.2 — сухо. Tone of voice продукта — короткие утвердительные
 *     предложения без хайпа, и голос обязан ему соответствовать, иначе ролик
 *     разъедется с сайтом, куда он ведёт;
 *   • rate +6% — реклама не терпит провисания, но текст плотный: быстрее
 *     ставить нельзя, слушатель перестаёт успевать за цифрами (девять событий,
 *     четыре таймфрейма, десять долларов за тридцать дней).
 *
 * Ролик англоязычный, поэтому фолбэк-движки тоже переведены на английский:
 * `edgeVoice` на `en-US-*`, `stylePrompt` для Gemini написан по-английски.
 * Это ровно те две правки, которых потребовал переезд `MoonScar` на английский.
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
  /** Общий для всех движков темп, например «+6%». */
  rate: string;
};

export const VOICES: Record<VoiceId, VoiceDef> = {
  narrator: {
    elevenVoiceId: "cjVigY5qzO86Huf0OWal",
    elevenName: "Eric — Smooth, Trustworthy",
    stability: 0.62,
    elevenStyle: 0.2,
    voice: "Charon",
    stylePrompt:
      "Read this like a modern software ad: calm, warm, confident, unhurried. " +
      "You are explaining something useful to a peer, not selling to a crowd — " +
      "no hype, no rising salesman inflection, no smile in the voice. " +
      "Let the short sentences land and leave a beat after each one",
    edgeVoice: "en-US-GuyNeural",
    pitch: "-5Hz",
    rate: "+6%",
  },
};

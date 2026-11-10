/**
 * Голос третьего монтажа — клон голоса владельца, а не стоковый Eric первых
 * двух монтажей (решение владельца 09.11.2026).
 *
 * Клон — «Pretty Much History narrator» (`SBBVbW5tBeb9k4srGeDM`), тот же, что
 * в `LaosVisa` (`scripts/laos-vo.py`). Настройки оттуда же:
 *   • модель eleven_v4 — задаётся при запуске: `ELEVENLABS_MODEL=eleven_v4
 *     npm run vo -- DiverBotReel` (у скрипта по умолчанию multilingual_v2);
 *   • скорость API 1.0 — на v4 она почти не действует, поэтому ускорение
 *     ×1.25 делается только после синтеза через `atempo` (rate "+25%");
 *     rubberband не годится — голос звучит «из трубы».
 * stability и style — значения ElevenLabs по умолчанию: laos-vo.py их не
 * задаёт вовсе, и клон звучит своим голосом именно на них.
 *
 * Поэтому здесь своя запись, а не реэкспорт `../DiverBotAd/voices`: весь
 * ролик переозвучен клоном, кэша Eric в нём нет.
 */
import type { VoiceDef } from "../DiverBotAd/voices";

export type { VoiceDef };
export type VoiceId = "narrator";

export const VOICES: Record<VoiceId, VoiceDef> = {
  narrator: {
    elevenVoiceId: "SBBVbW5tBeb9k4srGeDM",
    elevenName: "Pretty Much History narrator (клон владельца)",
    stability: 0.5,
    elevenStyle: 0,
    // Фолбэки не должны срабатывать: другой движок — другой голос. Если в
    // выводе `npm run vo` появится не [eleven], ролик не собирать.
    voice: "Charon",
    stylePrompt: "Read this calmly and confidently, like a modern software ad.",
    edgeVoice: "en-US-GuyNeural",
    pitch: "-5Hz",
    rate: "+25%",
  },
};

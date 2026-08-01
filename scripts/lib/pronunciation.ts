/**
 * СЛОВАРЬ ПРОИЗНОШЕНИЯ: одно правило на слово, общее для всех роликов.
 *
 * Хранится в `data/pronunciation.json`, синхронизируется в ElevenLabs командой
 * `npm run dict`. Правило — это alias, то есть текстовая замена: слово
 * заменяется на себя же со знаком ударения U+0301 («пчеловод» → «пчелово́д»).
 * По этому знаку ElevenLabs реально переставляет ударение — проверено вслепую,
 * работает 7 раз из 8, в отличие от заглавных букв (0 из 4).
 *
 * Два запрета:
 *   • НЕ заводить правила типа `phoneme` — на всех моделях кроме `eleven_v3`
 *     они не игнорируются, а УДАЛЯЮТ слово из речи;
 *   • НЕ класть в словарь омографы. Alias бьёт по всем вхождениям сразу, а
 *     «с какой ноги́» и «есть но́ги» требуют разного — такие слова помечай
 *     акутом прямо в `line` сценария.
 *
 * Для Gemini и edge-tts, у которых словарей нет, те же правила применяются
 * локальной заменой — озвучка не должна зависеть от того, какой движок выжил.
 */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export type Rule = { word: string; say: string; note?: string };
/** `words` — что уже залито: по нему следующая синхронизация чистит словарь. */
export type ElevenLocator = { id: string; versionId: string; hash: string; words: string[] };
export type Pronunciation = { rules: Rule[]; eleven: ElevenLocator | null; hash: string };

export const DICT_PATH = path.resolve("data/pronunciation.json");

export function hashRules(rules: Rule[]): string {
  return createHash("sha1")
    .update(JSON.stringify(rules.map((r) => [r.word, r.say])))
    .digest("hex")
    .slice(0, 12);
}

export async function loadPronunciation(): Promise<Pronunciation> {
  const raw = JSON.parse(await readFile(DICT_PATH, "utf8")) as {
    rules: Rule[];
    eleven: ElevenLocator | null;
  };
  return { rules: raw.rules, eleven: raw.eleven, hash: hashRules(raw.rules) };
}

/**
 * Локатор для запроса к ElevenLabs — или null, если словарь ещё не
 * синхронизирован либо правила ушли вперёд файла (тогда лучше не применять
 * устаревший словарь молча, а попросить `npm run dict`).
 */
export function elevenLocators(p: Pronunciation) {
  if (!p.eleven || p.eleven.hash !== p.hash) return undefined;
  return [{ pronunciation_dictionary_id: p.eleven.id, version_id: p.eleven.versionId }];
}

/** Правила, которые реально задевают эту реплику. */
export function rulesFor(text: string, rules: Rule[]): Rule[] {
  return rules.filter((r) => wordRe(r.word).test(text));
}

/**
 * Подпись правил ДЛЯ ОДНОЙ реплики — она входит в хеш кэша озвучки.
 *
 * Именно пофразно, а не хешем всего словаря: иначе правка одного слова
 * переозвучивает весь ролик и сжигает кредиты на репликах, которых правило
 * даже не касается.
 */
export function rulesSignature(text: string, rules: Rule[]): string {
  const hit = rulesFor(text, rules);
  return hit.length ? hashRules(hit) : "-";
}

/** Та же замена, что делает словарь, но локально — для движков без словарей. */
export function applyRules(text: string, rules: Rule[]): string {
  return rules.reduce((acc, r) => acc.replace(wordRe(r.word), r.say), text);
}

/**
 * Слово целиком. `\b` в JS считает границей только латиницу, поэтому границу
 * задаём сами: ни до, ни после не должно быть буквы или уже стоящего акута.
 */
function wordRe(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\u0301])${escaped}(?![\\p{L}\\u0301])`, "giu");
}

/**
 * СИНХРОНИЗАЦИЯ СЛОВАРЯ ПРОИЗНОШЕНИЯ С ELEVENLABS.
 *
 *   npm run dict            # залить data/pronunciation.json, если правила менялись
 *   npm run dict -- --force # залить в любом случае
 *   npm run dict -- --list  # что вообще лежит на аккаунте
 *
 * Словарь на аккаунте один и тот же, у него растут версии. Перед заливкой из
 * него вычищаются ранее залитые слова: ElevenLabs применяет ПЕРВОЕ совпавшее
 * правило, поэтому простое дописывание оставило бы старое произношение слова
 * выигрывать у нового. Удалить словарь целиком нельзя — API отвечает 405, так
 * что плодить новые на каждую правку нельзя тем более.
 *
 * Ключу нужны права `pronunciation_dictionaries_write`: в правах ElevenLabs у
 * раздела три состояния, и «read» записи не даёт.
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { DICT_PATH, hashRules, type Rule, type ElevenLocator } from "./lib/pronunciation";

const ROOT = "https://api.elevenlabs.io/v1/pronunciation-dictionaries";
const NAME = "remotion-shorts-ru";

async function main() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("Нет ELEVENLABS_API_KEY в .env");
  const headers = { "xi-api-key": key, "Content-Type": "application/json" };

  if (process.argv.includes("--list")) {
    const res = await fetch(`${ROOT}?page_size=100`, { headers });
    const data = (await res.json()) as {
      pronunciation_dictionaries?: { id: string; name: string; version_id: string }[];
    };
    const list = data.pronunciation_dictionaries ?? [];
    console.log(list.length ? list.map((d) => `${d.id}  ${d.name}`).join("\n") : "словарей нет");
    return;
  }

  const file = JSON.parse(await readFile(DICT_PATH, "utf8")) as {
    rules: Rule[];
    eleven: ElevenLocator | null;
    [k: string]: unknown;
  };
  const hash = hashRules(file.rules);

  if (file.eleven?.hash === hash && !process.argv.includes("--force")) {
    console.log(`Словарь уже актуален (${file.rules.length} правил, ${hash}).`);
    return;
  }

  const rules = file.rules.map((r) => ({ type: "alias", string_to_replace: r.word, alias: r.say }));
  const words = file.rules.map((r) => r.word);
  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as { id: string; version_id: string; version_rules_num?: number };
  };

  let dict: { id: string; version_id: string; version_rules_num?: number };
  if (file.eleven?.id) {
    const stale = file.eleven.words ?? [];
    if (stale.length) {
      await post(`${ROOT}/${file.eleven.id}/remove-rules`, { rule_strings: stale });
    }
    dict = await post(`${ROOT}/${file.eleven.id}/add-rules`, { rules });
    console.log(`Словарь ${file.eleven.id} обновлён: снято ${stale.length}, залито ${rules.length}.`);
  } else {
    dict = await post(`${ROOT}/add-from-rules`, {
      name: NAME,
      description: `Ударения для роликов. Синхронизировано ${new Date().toISOString().slice(0, 10)}.`,
      rules,
    });
    console.log(`Словарь создан: ${dict.id}`);
  }

  file.eleven = { id: dict.id, versionId: dict.version_id, hash, words };
  await writeFile(DICT_PATH, `${JSON.stringify(file, null, 2)}\n`, "utf8");

  console.log(`Правил в версии: ${dict.version_rules_num ?? rules.length}\n  id ${dict.id}\n  version ${dict.version_id}`);
  console.log("Перегенерируй озвучку: npm run vo -- <Композиция>");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

"""
Синтез речи edge-tts с пословными таймингами.

    python scripts/lib/edge_tts_words.py <текст.txt> <голос> <rate> <pitch> <out.mp3> <out.json>

CLI edge-tts умеет отдавать субтитры только целыми фразами, а для караоке нужны
границы каждого слова — их шлёт потоковый API событиями WordBoundary. Смещения
приходят в 100-наносекундных единицах, переводим в секунды.
"""
import asyncio
import json
import sys

import edge_tts


async def main() -> None:
    text_path, voice, rate, pitch, media_out, json_out = sys.argv[1:7]
    with open(text_path, encoding="utf-8") as fh:
        text = fh.read()

    # boundary по умолчанию — SentenceBoundary, то есть одна метка на всю фразу.
    # Для караоке нужны границы каждого слова.
    communicate = edge_tts.Communicate(
        text, voice, rate=rate, pitch=pitch, boundary="WordBoundary"
    )
    words = []
    with open(media_out, "wb") as audio:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append(
                    {
                        "w": chunk["text"],
                        "s": round(chunk["offset"] / 1e7, 3),
                        "e": round((chunk["offset"] + chunk["duration"]) / 1e7, 3),
                    }
                )

    with open(json_out, "w", encoding="utf-8") as fh:
        json.dump(words, fh, ensure_ascii=False)


asyncio.run(main())

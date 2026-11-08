"""Пакет на выкатку «Лаосской визы» -> out/LaosVisa/upload.md: название, описание с главами, атрибуция, теги.

    python scripts/laos-upload.py

Главы берутся из timeline.json (начала интертитров), авторы стока — из stock/manifest.json по фактически
использованным файлам, музыка — из таблицы ниже (CC BY 4.0 требует строку атрибуции в описании).
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public/clips/LaosVisa"
OUT = ROOT / "out/LaosVisa"
TL = json.loads((PUB / "timeline.json").read_text(encoding="utf-8"))
BEATS = json.loads((ROOT / "src/compositions/LaosVisa/beats.json").read_text(encoding="utf-8"))["beats"]

MUSIC = [("Fluffing a Duck", "duck"), ("Monkeys Spinning Monkeys", "monkeys"), ("Sneaky Snitch", "snitch"),
         ("Thatched Villagers", "villagers"), ("Wallpaper", "wallpaper"), ("Maple Leaf Rag", "rag")]
CHAPTERS = {"p1": "Начало", "i1": "Арифметика: 45 дней вместо 90", "i2": "Шесть часов в слипере. Дорога №9 и Кхесань",
            "i3": "Граница Лао Бао и «чай» пограничникам", "i4": "Обед: рис с яйцом", "i5": "Ночной Хюэ: 7 фактов о Вьетнаме",
            "e1": "Итог: сколько стоила поездка"}


def ts(frame):
    s = int(frame / TL["fps"])
    return f"{s // 60}:{s % 60:02d}"


def main():
    starts = {}
    for s in TL["segs"]:
        starts.setdefault(s["beat"], s["f"])
    chapters = "\n".join(f"{ts(starts[b])} {name}" for b, name in CHAPTERS.items() if b in starts)
    used = {s["src"].split("/")[-1] for s in TL["segs"] if s.get("src")}
    used_stock = {v["src"].split(":", 1)[1] for b in BEATS for v in b["v"] if str(v.get("src", "")).startswith("stock:")}
    manifest = json.loads((PUB / "stock/manifest.json").read_text(encoding="utf-8"))
    stock = sorted({f"{m['credit']} — {m['creditUrl']}" for m in manifest if m["file"] in used_stock})
    tracks = {c["music"]["track"] for b in BEATS for c in [b] if b.get("music")}
    music = "\n".join(f'Music: "{t}" by Kevin MacLeod (incompetech.com), licensed under CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/'
                      for t, k in MUSIC if k in tracks)
    archive = (PUB / "archive/CREDITS.txt").read_text(encoding="utf-8").strip()
    dur = TL["frames"] / TL["fps"]
    text = f"""# Лаосская виза, или Новые приключения Павлика — пакет на выкатку

- Канал: https://www.youtube.com/@Tropinkin_travel
- Видео: `out/LaosVisa/laos-visa-vN.mp4` (последняя версия), длина {int(dur // 60)}:{int(dur % 60):02d}
- Субтитры: `public/clips/LaosVisa/subs.ru.srt` — загрузить в Студии как русские субтитры
- Обложка: `out/LaosVisa/cover.jpg` (1280×720, композиция `LaosThumb`)

## Название (варианты, до 100 знаков, хэштеги в конце)
1. Визаран через Лао Бао всей семьёй: 45 дней во Вьетнаме за 2,7 млн донгов #визаран #вьетнам #лаос
2. Лаосская виза, или Новые приключения Павлика — визаран Дананг → Лао Бао #визаран #вьетнам
3. Сколько берут пограничники на Лао Бао? Визаран из Дананга на троих #визаран #вьетнам #лаобао

## Описание
Едем всей семьёй из Дананга на границу с Лаосом — пункт пропуска Лао Бао — за новыми 45 днями во Вьетнаме.
Сколько стоит поездка на троих, как проходит граница, сколько просят пограничники и что интересного по дороге:
дорога №9, Кхесань, ветряки Куангчи и ночной Хюэ.

Главы:
{chapters}

Расходы на троих: автобус 1 320 000 ₫, такси 300 000 ₫, обед 500 000 ₫, сборы на границе 600 000 ₫ — итого 2 720 000 ₫.

Цитаты из фильма «Кавказская пленница, или Новые приключения Шурика» (реж. Л. Гайдай, «Мосфильм», 1966).

{music}

Сток: {"; ".join(stock)}
Архив (общественное достояние, Викисклад):
{archive}
Рисованные вставки сгенерированы ИИ (Gemini). Закадровый голос — клон голоса автора (ElevenLabs).

#визаран #вьетнам #лаос #лаобао #дананг #хюэ #вьетнам2026 #жизньвовьетнаме #визавовьетнам #безвиз #путешествиясемьей #кавказскаяпленница

## Теги
визаран, виза во Вьетнам, Лао Бао, Lao Bao, визаран Вьетнам Лаос, Дананг, Хюэ, Вьетнам 2026, жизнь во Вьетнаме,
граница Вьетнам Лаос, безвиз Вьетнам 45 дней, переезд во Вьетнам, Кавказская пленница

## Про хэштеги
- В названии — 2–3 хэштега, YouTube показывает их ссылками. Без хэштегов в названии над заголовком встают первые три из описания.
- В описании их 12. Больше 15 — YouTube игнорирует все хэштеги ролика.

## Настройки
- Язык видео: русский. Категория: Путешествия.
- **Изменённый или синтетический контент: ДА** — голос клонирован, рисованные вставки сгенерированы.
- Риск Content ID: ~37 c цитат «Мосфильма» (9 вставок по 2–7 c). Возможна заявка (доход владельцу) или
  блокировка в отдельных странах; страйк за заявку не ставится. Музыка — CC BY, заявок быть не должно.
"""
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "upload.md").write_text(text, encoding="utf-8")
    print(chapters)


if __name__ == "__main__":
    main()

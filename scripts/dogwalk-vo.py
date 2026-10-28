"""Закадр для роликов про прогулку: narration.json -> ElevenLabs -> public/clips/<Комп>/vo/ + vo.json.

    python scripts/dogwalk-vo.py                  # DogWalk (клон рассказчика канала)
    python scripts/dogwalk-vo.py DogWalkRitchie   # версия «Большой куш»

Фразы, голос, модель и темп лежат в src/compositions/<Комп>/narration.json.
Фраза привязана к плану, как надписи в script.ts; скрипт меряет длину каждой
записи и предупреждает, если фраза наезжает на следующую, на живую реплику
или уходит за конец плана. Кэш по тексту и настройкам — vo/_cache.json,
повторный запуск не тратит знаки.

Темп. ElevenLabs даёт не больше 1.2, а оба голоса держат паузу 0.3–0.5 c на
каждой запятой — для шортса это провалы. Поэтому после синтеза края
обрезаются, внутренние паузы ужимаются до 0.12 c и сверху добавляется
`tempo` (atempo). Квадратные скобки — теги эмоций eleven_v3, их не читают.
"""
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMP = sys.argv[1] if len(sys.argv) > 1 else "DogWalk"
SRC = ROOT / "src/compositions" / COMP
OUT = ROOT / "public/clips" / COMP
VO = OUT / "vo"
CFG = json.loads((SRC / "narration.json").read_text(encoding="utf-8"))


def env(name):
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip()
    raise SystemExit(f"нет {name} в .env")


def api(path, key, body=None):
    req = urllib.request.Request(
        "https://api.elevenlabs.io/v1" + path,
        data=json.dumps(body).encode() if body else None,
        headers={"xi-api-key": key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise SystemExit(f"ElevenLabs {e.code}: {e.read().decode()[:400]}")


def tighten(src, dst):
    af = ("silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:"
          f"stop_duration=0.12:stop_threshold=-45dB:stop_silence=0.12,atempo={CFG['tempo']},"
          "afade=t=in:d=0.02")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", af, "-ar", "48000", str(dst)], check=True)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out)


def shots():
    """Начала и длины планов в секундах — та же арифметика кадров, что в композиции."""
    edit = json.loads((SRC / "edit.json").read_text(encoding="utf-8"))
    fps, t, out = edit["fps"], 0, {}
    for s in edit["shots"]:
        sec = s.get("dur", (s.get("to", 0) - s.get("from", 0)) / s.get("speed", 1))
        n = int(sec * fps + 0.5)
        out[s["id"]] = (t / fps, n / fps)
        t += n
    return out, t / fps


def live_windows(starts):
    """Окна живых реплик из script.ts — чтобы голос на них не наезжал."""
    path = SRC / "script.ts"
    if not path.exists():
        return []
    src = path.read_text(encoding="utf-8")
    if "export const captions" not in src:
        return []
    block = src.split("export const captions", 1)[1].split("];", 1)[0]
    pat = r'shot: "(\w+)", at: ([\d.]+), dur: ([\d.]+), text: "([^"]+)"'
    return [(starts[s] + float(a), starts[s] + float(a) + float(d), txt) for s, a, d, txt in re.findall(pat, block)]


def main():
    key = env("ELEVENLABS_API_KEY")
    voices = json.loads(api("/voices", key))["voices"]
    vid = next(v["voice_id"] for v in voices if v["name"] == CFG["voice"])
    VO.mkdir(parents=True, exist_ok=True)
    cache_path = VO / "_cache.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    have_edit = (SRC / "edit.json").exists()
    table, total = shots() if have_edit else ({}, 0)
    out = []
    for i, p in enumerate(CFG["phrases"]):
        sig = f"{vid}|{CFG['model']}|{CFG['speed']}|{p['text']}"
        raw = OUT / f"vo/{i:02d}.mp3"
        if cache.get(raw.name) != sig or not raw.exists():
            raw.write_bytes(api(f"/text-to-speech/{vid}?output_format=mp3_44100_128", key,
                                {"text": p["text"], "model_id": CFG["model"], "voice_settings": {"speed": CFG["speed"]}}))
            cache[raw.name] = sig
            cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        tight = f"vo/{i:02d}.wav"
        tighten(raw, OUT / tight)
        clean = re.sub(r"\[[^\]]*\]\s*", "", p["text"])
        out.append({"shot": p["shot"], "at": p["at"], "file": tight, "dur": round(duration(OUT / tight), 3), "text": clean})
    (OUT / "vo.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    if not have_edit:
        for p in out:
            print(f"{p['dur']:5.2f} c  {p['shot']:15} {p['text']}")
        return
    spans = [(table[p["shot"]][0] + p["at"], table[p["shot"]][0] + p["at"] + p["dur"], p["text"]) for p in out]
    for a, b in zip(spans, spans[1:]):
        if a[1] > b[0] - 0.1:
            print(f"НАЕЗД {a[1] - b[0]:+.2f} c: «{a[2]}» -> «{b[2]}»")
    for s0, s1, txt in spans:
        for l0, l1, live in live_windows({k: v[0] for k, v in table.items()}):
            if s0 < l1 and l0 < s1:
                print(f"НА ЖИВУЮ РЕПЛИКУ «{live}»: «{txt}» ({max(s0, l0):.2f}–{min(s1, l1):.2f})")
    for p, (s0, s1, _) in zip(out, spans):
        start, length = table[p["shot"]]
        spill = s1 - (start + length)
        note = f"  (за план на {spill:.2f} c)" if spill > 0.05 else ""
        print(f"{s0:6.2f}–{s1:6.2f}  {p['dur']:.2f} c  {p['shot']:15} {p['text']}{note}")
    print(f"монтаж {total:.2f} c")


if __name__ == "__main__":
    main()

"""Закадр «Лаосской визы»: beats.json -> ElevenLabs (клон голоса) -> public/clips/LaosVisa/vo/<id>.wav + vo.json.

    python scripts/laos-vo.py            # все фразы (кэш по тексту — повторный запуск знаки не тратит)
    python scripts/laos-vo.py c1a c2b    # перегенерировать эти

Голос — клон пользователя «Pretty Much History narrator», модель eleven_v4.
Темп: скорость API 1.0 (на v4 она почти не действует), ускорение ×1.25 ТОЛЬКО atempo.
rubberband не использовать — голос звучит «из трубы», как робот (урок серии 2 канала, 2026-10-31).
Тишина срезается только по краям фразы; паузы внутри фразы не трогаем — в длинном ролике
ужатые до 0.12 c паузы звучат как тараторка. Громкость фраз выравнивается по RMS речи.
Пословные тайминги — из /with-timestamps (для субтитров), пересчитаны на темп и обрезку.
"""
import base64
import hashlib
import json
import subprocess
import sys
import urllib.error
import urllib.request
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
BEATS = json.loads((ROOT / "src/compositions/LaosVisa/beats.json").read_text(encoding="utf-8"))["beats"]
OUT = ROOT / "public/clips/LaosVisa/vo"
VOICE = "Pretty Much History narrator"
MODEL = "eleven_v4"
SPEED = 1.0
TEMPO = 1.25
RATE = 48000
TARGET_RMS_DB = -20.0
STRESS = "́"


def env(name):
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip()
    raise SystemExit(f"нет {name} в .env")


def api(path, key, body=None):
    req = urllib.request.Request("https://api.elevenlabs.io/v1" + path, data=json.dumps(body).encode() if body else None,
                                 headers={"xi-api-key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"ElevenLabs {e.code}: {e.read().decode()[:400]}")


def read_wav(p):
    with wave.open(str(p)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768


def write_wav(p, x):
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(RATE)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def process(mp3, wav_out):
    """mp3 -> обрезка краёв -> atempo -> выравнивание громкости. Возвращает (сдвиг начала в c исходника, длина)."""
    tmp = wav_out.with_suffix(".raw.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp3), "-ac", "1", "-ar", str(RATE), str(tmp)], check=True)
    x = read_wav(tmp)
    env_db = 20 * np.log10(np.maximum(np.convolve(np.abs(x), np.ones(480) / 480, "same"), 1e-6))
    loud = np.where(env_db > -45)[0]
    a = max(0, loud[0] - int(0.03 * RATE)) if len(loud) else 0
    b = min(len(x), loud[-1] + int(0.06 * RATE)) if len(loud) else len(x)
    write_wav(tmp, x[a:b])
    sped = wav_out.with_suffix(".sped.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp), "-af", f"atempo={TEMPO},afade=t=in:d=0.01",
                    "-ar", str(RATE), str(sped)], check=True)
    y = read_wav(sped)
    frames = y[: len(y) // 480 * 480].reshape(-1, 480)
    rms = np.sqrt((frames ** 2).mean(axis=1))
    speech = rms[rms > 10 ** (-40 / 20)]
    gain = 10 ** ((TARGET_RMS_DB - 20 * np.log10(np.sqrt((speech ** 2).mean()) + 1e-9)) / 20) if len(speech) else 1
    y = y * gain
    peak = np.abs(y).max()
    if peak > 0.95:
        y *= 0.95 / peak
    write_wav(wav_out, y)
    tmp.unlink(), sped.unlink()
    return a / RATE, len(y) / RATE


def words(al, shift):
    """Посимвольные тайминги -> слова (время уже с учётом обрезки и темпа)."""
    out, cur, s0, e0 = [], "", None, None
    for ch, s, e in zip(al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]):
        if ch.isspace():
            if cur:
                out.append((cur, s0, e0))
            cur, s0 = "", None
            continue
        if s0 is None:
            s0 = s
        cur, e0 = cur + ch, e
    if cur:
        out.append((cur, s0, e0))
    return [{"w": w.replace(STRESS, ""), "s": round(max(0, (s - shift) / TEMPO), 3), "e": round(max(0, (e - shift) / TEMPO), 3)} for w, s, e in out]


def main():
    test = "--test" in sys.argv          # только перечисленные, остальное не трогать
    only = {a for a in sys.argv[1:] if not a.startswith("--")}
    key = env("ELEVENLABS_API_KEY")
    with urllib.request.urlopen(urllib.request.Request("https://api.elevenlabs.io/v1/voices", headers={"xi-api-key": key})) as r:
        vid = next(v["voice_id"] for v in json.loads(r.read())["voices"] if v["name"] == VOICE)
    OUT.mkdir(parents=True, exist_ok=True)
    cache_p = OUT / "_cache.json"
    cache = json.loads(cache_p.read_text(encoding="utf-8")) if cache_p.exists() else {}
    res, spent = {}, 0
    for b in BEATS:
        if not b.get("vo") or (test and b["id"] not in only):
            continue
        sig = hashlib.sha1(f"{vid}|{MODEL}|{SPEED}|{b['vo']}".encode()).hexdigest()
        mp3, js = OUT / f"{b['id']}.mp3", OUT / f"{b['id']}.align.json"
        if cache.get(b["id"]) != sig or not mp3.exists() or b["id"] in only:
            r = api(f"/text-to-speech/{vid}/with-timestamps?output_format=mp3_44100_128", key,
                    {"text": b["vo"], "model_id": MODEL, "voice_settings": {"speed": SPEED}})
            mp3.write_bytes(base64.b64decode(r["audio_base64"]))
            js.write_text(json.dumps(r.get("alignment") or r.get("normalized_alignment"), ensure_ascii=False), encoding="utf-8")
            cache[b["id"]] = sig
            cache_p.write_text(json.dumps(cache, indent=1), encoding="utf-8")
            spent += len(b["vo"])
            print(f"  синтез {b['id']} ({len(b['vo'])} зн.)")
        shift, dur = process(mp3, OUT / f"{b['id']}.wav")
        al = json.loads(js.read_text(encoding="utf-8"))
        res[b["id"]] = {"file": f"vo/{b['id']}.wav", "dur": round(dur, 3), "words": words(al, shift)}
    if test:
        print({k: v["dur"] for k, v in res.items()}); return
    (OUT.parent / "vo.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(v["dur"] for v in res.values())
    nwords = sum(len(v["words"]) for v in res.values())
    print(f"фраз {len(res)}, закадр {total / 60:.1f} мин, {nwords / total * 60:.0f} слов/мин, потрачено знаков {spent}")


if __name__ == "__main__":
    main()

"""Сборка «Лаосской визы»: beats.json + vo.json -> клипы под каждый план, timeline.json, звук одной дорожкой, субтитры.

    python scripts/laos-build.py            # всё (готовые клипы берутся из кэша по имени)
    python scripts/laos-build.py --audio    # только звук и таймлайн (без нарезки видео)

Каждый план видео режется в отдельный файл ровно нужной длины (тонмаппинг HLG->SDR, 30 fps, без звука),
поэтому композиция просто проигрывает его с нуля. Звук — одна дорожка audio.wav (на границах <Sequence>
Remotion теряет десятки мс), сдвинута раньше на 2048 сэмплов: рендер Remotion задерживает AAC ровно на столько.
Музыка приглушается под голос по огибающей; громкость итога -16 LUFS.
"""
import json
import math
import re
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
COMP = ROOT / "src/compositions/LaosVisa"
PUB = ROOT / "public/clips/LaosVisa"
ME = ROOT / "me/laos_journey_2"
ART = Path(r"C:/projects/claude/ArtCraft/channel/local")
SONNISS = ART / "sfx/sonniss/2026"
FPS, RATE = 30, 48000
RENDER_AUDIO_DELAY = 2048
VO_LEAD = 0.08          # голос вступает через 80 мс после склейки
GAP = 0.3               # пауза после фразы по умолчанию
AUDIO_ONLY = "--audio" in sys.argv

TONEMAP = ("zscale=tin=arib-std-b67:min=bt2020nc:pin=bt2020:rin=tv:t=linear:npl=100,format=gbrpf32le,"
           "zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,hue=s=0.85")
LIVE_FILTER = "highpass=f=120,afftdn=nf=-25,acompressor=threshold=-28dB:ratio=3:attack=5:release=150:makeup=4"

# Цитаты из фильма: public/clips/LaosVisa/film/<id>.mp4 (картинка) + <id>.wav (звук) + quotes.json (длина, текст плашки).
# Нарезаны из куска фильма по пословным таймингам распознавания (2026-11-08), полный фильм не хранится.
QUOTES = json.loads((PUB / "film/quotes.json").read_text(encoding="utf-8"))

MUSIC = {
    "duck": ART / "music/fluffing_a_duck.mp3",
    "monkeys": ART / "music/monkeys_spinning_monkeys.mp3",
    "snitch": ART / "music/sneaky_snitch.mp3",
    "villagers": ART / "music/thatched_villagers.mp3",
    "wallpaper": ROOT / "public/whiteboard-music.mp3",
    "rag": PUB / "music/rag.mp3",
}
SFX = {
    "whoosh": (SONNISS / "Cinematic Sound Design - Cartoon & Animation Vol 2/Cartoon Pull Swoosh Readout.wav", -14),
    "coins": (SONNISS / "Cinematic Sound Design - UI Interaction Elements/Ting Coins.wav", -14),
    "boing": (SONNISS / "Cinematic Sound Design - UI Interaction Elements/Accept Boing Crunch.wav", -14),
    "pop": (SONNISS / "Cinematic Sound Design - Interface & Infographics/Interface Pop High Short.wav", -12),
    "type": (SONNISS / "344 Audio - Antique Typewriter/COMType_Typewriter Space Key, Typewriter 05_344 Audio_Antiques - Typewriter.wav", -16),
    "horn": (SONNISS / "SoundBits - Motorcycles - Honda/VEHHorn_Honda CB500F Horn Long 02_SNDBTS_MCH.wav", -20),
    "wind": (SONNISS / "344 Audio - Elemental Palette Designed Vol. 1/WINDDsgn_Wind, Rush, Whoosh, Long x5 01_344 Audio_Elemental Palette Designed Vol 1.wav", -20),
    "bell": (ROOT / "public/sfx/subscribe-bell.mp3", -12),
    "projector": (None, -18),
    "stamp": (None, -8),
    "slide": (None, -16),
}


def ff(*a):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *map(str, a)], check=True)


def probe(p):
    j = json.loads(subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(p)],
                                  capture_output=True, text=True, check=True).stdout)
    v = next(s for s in j["streams"] if s["codec_type"] == "video")
    w, h = v["width"], v["height"]
    rot = next((sd.get("rotation", 0) for sd in v.get("side_data_list", []) if "rotation" in sd), 0)
    if abs(rot) == 90:
        w, h = h, w
    return w, h, float(j["format"]["duration"]), v.get("color_transfer", "")


def load_audio(p, sr=RATE):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def db(x):
    return 10 ** (x / 20)


# ---------------- синтез служебных звуков ----------------
def synth(name):
    t = lambda d: np.arange(int(d * RATE)) / RATE
    rng = np.random.default_rng(7)
    if name == "projector":
        d = 2.2
        x = np.zeros(len(t(d)))
        for k in np.arange(0, d, 1 / 24):
            i = int(k * RATE)
            n = min(240, len(x) - i)
            x[i:i + n] += rng.normal(0, 0.5, n) * np.exp(-np.arange(n) / 40)
        x += rng.normal(0, 0.04, len(x))
        return x * np.minimum(1, np.minimum(t(d) / 0.15, (d - t(d)) / 0.6))
    if name == "stamp":
        tt = t(0.45)
        body = np.sin(2 * np.pi * 70 * tt) * np.exp(-tt * 14)
        click = rng.normal(0, 1, len(tt)) * np.exp(-tt * 90)
        return 0.9 * body + 0.5 * click
    if name == "slide":
        tt = t(1.1)
        f = np.where(tt < 0.55, 600 + 1300 * tt / 0.55, 1900 - 1500 * (tt - 0.55) / 0.55) * (1 + 0.02 * np.sin(2 * np.pi * 7 * tt))
        x = np.sin(2 * np.pi * np.cumsum(f) / RATE)
        return x * np.minimum(1, np.minimum(tt / 0.05, (1.1 - tt) / 0.1)) * 0.6


SFX_CACHE = {}


def sfx(name):
    if name not in SFX_CACHE:
        path, gain = SFX[name]
        x = synth(name) if path is None else load_audio(path)
        pk = np.abs(x).max() or 1
        SFX_CACHE[name] = x / pk * db(gain)
    return SFX_CACHE[name]


# ---------------- источники картинок ----------------
def resolve_src(src):
    kind, name = src.split(":", 1)
    if kind == "mov":
        return ME / "src" / f"{name}.MOV"
    if kind == "stock":
        return PUB / "stock" / name
    if kind == "gen":
        return ME / "gen/out" / f"{name}.png"
    if kind in ("photo", "promo"):
        return ME / "photos" / f"{name}.jpg"
    if kind == "arch":
        return PUB / "archive" / name
    if kind == "card":
        return PUB / "img" / f"card_{name}.png"
    raise ValueError(src)


def prep_still(src):
    """Картинка -> public/clips/LaosVisa/img/<имя>.jpg (не больше 2752 по длинной стороне). -> (путь в public, вертикальная?)"""
    from PIL import Image, ImageOps
    p = resolve_src(src)
    kind, name = src.split(":", 1)
    if kind == "card":
        im = Image.open(p)
        return f"clips/LaosVisa/img/{p.name}", im.height > im.width
    out = PUB / "img" / (re.sub(r"[^\w.-]", "_", f"{kind}_{Path(name).stem}") + (".png" if kind == "gen" else ".jpg"))
    if not out.exists():
        im = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
        im.thumbnail((2752, 2752))
        im.save(out, quality=92) if out.suffix == ".jpg" else im.save(out)
    from PIL import Image as I2
    w, h = I2.open(out).size
    return f"clips/LaosVisa/img/{out.name}", h > w


def prep_clip(vis, n_frames, seg_id):
    """План видео ровно n_frames кадров. Если отрезка не хватает при заданной скорости — скорость снижается (не ниже 0.5)."""
    p = resolve_src(vis["src"])
    w, h, dur, trc = probe(p)
    a, b = vis["t"][0], vis["t"][1] if vis["t"][1] is not None else dur
    b = min(b, dur - 0.05)
    need = n_frames / FPS
    speed = vis.get("speed", 1.0)
    if (b - a) / speed < need:
        speed = max(0.5, (b - a) / need)
    vertical = h > w
    size = "1080:1920" if vertical else "1920:1080"
    name = re.sub(r"[^\w]", "_", f"{Path(p).stem}_{a:.2f}_{speed:.3f}_{n_frames}") + ".mp4"
    out = PUB / "v" / name
    if not out.exists() and not AUDIO_ONLY:
        chain = []
        if trc == "arib-std-b67":
            chain.append(TONEMAP)
        chain += [f"scale={size}:force_original_aspect_ratio=increase", f"crop={size}", f"setpts=(PTS-STARTPTS)/{speed}", f"fps={FPS}"]
        if (b - a) / speed < need:   # всё равно короче — держим последний кадр
            chain.append(f"tpad=stop_mode=clone:stop_duration={need - (b - a) / speed + 0.2}")
        ff("-ss", a, "-i", p, "-t", (b - a), "-an", "-vf", ",".join(chain), "-frames:v", n_frames,
           "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", out)
    return f"clips/LaosVisa/v/{name}", vertical, speed


# ---------------- таймлайн ----------------
def main():
    (PUB / "v").mkdir(parents=True, exist_ok=True)
    (PUB / "img").mkdir(parents=True, exist_ok=True)
    beats = json.loads((COMP / "beats.json").read_text(encoding="utf-8"))["beats"]
    vo = json.loads((PUB / "vo.json").read_text(encoding="utf-8"))
    t = 0                               # кадр начала бита
    segs, events, music_cues, subs = [], [], [], []
    for b in beats:
        if b.get("vo"):
            alen = VO_LEAD + vo[b["id"]]["dur"]
            events.append(("vo", t / FPS + VO_LEAD, PUB / vo[b["id"]]["file"], 0, None, 1.0))
            for w in vo[b["id"]]["words"]:
                subs.append((t / FPS + VO_LEAD + w["s"], t / FPS + VO_LEAD + w["e"], w["w"]))
        elif b.get("live"):
            L = b["live"]
            alen = L["t"][1] - L["t"][0]
            events.append(("live", t / FPS, resolve_src(f"mov:{L['src']}"), L["t"][0], alen, L.get("vol", 1.0)))
        elif b.get("q"):
            alen = QUOTES[b["q"]]["dur"]
            events.append(("quote", t / FPS, PUB / "film" / f"{b['q']}.wav", 0, alen, 1.0))
        else:
            alen = b["dur"]
        n = round((alen + b.get("gap", GAP if (b.get("vo") or b.get("live")) else 0)) * FPS)
        if b.get("music"):
            music_cues.append((t / FPS, b["music"], n / FPS))
        for s in b.get("sfx", []):
            events.append(("sfx", t / FPS + s["at"], s["s"], 0, None, 1.0))
        vs = b["v"]
        wsum = sum(v.get("w", 1) for v in vs)
        f0 = t
        for i, v in enumerate(vs):
            d = n - (f0 - t) if i == len(vs) - 1 else round(n * v.get("w", 1) / wsum)
            seg = {**{k: val for k, val in v.items() if k not in ("src", "t", "w")}, "f": f0, "d": d, "beat": b["id"]}  # служебные поля последними
            if v["k"] == "clip":
                seg["src"], seg["vertical"], seg["speed"] = prep_clip(v, d, b["id"])
            elif v["k"] in ("still", "title", "card"):
                seg["src"], seg["vertical"] = prep_still(v["src"])
            elif v["k"] == "tv":
                seg["src"] = f"clips/LaosVisa/film/{v['q']}.mp4"
                seg["quote"] = QUOTES[v["q"]]["text"]
            if v["k"] == "passport":
                st = [s["at"] for s in b.get("sfx", []) if s["s"] == "stamp"]
                local = [round(x * FPS) - (f0 - t) for x in st if 0 <= round(x * FPS) - (f0 - t) < d]
                seg["slam"] = local[-1] if local else 6
            if b.get("iris") and i == len(vs) - 1:
                seg["iris"] = True
            segs.append(seg)
            f0 += d
        t += n
    total = t
    mix(events, music_cues, total)
    write_srt(subs, beats, events)
    (PUB / "timeline.json").write_text(json.dumps({"fps": FPS, "frames": total, "segs": segs}, ensure_ascii=False), encoding="utf-8")
    print(f"таймлайн: {len(segs)} планов, {total} кадров = {total / FPS / 60:.2f} мин")



def movavg(x, n):
    """Скользящее среднее окном n через накопленную сумму (np.convolve на 24 млн сэмплов — минуты)."""
    c = np.cumsum(np.concatenate([[0.0], x.astype(np.float64)]))
    h = n // 2
    i = np.arange(len(x))
    a, b = np.clip(i - h, 0, len(x)), np.clip(i - h + n, 0, len(x))
    return ((c[b] - c[a]) / n).astype(np.float32)

# ---------------- звук ----------------
def mix(events, cues, total):
    N = int(total / FPS * RATE) + RATE
    voice = np.zeros(N, np.float32)
    quote = np.zeros(N, np.float32)
    fx = np.zeros(N, np.float32)
    vo_rms = None
    for kind, at, src, off, length, vol in events:
        i = int(at * RATE)
        if kind == "sfx":
            x = sfx(src)
            fx[i:i + len(x)] += x[: N - i]
            continue
        if kind == "vo":
            x = load_audio(src)
        else:
            cmd = ["ffmpeg", "-v", "error", "-ss", str(off), "-t", str(length), "-i", str(src)]
            if kind == "live":
                cmd += ["-af", LIVE_FILTER]
            raw = subprocess.run(cmd + ["-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"], capture_output=True, check=True).stdout
            x = np.frombuffer(raw, np.float32).copy()
            fr = x[: len(x) // 480 * 480].reshape(-1, 480)
            r = np.sqrt((fr ** 2).mean(1))
            sp = r[r > db(-45)]
            target = -21 if kind == "live" else -23
            if len(sp):
                x *= db(target) / np.sqrt((sp ** 2).mean()) * vol
            x *= np.minimum(1, np.minimum(np.arange(len(x)) / (0.03 * RATE), (len(x) - np.arange(len(x))) / (0.05 * RATE)))
        (quote if kind == "quote" else voice)[i:i + len(x)] += x[: N - i]

    # музыка: сегменты по меткам, у каждого трека своя «головка», чтобы после вставки продолжить с того же места
    music = np.zeros(N, np.float32)
    base = np.zeros(N, np.float32)
    heads, prev = {}, None
    segs = []
    for k, (at, cue, blen) in enumerate(cues):
        end = cues[k + 1][0] if k + 1 < len(cues) else total / FPS
        segs.append((at, end, cue))
    tracks = {}
    for at, end, cue in segs:
        name = cue["track"]
        if name not in tracks:
            tracks[name] = load_audio(MUSIC[name])
        x = tracks[name]
        start = heads.get(name, 0.0) if not cue.get("restart") else 0.0
        i0, i1 = int(at * RATE), int(end * RATE)
        L = i1 - i0
        j0 = int(start * RATE)
        idx = (np.arange(L) + j0) % len(x)
        chunk = x[idx].copy()
        fade = int(0.6 * RATE)
        ramp = np.ones(L)
        ramp[:fade] = np.linspace(0, 1, min(fade, L))[:fade] if L > fade else np.linspace(0, 1, L)
        if cue.get("fadeout"):
            fo = int(cue["fadeout"] * RATE)
            ramp[-fo:] *= np.linspace(1, 0, min(fo, L))
        music[i0:i1] += chunk * ramp
        base[i0:i1] = cue["vol"]
        heads[name] = start + L / RATE
        if not cue.get("only") and prev and prev != name:
            pass
        prev = name
    # огибающая: под голосом — базовая громкость, без голоса — громче (×2.2), под цитатами — тише
    def activity(x, thr=-42):
        e = movavg(np.abs(x), 2400)
        return (20 * np.log10(e + 1e-9) > thr).astype(np.float32)
    act_v = activity(voice)
    act_q = activity(quote)
    hold = int(0.6 * RATE)
    act_v = movavg(act_v, hold) > 0
    act_q = movavg(act_q, hold) > 0
    gain = base * np.where(act_q, 0.35, np.where(act_v, 1.0, 2.2))
    gain = np.minimum(gain, 0.5)
    sm = int(0.2 * RATE)
    gain = movavg(gain, sm)
    pk = np.abs(music).max() or 1
    music = music / pk * gain
    out = voice + quote + fx + music
    out = out[RENDER_AUDIO_DELAY:]
    raw = PUB / "_mix_raw.wav"
    write_wav(raw, out)
    # громкость -16 LUFS, два прохода loudnorm (линейно)
    m = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    js = json.loads(m[m.rindex("{"): m.rindex("}") + 1])
    ff("-i", raw, "-af", f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:"
       f"measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true",
       "-ar", RATE, "-ac", 2, PUB / "audio.wav")
    raw.unlink()
    print(f"звук: {len(out) / RATE / 60:.2f} мин, исходная громкость {js['input_i']} LUFS -> -16")


def write_wav(p, x):
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(RATE)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


# ---------------- субтитры ----------------
LIVE_TEXT = {"IMG_3121": "Всем доброе утро! Начинается новое приключение. Мы едем в Лао Бао, Лаос, вот на таком слипбасе.",
             "IMG_3156": "Границу прошли, сидим вот в такой кафешке."}


def ts(x):
    ms = int(round(x * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def write_srt(words, beats, events):
    lines, cur = [], []
    for w in words:
        if cur and (len(" ".join(x[2] for x in cur + [w])) > 42 or w[0] - cur[-1][1] > 0.6 or w[1] - cur[0][0] > 4):
            lines.append(cur)
            cur = []
        cur.append(w)
        if re.search(r"[.!?…]$", w[2]):
            lines.append(cur)
            cur = []
    if cur:
        lines.append(cur)
    items = [(l[0][0], l[-1][1] + 0.15, " ".join(x[2] for x in l)) for l in lines]
    for kind, at, src, off, length, vol in events:
        if kind == "live" and Path(src).stem in LIVE_TEXT:
            parts = re.split(r"(?<=[.!?])\s+", LIVE_TEXT[Path(src).stem])
            step = length / len(parts)
            items += [(at + i * step, at + (i + 1) * step, p) for i, p in enumerate(parts)]
        if kind == "quote":
            items.append((at, at + length, QUOTES[Path(src).stem]["text"]))
    items.sort()
    out = "\n".join(f"{i + 1}\n{ts(a)} --> {ts(min(b, items[i + 1][0] - 0.02) if i + 1 < len(items) else b)}\n{txt}\n"
                    for i, (a, b, txt) in enumerate(items))
    (PUB / "subs.ru.srt").write_text(out, encoding="utf-8")


if __name__ == "__main__":
    main()

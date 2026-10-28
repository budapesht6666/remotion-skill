"""Звуки и музыка для роликов про прогулку -> public/clips/<Комп>/sfx/.

    python scripts/dogwalk-sfx.py                  # DogWalk: Monkeys Spinning Monkeys
    python scripts/dogwalk-sfx.py DogWalkRitchie   # «Большой куш»: свой трек из Lyria

Эффекты берутся из локальной библиотеки канала (Sonniss GDC 2026, лицензия
без атрибуции, но и без раздачи исходников — поэтому только в public/clips,
который не коммитится). Три звука синтезируются из самой музыки, чтобы
звучали с ней заодно: остановка ленты на стоп-кадре крючка, перемотка назад
и грустный тромбон «ушёл к другому».
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent.parent
COMP = sys.argv[1] if len(sys.argv) > 1 else "DogWalk"
OUT = ROOT / "public/clips" / COMP / "sfx"
LIB = Path(r"C:\projects\claude\ArtCraft\channel\local")
SON = LIB / "sfx/sonniss/2026"
# DogWalkRitchie: трек сгенерирован Google Lyria (lyria-3-pro-preview) под «британскую
# криминальную комедию» и выбран из двух вариантов и Scheming Weasel сравнением в Gemini.
MUSIC = {
    "DogWalk": LIB / "music/monkeys_spinning_monkeys.mp3",
    "DogWalkRitchie": ROOT / "me/dog-walk/ritchie/music/lyria_b.mp3",
}[COMP]
RATE = 48000

# имя -> (файл, начало, длина, громкость в дБ)
CUTS = {
    "braam": ("Jake Fielding - Cinematic Horn Braams/DSGNBram____Cinematic Horn Braam, Epic, Cinematic, Dark, Instrument, Huge-32.wav", 0, 2.2, -4),
    "boing": ("Cinematic Sound Design - UI Interaction Elements/Accept Boing Crunch.wav", 0, 1.0, -3),
    "pop": ("Cinematic Sound Design - Interface & Infographics/Interface Pop High Short.wav", 0, 0.65, -4),
    "whoosh": ("Cinematic Sound Design - Ultra Transitions & Impacts/Woosh Sweep Slide Infographics Basic.wav", 0, 0.5, -3),
    "smack": ("Epic Stock Media - Anime Game/FGHTImpt_Combat Punch Impact Light Hit Delay Crunchy Vintage Quick Smack 05_ESM_AG.wav", 0, 1.05, -2),
    "cheer": ("Sonik Sound Library - Spanish Crowds/CRWDCheer_Small Club, 50 People, Crowd, Spanish, Cheering and Applause-Surround_KSL_KS015.wav", 1.0, 4.0, -2),
    "thunder": ("Jake Fielding - Interior Wind Rain and Storms/THUN_Interior Thunder Rumble_JF_INT Storm_01.wav", 0, 4.0, 0),
    "rain": ("The Noisery - City Rain/RAINConc_Rain Medium Exterior Splatter City Traffic 6_The Noisery_City Rain.wav", 10, 8.0, -6),
    "check": ("CB_Sounddesign - Applicable Sounds - Organic UI and Building Games SFX/UIMisc_Kalimba 3 Up_CB Sounddesign_APPlicable Sounds.wav", 0, 0.55, -4),
    "dizzy": ("Cinematic Sound Design - Cartoon Bloopers/Cartoon Confused Dizzy.wav", 0, 1.5, -4),
    "glitch": ("The Noisery - Rich Glitch/UIGlitch_User interface_Glitch_High_Electronic_The Noisery_Rich Glitch_05.wav", 0, 0.6, -8),
    "pops": ("Cinematic Sound Design - Cartoon Impacts/Cartoon Pops Random Sequence Reverb.wav", 0, 1.4, -5),
    "confetti": ("Cinematic Sound Design - Hybrid Game & UI Elements/Cofetti Whoosh Pluck Spill.wav", 0, 2.5, -4),
}


def cut(name, rel, start, length, gain):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-t", str(length), "-i", str(SON / rel),
                    "-af", f"afade=t=out:st={length - 0.08}:d=0.08,volume={gain}dB",
                    "-ac", "2", "-ar", str(RATE), str(OUT / f"{name}.wav")], check=True)


def load_music():
    tmp = OUT / "_music.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(MUSIC), "-ac", "2", "-ar", str(RATE), str(tmp)], check=True)
    _, x = wavfile.read(tmp)
    tmp.unlink()
    return x.astype(np.float32) / 32768


def resample_by_rate(x, start, rates):
    """Проиграть x с позиции start с переменной скоростью rates[i] (отрицательная — назад)."""
    pos = start + np.cumsum(rates)
    pos = np.clip(pos, 0, len(x) - 2)
    i = pos.astype(int)
    f = (pos - i)[:, None]
    return x[i] * (1 - f) + x[i + 1] * f


def save(name, y):
    y = np.clip(y, -1, 1)
    wavfile.write(OUT / f"{name}.wav", RATE, (y * 32767).astype(np.int16))


def tape_stop(x, play=1.4, stop=0.5):
    """Музыка крючка: play секунд как есть, потом лента тормозит до нуля за stop."""
    n_play, n_stop = int(play * RATE), int(stop * RATE)
    rates = np.concatenate([np.ones(n_play), np.linspace(1, 0, n_stop) ** 1.6])
    y = resample_by_rate(x, 0, rates)
    y[-n_stop:] *= np.linspace(1, 0.2, n_stop)[:, None]
    return y


def rewind(x, at=1.9, dur=0.75):
    """Перемотка назад с разгоном: музыка крутится обратно всё быстрее."""
    n = int(dur * RATE)
    rates = -np.linspace(1.5, 9, n)
    y = resample_by_rate(x, int(at * 8 * RATE), rates)
    env = np.minimum(1, np.linspace(0, 6, n))[:, None] * np.minimum(1, np.linspace(5, 0, n))[:, None]
    return y * env * 0.8


def sad_trombone():
    """Ва-ва-ва-ваааа: четыре ноты вниз, последняя с вибрато."""
    notes = [(293.7, 0.32), (277.2, 0.32), (261.6, 0.32), (246.9, 1.1)]
    out = []
    for k, (hz, d) in enumerate(notes):
        t = np.arange(int(d * RATE)) / RATE
        vib = 1 + (0.012 * np.sin(2 * np.pi * 6 * t) * np.minimum(1, t / 0.3) if k == 3 else 0)
        phase = 2 * np.pi * np.cumsum(hz * vib) / RATE
        tone = sum(np.sin(h * phase) / h ** 1.3 for h in range(1, 9))
        env = np.minimum(1, t / 0.04) * np.minimum(1, (d - t) / 0.08)
        out.append(tone * env)
    y = np.concatenate(out) * 0.28
    return np.stack([y, y], axis=1)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (rel, start, length, gain) in CUTS.items():
        cut(name, rel, start, length, gain)
    x = load_music()
    save("music", x)
    save("tapestop", tape_stop(x))
    save("rewind", rewind(x))
    save("trombone", sad_trombone())
    print("готово:", ", ".join(sorted(p.stem for p in OUT.glob("*.wav"))))


if __name__ == "__main__":
    main()

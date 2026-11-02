"""Звук мема «Красота-то какая! Лепота!»: голос из референса и подложки -> public/clips/<Комп>/.

    python scripts/lepota-audio.py                       # VietnamLepota
    python scripts/lepota-audio.py VietnamLepotaLong

Голос — 5-секундный ролик сцены (me/vietnam-barbecue-2/ref/ref.wav, Groq Whisper:
«Красота-то» 0.50, «Лепота!» 3.50–4.50). Две нарезки:
  voice.wav  — вся фраза; «Лепота!» слышна через 3.27 c от начала файла;
  lepota.wav — одно слово; слышно через 0.10 c от начала файла.
Обе уже учитывают отставание звука в рендере Remotion (2048 сэмплов = 42.7 мс):
файл режется на столько же позже. Композиция ставит файл так, чтобы слово
пришлось ровно на `at` из монтажного листа.

Подложки — из библиотеки Sonniss (папка задаётся SFX_DIR), каждая по 12 c на
одной громкости, дальше громкость задаёт монтажный лист.
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMP = sys.argv[1] if len(sys.argv) > 1 else "VietnamLepota"
OUT = ROOT / "public/clips" / COMP
REF = ROOT / "me/vietnam-barbecue-2/ref/ref.wav"
SFX = Path(os.environ.get("SFX_DIR", "C:/projects/claude/ArtCraft/channel/local/sfx/sonniss/2026"))
DELAY = 2048 / 48000

VOICE = "highpass=f=70,afade=t=in:d=0.02,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000"
BEDS = {
    "birds": ("344 Audio - East Coast America Vol. 1/AMBSubn_Ambience, Forest Crickets, Birds, "
              "Connecticut 02_344 Audio_East Coast America.wav", 4.0, ""),
    "bells": ("Ivo Vicic - Church Bells/25 Church Bells, Far Distance, Rural Soundscape Distant, "
              "Hills Ridge, Spring 02.wav", 2.0, ""),
    # Самый плотный кусок шипения — 8–20 c (замер по полосе выше 2.5 кГц).
    "sizzle": ("Ivo Vicic - Campfire - Bonfire FX/24 Campfire, Dropping Fresh Pine Branches in Fire, "
               "Crackling, Sizzling Strong, Close 02.wav", 8.0, "highpass=f=300,"),
}


def ff(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ff("-ss", f"{3.50 - 3.27 + DELAY:.4f}", "-to", "4.733", "-i", str(REF), "-af", VOICE, "-ac", "2",
       str(OUT / "voice.wav"))
    ff("-ss", f"{3.50 - 0.10 + DELAY:.4f}", "-to", "4.733", "-i", str(REF), "-af", VOICE, "-ac", "2",
       str(OUT / "lepota.wav"))
    for name, (path, start, pre) in BEDS.items():
        ff("-ss", str(start), "-t", "12", "-i", str(SFX / path),
           "-af", f"{pre}loudnorm=I=-20:TP=-2,aresample=48000", "-ac", "2", str(OUT / f"{name}.wav"))
    print("готово:", OUT)


if __name__ == "__main__":
    main()

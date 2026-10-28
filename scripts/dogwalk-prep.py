"""Подготовка копий для роликов про прогулку: монтажный лист edit.json -> клипы и живой звук.

    python scripts/dogwalk-prep.py                          # DogWalk, все планы
    python scripts/dogwalk-prep.py slam jump                # только эти
    python scripts/dogwalk-prep.py DogWalkRitchie           # другая композиция
    python scripts/dogwalk-prep.py DogWalkRitchie slam jump

Монтажный лист может задать свой грейд (`grade`, фильтр ffmpeg после
тонмаппинга) и свою обработку живого звука (`liveFilter`). Фото при заданном
грейде становится кадром 1080x1920 (`{id}.png`, кадрирование по `focus`),
чтобы маски персонажей ложились на него один в один.

Исходники (Google Фото, VP9 10 бит HLG) не трогаются. Каждый план становится
отдельным файлом в public/clips/DogWalk/: видео 1080x1920/30 без звука (.mp4),
стоп-кадр (.png) или фото (.jpg). Живой звук всех планов собирается ОДНОЙ
дорожкой live.wav встык по длинам планов в кадрах: на границах <Sequence>
Remotion теряет десятки миллисекунд звука, и реплика рвалась бы на склейке.

Длина плана в кадрах считается так же, как в DogWalk.tsx (floor(x + 0.5)):
round() в Python банковский и разошёлся бы с Math.round на половинках.
"""
import json
import math
import subprocess
import sys
import wave
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
ARGS = sys.argv[1:]
COMP = ARGS.pop(0) if ARGS and (ROOT / "src/compositions" / ARGS[0]).is_dir() else "DogWalk"
EDIT = json.loads((ROOT / "src/compositions" / COMP / "edit.json").read_text(encoding="utf-8"))
FPS = EDIT["fps"]
SRC = ROOT / EDIT["srcDir"]
OUT = ROOT / EDIT["outDir"]
RATE = 48000

# HLG -> SDR: hable без обесцвечивания пересыщает рыжего пса в апельсин,
# поэтому насыщенность после тонмаппинга приглушена (сверено глазами с Google Фото).
TONEMAP = ("zscale=tin=arib-std-b67:min=bt2020nc:pin=bt2020:rin=tv:t=linear:npl=100,"
           "format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,"
           "zscale=t=bt709:m=bt709:r=tv,format=yuv420p,hue=s=0.72")
GRADE = EDIT.get("grade")
if GRADE:
    TONEMAP = f"{TONEMAP},{GRADE}"
# Ветер в микрофоне телефона: срезаем низ, давим шум, поднимаем тихую речь.
VOICE = EDIT.get("liveFilter") or ("highpass=f=140,afftdn=nf=-25,"
                                    "acompressor=threshold=-30dB:ratio=4:attack=5:release=150:makeup=6")


def frames(shot):
    if "dur" in shot:
        sec = shot["dur"]
    else:
        sec = (shot["to"] - shot["from"]) / shot.get("speed", 1)
    return math.floor(sec * FPS + 0.5)


def ff(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def src_fps(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=r_frame_rate", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True, check=True).stdout.strip().strip(",")
    n, d = r.split("/")
    return int(n) / int(d)


def video(shot, n):
    src = SRC / shot["src"]
    speed = shot.get("speed", 1)
    chain = [TONEMAP]
    if shot.get("reverse"):
        # Перемотка назад: в 540p, чтобы reverse не держал в памяти 1080p-кадры.
        chain = ["scale=540:960", TONEMAP, "reverse",
                 f"setpts=PTS*{shot['dur'] / (shot['to'] - shot['from'])}"]
    else:
        need = FPS / speed
        if need > src_fps(src) + 1:
            # Замедление 30-кадрового исходника: дорисовываем промежуточные кадры,
            # иначе вышло бы 15 уникальных кадров в секунду (рывками).
            chain.append(f"minterpolate=fps={need:g}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1")
        chain.append(f"setpts=(PTS-STARTPTS)/{speed}")
    chain += [f"fps={FPS}", "scale=1080:1920:flags=lanczos", "tpad=stop_mode=clone:stop_duration=2"]
    ff("-ss", str(shot["from"]), "-t", str(shot["to"] - shot["from"]), "-i", str(src),
       "-vf", ",".join(chain), "-frames:v", str(n), "-an",
       "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p",
       str(OUT / f"{shot['id']}.mp4"))


def still(shot):
    ff("-ss", str(shot["freeze"]), "-i", str(SRC / shot["src"]), "-frames:v", "1",
       "-vf", f"{TONEMAP},scale=1080:1920:flags=lanczos", str(OUT / f"{shot['id']}.png"))


def photo(shot):
    im = ImageOps.exif_transpose(Image.open(SRC / shot["photo"])).convert("RGB")
    if not GRADE:
        im.thumbnail((1440, 1920))
        im.save(OUT / f"{shot['id']}.jpg", quality=92)
        return
    # Кадр 9:16 по точке фокуса, потом тот же грейд, что у видео.
    fx, fy = shot.get("focus", [0.5, 0.5])
    k = max(1080 / im.width, 1920 / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x = round((im.width - 1080) * fx)
    y = round((im.height - 1920) * fy)
    tmp = OUT / f"_{shot['id']}.png"
    im.crop((x, y, x + 1080, y + 1920)).save(tmp)
    ff("-i", str(tmp), "-vf", GRADE, "-frames:v", "1", str(OUT / f"{shot['id']}.png"))
    tmp.unlink()


def audio(shot, n, path):
    """Живой звук плана ровно на n кадров; без звука — тишина той же длины."""
    samples = n * RATE // FPS
    gain = shot.get("live")
    if gain and "photo" not in shot and not shot.get("reverse"):
        start = shot.get("freeze", shot.get("from"))
        length = shot["dur"] if "freeze" in shot else shot["to"] - shot["from"]
        af = [VOICE, f"volume={gain}"]
        if "pitch" in shot:
            # Замедление вместе с тоном: «Нет-нет-нет» басом под слоу-мо.
            af += [f"asetrate=44100*{shot['pitch']}", f"aresample={RATE}"]
        elif shot.get("speed", 1) != 1:
            af.append(f"atempo={shot['speed']}")
        af += [f"aresample={RATE}", "apad", f"atrim=end_sample={samples}"]
        ff("-ss", str(start), "-t", str(length), "-i", str(SRC / shot["src"]), "-map", "0:a:0",
           "-af", ",".join(af), "-ac", "2", "-ar", str(RATE), "-c:a", "pcm_s16le", str(path))
    else:
        ff("-f", "lavfi", "-i", f"anullsrc=r={RATE}:cl=stereo", "-af", f"atrim=end_sample={samples}",
           "-c:a", "pcm_s16le", str(path))


def main(only):
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = OUT / "_audio"
    tmp.mkdir(exist_ok=True)
    total = 0
    for shot in EDIT["shots"]:
        n = frames(shot)
        total += n
        if not only or shot["id"] in only:
            if "photo" in shot:
                photo(shot)
            elif "freeze" in shot:
                still(shot)
            else:
                video(shot, n)
            print(f"{shot['id']:16} {n:4} кадров", flush=True)
        apath = tmp / f"{shot['id']}.wav"
        if not only or shot["id"] in only or not apath.exists():
            audio(shot, n, apath)
    with wave.open(str(OUT / "live.wav"), "wb") as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(RATE)
        for shot in EDIT["shots"]:
            with wave.open(str(tmp / f"{shot['id']}.wav"), "rb") as w:
                out.writeframes(w.readframes(w.getnframes()))
    print(f"итого {total} кадров = {total / FPS:.2f} c")


if __name__ == "__main__":
    main(set(ARGS))

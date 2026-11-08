"""
Обложка `logo.jpg` — самый ЧЁТКИЙ кадр из самого ролика, без обработки.

    python scripts/sharp-cover.py <клип.mp4> <лист.png>               # 10 самых резких моментов на лист
    python scripts/sharp-cover.py <клип.mp4> <logo.jpg> --frame N     # сохранить выбранный кадр как есть

Зачем. Кадр «на глаз» часто попадает на смаз движения камеры или актёра, и
обложка выходит мыльной. Скрипт проходит каждый кадр клипа без субтитров
(`public/clips/<Comp>/*.mp4`), меряет резкость (дисперсия лапласиана в зоне
лица — верхние 60 % кадра), берёт 10 лучших моментов, разнесённых минимум на
1.5 c, и кладёт их на лист с номерами кадров. Выбор по выражению лица — глазами,
сохранение — кадр как есть, JPEG 95.

НИКАКОГО увеличения нейросетью: заказчик просил чёткий кадр из видео, а не
перерисованный — Real-ESRGAN дал «пластиковую» кожу и был отвергнут.
"""
import argparse
import sys

import cv2
from PIL import Image, ImageDraw, ImageFont


def frames(path: str):
    cap = cv2.VideoCapture(path)
    n = 0
    while True:
        ok, fr = cap.read()
        if not ok:
            return
        yield n, fr
        n += 1


def sharpness(fr) -> float:
    g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
    h, w = g.shape
    return float(cv2.Laplacian(g[int(h * 0.1):int(h * 0.6), int(w * 0.1):int(w * 0.9)], cv2.CV_64F).var())


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("clip")
    ap.add_argument("out")
    ap.add_argument("--frame", type=int, help="номер кадра с листа — сохранить его как обложку")
    a = ap.parse_args()

    if a.frame is not None:
        for n, fr in frames(a.clip):
            if n == a.frame:
                cv2.imwrite(a.out, fr, [cv2.IMWRITE_JPEG_QUALITY, 95])
                print(f"обложка: {a.out} (кадр {n}, {fr.shape[1]}×{fr.shape[0]})")
                return
        sys.exit(f"в клипе нет кадра {a.frame}")

    fps = cv2.VideoCapture(a.clip).get(cv2.CAP_PROP_FPS)
    scores = [(sharpness(fr), n) for n, fr in frames(a.clip)]
    picked: list[tuple[float, int]] = []
    for s, n in sorted(scores, reverse=True):
        if all(abs(n - m) > fps * 1.5 for _, m in picked):
            picked.append((s, n))
        if len(picked) == 10:
            break
    picked.sort(key=lambda p: p[1])

    want = {n: s for s, n in picked}
    font = ImageFont.truetype("arial.ttf", 14)
    tiles = []
    for n, fr in frames(a.clip):
        if n in want:
            im = Image.fromarray(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB)).resize((216, 384))
            d = ImageDraw.Draw(im)
            d.rectangle([0, 360, 216, 384], fill=(0, 0, 0))
            d.text((4, 364), f"{n / fps:.2f}s  кадр {n}", fill=(255, 255, 0), font=font)
            tiles.append(im)
        if len(tiles) == len(want):
            break
    sheet = Image.new("RGB", (5 * 218, 2 * 386))
    for k, im in enumerate(tiles):
        sheet.paste(im, ((k % 5) * 218, (k // 5) * 386))
    sheet.save(a.out)
    print(f"лист: {a.out}; кадры: {' '.join(str(n) for _, n in picked)}")


if __name__ == "__main__":
    main()

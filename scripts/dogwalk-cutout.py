"""Маски персонажей для стоп-кадров DogWalkRitchie: вырезка PhotoCraft -> полный кадр с альфой.

    python scripts/dogwalk-cutout.py [Комп]

Вырезку делает PhotoCraft (`layer.removeBackground` = Select Subject) по
кадру, обрезанному вокруг героя (cut/<id>_crop.png -> cut/<id>_mask.png, через
MCP): на целом кадре «главным объектом» он выбирал девушку, а не собаку.
Маска Ницше снята с того же кадра до грейда (геометрия та же), остальные —
с кадров после грейда. Этот скрипт возвращает маску на место в кадре 1080x1920, дочищает её и
пишет <id>_cut.png — герой с прозрачным фоном ровно поверх <id>.png.

Дочистка. Серую шерсть PhotoCraft путает с серым асфальтом и прихватывает
кусок дороги за спиной: у собак (`dogs`) оставляем только насыщенные или
светлые пиксели. У людей так нельзя — чёрная футболка того же цвета, что
асфальт, — им достаётся только самая крупная связная область без дыр.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
COMP = sys.argv[1] if len(sys.argv) > 1 else "DogWalkRitchie"
OUT = ROOT / "public/clips" / COMP
DOGS = {"nietzscheCard", "woodpeckerCard"}

# Правки под конкретные кадры (координаты полного кадра 1080x1920), подобраны по
# проверочным листам cut/<id>_check.jpg.
# Турист: белую футболку на светлом фоне PhotoCraft не взял — плечи дорисованы.
ADD = {"touristCard": [(0, 1580), (170, 1540), (330, 1480), (700, 1480), (780, 1600), (900, 1640),
                       (1080, 1660), (1080, 1920), (0, 1920)],
       # Банк: макушку PhotoCraft срезал — голова по контуру волос, правее профиля лица.
       "bankCard": [(622, 400), (640, 365), (670, 345), (720, 338), (770, 345), (810, 370), (832, 420),
                    (840, 520), (800, 560), (660, 560)]}
# Прямоугольники (x0, y0, x1, y1), которые точно не герой: бордюр над головой
# Ницше; бордюр, полоса и мусор вокруг Банка; плечо девушки над кепкой Туриста.
CLEAR = {
    "bankCard": [(500, 280, 600, 870), (600, 560, 645, 870), (840, 440, 1000, 500), (925, 680, 1000, 1000)],
    "touristCard": [(0, 860, 700, 1028), (100, 1030, 200, 1150), (195, 1015, 262, 1140)],
}


def fur(bgr):
    """Шерсть рыжего и белого пса после тёплого грейда: рыжие тона или светлое.
    Тень на асфальте после грейда тоже тёплая, но тёмная — она отсекается яркостью."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    h, s, v = hsv[:, :, 0], hsv[:, :, 1] / 255, hsv[:, :, 2] / 255
    orange = (h >= 4) & (h <= 28) & (s > 0.22) & (v > 0.3)
    return ((orange | (v > 0.7)) * 255).astype(np.uint8)


def not_sidewalk(bgr, y0):
    """Банк: светло-серый тротуар и зелёный бак выше пояса — не она."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    h, s, v = hsv[:, :, 0], hsv[:, :, 1] / 255, hsv[:, :, 2] / 255
    bad = ((s < 0.14) & (v > 0.5)) | ((h > 35) & (h < 90) & (s > 0.2))
    rows = np.arange(bgr.shape[0])[:, None] + y0
    cols = np.arange(bgr.shape[1])[None, :] + 500
    # У головы тротуар после тёплого грейда почти как кожа — там порог строже.
    head = (rows > 380) & (rows < 720) & (cols < 660)
    bad |= head & (s < 0.24) & (v > 0.42)
    bad &= rows < 1150
    return ((~bad) * 255).astype(np.uint8)


def largest(mask):
    n, lab, st, _ = cv2.connectedComponentsWithStats((mask > 127).astype(np.uint8))
    if n < 2:
        return mask
    big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    m = np.where(lab == big, 255, 0).astype(np.uint8)
    # Дыры внутри силуэта (блик, тень между лап) закрываем.
    inv = (m == 0).astype(np.uint8)
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(inv)
    h, w = m.shape
    for i in range(1, n2):
        x, y, bw, bh, area = st2[i]
        if area < 4000 and x > 0 and y > 0 and x + bw < w and y + bh < h:
            m[lab2 == i] = 255
    return m


OUTLINE_PX = 14


def smooth(mask):
    """Контур без лесенки: прямоугольные зачистки и пиксельный край маски
    скругляются эллипсом, порог по размытой маске даёт плавную линию, лёгкая
    растушёвка — сглаженный край вместо зубцов."""
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))
    m = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)
    m = cv2.GaussianBlur(m, (0, 0), 3)
    m = np.where(m > 127, 255, 0).astype(np.uint8)
    return cv2.GaussianBlur(m, (0, 0), 1.1)


def outline(mask):
    """Белая обводка героя: маска, расширенная кругом на OUTLINE_PX, со сглаженным
    краем. Раньше обводку давали четыре сдвинутых drop-shadow по 5 px — на
    диагоналях они рисовали лесенку, и рамка выглядела тонкой и «пиксельной»."""
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * OUTLINE_PX + 1, 2 * OUTLINE_PX + 1))
    m = cv2.dilate(np.where(mask > 127, 255, 0).astype(np.uint8), k)
    m = cv2.GaussianBlur(m, (0, 0), 1.4)
    white = np.full((*m.shape, 3), 255, np.uint8)
    return np.dstack([white, m])


def main():
    boxes = json.loads((OUT / "cut/boxes.json").read_text())
    for cid, (x0, y0, x1, y1) in boxes.items():
        plate = cv2.imread(str(OUT / f"{cid}.png"), cv2.IMREAD_COLOR)
        cut = cv2.imread(str(OUT / f"cut/{cid}_mask.png"), cv2.IMREAD_UNCHANGED)
        a = cut[:, :, 3]
        if cid in DOGS:
            # Только рядом с шерстью: пасть, нос и глаза тёмные, но они в шаге от
            # рыжего, а дальний асфальт — нет.
            near = cv2.dilate(fur(cut[:, :, :3]), np.ones((25, 25), np.uint8))
            a = cv2.bitwise_and(a, near)
            if cid == "woodpeckerCard":
                # Белый пёс: тень под лапами тёмная — вон; нос и глаза тоже тёмные,
                # но они внутри силуэта, их вернёт заливка дыр в largest().
                v = cv2.cvtColor(cut[:, :, :3], cv2.COLOR_BGR2HSV)[:, :, 2]
                a[v < 120] = 0
            a = cv2.morphologyEx(a, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        if cid == "bankCard":
            a = cv2.bitwise_and(a, not_sidewalk(cut[:, :, :3], y0))
            a = cv2.morphologyEx(a, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        full = np.zeros(plate.shape[:2], np.uint8)
        full[y0:y1, x0:x1] = a
        for poly in [ADD[cid]] if cid in ADD else []:
            cv2.fillPoly(full, [np.array(poly, np.int32)], 255)
        for cx0, cy0, cx1, cy1 in CLEAR.get(cid, []):
            full[cy0:cy1, cx0:cx1] = 0
        full = cv2.morphologyEx(full, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        full = largest(full)
        full = smooth(full)
        cv2.imwrite(str(OUT / f"{cid}_cut.png"), np.dstack([plate, full]))
        cv2.imwrite(str(OUT / f"{cid}_outline.png"), outline(full))
        # Проверка глазами: герой поверх красного.
        red = np.zeros_like(plate)
        red[:] = (60, 30, 200)
        k = full[:, :, None] / 255.0
        cv2.imwrite(str(OUT / f"cut/{cid}_check.jpg"), cv2.resize((plate * k + red * (1 - k)).astype(np.uint8), (270, 480)))
        print(cid, "ok")


if __name__ == "__main__":
    main()

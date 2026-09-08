"""
Трекинг лиц в куске видео — под кадрирование чужих кадров в вертикаль.

    python scripts/lib/face_track.py <видео> <start> <end> <шаг, c> <модель.onnx>

Печатает JSON: [{"t": 0.0, "faces": [{"x": 0.42, "w": 0.12, "score": 0.93}, ...]}]
— доли ШИРИНЫ кадра, время от начала куска.

Зачем. Вертикальное окно 9:16 показывает лишь треть ширины кадра 16:9, поэтому
голову говорящего в него нужно ставить осознанно, а на глаз по миниатюрам это
не выходит: в ситкоме камера ездит, планы меняются каждые 1–2 секунды. Детектор
(YuNet) даёт положение лиц по кадрам, а решение «кого вести» принимается выше,
в scripts/track-faces.ts, где известны границы планов.

Детектор фронтальный: собеседник, стоящий к камере затылком, обычно не
находится — это как раз на руку, в «восьмёрке» лицом к нам повёрнут говорящий.
"""
import json
import sys

import cv2


def main() -> None:
    video, start, end, step, model = sys.argv[1:6]
    start, end, step = float(start), float(end), float(step)

    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        raise SystemExit(f"не открывается: {video}")
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    detector = cv2.FaceDetectorYN.create(
        model,
        "",
        (width, height),
        # Порог ниже дефолтного: на web-rip 704×400 лица мелкие и мягкие, при
        # 0.9 детектор теряет их в половине кадров и трек рвётся.
        score_threshold=0.6,
        nms_threshold=0.3,
        top_k=20,
    )

    out = []
    t = start
    while t < end:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, frame = cap.read()
        if not ok:
            break
        _, faces = detector.detect(frame)
        items = []
        if faces is not None:
            for f in faces:
                x, y, w, h = f[0], f[1], f[2], f[3]
                # YuNet отдаёт пять точек: глаза, нос, углы рта. По ним видно,
                # повёрнуто лицо к камере или в профиль: у анфаса нос стоит
                # ровно между глазами. Это и есть признак говорящего в
                # «восьмёрке» — собеседник в кадре обычно в профиль или
                # затылком, даже когда он ближе к камере и крупнее.
                eye_r_x, eye_l_x = float(f[4]), float(f[6])
                nose_x = float(f[8])
                span = abs(eye_l_x - eye_r_x)
                if span > 1e-3:
                    center = (eye_l_x + eye_r_x) / 2
                    frontal = max(0.0, 1.0 - abs(nose_x - center) / (span / 2))
                else:
                    frontal = 0.0
                items.append(
                    {
                        "x": round(float(x + w / 2) / width, 4),
                        "y": round(float(y + h / 2) / height, 4),
                        "w": round(float(w) / width, 4),
                        "frontal": round(frontal, 3),
                        "score": round(float(f[-1]), 3),
                    }
                )
        out.append({"t": round(t - start, 3), "faces": items})
        t += step

    cap.release()
    json.dump({"width": width, "height": height, "samples": out}, sys.stdout)


if __name__ == "__main__":
    main()

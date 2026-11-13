"""Полоски кадров клипа вокруг каждой ступеньки pan (пара точек с зазором ≤0.02):
кадры k-2..k+2, где k — первый кадр с новым окном. Смена картинки обязана совпасть со сменой окна.
usage: stepcheck.py <Comp> <beatId> <out.png>"""
import sys, re, subprocess, math
from PIL import Image
comp, beat, out = sys.argv[1:4]
FPS = 24000 / 1001
src = open(f'src/compositions/{comp}/script.ts', encoding='utf-8').read()
i = src.index(f'id: "{beat}"'); nxt = src.find('id: "', i + 5); nxt = len(src) if nxt < 0 else nxt
j = src.find('pan: [', i)
if 0 <= j < nxt:
    k = src.index('],', j)
    pts = [(float(a), float(b)) for a, b in re.findall(r't: ([\d.]+), x: ([\d.]+)', src[j:k])]
else:
    import json
    pts = [(p['t'], p['x']) for p in json.load(open(f'data/track/{comp}.json'))[beat]['pan']]
steps = [b[0] for a, b in zip(pts, pts[1:]) if 0 < b[0] - a[0] <= 0.02 and abs(b[1] - a[1]) > 0.04]
clip = f'public/clips/{comp}/{beat}.mp4'
rows = []
for t in steps:
    kf = math.ceil(t * FPS - 1e-6)
    sel = '+'.join(f'eq(n,{n})' for n in range(kf - 2, kf + 3))
    tmp = f'out/{comp}/step_{beat}_{kf}.png'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', clip, '-vf', f"select='{sel}',scale=216:384,tile=5x1", '-frames:v', '1', '-vsync', '0', tmp], check=True)
    rows.append(Image.open(tmp)); print(f'ступенька t={t} → кадр {kf}: кадры {kf-2}..{kf+2}, новое окно с 3-го')
W = max(r.width for r in rows); o = Image.new('RGB', (W, sum(r.height for r in rows))); y = 0
for r in rows: o.paste(r, (0, y)); y += r.height
o.save(out)

"""Траектория трекера бита с подменой участков планов постоянным x.
usage: python override.py <Comp> <beatId> <beatStart> "<cutA>:<cutB>:<x>" ...
cutA/cutB — таймкоды склеек исходника (начало и конец плана). Ступенька ставится
на кадр раньше склейки (особенность AVI, см. series-cut). Печатает TS-массив pan."""
import json, sys
FR = 1001 / 24000
comp, beat, start = sys.argv[1], sys.argv[2], float(sys.argv[3])
pan = json.load(open(f'data/track/{comp}.json'))[beat]['pan']
def xat(t):
    if t <= pan[0]['t']: return pan[0]['x']
    for a, b in zip(pan, pan[1:]):
        if a['t'] <= t <= b['t']:
            return a['x'] if b['t'] == a['t'] else a['x'] + (b['x'] - a['x']) * (t - a['t']) / (b['t'] - a['t'])
    return pan[-1]['x']
for spec in sys.argv[4:]:
    # "cutA:cutB:x" — постоянный x; "cutA:cutB:src1=x1,src2=x2,…" — точки по замерам (время исходника)
    ca, cb, xs = spec.split(':'); ca, cb = float(ca), float(cb)
    pts = [(round(float(a) - start, 3), float(b)) for a, b in (kv.split('=') for kv in xs.split(','))] if '=' in xs else None
    x = pts[0][1] if pts else float(xs)
    t0 = round(max(0, ca - start - FR), 3); t1 = round(cb - start - FR, 3)
    end = pan[-1]['t']
    xb = xat(t1 + 0.06) if t1 < end else None
    xa = xat(t0 - 0.06)
    pan = [p for p in pan if not (t0 - 0.06 < p['t'] < t0)]
    new = [p for p in pan if p['t'] < t0 - 0.011]
    if t0 > 0: new.append({'t': round(t0 - 0.01, 3), 'x': xa})
    new.append({'t': t0, 'x': x})
    if pts:
        new += [{'t': t, 'x': v} for t, v in pts if t0 < t < t1 - 0.011]
        x = pts[-1][1]
    if t1 < end:
        new += [{'t': round(t1 - 0.01, 3), 'x': x}, {'t': t1, 'x': xb}]
        new += [p for p in pan if p['t'] > t1 + 0.05]
    else:
        new.append({'t': end, 'x': x})
    pan = new
print('    pan: [')
for p in pan: print(f"      {{ t: {round(p['t'], 3)}, x: {round(p['x'], 4)} }},")
print('    ],')
print(len(pan), 'точек', file=sys.stderr)

"""Вставка реплик из ответа large-v3 в индекс: слова [t0,t1] раскладываются по сегментам
по ПОРЯДКУ (столько слов, сколько токенов в text сегмента), id = <after>a, b, c…
Слова старого индекса внутри [t0,t1] удаляются. usage: insert.py <slug> <large.json> <after_id> <t0> <t1>"""
import json, sys
slug, lj, after, t0, t1 = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]), float(sys.argv[5])
p = f'data/index/{slug}/quotes.json'
q = json.load(open(p, encoding='utf-8')); items = q['quotes']
r = json.load(open(lj, encoding='utf-8'))
words = [w for w in r['words'] if t0 <= w['start'] < t1]
segs = [s for s in r['segments'] if s['end'] > t0 and s['start'] < t1 and s['text'].strip()]
new, k = [], 0
for n, s in enumerate(segs):
    cnt = len(s['text'].split()); ws = words[k:k + cnt]; k += cnt
    if not ws: continue
    new.append({'id': f"{after}{chr(97 + n)}", 'start': round(ws[0]['start'], 2), 'end': round(ws[-1]['end'], 2),
                'text': s['text'].strip(), 'words': [{'w': w['word'], 's': round(w['start'], 3), 'e': round(w['end'], 3)} for w in ws]})
for it in items:
    it['words'] = [w for w in it['words'] if not (t0 <= w['s'] < t1)]
i = next(j for j, it in enumerate(items) if it['id'] == after)
items[i + 1:i + 1] = new
json.dump(q, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for it in new: print(it['id'], it['start'], it['end'], it['text'], ' '.join(w['w'] for w in it['words']))

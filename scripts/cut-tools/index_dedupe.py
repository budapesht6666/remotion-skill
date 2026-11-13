"""Убирает слово-дубль на стыке соседних реплик (тот же w и s): оставляет там, где оно есть в text."""
import json, sys, re
def norm(s): return re.sub(r'[^\wё-]', '', s.lower())
for slug in sys.argv[1:]:
    p = f'data/index/{slug}/quotes.json'
    q = json.load(open(p, encoding='utf-8'))
    items = q['quotes'] if isinstance(q, dict) else q
    fixed = 0
    for a, b in zip(items, items[1:]):
        while a['words'] and b['words'] and a['words'][-1]['w'] == b['words'][0]['w'] and abs(a['words'][-1]['s'] - b['words'][0]['s']) < 0.01:
            w = norm(a['words'][-1]['w'])
            ta = [norm(x) for x in a['text'].split()]; tb = [norm(x) for x in b['text'].split()]
            if tb and tb[0] == w and not (ta and ta[-1] == w): a['words'].pop()
            else: b['words'].pop(0)
            fixed += 1
    for it in items:
        if it['words']: it['start'] = round(it['words'][0]['s'], 2); it['end'] = round(it['words'][-1]['e'], 2)
    json.dump(q, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(slug, 'дублей убрано:', fixed)

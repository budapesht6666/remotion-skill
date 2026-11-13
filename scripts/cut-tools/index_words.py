"""usage: python words.py <slug> <from_s> <to_s>  — реплики индекса с пословными таймингами"""
import json, sys
slug, a, b = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
q = json.load(open(f'data/index/{slug}/quotes.json', encoding='utf-8'))
items = q['quotes'] if isinstance(q, dict) else q
for it in items:
    if it['end'] >= a and it['start'] <= b:
        print(it['id'], ' '.join(f"{w['w']}[{w['s']:.2f}-{w['e']:.2f}]" for w in it['words']))

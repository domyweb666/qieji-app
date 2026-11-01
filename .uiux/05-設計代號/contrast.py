"""WCAG 2.x 對比計算（替代找不到的 skill 版 contrast.py）：讀 gen_pairs.py 產的 pairs.json，印 Markdown 表；有不過的 exit 1。"""
import json, sys
def lum(h):
    h = h.lstrip('#'); out = []
    for i in (0, 2, 4):
        v = int(h[i:i+2], 16) / 255
        out.append(v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2]
def ratio(a, b):
    x, y = sorted([lum(a), lum(b)]); return (y + 0.05) / (x + 0.05)
d = json.load(open(sys.argv[1], encoding='utf-8')); C = d['colors']; bad = 0; n = 0
print('| 字 | 底 | 位置 | 門檻 | 淺色 | 深色 | 增加對比・淺 | 增加對比・深 |')
print('|---|---|---|---|---|---|---|---|')
for p in d['pairs']:
    th = 3.0 if p['large'] else 4.5; cells = []
    for m in ('light', 'dark', 'hc_light', 'hc_dark'):
        r = ratio(C[p['fg']][m], C[p['bg']][m]); ok = r >= th; n += 1; bad += not ok
        cells.append(f"{r:.2f}:1 {'過' if ok else '**不過**'}")
    print(f"| {p['fg']} | {p['bg']} | {p['where']} | {th:.1f}:1 | " + ' | '.join(cells) + ' |')
print(f'\n共 {n} 組，不過 {bad} 組', file=sys.stderr)
sys.exit(1 if bad else 0)

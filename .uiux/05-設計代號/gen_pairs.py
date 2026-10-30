"""產生 contrast.py 要吃的 pairs.json。
淺色值全部抄自程式（theme.ts、model.ts、各畫面）；深色、增加對比是候選值（多米還沒看過）。
半透明的字色先跟底色合成成不透明色再算（contrast.py 只收 #RRGGBB）。
"""
import json, sys

def hex2rgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def rgb2hex(c):
    return '#%02X%02X%02X' % tuple(max(0, min(255, round(x))) for x in c)
def over(fg, a, bg):  # fg 以 a 透明度壓在 bg 上
    f, b = hex2rgb(fg), hex2rgb(bg)
    return rgb2hex(tuple(a * f[i] + (1 - a) * b[i] for i in range(3)))
def blend(x, y, t):  # t 份 x ＋ (1-t) 份 y
    X, Y = hex2rgb(x), hex2rgb(y)
    return rgb2hex(tuple(t * X[i] + (1 - t) * Y[i] for i in range(3)))

# ---- 原始值（淺色＝程式現值；dark／hc＝候選）----
RAW = {
    # 底
    'card':    {'light': '#FFFCF6', 'dark': '#2B2231', 'hc_light': '#FFFCF6', 'hc_dark': '#241C2A'},
    'grouped': {'light': '#FBF3E7', 'dark': '#211A27', 'hc_light': '#FBF3E7', 'hc_dark': '#1A1420'},
    # 字
    'label':     {'light': '#2E2233', 'dark': '#F2EAF1', 'hc_light': '#1B1220', 'hc_dark': '#FFFFFF'},
    'secondary': {'light': '#85778A', 'dark': '#B5A6BB', 'hc_light': '#5B4C61', 'hc_dark': '#D8CCDC'},
    'tint':      {'light': '#7D467F', 'dark': '#CDA3D0', 'hc_light': '#5E2E60', 'hc_dark': '#E3BFE6'},
    'red':       {'light': '#D0443A', 'dark': '#E9837A', 'hc_light': '#A82F27', 'hc_dark': '#F39B93'},
    # 滑動時露出的底
    'strikeBg':  {'light': '#9C8C7A', 'dark': '#6B5F55', 'hc_light': '#7E6F5F', 'hc_dark': '#857768'},
    # toast：淺色是深茄紫 94%，深色候選改成淺色藥丸
    'toastText': {'light': '#FFFFFF', 'dark': '#2E2233', 'hc_light': '#FFFFFF', 'hc_dark': '#1B1220'},
    'toastBtn':  {'light': '#D7B8F3', 'dark': '#7D467F', 'hc_light': '#E9D7FA', 'hc_dark': '#5E2E60'},
}
RAW['toastBg'] = {
    'light': over('#3A2E42', 0.94, RAW['grouped']['light']),
    'dark': over('#EDE3EC', 0.94, RAW['grouped']['dark']),
    'hc_light': over('#2A1F31', 0.94, RAW['grouped']['hc_light']),
    'hc_dark': over('#F6EEF5', 0.94, RAW['grouped']['hc_dark']),
}
# 透明度字色（底色不同就要各算一次）：淺色＝程式現值，hc 候選提高透明度
ALPHA = {
    'placeholder': {'light': 0.35, 'dark': 0.45, 'hc_light': 0.55, 'hc_dark': 0.6},
    'addText':     {'light': 0.72, 'dark': 0.8,  'hc_light': 0.9,  'hc_dark': 0.95},
    'doneText':    {'light': 0.38, 'dark': 0.45, 'hc_light': 0.6,  'hc_dark': 0.65},
    'hint':        {'light': 0.4,  'dark': 0.5,  'hc_light': 0.65, 'hc_dark': 0.7},
    'grip':        {'light': 0.22, 'dark': 0.3,  'hc_light': 0.45, 'hc_dark': 0.5},
}
# 九種筆記色：淺色抄 model.ts；深色候選＝hd 跟深底混（30% hd）
NOTE = {
    'purple': ('#F2E8EC', '#A985AE', '茄子'), 'yellow': ('#FAF0D2', '#E8C468', '玉米'),
    'orange': ('#FBE6D3', '#E8945C', '紅蘿蔔'), 'red': ('#F8E0D8', '#D97C6C', '甜椒'),
    'blue': ('#E7E8F0', '#8E9BC6', '藍莓'), 'green': ('#EBEED9', '#9DAF6A', '青蔥'),
    'gray': ('#F2EADF', '#BFA88E', '香菇'), 'black': ('#E0D8D6', '#4E3F4C', '黑豆'),
    'white': ('#FFFCF6', '#EDE3D2', '白蘿蔔'),
}
for k, (bg, hd, _) in NOTE.items():
    RAW['note.' + k] = {'light': bg, 'dark': blend(hd, '#211A27', 0.3), 'hc_light': bg, 'hc_dark': blend(hd, '#1A1420', 0.3)}

colors = dict(RAW)
pairs = []
def pair(fg, bg, where, large=False):
    pairs.append({'fg': fg, 'bg': bg, 'where': where, 'large': large})
def apair(tok, bg, where, large=False):
    name = f'{tok}@{bg}'
    colors[name] = {m: over(RAW['label'][m], ALPHA[tok][m], RAW[bg][m]) for m in ('light', 'dark', 'hc_light', 'hc_dark')}
    pair(name, bg, where, large)

# 不透明字配底
pair('label', 'card', '首頁清單名稱、清單行的字、選單項目、顏色面板色名、確認框')
pair('label', 'grouped', '（候補）首頁底上的字，目前沒有直接壓在這裡的字')
pair('secondary', 'grouped', '首頁分組標題（13pt 粗）、空狀態文字、最近刪除說明')
pair('secondary', 'card', '顏色面板標題與蔬菜名（12pt）、動作表單標題')
pair('tint', 'card', '動作表單項目、確認框「取消」、顏色面板選中色名、選單 ✓')
pair('tint', 'grouped', '系統標題列返回鍵（圖示，非文字）', large=True)
pair('red', 'card', '清單 ⋯「刪除」、確認框「刪除」、最近刪除「永久刪除」')
pair('card', 'strikeBg', '往右滑露出的「劃掉／恢復」（15pt 粗）')
pair('card', 'red', '往左滑露出的「刪除」（15pt 粗）')
pair('toastText', 'toastBg', 'toast 內文')
pair('toastBtn', 'toastBg', 'toast「復原」')
pair('card', 'tint', '右下角＋（圖示，非文字）', large=True)
# 透明度字配底
apair('placeholder', 'card', '首頁搜尋框提示字（網頁預覽）')
apair('doneText', 'card', '劃掉的行（刪除線字）')
apair('grip', 'card', '拖曳把手 ⋮⋮（非文字元件）', large=True)
for k, (_, _, name) in NOTE.items():
    pair('label', 'note.' + k, f'清單標題，{name}底')
    apair('placeholder', 'note.' + k, f'清單標題提示字「標題」，{name}底')
    apair('addText', 'note.' + k, f'「＋ 新增一行」，{name}底')
    apair('hint', 'note.' + k, f'底部提示「往右滑劃掉・往左滑刪除」，{name}底')
# 色點（非文字，3:1）
for k, (_, hd, name) in NOTE.items():
    colors['dot.' + k] = {'light': hd, 'dark': blend(hd, '#F2EAF1', 0.85), 'hc_light': hd, 'hc_dark': blend(hd, '#FFFFFF', 0.85)}
    pair('dot.' + k, 'card', f'首頁色點／標題列色點，{name}（非文字）', large=True)

out = {'colors': colors, 'pairs': pairs}
json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# 順便印出候選的深色筆記底，寫進代號檔用
for k, v in RAW.items():
    if k.startswith('note.') or k == 'toastBg':
        print(k, v)

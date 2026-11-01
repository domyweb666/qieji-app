"""產生 contrast.py 要吃的 pairs.json（對比檢查表的來源）。
用法：python -I -X utf8 gen_pairs.py pairs.json
      python -I -X utf8 <skill>/scripts/contrast.py pairs.json
淺色值＝多米 2026-10-31 定案（照推薦全收）；紙的九色 2026-11-01 晚換成「乙 紙感」、深色改混 22%；深色、增加對比＝候選值，要在真機看過才算定。
半透明的字色先跟底色合成成不透明色再算（contrast.py 只收 #RRGGBB）。
色值改了，這裡要跟 Tokens.ts 同步改。
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

# ---- 原始值（light＝定案；dark／hc＝候選）----
RAW = {
    'card':    {'light': '#FFFCF6', 'dark': '#2B2231', 'hc_light': '#FFFCF6', 'hc_dark': '#241C2A'},
    'grouped': {'light': '#FBF3E7', 'dark': '#211A27', 'hc_light': '#FBF3E7', 'hc_dark': '#1A1420'},
    'label':     {'light': '#2E2233', 'dark': '#F2EAF1', 'hc_light': '#1B1220', 'hc_dark': '#FFFFFF'},
    'secondary': {'light': '#75677A', 'dark': '#B5A6BB', 'hc_light': '#5B4C61', 'hc_dark': '#D8CCDC'},
    'tint':      {'light': '#7D467F', 'dark': '#CDA3D0', 'hc_light': '#5E2E60', 'hc_dark': '#E3BFE6'},
    'red':       {'light': '#C83C32', 'dark': '#E9837A', 'hc_light': '#A82F27', 'hc_dark': '#F39B93'},
    'deleteBg':  {'light': '#C83C32', 'dark': '#B5392F', 'hc_light': '#A82F27', 'hc_dark': '#A33128'}, # 往左滑露出的底：淺色跟危險紅同值，深色另定（深色的危險紅是淺字色，淺字壓不上去）
    'strikeBg':  {'light': '#7E6F5F', 'dark': '#5A4E45', 'hc_light': '#6B5D4E', 'hc_dark': '#4A3F37'},
    'onSwipe':   {'light': '#FFFCF6', 'dark': '#FFFCF6', 'hc_light': '#FFFFFF', 'hc_dark': '#FFFFFF'}, # 滑動露出的字：四種模式都是淺字
    'toastText': {'light': '#FFFFFF', 'dark': '#2E2233', 'hc_light': '#FFFFFF', 'hc_dark': '#1B1220'},
    'toastBtn':  {'light': '#D7B8F3', 'dark': '#7D467F', 'hc_light': '#E9D7FA', 'hc_dark': '#5E2E60'},
}
RAW['toastBg'] = {
    'light': over('#3A2E42', 0.94, RAW['grouped']['light']),
    'dark': over('#EDE3EC', 0.94, RAW['grouped']['dark']),
    'hc_light': over('#2A1F31', 0.94, RAW['grouped']['hc_light']),
    'hc_dark': over('#F6EEF5', 0.94, RAW['grouped']['hc_dark']),
}
# 透明度字色：淡字（提示字、劃掉的行、底部提示）併成一個；「新增一行」維持 0.72；色點描邊 0.5
ALPHA = {
    'muted':   {'light': 0.7,  'dark': 0.8,  'hc_light': 0.85, 'hc_dark': 0.9},
    'addText': {'light': 0.72, 'dark': 0.8,  'hc_light': 0.9,  'hc_dark': 0.95},
    'outline': {'light': 0.55, 'dark': 0.6,  'hc_light': 0.7,  'hc_dark': 0.75},
}
NOTE = {
    'purple': ('#F4EEF2', '#A985AE', '茄子'), 'yellow': ('#FAF5E4', '#E8C468', '玉米'),
    'orange': ('#FBF0E6', '#E8945C', '紅蘿蔔'), 'red': ('#F9ECE8', '#D97C6C', '甜椒'),
    'blue': ('#EEF0F5', '#8E9BC6', '藍莓'), 'green': ('#EFF2E6', '#9DAF6A', '青蔥'),
    'gray': ('#F3EEE7', '#BFA88E', '香菇'), 'black': ('#E6E2E1', '#4E3F4C', '黑豆'),
    'white': ('#FFFDF9', '#EDE3D2', '白蘿蔔'),
}
for k, (bg, hd, _) in NOTE.items():
    RAW['note.' + k] = {'light': bg, 'dark': blend(hd, '#211A27', 0.22), 'hc_light': bg, 'hc_dark': blend(hd, '#1A1420', 0.22)}

colors = dict(RAW)
pairs = []
def pair(fg, bg, where, large=False):
    pairs.append({'fg': fg, 'bg': bg, 'where': where, 'large': large})
def apair(tok, bg, where, large=False):
    name = f'{tok}@{bg}'
    colors[name] = {m: over(RAW['label'][m], ALPHA[tok][m], RAW[bg][m]) for m in ('light', 'dark', 'hc_light', 'hc_dark')}
    pair(name, bg, where, large)

pair('label', 'card', '首頁清單名稱、清單行的字、選單項目、顏色面板色名、確認框')
pair('label', 'grouped', '（候補）首頁底上的字，目前沒有直接壓在這裡的字')
pair('secondary', 'grouped', '首頁分組標題（13pt 粗）、空狀態文字、最近刪除說明')
pair('secondary', 'card', '顏色面板標題與蔬菜名（12pt）、動作表單標題、拖曳把手圖示')
pair('tint', 'card', '動作表單項目、確認框「取消」、顏色面板選中色名、選單 ✓')
pair('tint', 'grouped', '系統標題列返回鍵（圖示，非文字）', large=True)
pair('red', 'card', '清單 ⋯「刪除」、確認框「永久刪除」、最近刪除「永久刪除」')
pair('onSwipe', 'strikeBg', '往右滑露出的「劃掉／恢復」（15pt 粗）')
pair('onSwipe', 'deleteBg', '往左滑露出的「刪除」（15pt 粗）')
pair('toastText', 'toastBg', 'toast 內文')
pair('toastBtn', 'toastBg', 'toast「復原」')
pair('card', 'tint', '右下角＋（圖示，非文字）', large=True)
apair('muted', 'card', '首頁搜尋框提示字（網頁預覽）、劃掉的行（刪除線字）')
apair('outline', 'card', '首頁色點的描邊（非文字；色點本身是裝飾，旁邊永遠有名字）', large=True)
for k, (_, _, name) in NOTE.items():
    pair('label', 'note.' + k, f'清單標題，{name}底')
    apair('muted', 'note.' + k, f'標題提示字、底部提示，{name}底')
    apair('addText', 'note.' + k, f'「＋ 新增一行」，{name}底')
    apair('outline', 'note.' + k, f'標題列色點的描邊，{name}底（非文字）', large=True)

json.dump({'colors': colors, 'pairs': pairs}, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# -*- coding: utf-8 -*-
"""茄記商店展示圖合成：真機截圖（1206×2622）＋大標＋描述句 → 6.3 吋與 6.9 吋兩種尺寸。

跑法（在 qieji-1.1 底下）：
    python .aso/tools/store_shots.py
要換圖或換字，改下面 SHOTS 就好。
版型（多米 2026-11-15 定）：整組同一個茄色漸層底；每張一句大標、一句描述；第一張是主視覺大字。
plate()、mask() 另外給預覽影片的 preview_cut.py 用。
"""
import os
import shutil
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT = r"C:\Windows\Fonts\NotoSansTC-VF.ttf"
INK = (43, 35, 48)

# 茄色：跟 App 圖示的底同一個色相，上深下淺
BG_TOP, BG_BOTTOM = (36, 16, 72), (108, 68, 180)
CREAM = (255, 246, 226)      # 大標
LILAC = (226, 212, 244)      # 描述句
GOLD = (246, 204, 96)        # 完整版的標、圈圈
BEZEL = (22, 10, 34)         # 手機邊框

RAW = "store-assets/1.1.0/raw/"
OUT = "store-assets/1.1.0"
SIZES = {"6.3": (1206, 2622), "6.9": (1320, 2868)}
FULL = "茄記完整版"

# name 檔名｜raw 真機截圖｜title 大標（兩行，第二行金色）｜sub 描述句｜badge 小標｜top 手機上緣（1206 寬時的 y）
# pop 把截圖裡的一塊放大、跳出手機外：(x0, y0, x1, y1, 倍率, 圓角)，座標是真機截圖上的像素｜ring 圈出一顆鈕 (x, y, 半徑)
SHOTS = [
    dict(name="01-hero", raw="1-paper.PNG", hero=True, title=["想到就記"], sub="不用再記在腦裡",
         pills=["沒有到期日", "不會催你", "不用註冊"]),
    dict(name="02-compose", raw="2-compose.PNG", title=["右下角按 ＋", "直接打字"], sub="打開就是上次那張紙",
         pop=(25, 1176, 1181, 1352, 1.1, 70)),
    dict(name="03-switch", raw="3-menu.PNG", title=["一件事", "一張紙"], sub="點左上的清單名，換一張"),
    dict(name="04-start", raw="4-start.PNG", title=["不用註冊", "打開就會用"], sub="照著「從這裡開始」做一遍"),
    dict(name="05-colors", raw="5-colors.PNG", title=["九種蔬菜色", "分開放"], sub="每張紙一個顏色",
         pop=(404, 200, 1158, 1760, 1.1, 96)),
    dict(name="06-directory", raw="6-directory.PNG", title=["排法跟", "主畫面一樣"], sub="疊起來就是資料夾，每一行都搜得到"),
    dict(name="07-trash", raw="7-trash.PNG", title=["刪錯了", "找得回來"], sub="刪掉的紙和行，先放 30 天"),
    dict(name="08-widget", raw="8-widget.PNG", title=["看一眼", "上次記了什麼"], sub="主畫面和鎖定畫面小工具", badge=FULL, top=800,
         pop=(72, 262, 588, 768, 1.45, 96)),
    dict(name="09-control", raw="9-control.PNG", title=["控制中心按一下", "就能記一行"], sub="iOS 18 以上", badge=FULL,
         pop=(96, 1664, 336, 1904, 1.7, 120), ring=(216, 1784, 108)),
    dict(name="10-icloud", raw="10-icloud.PNG", title=["換手機", "紙會自己回來"], sub="用你自己的 iCloud 雲碟同步", badge=FULL,
         pop=(52, 1106, 1154, 1282, 1.1, 44)),
]


def font(size, weight=900):
    f = ImageFont.truetype(FONT, int(size))
    f.set_variation_by_axes([weight])
    return f


def fit(d, text, size, max_w, weight=900):
    """字太長就縮到放得下。"""
    f = font(size, weight)
    while d.textlength(text, font=f) > max_w:
        size -= 2
        f = font(size, weight)
    return f


def center(d, w, y, text, f, fill):
    d.text(((w - d.textlength(text, font=f)) / 2, y), text, font=f, fill=fill)


def gradient(size):
    w, h = size
    col = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / (h - 1)
        col.putpixel((0, y), tuple(int(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))
    return col.resize(size)


def mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius, fill=255)
    return m


def plate(size, bg, lines, text_top=0.047, font_ratio=0.098, gap=1.28):
    """純色底＋置中兩行字（預覽影片用的舊版型）。"""
    w, h = size
    im = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(im)
    f = font(int(w * font_ratio))
    y = int(h * text_top)
    for line in lines:
        center(d, w, y, line, f, INK)
        y += int(f.size * gap)
    return im


def pill(d, x, y, text, f, k, fill=None, outline=None, ink=CREAM):
    tw = d.textlength(text, font=f)
    pw, ph = tw + 56 * k, f.size * 1.9
    d.rounded_rectangle([x, y, x + pw, y + ph], ph / 2, fill=fill, outline=outline, width=max(2, int(3 * k)))
    d.text((x + 28 * k, y + (ph - f.size * 1.45) / 2), text, font=f, fill=ink)
    return pw


def pill_row(d, w, y, texts, f, k, gap=22, **kw):
    widths = [d.textlength(t, font=f) + 56 * k for t in texts]
    x = (w - sum(widths) - gap * k * (len(texts) - 1)) / 2
    for t in texts:
        x += pill(d, x, y, t, f, k, **kw) + gap * k


def shadow(im, box, radius, blur, alpha=130, dy=18):
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    x0, y0, x1, y1 = box
    ImageDraw.Draw(sh).rounded_rectangle([x0, y0 + dy, x1, y1 + dy], radius, fill=(10, 0, 30, alpha))
    return Image.alpha_composite(im.convert("RGBA"), sh.filter(ImageFilter.GaussianBlur(blur))).convert("RGB")


def compose(size, raw, title, sub, badge=None, top=None, ring=None, pop=None, hero=False, pills=None, name=None):
    w, h = size
    k = w / 1206
    im = gradient(size)
    d = ImageDraw.Draw(im)
    if hero:
        # 主視覺：圖示＋名字、特大字、描述句、三顆小標
        icon = Image.open(os.path.join(ROOT, "assets/icon.png")).convert("RGB").resize((int(112 * k),) * 2, Image.LANCZOS)
        fn = font(64 * k, 800)
        tw = d.textlength("茄記", font=fn)
        x0 = (w - (icon.width + 24 * k + tw)) / 2
        y0 = int(120 * k)
        im.paste(icon, (int(x0), y0), mask(icon.size, int(26 * k)))
        d.text((x0 + icon.width + 24 * k, y0 + (icon.height - fn.size * 1.45) / 2), "茄記", font=fn, fill=CREAM)
        center(d, w, 250 * k, title[0], fit(d, title[0], 262 * k, w * 0.9), CREAM)
        center(d, w, 640 * k, sub, font(84 * k, 700), GOLD)
        pill_row(d, w, 800 * k, pills, font(44 * k, 700), k, outline=LILAC, ink=CREAM)
        top = top or 990
    else:
        # 兩行大標（第二行金色）、一句描述、要的話一顆小標
        size_t = min(fit(d, t, 138 * k, w * 0.9).size for t in title)
        ft = font(size_t)
        y = 96 * k
        for i, t in enumerate(title):
            center(d, w, y, t, ft, GOLD if i == len(title) - 1 and len(title) > 1 else CREAM)
            y += size_t * 1.2
        y += 44 * k
        center(d, w, y, sub, fit(d, sub, 56 * k, w * 0.9, 500), LILAC)
        y += 110 * k
        if badge:
            pill_row(d, w, y, [badge], font(42 * k, 800), k, fill=GOLD, ink=INK)
            y += 120 * k
        top = top or (y / k + 40)
    shot = Image.open(os.path.join(ROOT, RAW, raw)).convert("RGB")
    sc = 1000 * k / shot.width            # 手機畫面放大到 1000 寬，底部出血
    pw, ph = int(shot.width * sc), int(shot.height * sc)
    x, y = (w - pw) // 2, int(top * k)
    r, b = int(92 * k), int(18 * k)
    im = shadow(im, (x - b, y - b, x + pw + b, y + ph + b), r + b, int(w * 0.025))
    ImageDraw.Draw(im).rounded_rectangle([x - b, y - b, x + pw + b, y + ph + b], r + b, fill=BEZEL)
    im.paste(shot.resize((pw, ph), Image.LANCZOS), (x, y), mask((pw, ph), r))
    if pop:
        # 把重點那一塊放大，疊在原位置上，超出手機邊框
        x0, y0, x1, y1, zoom, rad = pop
        piece = shot.crop((x0, y0, x1, y1))
        if ring:
            rx, ry, rr = ring
            ImageDraw.Draw(piece).ellipse([rx - x0 - rr, ry - y0 - rr, rx - x0 + rr, ry - y0 + rr], outline=GOLD, width=10)
        qw, qh = int(piece.width * sc * zoom), int(piece.height * sc * zoom)
        cx, cy = x + (x0 + x1) / 2 * sc, y + (y0 + y1) / 2 * sc
        qx = int(min(max(cx - qw / 2, 14 * k), w - qw - 14 * k))
        qy = int(cy - qh / 2)
        qr = int(rad * sc * zoom)
        im = shadow(im, (qx, qy, qx + qw, qy + qh), qr, int(w * 0.022), alpha=150, dy=24)
        im.paste(piece.resize((qw, qh), Image.LANCZOS), (qx, qy), mask((qw, qh), qr))
    elif ring:
        rx, ry, rr = ring
        ImageDraw.Draw(im).ellipse([x + (rx - rr) * sc, y + (ry - rr) * sc, x + (rx + rr) * sc, y + (ry + rr) * sc], outline=GOLD, width=int(14 * k))
    return im


if __name__ == "__main__":
    for label, size in SIZES.items():
        out_dir = os.path.join(ROOT, OUT, label)
        shutil.rmtree(out_dir, ignore_errors=True)
        os.makedirs(out_dir)
        for s in SHOTS:
            compose(size, **s).save(os.path.join(out_dir, s["name"] + ".jpg"), quality=93)
    # 總覽：一排五張，給人看
    W = 400
    H = int(W * 2622 / 1206)
    names = [s["name"] for s in SHOTS]
    for part, group in (("a", names[:5]), ("b", names[5:])):
        sheet = Image.new("RGB", (W * len(group) + 12 * (len(group) - 1), H), (245, 245, 245))
        for i, n in enumerate(group):
            sheet.paste(Image.open(os.path.join(ROOT, OUT, "6.3", n + ".jpg")).resize((W, H), Image.LANCZOS), (i * (W + 12), 0))
        sheet.save(os.path.join(ROOT, OUT, f"預覽總覽-{part}.jpg"), quality=90)
    print("done", len(SHOTS), "張 ×", len(SIZES))

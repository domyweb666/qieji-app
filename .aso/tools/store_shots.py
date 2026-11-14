# -*- coding: utf-8 -*-
"""茄記商店展示圖合成：真機截圖（1206×2622）＋兩行說明文字 → 6.3 吋與 6.9 吋兩種尺寸。

跑法（在 qieji-1.1 底下）：
    python .aso/tools/store_shots.py
要換圖或換字，改下面 SHOTS 就好。raw 是真機截圖的路徑。
也給影片用：plate() 產生「說明文字＋底色」的底板，mask() 產生圓角遮罩。
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT = r"C:\Windows\Fonts\NotoSansTC-VF.ttf"
INK = (43, 35, 48)

# 檔名, 真機截圖, 底色, 說明文字兩行
SHOTS = [
    ("3-strike", ".aso/raw-草稿/strike.png", (222, 128, 112), ("做到就劃掉", "沒做到也不催你")),
]
SIZES = {"6.3": (1206, 2622), "6.9": (1320, 2868)}


def font(size):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_axes([900])
    return f


def plate(size, bg, lines, text_top=0.047, font_ratio=0.098, gap=1.28):
    """底色＋置中的說明文字。"""
    w, h = size
    im = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(im)
    f = font(int(w * font_ratio))
    y = int(h * text_top)
    for line in lines:
        tw = d.textlength(line, font=f)
        d.text(((w - tw) / 2, y), line, font=f, fill=INK)
        y += int(f.size * gap)
    return im


def mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius, fill=255)
    return m


def compose(raw_path, size, bg, lines):
    w, h = size
    im = plate(size, bg, lines)
    raw = Image.open(raw_path).convert("RGB")
    pw = int(w * 950 / 1206)
    ph = int(pw * raw.height / raw.width)
    raw = raw.resize((pw, ph), Image.LANCZOS)
    x, y = (w - pw) // 2, int(h * 566 / 2622)
    r = int(w * 72 / 1206)
    # 手機底下的柔影
    sh = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([x, y + 12, x + pw, y + ph + 12], r, fill=(60, 40, 20, 70))
    sh = sh.filter(ImageFilter.GaussianBlur(int(w * 0.02)))
    im = Image.alpha_composite(im.convert("RGBA"), sh).convert("RGB")
    im.paste(raw, (x, y), mask((pw, ph), r))
    return im


if __name__ == "__main__":
    out_root = os.path.join(ROOT, "store-assets", "1.1.0-草稿")
    for name, raw, bg, lines in SHOTS:
        for label, size in SIZES.items():
            out_dir = os.path.join(out_root, label)
            os.makedirs(out_dir, exist_ok=True)
            out = os.path.join(out_dir, name + ".jpg")
            compose(os.path.join(ROOT, raw), size, bg, lines).save(out, quality=93)
            print(out, size)

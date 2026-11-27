# 產生紙張材質的貼圖（2026-11-26 多米：「紙張材質都放進去，再設定裡加個材質設定，可自行做切換」）。
# 數值照設計稿（Claude 設計稿 5VGh6V2PtRF4yheydWy1Ht，SVG feTurbulence）換算。
# 每張是白色＋透明度的灰階遮罩（PNG 的 LA），@3x：1 個像素＝1 個裝置像素。著色、不透明度在 app 裡用 Tok.Texture 做。
# 全部用 FFT 濾白噪音、np.roll 算梯度：本來就是週期性的，上下左右接得起來。
# 用法（在 ios-native/ 底下）：python -I tools/make-paper-grain.py   要 numpy、Pillow；固定亂數種子，重跑結果一樣。
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "Qieji", "Assets.xcassets")
SCALE = 3  # @3x：設計稿的 1pt＝3 像素
SIDE = 512  # 一般的貼圖邊長（像素）
LAID_SIDE = 432  # 簾紋紙：144pt＝48 條橫紋（每 3pt）＝2 條鏈紋（每 72pt），接得起來


def freq(n):
    """每個 FFT 格子的頻率（每像素幾個週期），給 2D 用"""
    f = np.fft.fftfreq(n)
    return np.meshgrid(f, f)  # fx 沿著欄（x）、fy 沿著列（y）


def filtered(rng, n, gain):
    """白噪音乘上頻率響應 gain，回到空間：週期性、平均 0、標準差 1"""
    white = rng.standard_normal((n, n))
    out = np.real(np.fft.ifft2(np.fft.fft2(white) * gain))
    out -= out.mean()
    return out / out.std()


def grain(rng, n, sigma=0.6):
    """很細的顆粒：白噪音只抹掉一點點（約 1 個裝置像素）"""
    fx, fy = freq(n)
    return filtered(rng, n, np.exp(-2 * (np.pi * sigma) ** 2 * (fx**2 + fy**2)))


def fbm(rng, n, base_x, base_y, octaves):
    """一層一層疊的雜訊（feTurbulence fractalNoise 的樣子）。base＝每像素幾個週期，可以橫直不同"""
    fx, fy = freq(n)
    out = np.zeros((n, n))
    for o in range(octaves):
        kx, ky = base_x * 2**o, base_y * 2**o
        gain = np.exp(-((fx / kx) ** 2 + (fy / ky) ** 2))
        out += filtered(rng, n, gain) * 0.5**o
    out -= out.mean()
    return out / out.std()


def fibers(rng, n, base_x, base_y, octaves, width):
    """橫向拉長的纖維絲：feTurbulence type=turbulence 那種 |雜訊| 的紋，取過零的那條細線（越靠近 0 越亮），每層細一點、淡一點"""
    fx, fy = freq(n)
    out = np.zeros((n, n))
    for o in range(octaves):
        kx, ky = base_x * 2**o, base_y * 2**o
        gain = np.exp(-((fx / kx) ** 2 + (fy / ky) ** 2))
        ridge = np.clip(1 - np.abs(filtered(rng, n, gain)) / width, 0, 1) ** 2
        out = np.maximum(out, ridge * 0.8**o)
    return out


def curve(z, spread, slope, intercept):
    """設計稿的 feFuncA linear：雜訊（平均 0.5、標準差 spread）→ slope×v＋intercept，夾在 0～1"""
    return np.clip(slope * (0.5 + spread * z) + intercept, 0, 1)


def table(v, values):
    """設計稿的 feFuncA table"""
    stops = np.linspace(0, 1, len(values))
    return np.interp(np.clip(v, 0, 1), stops, values)


def save(name, alpha):
    """寫成 Assets.xcassets/<name>.imageset/<name>.png（白色＋透明度），放 @3x 那格"""
    folder = os.path.join(ASSETS, f"{name}.imageset")
    os.makedirs(folder, exist_ok=True)
    a = np.clip(np.round(alpha * 255), 0, 255).astype(np.uint8)
    white = np.full_like(a, 255)
    Image.fromarray(np.stack([white, a], -1), "LA").save(os.path.join(folder, f"{name}.png"), optimize=True)
    contents = {
        "images": [
            {"idiom": "universal", "scale": "1x"},
            {"idiom": "universal", "scale": "2x"},
            {"filename": f"{name}.png", "idiom": "universal", "scale": "3x"},
        ],
        "info": {"author": "xcode", "version": 1},
    }
    with open(os.path.join(folder, "Contents.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(contents, f, indent=2)
        f.write("\n")
    print(f"{name}: {a.shape[1]}x{a.shape[0]} 平均 {alpha.mean():.3f} 有顏色的 {np.mean(alpha > 0.02) * 100:.1f}%")


def per_px(per_pt):
    """設計稿的 baseFrequency（每 pt 幾個週期）→ 每像素"""
    return per_pt / SCALE


def main():
    rng = np.random.default_rng(20261126)
    spread = 0.12  # SVG fractalNoise 轉成亮度之後大約的標準差

    # 1 細紙紋：fractalNoise 0.9、slope 2.4、intercept −1
    save("GrainFine", curve(grain(rng, SIDE), spread, 2.4, -1))

    # 2 棉紙纖維：細顆粒（slope 1.6、−0.7）＋橫向拉長的纖維（turbulence 0.012×0.09，table 0 0 0 0.1 0.55 1）
    save("GrainWashiDust", curve(grain(rng, SIDE), spread, 1.6, -0.7))
    fiber = fibers(rng, SIDE, per_px(0.012), per_px(0.09), 3, 0.16)
    save("GrainWashiFiber", table(fiber, [0, 0, 0.1, 0.55, 1]))

    # 3 再生紙：細顆粒（slope 2、−0.85）＋稀疏的小斑點（fractalNoise 0.35、slope 9、−5.6）
    save("GrainRecycledDust", curve(grain(rng, SIDE), spread, 2, -0.85))
    speck = fbm(rng, SIDE, per_px(0.35), per_px(0.35), 2)
    save("GrainRecycledSpeck", curve(speck, 0.08, 9, -5.6))

    # 4 水彩紙壓紋：2026-11-27 拿掉（多米真機：很難看）。照樣抽一次亂數，後面的貼圖重產才跟以前一模一樣
    fbm(rng, SIDE, per_px(0.05), per_px(0.05), 3)

    # 5 簾紋紙：每 3pt 一條 1pt 橫紋（0.35）＋每 72pt 一條 1.2pt 直鏈紋（x＝36pt，0.6）＋細顆粒（slope 1.8、−0.8）
    n = LAID_SIDE
    lines = np.zeros((n, n))
    lines[(np.arange(n) % (3 * SCALE)) < SCALE, :] = 0.35
    chain = np.zeros((n, n))
    for start in (36 * SCALE, (36 + 72) * SCALE):
        chain[:, start : start + 3] = 0.6
        chain[:, start + 3] = 0.6 * 0.6  # 1.2pt＝3.6 像素，最後一欄只有一部分
    dust = curve(grain(rng, n), spread, 1.8, -0.8)
    save("GrainLaid", 1 - (1 - lines) * (1 - chain) * (1 - dust))


if __name__ == "__main__":
    sys.exit(main())

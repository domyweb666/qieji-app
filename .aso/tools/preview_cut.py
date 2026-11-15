# -*- coding: utf-8 -*-
"""茄記 App Store 預覽影片：真機螢幕錄影 → 886×1920、H.264、30fps、帶靜音立體聲。

版型跟展示圖同一套（store_shots.compose）：茄色漸層底、兩行大標、描述句、手機出血。
錄影放進手機畫面裡，動態島上的錄影紅點用一塊黑色膠囊蓋掉。

跑法（在 qieji-1.1 底下）：
    python .aso/tools/preview_cut.py           正式版：讀 store-assets/1.1.0/video-raw/ 的五段錄影
    python .aso/tools/preview_cut.py one       用一次錄完的那支（ONE 裡的秒數）
    python .aso/tools/preview_cut.py sample    樣片：用 11-06 的審查錄影（1.0 的畫面）看版型
規格依據：Apple「App preview specifications」，2026-11-14 查。上傳前再查一次。
"""
import os
import subprocess
import sys
import tempfile
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import store_shots as ss  # noqa: E402

SIZE = (886, 1920)
ISLAND = (330, 36, 856, 158)  # 真機錄影（1206 寬）上動態島的範圍，含錄影紅點
RAW = os.path.join(ss.ROOT, "store-assets", "1.1.0", "video-raw")

# 檔案, 開始秒, 結束秒（None＝到尾）, 大標兩行, 描述句
FINAL = [
    ("1-paper", 0, None, ["想到就記", "不用再記在腦裡"], "沒有到期日，不會催你"),
    ("2-compose", 0, None, ["右下角按 ＋", "直接打字"], "打開就是上次那張紙"),
    ("3-strike", 0, None, ["做到就劃掉", "沒做到也不催你"], "放多久都可以"),
    ("4-switch", 0, None, ["一件事", "一張紙"], "點左上的清單名，換一張"),
    ("5-directory", 0, None, ["排法跟", "主畫面一樣"], "疊起來就是資料夾"),
]
# 多米 2026-11-15 一次錄完的那支（46 秒），照秒數切五段
ONE_SRC = r"C:\Users\fcharlie\Downloads\ScreenRecording_11-15-2026 16-55-03_1.MP4"
# 第二個數字可以是一串 (開始, 結束)：同一段裡跳過中間停太久的地方（多米 2026-11-15：精簡到 15～20 秒）
# 2026-11-15 照 domi-aso-video 審查改：第一段用主視覺版型（封面＝01 那張）、拿掉目錄段、劃掉那段拉長、換紙那段不再中間剪
# 第六欄是傳給 store_shots.compose 的額外設定
ONE = [
    (ONE_SRC, [(6.0, 8.5)], None, ["想到就記"], "不用再記在腦裡",
     dict(hero=True, pills=["沒有到期日", "不會催你", "不用註冊"])),
    (ONE_SRC, [(9.6, 15.5), (19.85, 20.8)], None, ["右下角按 ＋", "直接打字"], "打開就是上次那張紙"),
    (ONE_SRC, [(25.8, 30.3)], None, ["做到就劃掉", "沒做到也不催你"], "放多久都可以"),
    (ONE_SRC, [(31.2, 34.2)], None, ["一件事", "一張紙"], "點左上的清單名，換一張"),
]
POSTER = "00:00:01:00"  # 封面畫格：第 1 秒（主視覺那一格）。上傳時要指定，Apple 預設是第 5 秒
REVIEW = r"E:\茄記\審查錄影\qieji-review.mp4"
SAMPLE = [
    (REVIEW, 4.0, 7.0, ["想到就記", "不用再記在腦裡"], "沒有到期日，不會催你"),
    (REVIEW, 7.0, 15.5, ["右下角按 ＋", "直接打字"], "打開就是上次那張紙"),
    (REVIEW, 17.0, 19.0, ["右下角按 ＋", "直接打字"], "打開就是上次那張紙"),
    (REVIEW, 32.0, 37.5, ["做到就劃掉", "沒做到也不催你"], "放多久都可以"),
    (REVIEW, 119.0, 124.0, ["排法跟", "主畫面一樣"], "疊起來就是資料夾"),
]


def run(args):
    r = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print(r.stderr[-1500:])
        sys.exit(1)
    return r.stdout


def duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).strip())


def segment(tmp, i, src, a, b, title, sub, opt=None):
    """一段：底板（字＋手機框）＋錄影塞進手機畫面＋蓋掉動態島紅點。"""
    blank = os.path.join(tmp, "blank.png")
    Image.new("RGB", (1206, 2622), (0, 0, 0)).save(blank)
    plate = ss.compose(SIZE, blank, title, sub, **(opt or {}))
    x, y, pw, ph, r, sc = ss.LAST_RECT
    plate_p = os.path.join(tmp, f"plate{i}.png")
    plate.save(plate_p)
    m = os.path.join(tmp, f"mask{i}.png")
    ss.mask((pw, ph), r).save(m)
    cover = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    x0, y0, x1, y1 = ISLAND
    ImageDraw.Draw(cover).rounded_rectangle(
        [x + x0 * sc, y + y0 * sc, x + x1 * sc, y + y1 * sc], (y1 - y0) * sc / 2, fill=(0, 0, 0, 255))
    cover_p = os.path.join(tmp, f"cover{i}.png")
    cover.save(cover_p)
    if b is None:
        b = duration(src)
    out = os.path.join(tmp, f"seg{i}.mp4")
    fc = (f"[1:v]fps=30,scale={pw}:{ph}:flags=lanczos,format=rgba[v];"
          f"[2:v]format=gray[m];[v][m]alphamerge[vm];"
          f"[0:v][vm]overlay={x}:{y}:shortest=1[o1];[o1][3:v]overlay=0:0,format=yuv420p[o]")
    run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", "30", "-i", plate_p,
         "-ss", str(a), "-t", str(b - a), "-i", src, "-loop", "1", "-i", m, "-loop", "1", "-i", cover_p,
         "-filter_complex", fc, "-map", "[o]", "-t", str(b - a), "-an",
         "-c:v", "libx264", "-crf", "14", "-r", "30", out])
    return out, b - a


def main():
    sample = len(sys.argv) > 1 and sys.argv[1] == "sample"
    if len(sys.argv) > 1 and sys.argv[1] == "one":
        plan = ONE
        out = os.path.join(ss.ROOT, "store-assets", "1.1.0", "預覽影片.mp4")
    elif sample:
        plan = SAMPLE
        out = os.path.join(ss.ROOT, "store-assets", "1.1.0", "預覽影片-樣片-新版型.mp4")
    else:
        plan = []
        for name, a, b, title, sub in FINAL:
            hits = [f for f in os.listdir(RAW) if os.path.splitext(f)[0] == name]
            if not hits:
                sys.exit(f"找不到 {name}（放在 {RAW}）")
            plan.append((os.path.join(RAW, hits[0]), a, b, title, sub))
        out = os.path.join(ss.ROOT, "store-assets", "1.1.0", "預覽影片.mp4")
    tmp = tempfile.mkdtemp(prefix="qieji-preview-")
    parts, total = [], 0.0
    n = 0
    for i, item in enumerate(plan):
        src, a, b, title, sub = item[:5]
        opt = item[5] if len(item) > 5 else None
        ranges = a if isinstance(a, list) else [(a, b)]
        d_all = 0.0
        for ra, rb in ranges:
            p, d = segment(tmp, n, src, ra, rb, title, sub, opt)
            n += 1
            parts.append(p)
            d_all += d
        total += d_all
        print(f"段 {i + 1}：{d_all:.1f} 秒 {'／'.join(title)}")
    print(f"總長 {total:.1f} 秒（要 15～30 秒）")
    lst = os.path.join(tmp, "list.txt")
    with open(lst, "w", encoding="utf-8") as f:
        for s in parts:
            f.write("file '" + s.replace("\\", "/") + "'\n")
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst,
         "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
         "-map", "0:v", "-map", "1:a", "-t", f"{min(total, 30):.3f}",
         "-c:v", "libx264", "-profile:v", "high", "-level", "4.0", "-pix_fmt", "yuv420p",
         "-b:v", "10M", "-maxrate", "12M", "-bufsize", "20M", "-r", "30",
         "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", out])
    print(out)


if __name__ == "__main__":
    main()

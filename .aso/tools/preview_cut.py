# -*- coding: utf-8 -*-
"""茄記 App Store 預覽影片：真機螢幕錄影 → 886×1920、H.264、30fps、帶靜音立體聲。

跑法（在 qieji-1.1 底下）：
    python .aso/tools/preview_cut.py
換素材：改 SRC（螢幕錄影檔）和 SEGMENTS（從第幾秒剪到第幾秒、底色、兩行字）。
規格依據：Apple「App preview specifications」，2026-11-14 查。上傳前再查一次。
"""
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from store_shots import plate, mask, ROOT  # noqa: E402

SRC = r"E:\茄記\審查錄影\qieji-review.mp4"
OUT = os.path.join(ROOT, "store-assets", "1.1.0-草稿", "預覽影片-樣片.mp4")
SIZE = (886, 1920)
SCREEN = (700, 1522)   # 手機畫面縮到這個大小
POS = (93, 398)        # 手機畫面左上角
RADIUS = 54

# 開始秒, 結束秒, 底色, 兩行字
SEGMENTS = [
    (4.0, 7.0, (231, 196, 104), ("想到就記", "不用再記在腦裡")),
    (7.0, 15.5, (169, 132, 173), ("右下角按 ＋", "直接打字")),
    (17.0, 19.0, (169, 132, 173), ("右下角按 ＋", "直接打字")),
    (32.0, 37.5, (222, 128, 112), ("做到就劃掉", "沒做到也不催你")),
    (119.0, 124.0, (142, 155, 199), ("一件事一張紙", "九種顏色分開放")),
]


def run(args):
    r = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print(r.stderr[-1500:])
        sys.exit(1)


def main():
    tmp = tempfile.mkdtemp(prefix="qieji-preview-")
    m = os.path.join(tmp, "mask.png")
    mask(SCREEN, RADIUS).save(m)
    parts = []
    for i, (a, b, bg, lines) in enumerate(SEGMENTS):
        p = os.path.join(tmp, f"plate{i}.png")
        plate(SIZE, bg, lines, text_top=0.05).save(p)
        seg = os.path.join(tmp, f"seg{i}.mp4")
        fc = (f"[1:v]fps=30,scale={SCREEN[0]}:{SCREEN[1]}:flags=lanczos,format=rgba[v];"
              f"[2:v]format=gray[m];[v][m]alphamerge[vm];"
              f"[0:v][vm]overlay={POS[0]}:{POS[1]}:shortest=1,format=yuv420p[o]")
        run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", "30", "-i", p,
             "-ss", str(a), "-t", str(b - a), "-i", SRC, "-loop", "1", "-i", m,
             "-filter_complex", fc, "-map", "[o]", "-t", str(b - a),
             "-c:v", "libx264", "-crf", "14", "-r", "30", seg])
        parts.append(seg)
    lst = os.path.join(tmp, "list.txt")
    with open(lst, "w", encoding="utf-8") as f:
        for s in parts:
            f.write("file '" + s.replace("\\", "/") + "'\n")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst,
         "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
         "-map", "0:v", "-map", "1:a", "-shortest",
         "-c:v", "libx264", "-profile:v", "high", "-level", "4.0", "-pix_fmt", "yuv420p",
         "-b:v", "10M", "-maxrate", "12M", "-bufsize", "20M", "-r", "30",
         "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", OUT])
    print(OUT)


if __name__ == "__main__":
    main()

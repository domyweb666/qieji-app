# -*- coding: utf-8 -*-
# 算每欄字元數、找三欄重複的詞。跑法：python .aso/check_metadata.py
import sys, itertools
sys.stdout.reconfigure(encoding="utf-8")
SETS = {
 "現行": dict(name="茄記：想到就記", sub="沒有到期日，也不會催你",
   kw="靈感,想法,點子,筆記,便條,隨手,清單,待辦,備忘錄,購物清單,記事,小工具,iCloud"),
 "推薦 N2+S2": dict(name="茄記：想到就記的隨手備忘錄", sub="沒有到期日，不會催你的待辦清單",
   kw="念頭,想法,靈感,閃念,筆記,便條,便利貼,記事本,購物,瑣事,雜事,劃掉,極簡,簡單,速記,小工具,鎖定畫面,控制中心,腦袋清空"),
 "保守 N1+S2": dict(name="茄記：想到就記", sub="沒有到期日，不會催你的待辦清單",
   kw="隨手,備忘錄,念頭,想法,靈感,閃念,筆記,便條,便利貼,記事本,購物,瑣事,雜事,劃掉,極簡,簡單,速記,小工具,鎖定畫面,控制中心,腦袋清空"),
 "純差異 N2+S3": dict(name="茄記：想到就記的隨手備忘錄", sub="念頭先放著，不提醒也不催你",
   kw="待辦,清單,想法,靈感,閃念,筆記,便條,便利貼,記事本,購物,瑣事,雜事,劃掉,極簡,簡單,速記,小工具,鎖定畫面,控制中心,腦袋清空"),
 "英國英文": dict(name="Qieji: Jot It Down", sub="Notes with no due dates",
   kw="memo,todo,quick,thought,idea,widget,lock,screen,simple,minimal,checklist,shopping,brain,dump,list"),
}
LIMIT = dict(name=30, sub=30, kw=100)
for label, s in SETS.items():
    print("==", label)
    for k in ("name", "sub", "kw"):
        n = len(s[k]); print(f"  {k:4} {n:3}/{LIMIT[k]} {'超過!' if n>LIMIT[k] else ''} {s[k]}")
    words = s["kw"].split(",")
    dup = [w for w in set(words) if words.count(w) > 1]
    text = s["name"] + "|" + s["sub"]
    in_text = [w for w in words if w.lower() in text.lower()]
    inside = [(a, b) for a, b in itertools.permutations(words, 2) if a in b and a != "list"]
    print("  關鍵字欄位內重複:", dup or "無", "｜跟名稱副標重複:", in_text or "無", "｜一個詞包在另一個裡:", inside or "無")

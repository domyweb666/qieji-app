# Handoff: 2026-11-02 下午｜組塊 B 真機結案；C1、C3、C4、C5 做完（機器已驗），等多米真機玩組塊 C；之後才做 C2 → 組塊 D

> 產出時間：2026-11-02 15:00（上一版在 `.vibe/handoff/archive/2026-11-02-0135.md`）
> 專案：`E:\茄記\qieji-app`（Expo SDK 58／RN 0.88 新架構，iOS 原生 app；多米沒有 Mac、不太看程式、用 4G 測）
> GitHub：私人 repo https://github.com/domyweb666/qieji-app（master，commit 完直接 `git push`）
> **測試方式**：改 JS 用 tunnel：`npx expo start --tunnel --port 8083`（終端機面板，**先 `cd E:\茄記\qieji-app`**）。改原生要 `npx eas-cli@latest build --profile development --platform ios`
> **多米的節奏（這次變了）**：11/02 下午多米說「都先往下做，全做完再說」→ 走查、覆誦、立即驗都先跳過（全記在帳本跳過紀錄），標準和覆誦照寫進帳本不等點頭。但寫 iCloud 的 C2 和靠它的組塊 D 多米選擇等 C1 真機過再做

## ✅ 這次完成了什麼

- **B4 標題區左右撥換張**（多米定到頭只拉住彈回、不跳提示）→ **組塊 B 真機整塊驗過「都 ok」，結案**
- **C1 目錄座位表**（🔴 動真資料）：`State.order`；第一次打開照 C1 之前目錄的樣子編（釘選在前、再照最近改過、最近刪除接後面），轉換前原始存檔原樣另存 `colornotes.v1.before-c1`；改字不換位、新的一張排最後；「已釘選／其他」拿掉、釘選的磚右上角圖釘。**真機還沒驗**
- **C3 多頁**：一頁幾列照螢幕高度算、整頁翻、頁點、搜尋不分頁、最近刪除固定在下面
- **C4 長按選單＋抖動拖**：九色／改名字／刪除／編輯目錄；長按後一拖進抖動；同頁拖換位、其他磚讓位；抖動時面板不收、點磚不換紙；VoiceOver 往前移／往後移
- **C5 拖到邊緣翻頁**：停 600ms 翻、放到別頁、原頁由後面補上
- 座位規則測試 `tools/tests/c1-seats.test.ts`（23 條，`node tools/tests/c1-seats.test.ts`）
- 真機待驗清單 `.vibe/操作清單-待驗.md`（27 條，C1 先玩）

## 🚧 還沒做完 / 待決定

- **多米要真機玩組塊 C**（清單在 `.vibe/操作清單-待驗.md`）。C1 是立即驗片被延後；C3～C5 幾乎全是手勢，網頁預覽測不到長按、拖、橫向滑
- C4 已知風險：長按後一拖的那一刻會切成抖動，手勢設定（activateAfterLongPress、長按 enabled）在拖的途中改變，iOS 上會不會把拖取消掉只能真機看（清單第 18 條）。如果壞了，改法：手勢設定不隨 editing 變，抖動狀態改用 shared value 判斷
- 組塊 C 過了 → **C2 排列同步 iCloud**（🔴 立即驗，`layout.json`、最後改的那台為準、對不上的補最後；兩台互改驗不了已記跳過）→ **組塊 D 資料夾**（D 之前建議做卡片分類，多米還沒回）
- 舊待辦不變：D2 刪掉重裝要在 TestFlight 正式版補測；LICENSE 還是 Expo 範本；送審缺 ascAppId、隱私權政策公開網頁、公開信箱；新 App 圖示要等下次建開發版看
- 帳本跳過紀錄新增：B4 走查（已補確認）、C1 走查、C1 立即驗延後、C3～C5 走查＋覆誦

## 📌 關鍵決策（這次定下來的，下次別再爭論）

- B4：只在 swipeSet 那幾張之間換；手指往左＝右邊那張；到頭只拉住彈回（不跳 toast）；只有清單名和時間那兩行跟手，⋯ 和把手不動
- C1：座位表跟紙分開記（只加欄位）；第一次編號照 C1 之前目錄看到的順序（**釘選兩張在最前**，不是單純最近改過）；刪掉的紙保留座位、還原回原位；這台沒見過的紙補最後；打開 app 停哪張、刪掉後換哪張照舊（最近改過）
- C3：每次打開從第一頁；「新的一張」維持自己一列在第一頁最上面；搜尋時不分頁；不做點頁點跳頁
- C4：改名字＝換到那張紙＋清單名可打字（`store.requestRename`，跟控制中心記一行同一套）；刪除＝跟紙的 ⋯ 刪除同一套＋復原（不加確認框）；抖動中點露出的紙＝結束抖動、不收；搜尋結果不能拖；VoiceOver 用往前移／往後移
- C5：不開新空白頁；第一頁／最後一頁停邊緣不翻
- 順序：C3 → C4 → C5 → 多米驗 C → C2 → D（多米選）

## 📂 下個會話最重要的檔案

- `.vibe/HANDOFF.md` ← 這份
- `.vibe/切片帳本.md` ← 進度真相源（進行中＝等多米驗組塊 C；機器已驗區有 C1、C3、C4、C5 的做法、證據、沒驗到）；`.vibe/state.json` 是快取（station＝audit-batch）
- `.vibe/操作清單-待驗.md` ← 多米回報時照條號對
- `.vibe/黃金行為.md`（組塊 C 七條）；`.vibe/標準清單.md` 現在是 C5 的
- `src/components/DirPanel.tsx`：Directory（分頁 pages／pageStart／cap、拖 drag／laid／onEdge／drop、長按選單）、Tile（tap／hold／pan 手勢）、Ghost、TileFace
- `src/lib/model.ts`：`fixOrder`、`seatedNotes`、`reseat`、`SEAT_BACKUP_KEY`；`src/lib/store.ts`：load 轉換＋另存、writeNow 前 fixOrder、requestRename
- `src/components/Paper.tsx`：B4 `swap` 手勢、`slideFrom`、收改名請求

## ⏭️ 下一步從哪繼續

1. 讀這份，再讀帳本「進行中」與「機器已驗」的組塊 C
2. 等多米回報 `.vibe/操作清單-待驗.md` 結果：
   - 有怪的 → 照條號找對應片，走 vibe-rescue／修，修完重驗那幾條
   - C1 順序亂掉或少紙 → 先停，原始存檔在 AsyncStorage `colornotes.v1.before-c1`，紙在 iCloud 也各有一份
   - 全過 → 組塊 C 結案（帳本搬到已完成、state human_verified）→ 每 3 片的完整回放已經超過，順便跑一次 health-check
3. 組塊 C 過了才做 C2：vibe-spec-standards 列標準 → 覆誦（看多米還要不要跳）→ 實作 → 立即驗
4. 然後組塊 D（先問卡片分類要不要做）

## 🗑️ 這次會話的雜訊（下次別重新討論）

- 網頁預覽：裝置模擬（resize 390 寬）時點擊座標會跑掉（點把手變點到標題），改用 desktop 尺寸＋ref 點；橫向捲動用滑鼠拖不動，用程式 `scrollLeft` 驗；長按、拖都做不到；假的 PointerEvent 會讓 RNGH 報 setPointerCapture 錯（是測試工具造成，不是 app 的錯）；console 讀到的是累積的舊錯誤，要用實際操作確認
- 塞測試資料要從同網域不跑 app 的頁面（`/favicon.ico`）寫 localStorage，不然 app 卸載時會把舊資料寫回去蓋掉
- Bash 裡用 python heredoc 改檔，反斜線會被吃掉（`\\n` 變真換行）；有反斜線的改動用 Edit 工具

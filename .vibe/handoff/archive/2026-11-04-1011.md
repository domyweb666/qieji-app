# Handoff: 11/04 手感改版——準則寫進規矩檔、切換清單、清單引擎重寫、改磚上的字；拖把手在 iPhone 一拿起就被取消，根因已從真機訊息推出、修法已放，還沒驗

> 產出時間：2026-11-04 10:11（電腦時鐘，+08:00）
> 專案：`E:\茄記\qieji-app`（Expo SDK 58／RN 0.88，iOS app；多米沒有 Mac、不太看程式、用開發版＋tunnel 真機測）
> 分支：`perf/feel-engine`（從 master 切出，**沒有合併、沒有推上去**；合併要問多米）
> 上一版交接：`.vibe/handoff/archive/2026-11-04-0820.md`，那份第 🚧 2～8 點（F2、D1 等提案題目、README 截圖、送審卡住的事）**都還成立**，這份不重抄

## ✅ 這次完成了什麼
- 規矩檔加「手感是最高標準」七條（多米：「我的唯一標準就是極致的手感體驗」），記憶也存了
- 切換清單：點了紙馬上換、面板同時讓開（以前等面板收完約半秒才換）；收起中清單不重排；往下撥收起不先跳回去；換紙時底下墊上一張的顏色；卸載有改才重畫；小工具晚 0.8 秒才推；⋯ 系統選單晚一格才掛
- 清單引擎重寫（`Paper.tsx` 的 `LineList`、`Rows`、`Row`、`SwipeUnder`，`lib/rows.ts` 位置表）：只掛畫面附近的行、一行只畫字和六個點、輸入框只有正在打的行才有、點／長按／左右滑／拖把手整張共用一組手勢、位置全在 UI 執行緒
- 改磚上的字：自己畫的卡片，超過一個字按「好」留在當頁（紅字、紅框、晃一下、震動、字還在）；emoji 看起來一個就算一個（`model.ts graphemes`）
- 捲到底刪一行整頁跳：捲動位置跟其他行同一個時鐘退回去，撐高的那塊等滑完才收（多米回報「下方的筆記刪除會跳一下」；原因是推斷的，網頁逐格驗過）
- 寫了診斷、標準、代決、待驗：`.vibe/送審前總驗.md` 最上面 H1～H11
- 測試 125+ → 150 條全過，tsc、lint、check-tokens 過

## 🚧 還沒做完 / 待決定
1. **拖把手還沒驗（最優先）**。真機訊息（終端機 `[dbg]`）是 `grip begin → grip activate → began → grip finalize → ended 3 3 0`：手勢有接到手指、也查對行，但一啟動就被取消（幾乎每次 from＝to）。
   **推斷的根因**：`began` 裡 `setHeldId` 讓那行拿到 `zIndex: 5`，Fabric 換順序時把排在它後面的兄弟 Remove＋Insert；把手的偵測元件當時是兄弟，被拆下來時 `RNGestureHandlerDetector willMoveToWindow:nil` → `detachAllHandlers`，手勢就取消。網頁的 zIndex 是 CSS，不會拆，所以網頁一直正常。舊版把手在被拖那一行裡面，那行本身不會被移動，所以沒事。
   **已放的修法**：`Rows` 把所有行包進自己一層 `<View collapsable={false}>`，換順序只動這層裡面。**還沒真機驗，根因也還沒被證實。**
2. **`Paper.tsx` 有 6 處暫時的 `[dbg]` 訊息**（`grep -n "\[dbg\]"`），拖把手驗過就要拿掉再提交
3. **H1～H11 只有零星回報**：多米說過「上方的行刪除很順」「切換清單沒再抱怨」；其他都還沒回。最想知道：H3 放手不閃、H5 點一行字不跳（`T.font.lineInputDrop` 2.86 是讀 RN 原始碼算的）、H6 換點別行鍵盤不收
4. 真機數字（開發版）：打開千行紙 496 → 129 毫秒；掉格多半 1～2 格、最長 26～44 毫秒（資料少，操作也不完全一樣，等多米多玩再比一次）
5. **別的會話**：[查雲端 iOS 模擬器自動測手勢](#local_ddbbe202-eb51-41d6-8aca-eb23c5d3e08d)（`local_ddbbe202-eb51-41d6-8aca-eb23c5d3e08d`）在同一個資料夾跑，只寫 `.vibe/待審-雲端模擬器自動測.md`，不改程式。它的檔案不要一起提交，也不要動。報告出來要問多米怎麼決定
6. 手感真的都過了才走：合併 `perf/feel-engine` 回 master（問多米）→ 總驗第一到八節 → 送審那一串

## 📌 關鍵決策（這次定下來的，別再爭論）
- 手感 > 功能多寡 > 程式好不好寫；擋到手感的定案可以推翻（`.vibe/規矩檔.md`、記憶 `feedback_feel_is_top_standard`）
- 不再在舊架構上補，清單引擎就是這套：**行的位置只有一套（UI 執行緒的 `pos`＋位移）**，React 順序不決定畫面位置
- 結果當下發生，動畫只是過場：動畫完成的回呼不准放使用者要的結果
- 改磚上的字按「好」才檢查：注音組字中字數會暫時變多，邊打邊檢查會一直跳紅字
- 其他 AI 自己定的（格線跟著行走、目錄和切換清單同時動、搜尋很遠直接跳、選單刪除先淡出）在 `.vibe/代決清單.md`

## 📂 下個會話最重要的檔案
- `.vibe/安全標準.md` ← **下一個會話必讀**（加網路、存新資料、加權限、加套件時先自查）
- `src/components/Paper.tsx`：`LineList`（手勢、`publish`）、`Rows`（位置表、掛哪幾行、撐高）、`Row`（`place` 動畫樣式）
- `src/lib/rows.ts`、`tests/rows.test.mjs`
- `.vibe/手感診斷-2026-11-04.md`：為什麼這樣改、驗到哪裡、下一層要重建的選項
- `.vibe/送審前總驗.md` 最上面 H1～H11：真機要測的
- `.vibe/網頁測試小工具.md`：窗格隱藏時怎麼在網頁測手勢（會省很多時間）
- `node_modules/react-native-gesture-handler/apple/RNGestureHandlerDetector.mm`、`shared/shadowNodes/.../RNGestureHandlerDetectorShadowNode.cpp`：偵測元件怎麼掛手勢、怎麼排版

## ⏭️ 下一步從哪繼續
1. **確認 tunnel 還在**：這個會話開在終端機分頁，舊會話關掉可能跟著斷。用 run_in_terminal 在 `E:\茄記\qieji-app` 跑 `npx expo start --tunnel`（確認 8081 沒被占；tunnel 網址會變，手機要重掃 QR）。
2. **請多米把茄記從多工畫面滑掉再開，按住右邊六個點上下拖一次**，然後用 read_terminal 讀 `[dbg]`：
   - **修好的樣子**：`began` 之後要等手放開才有 `grip finalize`，`ended` 的 from、to 會不一樣，順序真的換了
   - **修好了**：拿掉 6 處 `[dbg]`，跑 `npm test`、`npm run typecheck`、`npm run lint`、`npm run check:tokens`；把這個坑寫進 `.vibe/規矩檔.md`「踩過的坑」（zIndex 變了會把後面的兄弟拆下來重裝，RNGH 偵測元件被拆手勢就取消；網頁測不出來）；提交；請多米走 H1～H11
   - **還是一 began 就 finalize**：根因猜錯。下一個嫌疑是 `began` 裡同一輪的 `setDragging(true)`（`scrollEnabled` 變了）和 `setHeldId` 造成的重畫。逐一暫時拿掉（先不設 `held`、再不設 `scrollEnabled`）看 `[dbg]` 哪一個讓 finalize 不再馬上來，不要憑感覺改
3. 多米回 H 幾有怪就修；動手感先讀 `[perf]`，改完貼前後對照。覺得還是卡，先用 `npx expo start --tunnel --no-dev --minify` 看正式版的 JS 再判斷（這個模式終端機看不到 `[perf]`）

## 🗑️ 這次會話的雜訊（下次別重新討論）
- 網頁預覽窗格隱藏（多米的視窗最小化）時，rAF、ResizeObserver、scroll 事件都不跑，看起來像程式壞了（位置表沒交過去、捲動空白、進場動畫卡住），其實是環境。做法見 `.vibe/網頁測試小工具.md`
- 網頁過了不代表 iPhone 過：這次拖把手就是。多米問過為什麼老說要真機：一半因為沒有 Mac 跑不了模擬器，一半因為手感本來就只能真機
- 我說過「每畫一行都要同步問十幾個值」是講太重了，只有值變過才同步問，診斷文件已更正
- `.vibe/.turn-count` 不進 git；commit 時的「LF will be replaced by CRLF」不用管

# Handoff: C2、D1 真機過；D2～D4 和「照 iOS 補的」都做完但沒真機過；多米玩了說「還是很怪」，還沒講哪裡怪

> 產出時間：2026-11-02 05:01（電腦時鐘，+08:00）。上一版的內容在 git 歷史（commit 2fd842e 的 `.vibe/HANDOFF.md`），更早的在 `.vibe/handoff/archive/2026-11-02-1600.md`
> ⚠️ 這個會話在帳本、state.json、舊交接裡寫的「18:00、20:00、23:30、00:30」是估的，不準；先後以 `git log` 為準
> 專案：`E:\茄記\qieji-app`（Expo SDK 58／RN 0.88，iOS app；多米沒有 Mac、不太看程式、用開發版＋tunnel 真機測）
> GitHub：私人 repo https://github.com/domyweb666/qieji-app（master，commit 完直接 `git push`；程式最新 2fd842e）
> 測試方式：多米自己開 tunnel（`cd E:\茄記\qieji-app` 再 `npx expo start --tunnel --port 8083`，8083 已經是他開著的那個）。純 JS 改動手機重新載入就好

## ✅ 這次完成了什麼
- C2 目錄排列同步 iCloud（`layout.json`）→ 多米真機「C2 ok」（13 條含刪 app 重裝）→ **組塊 C 結案**；舊待辦「D2 刪掉重裝紙會回來」一併補驗
- D1 長按選單放進資料夾、資料夾磚、打開、改名、移出 → 多米真機「D1 ok」
- 改 B2：點清單名不再改名，改名只從紙的 ⋯「改名字」（c679401）
- D2 拖疊成資料夾（停在別張正中間半秒疊；讓位改成停 0.2 秒才讓，多米選照 iOS）
- D3 從資料夾拖出來（之後被 D4 取代）
- 多米真機回報 5 點之後：
  - 找到 Apple 官方規範，寫成對照表 `.uiux/iOS主畫面編輯-官方規範對照.md`
  - 補上按住格子空白處進抖動、抖動中點空白處結束、抖動中點資料夾會打開（裡面跟著抖、直接拖）
  - 拿掉「移出資料夾」「放進資料夾…」兩個文字選項，VoiceOver 動作留著
  - 目錄長按選單加「釘選／取消釘選」，跟紙的 ⋯ 共用 `src/components/pin.ts`（多米原本是找不到釘選）
- D4 拖曳照 iOS（2fd842e）：拖到資料夾磚上停一下資料夾打開、放進指定位置；從資料夾拖出框停一下資料夾收起、放到目錄任一格；資料夾裡換順序
- 規矩檔「踩過的坑」加一條：借 iOS 的互動先查 Apple 官方原文列對照表，不憑印象

## 🚧 還沒做完 / 待決定
- **多米說「還是很怪」，還沒講哪裡怪**：他要在新對話裡講。這是下一步的第一件事
- **D2、D4、照 iOS 補的那批都還沒上真機**：全是手勢，網頁預覽測不到。待驗清單 `.vibe/操作清單-待驗.md` 第 0～36 條（第 12～16 條是 D3 舊版，已被第 27～36 條取代）
- 「按了移出資料夾沒移出」（多米回報第 4 點）沒重現出來；那個選項已經拿掉，拿出來改用拖，用的是同一個 `outOfFolder`
- D4 已知限制與風險（真機怪的話先查這幾個）：
  - 從資料夾拿起的紙不會讓別的資料夾彈開（一次只開一個），疊進去可以
  - 座標假設面板全開時目錄左上角＝螢幕 (0,0)。格子位置是 `gyOf`＝`pagerY`（onLayout 量的）＋s＋（第一頁多一塊磚高）＋m。浮起那塊或讓位對不準，先查這裡
  - 資料夾框 onLayout 量好之前（`dg.bw`＝0）不對準；彈開後手指要先進過框，之後離開才會收起
  - 拖跨頁、拖出資料夾時，被拖的那塊磚在 React 裡會換父層。C5 真機沒事，D4 更複雜，沒驗過
  - D2 起讓位要停 0.2 秒，C4 驗過的手感變了
- 手感參數全在 `src/lib/tokens.ts`：`timing.reflow` 200、`stackHover` 500、`folderSpring` 500、`folderLeave` 350、`gesture.stackZone` 0.3、`motion.stackTarget` 1.08
- 如果多米覺得整個方向不對，可以退回這幾個點：e013b99（D4 之前）、10d3fd7（照 iOS 補之前、D3 之後）、6705a4a（D1 剛真機過）
- 舊待辦不變：LICENSE 還是 Expo 範本；送審缺 ascAppId、隱私權政策公開網頁、公開信箱；新 App 圖示要建開發版才看得到；組塊 D 結案後要重跑 `.uiux/08-上架.md` 檢核表再送審
- 認領中、沒驗的：資料夾之前的卡片分類沒做；兩台互改的同步驗不了

## 📌 關鍵決策（這次定下來的，下次別再爭論）
- C2：`layout.json` 跟紙放同一個 iCloud 資料夾。只有親手排才算改排列，後排的那台為準；對不上的紙補在最後；iCloud 沒有就把這台的傳上去，剛裝好只有教學紙的那台不傳
- D1：資料夾跟排列一起進 `layout.json`。資料夾磚＝名字＋最多四個色點方塊＋N；空了就消失；新資料夾叫「新資料夾」
- D2：照 iOS，停在正中間半秒疊、停 0.2 秒讓位
- 多米 11/02 晚：
  - 照 iOS 三件全要：拖到資料夾上打開、拖出來放任一格、資料夾裡換順序
  - 放進、移出資料夾都不要文字選單，只用拖
  - 目錄長按選單也要有釘選
  - 點清單名不改名
- 規矩：借 iOS 的互動先查官方原文；跟官方對不上的地方先問多米，不自己決定。多米偏好用手就懂、不要文字選單

## 📂 下個會話最重要的檔案
- `.vibe/HANDOFF.md` ← 這份
- `.uiux/iOS主畫面編輯-官方規範對照.md` ← **下一個會話必讀**：Apple 使用手冊＋HIG 重點和茄記逐項對照
- `.vibe/安全標準.md` ← **下一個會話必讀**（OWASP MASVS；存資料、加權限、加套件前自查）
- `.vibe/規矩檔.md` ← 動工前必讀，最後一條是這次加的
- `.vibe/切片帳本.md` ← 進行中＝組塊 D。「機器已驗」區有 D2、D3、D4、真機回報修正四段：做法、證據、沒驗到
- `.vibe/操作清單-待驗.md` ← 多米照條號回報（0～36）
- `.vibe/標準清單.md` ← D2、D3、D4 三段標準
- `src/components/DirPanel.tsx`：
  - 拖曳：`useDragPan`、`aimOf`、`DG`
  - Directory 裡：`setD`、`onAim`、`springOpen`、`springClose`、`drop`、`flatOf`、`folderNotes`
  - 元件：`PageBack`、`Tile`、`FolderTile`、`DragGhost`
- `src/lib/model.ts`：`fixOrder`／`fixFolders`、`seatedEntries`、`newFolder`、`intoFolder`、`outOfFolder`、`placeInFolder`、`placeTop`、`renameFolder`、`readLayout`、`mergeLayout`、`layoutToSend`
- `src/lib/cloud.ts`（`layout.json` 上傳下載）、`src/lib/store.ts`（`ownLayout`、`mergeLayout`）
- 測試：`tools/tests/{c1-seats,c2-layout,d1-folders,d4-drag}.test.ts`（`node 檔名` 跑），`tests/*.mjs`（`node --test`）

## ⏭️ 下一步從哪繼續
1. 讀這份、`.uiux/iOS主畫面編輯-官方規範對照.md`、帳本「進行中」和「機器已驗」區
2. **先聽多米講哪裡怪，不要先動手。** 請他照待驗清單條號講，或講「做了什麼、看到什麼、原本以為會怎樣」，能錄螢幕最好
3. 每一點先對照官方規範：程式沒照規範就修；規範沒寫到的就用一題選擇題問多米
4. 改手勢只能真機驗。改完給多米照條號的待驗清單；組塊 D 要多米回「D ok」才結案，結案後才做帳本「全部做完」那段

## 🗑️ 這次會話的雜訊（下次別重新討論）
- 網頁預覽：
  - Claude 視窗縮小或被擋住時，預覽頁不畫，點擊和截圖都會失敗
  - 分頁被藏起來時 onLayout 不觸發，目錄的磚整片畫不出來（boxH＝0）
  - 都是工具的問題，跟程式無關
- 長按、拖在網頁預覽做不到。要看資料夾的畫面，可以從 `globalThis.__qiejiStore` 改 state、叫 subs 重畫
- Apple 使用手冊頁面用 WebFetch 只抓得到導覽。要用 curl 抓 HTML，找「按住」那附近擷取；Python 輸出要寫成 UTF-8 檔再讀，console 會變亂碼
- Bash heredoc 偶爾出現 unexpected EOF，改成把腳本寫到 scratchpad 的 .py 再跑
- 用 sed 批次改測試會改到不該改的地方，改完要看 git diff

# Handoff: 11/03 本機會話——重建開發版、修四點真機回饋、目錄拖曳 iOS 真正原因、膠囊換紙後滑不動、做完自由擺放（含刪除／拿出資料夾留空位）；116～142 全部還沒真機

> 產出時間：2026-11-03 11:26（電腦時鐘，+08:00；先後以 `git log` 為準）
> 專案：`E:\茄記\qieji-app`（Expo SDK 58／RN 0.88，iOS app；多米沒有 Mac、不太看程式、用開發版＋tunnel 真機測）
> GitHub：私人 repo https://github.com/domyweb666/qieji-app（master）。多米每次會說「推上去」才 push；這次會話的 commit 都已推，origin＝28745bd
> 上一版交接：`.vibe/handoff/archive/2026-11-02-1110.md`

## ✅ 這次完成了什麼
- 拉下 Claude chat 的 4 個 commit（0fdf043 目錄照原型、7e9a46f 資料夾霧化、a965ab7 系統元件化、e88eb33 底部列＋系統清單），`npm install` 裝 expo-blur
- 重建開發版（EAS build 74184742，11/03 00:35 完成，含 expo-blur 和 11/01 的新圖示）。之後沒有再加原生套件，**改動都是 JS，tunnel 重載就好、不用重建**
- 5a07d2e 多米四點：底部列（膠囊＋右下 ＋）畫到紙外面（`PageBarHost`＋`barSlot`），換張時不重掛；系統清單版字改系統內文字級＋上下留白 12；目錄搜尋改「搜尋筆記」（列出符合的行，點了換張、捲到那行亮一下；搬行模式照舊搜清單）；輸入框改不透明奶油白
- 638d188 目錄拖曳 iOS 真正原因（chat 的 9088a7f 只改 minDistance、網頁會過、iOS 照壞）：長按後先 armed、拖超過 tileDragHeld 才拿起；抖動中 `activateAfterLongPress` 給 undefined 不給 0
- 5ea5679 紙的彈出選單開著時底部列收起
- fc0da5b 膠囊換過一次紙就滑不動 → 手勢改由 `PageBar` 自己建（紙只交 hx、turning、左右 id、換紙動作）；資料夾裡「出框拿出來」改看手指，跟「翻資料夾頁」同一個基準
- e1cfe64＋1c9a7d6 自由擺放（規格在對照表第十節，多米說「照規格做」）：座位表多空位標記「.」，拖曳狀態改成格子表 `cells`，放到空格停那格、拖走留空位、互換不變、頁尾空格和全空的頁自動不存
- 28745bd 刪除留空位（`leaveHole`／`fillHole`，還原站回那格）、拿出資料夾放那頁第一個空格（`outOfFolder` 的 `to`）；修上一版副作用：從資料夾拖出直接疊到別張不再多一個空格
- 測試 107 條全過（新增 `tests/search.test.mjs`、`tests/holes.test.mjs`）；tsc、lint、check-tokens 都過
- 規矩檔新增 4 條（iOS 手勢設定≠網頁、RNGH 手勢要跟偵測元件同一個元件、同一個拖曳裡的判斷要同一個基準、拖曳門檻要讀 RNGH 原生碼確認）

## 🚧 還沒做完 / 待決定
1. **真機全部沒驗**：待驗清單第 116～142 條（第 0～115 條之前也都還沒拿到多米的「ok」）。多米已經在手機上看過、確定**有問題已修**的只有：膠囊滑不動（129）、資料夾跨頁被拿出去（130）、想放哪就放哪（131～142 是新做的）
2. **「打字時全黑」原因沒抓到**：程式裡打字時只有 30% 暗幕＋輸入框，沒有任何一層是全黑；已把輸入框從液態玻璃改成不透明。多米再看到黑就請他截圖
3. 圖 1（4:48 的舊版畫面）的「跨頁搬到外面」照「資料夾裡的那張被拿出資料夾」理解修了；如果多米其實是說「整個資料夾磚拖到目錄別頁出錯」，要另外查
4. 舊待辦照舊：LICENSE 還是 Expo 範本；送審缺 ascAppId、隱私權政策公開網頁、公開信箱；組塊 D 結案後重跑 `.uiux/08-上架.md` 檢核表；Paper.tsx 的 LineRow `const M = T.motion, G = T.gesture` 被 worklet 抓（目前無害）

## 📌 關鍵決策（這次定下來的，別再爭論）
- 底部列在紙外面（`index.tsx` 的 `PageBarHost`），**手勢在 `PageBar` 裡建**；鍵盤升起、輸入框開著、排順序、紙的彈出選單開著時不畫
- 目錄搜尋＝搜尋筆記（列行）；搬行模式＝搜尋清單（列磚）
- 輸入框不透明；系統清單版的字跟系統「文字大小」放大
- 目錄拖曳：長按時間到只開選單，拖超過 18 點才拿起；抖動中移超過 12 點才拿起、點資料夾晃一下還是點
- 自由擺放（對照表第十節）：放到空格停那格、拖走留空、刪除留空（還原回原格）、拿出資料夾放那頁第一個空格、互換與疊資料夾規則不變、新的一張排最後不填空、資料夾裡緊排不留空

## 📂 下個會話最重要的檔案
- `.vibe/操作清單-待驗.md` 第十四～十六節（116～142）
- `.uiux/iOS主畫面編輯-官方規範對照.md` 第十節（自由擺放規格與追加）
- `.vibe/規矩檔.md` 最後 4 條（2026-11-03）
- `src/components/DirPanel.tsx`：`useDragPan`（armed）、`aimOf`（CELL_AIM、空位位元表 holeAt）、`flatOf`／`cellsOf`／`placeAt`／`firstEmpty`、`takeOut`、`onEdge`
- `src/lib/model.ts`：空位（HOLE、isHole、holeFor）、`fixOrder`、`reseat`（visible 要整排含空位和換頁標記）、`seatedLayout`、`leaveHole`／`fillHole`、`outOfFolder(to)`、`intoFolder(leave)`
- `src/components/PageBar.tsx`、`src/components/Paper.tsx`（`barSlot.set` 那段）
- `tests/holes.test.mjs`

## ⏭️ 下一步從哪繼續
1. 請多米在 `E:\茄記\qieji-app` 開 tunnel（`npx expo start --tunnel`，在上一層 `E:\茄記` 跑會出 ECOMPROMISED），把茄記從多工畫面滑掉再開
2. 照待驗清單測，優先順序：129（換過紙膠囊還滑得動）→ 131～142（自由擺放、刪除與拿出資料夾留空）→ 116～128
3. 多米回報條號就照條號修；碰到手勢問題先讀 `node_modules/react-native-gesture-handler/apple/` 的原生碼確認 iOS 行為，網頁預覽過了不算數

## 🗑️ 這次會話的雜訊（下次別重新討論）
- 網頁預覽窗格在背景時：手勢事件、動畫、格子區量高度（onLayout）都不跑，目錄的格子畫不出來、膠囊手勢測不了；模擬 PointerEvent 還會被 `setPointerCapture` 擋（No active pointer）。手勢和目錄畫面只能真機驗
- 終端機的 `iOS Bundled … (1 module)` 是正常的重載，不代表沒拿到新程式
- `View … has a shadow set but cannot calculate shadow efficiently` 是效能提示，不是錯誤
- 網頁預覽的資料（localhost:8082 的存檔）只有「從這裡開始」一張，跟手機無關

# Handoff: 雲端會話做完虛擬手機原型對照＋主畫面七條；這次做完 (a) 左右滑頁數規則、(b) 頁點長條＋圓點；0～79 條全部還沒真機

> 產出時間：2026-11-02 11:10（電腦時鐘，+08:00；先後以 `git log` 為準）
> 專案：`E:\茄記\qieji-app`（Expo SDK 58／RN 0.88，iOS app；多米沒有 Mac、不太看程式、用開發版＋tunnel 真機測）
> GitHub：私人 repo https://github.com/domyweb666/qieji-app（master，commit 完直接 `git push`）
> 上一版交接：`.vibe/handoff/archive/2026-11-02-0810.md`（裡面「多米的嚴厲回饋」那段仍然有效：借系統互動先列整套規格，不准一條一條補）

## ✅ 08:10 之後完成的
- **雲端會話**（多米在 claude.ai 開的，https://claude.ai/code/session_017KmnPEmXZs8AtFdacWc9JB，那邊沒寫交接）：
  - cb5cf8b：做了能玩的「掌上菜園」虛擬手機原型（Artifact），多米玩過說完美；拿它逐項對照目錄，補三件：停住 0.28 秒才讓位（左右也疊得到）、疊停 0.3 秒、瞄準後範圍放寬 0.42、長按那張原位浮起＋選單接在正下方。對照表第六節、待驗 58～63
  - d247550：多米選「七條一次做完」：Dock＝釘選（拖進拖出）、拖到最後一頁右邊緣開新頁（推翻 C5，座位表多「|」換頁標記）、點清單從磚放大打開、長按選單最上面「記一行」、資料夾磚 2×2 預覽、暗幕蓋到把手；修拖到別頁放手沒反應。對照表第七節、待驗 64～74、`tests/pages.test.mjs`
  - 結論：交接說的「主畫面互動完整研究」用原型對照的方式做完了
- **這次（本機會話）**：
  - (a) 清單左右滑：頁＝[一張沒釘選的, 釘選 1, 釘選 2]；從釘選那張往回滑回到原本那張。`model.swipeSet(s, cur, lastFree)`、`store.lastFree`（AsyncStorage `cn.lastFree`）、Paper 的 turnTo／openNote 換頁前記、PagePreview 把手用同一組頁
  - (b) 頁點：現在這頁長條 20、其他是 4 的淡圓點、間距 5
  - 新測試 `tests/swipe.test.mjs` 6 條；全部 83 條、tsc、lint、check-tokens 過；網頁預覽驗了預覽頁與頁點
  - 待驗清單補第十節 75～79
  - 多米再加兩點：左右撥時右下 ＋ 不動（-hx 抵掉平移、預覽不畫 ＋）；紙最下面的空白處也能左右撥（swapBelow，打字／輸入框／拖行時不接）。待驗 80～82

## 🚧 還沒做完 / 待決定
1. **全部都沒在真機上驗**：待驗清單第 0～82 條。測之前請多米從多工畫面把茄記滑掉再開，終端機出現完整的 `iOS Bundled … (2千多 modules)` 才算載入成功。組塊 D 要多米回「D ok」才結案。
2. 對照表第六節有一條「交給多米選」還沒選：疊成資料夾後要不要打開（現在照多米看錄影定的：不打開，叫「新資料夾」）。
3. 資料夾背景霧化（expo-blur）：程式已做（2026-11-02 多米：直接做），**要重建開發版**才看得到（`eas build --platform ios --profile development`）；舊開發版自動退回不霧化，不會閃退。
4. 舊待辦：LICENSE 還是 Expo 範本；送審缺 ascAppId、隱私權政策公開網頁、公開信箱；組塊 D 結案後重跑 `.uiux/08-上架.md` 檢核表。
5. 小風險沒處理：Paper.tsx 的 LineRow 還寫著 `const M = T.motion, G = T.gesture` 被 worklet 抓進去（目前無害，照 DirPanel 抄成數字常數較乾淨）。

## 📌 關鍵決策（別再爭論）
- 清單左右滑：最左固定是「最近看的那張沒釘選的」，那張被刪或被釘了改用最近改過的沒釘選那張；全部都釘了就只有釘選的頁
- 頁點：現在這頁長條、其他小圓點（像番茄鐘 App）；只有一張時一條長的
- 目錄互動以「掌上菜園」原型為規格（對照表第六節）；Dock＝釘選、最多兩張；拖到最後一頁邊緣開新頁
- 08:10 版的決策照舊（疊成資料夾不打開、「−」只有紙磚有＋確認框、只剩一張就拆、只在標題區撥、撥過半頁或甩一下才換）

## 📂 重要檔案
- `.uiux/iOS主畫面編輯-官方規範對照.md` 第五～七節
- `.vibe/操作清單-待驗.md` 第 0～79 條
- `.vibe/切片帳本.md`「機器已驗」區最上面
- `.vibe/規矩檔.md`（最後幾條：借 iOS 互動先查官方、worklet 不抓 `p`、模仿平台互動先列整套規格）
- 程式：`src/components/DirPanel.tsx`（目錄、Dock、換頁標記）、`src/components/Paper.tsx`（換張、PagePreview、SegHandle）、`src/lib/model.ts`（swipeSet、seatedLayout）、`src/lib/store.ts`（setLast、lastFree）

## ⏭️ 下一步
1. 真機：請多米滑掉茄記重開、確認完整 Bundled，照待驗清單 0～82 測（多米習慣全做完一次測）。
2. 多米回報後照條號修；全部過回「D ok」結案，再做帳本「全部做完」那段與上架檢核。

## 🗑️ 雜訊（別重新討論）
- 網頁預覽面板沒顯示在畫面上時，動畫跑不完、計時器也變慢；撥頁要等很久或乾脆卡住，不是 app 的問題
- usePanGesture 的設定物件不能用 `...` 展開（Worklets 外掛報錯、tsc 抓不到），要共用就抽 worklet 函式
- 用 JS 造 PointerEvent（`pointerId: 1`、`pointerType: 'touch'`）可以撥、可以拖
- 網頁預覽 localStorage 裡的 n1～n4 是測試假資料
- tunnel 要多米自己開（`npx expo start --tunnel --port 8083`）

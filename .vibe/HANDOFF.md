# Handoff: 2026-11-01 八包純 JS 改動全部 commit、全部待真機；多米要「一次做完再一次真機」，下一步是第四輪兩個原生件（要重建）

> 產出時間：2026-11-01 03:06（上一版 2026-11-01 01:49 在 `.vibe/handoff/archive/2026-11-01-0149.md`；本會話從它接續，一路追加後這份重寫）
> 前一會話的最後狀態，給下一個會話接續用
> 專案：`E:\茄記\qieji-app`（Expo SDK 58／React Native 0.88，iOS 原生 app，多米沒有 Mac）
> **測試方式**：多米用自己的開發版 app（EAS 建置、內部發佈、裝在 iPhone 17）測，`npx expo start --tunnel --port 8082` 連（8081 常被另一個專案「豆帳」佔著）；只改 JS 不用重建；改 `app.json`、加原生套件、升 SDK 才要重建（先 `npx expo-doctor`）。EAS 來龍去脈在 `.vibe/EAS建置-申請與設定步驟.md`。
> **多米 2026-11-01 定的工作節奏：「一次做完，我再一次真機測試」**——不要每包停下來等真機，把不用重建的都做完、要重建的做完再一起建一次，然後他照驗收清單一次走完。

## ✅ 這次完成了什麼

（commit 由舊到新，每包獨立、`git revert` 就能單獨退）

- `05fb208` 文件：H5 多米定乙；四包「真機看什麼」彙成 `.vibe/真機驗收-四包-2026-11-01.md` 勾選清單（之後每包都往這份加一節）
- `67f0d98`／`934c92a` **輸入框暗幕**（第五包）：多米提「升到正中＋背景變暗」，做了第二版；他看了說**體感很糟糕**、全權交 Agent 改 → 走 `domi-uiux-review` 審查（`.uiux/審查紀錄.md` 2026-11-01）：2-5 核心動作被做成正中對話框、2-4 框的滑入疊在跟鍵盤的位移上兩段不連續、四個時鐘各自到位 → **第三版**：框貼回鍵盤上面，框與暗幕進出都用 `keyboardFollow`（跟鍵盤一個時鐘），暗幕留著、點暗幕＝✓（有字先送出）、**點外面不能再點到別行**
- `451092e` **排順序把手常駐**（第六包）：每行右邊三條線把手，`sorting` 模式、⋯「排順序」項、「排好了」膠囊全拿掉；把手上「上下」動＝拿起、「左右」動讓給滑動（tokens 加 `gesture.dragFailX` 10）；行的 `layout` 過場開關改成 `dragging`。推翻重新設計第二輪 #127
- `deca5b5` **H5 乙**：滑動不收鍵盤（拿掉 swipe `onActivate` 的 `dismissKb`）
- `5f0aae3` **第三輪打字本體**（第七包）：K5 貼多行自動拆行（`model.ts` `splitPasted`＋測試，`onChange` 只在換行數變多時拆）；K1 點一下游標落在點的位置（`model.ts` `caretAt`＋測試，Field 隱形 Text `onTextLayout`，tap 的 e.x 扣 cin 左內距；網頁沒 onTextLayout 照舊落尾）；K6 目錄面板聽自己的 `transitionEnd`（closing）→ `store.panelClosed()` → 紙馬上開輸入框，700ms 留當保險
- `a1a127b` **30 天自動清接上**（第八包，核心動作卡 #11）：`store.purgeTrash()` 在 `load()` 與回到前景各跑一次，張看 `deletedAt`、刪掉的行看 `bin` 的 `at`，同一套「拿不準就不刪」；匯入備份的最近刪除一律從匯入當下重算 30 天（`restampTrash`）；不留清掉紀錄；最近刪除頁換接上後文案。Agent 當審查工程師，答案在 `.vibe/待審-最近刪除30天自動清.md` 最後一節
- 每包都過 check:tokens、typecheck、lint、測試（25 → 29）；網頁能驗的都驗過（細節見 🗑️）；設計檔每包同步（02-流程、06 首次體驗、03 單手、04 參數表、05 原始清單／設計版 `Tokens.ts`／詞彙表、提案第八、九輪、lessons）

## 🚧 還沒做完 / 待決定

- **八包全部待真機**：手感第一輪、底部輸入框、未命名、第二輪過場（上一會話四包）＋暗幕第三版、把手常駐、第三輪打字本體、30 天自動清（本會話四包）。**一條路走完的勾選清單：`.vibe/真機驗收-四包-2026-11-01.md` 第一～九節**（檔名沒改，內容已是八包）。最要看的三處：把手 G3 右緣捲動會不會誤拿起（會就加 `activateAfterLongPress` 150，數字進 tokens）、暗幕第三版 C1 框與鍵盤是不是一起到位、30 天 T4／T6 不該刪的沒被刪
- **第四輪兩個原生件，各自一輪、要重建**（待審清單第三、四節）：4a K7 `react-native-keyboard-controller`（互動式收鍵盤，SDK 58 內建相容庫，`npx expo install`；元件與 hook 名字動工前開套件文件對一次）；4b S1 `expo-splash-screen` 淡出（順便收 06 的 ❓12）。建置前 `npx expo-doctor`，不符就 `--fix`。多米要一次做完，所以兩個都做完再建一次；但**兩個各自一個 commit**，真機出事才知道是誰
- **第五輪**量了才做：E1、S3、D4、P1～P4。E2 延遲基準從沒量過（閘門 3 第一條，240fps 慢動作六項，量法在待審清單第六節）
- 上一份交接列的仍未動：小工具上的 ＋（延伸端寫回 app 的資料共用，`.vibe/待審-EAS建置與小工具.md` 第四節）、閘門 1、2 未過
- 小尾巴：詞彙表 #20「輸入框」名字未經使用者驗證；`02-流程` T7 與詞彙表 #11 仍寫「點兩下」；`00-原始清單` 第 158 行「拖曳把手 36 × 52」是舊數字（現在熱區 44 × 行高）

## 📌 關鍵決策（這次定下來的，下次別再爭論）

- **多米提畫面改法時，寫提案前先照歸因順序過 2-4、2-5**，違反的章節寫進提案的「代價」欄讓他選；「一個東西同時被兩個動畫推」一律紅旗（lessons 2026-11-01，居中暗幕那次的教訓）
- 輸入框：貼鍵盤上面、暗幕留、框與暗幕與鍵盤一個時鐘；Return 送出不收、長高四行、點暗幕＝✓；**體感只能由多米真機定，網頁開發版的動畫極慢不能拿來判斷**
- 把手常駐、排順序模式拿掉（一件事一個入口）；提示那行不加第五個詞（把手本身是提示，閘門 2 看沒看過的人會不會自己拖）；把手樣式三條線（iOS 慣例）、顏色 `textSecondary`，太吵再降 `textMuted` 但先跑對比
- 手勢分工門檻：把手上橫移 `dragFailX` 10 就讓給滑動，比 `swipeActivate` 14 小，兩個手勢不在同一點打架
- H5 乙：滑動完全不收鍵盤（記是核心動作，劃掉是周邊）
- 30 天自動清：拿不準就不刪；匯入的一律從匯入當下重算（網頁版不動）；不留紀錄不提示；打開 app 與回到前景各跑一次；每則不顯示倒數
- K6 走「目錄自己發事件通知 store」不走「紙監聽別人的路由」；700 永遠留當保險
- 三輪以來不動的仍不動：底部常駐輸入列、劃掉下沉、點兩下、空白區新增一行、Return 不震、∧ ∨ 跳行首、劃掉的字低對比、滑動加阻力、音效、更多震動

## 📂 下個會話最重要的檔案

- `.vibe/HANDOFF.md` ← 就是這份
- `.vibe/真機驗收-四包-2026-11-01.md` ← 八包的真機勾選清單，多米測完照編號回報
- `.vibe/待審-手感極致微調清單.md` ← 第三、四節是第四輪要做的 K7、S1（改法、風險、真機看什麼、退回都在）；第八節動工順序；第十一、十二節是暗幕與把手的始末
- `.vibe/待審-效能與手感優化清單.md`、`.vibe/待審-EAS建置與小工具.md`（第四節小工具 ＋）、`.vibe/EAS建置-申請與設定步驟.md`（第四輪要重建時照它）
- `src/components/Paper.tsx`：`composerStyle`／輸入框與暗幕那段、`LineRow` 的 `grip` 手勢（`activeOffsetY`／`failOffsetX`）、`tap` 的 `caretAt`、`onChange` 的拆行、`del()`；`src/components/Composer.tsx`（進出用 `keyboardFollow`）
- `src/lib/model.ts`：`splitPasted`、`caretAt`、`restampTrash`、`isExpiredAt`、`stampOldBin`／`purgeExpiredBin`；`src/lib/store.ts`：`purgeTrash`、`panelClosed`／`onPanelClosed`；`src/app/directory.tsx`：`transitionEnd` 監聽；`src/app/trash.tsx`：接上後文案
- `src/lib/tokens.ts`：`gesture.dragFailX`、`motion.keyboardFollow` 註解；設計版 `.uiux/05-設計代號/Tokens.ts` 同步
- `.uiux/審查紀錄.md`（2026-11-01 那段：輸入框體感審查）、`.uiux/lessons.md`（最後一條）、`.vibe/規矩檔.md`（三個坑：pointerEvents、worklet 叫 JS、Backspace preventDefault）

## ⏭️ 下一步從哪繼續

1. 先讀這份。多米定「一次做完再一次真機」，所以**不要停下來等真機**，直接接第四輪
2. **4a K7 互動式收鍵盤**：照待審清單第三節 K7 那列——先開 `react-native-keyboard-controller` 的文件對元件與 hook 名字（Expo SDK 58 頁只示範 `KeyboardAwareScrollView`、`KeyboardToolbar`），`npx expo install react-native-keyboard-controller`，根 `_layout` 包 `KeyboardProvider`，膠囊與輸入框改吃它的鍵盤高度 shared value 驅動 `kbLift`，`ScrollView` 的 `keyboardDismissMode` 改 `interactive`，`ensureVisible` 不動。一個 commit。網頁預覽驗不到鍵盤，只能驗沒壞掉
3. **4b S1 啟動畫面淡出**：待審清單第四節 S1 那列，`expo-splash-screen` 的淡出設定；順便收 06 的 ❓12（啟動畫面與紙不同色）。一個 commit
4. 兩個都做完：`npx expo-doctor`（不符 `--fix`）→ 照 `.vibe/EAS建置-申請與設定步驟.md` 建開發版 → 多米裝新版 → 照驗收清單第一～九節＋第四輪新加的一節一次走完，照編號回報過／不過
5. 之後要改畫面：先 `npm run check:tokens`；碰手勢、鍵盤、worklet 一定真機；多米提畫面改法先過 2-4、2-5 再寫提案

## 🗑️ 這次會話的雜訊（下次別重新討論）

- 網頁預覽的限制全在上一版 archive 的 🗑️（pointer capture 要先換掉、`.click()` 點不到 Fab、Return 送出要派 `keydown Enter`、進場動畫先藏元素、Reanimated 開發版極慢、`navigator.vibrate` 被擋、8081 被佔用 8082）。這次多的：
  - 網頁測拖曳：合成 `PointerEvent`（`pointerType: 'touch'`、`buttons: 1`）每 16ms 一步，落地彈簧在網頁要跑好幾秒，2.5 秒後讀 DOM 順序可能還沒換，截圖才是準的
  - 網頁測 30 天自動清：往 localStorage 塞資料會被切頁時的背景存檔（`AppState` → `writeNow`）蓋掉；要塞進 `globalThis.__qiejiStore.state.notes` 再 `location.reload()`
  - HMR 中途會噴 `sorting is not defined` 這類「改到一半」的錯，重載後乾淨就不用理
  - 第一次建輸入框居中版時 `StyleSheet.absoluteFillObject` 在 RN 0.88 的型別裡沒有，要寫四個邊
- 討論過但不做：K6 走路由監聽（紙聽 index 的 transitionEnd）——formSheet 收起時底下那頁不一定發 onAppear，改成目錄自己發；把手上加 150ms 按住——先零延遲，真機誤拿起才加；30 天清掉前自動備份——鍍金，不做

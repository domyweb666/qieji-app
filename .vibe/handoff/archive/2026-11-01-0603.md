# Handoff: 2026-11-01 第四輪建置（`fe928532`）裝上後多米三批真機回報全部做完、共 12 個 commit；全部純 JS 待他重載真機回報；資料夾那題定「先不分」

> 產出時間：2026-11-01 06:03（上一版 03:35 在 `.vibe/handoff/archive/2026-11-01-0335.md`，它前面加的三批進度摘要也在裡面）
> 前一會話的最後狀態，給下一個會話接續用
> 專案：`E:\茄記\qieji-app`（Expo SDK 58／React Native 0.88，iOS 原生 app，多米沒有 Mac、不太看程式）
> **測試方式**：多米用自己的開發版（EAS 建置 `fe928532`＝commit `bff693c`，裝在 iPhone 17、4G）測。改 JS 用 tunnel 重載：`npx expo start --tunnel --port 8083`（8081 被「豆帳」佔、8082 是多米 01:58 開的舊 Metro、檔案表過期會噴找不到 expo-modules-core，請他 Ctrl-C）。改 `app.json`、加原生套件才要重建（先 `npx expo-doctor`，步驟在 `.vibe/EAS建置-申請與設定步驟.md`）。
> **多米的節奏**：他正在真機上一條一條回報，回報一批就改一批，每批一個 commit；不用等他全部測完才動。

## ✅ 這次完成了什麼

（commit 由舊到新；每包獨立，`git revert` 就能單獨退）

- `f35e812` **K7 互動式收鍵盤**：`react-native-keyboard-controller` 1.22.7，根 `_layout` 包 `KeyboardProvider`，`Paper` 用 `useKeyboardHandler` 的 onMove／onInteractive／onEnd 逐格寫 `kbH`，`ScrollView keyboardDismissMode='interactive'`，JS 事件改聽套件的 `KeyboardEvents`
- `b74ac8f` **S1 啟動畫面淡出**：`expo-splash-screen`（之前根本沒裝），`setOptions({ fade, duration: T.motion.splashFade })`；app.json plugin 明寫淺色 `#FBF3E7`
- `8fb9b5e` doctor 對齊 20/20 → `2131942` 交接 → `bff693c` 深色啟動畫面 `#211A27`（多米選一起設）
- `e37d722` **裝上新建置一片白**：啟動畫面收不掉。`hide()` 的 onLayout 掛在根 View，ready 之後不會再來；以前沒事是因為 splash 原生模組不存在、preventAutoHide 空轉。onLayout 搬到「ready 才掛上」那層
- **第一批回報（6 條）** `18e9e1e`：排順序落地後再動一次（`setDragging(false)` 搬進位移歸零那一格）；目錄搜尋框字被切（`alignSelf: 'stretch'`）；行字 20/30 → 17/27（`font.bodyLine`）；輸入框不長高（先改鏡像、第二批又改）。`a536979` **選單合一 A1 全部自繪**：`PopMenu` 成為唯一選單，`Swatches.tsx` 抽出共用，目錄 ⋯ 與最近刪除點一則都改開 `PopMenu`（錨在 pageY）。`16fd43d` **輸入框第四版＝乙**：暗幕拿掉、點外面＝✓ 拿掉；輸入框開著時點一行＝草稿先送出、焦點進那一行
- **第二批回報（6 條）** `972131b`：(1)(2)(4) 同一個根——iOS 上「鏡像 Text 撐高、輸入框鋪滿」不準（滿行多一行空白、文字不在正中、三行就捲），行（`Field`）與輸入框（`Composer`）改成多行 TextInput 自己長、鏡像只量 onTextLayout（網頁仍由鏡像撐）；輸入框上限從四行改成 Paper 算的 `maxH`＝鍵盤頂到清單頂（`composerLines` token 拿掉）。(3) 鍵盤膠囊 ∧ ∨ ＋ ✓ 整個拿掉（`focusNeighbor`、`KBAR_H` 一起）。(5) 右下 ＋ 進出改跟鍵盤同一個事件、同一個時鐘（`kbUp` 在 willShow／willHide 翻，Fab 淡 `keyboardFollow`，2-4 做法 6）。(6) 新行不捲頂：`addFromDraft` 不 `scrollTo(0)`，`ScrollView maintainVisibleContentPosition({ minIndexForVisible: 0, autoscrollToTopThreshold: rowMin })`，行改成 ScrollView 直接子元件
- **第三批回報（2 條）** `147d085`：選單卡間距照 iOS 設定 app 的分組清單（一組一塊 `page` 底、文字起算的髮絲線、組距 24）；目錄 ⋯ 的排序與顏色篩選拿掉，只剩匯出／匯入。`6abfe96` 資料夾那題多米選甲「先不分」
- 每個 commit 都過 check:tokens、typecheck、lint、測試 29；網頁能驗的都驗了（選單卡、輸入框長到 13 行、點別行接手）；設計檔每包同步；`.uiux/審查紀錄.md` 多了三段（第四輪回報的審查＋做了的；資料夾甲乙丙丁）、`.uiux/lessons.md` 多一條

## 🚧 還沒做完 / 待決定

- **全部待多米真機回報**：`.vibe/真機驗收-四包-2026-11-01.md` 第十一節 **R1～R12、M8、M9**（M1～M3 被 M8 取代）。最要看的：R8 行底下有沒有空白、R9 輸入框一行時字在不在正中、R10 口述十幾行會不會捲、R12 捲到最底記完畫面動不動、R11 膠囊沒了收鍵盤順不順。這五項是 iOS 原生自動長高與 `maintainVisibleContentPosition` 的行為，**網頁驗不到**
- 第十節 S1 冷啟動的啟動畫面顏色（奶油 vs 白）還沒人看過；K7 拖鍵盤那幾格也沒回報
- 上一份交接的 K7 驗收項寫的是「膠囊跟鍵盤」，膠囊已拿掉，現在要看的是**輸入框**跟不跟（第十節 K7 列的文字沒改，看的時候自己換成輸入框）
- **沒動、留著的**：最近刪除右上角 iOS 標題列的原生 `Stack.Toolbar.Menu`（只有「清空」一項，UIMenu 長得跟卡幾乎一樣）；`Overlay.tsx` 的 `ui.sheet`（原生表單＋網頁自繪表單）現在沒人呼叫，照規矩檔不順手刪，留給 `vibe-simplify`；確認框仍是系統 Alert
- 第五輪（量了才做）：E1、S3、D4、P1～P4；E2 延遲基準從沒量過（待審清單第六節）
- 更早的：小工具上的 ＋（`.vibe/待審-EAS建置與小工具.md` 第四節）、閘門 1、2 未過；詞彙表 #20「輸入框」未經使用者驗證；`02-流程` T7 與詞彙表 #11 仍寫「點兩下」；`00-原始清單` 第 158 行把手舊數字

## 📌 關鍵決策（這次定下來的，下次別再爭論）

- **輸入框第四版＝乙**：框貼鍵盤、沒有暗幕、紙照常看得到點得到；點一行＝草稿先送出、焦點進那一行；✓ 或點空白處才收。推翻了同日早上的「暗幕留、點暗幕＝✓、點外面不能點到別行」
- **新行落在最上面時畫面留在原地**（多米定）；頂端一行高以內才露出新行。核心迴圈「看到才敢忘」只在頂端附近成立，多米接受
- **鍵盤膠囊拿掉**，沒有東西頂替：行裡打字收鍵盤＝點空白處或空行按 Return；輸入框自己有 ✓
- **一種選單**：`PopMenu`，皮照 iOS 設定 app 的分組清單；圖示留著（真機嫌吵再拿）
- **目錄不分層**（甲）：釘選＋搜尋＋最近改過在前；排序選項、顏色篩選都拿掉。紙超過 20 張或他發現自己用顏色分類，再回審查紀錄看丙（顏色當分組）／丁（真資料夾），開之前先做卡片分類。**這條之後別再主動提**
- **iOS 的高度交給 TextInput 自己長，鏡像 Text 只量行位置**（行與輸入框都是）；網頁才由鏡像撐高
- ＋ 的進出跟鍵盤同一個事件、同一個時鐘（keyboardFollow），不另排 150 的時鐘
- 行字 17／27 定案；`splashFade` 300 是初值
- 多米提畫面改法前先過 2-4、2-5 再寫提案；核心動作每多包一層（模態、暗幕）他真機就會回報體感差，網頁看不出來（lessons 2026-11-01）
- 三輪以來不動的仍不動：底部常駐輸入列、劃掉下沉、點兩下、空白區新增一行、Return 不震、劃掉的字低對比、滑動加阻力、音效、更多震動、把手 150ms 按住

## 📂 下個會話最重要的檔案

- `.vibe/HANDOFF.md` ← 就是這份
- `.vibe/真機驗收-四包-2026-11-01.md` 第十、十一節 ← 多米照編號回報過／不過
- `.uiux/審查紀錄.md` 最後三段 ← 第四輪回報的審查、每一批「做了的」、資料夾甲乙丙丁與多米的選擇
- `src/components/Paper.tsx`：`Field`（鏡像與輸入框誰撐高）、`kbH`／`kbLift`／`kbUp`、`KeyboardEvents` 的 useEffect、`addFromDraft`／`closeComposer`、`maintainVisibleContentPosition`、`dragApi.end`；`src/components/Composer.tsx`（`maxH`、WEB 才有鏡像）；`src/components/PopMenu.tsx`、`Swatches.tsx`；`src/app/directory.tsx`、`trash.tsx`、`_layout.tsx`（`KeyboardProvider`、`SplashScreen`、onLayout 位置）；`src/components/WebBars.tsx` Fab
- `src/lib/tokens.ts`：`font.bodyLine` 17/27、`motion.splashFade`、`keyboardFollow` 註解；`app.json` splash plugin
- `.vibe/待審-手感極致微調清單.md`（K7／S1 列、第十一節第四版）、`.vibe/規矩檔.md`（三個坑）、`.vibe/EAS建置-申請與設定步驟.md`

## ⏭️ 下一步從哪繼續

1. 先讀這份。多米回報第十一節 R1～R12、M8、M9 的結果 → 不過的照編號改。R8～R12 若不過，第一個該懷疑的是 iOS TextInput 自動長高與 `lineHeight: 27` 的排字（`Field` 的 `st.ta`、`Composer` 的 `s.input`），以及 `maintainVisibleContentPosition` 要求行是 ScrollView 的直接子元件
2. 全過之後：`vibe-simplify` 一片收掉 `ui.sheet`、`Row` 型別等沒人用的東西（審查過才刪）；然後第五輪先量 E2 基準
3. 之後要改畫面：先 `npm run check:tokens`；碰手勢、鍵盤、worklet 一定真機；多米提畫面改法先過 2-4、2-5 再寫提案
4. 重載連不上時先看是不是 8082 那個舊 Metro；重開 `npx expo start --tunnel --port 8083`

## 🗑️ 這次會話的雜訊（下次別重新討論）

- 網頁預覽的限制在 archive 0149、0306、0335 的 🗑️。這次多的：
  - `npx expo install <pkg>` 會自動把 config plugin 寫進 `app.json`（splash 沒參數＝白底）；Metro 跑著時 `expo install --fix` 會讓它檔案表過期，重開就好
  - 網頁 textarea 不會自己長（RNW 不做 autogrow），所以網頁要鏡像撐高；iOS 的 TextInput 會自己長。兩邊用 `Platform.OS === 'web'` 分
  - 網頁測輸入框：`document.querySelector('textarea[aria-label="輸入框"]')` 才是它，不加 aria-label 會選到行的 textarea
  - 網頁測最近刪除：`globalThis.__qiejiStore.state.notes[0].deleted = true` 再 `location.reload()`
  - `useReanimatedKeyboardAnimation().height` 是負數、iOS 只在 start 與 interactive 更新；`useKeyboardHandler` 事件的 height 是正數、iOS 每格有 onMove。用後者
  - EAS 用 `npx eas-cli@latest`，不加 @latest 會抓到舊版 18 跟 eas.json 的版本限制衝突；`eas build:list --json` 可以看建置對應的 commit
- 討論過但不做：`useReanimatedKeyboardAnimation`；`KeyboardStickyView` 放膠囊（膠囊後來整個拿掉）；資料夾乙丙丁（多米選甲）；K6 走路由監聽；30 天清掉前自動備份

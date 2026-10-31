# Handoff: 2026-11-01 第四輪建置裝上、多米兩批真機回報（6＋6 條）全做完：三個 bug、字級 17、選單合一 A1、暗幕拿掉 乙、iOS 改原生自動長高、膠囊拿掉、＋ 跟鍵盤時鐘、新行不捲頂；全部純 JS 待重載真機（驗收清單第十一節 R1～R12、M1～M7）

> **第二批（05:36 回報，commit 見 git log「第二批」）**：(1) 行底下多一行空白 (2) 輸入框文字不在正中 (4) 三行就捲——同一個根：iOS 的鏡像 Text 撐高不準，改成 TextInput 自己長（Field 與 Composer；網頁仍走鏡像）；輸入框上限改成鍵盤頂到清單頂（`composerLines` token 拿掉）。(3) 鍵盤膠囊拿掉（`focusNeighbor`／`KBAR_H` 一起）。(5) ＋ 進出改跟鍵盤同一個事件、同一個時鐘（`kbUp` 在 willShow／willHide 翻、Fab 淡 keyboardFollow）。(6) 新行不捲頂：`maintainVisibleContentPosition`＋行直接當 ScrollView 子元件、`addFromDraft` 不捲。**全部要真機**（R8～R12），尤其 iOS 自動長高與 maintainVisibleContentPosition 兩個網頁驗不到。

> **2026-11-01 04:30 之後的進度（接在下面那份 03:35 的交接前面）**
> - 多米建了 `fe928532`（commit `bff693c`）裝上。第一個問題：**一片白**——啟動畫面收不掉（`hide` 的 onLayout 掛在根 View，ready 之後不會再觸發；以前沒事是因為 splash 原生模組根本沒裝）。修了 `e37d722`。
> - 多米六條回報（截圖在對話，分析在 `.uiux/審查紀錄.md` 最後一段）：
>   1. 排順序換好又換一次 → `18e9e1e`：`dragApi.end` 的 `setDragging(false)` 搬進位移歸零那一格
>   2. 搜尋框字上緣被切 → `18e9e1e`：`searchInput` 加 `alignSelf: 'stretch'`
>   3. 輸入框打超過一行不長高＋「編輯感覺很不好」 → 長高 bug `18e9e1e`：`Composer` 改成跟 `Field` 同一套透明鏡像 Text 撐高、最多四行（網頁 27→108→27 驗過）。體感那半多米選 **乙**（下一個 commit）：暗幕拿掉、點外面＝✓ 拿掉；輸入框開著時點紙上的行＝草稿先送出、焦點進那一行、不捲回頂端（`closeComposer` 下一格看 `focused` 沒落在別行才 `scrollTo(0)`）；點空白處＝鍵盤收、草稿送出、框收。**📌 推翻了 03:35 那份 📌 裡的「暗幕留、點暗幕＝✓、點外面不能再點到別行」**
>   4. 行字 20 → 17（lineHeight 27）→ `18e9e1e`，tokens `bodyLine`、設計版 Tokens.ts、00 原始清單同步
>   5. 原生表單的 emoji 色點 ＋ 6. 三種選單風格不統一 → 多米選 **A1 全部自繪**（下一個 commit）：`PopMenu` 皮換成目錄面板語彙（page 底藥丸、間距分組、無分隔線、打勾 ✓、head 小標題、寬 280）；`Swatches.tsx` 抽出共用；目錄 ⋯ 與最近刪除點一則都改開 `PopMenu`；`NoteList` 的 onPress 帶 pageY。沒動：最近刪除 iOS 標題列的原生 `Stack.Toolbar.Menu`、`Overlay.tsx` 的 `ui.sheet`（沒人呼叫了，留給 simplify）、確認框 Alert
> - 真機看 `.vibe/真機驗收-四包-2026-11-01.md` **第十一節 R1～R4、M1～M7**（純 JS，重載就看得到；8083 tunnel 在終端機分頁）
> - 8082 上有多米 01:58 開的舊 Metro（檔案表過期會噴找不到 expo-modules-core），請他 Ctrl-C；之後都用 `--port 8083` 或重開
> - lessons 回補了一條：核心動作每多包一層（模態、暗幕）多米真機就回報一次體感差，網頁看不出來；「同一個意義三種樣子」是元件層的代號漂移
> - 建置 `fe928532` 的啟動畫面顏色（奶油 vs 白）還沒人看過冷啟動，S1 那兩格仍待驗

---

（以下是 03:35 的交接原文，第四輪怎麼做的都在這裡）

> 產出時間：2026-11-01 03:35（上一版 2026-11-01 03:06 在 `.vibe/handoff/archive/2026-11-01-0306.md`；本會話從它接續第四輪）
> 前一會話的最後狀態，給下一個會話接續用
> 專案：`E:\茄記\qieji-app`（Expo SDK 58／React Native 0.88，iOS 原生 app，多米沒有 Mac）
> **測試方式**：多米用自己的開發版 app（EAS 建置、內部發佈、裝在 iPhone 17）測，`npx expo start --tunnel --port 8082` 連（8081 常被「豆帳」佔著）；只改 JS 不用重建；改 `app.json`、加原生套件、升 SDK 才要重建（先 `npx expo-doctor`）。EAS 來龍去脈在 `.vibe/EAS建置-申請與設定步驟.md`。
> **多米 2026-11-01 定的工作節奏：「一次做完，我再一次真機測試」**——這一輪把要重建的也做完了，**現在就是該建一次、一次測完的時候**。

## ✅ 這次完成了什麼

（commit 由舊到新，每包獨立、`git revert` 就能單獨退）

- `f35e812` **4a K7 互動式收鍵盤**：裝 `react-native-keyboard-controller` 1.22.7（SDK 58 內建相容版，`npx expo install`）。根 `_layout.tsx` 在 `GestureHandlerRootView` 裡包 `KeyboardProvider`；`Paper.tsx` 的膠囊與輸入框位置改由 `useKeyboardHandler` 的 `onMove`／`onInteractive`／`onEnd` 三個 worklet 逐格寫 `kbH`（鍵盤高度，從視窗底算），`kbLift = useDerivedValue(max(0, kbH − below))`，`below`＝清單底邊到視窗底邊（onLayout 量，紙是根畫面所以實際是 0）；`ScrollView` 的 `keyboardDismissMode` 改 `interactive`；JS 端的 show／hide 改聽套件的 `KeyboardEvents`（will／did 兩對，事件給 `height`，鍵盤頂＝`winH − height`），`ensureVisible` 邏輯不動；底部留白 `kbPad` 與右下 ＋ 等 `keyboardDidHide` 才還原（保險：`view.kb` 仍是 Infinity 才收）。`Easing` 與 keyboardFollow 的 `withTiming` 從 Paper 拿掉（Composer 進出與暗幕仍用 keyboardFollow）
- `b74ac8f` **4b S1 啟動畫面淡出**：裝 `expo-splash-screen` 58.0.12——**之前根本沒裝**（`npm ls` 空的，prebuild-config 這版也沒有 legacy splash plugin），`expo install` 自動把 plugin 加進 `app.json`，沒給參數會變白底，所以明寫 `backgroundColor: "#FBF3E7"`（＝`page` 淺色值）。`_layout.tsx` 模組層級 `SplashScreen.setOptions({ fade: true, duration: T.motion.splashFade })`，`preventAutoHideAsync`／`hide` 改用這個套件的（expo-router 的殼沒有 `setOptions`）。tokens 加 `motion.splashFade` 300。06 的 ❓12 收掉：不改色、加淡出
- （下一個 commit）**深色啟動畫面一起設**：多米 2026-11-01 選「一起設，再建」，plugin 加 `dark.backgroundColor #211A27`（`page` 深色值），06 的 ❓10 收掉、驗收清單 S1 深色那列改成看深茄紫底
- `8fb9b5e` **建置前對齊**：`npx expo-doctor` 列 6 個小版落後 → `npx expo install --fix` → 20/20
- 每包都過 check:tokens、typecheck、lint、測試 29；網頁預覽只能驗「沒壞掉」（鍵盤與啟動畫面網頁都沒有）；設計檔每包同步（04 參數表、05 原始清單／設計版 `Tokens.ts`、06 首次體驗、待審清單 K7／S1 ✅、驗收清單第十節）

## 🚧 還沒做完 / 待決定

- **十包全部待真機，而且這次要裝新建置**：上一會話八包（手感第一輪、底部輸入框、未命名、第二輪過場、暗幕第三版、把手常駐、第三輪打字本體、30 天自動清）＋本會話 K7、S1。**一條路走完的勾選清單：`.vibe/真機驗收-四包-2026-11-01.md` 第一～十節**（檔名沒改）。第十節先看 K8 沒閃退（新原生模組第一關），再看 K7 拖鍵盤、S1 冷啟動
- **`eas build` 由多米按**（Claude 不代按）：`npx eas-cli@latest build --platform ios --profile development`。指令與注意事項在 ⏭️ 第 1 步
- **待調的數字**：`splashFade` 300 是初值，真機覺得慢就往 200 調（系統預設 400）
- **第五輪**量了才做：E1、S3、D4、P1～P4。E2 延遲基準從沒量過（閘門 3 第一條，量法在待審清單第六節）
- 上一份交接列的仍未動：小工具上的 ＋（`.vibe/待審-EAS建置與小工具.md` 第四節）、閘門 1、2 未過
- 小尾巴：詞彙表 #20「輸入框」名字未經使用者驗證；`02-流程` T7 與詞彙表 #11 仍寫「點兩下」；`00-原始清單` 第 158 行「拖曳把手 36 × 52」是舊數字

## 📌 關鍵決策（這次定下來的，下次別再爭論）

- **K7 用 `useKeyboardHandler` 自己寫 shared value，不用 `useReanimatedKeyboardAnimation`**：對過套件原始碼，後者在 iOS 只在 `onKeyboardMoveStart`（終點）與 interactive 時更新 shared value，中間靠 UIKit 隱式動畫帶；前者 iOS 每格走 CADisplayLink 的 `onMove`、拖曳走 `onInteractive`，套件自家 `KeyboardAvoidingView` 就是這樣寫。四個回呼都是 worklet，裡面只碰 shared value（規矩檔第三坑）
- 鍵盤相關的 JS 事件全改聽套件的 `KeyboardEvents`，不再混用 RN 的 `Keyboard.addListener`；`Keyboard.dismiss()` 照舊
- 啟動畫面：不改色（❓12 收掉）、加淡出；淺色、深色底色都明寫在 `app.json` plugin（＝`page` 兩個值，❓10 多米定一起設），不再靠「沒設定時剛好是奶油底」這種運氣
- 多米提畫面改法時，寫提案前先照歸因順序過 2-4、2-5（lessons 2026-11-01）；「一個東西同時被兩個動畫推」一律紅旗
- 三輪以來不動的仍不動：底部常駐輸入列、劃掉下沉、點兩下、空白區新增一行、Return 不震、∧ ∨ 跳行首、劃掉的字低對比、滑動加阻力、音效、更多震動、把手 150ms 按住（真機誤拿起才加）

## 📂 下個會話最重要的檔案

- `.vibe/HANDOFF.md` ← 就是這份
- `.vibe/真機驗收-四包-2026-11-01.md` ← 十包的真機勾選清單（第十節是第四輪），多米測完照編號回報
- `.vibe/EAS建置-申請與設定步驟.md` ← 建置步驟與踩過的坑（丁段）；`eas.json` development profile 釘 Node 24.13.0
- `.vibe/待審-手感極致微調清單.md` ← K7／S1 那列有改法與退回；第五輪在第六節
- `src/components/Paper.tsx`：`kbH`／`below`／`kbLift`／`useKeyboardHandler` 那段、`KeyboardEvents` 的 useEffect、`ScrollView` 的 `keyboardDismissMode`；`src/app/_layout.tsx`：`KeyboardProvider`、`SplashScreen.setOptions`
- `src/lib/tokens.ts`：`motion.splashFade`、`keyboardFollow` 註解；`app.json`：expo-splash-screen plugin
- `.uiux/06-首次體驗/首次體驗-暫定.md` 第四段（啟動畫面）、`.vibe/規矩檔.md`（三個坑）

## ⏭️ 下一步從哪繼續

1. **多米建開發版**（Claude 已把 doctor 跑到 20/20、全部 commit）。在專案資料夾：
   ```
   npx eas-cli@latest build --platform ios --profile development
   ```
   注意：這次多了兩個原生模組＋改了 `app.json`，**一定要重建、`--tunnel` 重載看不到**；可能問 Apple 帳密與憑證（選讓 EAS 代管）；合約更新沒同意會失敗（developer.apple.com/account 同意再來）；免費方案每月 15 次；建好掃 QR 裝、舊版可以直接蓋。建完 `npx expo start --tunnel --port 8082` 連
2. **裝新版第一件事看 K8**：冷啟動、開鍵盤、切 app 再回來，沒退桌面才往下。白光一閃退桌面＝原生層崩潰，看 iPhone 分析資料 `app-*.ips` 的 termination 欄；JS 錯是紅畫面不退桌面
3. 照驗收清單第一～十節走完，照編號回報過／不過；一滑就閃退先 `git revert` 那一包
4. 回報後：不過的照各列「退回」欄退或調數字（彈簧、`splashFade`、`dragFailX` 都在 tokens）；過了接第五輪（先量 E2 基準）
5. 之後要改畫面：先 `npm run check:tokens`；碰手勢、鍵盤、worklet 一定真機；多米提畫面改法先過 2-4、2-5 再寫提案

## 🗑️ 這次會話的雜訊（下次別重新討論）

- 網頁預覽的限制全在 archive 0149 與 0306 的 🗑️。這次多的：
  - `npx expo install <pkg>` 會**自動把 config plugin 寫進 `app.json`**（並把 widgets 的陣列重新排版），要檢查 diff；splash 這個沒參數就是白底
  - 跑著 Metro 時做 `npx expo install --fix`，巢狀的 `expo-router/node_modules/@expo/*` 被提升後 Metro 的檔案表過期，瀏覽器噴 `Unable to resolve module expo-modules-core`／`@expo/log-box`——**node_modules 沒壞，重開 `expo start` 就好**
  - keyboard-controller 在網頁是個普通 View、hook 全是空轉；expo-splash-screen 在網頁全是空函式；兩個都只能真機。`setOptions` 在 Expo Go 會警告，開發版不會
  - 套件的 `useReanimatedKeyboardAnimation().height` 是**負數**（`-event.height`）；`useKeyboardHandler` 事件裡的 `height` 是正數。這次用後者
- 討論過但不做：用 `useReanimatedKeyboardAnimation`（見 📌）；用套件的 `KeyboardStickyView` 放膠囊（會跟現有的 kbPad／ensureVisible 分家，先不動結構）。深色啟動畫面本來列成問題，多米答「一起設，再建」，已做

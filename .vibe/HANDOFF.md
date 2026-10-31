# Handoff: 效能與手感四輪改完（Return 開新行、點一下編輯、越線震＋拖曳 worklet、低風險三件），全部待真機

> 產出時間：2026-10-31 11:34
> 前一會話的最後狀態，給下一個會話接續用
> 專案：`E:\茄記\qieji-app`（Expo SDK 58／React Native，iOS 原生 app，多米用 Expo Go 在 iPhone 上測，沒有 Mac）
> 上一份交接（「紙是家」重新設計、插畫接上）在 `.vibe/handoff/archive/2026-10-31-1134.md`，那邊的定案仍然有效，這份只接著寫。

## ✅ 這次完成了什麼

多米問「還有什麼性能問題可以優化」「手感能不能提升」「為什麼網頁版的編輯手感比 iOS 版好」，Claude 拿 `E:\茄記\easynote\index.html`（網頁版）逐條對照 `Paper.tsx`，寫成待審清單，多米四輪都選「做」。master 上四個 commit，**一個都還沒真機測過**：

1. `dfe73b8` **Return 在這行下面開新的一行**（行的輸入框 `submitBehavior="submit"`＋`enterKeyHint="next"`，游標後面的字切到新行；空行按 Return 收鍵盤）＋ **編輯中的行底色變亮**（新 token `rowEditingFill`）＋ 三個新震動（新增一行 `add`＝impact Light、換色 `color`、拖過另一行 `dragPass`）
2. `b58b714` **點一下就進編輯**（`numberOfTaps` 2 → 1，提示字改「點一下改字」），**推翻上一份交接的「點兩下才編輯」定案，是多米同意的試驗**
3. `47f1dfe` **滑動越線那一刻震**（swipe worklet 的 `armed`；放手不再震）＋ **拖曳排序的位置計算搬進 worklet**（`dragMids` shared value，拿起、放下才回 JS）
4. `01710a6` **啟動畫面撐到紙畫出來才收**（expo-router 自帶的 `SplashScreen`，沒裝新套件）＋ 三張茄子 PNG → WebP（384 KB → 50 KB）＋ iOS 不載入 react-native-svg（`Sym.tsx` 非 iOS 才 require Icon）

設計文件同步：`00-原始清單.md` 觸覺表、`參數表-暫定.md`、`對比檢查表.md`（rowEditingFill 一段）、`01-核心動作卡` 的圖檔名。

## 🚧 還沒做完 / 待決定

- **四個 commit 全部待真機**，每一輪各自要看的東西和退回方法都在 `.vibe/待審-效能與手感優化清單.md` 第五節。最要緊的三件：點一下會不會在捲動時誤觸（誤觸就 `numberOfTaps` 改回 2）；worklet 會不會崩潰（上次踩過的坑，網頁過了不算）；iOS 上 Return 是否真的不換行、鍵盤不收
- 待審清單還沒做的：A4 字放大到 20（多米看過第一輪再決定）、A5 行首 Backspace 併到上一行（要 `onSelectionChange`，注音組字可能干擾）、第四節 iOS 原生小工具（要先跨「EAS 建置＋TestFlight」這道門，Expo Go 做不到）
- `.uiux/02-流程` 的 ❓D「鍵盤開著怎麼加下一行」等於被 Return 回答了，設計檔還沒改，等真機過再一起改；❓12 啟動畫面顏色沒動
- 上一份交接列的仍未動：30 天自動清未接、閘門 1、2 未過、詞彙表要補新名字
- `.vibe/HANDOFF.md` 之外沒有別處記這四輪；`.uiux/重新設計/提案.md` 第八節停在第五輪，沒補這四輪

## 📌 關鍵決策（這次定下來的，下次別再爭論）

- **網頁版手感好的原因不是手勢或速度**（滑動、拖曳、門檻、動畫毫秒兩邊幾乎一字不差），是「點一下就打、Return 開下一行」讓動作少、視線不用跑。效能在目前資料量下沒有一處慢到看得出來
- Return 開的新行插在**正下方**，右下 ＋ 和膠囊 ＋ 仍插**最上面**，兩條路都留。Return 開新行**不震**（打字中會吵）
- 不受控輸入框（`defaultValue`）被程式改字時，用 `revs` 計數當 `Field` 的 key 重掛，不用 setNativeProps
- 觸覺詞彙：`selectionAsync`＝選到／經過／越線的「嗒」，`impactAsync(Light)`＝生出一個東西。破壞性動作（刪除這張、永久刪除、清空）**不震**；點兩下進編輯、∧ ∨ 切行、收鍵盤**不震**
- worklet 裡只碰純數字與 shared value；要叫 JS 一律 `scheduleOnRN(模組層級函式)`（`dismissKb`、`hapticArm`、`hapticPass`），prop 來的 closure 也可以（`onStrike`、`dragStart`）
- 網頁預覽的 `onSelectionChange` 只在選取一段時觸發，`Field` 送出時優先讀 DOM 的 `selectionStart`；`blurOnSubmit` 只在網頁給（react-native-web 多行不認 `submitBehavior`）
- 不做的（理由在待審清單第三節）：局部存檔、拆掉隱形文字撐高度、虛擬化、換 MMKV

## 📂 下個會話最重要的檔案

- `.vibe/HANDOFF.md` ← 就是這份
- `.vibe/待審-效能與手感優化清單.md` ← 四輪做了什麼、各自待真機看什麼、怎麼退回、還沒做的、原生小工具可行性，全在這
- `src/components/Paper.tsx`：`onSubmit`（Return 切行）、`Field`（caretNow、submitBehavior）、`LineRow` 的 `tap`／`swipe`（armed）／`grip`（worklet）、`dragApi`
- `src/lib/tokens.ts`：`HAPTIC` 表、`rowEditingFill`
- `src/app/_layout.tsx`：SplashScreen；`src/components/Sym.tsx`：Icon 延遲載入
- `.vibe/規矩檔.md`（兩個坑：pointerEvents、worklet 叫 JS）、`.uiux/05-設計代號/00-原始清單.md` 第六節觸覺表
- `E:\茄記\easynote\index.html` ← 網頁版，手感對照的基準

## ⏭️ 下一步從哪繼續

1. 等多米回報四輪真機結果，**一輪一輪判**，不要混著看：
   - 第一輪（`dfe73b8`）：Return 切行、行中切行時原行重掛鍵盤有沒有閃、三個震動力道
   - 第二輪（`b58b714`）：捲動誤觸、慣性捲動中手指停住畫面會不會進編輯、長按右滑有沒有被搶 → 誤觸就改回 2 並改提示字
   - 第三輪（`47f1dfe`）：先確認不崩潰，再看越線震時機、來回越線煩不煩、拖曳跟不跟手
   - 第四輪（`01710a6`）：啟動還閃不閃空白、兩張臉看起來一樣嗎
2. 真機過的那幾輪：把 `.uiux/02-流程` ❓D 標成「Return」、`.uiux/重新設計/提案.md` 第八節補第六輪、待審清單對應項目加「真機過」
3. 多米若要繼續：A4 字放大（改 `tokens.ts` 的 `bodyLine`，要多米看密度）→ A5 Backspace 併行（真機）→ 原生小工具（先決定要不要 EAS 建置）
4. 之後要改畫面：先 `npm run check:tokens`；碰手勢、鍵盤、worklet 一定真機

## 🗑️ 這次會話的雜訊（下次別重新討論）

- 這個資料夾最多五個開發伺服器，別的聊天佔滿時 `preview_start` 會失敗；直接把瀏覽器開到 `http://localhost:8081` 看同一份原始碼就好（網頁預覽的 console 會殘留改檔中途的 HMR 錯誤 `dbl is not defined`、`dragMove is not defined`，重新載入後不存在，不是 bug）
- 自動化工具的瞬間拖曳測不出 worklet 拖曳（拿起要排回 JS，放開已經發生）；要測用有間隔的 PointerEvent 慢慢拖
- `expo-splash-screen` 沒裝也不用裝：expo-router 的 `SplashScreen` 走 `requireOptionalNativeModule('ExpoSplashScreen')`
- 每一行的 `index`／`count` 進 memo 比對，按 ＋ 會讓全部的行重畫（待審 P2）——決定先量再做，沒動

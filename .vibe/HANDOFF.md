# Handoff: 效能與手感四輪改完（Return 開新行、點一下編輯、越線震＋拖曳 worklet、低風險三件），**四輪真機全過（2026-10-31）**；接著 A4 字放大到 20、A5 行首 Backspace 併行也做完並**真機過**

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

- ~~四個 commit 全部待真機~~ **✅ 2026-10-31 多米回報四輪全過**：Return 切行不閃、點一下不誤觸（點一下定案，推翻點兩下）、worklet 不崩、啟動不閃白。文件已同步：`02-流程` ❓D 標 Return、`提案.md` 第八節補第六輪、待審清單四輪加「真機過」
- 待審清單還沒做的：A4 字放大到 20（多米看過第一輪再決定）、A5 行首 Backspace 併到上一行（要 `onSelectionChange`，注音組字可能干擾）、第四節 iOS 原生小工具（要先跨「EAS 建置＋TestFlight」這道門，Expo Go 做不到）
- `.uiux/02-流程` 的 ❓D 已標成 Return；但 `03-線框/單手檢查表.md` 第 5 項和 `06-首次體驗-暫定.md` 的待答清單仍寫著「要先收鍵盤／❓D 待答」，沒順手改（規矩檔第 2 條），下次碰那兩份時一起改；❓12 啟動畫面顏色沒動
- 上一份交接列的仍未動：30 天自動清未接、閘門 1、2 未過、詞彙表要補新名字
- ~~`.uiux/重新設計/提案.md` 第八節停在第五輪~~ 已補第六輪

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

1. ~~等多米回報四輪真機結果~~ ✅ 四輪全過
2. ~~文件同步~~ ✅ 已做
3. ~~A4 字放大到 20~~ ✅ 已做、commit、**真機過**（密度可、最大字級不爆）
4. ~~A5 Backspace 併行~~ ✅ 已做、commit、**真機過**（併行且游標在接點、注音只刪注音、鍵盤不閃）。多米定「劃掉的不併」
5. **效能與手感這條線到此收尾**，待審清單只剩第四節原生小工具。EAS 建置的完整評估在 `.vibe/待審-EAS建置與小工具.md`。**多米 2026-10-31 決定「跨」**，而且他本來就是付費會員，門直接開。執行清單在 `.vibe/EAS建置-申請與設定步驟.md`。**當天做完：** EAS 登入、expo-dev-client、專案連到 @fcharlie/qieji、iPhone 登錄、憑證、**第一個能跑的 iOS 開發版建置＝ a37a893a（commit 2cecc4f）**。中間踩了三個坑（prepare 腳本、lock 缺 @emnapi → 釘 Node 24、expo-font 比 expo 核心新 → 一開就閃退 → `expo install --fix` 對齊），全在步驟檔丁段；**新規則：建置前先 `npx expo-doctor`，不符就 `--fix`**。**現在狀態＝待多米刪掉閃退的舊版、裝 a37a893a、驗收第一輪（圖示、啟動畫面、四輪手感、字放大、Backspace 併行在自己的 app 上再過一遍）**；過了才加 expo-widgets。另外兩個小尾巴：`03-線框/單手檢查表.md` 第 5 項、`06-首次體驗-暫定.md` 待答清單的 ❓D 還寫著「要先收鍵盤」，要補成 Return
6. 之後要改畫面：先 `npm run check:tokens`；碰手勢、鍵盤、worklet 一定真機

## 🗑️ 這次會話的雜訊（下次別重新討論）

- 這個資料夾最多五個開發伺服器，別的聊天佔滿時 `preview_start` 會失敗；直接把瀏覽器開到 `http://localhost:8081` 看同一份原始碼就好（網頁預覽的 console 會殘留改檔中途的 HMR 錯誤 `dbl is not defined`、`dragMove is not defined`，重新載入後不存在，不是 bug）
- EAS 建置頁沒登入只看得到 Failed；要 log 請多米貼截圖最快。`eas build:view` 不吃 `--non-interactive`；盯進度用 `eas build:list --platform ios --limit 1 --non-interactive`（背景腳本在 scratchpad 的 wait-build.ps1，路徑用 `$env:QJ` 傳，PowerShell 5.1 讀無 BOM 的 .ps1 會把中文路徑讀壞）。裝了 expo-dev-client 後 `npx expo start` 預設找開發版，要回 Expo Go 加 `--go`
- 瀏覽器自動化工具按 Return 在網頁預覽只會失焦、不切行（上一個 commit 也一樣，不是 bug，真機 Return 已過）；要測切行用 JS 對 textarea `dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))`。JS 建出來的新行若接著用自動化按鍵，常跳出長按選單吃掉焦點，先用點擊進那一行再按鍵
- 自動化工具的瞬間拖曳測不出 worklet 拖曳（拿起要排回 JS，放開已經發生）；要測用有間隔的 PointerEvent 慢慢拖
- `expo-splash-screen` 沒裝也不用裝：expo-router 的 `SplashScreen` 走 `requireOptionalNativeModule('ExpoSplashScreen')`
- 每一行的 `index`／`count` 進 memo 比對，按 ＋ 會讓全部的行重畫（待審 P2）——決定先量再做，沒動

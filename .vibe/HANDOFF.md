# Handoff: 11/03～11/04 本機會話——目錄改 1×1 方磚、切換清單改版（拿掉左下膠囊）、只做看得到的行＋自動捲、一千行上限、Return 換行、一連串 lag 修正；143～186 全部還沒真機確認

> 產出時間：2026-11-04 00:49（電腦時鐘，+08:00；先後以 `git log` 為準）
> 專案：`E:\茄記\qieji-app`（Expo SDK 58／RN 0.88，iOS app；多米沒有 Mac、不太看程式、用開發版＋tunnel 真機測）
> GitHub：私人 repo https://github.com/domyweb666/qieji-app（master）。**這次 17 個 commit 都還沒推**（origin 停在 964f748，本機 afe3030）；多米說「推上去」才 push
> 上一版交接：`.vibe/handoff/archive/2026-11-03-1126.md`

## ✅ 這次完成了什麼
- 目錄：磚改 **1×1、一排四個**（照 iPhone 主畫面量的尺寸），方磚正中間一個字（`glyphOf`：自己設的 `Note.glyph`，沒設＝名字第一個字），名字在磚下面；長按選單「改磚上的字」（系統輸入框 `ui.prompt`，超過一個字跳提示不收）
- 目錄：疊／換照 iPhone（中心離別張中心 0.34 個邊長內＝疊，其他＝換）；拖著經過別張不連環換位（`Drag.base`）；「新的一張」搬到搜尋框旁 ＋、補第一個空格（`seatNew`）；第一次開新版清掉寬磚時期的空位與換頁標記（`packGrid`，`s.grid=4`）
- 目錄：抖動中按住磚放大、收起「−」（資料夾裡也是按住那張才變）；從別頁拖過來拿起那頁被拖空也先留著（`gridPages`）；拖磚閃退修好（worklet 參數預設值 `cols = COLS` 帶不到 UI 執行緒）
- 資料夾：打開的照 iPhone 檔案夾（框只包 3 欄、液態玻璃、後面霧加重、名字對齊第一欄）；收著的資料夾磚 3×3 小方塊＝卡片顏色（`hd`）＋字（`NoteColors.ink` 深色卡配白字）
- 紙：**只做看得到的行**（`LineList` 自己記 win、每捲 1/4 螢幕換一次；外 `LineRow` 殼＋`Live`／`LiteRow`），拖「⋮⋮」到上下緣**自動捲**（`autoDrag` useFrameCallback）；放手不抖、讓位不慢、拿起不跳行選單（grip `block: [press, tap]`）
- 紙：一張最多 **1000 行**（`LINE_MAX`、`roomOf`，iCloud 同步進來與輸入框打到一半的字不擋）；**Return 在同一則換行**、貼上整段留同一則（右下 ＋ 輸入框照舊送出）；把手改 2×3 六個淺點
- 系統清單版排順序：`List.ForEach` 開 recycling、點／劃掉交給 ref
- **切換清單改版**：左下膠囊、左右滑換張、旁邊兩張預覽（PagePreview）**全部拿掉**；點左上清單名（大字＋▾／小膠囊，⋯「清單名的樣子」切換，預設大字）→ 自己做的底部面板 `SwitchPanel`（貼齊底部、液態玻璃、選單排法：釘選＋這台最近開過 5 張、正在看打勾、「管理所有清單」收完開目錄）
- 其他：釘選上限 2→5；小工具內容沒變不再叫醒（`pushWidget` 比對）；右下 ＋ 拿掉畫不出來的陰影；換張／點開少做輸入框與過場；開發版效能量測 `src/lib/perf.ts`（`[perf]` 印在 Metro 終端機）
- 測試 112 條全過（新增 seatNew、packGrid、switchList）；tsc、lint、check-tokens 都過；規矩檔加 1 條（worklet 參數不准寫預設值）

## 🚧 還沒做完 / 待決定
1. **效能數字還沒拿到**：上一輪請多米操作「點磚打開」「排順序」後回報，Agent 去讀終端機 `[perf]`（JS 卡住、畫面掉格、掛上紙幾毫秒）。多米還沒回報就改做切換清單改版了
2. **開發版的手感不準**：多米一直說 lag，但開發版＋4G tunnel 本來就慢好幾倍。量完數字不大但手感還卡 → 下一步是打一個正式版（EAS build preview／TestFlight），**要先問多米**（花雲端建置額度）
3. 系統清單版開了 recycling：快速捲可能先空白再出現，多米看到要回報（調 `overscanCount`）
4. 多米手機上有一張 **1000 行測試紙「未命名」（還釘選著）**，測完提醒他「刪除這張」；⋯ 最下面「（開發）塞到上限」只有開發版有
5. 真機全部沒驗：待驗 116～186（第十四～二十節）。第二十節開頭列了因為膠囊拿掉而作廢的條目
6. 舊待辦照舊：LICENSE 還是 Expo 範本；送審缺 ascAppId、隱私權政策公開網頁、公開信箱；組塊 D 結案後重跑 `.uiux/08-上架.md` 檢核表

## 📌 關鍵決策（這次定下來的，別再爭論）
- 目錄 1×1、一排 4 欄；磚面＝顏色＋一個字；疊／換照 iPhone；空格清一次；新的一張補第一個空格（不是排最後）
- 打開的資料夾不能用原生元件（SpringBoard 專用），框用系統液態玻璃、版面照截圖；名字維持深色字（奶油底白字看不清）
- 換張只靠切換清單（左右滑拿掉）；切換清單是**自己做的底部面板**（系統 formSheet 在 iOS 26 浮起四角圓、關不掉，畫風跟 ⋯ 選單不一樣）
- 「最近開過」只記在這台（`cn.recent`），不同步
- 一則可以分段（Return＝換行）；一張最多 1000 行

## 📂 下個會話最重要的檔案
- `.vibe/操作清單-待驗.md` 第十七～二十節（143～186）
- `.uiux/iOS主畫面編輯-官方規範對照.md` 第十一節（1×1 規格與追加）、`.uiux/切換清單改版.md`
- `.vibe/規矩檔.md` 最後一條（worklet 參數預設值）
- `src/components/DirPanel.tsx`：`sizeOf`／`rowOf`／`slotX`／`cellAt`、`aimOf`、`placeAt`（`Drag.base`）、`TileFace`／`FolderFace`／`Mini`、`editGlyph`
- `src/components/Paper.tsx`：`LineList`、`LineRow`（殼）／`Live`／`LiteRow`、`autoDrag`、`openSwitch`、清單名兩種樣子
- `src/components/SwitchPanel.tsx`、`NoteIcon.tsx`、`PageBar.tsx`（只剩 ＋）、`NativeRows.ios.tsx`
- `src/lib/model.ts`：`glyphOf`／`setGlyph`、`seatNew`、`packGrid`、`switchList`、`LINE_MAX`；`src/lib/store.ts`：`recent`、`titleMode`；`src/lib/perf.ts`

## ⏭️ 下一步從哪繼續
1. tunnel：多米在 `E:\茄記\qieji-app` 跑 `npx expo start --tunnel`（Agent 可用 run_in_terminal 開新分頁；上一個在「expo tunnel 2」分頁 c2），手機把茄記從多工畫面滑掉再開
2. 請多米做兩個動作：**目錄點一塊磚打開**、**在紙上拖六個點排順序拖幾下**，做完說一聲 → Agent `read_terminal` 讀 `[perf]` 那幾行，照數字決定下一步（JS 卡住→減 JS 工作；畫面掉格→減掛上的原生元件）
3. 再照待驗清單測，優先：182～186（切換清單）→ 172（拖磚不閃退）→ 177、178（排順序）→ 164～171（方磚、資料夾）
4. 多米說「推上去」才 `git push`（目前 ahead 17）

## 🗑️ 這次會話的雜訊（下次別重新討論）
- 網頁預覽：瀏覽器窗格在背景時動畫、rAF 都停（量不到東西），要先 `show_pane preview`；port 8081 是手機 tunnel 的 Metro，網頁預覽會跑在 8082；8082 的網頁資料裡那張「從這裡開始」被塞了 994 行測試字，跟手機無關
- 網頁預覽看不到液態玻璃、手勢、iOS 字高，只能確認畫得出來、行的數量與位置
- 終端機那 65 條「Property 'COLS' doesn't exist」是 900f8d0 修好之前的舊紀錄（堆疊行號對到舊程式）
- `(ADVICE) shadow ... cannot calculate shadow efficiently` 是效能提示，不是錯誤
- 寫大段修改用 Python 腳本放 scratchpad 跑（heredoc 裡引號太多會壞）

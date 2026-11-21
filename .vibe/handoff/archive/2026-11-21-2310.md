# Handoff: 茄記整個重寫成 SwiftUI，第一晚把紙面、規則層、搬舊存檔做完並在模擬器驗過，等多米決定怎麼上真機

> 產出時間：2026-11-21 21:32（+08:00）；同日 22:30 補：控制中心按鈕、目錄面板整套做完（見下面「22:30 補」）
> 專案：茄記 iOS。這個資料夾（`E:\茄記\qieji-swift`，分支 `overnight-20261121-2038`）是 SwiftUI 版，新程式在 `ios-native/`。Expo 版（1.1／1.1.1）在 `E:\茄記\qieji-1.1`，沒有動，1.1.1 照舊等 12/1 打包
> 多米沒有 Mac、不太看程式。這台 Windows 沒有 Swift 工具，編譯與測試靠 limrun（以分鐘計費，用完要關）
> 上一版交接（Expo 1.1 時期的）：`.vibe/handoff/archive/2026-11-14-1721.md`

## ✅ 這次完成了什麼

- 建 `ios-native/`：XcodeGen 專案、SwiftFormat／SwiftLint 設定、圖示、隱私清單。Bundle ID `org.domyweb.qieji`（跟 1.1 同一個）、版本 2.0.0、最低 iOS 16.4
- 搬設計代號（`Qieji/Design/Tokens.swift`），106 個色碼用程式逐個比過
- 做紙面（`Qieji/Paper/`）：每一行是原生文字框；滑動、拖曳、點、長按由掛在捲動區上的一組原生手勢處理；拖著的那行另外畫一份浮在清單上
- 把 `src/lib/model.ts` 的規則逐條搬成 Swift（`Qieji/Core/`）：讀檔補欄位、指紋、iCloud 合併、墓碑、最近刪除 30 天、座位表、空位、資料夾、排列同步
- 寫對照答案產生器 `tools/gen-swift-fixtures.mjs`：用 Expo 版的規則跑幾百組情境，Swift 測試要算出一字不差的結果
- 做存檔層：第一次打開讀 1.x 的 AsyncStorage 舊存檔（只讀、原文另存 `from-expo.json`），之後寫自己的 `state.json`
- 寫 iCloud 傳輸層（`Qieji/Core/Cloud.swift`）與九個「兩台手機共用一個資料夾」的測試
- 做切換清單、最近刪除、⋯ 選單、設定（只有版本號）、上鎖的紙的擋板
- 寫 CI 流程檔（沒推）、limrun 用的檢查腳本 `ios-native/tools-check.sh`
- 33 個測試全過，SwiftFormat、SwiftLint 零錯誤；模擬器上驗過手勢與整條搬家流程

## ✅ 22:30 補：控制中心按鈕、目錄面板

- 控制中心「記一行」搬進 `ios-native/Shared/NewLine.swift`、`ios-native/QiejiControls/`，Bundle ID 與 kind 跟 1.1 一樣。`qieji://new` 只有完整版才升起輸入框；內購還沒搬，現在一律當沒買（`Store.isFull`，假資料模式才是 true）
- 目錄面板整套（多米選丙：一次全做）在 `ios-native/Qieji/Dir/`：面板升起與下拉收起、方磚、翻頁、資料夾（開、改名、裡面翻頁）、搜尋、新的一張、長按選單（顏色、改磚上的字、釘選、刪除）、抖動、拖曳換位、放進空格、疊成資料夾、拖進拖出資料夾、邊緣翻頁與開新頁、「−」刪除、搬行模式、VoiceOver 動作
- 切換清單改回 1.1 的內容，最下面「管理所有清單」開目錄；長按一行多了「搬到…」
- 49 個測試全過（新增 16 個在 `QiejiTests/DirGridTests.swift`），SwiftFormat、SwiftLint 零錯誤
- 模擬器上逐項操作過，截圖 8–14 在 `.vibe/overnight-截圖/`。比較頁在 `.uiux/03-線框/2.0-目錄面板比較.html`
- 做法跟 1.1 不同的地方：磚的位置全用算的（`DirGrid.swift`），手勢掛在翻頁的捲動區上（`DirTouch.swift`），一組管整頁。磚換位、換頁、進出資料夾時不會有「磚換容器手勢就斷」那類問題
- 十三條代決在 `.vibe/代決清單.md` 最後（2026-11-21 那幾條）

### 目錄還沒驗、沒做的

- **真機沒跑過**：拖曳順不順、長按後拖的門檻、互換的時機都只在模擬器看過「有作用」
- 沒在模擬器驗到：資料夾裡拖到框邊翻頁、資料夾裡換順序、VoiceOver 動作、減少動態、深色、搬行模式的搜尋、最近刪除那一列（假資料沒有刪掉的東西）
- 沒做：拿起時的補位動畫、液態玻璃、釘滿時換掉哪一張的選單、搜尋點一行捲到那行、封面圖的磚
- 目錄每畫一次會重算整排座位（`DirModel.entries`），紙很多時可能要加快取；還沒量

## 🚧 還沒做完 / 待決定

- **真機一次都沒跑過** — 手感只有多米上手才算數，而且怎麼上真機還沒定（見下一條）
- **怎麼試手感** — 2.0.0 跟 1.1 同一個 Bundle ID，裝下去會取代 1.1、還沒搬的功能會不見。我推薦另開 `org.domyweb.qieji.swift` 並存（要多米先在 Apple 後台建 app）；另一條路是先搬內購、接 iCloud。**多米還沒回答**
- **iCloud 沒接上 app** — 同步是完整版功能，內購還沒搬；接上會寫真的雲碟，不可逆，要多米點頭。專案也還沒加 iCloud 權限
- **真機的舊存檔沒讀過** — 格式對過套件原始碼、用假造的檔測過；主要位置（Application Support）在模擬器上沒能放檔驗證，只走過 Documents 那個位置
- **上鎖的紙的擋板只編譯過**，沒在模擬器看過畫面
- **版面是估的** — 標題區、切換清單、最近刪除沒有逐點對 1.1，等多米看
- **還沒搬的功能** — 內購、Face ID 上鎖、封面圖、桌面小工具、付費頁、新功能頁、蔬菜家族頁、授權頁、設定裡的外觀／字級／同步開關／清除資料、備份匯出匯入、評分提示、火柴人
- **待多米表態的小事** — SwiftLint 門檻我放寬了；repo 是私人的所以 CI 會扣額度；幾個我自己定的行為（都列在 `OVERNIGHT.md` 待確認）

## 📌 關鍵決策（這次定下來的，下次別再爭論）

- 多米選「整個重寫」，不是只換卡手感的畫面。新資料夾、新分支，Expo 版不動
- 存檔格式不變：Swift 版的 `state.json` 就是 `colornotes.v1` 那份 JSON；鐵則照舊（欄位只能加）
- 舊存檔只讀不改不刪；搬之前原文先另存，存不成這次就不寫檔
- 規則層用「跟 Expo 版逐筆比對」驗，不另外手寫一套測試。改 `model.ts` 的規則 → Swift 一起改 → 重跑 `node tools/gen-swift-fixtures.mjs`
- 紙面不用純 SwiftUI 的手勢：行是 UITextView，手勢是掛在 UIScrollView 上的 UIKit 辨識器（捲動才會是系統原生手感）
- iCloud 在內購搬完、多米點頭之前一律不碰
- 上鎖的紙在 Face ID 搬來之前只顯示名字
- 不自己推 GitHub、不自己打包 TestFlight

## 📂 下個會話最重要的檔案

- `OVERNIGHT.md` ← 完整報告：每項做了什麼、九條待確認、還沒搬的清單、執行紀錄
- `.vibe/安全標準.md` ← **下一個會話必讀**（Expo 時期定的安全清單，Swift 版還沒對過一輪）
- `.vibe/overnight-截圖/` ← 六張模擬器截圖
- `ios-native/project.yml`、`ios-native/.swiftlint.yml` ← 專案與規矩設定
- `ios-native/Qieji/Paper/ListTouch.swift`、`PaperList.swift`、`LineText.swift` ← 紙面的手勢與文字框，調手感都在這
- `ios-native/Qieji/Dir/` ← 目錄面板：`DirGrid`（純計算）、`DirModel`＋`+Drag`＋`+Drop`＋`+Touch`（狀態與規則）、`DirTouch`（UIKit 手勢）、`DirPanel`／`DirTiles`／`DirFolder`（畫面）。對照 `src/components/DirPanel.tsx`
- `ios-native/Qieji/Core/Disk.swift`、`LegacyStore.swift` ← 搬舊存檔
- `ios-native/Qieji/Core/Cloud.swift` ← iCloud 傳輸層（沒接）
- `tools/gen-swift-fixtures.mjs`、`ios-native/QiejiTests/` ← 對照答案與測試
- `src/lib/`、`src/components/` ← Expo 版原始碼，搬功能時對照用
- `.vibe/規矩檔.md`、`.vibe/黃金行為.md`、`.uiux/` ← 1.1 的規矩與行為定義
- 記憶：`project_qieji_swiftui_port.md`、`reference_limrun_swiftui_project.md`（limrun 的指令與坑）

## ⏭️ 下一步從哪繼續

1. 讀這份，再讀 `OVERNIGHT.md` 的「待確認」九條
2. 先 `git -C E:\茄記\qieji-swift log --oneline -8` 與 `git status`，確認沒有別的 session 動過
3. **先問多米「怎麼試手感」的答案**（並存的新 Bundle ID，或先搬內購）。沒有答案之前不要打包
4. 多米選並存：`project.yml` 的 Bundle ID 改成他建好的那個、照豆鍵的 `testflight.yml` 寫打包流程，等他開口才觸發
5. 多米選先搬內購：對照 `src/lib/iap.ts`、`access.ts`、`full.ts`，用 StoreKit 2 寫，沿用同一個產品 ID；舊版的購買記號 `qieji.full.v1` 已經在 `Disk.Loaded.legacy` 裡帶著
6. 目錄面板與控制中心按鈕已經做完（22:30 補）。兩條路都還沒定時，下一個不用決定的是設定頁的外觀／字級、授權頁、新功能頁；要動到購買判斷的都等內購
7. 每次改完：開 limrun → `lim xcode test` → `sh tools-check.sh` → 關掉並確認清單

## 🗑️ 這次會話的雜訊（下次別重新討論）

- 要不要轉 SwiftUI、要不要只換部分畫面：已定案，整個重寫
- limrun 放檔遇到路徑有空白會壞、`typeText` 抓不到文字框、`swipe --duration` 沒作用：繞法都記在記憶裡，不用再試
- 模擬器是英文系統，中文字形像日文／簡體寫法，不是 bug
- `ios-native/formatted.tgz` 是排版暫存檔，已設成不進版控
- limrun 清單上 `project=doujian` 的兩台是別的 session 的，不要刪

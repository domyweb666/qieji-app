# Handoff: 茄記 SwiftUI 版 2.0.0 (201) 已上 TestFlight；等多米真機試手感

> 產出時間：2026-11-21 深夜（+08:00），接在 23:10 那版後面（那版全文在 `.vibe/handoff/archive/2026-11-21-2310.md`）
> 專案：茄記 iOS。這個資料夾（`E:\茄記\qieji-swift`，分支 `overnight-20261121-2038`）是 SwiftUI 版，新程式在 `ios-native/`。Expo 版（1.1／1.1.1）在 `E:\茄記\qieji-1.1`，沒有動，1.1.1 照舊等 12/1 打包
> 多米沒有 Mac、不太看程式。這台 Windows 沒有 Swift 工具，編譯與測試靠 limrun（以分鐘計費，用完要關）
> 上一版交接：`.vibe/handoff/archive/2026-11-21-2230.md`（第一晚＋目錄做完那時的全文，第一晚的細節看那份）

## ✅ 這次完成了什麼

- 控制中心「記一行」搬進 `ios-native/Shared/NewLine.swift`、`ios-native/QiejiControls/`。Bundle ID 與 kind 跟 1.1 一樣
- `qieji://new` 只有完整版才升起輸入框。內購還沒搬，現在一律當沒買（`Store.isFull`，只有假資料模式是 true），沒買的跳一句提示
- 目錄面板整套（多米選「一次全做」），在 `ios-native/Qieji/Dir/`：面板升起與下拉收起、方磚、翻頁、資料夾（開、改名、裡面翻頁）、搜尋、新的一張、長按選單、抖動、拖曳換位、放進空格、疊成資料夾、拖進拖出資料夾、邊緣翻頁與開新頁、「−」刪除、搬行模式、VoiceOver 動作
- 切換清單改回 1.1 的內容，最下面「管理所有清單」開目錄；長按一行多了「搬到…」
- 假資料模式（`QIEJI_DEMO=1`）多放 24 張紙和一個資料夾
- TestFlight 打包流程 `.github/workflows/testflight-native.yml`（tag `tfs-*`）與 `.github/ExportOptions.plist`，照番茄帳那套寫，**沒推、沒跑過**
- 49 個測試全過（新增 16 個在 `QiejiTests/DirGridTests.swift`），SwiftFormat、SwiftLint 零錯誤
- 模擬器上逐項操作過，截圖 7–14 在 `.vibe/overnight-截圖/`
- 對照 `C:\Users\fcharlie\Downloads\SwiftUI-蘋果風格手感指南.md` 掃過一輪，找到七處要補（下面），**還沒改**
- commit：`09dba17`（控制中心）、`f3073d3`（目錄）、`cb7b5ac`（打包流程）。都沒推

## 🚧 還沒做完 / 待決定

- **七項手感：多米選「七項都補」，已改完**（49 個測試過、排版與規矩零錯誤、模擬器看過，還沒上真機）：
  1. 磚按下去變淡（抖動中維持放大），開始翻頁就復原 — 錄影逐格看到有變淡
  2. 提示列、換紙接上 0.15 秒淡入淡出；長按選單也淡入淡出
  3. 拿起磚有 0.12 秒補位（`DirGhost.catchUp`）— **模擬器看不出順不順，要真機**
  4. 滑進落點途中手指再碰會馬上落定、照常收這一下（`landNow`）；點磚放大時面板不擋觸控 — 模擬器驗到「放手後馬上拖另一塊拿得起來」
  5. 長按選單後面、目錄後面都改毛玻璃。目錄那層我原本留暗幕（上面那截看得到後面的紙），多米 11/22 看過對照圖選「也改毛玻璃」，定案。對照圖 `.vibe/overnight-截圖/` 15（採用）、16（原本）、17；比較頁 `.uiux/03-線框/2.0-手感七項比較.html`
  6. 震動統一到 `ios-native/Qieji/Design/Haptic.swift`（對照表寫在檔頭），照 1.1 的輕重；新加釘選、刪一張、被擋下來三處
  7. 空狀態排成置中兩行、字照 1.1，沒加圖示（多米 11/01 拿掉過插圖）。圖 18、19
  - 代決六條在 `.vibe/代決清單.md` 最後（2026-11-21「2.0 手感七項」）
- **指南裡我建議不照搬的兩點**（已跟多米講，他沒表態）— `.snappy`／`.smooth` 要 iOS 17，茄記最低 16.4，而且拖磚的彈簧是 11/04 逐格量真機主畫面來的；紙面不改用 `List`（自己接手勢，捲動仍是系統原生）
- **2.0.0 (201) 已上 TestFlight**（2026-11-22，tag `tfs-1`，run 44944459514，5 分半全綠）。四個 secret 多米放好；金鑰自檢過、app 與 `.controls` 擴充都簽到、上傳成功。多米選「現在打包」，知道可能卡到 12/1 的 1.1.1。下一個 tag `tfs-2`（build 號＝run 編號＋200）
  - 還沒裝到手機、還沒試手感；裝了會蓋掉 1.1
- **2.0.0 已傳上去，可能卡到 12/1 的 1.1.1** — 查不到 Apple 官方說法。論壇有人說高的那版沒送審就照收低的，也有同樣情況沒人回答。build 傳上去刪不掉。多米 11/22 知道這點仍選先打包。12/1 打 1.1.1 時要特別看收不收得進去
- **真機一次都沒跑過** — 拖曳順不順、長按後拖的門檻、互換時機都只在模擬器看過「有作用」
- **真機的舊存檔沒讀過** — 只用假造的檔測過；裝之前請多米確認 1.1 的 iCloud 同步開著
- **目錄沒在模擬器驗到的** — 資料夾裡拖到框邊翻頁、資料夾裡換順序、VoiceOver 動作、減少動態、深色、搬行模式的搜尋、最近刪除那一列
- **目錄沒做的** — 液態玻璃、釘滿時換掉哪一張的選單、搜尋點一行捲到那行、封面圖的磚
- **目錄的重畫成本沒量** — `DirModel.entries` 每畫一次重算整排座位
- **iCloud 沒接上 app**、**上鎖的紙的擋板沒在模擬器看過**、**版面是估的**（標題區、切換清單、最近刪除沒逐點對 1.1）— 第一晚留下的，沒變
- **還沒搬的功能** — 內購、Face ID 上鎖、封面圖、桌面小工具、付費頁、新功能頁、蔬菜家族頁、授權頁、設定裡的外觀／字級／同步開關／清除資料、備份匯出匯入、評分提示、火柴人
- **`OVERNIGHT.md` 的九條待確認** — 第 2 條（怎麼試手感）多米答了：蓋掉 1.1。其餘八條沒表態

## 📌 關鍵決策（這次定下來的，下次別再爭論）

- 版本號是 2.0.0（大改）。Bundle ID 跟 1.1 同一個：TestFlight 裝下去就是手機上的茄記從 1.1 更新成 2.0，不並存。多米 2026-11-21 定，他知道沒搬完的功能會暫時不見
- 目錄第一批選「丙：一次全做」
- 目錄的磚位置全部用算的（`DirGrid.swift`），手勢掛在翻頁的捲動區上、一組管整頁（`DirTouch.swift`）。不要改回每塊磚各掛手勢：1.1 最常壞的就是磚換容器手勢斷掉
- 目錄面板是自己做的面板，不用系統半高面板（1.1 就是這樣；11/04 切換清單試過系統那種被多米換掉）
- 面板整層用「量自己在螢幕的位置再扣回去」釘在螢幕左上角（`DirPanel.pinned`）。別改回單純 `ignoresSafeArea`：鍵盤升起會把面板往上擠
- 目錄掛在根畫面的 `.overlay`，不放進 `ZStack`：放進去會把後面的紙撐到狀態列底下
- 抖動用明講的 `withAnimation` 開始與停止（`Jiggle`）。用 `.animation(value:)` 寫會停不下來
- 內購搬來之前，凡是完整版功能一律當「沒買」
- 第一晚的決策照舊：存檔格式不變、舊存檔只讀不改、規則層跟 Expo 版逐筆比對、紙面手勢用 UIKit 掛在捲動區上、iCloud 多米點頭前不碰、不自己推 GitHub、不自己打包

## 📂 下個會話最重要的檔案

- `.vibe/安全標準.md` ← **下一個會話必讀**（Expo 時期定的安全清單，Swift 版還沒對過一輪；動到購買判斷、網址、擴充前先看）
- `C:\Users\fcharlie\Downloads\SwiftUI-蘋果風格手感指南.md` ← 多米給的手感準則，七項就是照它掃出來的
- `ios-native/Qieji/Dir/` ← 目錄面板。`DirGrid`（純計算）、`DirModel`＋`+Drag`＋`+Drop`＋`+Touch`（狀態與規則）、`DirTouch`（UIKit 手勢）、`DirPanel`／`DirTiles`／`DirFolder`（畫面）、`DirSupport`（震動、Store 的兩個方法）。對照 `src/components/DirPanel.tsx`
- `ios-native/Qieji/Design/Tokens.swift` ← 動畫、手勢門檻、尺寸都在這，畫面不准寫死數字（SwiftLint 會擋）
- `ios-native/Qieji/App/QiejiApp.swift` ← 根畫面、提示列、假資料
- `ios-native/Qieji/Paper/` ← 紙面（`ListTouch`、`PaperList`、`LineText`、`PaperView`）
- `ios-native/Qieji/Core/` ← 規則層、存檔、搬舊存檔、iCloud 傳輸層（沒接）
- `.github/workflows/testflight-native.yml` ← 打包流程（沒跑過）
- `.vibe/代決清單.md` 最後十三條（2026-11-21）← 我代多米定的事
- `OVERNIGHT.md` ← 第一晚的完整報告與九條待確認
- `.uiux/03-線框/2.0-目錄面板比較.html` ← 目錄的比較頁
- 記憶：`project_qieji_swiftui_port.md`、`reference_limrun_swiftui_project.md`、`reference_expo_github_testflight.md`

## ⏭️ 下一步從哪繼續

1. 讀這份。先 `git -C E:\茄記\qieji-swift log --oneline -6` 與 `git status`，確認沒有別的 session 動過（最新應該是「七項手感」那個 commit 與這份交接）
2. 目錄後面也霧已定案（11/22），不用再問。這一行改完沒有再開 limrun：同一份程式 11/21 編過、測過、截過圖（圖 15）
3. 七項的真機項目等 TestFlight 裝了再問：按下變淡的時機、拿起補位、震動輕重（比之前輕）、新加的三處震動要不要留
4. 等多米真機試 2.0.0 (201)：七項手感、目錄拖曳、舊存檔讀不讀得到（裝之前請他確認 1.1 的 iCloud 同步開著）
5. 再打包：改完 commit、推分支，再單獨推下一個 tag `tfs-2`。多米開口才推
6. 每次改完：開 limrun → `lim xcode test` → `sh tools-check.sh` → 拉回 `formatted.tgz` 比對 → 關掉並確認清單是空的

## 🗑️ 這次會話的雜訊（下次別重新討論）

- 要不要另開 Bundle ID 並存：多米定了不要，直接蓋掉 1.1
- 「換掉 1.1」不是在講版本號：版本號本來就是 2.0.0，多米一度以為要改版本號，已經講清楚
- 目錄第一批做到哪（甲乙丙）：定了丙，做完了
- 目錄的三個坑已經修掉、不用再查：面板把紙推進狀態列、按完成後磚還在抖、鍵盤把面板往上擠
- `lim ios perform` 的 `typeText` 打不出中文，測搜尋用英文字（假資料裡有一行 `Mixed 中英 text`）
- limrun 的沙盒會自己排版，本機檔跟沙盒不同步時要把 `formatted.tgz` 拉回來比對再蓋（`tar` 要加 `--force-local`）
- `ios-native/formatted.tgz` 是排版暫存檔，不進版控；limrun 清單上 `project=doujian` 的機器是別的 session 的，不要刪

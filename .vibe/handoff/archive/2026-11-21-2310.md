# Handoff: 茄記 SwiftUI 版（2.0.0）目錄面板與控制中心按鈕做完、打包流程寫好；等多米放 secret 與決定要不要先補七項手感

> 產出時間：2026-11-21 23:10（+08:00）
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

- **七項手感要不要補、補幾項** — 我問了多米「七項都補」還是「只補前三項」，他還沒答，先叫我寫交接。清單：
  1. 目錄的磚按下去沒變化（沒抖動時）。1.1 按下會變淡。`DirModel.pressDown` 現在只在抖動中作用
  2. 底下的提示（`ToastBar`）、換紙的 `.transition(.opacity)` 沒有接動畫，實際是直接跳出來
  3. 拿起磚那一刻會跳約 10 點到手指位置（1.1 有 0.12 秒補位）
  4. 放手滑進落點那 0.25 秒（`landing`）、點磚放大那 0.26 秒（`launch`），手指碰了沒反應
  5. 目錄後面的暗幕、長按選單的暗幕是半透明黑色塊，指南說浮層用毛玻璃
  6. 震動有兩套寫法（紙面 `ListTouch` 自己建、目錄用 `Haptic`），刪除一張紙、釘選成功沒有震
  7. 空狀態只有一行字（空的紙、空的最近刪除）
- **指南裡我建議不照搬的兩點**（已跟多米講，他沒表態）— `.snappy`／`.smooth` 要 iOS 17，茄記最低 16.4，而且拖磚的彈簧是 11/04 逐格量真機主畫面來的；紙面不改用 `List`（自己接手勢，捲動仍是系統原生）
- **打包還沒觸發** — 多米定了「不另開 Bundle ID，2.0 直接蓋掉手機上的 1.1」。還缺：
  - repo `domyweb666/qieji-app` 一個 secret 都沒有，要多米放 `ASC_KEY_ID`、`ASC_ISSUER_ID`、`ASC_PRIVATE_KEY`、`APPLE_TEAM_ID`
  - 多米開口。推分支、推 tag 都要他點頭
- **2.0.0 傳上去可能卡到 12/1 的 1.1.1** — 查不到 Apple 官方說法。論壇有人說高的那版沒送審就照收低的，也有同樣情況沒人回答。build 傳上去刪不掉。多米聽過這點，還沒說要不要等 1.1.1 先送
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

1. 讀這份。先 `git -C E:\茄記\qieji-swift log --oneline -6` 與 `git status`，確認沒有別的 session 動過（最新應該是這份交接的 commit，往前是 `cb7b5ac` 打包流程）
2. **先問多米七項手感的答案**（七項都補／只補前三項／先不補）
3. 要補的話，改完一起上 limrun 驗一次。各項的下手處：
   - 第 1 項：`DirTouch` 的 `press` 手勢現在只在抖動中啟動，改成沒抖動也啟動；`DirTile` 加一個「按著變淡」的狀態（`Tok.Motion.pressDim`），抖動中維持放大
   - 第 2 項：`RootView` 加 `.animation(Tok.Motion.fade, value: store.toast?.id)` 與 `value: store.currentID`
   - 第 3 項：`DirModel.dragBegin` 拿起時 `ghost.shift` 先放 0，用很短的彈簧補到手指位置
   - 第 4 項：`DirModel.busy` 與 `landing`；放手滑進落點途中再碰要能馬上 `drop()` 再接新的觸控
   - 第 5 項：`DirPanel.layers` 的 `Tok.Col.scrim`、`DirMenuView` 的 `menuScrim`；減少透明度時要留實色退路（照 `DirFolderView.veil` 的寫法）
   - 第 6 項：把 `ListTouch`、`PaperView` 裡自己建的震動改用 `Haptic`，列一張「什麼情境用哪個」
   - 第 7 項：iOS 17 才有 `ContentUnavailableView`，最低 16.4 要自己排（圖示＋一句話＋怎麼辦）
4. 多米說 secret 放好、可以打包：先 `gh secret list --repo domyweb666/qieji-app` 確認四個都在，再推分支，**分支和 tag 分兩次推**（`tfs-1`）。推之前再問一次 1.1.1 那個風險他要不要先等
5. 打包跑起來後看：金鑰自檢那步、封存那步的簽章（app 與 `.controls` 擴充都要簽到）
6. 每次改完：開 limrun → `lim xcode test` → `sh tools-check.sh` → 拉回 `formatted.tgz` 比對 → 關掉並確認清單是空的

## 🗑️ 這次會話的雜訊（下次別重新討論）

- 要不要另開 Bundle ID 並存：多米定了不要，直接蓋掉 1.1
- 「換掉 1.1」不是在講版本號：版本號本來就是 2.0.0，多米一度以為要改版本號，已經講清楚
- 目錄第一批做到哪（甲乙丙）：定了丙，做完了
- 目錄的三個坑已經修掉、不用再查：面板把紙推進狀態列、按完成後磚還在抖、鍵盤把面板往上擠
- `lim ios perform` 的 `typeText` 打不出中文，測搜尋用英文字（假資料裡有一行 `Mixed 中英 text`）
- limrun 的沙盒會自己排版，本機檔跟沙盒不同步時要把 `formatted.tgz` 拉回來比對再蓋（`tar` 要加 `--force-local`）
- `ios-native/formatted.tgz` 是排版暫存檔，不進版控；limrun 清單上 `project=doujian` 的機器是別的 session 的，不要刪

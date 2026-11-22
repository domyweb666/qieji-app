# Handoff: 茄記 SwiftUI 版追平 1.1.1 的 28 項做完了，在子分支等多米看

> 產出時間：2026-11-22 20:10（+08:00）。上一版（2.0.0 (201) 上 TestFlight 那時）全文在 `.vibe/handoff/archive/2026-11-22-0412.md`
> 專案：茄記 iOS。`E:\茄記\qieji-swift` 是 SwiftUI 版，新程式在 `ios-native/`。Expo 版（1.1／1.1.1）在 `E:\茄記\qieji-1.1`，沒有動
> 多米沒有 Mac、不太看程式。這台 Windows 沒有 Swift 工具，編譯、測試、模擬器全靠 limrun（以分鐘計費，用完要關）
> **這次的工作全部在子分支 `overnight-20261122-1813`**（從 `overnight-20261121-2038` 的 775a88c 開出來），沒合併、沒推、沒打包

## ✅ 這次完成了什麼

- 多米要我比對 Expo 1.1.1 跟 SwiftUI 2.0 差在哪：報告 `.vibe/2.0-功能差異對照.md`（commit 775a88c，在父分支上）
- 多米接著開「熬夜做模式」：把報告第九節甲乙丙丁四批照順序補完。**28 項全部做完**，逐項清單、每項改了哪些檔、執行紀錄都在 `OVERNIGHT.md`
  - 甲（1–10）紙面：Return 換行、Backspace、標題小膠囊、名字原地改、⋯ 選單、按住一行的浮出卡、每行樣子與拖曳、滑動過場、輸入框與 ＋、提示條、記事本
  - 乙（11–17）完整版：StoreKit 2 內購、付費頁、字級與外觀、封面圖、Face ID 上鎖、桌面小工具、**iCloud 同步接上**
  - 丙（18–22）外圍：切換清單玻璃面板、最近刪除推入頁、設定整頁、新功能與蔬菜家族、開機與提示（存檔失敗要按的框、評分提示、1.0 同步使用者提示）
  - 丁（23–27）目錄：放手接速度、VoiceOver、長按選單玻璃卡、「改磚上的字」自己畫的卡、樣子細節、搜尋點一行捲過去、釘滿換一張
- 最後一輪：80 個測試全過（購買整合測試 2 個預設跳過），CI 同一版 SwiftFormat、SwiftLint 零錯誤。模擬器截圖 20–27 在 `.vibe/overnight-截圖/`
- limrun 開了七輪沙盒，每輪用完都刪了，清單是空的

## 🚧 還沒做完 / 待決定

- **`OVERNIGHT.md`「待確認」第 0 條已定，其餘六條還沒問多米**，重點：
  - 第 0 條已定（多米 11/22 晚）：iCloud 同步保持開著，下一次打包照樣接（買了＋開著就寫真的 iCloud，「檔案 › iCloud 雲碟 › 茄記」，跟 1.1 同一個資料夾）。第一次裝上手機前，還是建議先備份 iCloud 雲碟的「茄記」資料夾
  - 第 1 條：`App/Purchases.swift`、`Core/FullRule.swift` 送審前要給會寫 iOS 的人看
  - 第 2 條：2.0.0 新功能說明沒寫（`App/NewsPages.swift` 只有 1.1.0）。照規矩逐條問過真機結果才寫
  - 第 3–6 條：清除所有資料不刪 1.1 舊存檔、開源授權頁拿掉、VoiceOver 多留「改磚上的字」、空白紙多兩個保護
- **購買沒真的買過**：StoreKit 測試商店的整合測試在 limrun 卡住（`product.purchase()` 等不到畫面），改成要 `QIEJI_STOREKIT_TESTS=1` 才跑。送審前要沙盒帳號真機買一次、恢復一次
- **模擬器驗不到、要真機的**：所有手感（滑動、拖曳、甩、放手速度、抖動）、Face ID 系統框、桌面小工具長相與「更新後那塊還在不在」、真的 iCloud、VoiceOver、評分系統框、存檔失敗與讀不出來的提示框、1.0 同步使用者提示、搜尋點過去那行亮一下
- **跟 1.1 還不一樣、這晚沒排進的**：資料夾框液態玻璃、目錄「＋」「完成」玻璃鈕、資料夾後面霧的濃淡、抖動中撥頁用系統分頁、「新的一張」不等目錄收完就升輸入框、目錄升起途中就收觸控、搬行模式搜出來的磚不能長按、搜尋點一行在模擬器停在畫面中間附近（1.1 是三分之一高）
- **TestFlight 上的 2.0.0 (201) 是上一晚的版本**，不含這 28 項。12/1 打 1.1.1 時要看收不收得進去（2.0.0 已經傳過）

## 📌 關鍵決策（這次定下來的，下次別再爭論）

- 熬夜做模式＝開子分支做、做完寫交接（多米 11/22 講明）。不碰父分支、不推、不打包
- iCloud 同步下一版保持開著（多米 2026-11-22 晚回待確認第 0 條）。不用再問要不要關
- 1.1 的識別碼全部沿用：小工具 kind `PaperWidget`、擴充 `org.domyweb.qieji.ExpoWidgetsTarget`、App Group `group.org.domyweb.qieji`、iCloud 容器 `iCloud.org.domyweb.qieji`（資料夾名「茄記」）、內購 `org.domyweb.qieji.full`、封面圖 `Documents/covers/<code>.jpg`。1.1 存在 AsyncStorage 的設定（買了沒、同步關掉、外觀、字級、提示看過沒、評分計數、1.0 提示）由 `Core/Prefs.swift` 第一次打開時抄一份進 UserDefaults，舊檔不改
- 行裡 Return＝同一則換行（1.1.1 的行為；舊交接檔寫錯過）
- 「買了沒」只信 Apple 驗過的交易、退款撤銷就鎖、問不到沿用上次（`FullRule`）。1.0 同步使用者那個提示框要等第一次問過 StoreKit 才決定跳不跳（`Purchases.asked`）
- 評分提示照 1.1：裝滿 7 天、4 個不同日子打開、劃掉 10 行、這一版只問一次、看過同步提示 14 天內不問；只用系統評分框
- 存檔失敗、讀不出來改成要按的系統提示框（不是會消失的提示條）；存檔失敗只報一次，存回去之後再失敗才再報
- 目錄後面那層維持毛玻璃（多米 11/22 選的），長按選單後面用同一種輕霧（`MenuVeil`）
- 長按選單卡、放大卡、改字卡放在 `Dir/DirCards.swift`；改字卡掛在 `DirHost`（釘住螢幕那層外面），才會停在鍵盤上方
- 第一晚與前一版交接的決策照舊：存檔格式不變、舊存檔只讀不改、目錄磚位置用算的、紙面手勢 UIKit 掛在捲動區上、目錄面板自己做、抖動用明講的 withAnimation

## 📂 下個會話最重要的檔案

- `OVERNIGHT.md` ← **必讀**：早上摘要、28 項清單、七條待確認、卡住的項目、執行紀錄
- `.vibe/2.0-功能差異對照.md` ← 1.1.1 對 2.0 的差異全表（第九節是這次做的順序）
- `.vibe/安全標準.md` ← 動到購買、網址、擴充、iCloud 前先看
- `ios-native/Qieji/App/` ← 根畫面 `QiejiApp.swift`、內購 `Purchases.swift`、付費頁 `FullView.swift`、設定 `SettingsPage.swift`、提示 `Prompts.swift`、切換清單 `SwitchPanel.swift`、最近刪除 `TrashPage.swift`、新功能 `NewsPages.swift`
- `ios-native/Qieji/Core/` ← 規則與存檔；這次新的：`Prefs`、`FullRule`、`Covers`、`CloudLink`、`WidgetPush`、`Review`
- `ios-native/Qieji/Dir/` ← 目錄；這次新的 `DirCards.swift`
- `ios-native/QiejiWidgets/`、`ios-native/Shared/WidgetShare.swift` ← 桌面小工具
- `ios-native/project.yml` ← 小工具擴充、App Group、iCloud 權限、StoreKit 測試設定檔
- 記憶：`project_qieji_swiftui_port.md`、`reference_limrun_swiftui_project.md`

## ⏭️ 下一步從哪繼續

1. 讀這份和 `OVERNIGHT.md` 的早上摘要。`git -C E:\茄記\qieji-swift log --oneline -5`、`git status` 確認沒有別的 session 動過（最新應該是「overnight 28」那個 commit）
2. 問多米待確認第 1–6 條（第 0 條 iCloud 已定：保持開著）
3. 多米要合併：在 `E:\茄記\qieji-swift` 跑 `git checkout overnight-20261121-2038; git merge overnight-20261122-1813`（快轉）。不要就 `git branch -D overnight-20261122-1813`
4. 多米開口才打包：合併後推分支，再單獨推 tag `tfs-2`（build 號＝run 編號＋200）。iCloud 照開著打包
5. 裝上手機後照早上摘要「建議先測」那六項問結果；手感問題照「第二次沒修好先量」
6. 每次改完：開 limrun → `lim xcode build`／`test` → `sh tools-check.sh` → 拉回 `formatted.tgz` 蓋回來 → 刪機器、確認清單是空的

## 🗑️ 這次會話的雜訊（下次別重新討論）

- `tar` 解 `formatted.tgz` 時路徑裡的 `C:` 會被當成遠端主機：先 `cp` 進 `ios-native/` 再解（或加 `--force-local`），解完刪掉暫存檔
- `lim ios type "28"` 打得進 SwiftUI 的 TextField；`perform` 的 touchDown＋wait 900ms＋touchUp 就是長按
- limrun 的 `swipe` 速度固定、偏慢，測不出「甩」；短拉會彈回是對的
- 模擬器是英文系統，鍵盤是英文、中文字形不代表真機
- `StoreKit.Transaction` 要寫全名（SwiftUI 也有 `Transaction`）
- Git Bash 裡用 heredoc 跑 python 會吃反斜線：改檔一律先用 Write 寫成腳本檔再跑

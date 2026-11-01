# Handoff: 2026-11-01 下午｜iCloud S2～S5 寫完（上傳、下載合併、刪除跨裝置、邊界）、控制中心「記一行」建置成功、小工具留白修掉、茄子插圖拿掉、圖示換成方格紙黏土茄子；全部待真機驗，下一步先驗再做 S6

> 產出時間：2026-11-01 14:12（上一版 11:05 在 `.vibe/handoff/archive/2026-11-01-1105.md`）
> 前一會話的最後狀態，給下一個會話接續用
> 專案：`E:\茄記\qieji-app`（Expo SDK 58／RN 0.88 新架構，iOS 原生 app；多米沒有 Mac、不太看程式、用 4G 測）
> **測試方式**：改 JS 用 tunnel 重載：`npx expo start --tunnel --port 8083`（在終端機面板開；8081 是「豆帳」）。改原生（圖示、擴充、套件）要 `npx eas-cli@latest build --profile development --platform ios`（互動式，在終端機面板跑）
> **多米的節奏**：真機一批一批回報，回報一批改一批、每批一個 commit；碰到畫面改法先過 UX 準則（domi-uiux-review）再寫甲乙丙；圖片他會自己生好幾版丟來，Agent 縮到主畫面大小、淺深桌布比給他看再推薦

## ✅ 這次完成了什麼

（cad0ca8 之後 25 個 commit，每包都可單獨 revert）

- **iCloud S2 只上傳**：新檔 `src/lib/cloud.ts`，存檔成功後等 2 秒（進背景馬上）把 `h ≠ sh` 的紙各寫一個 `<id>.json` 到「檔案 › iCloud 雲碟 › 茄記」；墓碑先讀 `gone.json` 合併再寫；`markSynced(n, h)` 記開始上傳那一刻的指紋（修上傳途中又改會漏傳）
- **iCloud S3 下載＋合併**：`fetchCloud` 讀整個資料夾；`store.pullCloud` 在讀完資料、回前景、iCloud 變可用、上傳撞到別台改過時跑；`model.mergeCloud`＝教學紙規則＋`mergeRemote`＋沿用本機物件（`adopt`，畫面手上的紙與行不變孤兒；被同步改字的行回報 `retyped`，Paper 輸入框 key 加 `store.syncRev` 重掛）。打開後第一次拉完才准上傳；上傳前讀 iCloud 那份比指紋，別台改過不蓋、改成先拉
- **iCloud S4 刪除跨裝置**：永久刪除後 `cloud.sweep` 在 `gone.json` 寫成功後才把被墓碑擋住的檔案拿掉（`model.cloudFileBuried`）
- **iCloud S5 邊界**：每個原生呼叫逾時（讀寫 10 秒、列資料夾 35 秒、整次拉取 60 秒；讀到逾時的檔 5 分鐘內不重讀）——原生讀還沒下載的檔會一直等，離線會卡死上傳閘門；換 Apple ID／資料夾被刪 → `model.seemsNewCloud` 推測、暫停、問一次「放進去／先不要」（`ui.ask`）；iCloud 沒開持續 10 秒才 toast 一次（記在 `cn.cloudOffSeen`）
- **控制中心「記一行」**：C1 `src/app/+native-intent.tsx` 接 `qieji://new` → `store.requestCompose`，Paper 升起輸入框（等回前景、等目錄面板收完）；C2 `@bacons/apple-targets` 5.0.0、`targets/controls/`（`_shared/NewLine.swift`：ControlWidgetButton＋openAppWhenRun＋OpenURLIntent）。第一次 EAS 建置失敗（apple-targets 抓錯 expo-widgets 的擴充去改），用 `patches/@bacons+apple-targets+5.0.0.patch`＋postinstall 修好，**第二次建置成功、多米已下載**
- `app.json` 補 `ios.appleTeamId` 3ZT74P4WM2；`.gitattributes` 讓 `*.patch` 固定 LF
- 小工具拿掉自己那圈 padding（不用重建）
- **茄子插圖三處全部拿掉**（空紙、搜尋找不到、最近刪除空了只剩字）
- **App 圖示換成方格紙上的黏土茄子**（`assets/icon.png`，要重建才換）
- 測試 67 條全綠（`tests/sync.test.mjs` 含兩台手機＋假 iCloud 的模擬）；每片四檢全綠

## 🚧 還沒做完 / 待決定

- **真機全部沒驗**（`.vibe/真機驗收-四包-2026-11-01.md`）：第十四節 U1～U6（上傳）、十五 D1～D5（下載合併；**D2 刪掉重裝要等 U1 確認檔案數量跟紙一樣多**）、十六 K1～K6（控制中心，新建置已裝）、十七 E1～E6（刪除跨裝置，一台只能測 E1～E2）、十八 F1～F6（邊界）
- **圖示要再建置一次才會換**（icon.png 在建置成功之後才改；插圖拿掉、S5 是 JS 重載就有）
- ~~iCloud S6 網頁版搬家~~：**多米 11/01 定跳過，不做**（網頁版停在那裡）
- 本機是 Windows，iOS prebuild 跑不起來（停在解開範本），原生改動只能靠 EAS 建置驗
- 待決定（上架前）：原生版沒有開花、結茄子、茄子田要不要找回來；收費
- 沒動、留給 vibe-simplify：`Overlay.tsx` 的 `ui.sheet`、`model.ts` 的 `backupName`、`importBackup`／`exportJSON`；`assets/img/` 裡一堆沒引用的圖（含今天的 face-clay*）
- 閘門 1、2 都沒過（沒找沒看過的人測；圖示顯不顯眼也是閘門 2）

## 📌 關鍵決策（這次定下來的，下次別再爭論）

- 控制中心按鈕走甲（`qieji://new`＋OpenURLIntent）；真機打不開才換乙（App Group 放記號）
- 換 Apple ID：停下來問一次（不靜靜合併）；iCloud 沒開：提示一次
- 茄子插圖全部拿掉，app 裡沒有茄子角色；圖示＝方格紙黏土茄子（奶油底方格＝一張紙，呼應 app；斜躺茄子像 🍆 表情符號，不用）
- 小工具不自己加 padding（iOS 17 起系統已留）
- 合併沿用本機物件、同步改字的行重掛輸入框；上傳前比指紋，別台改過不蓋
- 原生呼叫一律加逾時；讀到逾時的檔不重讀 5 分鐘
- apple-targets 的 patch 要留著，升版時檢查還需不需要

## 📂 下個會話最重要的檔案

- `.vibe/HANDOFF.md` ← 就是這份
- `.vibe/真機驗收-四包-2026-11-01.md` 第十四～十八節
- `.vibe/待審-iCloud同步規劃.md` ← S2～S5 🟡 的實作摘要、S6 的規劃（第四節 ❓2）
- `src/lib/cloud.ts`（傳輸層）、`src/lib/model.ts` 最後兩段（同步規則）、`src/lib/store.ts`（`pullCloud`、`adoptCloud`、`cloudOffOnce`、`requestCompose`）
- `tests/sync.test.mjs`（S0～S5 的規則與兩台模擬）
- `.vibe/控制中心-C2-建置步驟.md`、`.vibe/待審-控制中心按鈕.md`
- `.uiux/審查紀錄.md` 最後幾段（插圖與圖示的來回）、`.uiux/lessons.md` 最後一條

## ⏭️ 下一步從哪繼續

> **11/01 傍晚更新：要上架了。** iCloud／控制中心多米回報都過；安全閘門 🟢；完工驗收書 `.vibe/完工驗收書.md`；iPad 關掉；README 已上 GitHub（私人 repo domyweb666/qieji-app）。
> 送審照 `.vibe/送審步驟-1.0.0.md` 走：等多米貼 App Store Connect 的 Apple ID → 寫進 `eas.json` 的 `submit.production.ios.ascAppId` → 多米跑 production 建置＋auto-submit → TestFlight 自裝補 D2、跑 `.uiux/08-上架.md` L2～L14 → 截圖放大到 1320×2868 → 填資料送審。文案草稿 `.vibe/送審文案-1.0.0.md`。下面是舊的步驟，留著對照。

1. 先讀這份。問多米：圖示要不要現在重建（`npx eas-cli@latest build --profile development --platform ios`）
2. 請多米照驗收清單測，**順序**：U1（數「檔案」裡的 `.json` 數量）→ U2～U6 → K1～K6 → D1 → F1～F4 → E1～E2 →（U1 數量對了才）D2。回報一批修一批
3. 同一個同步 bug 第二次沒修好：在 `cloud.ts` 的 `warn` 之外加開發版量測（印到 Metro），別再推理（lessons）
4. S6 跳過（多米 11/01 定），iCloud 同步驗完就收工

## 🗑️ 這次會話的雜訊（下次別重新討論）

- 圖示來回七、八版（黏土全身、黏土特寫、笑臉自帶圓角、扁平斜躺、紫底紫茄、花萼、直立扁平）——已定案方格紙那張
- 茄子插圖換黏土版又拿掉——已定案拿掉
- 本機 Windows 用「假裝 macOS」跑 prebuild 會停在解開範本，Docker 沒開；別再試，直接 EAS 建置
- EAS 建置紀錄是 brotli 壓縮的：`npx -y eas-cli@27.2.0 build:view <id> --json` 拿 `logFiles[0]`，curl 下來用 `zlib.brotliDecompressSync` 解
- 審查時曾把舊圖示誤認成黏土版（其實是扁平），已更正並寫進 lessons：審素材先開原檔

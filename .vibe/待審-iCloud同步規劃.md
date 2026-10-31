# 待審：iCloud 同步

> 2026-11-01 多米定：匯出、匯入備份都拿掉，資料搬家改做 iCloud 同步。
> ✅ 同日多米選「三個 ❓ 都照推薦」：甲（iCloud 雲碟檔案）、網頁版搬家走 B、先免費。✅ S0 已做（見第七節）。
> 專案現況：Expo SDK 58／RN 0.88（新架構）、bundle id `org.domyweb.qieji`、整份資料一個 JSON 存在 AsyncStorage `colornotes.v1`、多米沒有 Mac（每改一次原生就要 EAS 重建）。

## 一、一句話

在 iPhone 記的一行，另一台登入同一個 Apple ID 的 iPhone／iPad 打開茄記也看得到；換手機、刪掉重裝，資料從 iCloud 回來。存在使用者自己的 iCloud，開發者看不到、不用租伺服器。

## 二、現在的資料長什麼樣（同步要配合的地方）

| 現況 | 對同步的影響 |
|---|---|
| 整份資料是一個 JSON（`colornotes.v1`），250ms 防抖存檔 | 不能整份上傳覆蓋：兩台各改一張，後上傳的會蓋掉另一台。要拆成「一張紙一筆」 |
| 每張紙有 `updated`（毫秒），行沒有自己的時間 | S0 的做法：每張紙加內容指紋 `h`、改動時間 `mod`、上次對上 iCloud 的指紋 `sh`（共同祖先）。一邊改就拿改的那邊；兩邊都改了同一張，**把兩邊的行合起來**（每一行有自己的 id），同一行兩邊都改了字才用比較新的那邊。比原本規劃的「新的贏、舊的那次改動不見」安全 |
| 永久刪除、30 天自動清、空紙關掉，都是把紙從陣列拿掉、不留紀錄 | 同步之後另一台還有那張，會被「同步回來」（刪掉的紙復活）。要加墓碑：記下「這個 id 在某時被永久刪了」 |
| 刪掉的行在每張紙的 `bin` 裡，跟著紙走 | 跟著整張紙同步就好，不用另外處理 |
| `importBackup` 已有「依 updated 合併」的規則（測試在跑） | 合併的骨架可以沿用，改成吃單張紙＋墓碑 |

鐵則 1（不能掉資料）在同步上的意思：**拿不準就兩邊都留**，寧可多一張重複的紙，也不能少一張。

## 三、❓1 用哪一種 iCloud（Agent 推薦甲）

| | 做法 | 要寫的 | 速度 | 風險 |
|---|---|---|---|---|
| **甲 iCloud 雲碟上的檔案**（推薦） | 用 `react-native-cloud-storage`（有 Expo 設定外掛，新架構）在 app 自己的 iCloud 容器裡，一張紙存一個 `<id>.json`，加一個墓碑檔。打開 app、回到前景、存檔後幾秒各同步一次 | 全部 JS，外掛處理權限設定，不用寫 Swift | iCloud 雲碟自己決定什麼時候傳，通常幾秒，有時一兩分鐘；沒有推播，另一台要回到前景才拉 | 使用者關掉 iCloud 雲碟就不同步（app 照樣能用，只是本機）；檔案可能還在雲上沒下載，要先叫系統下載 |
| 乙 CloudKit 私人資料庫 | 一張紙一筆紀錄，用變更權杖只拉有改的，可以訂閱推播（另一台幾秒內收到） | 現成橋接 `expo-cloudkit-bridge` 很新、沒人用過；穩的做法是自己寫 Swift 的 Expo 模組。沒有 Mac，每改一行 Swift 都要雲端建置一次才能測 | 最快，最接近「10 秒內出現」 | 開發最久、最難除錯；出錯時沒有模擬器可以看 |
| 丙 iCloud 鍵值儲存 | 整份資料塞進 Apple 的鍵值儲存 | 最少 | 快，有變更通知 | 總上限 1 MB、最多 1024 個鍵，紙多了會爆。只適合存設定，**不建議存紙** |

**推薦甲的理由**：不用寫 Swift、沒有 Mac 也改得動；一張紙一個檔案剛好對上「整張紙比 updated」的合併；資料在使用者 iCloud 裡看得到摸得到。代價是「另一台 10 秒內出現」不保證，要量。量出來太慢、而且多米真的常兩台同時用，再升級到乙（檔案格式可以沿用，換的是傳輸那層）。

## 四、❓2 網頁版的資料怎麼進來（Agent 推薦 B）

匯入拿掉之後，網頁版（`colornotes.v1` 在 Safari 裡）的紙進不來。

- A：不搬。網頁版就停在那裡
- **B（推薦）：搭甲的便車**。網頁版匯出備份（網頁版還有這個功能），在「檔案」app 裡把那個 JSON 丟進「iCloud 雲碟 › 茄記」資料夾，茄記下次同步看到它就合併進來、合併完把檔案改名成「已匯入」。app 裡不用多任何按鈕
- C：暫時把匯入放回去，搬完再拿掉

選乙的話 B 做不到，只剩 A 或 C。

## 五、❓3 免費還是付費解鎖

舊交接寫「付費解鎖：iCloud 同步、小工具…」。付費要做內購（另一包大工程）。
**推薦**：先做成免費、全部人都有，內購那包做的時候再決定要不要把它鎖起來（鎖起來的話，已經在用的人要留著，不能一升級就停）。

## 六、多米要先做的（Agent 做不了）

1. Apple Developer 網站：App ID `org.domyweb.qieji` 打開 iCloud（勾 iCloud Documents 或 CloudKit），建一個容器 `iCloud.org.domyweb.qieji`。EAS 有「同步權限」可以代辦一部分，但文件寫要在本機登入 Apple 帳號才能自動註冊容器；照步驟檔的方式，Agent 會寫好一步一步的說明
2. 重新建置開發版（加原生套件，跟第四輪一樣：先 `npx expo-doctor`、再 `npx eas-cli@latest build`）
3. 第二台裝置：有沒有 iPad 或另一支 iPhone 登入同一個 Apple ID？沒有的話，「刪掉 app 重裝、資料回來」只能證明備份，證明不了兩台同步

## 七、切片（照順序，一片一個 commit、一片一次真機）

| 片 | 做什麼 | 要重建嗎 | 多米怎麼驗 |
|---|---|---|---|
| S0 ✅ | 資料先準備好：加墓碑（永久刪除、清空最近刪除、30 天清、空紙拿掉都走 `dropNotes` 記一筆 id＋時間）；存檔前 `stampMods` 蓋指紋與改動時間；合併規則 `mergeRemote`；`tests/sync.test.mjs` 20 條（全 49 條綠）；網頁用舊格式資料驗過：pink→red、mod 取舊的 updated、40 天前的最近刪除被清掉並留墓碑 | 不用 | 用起來跟現在一模一樣（只加欄位，鐵則 1） |
| S1 🟡 | 裝套件與外掛、設 iCloud 容器、重建（Claude 那半做完，步驟在 `.vibe/iCloud-S1-建置步驟.md`，待多米建置與 C1～C5） | 要 | 新版打開沒閃退、紙都在 |
| S2 | 只上傳：每次存檔後把改過的紙寫到 iCloud | — | 「檔案」app › iCloud 雲碟 › 茄記 看得到一張紙一個檔案 |
| S3 | 下載＋合併：打開、回到前景時拉回來合併 | — | 刪掉 app 重裝，紙回來；兩台的話，A 記一行、B 回到前景看到 |
| S4 | 刪除跨裝置：最近刪除、還原、永久刪除、30 天清 | — | A 刪、B 看到進最近刪除；A 永久刪除、B 不會復活 |
| S5 | 邊界：飛航模式記幾行再連線、iCloud 沒登入或關掉、換 Apple ID | — | 離線記的不見就不過；換帳號不能混到別人的紙 |
| S6 | 網頁版搬家（看 ❓2） | — | 網頁版的紙全部出現，一張不少 |

S0 能現在就做（純 JS，重載就驗）；S1 起要等第六節的 1、2。

## 八、不做（這一包）

- 行的字級合併（同一行兩邊各改了不同的字，兩邊的字都留）：要給每一行加時間；S0 是用比較新的那邊。真的撞到再做
- 同步狀態的畫面（轉圈、上次同步時間）：茄記的原則是不打擾，第一版靜靜同步，失敗不跳出來；只有「iCloud 沒開」要不要提示一次，S5 再定
- Android／網頁版同步

## 九、查證紀錄（2026-11-01）

- Expo 官方沒有 iCloud 模組；llms.txt 沒有 iCloud／CloudKit 的頁面
- EAS「iOS capabilities」：同步權限支援 iCloud（`com.apple.developer.icloud-container-identifiers`）；CloudKit 容器可以自動註冊，但要在本機用 Apple 帳號登入（https://docs.expo.dev/build-reference/ios-capabilities）
- `react-native-cloud-storage`：Expo 設定外掛，選項 `iCloudContainerIdentifier`（預設 `iCloud.$BUNDLE_IDENTIFIER`）、`iCloudContainerEnvironment`、`enableKeyValueStorage`；新版只支援新架構；不能用 Expo Go（https://cloudstorage.kuatsu.de/docs/installation/expo）。**最新版號、跟 SDK 58 的相容性還沒對**，S1 動工前用 `npx expo install` 與 npm 頁確認
- `expo-cloudkit-bridge`：CloudKit 私人資料庫橋接，自己帶合併策略，GitHub 0 星，視為未經驗證（https://github.com/stilesja/expo-cloudkit-bridge）

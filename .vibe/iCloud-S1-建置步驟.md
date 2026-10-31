# iCloud 同步 S1：開 iCloud、重新建置（2026-11-01）

> 目標：新的開發版裝上去，**打開沒閃退、紙都在**。這一片還不會同步任何東西（S2 才開始上傳），只是把 iCloud 的權限與套件放進 app。
> 規劃在 `.vibe/待審-iCloud同步規劃.md`；建置的老規矩在 `.vibe/EAS建置-申請與設定步驟.md`（丁段的坑都還算數）。

## 甲、Claude 已經做好的（commit 見 git log「iCloud 同步 S1」）

- 裝了 `react-native-cloud-storage` 3.3.0（`npx expo install`，2026-10 的版本，新架構）
- `app.json` 加了它的外掛，容器 `iCloud.org.domyweb.qieji`，環境 `Production`
- 加了一支小外掛 `plugins/withICloudFolderName.js`：「檔案」app 裡的資料夾叫「茄記」，不是「qieji」
- `npx expo config --type introspect` 看過最後的設定：權限多了 iCloud 容器、iCloud Documents、ubiquity 容器；原本小工具用的 App Group `group.org.domyweb.qieji` 還在
- `npx expo-doctor` 20/20、四檢全綠（49 條測試）
- 順便拆掉 `expo-sharing`、`expo-document-picker`（匯出、匯入拿掉後沒人用了），反正這次要建置，省得之後為它多建一次
- 程式裡**還沒有任何地方用到這個套件**，所以你手上現在這版開發版照常能重載、不會因為少了原生模組而壞

## 乙、你要做的（照順序）

### 1. 先試「讓 EAS 自動開」（大部分情況到這步就好）

在 `E:\茄記\qieji-app` 開 PowerShell：

```bash
npx eas-cli@latest build --platform ios --profile development
```

照上次的方式回答問題。這次權限多了 iCloud，建置一開始你應該會看到類似：

- 問要不要登入 Apple 帳號 → **是**（EAS 要用你的帳號幫 App ID 開 iCloud、註冊容器）
- `Synced capabilities: Enabled: iCloud` 之類的一行
- 說描述檔（provisioning profile）跟權限不符、要不要重新產生 → **是**

建置排隊＋編譯跟上次差不多（15～25 分鐘）。成功就跳到第 3 步。

### 2. 如果建置失敗、錯誤訊息提到 iCloud 或 container（手動開）

到 https://developer.apple.com/account → Certificates, Identifiers & Profiles：

1. **Identifiers** 右上的下拉選單切到 **iCloud Containers** → 按 ＋ → 選 iCloud Containers → Description 打 `茄記`，Identifier 打 `iCloud.org.domyweb.qieji` → Continue → Register
2. 下拉切回 **App IDs** → 點 `org.domyweb.qieji` → 往下找 **iCloud** 打勾 → 選「Include CloudKit support」那個選項 → 旁邊的 **Configure** → 勾 `iCloud.org.domyweb.qieji` → Continue → Save（會跳警告說描述檔要重新產生，按確認）
3. 回到 PowerShell 再跑一次第 1 步的指令；問描述檔要不要重新產生答**是**

> 網站上的按鈕名稱 Apple 偶爾會改。對不上的時候截圖給 Claude 看，不要亂勾別的權限。

**也可能遇到**：Apple 合約更新沒同意 → 上 developer.apple.com/account 同意後再建（丁段第 3 點，每年會來一兩次）。

### 3. 裝新版、驗收

裝法跟上次一樣（開建置連結或掃 QR）。裝好之後：

| # | 做什麼 | 看什麼 | 過／不過 |
|---|---|---|---|
| C1 | 冷啟動（從多工完全關掉再點圖示） | 沒白光一閃退桌面；啟動畫面照舊 | |
| C2 | 看紙與目錄 | 所有的紙、行、最近刪除都在，一則不少 | |
| C3 | 記一行、劃掉一行、刪一行，關掉再開 | 都還在（存檔照常） | |
| C4 | 桌面小工具 | 還顯示上次那張紙（App Group 沒被弄壞） | |
| C5 | 「設定 › 你的名字 › iCloud」 | 這一版還**不會**出現茄記（S2 開始寫檔才會），出現也沒關係 | |

然後照常開電腦上的 Metro（`npx expo start --tunnel --port 8083`），重載確認改 JS 還是熱更新。

退桌面的話：「設定 › 隱私權與安全性 › 分析與改進項目 › 分析資料」找最新的 `app-*.ips`，截圖或把內容貼給 Claude（丁段第 4 點）。

## 丙、這一片做完之後

- 回報 C1～C5 → Claude 接 **S2：只上傳**（每次存檔後把改過的紙寫進 iCloud 的「茄記」資料夾，你在「檔案」app › iCloud 雲碟 › 茄記 看得到一張紙一個檔案）。S2、S3 都是純 JS，重載就能測，不用再建
- 第二台裝置（iPad 或另一支 iPhone，同一個 Apple ID）要在 S3 之前準備好；也要先 `eas device:create` 登錄，再建一次才裝得上（ad hoc 只認登錄過的裝置）。沒有第二台也行，S3 改用「刪掉 app 重裝、資料回來」驗

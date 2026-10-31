# EAS 建置：申請與設定步驟（多米 2026-10-31 決定「跨，去申請」）

> 評估與理由在 `待審-EAS建置與小工具.md`。這份是執行清單：哪些只有多米能做、哪些審核過後由 Claude 做。
> 狀態（2026-10-31 15:02）：多米本來就是付費會員，門直接開了。乙段 1～6 做完。第一個能跑的建置是 **build a37a893a（commit 2cecc4f）**；前一個 d2f570cd 裝得上但一開就閃退（丁段第 4 點）。接著：多米刪舊的重裝、驗收第一輪（乙段 7）。
> 建置失敗兩次、閃退一次才過，原因與修法全在丁段，下次別再踩。

---

## 甲、多米自己做（帳號、付款，Claude 不能代辦）

### 1. 申請 Apple Developer Program（個人）

Apple 報名頁（2026-10-31 抓的）要求：

- 一個開了**雙重認證**的 Apple ID。
- Apple ID 的**名字欄要用本名**（身分證上的），不能是暱稱、品牌名、公司名，否則「會延遲審核」。名字會顯示成 App Store 上的開發者名稱。
- 成年；地址不能是郵政信箱。
- 報名方式兩種：網頁 developer.apple.com/programs/enroll/ 按「Start your enrollment」，或 iPhone 裝 **Apple Developer** app 從裡面報名（iPhone 上報名通常會用相機驗證身分證件，比較快過）。
- 資料驗證通過後，同意授權合約、付費：**99 美金／年**，報名時會顯示台幣價格。
- 「個人」不用 D-U-N-S 編號，那是「組織」才要。
- 審核時間 Apple 沒寫死，一般 1～2 天，被要求補件就更久。

**要先決定的一件事：用哪個 Apple ID**。這個帳號會綁 bundle id `org.domyweb.qieji`，以後 TestFlight、上架、續費都是它。建議用平常不會換掉的那個。

### 2. Expo 帳號

去 expo.dev 註冊（免費方案就夠）。記下帳號名，之後 `eas login` 要用。

### 3. 審核過了之後跟 Claude 說一聲

說「Apple 過了」就好。接下來乙段由 Claude 做，但中間有兩處要多米本人在場：`eas login` 和第一次建置問 Apple 帳密時。

---

## 乙、審核過後的設定（Claude 做，多米在旁）

照評估第六節的順序：**第一次建置不加小工具**，先確認自己的 app 上圖示、啟動畫面、四輪手感跟 Expo Go 一樣。

1. `npx eas-cli@latest login`（多米輸入 Expo 帳密）→ `eas whoami` 確認。
2. `npx expo install expo-dev-client`（開發版建置要它；裝了之後 `npx expo start` 會預設找開發版，要回 Expo Go 加 `--go`）。
3. `eas build:configure` → 產生 `eas.json`。預設三個 profile：
   ```json
   {
     "build": {
       "development": { "developmentClient": true, "distribution": "internal" },
       "preview": { "distribution": "internal" },
       "production": {}
     }
   }
   ```
   我們只用 `development`：帶開發工具、內部發佈（直接裝手機，不走 TestFlight）。
4. `eas device:create` → iPhone 掃 QR 登錄 UDID。**新帳號的新裝置 Apple 可能要 24～72 小時才生效**，這段時間建置會失敗，不是我們的錯，等。
5. `eas build --platform ios --profile development`：第一次會問 Apple 帳密、要不要讓 EAS 代管憑證（選是）。雲端排隊＋編譯 15～25 分鐘（免費方案低優先，可能更久）。
6. 建好開連結或掃 QR 裝到 iPhone。之後 `npx expo start`，手機上的開發版連電腦，改 JS 一樣熱更新。
7. **驗收第一輪**（自己的 app 上）：圖示、啟動畫面顏色（❓12 在這裡終於看得到）、Return 切行、點一下編輯、越線震、拖曳、字放大、Backspace 併行。手勢與鍵盤在原生環境要再過一遍，Expo Go 過了不算。
8. 穩了才進小工具：`npx expo install expo-widgets`，`app.json` 加 plugin，再建置一次。第一版只讀不寫（評估第四節）。

## 丁、2026-10-31 第一次建置踩到的兩個坑（已修，記下來）

1. **`package.json` 的 `prepare` 腳本讓雲端 `npm install` 死掉**。它跑 `git config core.hooksPath tools/githooks`，EAS 拿到的是打包檔、沒有 `.git`，直接 `fatal: not in a git directory` exit 128。修：後面加 `|| exit 0`（commit c0325e8）。本機用 `git archive` 解到空資料夾跑 `npm run prepare` 可以重現。
2. **雲端 `npm ci` 說 lock 缺 `@emnapi/core`、`@emnapi/runtime`**。那是 `@unrs/resolver-binding-wasm32-wasi`（cpu 限 wasm32 的選用套件）底下 `@napi-rs/wasm-runtime` 的相依；這台 Windows 的 npm 11 不解平台不符的選用套件，怎麼重算 lock（原地、刪掉重算、`--cpu=wasm32`）都不會寫進去，而 EAS Mac 預設那版 npm 會檢查。修：`eas.json` development profile 釘 `"node": "24.13.0"`，跟本機同版、內建 npm 11 同規則（commit fbec07a）。**以後升 Node 本機和 eas.json 要一起改。** 備案（沒用到）：把那兩個套件明寫進 `optionalDependencies`。
3. 第一次 `eas build` 失敗的另一個原因是 Apple 合約更新沒同意，Apple 不讓登記 bundle id；多米上 developer.apple.com/account 同意後就過。合約每年都會更新一兩次，看到「agreement updates」就是這個。

4. **建置成功、裝得上，但一開白光一閃就退桌面**。iPhone 的分析資料裡 `app-2026-10-31-*.ips` 寫得很清楚：`DYLD, Symbol missing`，`ExpoFont.framework` 要的符號在 `ExpoModulesJSI.framework` 裡找不到。原因：補 `expo-font`（58.0.11）時專案的 `expo` 還是 58.0.20，expo-doctor 列的 8 個「小版落後」當時被判成不影響——**在 Expo Go 不影響（原生層是 Expo Go 的），自己建置就會炸（原生層照 node_modules 編）**。修：`npx expo install --fix` 全部對齊，doctor 20/20（commit 2cecc4f）。**規則：每次建置前先 `npx expo-doctor`，有版本不符就 `--fix`，不准跳過。** 白光一閃退桌面＝原生層啟動崩潰，看分析資料 `app-*.ips` 的 `termination` 欄最快；JS 錯誤會是紅色畫面不會退桌面。
5. 裝開發版前 iPhone 要開「設定 → 隱私權與安全性 → 開發者模式」（要重開機一次）。ad hoc 建置**不需要**「信任開發者」那一步，VPN 與裝置管理裡不會有東西；那頁的「登入學校或工作用帳號」是 MDM，別點。
6. 開發版的內部程序名是 `app`（prebuild 把中文 app 名「茄記」清掉後的 fallback），崩潰紀錄檔名也是 `app-*.ips`；桌面顯示的名字仍是茄記，不影響。

另外 EAS 第一次建置會問「只用標準加密？」答是，會寫進 `app.json` 的 `ITSAppUsesNonExemptEncryption: false`（已 commit）。

## 丙、之後會遇到的事

- `app.json` 改了、加原生套件、升 SDK → 要重建。小工具 TSX 內容改了不用。
- 免費方案每月 15 次 iOS 建置。一個人夠用，但別為了小事一直建。
- ad hoc 憑證一年到期，一年後重建一次再裝。
- Apple 年費到期不續，已裝的 app 會在憑證到期後打不開。

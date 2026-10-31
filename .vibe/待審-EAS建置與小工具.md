# 待審：跨不跨「EAS 建置」這道門（為了桌面小工具）

> 2026-10-31 效能與手感收尾後，多米說「談 EAS 建置」。這份只是評估，一行程式沒改、一毛錢沒花。
> 文件來源都是當天抓的最新版：Expo 官方 EAS Build 設定、內部發佈、開發版建置、`expo-widgets`（SDK 58）、EAS 價格頁；Apple 年費只有第三方整理，Apple 官方頁只確認「99 美金或等值當地貨幣」。

---

## 一、一句話

**現在是「借 Expo Go 跑」，跨過去是「用自己的 app 跑」。** 跨過去要付 Apple 一年 99 美金（約台幣 3,300），Expo 這邊免費額度夠用；程式面小工具不用寫 Swift，但每次動到小工具設定都要重新雲端建置一次（15～25 分鐘）。

## 二、要花什麼

| 項目 | 費用 | 說明 |
|---|---|---|
| Apple Developer Program（個人） | **99 美金／年**，不跨過就是 0 | 裝到真機的唯一路。免費 Apple ID 只能裝模擬器版，而且要 Mac |
| EAS Build Free 方案 | **0** | 每月 iOS 15 次、Android 15 次建置；低優先佇列（排隊可能幾十分鐘）；單次 45 分鐘上限 |
| Starter 方案（備案） | 19 美金／月 | 高優先、45 美金建置額度。**現在不需要**，一個人每月建不到 15 次 |
| 時間 | 第一次大約半天 | 申請 Apple 帳號（審核 1～2 天）＋ `eas build:configure` ＋ 登錄 iPhone UDID ＋ 第一次建置。之後每次建置 15～25 分鐘等 |

## 三、跨過去的實際流程（Windows、沒 Mac）

1. 申請 Apple Developer Program（apple.com，個人身分，Apple ID 要開雙重認證）。審核過前什麼都動不了。
2. `npx eas-cli@latest login` → `eas build:configure`（產生 `eas.json`）→ `npx expo install expo-dev-client`。
3. `eas device:create`：手機掃 QR 登錄 UDID。Apple 對新帳號的新裝置可能要 24～72 小時才生效，這段時間建置會失敗，要等。
4. `eas build --platform ios --profile development`：第一次會問 Apple 帳密，EAS 代為產生憑證。雲端 Mac 編譯。
5. 建置完開連結或掃 QR 裝到 iPhone。**之後就跟 Expo Go 一樣**：`npx expo start`，手機上的開發版連到電腦，改 JS 立刻熱更新，不用重建。
6. **要重建的時機**：加了帶原生碼的套件、改 `app.json`（含小工具設定）、升 SDK。小工具的 TSX 內容改了不用重建，設定（名稱、尺寸、App Group）改了要。

**內部發佈（ad hoc）vs TestFlight**：一個人一支手機選內部發佈，不用進 App Store Connect、不用審核，裝置上限 100 台／年綽綽有餘。TestFlight 是以後要給別人測或上架時再說。ad hoc 憑證一年到期，一年後要重建一次裝回去。

## 四、小工具本身：比上次評估的更簡單

`expo-widgets`（Expo 官方，SDK 58）確認：

- **不用寫 Swift**。小工具是一個 TSX 函式，開頭寫 `'widget'` 指令，用 `@expo/ui/swift-ui` 的 `VStack`、`Text`、`Button` 等排版。
- **Expo Go 不支援**，一定要開發版建置。這就是門。
- 支援：桌面小／中／大、鎖定畫面三種、iOS 17+ 可互動（按鈕按了小工具自己更新，app 不用在跑）。
- **資料怎麼過去**：app 端呼叫 `updateSnapshot(props)` 把要顯示的東西推過去；小工具端是隔離環境，**不能用 hooks、不能 import、不能讀 app 的 AsyncStorage、不能參考函式外的變數**。所以茄記要做的事是：每次存檔時順便把「上次那張紙的名字＋前幾行」推一次 snapshot。小工具要放圖（茄子臉）得寫進 `widgetsDirectory` 共用目錄。
- **點小工具開 app**：文件只寫按鈕的 `onPress`，沒寫整塊點擊的深連結；要做「點了開那張紙」得實作時再試。
- 同一套 TSX 也能開 Android 小工具（`enableAndroid`），不用另外寫。

跟上一份評估的差異：上次寫「控制中心、Siri 要 `@bacons/apple-targets` 寫 Swift」仍然成立；但桌面＋鎖定畫面這一包確定零 Swift。

## 五、不跨的話還能做什麼

- 效能與手感這條線已經全收尾，Expo Go 上該有的都有了。
- 圖示、啟動畫面在 Expo Go 永遠看不到自己的，這兩件也卡在同一道門。
- 不跨就等於接受「茄記永遠是在 Expo Go 裡跑的 app」：每次開要先開 Expo Go、電腦要開 dev server。這跟「要不要讓它變成一個真的 app」是同一個問題。

## 六、建議

**跨。** 理由不是小工具，是「紙是家」做到這個完成度，再不離開 Expo Go 就是卡在玩具階段；99 美金買到的是自己的圖示、啟動畫面、隨時打開不用電腦、小工具，一次解四件。

順序建議：
1. 先申請 Apple Developer Program（審核要等，先送出）。
2. 等審核的期間不動程式。
3. 過了之後第一次建置**不加小工具**，先確認圖示、啟動畫面、四輪手感在自己的 app 上都一樣（Expo Go 跟自己建置的原生環境不完全相同，手勢、鍵盤要再過一輪）。
4. 穩了再加 `expo-widgets`：第一版只讀不寫，中型桌面小工具＋鎖定畫面一行，顯示上次那張紙的名字和前幾行。
5. 「不開 app 就記一行」第二輪。

**不跨的話**：這份存檔，待審清單第四節維持「等多米決定」，接下來沒有程式要做，只剩兩個 ❓D 文件小尾巴。

## 七、要多米決定的

- 跨不跨（付不付這 99 美金）。
- 跨的話，Apple 帳號用哪個 Apple ID 申請（會綁 bundle id `org.domyweb.qieji`，之後上架也是這個帳號）。

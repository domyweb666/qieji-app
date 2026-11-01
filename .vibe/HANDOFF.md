# Handoff: 2026-11-01 上午｜真機回報九批全部改完（輸入框、拖曳、改名字、記完捲回頂端、教學紙）、備份拿掉、iCloud 同步 S0 完成、S1 建置裝上；下一步 iCloud S2「只上傳」

> 產出時間：2026-11-01 11:05（上一版 06:03 在 `.vibe/handoff/archive/2026-11-01-0603.md`）
> 前一會話的最後狀態，給下一個會話接續用
> 專案：`E:\茄記\qieji-app`（Expo SDK 58／RN 0.88 新架構，iOS 原生 app；多米沒有 Mac、不太看程式、用 4G 測）
> **測試方式**：開發版建置 `8c94e6a2`（commit `bd16ca4`，含 iCloud 權限與 react-native-cloud-storage）已裝在 iPhone 17。改 JS 用 tunnel 重載：`npx expo start --tunnel --port 8083`（在終端機面板開；8081 是「豆帳」）。tunnel 網址每次重開會換，手機連不上就掃新 QR。
> **多米的節奏**：真機一批一批回報，回報一批改一批、每批一個 commit；碰到畫面改法先過 UX 準則（domi-uiux-review）再寫甲乙丙給他選。

## ✅ 這次完成了什麼

（e8d4490 之後 18 個 commit，每包都可單獨 revert）

- **輸入框（按 ＋ 那個）第六版，多米確認「打字搞定了」**：真機量測抓到在多米手機上輸入框根本不會重新量高、且一行實際 28 對量到 23。改成隱形鏡像撐高、iOS 鏡像與輸入框同一個明寫行高 `font.composerLine` 17/22、鏡像右邊多留 5 點（寧可滿行多一行空白）。量測已拿掉
- **頂端拖曳放下後「往上抬一下」**：真正原因是 ScrollView 的 maintainVisibleContentPosition（記住最上面那行）。整個拿掉；「從輸入框點一行離開時畫面原地不動」改成新行量好高度時補捲。放下收尾用 `dropTick`：換順序那次重畫畫完才歸零位移、下一格才開回行的過場
- **記完一行捲回頂端**（多米改定）：`addFromDraft` → `placeNewRow`，iOS 捲動動畫回頂、新行亮一下 0.6 秒淡掉（`motion.freshGlow`）；從輸入框點一行離開或拖曳時不捲
- **點長的一行後半段**：畫面停在點的字（`focusAt`，上下各留一行），不再捲回開頭
- **改名字字頂被切**：改用多行輸入框（Return 送出）
- **右上茄紫 ✓**：行或清單名在編輯時才出現（不看 composing，避免閃）；⋯ 用鍵盤時鐘滑過去
- **輸入框開著時整張紙變暗**（scrim 0.3，不擋觸控，跟鍵盤同時鐘）；之前試過「淡一點」多米說 OK 但想試暗
- **目錄**：沒取名的磚寫「未命名」（`label()`）；匯出、匯入備份都拿掉、⋯ 整顆拿掉；下拉開目錄試了又整個拿掉（跟拖曳混淆），開目錄只剩點清單名
- **第一次安裝放教學紙**「從這裡開始」六行（`model.ts` TUTORIAL／tutorialNote，`store.load` 在存檔不存在時放）；紙底下的手勢提示拿掉
- **iCloud 同步**：規劃（`.vibe/待審-iCloud同步規劃.md`，多米選甲 iCloud 雲碟檔案＋react-native-cloud-storage、網頁版搬家走 B、先免費）；**S0 完成**（墓碑 `gone`、指紋 `h`／`mod`／`sh`、`stampMods`、`dropNotes`、`mergeRemote`，`tests/sync.test.mjs` 20 條）；**S1 完成**（套件＋外掛＋`plugins/withICloudFolderName.js` 資料夾名「茄記」、拆掉 expo-sharing／expo-document-picker、建置 `8c94e6a2` 裝上）
- 全部測試 50 條綠；每批都有四檢（check:tokens、typecheck、lint、test）

## 🚧 還沒做完 / 待決定

- **待真機回報**：`.vibe/真機驗收-四包-2026-11-01.md` 第十三節後段 **R40～R49**（記完捲回頂端、亮一下、點長行後半段、底部提示不見）；R49 教學紙要刪掉重裝才看得到，可等找人測
- **S1 的 C1～C5**（`.vibe/iCloud-S1-建置步驟.md` 乙-3）沒逐條回報，但多米整個上午都在這個建置上測，冷啟動、存檔、紙都正常；小工具沒特別看
- **捏捏史萊姆借用茄記的 Bundle ID `org.domyweb.qieji`**：TestFlight 裝史萊姆會把茄記蓋掉（今天發生過，多米刪掉史萊姆重裝，舊茄記資料放棄）。史萊姆要換自己的 ID（建議 `org.domyweb.nienie`，在 `E:\捏捏史萊姆\nienie-slime` 的 `project.yml` 改，App Store Connect 開新 App）。沒換之前別從 TestFlight 裝史萊姆
- **小工具留白太多**：`widgets/PaperWidget.tsx` 自己的 `padding` 疊在 iOS 預設內邊距上。多米問過，Agent 提議拿掉自己那圈（改小工具 TSX 不用重建），還沒做
- **控制中心按鈕**（多米問能不能加）：可以，但 expo-widgets 不支援，要 Swift（@bacons/apple-targets）＋重建；排進「捕捉速度」那包
- **原生版沒有開花、結茄子、茄子田**：上架前要多米決定要不要找回來（影響文案與付費）
- 沒動、留給 vibe-simplify：`Overlay.tsx` 的 `ui.sheet`、`model.ts` 的 `backupName`、`importBackup`／`exportJSON`（後兩個測試在用）；E2 延遲基準從沒量過
- 閘門 1、2 都沒過（沒找沒看過的人測）

## 📌 關鍵決策（這次定下來的，下次別再爭論）

- 匯出、匯入備份都不要；資料搬家靠 iCloud 同步
- iCloud 走甲：iCloud 雲碟上一張紙一個 JSON（react-native-cloud-storage，容器 `iCloud.org.domyweb.qieji`）；網頁版資料走 B（使用者把網頁版備份丟進「檔案 › iCloud 雲碟 › 茄記」，app 同步時合併）；先免費
- 合併規則（S0 已寫死在測試）：一邊改拿改的；兩邊都改把兩邊的行依 id 合起來；墓碑比改動新才拿掉；拿不準就兩邊都留
- 記完一行捲回頂端＋新行亮一下（推翻同日早上的「原地不動」）；從輸入框點一行離開時不捲
- 不用 maintainVisibleContentPosition（會害頂端拖曳）
- 開目錄只有點清單名；不加任何往下拉的手勢（會跟拖曳混淆）
- 手勢靠第一次安裝的教學紙教，不在紙上留提示字
- 打字時紙變暗（試用中），不擋觸控
- 同一個真機 bug 第二次沒修好，就停止推理，先加開發版量測（印到 Metro）或找「只在某條件發生」的線索（lessons）

## 📂 下個會話最重要的檔案

- `.vibe/HANDOFF.md` ← 就是這份
- `.vibe/待審-iCloud同步規劃.md` ← S2～S6 切片、「七之一 教學紙」要在 S3 處理
- `.vibe/iCloud-S1-建置步驟.md` ← 建置與 Bundle ID 撞號的坑
- `src/lib/model.ts` 最後一段「iCloud 同步：資料規則」（`stampMods`、`dropNotes`、`markSynced`、`mergeRemote`）、`tests/sync.test.mjs`
- `src/lib/store.ts`（`writeNow` 存檔前蓋指紋、`load` 放教學紙、`purgeTrash` 立墓碑）
- `node_modules/react-native-cloud-storage`（3.3.0）的 API；外掛原始碼看過：iCloud Documents、`NSUbiquitousContainerIsDocumentScopePublic: true`
- `.vibe/真機驗收-四包-2026-11-01.md` 第十三節後段 R40～R49
- `.uiux/審查紀錄.md` 最後幾段、`.uiux/lessons.md` 最後三條

## ⏭️ 下一步從哪繼續

1. 先讀這份。問多米 R40～R49 有沒有問題（有就照編號先修）
2. **iCloud S2：只上傳**（純 JS，重載就能測，不用重建）：
   - 先讀 react-native-cloud-storage 3.3.0 的 API（`node_modules/react-native-cloud-storage/dist/typescript` 與文件 https://react-native-cloud-storage.oss.kuatsu.de/docs），確認 iCloud 可不可用（使用者沒登入／關掉雲碟時要靜靜退回只存本機）、寫檔路徑用哪個 scope（要讓多米在「檔案」app 看得到 → Documents）
   - 新檔 `src/lib/cloud.ts`：存檔成功後（`store.ts` 的 `writeNow`）把 `h !== sh` 的紙各寫一個 `<id>.json`、墓碑寫一個 `gone.json`，成功後 `markSynced`；防抖、失敗不跳提示（規劃第八節）
   - 驗收：多米在「檔案 › iCloud 雲碟 › 茄記」看到一張紙一個檔案；改一行，那個檔案的修改時間會變
3. 之後 S3（下載＋合併，`mergeRemote` 已寫好）要處理：重裝時 iCloud 有資料就拿掉沒動過的教學紙
4. 有空檔可以順手做的小件：小工具拿掉自己那圈 padding（改 TSX 不用重建）

## 🗑️ 這次會話的雜訊（下次別重新討論）

- 網頁預覽窗格常常不出畫格：Reanimated 動畫、`element.scrollTo`、onLayout 在那裡都跑不了；要驗這些只能靠真機。直接改 `scrollTop`、讀 DOM 樣式還可以
- 網頁測資料前先 `globalThis.__qiejiStore.loaded = false` 再改 localStorage，否則 reload 前會被記憶體裡的狀態蓋回去
- RN 原始碼讀過：iOS 每打一個注音都會觸發 onChange（含選字中的字）；Fabric TextInput 量高用 state 的 attributedString，但在多米手機上實測不會重新量
- `npx expo install` 會自動把外掛寫進 `app.json`；Info.plist 外掛是倒著跑的（排前面的最後跑）
- 討論過但不做：CloudKit（乙）、鍵值儲存（丙）、下拉開目錄（甲做了又拿掉）、從上面拉下來的目錄面板（乙）、底部提示「做過就消失」（被教學紙取代）

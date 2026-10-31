# Handoff: 2026-11-01 手感第一輪、底部輸入框、「未命名」、第二輪（過場）、輸入框居中＋暗幕（第五包）全部寫完並 commit，五包都還沒真機

> 產出時間：2026-11-01 01:49（上一版 2026-10-31 15:55 在 `.vibe/handoff/archive/2026-10-31-1555.md`；10/31 晚上到今天凌晨一路追加的補記已併進這份）
> 前一會話的最後狀態，給下一個會話接續用
> 專案：`E:\茄記\qieji-app`（Expo SDK 58／React Native 0.88，iOS 原生 app，多米沒有 Mac）
> **測試方式**：多米用自己的開發版 app（EAS 建置、內部發佈、裝在 iPhone 17）測，`npx expo start --tunnel` 連（手機走 4G）；要回 Expo Go 加 `--go`。只改 JS 不用重建；改 `app.json`、加原生套件、升 SDK 才要重建（先 `npx expo-doctor`）。EAS 的來龍去脈在 `.vibe/EAS建置-申請與設定步驟.md`。
> **今天的四個 commit 都是純 JS，不用重建，重載就能看。**

## ✅ 這次完成了什麼

（commit 由舊到新）

- 補完 10/31 交接列的兩個文件尾巴：`03-線框/單手檢查表.md` 第 5 項、`06-首次體驗` 待答清單的 ❓D 改成「由 Return 回答」；同兩檔「點兩下」對齊成「點一下」
- 寫了 `.vibe/待審-手感極致微調清單.md`：22 項分五輪，每項附現況／改法／風險／真機看什麼／退回，第九節是 API 查證紀錄；`lessons.md` 加一條（對照網頁版抓不到「兩邊都沒有」的差）
- **手感第一輪**（commit `33eb83e`）：H1 越線的字漸亮＋越線那刻放大；H2 滑動起步不跳 14 點；H3 滑回／彈回／滑出改成接手指速度的彈簧；H4 放手那一刻就劃；D1 放下滑進落點＋`dragDrop` 震動；D2 拿起來浮起（放大 1.02＋陰影）；D3 讓位改彈簧。tokens 的 `motion` 四個時長改 `spring`、新增 `dragLand`／`dragLift`／`swipeLabel`，`HAPTIC` 加 `dragDrop`
- 沒取名的清單名「沒有名字的一張」改成「**未命名**」（commit `8c9740a`，多米定）
- **底部輸入框**（commit `b464086`，多米提的、選「照推薦做」）：新檔 `src/components/Composer.tsx`＋`Paper.tsx`。按右下 ＋、膠囊 ＋、目錄「新的一張」→ 框從底下升起、貼在鍵盤上面、跟著字長高最多四行；Return 送出一行到最上面、清單捲上去、框清空不收（可以連續記）；空的按 Return 收起；✓、點外面、開選單、滑動、切 app、換紙：有字就先變成一行再收起（字不丟）。`focusNew` 拿掉。tokens 加 `shape.composerLines`
- **手感第二輪（過場）**（commit `bc11f66`）：K2 膠囊與輸入框跟著鍵盤一起下去（`hide()` 改 `withTiming`，跑完才收底部留白）；K3 右下 ＋ 淡進淡出；K4 行長出來淡入、拿掉淡出、其他行滑到新位置（`LineRow` 的 entering／exiting／layout，新 token `motion.rowShift` 180；排順序與減少動態不滑；`LayoutAnimationConfig skipEntering` 讓整張紙第一次畫出來不播；底部提示那行跟著滑）；S2 換紙淡入（`Paper` 根 entering；`index.tsx` 包 `LayoutAnimationConfig skipEntering`，第一次打開 app 不淡）
- **輸入框居中＋暗幕**（第五包，多米 11/01 下午提、選「照推薦做」）：按 ＋ 框從底邊滑到「安全區頂到鍵盤頂」那段的正中，整個畫面同時鋪暗幕（動作表單那組 `scrim`／`sheetBackdrop`）；點暗幕＝✓（有字先送出）。**點外面不能再點到別行**。`Paper.tsx` 的 `composerStyle` 改成推鍵盤高度的一半、新樣式 `composerWrap`；沒加 token。待審清單第十一節、提案第八輪、驗收清單 C1／C5／C5b 同步
- 每個 commit 都過：check:tokens、typecheck、lint、25 個測試；網頁預覽都走過（細節見 🗑️）；設計檔同步：02-流程、03-單手、04-參數表、05-原始清單／設計版 `Tokens.ts`／詞彙表 #20「輸入框」、06-首次體驗、提案第七輪、待審清單

## 🚧 還沒做完 / 待決定

- **五包全部待真機**（第一輪、輸入框、未命名、第二輪、居中＋暗幕）。一條路走完的勾選清單在 `.vibe/真機驗收-四包-2026-11-01.md`（第五包併進第三節 C1／C5／C5b）。原始出處：第一輪在待審清單第一、二節每項的「真機看什麼」欄；輸入框在第十節末段；第二輪在第八節下方「第二輪做了的細節」；居中＋暗幕在第十一節末段。碰到 worklet、鍵盤、焦點，規矩檔的坑都在附近——多米這次定「**先真機再接第三輪**」
- ✅ **H5** 多米 2026-11-01 定**乙**（滑動完全不收鍵盤）。程式沒動，排第三輪：拿掉 `Paper.tsx` swipe `onActivate` 的 `scheduleOnRN(dismissKb)`
- **第三輪**（打字本體，待審清單第三節）：K1 點一下游標落在點的位置（用隱形 Text 的 `onTextLayout` 算）、K5 貼多行自動拆行、K6 新的一張早點升鍵盤（`freshFocusFallback` 700 改聽 `transitionEnd`）。**第四輪**兩個原生件要重建、各自一輪：K7 `react-native-keyboard-controller`（互動式收鍵盤，SDK 58 內建相容庫）、S1 `expo-splash-screen` 淡出（順便收 ❓12）。**第五輪**量了才做：E1、S3、D4、P1～P4
- E2 延遲基準從沒量過（閘門 3 第一條）：240fps 慢動作六項，量法在待審清單第六節
- 上一份交接列的仍未動：小工具上的 ＋（延伸端寫回 app 的資料共用，待審-EAS 第四節）、30 天自動清未接（`.vibe/待審-最近刪除30天自動清.md`）、閘門 1、2 未過
- 小尾巴：詞彙表 #11 的「點兩下改字（提示句）」與 `02-流程` T7 仍寫點兩下；詞彙表 #20「輸入框」名字未經使用者驗證

## 📌 關鍵決策（這次定下來的，下次別再爭論）

- 手感剩下的差距在三處：放手之後（第一輪，已做）、東西出現／消失的過場（第二輪，已做）、游標落點（第三輪）。對照網頁版只抓得到「對方有、我沒有」的差，要抓「兩邊都沒有」的差得照 2-4 的四件事（延遲、連續、物理、同步）逐項過
- 放手類動畫一律彈簧＋手指放開速度（Reanimated 4 `withSpring`：`duration`＝感知時長、`dampingRatio` 1＝不過頭、刪除滑出 `overshootClamping`）；讓位、落地也是彈簧；行的過場用時長型 `rowShift` 180（不是手推的）
- 越線的字漸亮、越線放大，是震動的「看得見的版本」（2-4 失效邊界 2）；刪除線在放手那一刻就畫，不等滑回跑完
- 震動詞彙不變；新增 `dragDrop`＝impact Light（放下一個東西）。輸入框送出不震（跟 Return 開新行不震同一個理由），＋ 按下照震
- 底部輸入框跟提案第三輪拿掉的「常駐輸入列」不同：按 ＋ 才出現、會長高到四行。一顆 ＋ 一個意思：右下 ＋、膠囊 ＋、新的一張都開它；送出的行仍插最上面並捲上去（核心迴圈第 4 格：看到才敢忘）；Return 鍵標籤跟行一樣「下一個」；提示字「記一行」
- `closeComposer` 不收鍵盤（失焦時焦點可能已經在別行，收了會把那行的鍵盤也收掉），只有 ✓ 那條（`doneComposer`）收；輸入框卸載鍵盤自己會收
- 第一次打開 app 的紙和行不播進場（交給啟動畫面）；排順序模式不給 layout 過場（會跟落地動畫打架）
- 沒取名顯示「未命名」；目錄磚與小工具沒名字也沒字時的「（無標題）」（`model.ts` 的 `label`）是另一處，多米沒提，沒動

## 📂 下個會話最重要的檔案

- `.vibe/HANDOFF.md` ← 就是這份
- `.vibe/待審-手感極致微調清單.md` ← 22 項、五輪、每項的真機看什麼與退回法；第十節是輸入框
- `src/components/Paper.tsx`：`LineRow` 的 swipe／grip 手勢與 animated style（第一輪）、`hide()`（K2）、`addLine`／`openComposer`／`sendDraft`／`closeComposer`／`doneComposer`（輸入框）、`ROW_IN`／`ROW_OUT`／`ROW_MOVE`（K4）
- `src/components/Composer.tsx`：輸入框（卡片、✓、進出動畫、對焦重試）
- `src/components/WebBars.tsx`（Fab 淡進淡出）、`src/app/index.tsx`（換紙淡入、第一次不播）
- `src/lib/tokens.ts`：`motion`（spring、rowShift）、`HAPTIC.dragDrop`、`shape.composerLines`；設計版 `.uiux/05-設計代號/Tokens.ts` 同步
- `.vibe/規矩檔.md`（三個坑：pointerEvents、worklet 叫 JS、Backspace preventDefault）、`.uiux/04-手感/參數表-暫定.md`、`.uiux/05-設計代號/00-原始清單.md` 第五／六節

## ⏭️ 下一步從哪繼續

1. 先讀這份。多米真機這四包：只改 JS，`npx expo start --tunnel` 重載即可，不用重建
2. 照待審清單各節「真機看什麼」逐項回過／不過；不過的照每項「退回」欄退（每輪一個 commit，`git revert` 就好）；彈簧數字要調都在 `tokens.ts` 的 `motion`（改完設計版 `Tokens.ts`、參數表、原始清單一起改）
3. ~~多米回 H5 甲或乙~~ 已回：乙
4. 真機過了接第三輪（K1、K5、K6、H5 乙）；之後第四輪兩個原生件各自一輪、各自重建（建置前 `npx expo-doctor`）
5. 之後要改畫面：先 `npm run check:tokens`；碰手勢、鍵盤、worklet 一定真機

## 🗑️ 這次會話的雜訊（下次別重新討論）

- 網頁預覽測手勢：先在 console 把 `Element.prototype.setPointerCapture`／`releasePointerCapture` 換成空函式、`hasPointerCapture` 回 true，再用有間隔的 `PointerEvent`（`pointerType: 'touch'`、`buttons: 1`）慢慢滑或拖；不然 RNGH 的 pointerdown 丟 NotFoundError、LogBox 蓋住畫面
- 網頁上 `.click()` 點不到包在 `Animated.View` 裡的右下 ＋，要用真的點擊（computer left_click）或 dispatch pointerdown／pointerup／click 三連發；✓ 與選單項目用 `.click()` 可以
- 網頁測 Return 送出要對輸入框 dispatch `keydown Enter`（跟行一樣）
- 網頁預覽裡 Reanimated 的進場動畫會先把元素藏一兩格（`visibility: hidden`），那時 `focus()` 無效、RNW 的 `autoFocus` 也不生效；Composer 用「沒對到就下一格再試，上限 180 格」解掉，別再查
- 網頁開發版的 Reanimated 動畫（彈簧、過場）跑得極慢（一格幾十毫秒，刪除滑出要三秒），是測試環境的事，別拿它判斷手感；真機走 UI 執行緒。K2 網頁沒鍵盤事件測不到
- `navigator.vibrate` 被瀏覽器擋是正常的（網頁版的震動）
- 這個資料夾最多五個開發伺服器；8081 被佔時 preview 會改用 8082（另一個 localStorage，資料不同）
- 不做的（理由在待審清單第七節）：滑動加阻力、音效、長按改短、`activeOffsetX` 改小、更多震動。多米已定的不重提：底部常駐輸入列、劃掉下沉、點兩下、空白區新增一行、Return 不震、∧ ∨ 跳行首、劃掉的字低對比

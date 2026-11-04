# Handoff: 11/04 雲端 iOS 模擬器跑起來了（Limrun）：拖把手修法模擬器驗過，抓到並修掉目錄拖磚不跟手；全部還沒真機，H1～H11 照舊待驗

> 產出時間：2026-11-04 11:47（電腦時鐘，+08:00）
> 專案：`E:\茄記\qieji-app`（Expo SDK 58／RN 0.88，iOS app；多米沒有 Mac、不太看程式、用開發版＋tunnel 真機測）
> 分支：`perf/feel-engine`（從 master 切出，**沒有合併、沒有推上去**；合併要問多米）
> 寫這份的是雲端模擬器那個側邊會話；主會話是 `local_276594f2-536c-499e-b079-8707829e82b2`。主會話如果之後也寫過交接，以 `git log` 新的為準
> 上一版交接：`.vibe/handoff/archive/2026-11-04-1011.md`（手感改版做了什麼、`Paper.tsx` 架構）。`2026-11-04-0820.md` 第 🚧 2～8 點（F2、D1 等提案題目、README 截圖、送審卡住的事）**都還成立**，這份不重抄

## ✅ 這次完成了什麼
- 評估雲端模擬器四條路（Expo、GitHub Actions、租 Mac、Limrun），多米選 Limrun。帳號已註冊，`lim` 已登入，金鑰在 `~/.lim/config.yaml`
- 茄記開發版跑上雲端 iPhone 模擬器（iOS 26）：EAS 建一份模擬器版（本月 4／15），JS 從本機 Metro 經 tunnel 連過去，原始碼沒上傳給 Limrun
- 拖把手考題：`2e3ebc5` 3 次都不動（紅）；`7ccedc3` 3 次都換順序（綠，`[dbg]` `ended 4 1 0`）。仿 Maestro 的快拖也是壞版紅、修好的綠
- 模擬器上過的：右滑劃掉、左滑刪除＋提示條、復原回原位、按住一行跳選單、點一行打字（游標落在點的位置）、開新的一張、關掉重開順序和字都在。H5 前後截圖差 0.00 點，H6 逐格 49 格鍵盤都在，放手時其他行不動（錄影約 30 格／秒）
- 抓到並修掉目錄跳出選單後接著拖磚不跟手（`1058605`，只動 `DirPanel.tsx`）：選單開關時切換 `zIndex`，關選單那一刻目錄被拆下來重裝，手勢被取消。修前 `canceled=true dx=22`，修後 `canceled=false dx=184`。選單暗幕、點把手、往下撥、疊成資料夾、資料夾開著點把手都回頭驗過；tsc、lint、150 條測試、裸數字檢查都過
- 坑寫進 `.vibe/規矩檔.md`（拖把手那條也算進去了），`.vibe/送審前總驗.md` 第 19 條註明修過，`.vibe/代決清單.md` 記 VoiceOver 念的順序變了，`.vibe/切片帳本.md`「進行中」加一行

## 🚧 還沒做完 / 待決定
1. **真機還沒驗（最優先）**：拖把手（總驗 H3）、目錄跳出選單後接著拖（總驗第 19 條後半）。模擬器綠不等於 iPhone 沒問題，真手指和手感只有多米驗得到
2. **`Paper.tsx` 還有 6 處暫時的 `[dbg]`**（`grep -n "\[dbg\]" src/components/Paper.tsx`），拖把手真機驗過就拿掉再提交
3. **H1～H11 只有零星回報**：多米說過「上方的行刪除很順」「切換清單沒再抱怨」，其他都還沒回。最想知道：H3 放手不閃、H5 點一行字不跳、H6 換點別行鍵盤不收（這三條模擬器上都過，手感要真機）
4. **模擬器順手看到、還沒處理**（細節在報告附錄）：
   - 把手的 `dragActivate: 1` 在 iOS 沒生效：手指走約 13 點才啟動，之後行跟手指一直差約 10 點，像是系統 pan 的起動距離。可能影響跟手感，要不要處理還沒問多米
   - 拖磚時終端機一直跳 `(ADVICE) View #… has a shadow set but cannot calculate shadow efficiently`，可能影響手感
   - 復原那行回來時 `[Reanimated] Property "opacity" ... may be overwritten by a layout animation`
5. **⋯ 選單沒測到**：開發版的齒輪浮鈕蓋在 ⋯ 和 ✓ 上。下次先在開發選單關 Tools button，或改跑 Release
6. **Limrun 點數**：茄記用了約 43 點，120 點還剩不到 77 點。整個帳號共用，11:46 時 `nienie-slime`、`doujian` 兩台模擬器還開著（別的會話開的，我沒動），每分鐘合扣 4 點，可能很快用完。用完要多米決定：每月 20 美金（500 點）、開超額每分鐘 0.12 美金（要綁卡），或改走報告裡的 GitHub／Expo 備案。目前沒綁卡
7. **測試腳本和模擬器建置設定還沒進 repo**：腳本在下面「檔案」那個筆記資料夾，`sim-dev` 設定只在暫存副本，內容寫在報告附錄。要不要收進專案還沒問多米。筆記資料夾是 app 的暫存位置，不保證久留
8. **`expo-doctor` 報 8 個套件小版本落後**：規矩是建置前要 `--fix`，這次為了跟手機開發版同版本刻意沒修。下次重建開發版前要處理，模擬器版也要跟著重建
9. **暫存副本還在**：`git worktree list` 會看到 scratchpad 下的 `wt`（`7ccedc3`，不用了）。那是專案外路徑，刪之前要問多米；刪完 `git worktree prune`
10. 手感真的都過了才走：合併 `perf/feel-engine` 回 master（問多米）→ 總驗第一到八節 → 送審那一串

## 📌 關鍵決策（定下來的，別再爭論）
- 雲端模擬器用 Limrun（多米 2026-11-04「改用 Limrun 試」）。理由：能自己排按下、等待、移動、放開，AI 能直接讀畫面和記錄，幾分鐘有結果。Expo Starter＋Maestro、租 Mac 不走，GitHub Actions 和 Expo 當備案
- 不用 `lim run`（會寫 skill 進專案、上傳原始碼、馬上扣點），不用 `lim xcode build`：模擬器版用 EAS 建，JS 走本機 Metro
- 碰手勢的改動先上雲端模擬器驗，再交多米真機。手感好不好還是只有多米真機說了算（規矩檔手感第 7 條不變）
- 手勢進行中會變的狀態，不准拿來切換 `zIndex`（`.vibe/規矩檔.md` 踩過的坑）
- 手感 > 功能多寡 > 程式好不好寫；擋到手感的定案可以推翻
- 清單引擎就是這套：行的位置只有一套（UI 執行緒的 `pos`＋位移），React 順序不決定畫面位置
- 結果當下發生，動畫只是過場：動畫完成的回呼不准放使用者要的結果

## 📂 下個會話最重要的檔案
- `.vibe/安全標準.md` ← **下一個會話必讀**（加網路、存新資料、加權限、加套件時先自查）
- `.vibe/待審-雲端模擬器自動測.md`：試驗結果、費用；附錄有重跑做法和踩到的坑
- `C:\Users\fcharlie\AppData\Local\Claude-Data\claude_pzs8sxrjxfjjc\side-session-notes\local_276594f2-536c-499e-b079-8707829e82b2\limrun-e2e\`：測試腳本（`sdk.mjs`、`exam.mjs`、`tile-final.mjs` 等）、`patch-dbg.mjs`、`evidence/`
- `.vibe/送審前總驗.md`：最上面 H1～H11、第 19 條
- `src/components/DirPanel.tsx`（`DirPanelHost` 的順序、`useDragPan`）、`src/components/Paper.tsx`（`LineList`、`Rows`、`Row`）
- `.vibe/手感診斷-2026-11-04.md`、`.vibe/網頁測試小工具.md`

## ⏭️ 下一步從哪繼續
1. **先問多米真機測了沒**：H3 拖把手、總驗第 19 條後半。還沒測就請多米把茄記從多工畫面滑掉再開（只改 JS，不用重建）。先確認 8081 上的 tunnel 還在；不在就用 run_in_terminal 在 `E:\茄記\qieji-app` 跑 `npx expo start --tunnel`，tunnel 網址會變，手機要重掃 QR
2. **拖把手真機**，用 read_terminal 讀 `[dbg]`：
   - 修好的樣子：`began` 之後等手放開才有 `grip finalize`，`ended` 的 from、to 不一樣
   - 修好了：拿掉 6 處 `[dbg]`，跑 `npm test`、`npm run typecheck`、`npm run lint`、`npm run check:tokens`，提交（坑已經寫了，不用再寫），請多米走 H1～H11
   - 還是一 `began` 就 `finalize`：模擬器綠、真機紅，差別在真手指。下一個嫌疑是 `began` 裡同一輪的 `setDragging(true)`（`scrollEnabled` 變了）。逐一暫時拿掉看 `[dbg]`，不要憑感覺改
3. **第 19 條還是不跟手**：用 `limrun-e2e/patch-dbg.mjs` 加記錄看 `deactivate canceled`，模擬器修後是 `canceled=false`
4. **之後動到手勢**：照報告附錄先跑模擬器。開之前先 `lim ios list` 看有沒有別的專案開著、點數夠不夠，一定帶 `--hard-timeout`，用完 `lim ios delete`
5. 多米回 H 幾有怪就修；動手感先讀 `[perf]`，改完貼前後對照

## 🗑️ 這次會話的雜訊（下次別重新討論）
- Expo 自訂工作、GitHub Actions、租 Mac 都只評估沒實跑，結論和價格在報告裡，不用重查
- 多米貼的文章：AgentCloud 已經收了；`@limrun/mcp-server` 在 npm 是 404，官方是 `claude mcp add --transport http limrun https://mcp.limrun.com/mcp`
- `lim ios` 指令在這台 Windows 每次多等 15 秒（背景連線起不來），測試改用 `@limrun/api` 的 SDK
- 考題拖到第 2 行不是 bug，是上面那差的 10 點；要到第 1 行得多拖過 12 點以上
- 第一版逐格分析的字位漂移是我 ffmpeg 用錯（crop 在 yuv420 上切格錯位），那份數字不算
- 網頁預覽窗格隱藏時 rAF、ResizeObserver、scroll 都不跑，看起來像程式壞了，其實是環境（`.vibe/網頁測試小工具.md`）
- `.vibe/.turn-count` 不進 git；commit 時的「LF will be replaced by CRLF」不用管

# 茄記 repo 放四個 secret：照做指南

> 寫於 2026-11-22。做一次就好，之後茄記每次用 GitHub 打包都讀這四個。
> 全程大約 5 分鐘。要用到瀏覽器和這台電腦的 PowerShell。

要放的四個，放到 `domyweb666/qieji-app`：

| 名字 | 是什麼 | 從哪來 |
|---|---|---|
| `APPLE_TEAM_ID` | 開發者團隊代號 | 已經知道：`3ZT74P4WM2` |
| `ASC_KEY_ID` | 金鑰代號，10 碼 | 第一步查 |
| `ASC_ISSUER_ID` | 發行者代號，一長串有橫線 | 第一步查 |
| `ASC_PRIVATE_KEY` | 金鑰檔的內容 | 下載資料夾裡的 `.p8` 檔 |

四個值跟你 11/16 放在豆帳的一樣。GitHub 的 secret 放進去就讀不出來，所以沒辦法從豆帳複製，只能再放一次。

---

## 第一步：到 App Store Connect 查兩個代號

1. 瀏覽器打開 https://appstoreconnect.apple.com/access/integrations/api ，登入。
   （手動走的話：右上「使用者與存取權限」→ 上面那排點「整合」→ 左邊「App Store Connect API」→「團隊金鑰」。）
2. 頁面上方有一行 **Issuer ID**，旁邊有「拷貝」。這串就是 `ASC_ISSUER_ID`，先貼到記事本。
3. 下面是金鑰列表，每一列有名稱、**金鑰 ID**、存取權限。

## 第二步：挑一把金鑰

你的下載資料夾有五個金鑰檔，檔名中間那 10 碼就是金鑰 ID：

- `AuthKey_6K69URC47Y.p8`
- `AuthKey_95S932UJWS.p8`
- `AuthKey_A8MXKF7HA2.p8`
- `AuthKey_F3286X6SY3.p8`
- `AuthKey_SL298DM552.p8`

拿網頁上的列表對這五個檔名，挑一把同時符合這三件事的：

1. 網頁的列表裡有它（列表裡沒有，代表已經撤銷，不能用）。
2. 存取權限是「管理」或「App 管理」。
3. 下載資料夾裡有它的 `.p8` 檔。

符合的不只一把時，挑豆帳、豆鍵在用的那把最保險，那把確定打得出包。列表如果有「上次使用」的日期，日期最近的那把就是（豆鍵 11/21 才打包過）。看不出來就隨便挑一把符合的，打包流程第一步會先問 Apple 金鑰對不對，不對會馬上停，不會白等。

挑好之後，那 10 碼就是 `ASC_KEY_ID`，也貼到記事本。

> 五把都不在列表裡的話：在同一頁按「＋」產生一把新的，名稱隨意，存取權限選「App 管理」，產生後下載 `.p8`。這個檔只能下載一次。

---

## 第三步：放進 GitHub

兩種做法挑一種。甲比較快；不想碰指令就用乙。

### 甲：用 PowerShell 貼四行

打開 PowerShell，一行一行貼。前三行貼之前，先把 `這裡換成…` 那段換成你的值，引號留著。

第一行不用改，直接貼：

```powershell
gh secret set APPLE_TEAM_ID --repo domyweb666/qieji-app --body "3ZT74P4WM2"
```

第二行，換成第二步挑的那 10 碼：

```powershell
gh secret set ASC_KEY_ID --repo domyweb666/qieji-app --body "這裡換成10碼金鑰ID"
```

第三行，換成第一步的 Issuer ID：

```powershell
gh secret set ASC_ISSUER_ID --repo domyweb666/qieji-app --body "這裡換成IssuerID"
```

第四行，把檔名裡的 10 碼換成同一把金鑰的：

```powershell
Get-Content "$env:USERPROFILE\Downloads\AuthKey_這裡換成10碼金鑰ID.p8" -Raw | gh secret set ASC_PRIVATE_KEY --repo domyweb666/qieji-app
```

每一行成功會回一句 `✓ Set Actions secret …`。

### 乙：用網頁貼

1. 打開 https://github.com/domyweb666/qieji-app/settings/secrets/actions
2. 按綠色的「New repository secret」。
3. Name 填名字（大小寫、底線要一模一樣），Secret 填值，按「Add secret」。
4. 重複四次：

| Name | Secret 填什麼 |
|---|---|
| `APPLE_TEAM_ID` | `3ZT74P4WM2` |
| `ASC_KEY_ID` | 第二步挑的那 10 碼 |
| `ASC_ISSUER_ID` | 第一步的 Issuer ID |
| `ASC_PRIVATE_KEY` | 用記事本打開那個 `.p8` 檔，全選、複製、整段貼上 |

`.p8` 要連第一行 `-----BEGIN PRIVATE KEY-----` 和最後一行 `-----END PRIVATE KEY-----` 一起貼。貼進去換行不見沒關係，打包流程會自己排回來。

---

## 第四步：確認四個都在

```powershell
gh secret list --repo domyweb666/qieji-app
```

要看到四列：`APPLE_TEAM_ID`、`ASC_ISSUER_ID`、`ASC_KEY_ID`、`ASC_PRIVATE_KEY`。

這個指令只確認「有放」，確認不了「值對不對」。值對不對要等第一次打包，流程的第二步「金鑰自檢」會直接問 Apple，錯了一兩分鐘內就停。

---

## 放好之後

回來跟我說「放好了」。我會先再查一次四個都在，然後等你說可以打包才推分支和 `tfs-1`。

打包前還有一件事等你決定：2.0.0 傳上去之後，12/1 的 1.1.1 可能收不進去（Apple 沒有明講，論壇兩種說法都有），而傳上去的 build 刪不掉。要先等 1.1.1 送審，還是 2.0.0 先上 TestFlight，你說了算。

---

## 常見卡點

- **`gh` 說沒登入**：先跑 `gh auth login`，選 GitHub.com、HTTPS、用瀏覽器登入。
- **第四行說找不到檔案**：檔名裡的 10 碼打錯，或那個 `.p8` 不在下載資料夾。
- **金鑰自檢失敗、回 401**：`ASC_KEY_ID`、`ASC_ISSUER_ID`、`.p8` 三個不是同一把，或那把已經撤銷。三個重放一次。
- **金鑰自檢過了、簽章那步失敗**：金鑰的存取權限不夠，換一把「管理」權限的。

import Foundation

/// 畫面上的字。照 Expo 版原樣搬，改字先對 .aso 與送審文案。
enum Words {
    static let appName = "茄記"
    static let untitled = "未命名"
    static let composerHint = "記一行"
    static let strike = "劃掉"
    static let unstrike = "恢復"
    static let struck = "已劃掉"
    static let delete = "刪除"
    static let deleteLine = "刪除這行"
    static let copy = "複製"
    static let moveUp = "往上移"
    static let moveDown = "往下移"
    static let addLine = "新增一行"
    static let commit = "記下來，收起輸入框"
    static let more = "更多"
    static let menu = "選單"
    static let rename = "改名字"
    static let renameHint = "這張叫什麼"
    static let titleField = "清單名"
    static let composerField = "輸入框"
    static let padField = "記事本內文"
    static let coverImage = "封面圖"
    // 個別上鎖（1.1 lock）
    static let lockOn = "上鎖"
    static let lockOff = "解除上鎖"
    static let lockedHere = "這張上鎖了"
    static let openLocked = "打開"
    static let unlockReason = "打開上鎖的清單"
    static let confirmReason = "確認是你本人"
    static let lockAskTitle = "把這張上鎖？"
    static let lockAskBody = "之後打開它要過 Face ID 或手機密碼。上鎖的清單只存在這支手機，不會同步到 iCloud；換手機之前要先解除上鎖。"
    static let cantLockTitle = "這支手機還不能上鎖"
    static let cantLockBody = "先到 iPhone 的「設定」打開 Face ID，或設一組手機密碼"
    static let gotIt = "知道了"
    static let lockedToast = "已上鎖"
    static let lockedKeptCloud = "已上鎖。iCloud 雲碟裡還留著上鎖前的那一份"
    static let unlockedOff = "已解除上鎖"
    // iCloud（1.1 _layout、store）
    static let cloudOff = "iCloud 雲碟沒開，紙只存在這台手機"
    static let newCloudTitle = "這個 iCloud 裡沒有你的紙"
    static let newCloudBody = "紙都還在這台手機上。可能換了 Apple ID，或「檔案」裡的茄記資料夾被刪掉了。要把這台的紙放進現在這個 iCloud 嗎？選「先不要」的話，這次只存在手機上，下次打開會再問"
    static let adoptCloud = "放進去"
    static let notNowCloud = "先不要"
    static let coverPut = "放封面圖"
    static let coverSwap = "換封面圖"
    static let coverRemove = "拿掉封面圖"
    static let coverFailTitle = "封面圖沒放成"
    static let padHint = "想到什麼就寫"
    static let returnTip = "Return 現在是換行，按 ✓ 記下來"
    static let tipHint = "點一下關掉這個提示"
    static let doneKeyboard = "完成，收起鍵盤"
    static let glyphEdit = "改磚上的字"
    static let glyphTitle = "磚上的字"
    static let glyphBody = "打一個字（emoji 也可以）；清空就用名字的第一個字"
    static let glyphHint = "一個字（清空就用名字的第一個字）"
    static let clearDone = "清掉劃掉的行"
    static let deleteNote = "刪除這張"
    static let pin = "釘選"
    static let unpin = "取消釘選"
    static let newNote = "新的一張"
    static let switchTitle = "切換清單"
    static let pinnedGroup = "已釘選"
    static let pinGroup = "釘選"
    static let newPad = "新的記事本"
    static let closeSwitch = "收起切換清單"
    static let recentGroup = "最近"
    static let allNotes = "所有清單"
    static let trash = "最近刪除"
    static let trashNotes = "刪掉的清單"
    static let trashLines = "刪掉的行"
    static let trashNote = "放滿 30 天會自動清掉"
    static let trashRule = "放滿 30 天會自動清掉。點一下可以還原或永久刪除。"
    static let restored = "已還原"
    static let emptyTrashAsk = "永久刪除這裡的所有清單和行？"
    static func emptyTrash(_ count: Int) -> String {
        "清空最近刪除（\(count)）"
    }

    static func restoreTo(_ name: String) -> String {
        "還原到「\(name)」"
    }

    static func lineFrom(_ text: String, _ name: String) -> String {
        "\(text)，原本在「\(name)」"
    }

    static let trashEmpty = "最近刪除是空的"
    static let trashEmptyTip = "刪掉的清單和行會先放在這裡 30 天，之後自動清掉"
    static let restore = "還原"
    static let deleteForever = "永久刪除"
    static let settings = "設定"
    static let done = "完成"
    static let cancel = "取消"
    static let undo = "復原"
    static let lineDeleted = "刪掉一行"
    static let movedToTrash = "已移到最近刪除"
    static func cleared(_ count: Int) -> String {
        "已把 \(count) 行移到最近刪除"
    }

    static let share = "分享"
    static let copyAll = "複製全文"
    static let copied = "已複製"
    static let reverse = "上下順序反轉"
    static let unstrikeAll = "全部恢復"
    static let pinSwapAsk = "要換掉哪一張？"
    static func pinFullTitle(_ max: Int) -> String {
        "已釘滿 \(max) 張"
    }

    static func swappedPin(_ name: String) -> String {
        "已釘選，「\(name)」已取消釘選"
    }

    static let version = "版本"
    static let colorTitle = "顏色"
    static let directory = "目錄"
    static let search = "搜尋清單"
    static let emptyPaper = "這張還是空的"
    static let emptyPaperTip = "點右下角的 ＋ 記一行"
    static let lockedNote = "這張上鎖了。這一版還不能解鎖，內容先不顯示。"
    static let saveFailed = "存檔沒成功，等一下會再試"
    static let saveFailTitle = "字還在，但沒存進手機"
    static let saveFailBody = "空間可能不夠。先別關 app，清出空間後再改一下就會重存"
    static let unreadableTitle = "手機裡原本的紙讀不出來"
    static let unreadableBody = "原本那份已經另存起來，沒有被蓋掉。開著 iCloud 的話，紙會從 iCloud 回來"
    static let fullNoticeTitle = "iCloud 同步改成完整版功能"
    static let fullNoticeBody = "手機上的紙都還在，iCloud 雲碟裡的也都還在。買了完整版之後會接著同步。"
    static let seeFull = "看看完整版"
    static let unreadable = "原本的資料讀不出來，已經另外留一份，沒有刪掉"
    static let moved = "從舊版搬過來了"
    // 目錄面板
    static let manageAll = "管理所有清單"
    static let searchAll = "搜尋"
    static let clearSearch = "清除搜尋"
    static let closeDir = "收起目錄"
    static let doneEditing = "完成編輯"
    static let moveTo = "搬到…"
    static let moveToNew = "搬到新的一張"
    static let pinned = "已釘選"
    static let unpinned = "已取消釘選"
    static let deleteAsk = "刪除"
    static let closeFolder = "收起資料夾"
    static let folderNameLabel = "資料夾名字"
    static let newFolder = "新資料夾"
    static let putIn = "放進資料夾"
    static let takeOut = "移出資料夾"
    static let moveForward = "往前移"
    static let moveBack = "往後移"
    static let closeMenu = "關閉選單"
    static func pinFull(_ max: Int) -> String {
        "已釘滿 \(max) 張，先取消一張再釘"
    }

    static func movedTo(_ name: String) -> String {
        "已搬到「\(name)」"
    }

    static func moveHead(_ line: String) -> String {
        "把「\(line)」搬到"
    }

    static func deleteTitle(_ name: String) -> String {
        "要刪除「\(name)」嗎？"
    }

    /// 搜尋結果的一行：VoiceOver 唸內容、在哪張（1.1）
    static func searchHitVoice(_ text: String, _ note: String) -> String {
        "\(text)，在「\(note)」"
    }

    static func openNoteVoice(_ note: String) -> String {
        "打開「\(note)」"
    }

    static func searchNone(_ text: String) -> String {
        "找不到含「\(text)」的清單或行"
    }

    static func searchNoneNote(_ text: String) -> String {
        "找不到含「\(text)」的清單"
    }

    static func folderVoice(_ name: String, _ count: Int) -> String {
        "資料夾，\(name)，\(count) 張"
    }

    static func pageVoice(_ page: Int, _ count: Int) -> String {
        "第 \(page) 頁，共 \(count) 頁"
    }

    static func trashVoice(_ count: Int) -> String {
        "最近刪除，\(count) 項"
    }

    static let fullOnlyControl = "控制中心的「記一行」是完整版功能"
    // 設定頁（1.1 settings.tsx）
    static let look = "外觀"
    static let textSize = "紙上的字級"
    static let groupGeneral = "一般"
    static let groupData = "資料"
    static let groupBuy = "購買"
    static let groupSupport = "支援"
    static let groupAbout = "關於"
    static let cloudSync = "iCloud 同步"
    static let cloudSyncLocked = "iCloud 同步，完整版功能"
    static let wipeRow = "清除所有資料"
    static let wipeAskTitle = "要清除所有資料嗎？"
    static let goOn = "繼續"
    static let wipeSureTitle = "真的要刪除這支手機上的所有資料？"
    static let wipeAll = "刪除所有資料"
    static let wipeCloudOn = "iCloud 同步會先關掉。iCloud 雲碟和其他裝置上的清單不會被動到，之後重新打開同步就會回來。"
    static let wipeCloudOff = "iCloud 同步現在關著，iCloud 雲碟裡原本的檔案不會被動到。"
    static let wipeNoCloud = "你沒有 iCloud 同步，刪掉之後找不回來。"
    static let wiped = "已清除這支手機上的資料"
    static let wipeFailTitle = "沒有清成功"
    static let wipeFailBody = "資料沒有被動到一半：再試一次，或把茄記滑掉重開"
    static let copyMail = "複製信箱"
    static let mailCopied = "已複製信箱"
    static let feedback = "意見回饋"
    static let rateUs = "在 App Store 給我們評分"
    static let shareApp = "分享給朋友"
    static let news = "新功能"
    static let ok = "好"
    static func newsTitle(_ version: String) -> String {
        "茄記 \(version) 的新功能"
    }

    static let family = "蔬菜家族的其他 app"
    static let getApp = "取得"
    static let privacy = "隱私權政策"
    static let madeBy = "Made by DOMYWEB"
    static let site = "DOMYWEB 網站"
    static let diagCopied = "已複製版本資訊"
    static let diagHint = "長按複製版本資訊"
    static let syncFootLocked = "完整版功能。換手機、刪掉重裝，紙都會回來。"
    static let syncFootOff = "同步關著，紙只存在這支手機。iCloud 雲碟裡原本的檔案都還在。"
    static let syncFootNoDrive = "iCloud 雲碟沒開，紙只存在這支手機。到「設定 › 你的名字 › iCloud › iCloud 雲碟」打開。"
    static let syncFootOn = "同步開著。打開茄記時會自己同步。"
    static let cantOpen = "打不開"
    static let tryLater = "等一下再試一次"
    static let cantMail = "開不了郵件"
    static let restoredPurchase = "已恢復你的購買"
    static let noPurchaseTitle = "沒有找到購買紀錄"
    static let noPurchaseBody = "這個 Apple 帳號沒有買過茄記完整版。用別的 Apple 帳號買的話，先到 App Store 換成那個帳號再試"
    static let unverifiedTitle = "Apple 傳回的購買記錄驗不過"
    static let unverifiedBody = "先當作沒買。等一下再按一次「恢復購買」"
    static let offlineTitle = "連不上 App Store"
    static func wipeAskBody(_ cloud: String) -> String {
        "這支手機上所有清單和最近刪除都會刪除，無法復原。\(cloud)"
    }

    static func mailTo(_ mail: String) -> String {
        "寫到這個信箱就可以：\(mail)"
    }

    // 付費頁（1.1 full.tsx）
    static let fullName = "茄記完整版"
    static let close = "關閉"
    static let unlocked = "已解鎖 ✓"
    static let noPrice = "連不上 App Store，價格讀不到"
    static let familyShare = "家人共享：同一個家庭群組的人不用再買"
    static let connecting = "正在連到 App Store…"
    static let tryAgain = "再試一次"
    static let readingPrice = "正在讀價格…"
    static let restorePurchase = "恢復購買"
    static let notNow = "先不用"
    static let unlockedToast = "已解鎖茄記完整版"
    static func priceOnce(_ price: String) -> String {
        "\(price)，一次付清，不是訂閱"
    }

    static func unlockWith(_ price: String) -> String {
        "用 \(price) 解鎖"
    }

    // 貼上好幾行：拆成 N 行（2.1）
    static let splitKept = "有行已經改過，沒有變回去"
    static func splitDone(_ count: Int) -> String {
        "已拆成 \(count) 行"
    }

    static func splitNoRoom(_ room: Int) -> String {
        "這張只剩 \(room) 行的空間，先不拆"
    }

    static func full(_ max: Int) -> String {
        "這張已經滿 \(max) 行，開一張新的吧"
    }
}

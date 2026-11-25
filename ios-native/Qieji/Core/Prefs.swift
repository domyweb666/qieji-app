import Foundation

/// 這支手機自己的小設定（不進紙的存檔、不同步）：外觀、字級、買了沒的快取、同步開關、看過哪些提示、評分計數……
/// 鍵名跟 1.1 的 AsyncStorage 一模一樣，值也照 1.1 存成字串。第一次打開 2.0 時，從 1.1 留在手機裡的舊檔照抄一次（舊檔只讀不改）。
final class Prefs {
    static let shared = Prefs(defaults: .standard)

    static let tipReturnKey = "qieji.tipSeen.return.v1" // ✓ 的單點提示看過了
    static let newsKey = "qieji.newsSeen.v1" // 看過哪一版的新功能卡片
    static let reviewKey = "qieji.review.v1" // 評分提示的計數（JSON）
    static let noticeKey = "qieji.fullNotice.v1" // 1.0 同步使用者看過「iCloud 同步改成完整版功能」
    static let cloudOffKey = "cn.cloudOffSeen" // 「iCloud 雲碟沒開」提示過了
    private static let importedKey = "qieji.native.prefsImported"

    /// 從 1.1 照抄的鍵
    static let legacyKeys = [
        LegacyStore.syncOffKey, LegacyStore.fullKey, LegacyStore.lookKey, LegacyStore.textSizeKey,
        tipReturnKey, newsKey, reviewKey, noticeKey, cloudOffKey,
    ]

    private let defaults: UserDefaults
    /// 這次打開是剛裝好第一次（手機上沒有任何茄記的資料）
    private(set) var firstRun = false

    init(defaults: UserDefaults) {
        self.defaults = defaults
    }

    func string(_ key: String) -> String? {
        defaults.string(forKey: key)
    }

    func set(_ key: String, _ value: String?) {
        if let value {
            defaults.set(value, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
    }

    /// 打開 app 讀完資料後叫一次（原本讀不到、後來讀到了再叫一次）。old＝1.1 的舊檔（這次沒讀到就傳 nil，會自己去找）；
    /// fresh＝手機上完全沒有茄記的資料。舊檔在但現在讀不到：這次不搬，也不記成搬過了
    func start(old: [String: String]?, fresh: Bool, dirs: [URL]) {
        firstRun = fresh
        guard !defaults.bool(forKey: Prefs.importedKey) else { return }
        var source = old ?? [:]
        if old == nil {
            switch LegacyStore.find(dirs, needBook: false) {
            case .none: break
            case let .got(found): source = found.values
            case .blocked: return
            }
        }
        for key in Prefs.legacyKeys where defaults.object(forKey: key) == nil {
            if let value = source[key] {
                defaults.set(value, forKey: key)
            }
        }
        defaults.set(true, forKey: Prefs.importedKey)
    }

    /// 1.1 的設定讀不到、使用者決定從空的開始：不知道他以前有沒有關同步，當成關著（他可以到設定打開），之後也不再搬。
    /// 回傳同步是不是因為這樣才關的
    func giveUpImport() -> Bool {
        guard !defaults.bool(forKey: Prefs.importedKey) else { return false }
        defaults.set(true, forKey: Prefs.importedKey)
        guard string(LegacyStore.syncOffKey) == nil else { return false }
        set(LegacyStore.syncOffKey, "1")
        return true
    }

    /// ✓ 的單點提示：剛裝好的人不用（他沒有「Return 會記下來」的舊習慣）；其他人一輩子一次
    var returnTipSeen: Bool {
        firstRun || string(Prefs.tipReturnKey) != nil
    }

    func markReturnTip() {
        set(Prefs.tipReturnKey, "1")
    }
}

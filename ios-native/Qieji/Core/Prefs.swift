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
    static let paperTextureKey = "qieji.paperTexture.v1" // 紙張材質（2.1 新加，1.1 沒有，不搬）
    private static let importedKey = "qieji.native.prefsImported"
    /// 還沒從 1.1 搬設定之前，在這支手機改過的鍵（使用者自己改的、app 問過 Apple 記下的）：搬的時候不准拿 1.1 的值蓋回去
    private static let touchedKey = "qieji.native.prefsTouched"

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
        noteTouched(key)
        if let value {
            defaults.set(value, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
    }

    /// 還沒搬 1.1 的設定（舊檔讀不到的那段時間）改過的鍵記下來，連「改回預設」（拿掉）也算。記在設定裡：關掉 app 再打開也認得
    private func noteTouched(_ key: String) {
        guard Prefs.legacyKeys.contains(key), !defaults.bool(forKey: Prefs.importedKey) else { return }
        var list = defaults.stringArray(forKey: Prefs.touchedKey) ?? []
        guard !list.contains(key) else { return }
        list.append(key)
        defaults.set(list, forKey: Prefs.touchedKey)
    }

    private var touched: Set<String> {
        Set(defaults.stringArray(forKey: Prefs.touchedKey) ?? [])
    }

    /// 搬過了（或不搬了）：之後改的就是平常的改，不用再記
    private func finishImport() {
        defaults.set(true, forKey: Prefs.importedKey)
        defaults.removeObject(forKey: Prefs.touchedKey)
    }

    /// 打開 app 讀完資料後叫一次（原本讀不到、後來讀到了再叫一次）。old＝1.1 的舊檔（這次沒讀到就傳 nil，會自己去找）；
    /// fresh＝手機上完全沒有茄記的資料。舊檔在但現在讀不到：這次不搬，也不記成搬過了。
    /// 這支手機上已經有的、讀不到那段時間改過的（連改回預設的）都不搬：他自己選的比 1.1 的新
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
        let mine = touched
        for key in Prefs.legacyKeys where defaults.object(forKey: key) == nil && !mine.contains(key) {
            if let value = source[key] {
                defaults.set(value, forKey: key)
            }
        }
        finishImport()
    }

    /// 1.1 的設定讀不到、使用者決定從空的開始：不知道他以前有沒有關同步，當成關著（他可以到設定打開），之後也不再搬。
    /// 讀不到的那段時間他自己動過同步開關的，照他選的。回傳同步是不是因為這樣才關的
    func giveUpImport() -> Bool {
        guard !defaults.bool(forKey: Prefs.importedKey) else { return false }
        let mine = touched
        finishImport()
        guard string(LegacyStore.syncOffKey) == nil, !mine.contains(LegacyStore.syncOffKey) else { return false }
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

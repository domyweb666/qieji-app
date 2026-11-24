import Foundation
import os

/// Swift 版自己的存檔。格式跟 Expo 版的 colornotes.v1 一模一樣（同一份 JSON），只是換個地方放：
/// Application Support/<bundle id>/QiejiNative/state.json
///
/// 第一次打開（還沒有 state.json）會去找 Expo 版的舊存檔搬過來。搬的規矩：
/// 1. 舊存檔只讀，不改、不刪。
/// 2. 讀到的原文先原封不動另存一份（from-expo.json），存成功才繼續；之後每次都只寫 state.json。
/// 3. 讀不出來的檔一律另存、不蓋掉。
final class Disk {
    enum Source: Equatable {
        case native // 讀到 Swift 版自己的存檔
        case legacy // 第一次：從 Expo 版搬過來
        case fresh // 手機上完全沒有茄記的資料
    }

    struct Loaded {
        var book: Notebook
        var source: Source
        var last: String?
        var recent: [String]
        var unreadable: Bool // 有存檔卻讀不出來，原本那份已另存
        var legacy: [String: String] // 舊版其他的設定（買了沒、同步開關、外觀、字級），原樣帶著給之後的功能用
        var frozen = false // 舊存檔沒能先另存一份：這次打開什麼都不寫，下次再試
    }

    static let log = Logger(subsystem: "org.domyweb.qieji", category: "disk")
    let dir: URL
    let legacyDirs: [URL]
    private let defaults: UserDefaults
    /// 寫檔一筆一筆排隊（背景寫的、馬上寫的都排同一條），先叫的先寫完：舊的不會蓋掉新的
    private let queue = DispatchQueue(label: "org.domyweb.qieji.disk", qos: .userInitiated)
    private var written: String? // 上次寫進去的那一份。只在 queue 上碰
    private var recentSeen: [String]? // 最近開過的，手上這份。只在主執行緒碰

    private var stateFile: URL {
        dir.appendingPathComponent("state.json")
    }

    private var expoCopy: URL {
        dir.appendingPathComponent("from-expo.json")
    }

    private var rescueFile: URL {
        dir.appendingPathComponent("unreadable.json")
    }

    init(dir: URL, legacyDirs: [URL], defaults: UserDefaults = .standard) {
        self.dir = dir
        self.legacyDirs = legacyDirs
        self.defaults = defaults
    }

    static func standard() -> Disk? {
        let bundleID = Bundle.main.bundleIdentifier ?? "org.domyweb.qieji"
        guard let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        let dir = support.appendingPathComponent(bundleID).appendingPathComponent("QiejiNative")
        return Disk(dir: dir, legacyDirs: LegacyStore.candidates(bundleID: bundleID))
    }

    // MARK: 讀

    /// 清除所有資料之後記著：不准再從 1.1 的舊存檔搬回來（舊檔只讀不改，還留在 app 裡）
    static let wipedKey = "qieji.native.wiped"

    func load(now: Double = Clock.now()) -> Loaded {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        if let raw = try? String(contentsOf: stateFile, encoding: .utf8) {
            let mine = loadNative(raw)
            // 補搬：上次打開時沒讀到舊版存檔（剛好讀不到、或舊檔後來才出現），所以手上只有一張沒動過的教學紙；
            // 這次讀得到了就照樣搬。手上已經有使用者自己的東西就不搬（不拿舊的蓋新的）；清除過所有資料也不搬
            let onlyTutorial = !mine.unreadable && mine.book.notes.allSatisfy(Tutorial.isUntouched)
            let wiped = defaults.bool(forKey: Disk.wipedKey)
            if onlyTutorial, !wiped, !FileManager.default.fileExists(atPath: expoCopy.path), let found = legacy() {
                return loadLegacy(found.raw, old: found.old)
            }
            return mine
        }
        if let found = legacy() {
            return loadLegacy(found.raw, old: found.old)
        }
        var book = Notebook()
        book.grid = Seats.gridCols // 新裝的沒有寬磚時期的空位：下次打開不准清、不准把排列時間改成現在（會蓋掉 iCloud 的排列）
        let first = Tutorial.note(now: now)
        book.notes.append(first)
        return Loaded(book: book, source: .fresh, last: first.id, recent: [], unreadable: false, legacy: [:])
    }

    /// 找 Expo 版留下來的存檔（新的位置先找）
    private func legacy() -> (raw: String, old: [String: String])? {
        for legacyDir in legacyDirs {
            if let old = LegacyStore.read(dir: legacyDir), let raw = old[LegacyStore.bookKey] {
                return (raw, old)
            }
        }
        return nil
    }

    private func loadNative(_ raw: String) -> Loaded {
        queue.sync {} // 上一份設定還在排隊的先寫完
        let last = defaults.string(forKey: LegacyStore.lastKey)
        let recent = defaults.stringArray(forKey: LegacyStore.recentKey) ?? []
        guard let book = NoteCoding.readBook(raw) else {
            // 讀不出來：原本那份另存，接下來的存檔才不會把唯一的一份蓋掉
            let saved = (try? raw.write(to: rescueFile, atomically: true, encoding: .utf8)) != nil
            Disk.log.error("state.json unreadable, rescued=\(saved)")
            return Loaded(book: Notebook(), source: .native, last: nil, recent: [], unreadable: true, legacy: [:])
        }
        queue.sync { written = raw }
        return Loaded(book: book, source: .native, last: last, recent: recent, unreadable: false, legacy: [:])
    }

    private func loadLegacy(_ raw: String, old: [String: String]) -> Loaded {
        // 原文先另存一份；存不成這次就不搬（下次打開再試），用空的資料、而且不寫檔
        let copied = FileManager.default.fileExists(atPath: expoCopy.path)
            || (try? raw.write(to: expoCopy, atomically: true, encoding: .utf8)) != nil
        var recent: [String] = []
        if let text = old[LegacyStore.recentKey], let list = JSONValue.parse(text)?.arrayValue {
            recent = list.compactMap(\.stringValue)
        }
        guard copied, let book = NoteCoding.readBook(raw) else {
            Disk.log.error("legacy store unreadable or copy failed, copied=\(copied)")
            return Loaded(
                book: Notebook(), source: .legacy, last: nil, recent: [], unreadable: true, legacy: old, frozen: !copied
            )
        }
        return Loaded(book: book, source: .legacy, last: old[LegacyStore.lastKey], recent: recent, unreadable: false, legacy: old)
    }

    // MARK: 寫

    /// 整份存檔，寫完才回來（進背景用）。前面還在背景排隊的先寫完，這一份一定是最後寫的。回傳有沒有成功
    func write(_ book: Notebook) -> Bool {
        queue.sync { put(book) }
    }

    /// 整份存檔，在背景做（打字中用，不卡畫面）。done 回主執行緒
    func writeLater(_ book: Notebook, done: @escaping (Bool) -> Void) {
        queue.async { [self] in
            let saved = put(book)
            DispatchQueue.main.async { done(saved) }
        }
    }

    /// 跟上次寫的一字不差就不再寫
    private func put(_ book: Notebook) -> Bool {
        let text = NoteCoding.write(book)
        if text == written {
            return true
        }
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try text.write(to: stateFile, atomically: true, encoding: .utf8)
            written = text
            return true
        } catch {
            written = nil
            Disk.log.error("write failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    /// 清除所有資料（只清這支手機）：另存的那幾份（從 1.1 搬過來的原文、讀不出來的那份）拿掉，最近開過的清掉，記下「清過了」
    func wipe() -> Bool {
        queue.sync {} // 還在背景排隊的先寫完
        var clean = true
        for file in [expoCopy, rescueFile] where FileManager.default.fileExists(atPath: file.path) {
            do {
                try FileManager.default.removeItem(at: file)
            } catch {
                Disk.log.error("wipe: backup not removed: \(error.localizedDescription, privacy: .public)")
                clean = false
            }
        }
        recentSeen = nil
        defaults.removeObject(forKey: LegacyStore.recentKey)
        defaults.removeObject(forKey: LegacyStore.lastKey)
        defaults.set(true, forKey: Disk.wipedKey)
        queue.sync { written = nil }
        return clean
    }

    /// 記下正在看哪一張、最近開過的。寫設定要等系統（換紙那一刻卡 3 毫秒）：先記在手上，寫的排到背景（跟存檔同一條，進背景前一定寫完）
    func rememberLast(_ id: String?) {
        var list = recent
        if let id {
            list.removeAll { $0 == id }
            list.insert(id, at: 0)
            list = Array(list.prefix(20))
            recentSeen = list
        }
        queue.async { [defaults] in
            defaults.set(id, forKey: LegacyStore.lastKey)
            if id != nil {
                defaults.set(list, forKey: LegacyStore.recentKey)
            }
        }
    }

    var recent: [String] {
        if let recentSeen {
            return recentSeen
        }
        let list = defaults.stringArray(forKey: LegacyStore.recentKey) ?? []
        recentSeen = list
        return list
    }

    func seedRecent(_ list: [String], last: String?) {
        recentSeen = nil
        if defaults.stringArray(forKey: LegacyStore.recentKey) == nil {
            defaults.set(list, forKey: LegacyStore.recentKey)
        }
        if defaults.string(forKey: LegacyStore.lastKey) == nil, let last {
            defaults.set(last, forKey: LegacyStore.lastKey)
        }
    }
}

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
    private var written: String?

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

    func load(now: Double = Clock.now()) -> Loaded {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        if let raw = try? String(contentsOf: stateFile, encoding: .utf8) {
            return loadNative(raw)
        }
        for legacyDir in legacyDirs {
            if let old = LegacyStore.read(dir: legacyDir), let raw = old[LegacyStore.bookKey] {
                return loadLegacy(raw, old: old)
            }
        }
        var book = Notebook()
        let first = Tutorial.note(now: now)
        book.notes.append(first)
        return Loaded(book: book, source: .fresh, last: first.id, recent: [], unreadable: false, legacy: [:])
    }

    private func loadNative(_ raw: String) -> Loaded {
        let last = defaults.string(forKey: LegacyStore.lastKey)
        let recent = defaults.stringArray(forKey: LegacyStore.recentKey) ?? []
        guard let book = NoteCoding.readBook(raw) else {
            // 讀不出來：原本那份另存，接下來的存檔才不會把唯一的一份蓋掉
            let saved = (try? raw.write(to: rescueFile, atomically: true, encoding: .utf8)) != nil
            Disk.log.error("state.json unreadable, rescued=\(saved)")
            return Loaded(book: Notebook(), source: .native, last: nil, recent: [], unreadable: true, legacy: [:])
        }
        written = raw
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

    /// 整份存檔。跟上次寫的一字不差就不再寫。回傳有沒有成功
    func write(_ book: Notebook) -> Bool {
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

    func rememberLast(_ id: String?) {
        defaults.set(id, forKey: LegacyStore.lastKey)
        guard let id else { return }
        var recent = defaults.stringArray(forKey: LegacyStore.recentKey) ?? []
        recent.removeAll { $0 == id }
        recent.insert(id, at: 0)
        defaults.set(Array(recent.prefix(20)), forKey: LegacyStore.recentKey)
    }

    var recent: [String] {
        defaults.stringArray(forKey: LegacyStore.recentKey) ?? []
    }

    func seedRecent(_ list: [String], last: String?) {
        if defaults.stringArray(forKey: LegacyStore.recentKey) == nil {
            defaults.set(list, forKey: LegacyStore.recentKey)
        }
        if defaults.string(forKey: LegacyStore.lastKey) == nil, let last {
            defaults.set(last, forKey: LegacyStore.lastKey)
        }
    }
}

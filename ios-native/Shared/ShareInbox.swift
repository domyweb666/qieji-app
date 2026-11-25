import Foundation
import os

/// 分享進來會放進哪一張：擴充只看得到這四樣，拿不到紙的內容。上鎖、記事本、刪掉、滿了的紙不准放這裡（安全標準）
struct ShareTarget: Codable, Equatable {
    var id: String
    var title: String
    var glyph: String
    var color: String
}

/// 分享進來的一行
struct ShareLine: Codable, Equatable {
    var id: String
    var text: String

    enum CodingKeys: String, CodingKey {
        case id
        case text = "t"
    }
}

/// 一次分享＝收件匣裡一個檔。行的 id 在分享當下就定好：併進紙之後當掉重來，認得出是同一行、不會記兩次
struct ShareEntry: Codable, Equatable {
    static let format = 1

    var version = ShareEntry.format
    var note: String? // 分享當下卡上寫的那張；沒有就讓 app 自己挑
    var at: Double // 分享的時間（毫秒）
    var lines: [ShareLine]

    enum CodingKeys: String, CodingKey {
        case version = "v"
        case note, at, lines
    }

    /// 一段字一行，由上到下；頭尾空白去掉、空的不算。一行都沒有、超過上限回 nil。
    /// 按 ✓ 的那一次只做一份：寫失敗要再寫，拿同一份去寫
    static func make(_ texts: [String], note: String?, now: Double = Clock.now()) -> ShareEntry? {
        var used = Set<String>()
        let lines = texts.map(ShareText.trim).filter { !$0.isEmpty }.map { text in
            // 同一毫秒一次定很多個 id，撞到就再抽
            var id = Ident.make(now: now)
            while !used.insert(id).inserted {
                id = Ident.make(now: now)
            }
            return ShareLine(id: id, text: text)
        }
        let entry = ShareEntry(note: note, at: now, lines: lines)
        return entry.isSound ? entry : nil
    }

    /// 寫之前、讀回來都要過這一關（收件匣的檔當外面來的資料）
    var isSound: Bool {
        version == ShareEntry.format && Clock.validTime(at) && (1 ... ShareInbox.maxLines).contains(lines.count)
            && lines.allSatisfy { ShareEntry.isID($0.id) && !ShareText.trim($0.text).isEmpty }
            && Set(lines.map(\.id)).count == lines.count
    }

    /// 9–13 個小寫英數（Ident.make 的樣子）
    static func isID(_ id: String) -> Bool {
        (9 ... 13).contains(id.utf8.count)
            && id.utf8.allSatisfy { (0x30 ... 0x39).contains($0) || (0x61 ... 0x7A).contains($0) }
    }
}

/// App Group 裡跟「分享進來」有關的兩個地方：收件匣資料夾（一次分享一個檔）、那一張的名字。
/// 擴充寫收件匣、讀名字；app 讀收件匣、寫名字。使用者的字不進 log，只寫數量與錯誤代碼
struct ShareInbox {
    /// 跟 WidgetShare.group 同一個（小工具那份沒有編進擴充）
    static let group = "group.org.domyweb.qieji"
    static let folderName = "Inbox"
    static let targetKey = "shareTarget.v1"
    /// 跟 Lines.max 同一個
    static let maxLines = 1000
    static let maxBytes = 512 * 1024
    private static let log = Logger(subsystem: "org.domyweb.qieji", category: "inbox")

    /// 收件匣在哪（還不一定存在）。第一次跟系統拿共用容器會慢：app 只在背景佇列叫
    let folder: () -> URL?
    let settings: () -> UserDefaults?

    static let app = ShareInbox(
        folder: {
            FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?
                .appendingPathComponent(folderName, isDirectory: true)
        },
        settings: { UserDefaults(suiteName: group) }
    )
    /// 什麼都不讀不寫（假資料、單元測試）
    static let off = ShareInbox(folder: { nil }, settings: { nil })

    struct Mail {
        let file: URL
        let entry: ShareEntry
    }

    // MARK: 收件匣

    /// 記下一次分享：原子寫入。寫不進去、寫了會讀不回來（太大）都回 false，呼叫的人要把字留著
    func write(_ entry: ShareEntry) -> Bool {
        guard entry.isSound, let name = entry.lines.first?.id else { return false }
        guard let dir = folder() else {
            ShareInbox.log.error("no app group container")
            return false
        }
        do {
            let data = try JSONEncoder().encode(entry)
            guard ShareInbox.parse(data) == entry else {
                ShareInbox.log.error("entry too big or not readable: \(data.count) bytes")
                return false
            }
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try data.write(
                to: dir.appendingPathComponent("\(name).json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
            return true
        } catch {
            ShareInbox.log.error("write failed: \(ShareInbox.brief(error), privacy: .public)")
            return false
        }
    }

    /// 讀得懂的，舊的在前。讀不懂的跳過、不刪、不影響其他檔
    func read() -> [Mail] {
        let files = list()
        guard !files.isEmpty else { return [] }
        let mail = files.compactMap { file in ShareInbox.load(file).map { Mail(file: file, entry: $0) } }
        if mail.count < files.count {
            ShareInbox.log.error("skipped \(files.count - mail.count) of \(files.count)")
        }
        return mail.sorted { one, two in
            one.entry.at == two.entry.at ? one.file.lastPathComponent < two.file.lastPathComponent : one.entry.at < two.entry.at
        }
    }

    /// 併好、存好了才叫
    func remove(_ mail: [Mail]) {
        var left = 0
        for one in mail where FileManager.default.fileExists(atPath: one.file.path) {
            do {
                try FileManager.default.removeItem(at: one.file)
            } catch {
                left += 1 // 留著沒關係：下次認得出是已經記過的
            }
        }
        if left > 0 {
            ShareInbox.log.error("not removed: \(left)")
        }
    }

    /// 清除所有資料：整個收件匣（連讀不懂的）和那一張的名字都拿掉。回傳有沒有清乾淨
    func wipe() -> Bool {
        setTarget(nil)
        let named = settings()?.object(forKey: ShareInbox.targetKey) != nil
        guard let dir = folder(), FileManager.default.fileExists(atPath: dir.path) else { return !named }
        do {
            try FileManager.default.removeItem(at: dir)
            return !named
        } catch {
            ShareInbox.log.error("wipe failed: \(ShareInbox.brief(error), privacy: .public)")
            return false
        }
    }

    private func list() -> [URL] {
        guard let dir = folder(), FileManager.default.fileExists(atPath: dir.path) else { return [] }
        do {
            let all = try FileManager.default.contentsOfDirectory(
                at: dir, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey], options: .skipsHiddenFiles
            )
            return all.filter { $0.pathExtension == "json" }
        } catch {
            ShareInbox.log.error("list failed: \(ShareInbox.brief(error), privacy: .public)")
            return []
        }
    }

    private static func load(_ file: URL) -> ShareEntry? {
        // 先看大小再讀：太大的不進記憶體
        guard let info = try? file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey]),
              info.isRegularFile == true, let size = info.fileSize, size <= maxBytes,
              let data = try? Data(contentsOf: file)
        else { return nil }
        return parse(data)
    }

    private static func parse(_ data: Data) -> ShareEntry? {
        guard data.count <= maxBytes, let entry = try? JSONDecoder().decode(ShareEntry.self, from: data), entry.isSound else { return nil }
        return entry
    }

    private static func brief(_ error: Error) -> String {
        let plain = error as NSError
        return "\(plain.domain) \(plain.code)"
    }

    // MARK: 那一張的名字

    func target() -> ShareTarget? {
        settings()?.data(forKey: ShareInbox.targetKey).flatMap { try? JSONDecoder().decode(ShareTarget.self, from: $0) }
    }

    /// nil＝拿掉。內容一樣不寫
    func setTarget(_ next: ShareTarget?) {
        guard let settings = settings() else { return }
        guard let next else {
            settings.removeObject(forKey: ShareInbox.targetKey)
            return
        }
        guard next != target() else { return }
        do {
            try settings.set(JSONEncoder().encode(next), forKey: ShareInbox.targetKey)
        } catch {
            // 編不出來就拿掉：寧可沒有名字，不准留著舊的（舊的那張可能已經上鎖）
            settings.removeObject(forKey: ShareInbox.targetKey)
            ShareInbox.log.error("target not encoded: \(ShareInbox.brief(error), privacy: .public)")
        }
    }
}

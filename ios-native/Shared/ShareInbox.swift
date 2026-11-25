import Foundation
import os

/// 分享進來可以放進的一張：擴充只看得到這四樣，拿不到紙的內容。上鎖、記事本、刪掉、滿了的紙不准放這裡（安全標準）
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

/// App Group 裡跟「分享進來」有關的兩個地方：收件匣資料夾（一次分享一個檔）、可選的紙單（一個檔）。
/// 擴充寫收件匣、讀紙單；app 讀收件匣、寫紙單。使用者的字不進 log，只寫數量與錯誤代碼。
/// 紙單不准放 UserDefaults：擴充的行程留著時讀到的是舊的，剛上鎖的紙名會露出來（2026-11-25 模擬器看到）
struct ShareInbox {
    /// 跟 WidgetShare.group 同一個（小工具那份沒有編進擴充）
    static let group = "group.org.domyweb.qieji"
    static let folderName = "Inbox"
    static let targetsName = "ShareTargets.json"
    /// 紙單放 UserDefaults 時的鍵：沒有出貨過，碰到就拿掉
    static let oldKeys = ["shareTargets.v1", "shareTarget.v1"]
    /// 紙單最多幾張、檔最大多大
    static let maxTargets = 20
    static let maxTargetBytes = 64 * 1024
    /// 跟 Lines.max 同一個
    static let maxLines = 1000
    static let maxBytes = 512 * 1024
    /// 一批最多看幾個檔，其餘下一批
    static let maxFiles = 50
    private static let log = Logger(subsystem: "org.domyweb.qieji", category: "inbox")

    /// 收件匣在哪（還不一定存在）。第一次跟系統拿共用容器會慢：不准在主執行緒第一次叫
    let folder: () -> URL?
    /// 只用來拿掉舊鍵
    let settings: () -> UserDefaults?
    /// 假資料、單元測試那份：本來就沒有東西，清除時算清乾淨
    var isOff = false

    static let app = ShareInbox(
        folder: {
            FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?
                .appendingPathComponent(folderName, isDirectory: true)
        },
        settings: { UserDefaults(suiteName: group) }
    )
    /// 什麼都不讀不寫（假資料、單元測試）
    static let off = ShareInbox(folder: { nil }, settings: { nil }, isOff: true)

    struct Mail {
        let file: URL
        let entry: ShareEntry
    }

    /// 讀一批的結果
    struct Batch {
        var mail: [Mail] = [] // 讀得懂的，舊的在前
        var names: Set<String> = [] // 這一批看過的檔名
        var bad: Set<String> = [] // 裡面讀不懂的（太大、格式不對）。一時讀不到的不算：下次還要再試
        var more = false // 看滿了，後面還有
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

    /// 讀一批。讀不懂的跳過、不刪、不影響其他檔。skip＝不用再看的檔名。
    /// 檔名是第一行的 id（前八碼是時間）：照檔名拿就是舊的先拿，不用為了排先後把全部讀進來
    func read(skip: Set<String> = [], limit: Int = ShareInbox.maxFiles) -> Batch {
        var out = Batch()
        var unread = 0
        let files = list().filter { !skip.contains($0.lastPathComponent) }.sorted { $0.lastPathComponent < $1.lastPathComponent }
        for file in files {
            guard out.names.count < limit else {
                out.more = true
                break
            }
            let name = file.lastPathComponent
            out.names.insert(name)
            switch ShareInbox.load(file) {
            case let .good(entry): out.mail.append(Mail(file: file, entry: entry))
            case .bad: out.bad.insert(name)
            case .unread: unread += 1
            }
        }
        if !out.bad.isEmpty || unread > 0 {
            ShareInbox.log.error("skipped: \(out.bad.count) bad, \(unread) unread of \(out.names.count)")
        }
        out.mail.sort { one, two in
            one.entry.at == two.entry.at ? one.file.lastPathComponent < two.file.lastPathComponent : one.entry.at < two.entry.at
        }
        return out
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

    /// 清除所有資料：整個收件匣（連讀不懂的）和紙單都拿掉。回傳有沒有清乾淨
    func wipe() -> Bool {
        guard !isOff else { return true }
        setTargets([])
        // 共用區拿不到就不知道裡面還有沒有字：不准說清乾淨了
        guard let settings = settings(), let dir = folder(), let names = targetsFile() else {
            ShareInbox.log.error("wipe failed: no app group container")
            return false
        }
        let left = FileManager.default.fileExists(atPath: names.path) || ShareInbox.oldKeys.contains { settings.object(forKey: $0) != nil }
        guard FileManager.default.fileExists(atPath: dir.path) else { return !left }
        do {
            try FileManager.default.removeItem(at: dir)
            return !left
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

    private enum Look {
        case good(ShareEntry), bad, unread
    }

    private static func load(_ file: URL) -> Look {
        // 先看大小再讀：太大的不進記憶體
        guard let info = try? file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey]) else { return .unread }
        guard info.isRegularFile == true, let size = info.fileSize, size <= maxBytes else { return .bad }
        guard let data = try? Data(contentsOf: file) else { return .unread }
        return parse(data).map(Look.good) ?? .bad
    }

    private static func parse(_ data: Data) -> ShareEntry? {
        guard data.count <= maxBytes, let entry = try? JSONDecoder().decode(ShareEntry.self, from: data), entry.isSound else { return nil }
        return entry
    }

    private static func brief(_ error: Error) -> String {
        let plain = error as NSError
        return "\(plain.domain) \(plain.code)"
    }

    // MARK: 可選的紙單

    /// 跟收件匣資料夾同一層
    private func targetsFile() -> URL? {
        folder()?.deletingLastPathComponent().appendingPathComponent(ShareInbox.targetsName)
    }

    /// 第一張是預設的。每次都從磁碟讀。當外面來的資料：太大、解不開回空的
    func targets() -> [ShareTarget] {
        guard let data = targetsFile().flatMap(ShareInbox.targetsData),
              let list = try? JSONDecoder().decode([ShareTarget].self, from: data) else { return [] }
        return ShareInbox.sound(list)
    }

    /// 空的＝刪檔。跟磁碟上的一樣就不寫。false＝沒寫成要的那一份，要再叫一次；寫不進去就拿掉，不准留著舊的
    @discardableResult
    func setTargets(_ next: [ShareTarget]) -> Bool {
        guard !isOff else { return true }
        dropOldKeys()
        guard let file = targetsFile() else {
            ShareInbox.log.error("targets: no app group container")
            return false
        }
        do {
            guard let data = try ShareInbox.pack(ShareInbox.sound(next)) else { return ShareInbox.clear(file) }
            // 比檔裡的原樣，不比讀回來的：讀的時候會丟掉多的，裡面說不定還留著不該在的
            guard data != ShareInbox.targetsData(file) else { return true }
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            return true
        } catch {
            ShareInbox.log.error("targets not written: \(ShareInbox.brief(error), privacy: .public)")
            _ = ShareInbox.clear(file) // 寧可沒有紙單：舊的裡面可能有剛上鎖的
            return false
        }
    }

    /// 刪檔；刪不掉就把內容換成空的。回傳裡面是不是沒有名字了
    private static func clear(_ file: URL) -> Bool {
        guard FileManager.default.fileExists(atPath: file.path) else { return true }
        do {
            try FileManager.default.removeItem(at: file)
            return true
        } catch {
            log.error("targets not removed: \(brief(error), privacy: .public)")
        }
        do {
            // 刪不掉多半是資料夾不給動，換檔（原子寫入）也不行：直接寫進原檔
            try Data("[]".utf8).write(to: file, options: .completeFileProtectionUntilFirstUserAuthentication)
            return true
        } catch {
            log.error("targets not emptied: \(brief(error), privacy: .public)")
            return false
        }
    }

    /// 有才拿：拿掉不存在的鍵也算寫一次
    private func dropOldKeys() {
        guard let settings = settings() else { return }
        for key in ShareInbox.oldKeys where settings.object(forKey: key) != nil {
            settings.removeObject(forKey: key)
        }
    }

    private static func targetsData(_ file: URL) -> Data? {
        guard let info = try? file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey]),
              info.isRegularFile == true, let size = info.fileSize, size <= maxTargetBytes else { return nil }
        return try? Data(contentsOf: file)
    }

    /// 放不下（名字沒有長度上限）就少放後面的；一張都沒有是 nil
    private static func pack(_ list: [ShareTarget]) throws -> Data? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        var list = list
        while !list.isEmpty {
            let data = try encoder.encode(list)
            if data.count <= maxTargetBytes {
                return data
            }
            list.removeLast()
        }
        return nil
    }

    /// id 空的、重複的丟掉（留前面的），最多 maxTargets 張
    private static func sound(_ list: [ShareTarget]) -> [ShareTarget] {
        var seen = Set<String>()
        return Array(list.filter { !$0.id.isEmpty && seen.insert($0.id).inserted }.prefix(maxTargets))
    }
}

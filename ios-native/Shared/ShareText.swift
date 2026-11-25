import Foundation

/// 分享進來的東西組成要記的字（4A：一則，標題一行、網址一行）。純計算，不碰畫面、不碰檔案
enum ShareText {
    /// 一則最多這麼多字（照 UTF-16 數，一個中文字算一個；一個 emoji 可能算好幾個）
    static let max = 20000

    /// title＝系統給的標題；text＝分享的文字；url＝分享的網址（只收 http、https）。組不出字回 nil
    /// - 文字＋網址＝文字一行、網址一行；有文字就不放標題
    /// - 標題＋網址＝標題一行、網址一行；沒標題就只有網址
    /// - 標題或文字裡已經有那個網址就不重複
    static func compose(title: String?, text: String?, url: URL?) -> String? {
        let link = url.flatMap(web)
        let words = trim(text ?? "")
        let head = words.isEmpty ? oneLine(title ?? "") : words
        guard let link else { return head.isEmpty ? nil : head }
        guard !head.isEmpty else { return link }
        return has(head, link) ? head : head + "\n" + link
    }

    /// 只收 http、https 而且有主機名的網址
    static func web(_ url: URL) -> String? {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let host = url.host, !host.isEmpty else { return nil }
        return url.absoluteString
    }

    /// 太長就截斷。cut＝有沒有截（卡上要講一聲）。不從一個字的中間切開
    static func clip(_ text: String) -> (text: String, cut: Bool) {
        let units = text.utf16
        guard let stop = units.index(units.startIndex, offsetBy: max, limitedBy: units.endIndex), stop < units.endIndex else {
            return (text, false)
        }
        let edge = text.rangeOfComposedCharacterSequence(at: stop).lowerBound
        if edge > text.startIndex {
            return (String(text[..<edge]), true)
        }
        // 一個「字」就超過上限（疊了幾萬個記號）：只好從碼位切
        var short = "", room = max
        for scalar in text.unicodeScalars {
            room -= scalar.utf16.count
            guard room >= 0 else { break }
            short.unicodeScalars.append(scalar)
        }
        return (short, true)
    }

    static func trim(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// 標題一律一行
    private static func oneLine(_ text: String) -> String {
        text.components(separatedBy: .newlines).map(trim).filter { !$0.isEmpty }.joined(separator: " ")
    }

    /// 字裡面已經有這個網址了（最後面的「/」有沒有都算；中文網址解開之後的寫法也算）。
    /// 只是另一個更長網址的開頭不算：拿不準就照放，重複一行好過少一個網址
    private static func has(_ text: String, _ link: String) -> Bool {
        let bare = link.hasSuffix("/") ? String(link.dropLast()) : link
        let plain = bare.removingPercentEncoding ?? bare
        return contains(text, bare) || (plain != bare && contains(text, plain))
    }

    private static func contains(_ text: String, _ link: String) -> Bool {
        var from = text.startIndex
        while let found = text.range(of: link, range: from ..< text.endIndex) {
            var rest = text[found.upperBound...]
            if rest.first == "/" {
                rest = rest.dropFirst()
            }
            guard let next = rest.first else { return true }
            if next.isWhitespace || closers.contains(next) {
                return true
            }
            from = found.upperBound
        }
        return false
    }

    /// 網址後面接著這些就是網址結束了
    private static let closers: Set<Character> = [")", ">", "]", "\"", "'", "，", "。", "、", "；", "：", "！", "？", "）", "」", "』", "》", "】"]
}

/// 分享過來的附件一樣一樣收進來，最後組成要記的字。純計算
struct ShareHaul {
    /// 系統給的標題
    var title: String?
    /// 說有文字或網址、卻沒拿到的有幾樣：面板上要講一聲
    private(set) var missed = 0
    private var texts: [String] = []
    private var links: [URL] = []

    init(title: String? = nil) {
        self.title = title
    }

    mutating func add(link: URL) {
        links.append(link)
    }

    mutating func add(text: String) {
        texts.append(text)
    }

    mutating func miss() {
        missed += 1
    }

    /// 組進去的那個網址
    var link: String? {
        links.first.flatMap(ShareText.web)
    }

    /// 要記的字；cut＝太長、後面沒拿。一個字都沒有回 nil
    func compose() -> (text: String, cut: Bool)? {
        let words = texts.map(ShareText.trim).filter { !$0.isEmpty }
        // 沒有附件可讀（有的 app 只給標題）：標題就是要記的字，換行照舊
        let body = words.isEmpty && links.isEmpty ? title : words.joined(separator: "\n")
        let main = ShareText.compose(title: title, text: body, url: links.first)
        // 規矩是只收一個網址；真的給了好幾個就一個一行接在後面，不丟
        let all = [main].compactMap { $0 } + links.dropFirst().compactMap(ShareText.web)
        return all.isEmpty ? nil : ShareText.clip(all.joined(separator: "\n"))
    }

    /// 系統給的網址：只收 http、https（檔案網址不收）
    static func link(_ item: Any?) -> URL? {
        let url: URL? = switch item {
        case let url as URL: url
        case let data as Data: URL(dataRepresentation: data, relativeTo: nil)
        case let text as String: URL(string: ShareText.trim(text))
        default: nil
        }
        return url.flatMap { ShareText.web($0) == nil ? nil : $0 }
    }

    /// 系統給的文字：空的不算；給的是檔案就不收
    static func words(_ item: Any?) -> String? {
        let text: String? = switch item {
        case let text as String: text
        case let rich as NSAttributedString: rich.string
        case let data as Data: utf8(data)
        default: nil
        }
        return text.flatMap { ShareText.trim($0).isEmpty ? nil : $0 }
    }

    /// 太大的只解前面那段（後面反正會被截掉）；從一個字中間切開時往前退到切得開的地方
    private static func utf8(_ data: Data) -> String? {
        guard data.count > ShareInbox.maxBytes else { return String(data: data, encoding: .utf8) }
        let head = data.prefix(ShareInbox.maxBytes)
        return (0 ... 3).lazy.compactMap { String(data: head.dropLast($0), encoding: .utf8) }.first
    }
}

/// 面板上要記的那段字：改過沒有、拆得出幾行、✓ 那一份。純計算
struct ShareDraft {
    /// 拿到時的字
    let start: String
    /// 跟著分享過來的網址
    let link: String?
    var text: String
    /// 上一次 ✓ 做的那份
    private var made: ShareEntry?

    init(_ start: String, link: String? = nil) {
        self.start = start
        self.link = link
        text = start
    }

    var edited: Bool {
        text != start
    }

    var isBlank: Bool {
        ShareText.trim(text).isEmpty
    }

    /// 拆成這幾行；不給拆就是空的。一行字＋分享過來的網址不給拆：那是一則
    var rows: [String] {
        guard text.contains(where: \.isNewline) else { return [] }
        let rows = LineSplit.lines(text)
        guard (2 ... ShareInbox.maxLines).contains(rows.count) else { return [] }
        if rows.count == 2, let link, rows[1].contains(link) {
            return []
        }
        return rows
    }

    /// 這次 ✓ 要寫的那一份。沒寫成再按一次：字和紙都沒變就是同一份，不會記兩次
    mutating func entry(_ texts: [String], note: String?) -> ShareEntry? {
        let next = ShareEntry.make(texts, note: note)
        if let made, let next, made.note == next.note, made.lines.map(\.text) == next.lines.map(\.text) {
            return made
        }
        made = next
        return next
    }
}

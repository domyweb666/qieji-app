import Foundation

/// 分享進來的東西組成要記的字（4A：一則，標題一行、網址一行）。純計算，不碰畫面、不碰檔案
enum ShareText {
    /// 一則最多這麼多字（照 UTF-16 數，一個中文字算一個；一個 emoji 可能算好幾個）
    static let max = 20000
    /// 附件先截到這麼長（UTF-16）再往下做：幾 MB 的字不准整份拿來比對、組字
    static let readMax = 80000

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

    /// 去掉頭尾空白，太長的先截
    static func head(_ text: String) -> (text: String, cut: Bool) {
        clip(trim(text), to: readMax)
    }

    /// 太長就截斷。cut＝有沒有截（卡上要講一聲）。不從一個字的中間切開
    static func clip(_ text: String, to limit: Int = max) -> (text: String, cut: Bool) {
        let units = text.utf16
        guard let stop = units.index(units.startIndex, offsetBy: limit, limitedBy: units.endIndex), stop < units.endIndex else {
            return (text, false)
        }
        let edge = text.rangeOfComposedCharacterSequence(at: stop).lowerBound
        if edge > text.startIndex {
            return (String(text[..<edge]), true)
        }
        // 一個「字」就超過上限（疊了幾萬個記號）：只好從碼位切
        var short = "", room = limit
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
    static func oneLine(_ text: String) -> String {
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

/// 一個附件讀出來的樣子
enum ShareBit: Equatable {
    case link(URL)
    case text(String, cut: Bool)
    case image, movie
    case missed
}

/// 讀完、組好的：面板直接拿去放
struct ShareFound: Equatable {
    /// 要記的字；沒有可以記的是 nil
    var text: String?
    var cut = false // 太長、後面沒拿
    var missed = 0
    var image = false
    var movie = false
    var link: String?
}

/// 分享過來的附件一樣一樣收進來，最後組成要記的字。純計算
struct ShareHaul {
    /// 系統給的標題
    var title: String?
    /// 說有文字或網址、卻沒拿到的有幾樣：面板上要講一聲
    private(set) var missed = 0
    private(set) var image = false // 有圖片（不收，要講一聲）
    private(set) var movie = false
    private var texts: [String] = []
    private var links: [URL] = []
    private var cut = false // 收進來的時候就截過

    init(title: String? = nil) {
        self.title = title
    }

    mutating func add(link: URL) {
        links.append(link)
    }

    mutating func add(text: String, cut: Bool = false) {
        texts.append(text)
        self.cut = self.cut || cut
    }

    mutating func miss() {
        missed += 1
    }

    /// 一個分享項目：附件（nil＝時間到了還沒讀完），加上系統另外給的標題、內文。
    /// 內文：附件裡有字就不用（那份才是全的）；沒有的話，好幾行的、跟標題不一樣的就是要記的字，其餘當標題
    mutating func add(_ bits: [ShareBit?], title: String?, content: String?) {
        let before = texts.count
        for bit in bits {
            switch bit {
            case let .link(url): add(link: url)
            case let .text(text, cut): add(text: text, cut: cut)
            case .image: image = true
            case .movie: movie = true
            case .missed, nil: miss()
            }
        }
        let name = title.map(ShareText.head).flatMap { $0.text.isEmpty ? nil : $0 }
        let body = content.map(ShareText.head).flatMap { $0.text.isEmpty ? nil : $0 }
        if let body, texts.count == before, isBody(body.text, title: name?.text) {
            add(text: body.text, cut: body.cut)
        } else if self.title == nil, let found = name ?? body {
            self.title = found.text
            cut = cut || found.cut
        }
    }

    /// 內文是不是要記的字：只是那個網址、已經收過、標題裡就有的不算
    private func isBody(_ body: String, title: String?) -> Bool {
        guard !links.contains(where: { ShareHaul.same(body, $0) }), !texts.contains(where: { $0.contains(body) }) else { return false }
        if body.contains(where: \.isNewline) {
            return true
        }
        return title.map { !ShareText.oneLine($0).contains(body) } ?? false
    }

    /// 這段字就是那個網址（最後面的「/」有沒有都算）
    private static func same(_ text: String, _ url: URL) -> Bool {
        guard let link = ShareText.web(url) else { return false }
        return text == link || text + "/" == link || text == link + "/"
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
        guard !all.isEmpty else { return nil }
        let out = ShareText.clip(all.joined(separator: "\n"))
        return (out.text, out.cut || cut)
    }

    /// 組好交給面板
    func found() -> ShareFound {
        let made = compose()
        return ShareFound(text: made?.text, cut: made?.cut ?? false, missed: missed, image: image, movie: movie, link: link)
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

    /// 系統給的文字：空的不算；給的是檔案就不收。很長的先截（cut＝截過）
    static func words(_ item: Any?) -> (text: String, cut: Bool)? {
        let text: String? = switch item {
        case let text as String: text
        case let rich as NSAttributedString: rich.string
        case let data as Data: utf8(data)
        default: nil
        }
        return text.map(ShareText.head).flatMap { $0.text.isEmpty ? nil : $0 }
    }

    /// 太大的只解前面那段（後面反正會被截掉）；從一個字中間切開時往前退到切得開的地方
    private static func utf8(_ data: Data) -> String? {
        guard data.count > ShareInbox.maxBytes else { return String(data: data, encoding: .utf8) }
        let head = data.prefix(ShareInbox.maxBytes)
        return (0 ... 3).lazy.compactMap { String(data: head.dropLast($0), encoding: .utf8) }.first
    }
}

/// 附件同時讀，讀到的照對方給的順序擺。時間到就不等了：還沒讀完的是 nil，遲到的不算
final class ShareGather {
    private let lock = NSLock()
    private var bits: [ShareBit?]
    private var left: Int
    private var done: (([ShareBit?]) -> Void)?

    private init(count: Int, done: @escaping ([ShareBit?]) -> Void) {
        bits = Array(repeating: nil, count: count)
        left = count
        self.done = done
    }

    /// 各讀各的（不在主執行緒），一樣卡住不會擋住別樣
    static func run(_ jobs: [() async -> ShareBit], limit: Double) async -> [ShareBit?] {
        guard !jobs.isEmpty else { return [] }
        return await withCheckedContinuation { next in
            let gather = ShareGather(count: jobs.count) { next.resume(returning: $0) }
            for (index, job) in jobs.enumerated() {
                Task.detached(priority: .userInitiated) {
                    let bit = await job()
                    gather.put(bit, at: index)
                }
            }
            DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + limit) { gather.close() }
        }
    }

    private func put(_ bit: ShareBit, at index: Int) {
        lock.lock()
        bits[index] = bit
        left -= 1
        let all = left == 0
        lock.unlock()
        if all {
            close()
        }
    }

    /// 只交一次
    private func close() {
        lock.lock()
        let call = done, now = bits
        done = nil
        lock.unlock()
        call?(now)
    }
}

/// 面板上要記的那段字：改過沒有、太長沒有、拆得出幾行、✓ 那一份。純計算
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

    /// 超過一則的上限：刪短了才能記（頭尾空白不算，記的時候會去掉）
    var tooLong: Bool {
        text.utf16.count > ShareText.max && ShareText.trim(text).utf16.count > ShareText.max
    }

    /// 拆成這幾行；不給拆就是空的。一行字＋分享過來的網址不給拆：那是一則
    var rows: [String] {
        guard !tooLong, text.contains(where: \.isNewline) else { return [] }
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

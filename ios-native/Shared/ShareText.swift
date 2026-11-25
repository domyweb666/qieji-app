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

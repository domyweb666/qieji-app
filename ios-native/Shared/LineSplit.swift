import Foundation

/// 「拆成 N 行」的拆法。app 的輸入框與分享擴充用同一條（2.1 從 Lines.splitPasted 搬過來，規則沒改）
enum LineSplit {
    /// 貼上帶換行的字拆成多行：去掉行首的「- • 1. 」這類清單符號、丟掉空行。符號後面緊接數字的不是清單符號（1.5 公升、-5 度）。
    /// Markdown 待辦「- [ ] 牛奶」「- [x] 蛋」的框也一起去掉（勾過的跟 ☑ 一樣，只留字）
    static func lines(_ text: String) -> [String] {
        let marker = try? NSRegularExpression(pattern: "^\\s*([-*](?!\\d)(?:\\s+\\[[ xX]\\](?=\\s|$))?|[•□☐✓☑]|\\d+[.)、](?!\\d))\\s*")
        return text.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n").compactMap { line in
            let range = NSRange(line.startIndex..., in: line)
            let bare = marker?.stringByReplacingMatches(in: line, range: range, withTemplate: "") ?? line
            let clean = bare.trimmingCharacters(in: .whitespacesAndNewlines)
            return clean.isEmpty ? nil : clean
        }
    }
}

import Foundation

/// 紙的名字、磚上的字、給人看的日期。對應 Expo 版 model.ts 的 label、glyphOf、graphemes、pickLabel、rowDate…
enum Labels {
    static func trim(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// 沒取名的紙一律叫「未命名」
    static func label(_ note: Note) -> String {
        let name = trim(note.title)
        return name.isEmpty ? Words.untitled : name
    }

    /// 磚正中間的字：自己設的，沒設就是名字的第一個字
    static func glyph(_ note: Note) -> String {
        if let own = note.glyph, !own.isEmpty {
            return own
        }
        return label(note).unicodeScalars.first.map { String($0) } ?? ""
    }

    /// 把字串切成「看起來一個字」：❤️、🇹🇼、👍🏽、👨‍👩‍👧 這類 emoji 由好幾個碼位組成，也算一個。
    /// 不用 Swift 內建的切法：要跟 Expo 版切出來一模一樣（存檔裡的 glyph 是照這個規則留的）
    static func graphemes(_ text: String) -> [String] {
        var out: [String] = []
        var afterJoin = false, flagOpen = false
        for scalar in text.unicodeScalars {
            let code = scalar.value
            let flag = code >= 0x1F1E6 && code <= 0x1F1FF
            let attach = code == 0x200D || (code >= 0xFE00 && code <= 0xFE0F) || (code >= 0x1F3FB && code <= 0x1F3FF)
                || (code >= 0x300 && code <= 0x36F) || code == 0x20E3 || (code >= 0xE0020 && code <= 0xE007F)
            if !out.isEmpty, attach || afterJoin || (flag && flagOpen) {
                out[out.count - 1].unicodeScalars.append(scalar)
            } else {
                out.append(String(scalar))
            }
            afterJoin = code == 0x200D
            flagOpen = flag && !flagOpen
        }
        return out
    }

    /// 改磚上的字：只取第一個字；清空＝回到用名字的第一個字。回傳有沒有改
    static func setGlyph(_ note: inout Note, _ text: String) -> Bool {
        let first = graphemes(trim(text)).first
        if first == note.glyph {
            return false
        }
        note.glyph = first
        return true
    }

    /// 磚上的字打超過一個：回傳要提醒的話；沒問題回 nil
    static func glyphProblem(_ text: String) -> String? {
        let count = graphemes(trim(text)).count
        return count > 1 ? "只能打一個字，現在有 \(count) 個" : nil
    }

    /// 要在選單裡分出是哪張：沒名字的寫「未命名・」＋第一行開頭
    static func pickLabel(_ note: Note) -> String {
        let name = trim(note.title)
        if !name.isEmpty {
            return name
        }
        let lines = note.isText ? note.body.components(separatedBy: "\n") : note.items.map(\.text)
        guard let first = lines.map(trim).first(where: { !$0.isEmpty }) else { return Words.untitled }
        let chars = Array(first.unicodeScalars)
        var head = String.UnicodeScalarView()
        head.append(contentsOf: chars.prefix(8))
        return "未命名・\(String(head))\(chars.count > 8 ? "…" : "")"
    }

    static func isEmpty(_ note: Note) -> Bool {
        guard trim(note.title).isEmpty else { return false }
        return note.isText ? trim(note.body).isEmpty : note.items.allSatisfy { trim($0.text).isEmpty }
    }

    /// 複製／分享用的文字：每行編號、行和行之間空一行；劃掉的行在編號後面標「（劃線）」
    static func plain(_ note: Note) -> String {
        if note.isText {
            return note.body
        }
        return note.items.filter { !trim($0.text).isEmpty }.enumerated()
            .map { "\($0.offset + 1).\($0.element.done ? "（劃線）" : "")\($0.element.text)" }
            .joined(separator: "\n\n")
    }
}

enum Dates {
    private static let week = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"]

    private static func pad(_ num: Int) -> String {
        num < 10 ? "0\(num)" : "\(num)"
    }

    /// 清單上的日期：今天寫幾點幾分、昨天、這禮拜寫星期幾，再早寫年月日
    static func row(_ stamp: Double, now: Date = Date(), calendar: Calendar = .current) -> String {
        let date = Date(timeIntervalSince1970: stamp / 1000)
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: now)).day ?? 0
        let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute, .weekday], from: date)
        if days <= 0 {
            return "\(pad(parts.hour ?? 0)):\(pad(parts.minute ?? 0))"
        }
        if days == 1 {
            return "昨天"
        }
        if days < 7 {
            return week[((parts.weekday ?? 1) - 1) % 7]
        }
        return "\(parts.year ?? 0)/\(parts.month ?? 0)/\(parts.day ?? 0)"
    }

    static func full(_ stamp: Double, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: Date(timeIntervalSince1970: stamp / 1000))
        return "\(parts.year ?? 0)/\(pad(parts.month ?? 0))/\(pad(parts.day ?? 0)) \(pad(parts.hour ?? 0)):\(pad(parts.minute ?? 0))"
    }

    static func ago(_ stamp: Double, now: Double = Clock.now()) -> String {
        let secs = (now - stamp) / 1000
        if secs < 60 {
            return "剛剛"
        }
        if secs < 3600 {
            return "\(Int(secs / 60)) 分鐘前"
        }
        if secs < 86400 {
            return "\(Int(secs / 3600)) 小時前"
        }
        if secs < 86400 * 30 {
            return "\(Int(secs / 86400)) 天前"
        }
        if secs < 86400 * 365 {
            return "\(Int(secs / 86400 / 30)) 個月前"
        }
        return "\(Int(secs / 86400 / 365)) 年前"
    }
}

import Foundation

/// 評分提示（1.1 review.ts，多米 2026-11-08 定）：劃掉一行之後、條件都到了，叫一次系統評分框。只用系統的框，不先問喜不喜歡、不拿東西換評分。
/// 計數只記在這台手機（1.1 同一個鍵、同一個格式），畫面上不顯示、不同步、不進紙的存檔。這裡是純規則，接手機的在 ReviewAsk
enum Review {
    static let days = 7 // 裝了這麼多天以上
    static let openDays = 4 // 在這麼多個不同的日子打開過
    static let strikes = 10 // 累計劃掉這麼多行以上
    static let quietDays = 14 // 看過「iCloud 同步改成完整版功能」提示框之後，這麼多天內不問
    static let day: Double = 86_400_000

    struct Stats: Equatable {
        var first: Double
        var days: [String]
        var strikes: Int
        var asked: String?
    }

    /// 手機裡存的那份讀回來：格式不對的欄位用安全的值（first 壞掉就當現在才裝，寧可晚問）
    static func read(_ raw: String?, now: Double) -> Stats {
        let dict = raw.flatMap { JSONValue.parse($0)?.objectValue } ?? [:]
        let firstRaw = dict["first"]?.numberValue ?? 0
        let first = firstRaw.isFinite && firstRaw > 0 && firstRaw <= now ? firstRaw : now
        var seen: [String] = []
        for item in dict["days"]?.arrayValue ?? [] {
            if let text = item.stringValue, !seen.contains(text) {
                seen.append(text)
            }
        }
        let count = dict["strikes"]?.numberValue ?? 0
        return Stats(
            first: first, days: Array(seen.suffix(openDays)),
            strikes: count.isFinite && count > 0 ? Int(count) : 0, asked: dict["asked"]?.stringValue
        )
    }

    static func write(_ stats: Stats) -> String {
        var dict: [String: JSONValue] = [
            "first": .number(stats.first),
            "days": .array(stats.days.map { .string($0) }),
            "strikes": .number(Double(stats.strikes)),
        ]
        dict["asked"] = stats.asked.map { .string($0) } ?? .null
        return JSONValue.object(dict).stringify()
    }

    /// 手機當地的日期（跨午夜算新的一天）
    static func dayOf(_ now: Double, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: Date(timeIntervalSince1970: now / 1000))
        let pad = { (num: Int?) in String(format: "%02d", num ?? 0) }
        return "\(parts.year ?? 0)-\(pad(parts.month))-\(pad(parts.day))"
    }

    /// 今天打開過：記一個日子（只留最近幾個，夠數就好）。回傳有沒有改
    static func markOpen(_ stats: inout Stats, now: Double) -> Bool {
        let today = dayOf(now)
        if stats.days.contains(today) {
            return false
        }
        stats.days = Array((stats.days + [today]).suffix(openDays))
        return true
    }

    /// 該不該現在問。version＝現在這版；noticeAt＝看過提示框的時間（沒看過是 nil）
    static func shouldAsk(_ stats: Stats, now: Double, version: String, noticeAt: Double?) -> Bool {
        if version.isEmpty || stats.asked == version {
            return false // 這一版問過了
        }
        if now - stats.first < Double(days) * day || stats.days.count < openDays || stats.strikes < strikes {
            return false
        }
        if let noticeAt, now - noticeAt < Double(quietDays) * day {
            return false // 剛被告知同步要付費的人，先不問
        }
        return true
    }
}

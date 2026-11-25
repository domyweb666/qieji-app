import Foundation

/// 紙上的行：刪掉進這張紙的最近刪除、放回來、清掉劃掉的行、搬到別張。對應 Expo 版 model.ts 同名的函式。
enum Lines {
    /// 一張紙最多幾行（多米 2026-11-03）
    static let max = 1000

    static func room(_ note: Note) -> Int {
        Swift.max(0, max - note.items.count)
    }

    /// 刪一行：進這張紙的最近刪除（排最前面）。回傳被移走的那行
    static func bin(_ note: inout Note, _ id: String, now: Double) -> Item? {
        guard let idx = note.items.firstIndex(where: { $0.id == id }) else { return nil }
        var item = note.items.remove(at: idx)
        item.binnedAt = now
        note.bin.insert(item, at: 0)
        return item
    }

    /// 從最近刪除放回紙上：預設放最上面，給 at 就放回那個位置
    static func unbin(_ note: inout Note, _ id: String, at: Int = 0) -> Item? {
        guard let idx = note.bin.firstIndex(where: { $0.id == id }) else { return nil }
        var item = note.bin.remove(at: idx)
        item.binnedAt = nil
        note.items.insert(item, at: Swift.max(0, Swift.min(at, note.items.count)))
        return item
    }

    /// 只把清掉的那幾行（removed）放回去，接在它原本前面那行的後面（前面那行也不在了就往前找，都不在就放最上面）。
    /// 這段時間新記的、改的、刪的都照留。已經回到紙上、在最近刪除裡的不重放。回傳放回幾行
    static func putBack(_ note: inout Note, before: [Item], removed: Set<String>) -> Int {
        let here = Set(note.items.map(\.id)), binned = Set(note.bin.map(\.id))
        var after: [String: [Item]] = [:] // 接在哪一行後面（""＝最上面）
        var anchor = "", back = 0
        for item in before {
            if here.contains(item.id) {
                anchor = item.id; continue
            }
            if !removed.contains(item.id) || binned.contains(item.id) {
                continue
            }
            after[anchor, default: []].append(item)
            back += 1
        }
        if back == 0 {
            return 0
        }
        var out = after[""] ?? []
        for item in note.items {
            out.append(item)
            if !item.id.isEmpty, let list = after[item.id] {
                out.append(contentsOf: list)
            }
        }
        note.items = out
        return back
    }

    /// 清掉劃掉的行：全部進這張紙的最近刪除，照紙上的先後排在最前面。回傳清掉的那幾行
    static func binDone(_ note: inout Note, now: Double) -> [Item] {
        var gone = note.items.filter(\.done)
        if gone.isEmpty {
            return gone
        }
        note.items.removeAll(where: \.done)
        for idx in gone.indices {
            gone[idx].binnedAt = now
        }
        note.bin.insert(contentsOf: gone, at: 0)
        return gone
    }

    /// 「清掉劃掉的行」的復原：ids 裡還在最近刪除的那幾行拿出來，照 putBack 放回原位。回傳放回幾行
    static func unbinDone(_ note: inout Note, before: [Item], ids: Set<String>) -> Int {
        var pulled: [String: Item] = [:]
        note.bin.removeAll { item in
            guard ids.contains(item.id) else { return false }
            var back = item
            back.binnedAt = nil
            pulled[item.id] = back
            return true
        }
        if pulled.isEmpty {
            return 0
        }
        return putBack(&note, before: before.map { pulled[$0.id] ?? $0 }, removed: Set(pulled.keys))
    }

    /// 貼上帶換行的字拆成多行：去掉行首的「- • 1. 」這類清單符號、丟掉空行。符號後面緊接數字的不是清單符號（1.5 公升、-5 度）。
    /// Markdown 待辦「- [ ] 牛奶」「- [x] 蛋」的框也一起去掉（勾過的跟 ☑ 一樣，只留字）
    static func splitPasted(_ text: String) -> [String] {
        let marker = try? NSRegularExpression(pattern: "^\\s*([-*](?!\\d)(?:\\s+\\[[ xX]\\](?=\\s|$))?|[•□☐✓☑]|\\d+[.)、](?!\\d))\\s*")
        return text.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n").compactMap { line in
            let range = NSRange(line.startIndex..., in: line)
            let bare = marker?.stringByReplacingMatches(in: line, range: range, withTemplate: "") ?? line
            let clean = Labels.trim(bare)
            return clean.isEmpty ? nil : clean
        }
    }
}

/// 最近刪除 30 天自動清掉。會真的刪掉使用者資料，規則是「拿不準就不刪」：
/// 只有在最近刪除裡、刪除時間可信、而且已經滿 30 天才清。
enum Trash {
    static let days = 30
    static let span: Double = 30 * 86_400_000

    /// 四條規則合在一處：時間可信、現在可信、時間不比現在晚（手機時間被調過）、已滿 30 天
    static func isExpired(at: Double?, now: Double) -> Bool {
        guard Clock.validTime(now), let at, Clock.validTime(at) else { return false }
        if at > now {
            return false
        }
        return now - at >= span
    }

    static func isExpired(_ note: Note, now: Double) -> Bool {
        note.deleted && isExpired(at: note.deletedAt, now: now)
    }

    static func markDeleted(_ note: inout Note, now: Double) {
        note.deleted = true
        note.deletedAt = now
    }

    static func markRestored(_ note: inout Note) {
        note.deleted = false
        note.deletedAt = nil
    }

    /// 沒有可信刪除時間的紙：從現在開始算 30 天。回傳補了幾張
    static func stampOld(_ notes: inout [Note], now: Double) -> Int {
        var stamped = 0
        for idx in notes.indices where notes[idx].deleted && !Clock.validTime(notes[idx].deletedAt) {
            notes[idx].deletedAt = now
            stamped += 1
        }
        return stamped
    }

    /// 刪掉的行同一套規則：沒有可信時間的補成現在。回傳補了幾行
    static func stampOldBin(_ notes: inout [Note], now: Double) -> Int {
        var stamped = 0
        for idx in notes.indices {
            for line in notes[idx].bin.indices where !Clock.validTime(notes[idx].bin[line].binnedAt) {
                notes[idx].bin[line].binnedAt = now
                stamped += 1
            }
        }
        return stamped
    }

    /// 滿 30 天的行清掉。回傳清了幾行
    static func purgeBin(_ notes: inout [Note], now: Double) -> Int {
        var removed = 0
        for idx in notes.indices {
            let before = notes[idx].bin.count
            notes[idx].bin.removeAll { isExpired(at: $0.binnedAt, now: now) }
            removed += before - notes[idx].bin.count
        }
        return removed
    }
}

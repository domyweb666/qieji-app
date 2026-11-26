import Foundation

/// iCloud 同步的資料規則：指紋、墓碑、合併。只有規則，不碰 iCloud、不碰儲存。對應 Expo 版 model.ts 的 S0 那一段。
/// 鐵則：拿不準就兩邊都留，寧可多一行、多一張，不能少。
/// 比的單位是一張紙：一邊改＝拿改的那邊；兩邊都改＝把兩邊的行合起來；永久拿掉的紙靠墓碑擋住復活。
enum Sync {
    private static let noPrint: Set<String> = ["h", "mod", "sh"]

    // MARK: 指紋

    /// FNV-1a（32 位元）照 UTF-16 一個單位一個單位算，跟 JavaScript 的 charCodeAt 同一個算法
    private static func fnv(_ text: String, seed: UInt32) -> String {
        var hash = seed
        for unit in text.utf16 {
            hash ^= UInt32(unit)
            hash = hash &* 16_777_619
        }
        let hex = String(hash, radix: 16)
        return String(repeating: "0", count: max(0, 8 - hex.count)) + hex
    }

    /// 紙的內容（不含 h、mod、sh）照鍵名排好再算。跟 Expo 版算出來一字不差：兩台才認得彼此的紙
    static func fingerprint(_ note: Note) -> String {
        let canon = NoteCoding.json(note).stringify(skip: noPrint)
        return fnv(canon, seed: 2_166_136_261) + fnv(canon, seed: 3_735_928_559)
    }

    /// 存檔前呼叫：內容變了的紙記下 mod＝現在。還沒算過指紋的（舊存檔、剛開的新紙）mod 從 updated 起算，
    /// 不然升級後第一次存檔每張紙都變成「剛剛改的」。回傳變了幾張
    @discardableResult
    static func stampMods(_ book: inout Notebook, now: Double) -> Int {
        var changed = 0
        for idx in book.notes.indices {
            let note = book.notes[idx]
            let print = PrintCache.shared.print(of: note)
            if note.hash == print {
                continue
            }
            if note.hash == nil {
                book.notes[idx].mod = Clock.validTime(note.mod) ? note.mod : (note.updated != 0 ? note.updated : now)
            } else {
                book.notes[idx].mod = now
            }
            book.notes[idx].hash = print
            changed += 1
        }
        return changed
    }

    // MARK: 墓碑

    /// 永久拿掉紙一律走這裡：拿掉、同時立墓碑。回傳拿掉的紙
    @discardableResult
    static func dropNotes(_ book: inout Notebook, now: Double, where pick: (Note) -> Bool) -> [Note] {
        var removed: [Note] = []
        book.notes.removeAll { note in
            guard pick(note) else { return false }
            removed.append(note)
            book.gone[note.id] = max(book.gone[note.id] ?? 0, now)
            return true
        }
        return removed
    }

    private static func lastTouch(_ note: Note) -> Double {
        note.mod ?? note.updated
    }

    /// 墓碑比這張紙最後一次改動還新（或一樣）＝被永久拿掉之後就沒人動過
    private static func buried(_ gone: [String: Double], _ note: Note) -> Bool {
        guard let at = gone[note.id] else { return false }
        return at >= lastTouch(note)
    }

    private static func rawTouch(_ note: Note) -> Double {
        if let mod = note.mod, Clock.validTime(mod) {
            return mod
        }
        return note.updated
    }

    /// iCloud 上這個檔案的紙已經被墓碑擋住＝可以從 iCloud 拿掉
    static func cloudFileBuried(_ gone: [String: Double], raw: JSONValue) -> Bool {
        guard let dict = raw.objectValue else { return false }
        let note = NoteCoding.note(dict)
        guard let at = gone[note.id] else { return false }
        return at >= rawTouch(note)
    }

    /// iCloud 看起來換了一個：這台有同步過的紙，iCloud 資料夾裡卻一張都沒有、墓碑也沒提到任何一張
    static func seemsNewCloud(_ book: Notebook, names: [String], gone: JSONValue?) -> Bool {
        let synced = book.notes.filter { $0.syncedHash != nil }
        if synced.isEmpty {
            return false
        }
        let there = Set(names)
        let stones = NoteCoding.gone(gone)
        return !synced.contains { there.contains("\($0.id).json") || stones[$0.id] != nil }
    }

    /// 忘掉跟舊 iCloud 對過的記號：每張紙都當成沒傳過
    static func forgetSync(_ book: inout Notebook) {
        for idx in book.notes.indices {
            book.notes[idx].syncedHash = nil
        }
        book.orderSent = nil
    }

    /// 要上傳的紙：內容跟上次傳上去的不一樣；沒動過的教學紙、上鎖的紙不傳
    static func pendingUploads(_ book: Notebook) -> [Note] {
        book.notes.filter { $0.hash != $0.syncedHash && !$0.locked && !Tutorial.isUntouched($0) }
    }

    /// iCloud 上那個檔案的指紋（上傳前比對：不是 sh 也不是 h＝別台改過、這台還沒拉下來，不能蓋）
    static func remotePrint(_ raw: JSONValue) -> String? {
        raw.objectValue.map { fingerprint(NoteCoding.note($0)) }
    }

    // MARK: 合併

    struct MergeResult: Equatable {
        var added = 0
        var taken = 0
        var united = 0
        var removed = 0
        var push: [String] = []
        var spare = 0
        var retyped: [String] = []
        var changed: Bool {
            added + taken + united + removed + spare > 0
        }
    }

    /// 兩邊都改了同一張：以比較新的那張為主，另一張多出來的行插回它原本的前一行後面；
    /// 主的那張刪掉的行不會被救回來（還在最近刪除裡）。內文不一樣就兩段都留
    private static func unite(_ main: Note, _ other: Note) -> Note {
        var items = main.items
        var seen = Set(items.map(\.id)).union(main.bin.map(\.id))
        var prev: String?
        for item in other.items {
            if !seen.contains(item.id) {
                let spot = prev.flatMap { id in items.firstIndex { $0.id == id } }.map { $0 + 1 } ?? 0
                items.insert(item, at: spot)
                seen.insert(item.id)
            }
            if items.contains(where: { $0.id == item.id }) {
                prev = item.id
            }
        }
        var out = main
        out.items = items
        out.bin = main.bin + other.bin.filter { !seen.contains($0.id) }
        if main.title.isEmpty {
            out.title = other.title
        }
        if main.body != other.body, !Labels.trim(other.body).isEmpty {
            out.body = Labels.trim(main.body).isEmpty ? other.body : main.body + "\n\n" + other.body
        }
        out.created = min(main.created, other.created)
        out.updated = max(main.updated, other.updated)
        return out
    }

    /// iCloud 上的檔案解成紙、指紋算好（id 不是字串的不理）。不碰本機資料：可以在背景做，千行的紙解一次、算一次指紋要好幾毫秒
    static func decodeCloud(_ raws: [JSONValue]) -> [Note] {
        raws.compactMap { raw in
            guard let dict = raw.objectValue, case .string = dict["id"] else { return nil }
            var note = NoteCoding.note(dict)
            note.locked = false // 上鎖只算這支手機的事，iCloud 來的檔不能把這台的紙鎖上
            note.hash = PrintCache.shared.print(of: note)
            if !Clock.validTime(note.mod) {
                note.mod = note.updated
            }
            return note
        }
    }

    /// 解好的紙整理成「每個 id 一張」：同一個 id 有兩份就留比較新的
    private static func unique(_ cloud: [Note]) -> (ids: [String], notes: [String: Note]) {
        var ids: [String] = [], notes: [String: Note] = [:]
        for note in cloud {
            if let old = notes[note.id] {
                if (note.mod ?? 0) > (old.mod ?? 0) {
                    notes[note.id] = note
                }
            } else {
                ids.append(note.id)
                notes[note.id] = note
            }
        }
        return (ids, notes)
    }

    /// 把 iCloud 上的紙與墓碑合進本機。push＝合完之後本機比 iCloud 新、要上傳的紙 id
    private static func mergeRemote(_ book: inout Notebook, cloud: [Note], gone: JSONValue?, now: Double) -> MergeResult {
        stampMods(&book, now: now)
        for (id, at) in NoteCoding.gone(gone) {
            book.gone[id] = max(book.gone[id] ?? 0, at)
        }
        let stones = book.gone
        var (order, theirs) = unique(cloud)
        var out: [Note] = []
        var res = MergeResult()
        for local in book.notes {
            guard var remote = theirs.removeValue(forKey: local.id) else {
                // iCloud 上沒有：墓碑擋住就拿掉；不然留著（還沒上傳、或 iCloud 那份還沒下載），要上傳
                if buried(stones, local) {
                    res.removed += 1; continue
                }
                out.append(local)
                if local.hash != local.syncedHash {
                    res.push.append(local.id)
                }
                continue
            }
            let newest = max(local.mod ?? 0, remote.mod ?? 0)
            if let at = stones[local.id], at >= newest {
                res.removed += 1; continue
            }
            if local.hash == remote.hash {
                var same = local
                same.syncedHash = remote.hash
                out.append(same)
                continue
            }
            if local.syncedHash != nil, local.hash == local.syncedHash {
                // 只有 iCloud 那邊改了。這台上鎖的紙內容照合，但鎖要留著
                remote.syncedHash = remote.hash
                if local.locked {
                    remote.locked = true
                }
                out.append(remote)
                res.taken += 1
                continue
            }
            if local.syncedHash != nil, remote.hash == local.syncedHash {
                out.append(local) // 只有本機改了
                res.push.append(local.id)
                continue
            }
            // 兩邊都改了（或這台從沒跟 iCloud 對過、內容又不一樣）：合起來，比兩邊都新，要上傳
            var merged = (remote.mod ?? 0) > (local.mod ?? 0) ? unite(remote, local) : unite(local, remote)
            merged.locked = local.locked
            merged.hash = fingerprint(merged)
            merged.mod = max(now, newest + 1)
            merged.syncedHash = remote.hash
            out.append(merged)
            res.push.append(merged.id)
            res.united += 1
        }
        order.removeAll { theirs[$0] == nil }
        for id in order {
            guard var remote = theirs[id], !buried(stones, remote) else { continue }
            remote.syncedHash = remote.hash
            out.append(remote)
            res.added += 1
        }
        book.notes = out
        return res
    }

    /// 把 iCloud 拉下來的東西合進本機（打開 app、回到前景、iCloud 變成可用、上傳時發現別台改過）。
    /// notes 是一個個 <id>.json 讀出來的原樣。retyped＝字被同步改掉的行（正在打字的那行要換成新字）
    static func mergeCloud(_ book: inout Notebook, notes raws: [JSONValue], gone: JSONValue?, now: Double) -> MergeResult {
        mergeCloud(&book, cloud: decodeCloud(raws), gone: gone, now: now)
    }

    /// 同上，iCloud 的檔已經在背景解好（decodeCloud）
    static func mergeCloud(_ book: inout Notebook, cloud: [Note], gone: JSONValue?, now: Double) -> MergeResult {
        let before = book.notes
        let real = cloud.filter { !Tutorial.isUntouched($0) }
        let stones = NoteCoding.gone(gone)
        // iCloud 上有真的紙（沒被墓碑擋掉的）＝重裝或換新手機：本機那張沒動過的教學紙是多的，拿掉（從沒上傳過，不立墓碑）。
        // 解好的紙 mod 讀不到時已換成 updated，跟 rawTouch 讀原檔的結果一樣
        var spare = 0
        let alive = real.contains { note in
            guard let at = stones[note.id] else { return true }
            return at < rawTouch(note)
        }
        if alive {
            let count = book.notes.count
            book.notes.removeAll(where: Tutorial.isUntouched)
            spare = count - book.notes.count
        }
        var res = mergeRemote(&book, cloud: real, gone: gone, now: now)
        res.spare = spare
        res.retyped = retyped(before: before, after: book.notes)
        return res
    }

    /// 兩份只差同步記號（指紋、指紋變的時間、上次傳上去的記號、墓碑、排列改過與傳過的時間、排列還沒跟 iCloud 對過）：畫面上看起來一模一樣
    static func onlyMarks(_ lhs: Notebook, _ rhs: Notebook) -> Bool {
        unmarked(lhs) == unmarked(rhs)
    }

    private static func unmarked(_ book: Notebook) -> Notebook {
        var out = book
        out.gone = [:]
        out.orderMod = nil
        out.orderSent = nil
        out.orderFresh = false
        for idx in out.notes.indices {
            out.notes[idx].hash = nil
            out.notes[idx].mod = nil
            out.notes[idx].syncedHash = nil
        }
        return out
    }

    private static func retyped(before: [Note], after: [Note]) -> [String] {
        var old: [String: String] = [:]
        for note in before {
            for item in note.items {
                old["\(note.id)/\(item.id)"] = item.text
            }
        }
        var out: [String] = []
        for note in after {
            for item in note.items {
                if let was = old["\(note.id)/\(item.id)"], was != item.text {
                    out.append(item.id)
                }
            }
        }
        return out
    }
}

/// 指紋不重算：內容跟上次算的時候一模一樣就沿用（一千行的紙每次存檔都從頭算會卡）。結果跟每次從頭算一樣。
/// 每張紙記最近兩份：iCloud 拉下來那份在背景算指紋時，不會把本機那份擠掉（不然合併時主執行緒又要把本機千行的紙重算一次）
final class PrintCache {
    static let shared = PrintCache()
    private static let keep = 2
    private var seen: [String: [(note: Note, print: String)]] = [:]
    private let lock = NSLock()

    func print(of note: Note) -> String {
        var bare = note
        bare.hash = nil
        bare.mod = nil
        bare.syncedHash = nil
        // 算的時候不佔著鎖：背景先算的那一趟不擋主執行緒
        lock.lock()
        let old = seen[note.id] ?? []
        lock.unlock()
        if let hit = old.first(where: { $0.note == bare }) {
            return hit.print
        }
        let fresh = Sync.fingerprint(note)
        lock.lock()
        let list = [(note: bare, print: fresh)] + (seen[note.id] ?? []).filter { $0.note != bare }
        seen[note.id] = Array(list.prefix(PrintCache.keep))
        lock.unlock()
        return fresh
    }
}

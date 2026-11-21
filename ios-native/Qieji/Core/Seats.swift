import Foundation

/// 目錄的座位表：每張紙照手排的位置放，改字不換位。對應 Expo 版 model.ts 的 C1（座位表）、換頁標記、空位。
/// 座位表裡除了紙和資料夾的 id，還有兩種記號：「|」開頭＝換頁（它後面從新的一頁開始排）、「.」開頭＝空位（佔一格、畫成空的）。
enum Seats {
    static let pinMax = 5
    static let recentMax = 5
    static let gridCols: Double = 4

    static func isBreak(_ id: String) -> Bool {
        id.hasPrefix("|")
    }

    static func isHole(_ id: String) -> Bool {
        id.hasPrefix(".")
    }

    static func newBreak() -> String {
        "|" + Ident.make()
    }

    static func newHole() -> String {
        "." + Ident.make()
    }

    /// 刪掉一張時留在它座位前面、它專用的空位：還原時還挨著就拿掉，紙站回原本那格
    static func holeFor(_ noteID: String) -> String {
        "." + noteID
    }

    // MARK: 找、排

    /// q 要先 trim、轉小寫。上鎖的紙只比名字
    static func hit(_ note: Note, _ query: String) -> Bool {
        if query.isEmpty {
            return true
        }
        let hay = note.locked ? note.title : note.title + "\n" + note.body + "\n" + note.items.map(\.text).joined(separator: "\n")
        return hay.lowercased().contains(query)
    }

    /// 穩定排序（JavaScript 的 sort 是穩定的，Swift 的不保證）：一樣的照原本先後
    static func stable<T>(_ list: [T], _ before: (T, T) -> Bool) -> [T] {
        list.enumerated().sorted { lhs, rhs in
            if before(lhs.element, rhs.element) {
                return true
            }
            if before(rhs.element, lhs.element) {
                return false
            }
            return lhs.offset < rhs.offset
        }.map(\.element)
    }

    /// C1 之前目錄的排法（釘選的在前、再照 sort）。現在只用來幫舊存檔編第一次座位
    static func visibleNotes(_ book: Notebook, trash: Bool, filter: String = "all", query: String = "", sort: String) -> [Note] {
        let needle = Labels.trim(query).lowercased()
        let notes = book.notes.filter { $0.deleted == trash && (filter == "all" || $0.color == filter) && hit($0, needle) }
        let zhTW = Locale(identifier: "zh-Hant")
        return stable(notes) { lhs, rhs in
            if !trash, lhs.pinned != rhs.pinned {
                return lhs.pinned
            }
            switch sort {
            case "created": return lhs.created > rhs.created
            case "title": return Labels.label(lhs).compare(Labels.label(rhs), locale: zhTW) == .orderedAscending
            case "color":
                let left = NoteColor.keys.firstIndex(of: lhs.color) ?? 0, right = NoteColor.keys.firstIndex(of: rhs.color) ?? 0
                return left != right ? left < right : lhs.updated > rhs.updated
            default: return lhs.updated > rhs.updated
            }
        }
    }

    private static func firstSeats(_ book: Notebook) -> [String] {
        let live = visibleNotes(book, trash: false, sort: book.sort)
        let dead = stable(book.notes.filter(\.deleted)) { $0.updated > $1.updated }
        return (live + dead).map(\.id)
    }

    /// 資料夾整理：裡面不存在的紙、重複的、已經在前一個資料夾裡的拿掉；一張都不剩的資料夾拿掉
    private static func fixFolders(_ raw: [Folder]?, ids: Set<String>) -> [Folder] {
        var used = Set<String>(), fids = Set<String>()
        var out: [Folder] = []
        for folder in raw ?? [] {
            if ids.contains(folder.id) || fids.contains(folder.id) {
                continue
            }
            let inner = folder.ids.filter { ids.contains($0) && used.insert($0).inserted }
            if inner.isEmpty {
                continue
            }
            fids.insert(folder.id)
            let name = Labels.trim(folder.name).isEmpty ? NoteCoding.folderName : folder.name
            out.append(Folder(id: folder.id, name: name, ids: inner))
        }
        return out
    }

    /// 存檔前對一次座位表：表裡有、紙沒有的座位丟掉，重複的只留第一個；紙有、表裡沒有的補在最後（最近改過的在前）。
    /// 資料夾佔一格，在資料夾裡的紙不佔格。換頁標記只留「前後都有看得到的格子」的；空位只留「同一頁後面還有看得到的格子」的。
    /// 有改才寫回，回傳有沒有改
    @discardableResult
    static func fixOrder(_ book: inout Notebook) -> Bool {
        let ids = Set(book.notes.map(\.id))
        let folders = fixFolders(book.folders, ids: ids)
        let inFolder = Set(folders.flatMap(\.ids)), fids = Set(folders.map(\.id))
        var seen = Set<String>()
        var kept = (book.order ?? firstSeats(book)).filter { id in
            let real = (ids.contains(id) && !inFolder.contains(id)) || fids.contains(id) || isBreak(id) || isHole(id)
            return real && seen.insert(id).inserted
        }
        for folder in folders where seen.insert(folder.id).inserted {
            kept.append(folder.id)
        }
        let loose = book.notes.filter { !seen.contains($0.id) && !inFolder.contains($0.id) }
        for note in stable(loose, { $0.updated > $1.updated }) {
            kept.append(note.id)
        }

        let shown = fids.union(book.notes.filter { !$0.deleted }.map(\.id))
        var order: [String] = []
        var since = false // 上一個標記（或最前面）之後有沒有看得到的格子
        var held: [String] = [] // 這一頁裡還沒等到後面有看得到的格子的空位
        for id in kept {
            if isHole(id) {
                held.append(id); continue
            }
            if !isBreak(id) {
                if shown.contains(id) {
                    order.append(contentsOf: held)
                    held = []
                    since = true
                }
                order.append(id)
                continue
            }
            held = []
            if since {
                order.append(id); since = false
            }
        }
        // 最後一個標記後面沒有看得到的格子：拿掉
        for idx in order.indices.reversed() {
            if isBreak(order[idx]) {
                order.remove(at: idx); break
            }
            if shown.contains(order[idx]) {
                break
            }
        }
        let sameFolders = folders == (book.folders ?? [])
        if let old = book.order, old == order, sameFolders {
            return false
        }
        book.order = order
        if !sameFolders {
            book.folders = folders
        }
        return true
    }

    /// 建資料夾、放進、移出、改名、拖位置都算親手排（同步時後排的那台為準）
    static func touchLayout(_ book: inout Notebook, now: Double) {
        book.orderMod = max(now, (book.orderMod ?? 0) + 1)
    }

    /// 拖完換座位：visible＝目錄裡看得到的格子排好的新順序（紙、資料夾、空位、換頁標記整排）。
    /// 看不到的（最近刪除）留在原位，還原時照樣回到附近
    static func reseat(_ book: inout Notebook, visible: [String], now: Double) {
        fixOrder(&book)
        let set = Set(visible)
        var used = 0
        let old = book.order ?? []
        var next: [String] = []
        for id in old {
            if !set.contains(id), !isHole(id), !isBreak(id) {
                next.append(id); continue
            }
            if used < visible.count {
                next.append(visible[used]); used += 1
            }
        }
        if used < visible.count {
            next.append(contentsOf: visible[used...])
        }
        book.order = next
        if next != old {
            touchLayout(&book, now: now)
        }
        fixOrder(&book)
    }

    /// 座位攤平：資料夾那一格換成它裡面的紙
    private static func flatSeats(_ book: Notebook) -> [String] {
        guard let order = book.order else { return firstSeats(book) }
        var inner: [String: [String]] = [:]
        for folder in book.folders ?? [] {
            inner[folder.id] = folder.ids
        }
        return order.flatMap { inner[$0] ?? [$0] }
    }

    /// 目錄裡的紙（不含最近刪除），照座位排；搜尋也照座位。還沒寫進座位表的先排在最後
    static func seatedNotes(_ book: Notebook, query: String = "") -> [Note] {
        var seat: [String: Int] = [:]
        for (idx, id) in flatSeats(book).enumerated() {
            seat[id] = idx
        }
        let needle = Labels.trim(query).lowercased()
        let end = seat.count
        let live = book.notes.filter { !$0.deleted && hit($0, needle) }
        return stable(live) { lhs, rhs in
            let left = seat[lhs.id] ?? end, right = seat[rhs.id] ?? end
            return left != right ? left < right : lhs.updated > rhs.updated
        }
    }

    struct LineHit: Equatable {
        var note: Note
        var title: Bool
        var lines: [Item]
    }

    /// 搜尋：照目錄的座位順序，每張列出名字有沒有中、中了哪幾行。上鎖的紙只比名字
    static func searchLines(_ book: Notebook, query: String) -> [LineHit] {
        let needle = Labels.trim(query).lowercased()
        if needle.isEmpty {
            return []
        }
        return seatedNotes(book, query: needle).map { note in
            var lines: [Item] = []
            if !note.locked {
                lines = note.items.filter { $0.text.lowercased().contains(needle) }
                if !note.body.isEmpty, note.body.lowercased().contains(needle) {
                    lines.append(Item(id: "", text: note.body))
                }
            }
            return LineHit(note: note, title: note.title.lowercased().contains(needle), lines: lines)
        }
    }

    // MARK: 換張用的名單

    static func pinned(_ book: Notebook) -> [Note] {
        Array(stable(book.notes.filter { $0.pinned && !$0.deleted }) { $0.created < $1.created }.prefix(pinMax))
    }

    /// 切換清單：釘選的全部（照建立先後），再來最近開過的幾張；一張都沒記到就用最近改過的補
    static func switchList(_ book: Notebook, recent: [String]) -> (pinned: [Note], recent: [Note]) {
        let pins = pinned(book)
        var seen = Set(pins.map(\.id))
        var out: [Note] = []
        func take(_ note: Note?) {
            guard let note, !note.deleted, out.count < recentMax, seen.insert(note.id).inserted else { return }
            out.append(note)
        }
        for id in recent {
            take(book.note(id))
        }
        for note in stable(book.notes.filter { !$0.deleted && !seen.contains($0.id) }, { $0.updated > $1.updated }) {
            take(note)
        }
        return (pins, out)
    }

    // MARK: 目錄的格子

    /// 目錄最上層的一格：一張紙、一個資料夾（notes＝裡面看得到的紙）、換頁標記或空位
    struct Entry: Equatable, Identifiable {
        var id: String
        var note: Note?
        var folder: Folder?
        var notes: [Note] = []
        var isBreak = false
        var isHole = false
    }

    static func folderOf(_ book: Notebook, _ noteID: String) -> Folder? {
        (book.folders ?? []).first { $0.ids.contains(noteID) }
    }

    static func seatedEntries(_ book: Notebook) -> [Entry] {
        var owner: [String: Folder] = [:]
        for folder in book.folders ?? [] {
            for id in folder.ids where owner[id] == nil {
                owner[id] = folder
            }
        }
        var out: [Entry] = []
        var open: [String: Int] = [:]
        for note in seatedNotes(book) {
            guard let folder = owner[note.id] else {
                out.append(Entry(id: note.id, note: note, notes: [note]))
                continue
            }
            if let idx = open[folder.id] {
                out[idx].notes.append(note); continue
            }
            open[folder.id] = out.count
            out.append(Entry(id: folder.id, folder: folder, notes: [note]))
        }
        return out
    }

    /// 目錄格子：seatedEntries 再把換頁標記、空位照座位表的位置插進來（頁尾的空位、最前面的標記不插）
    static func seatedLayout(_ book: Notebook) -> [Entry] {
        let all = seatedEntries(book)
        guard let order = book.order else { return all }
        var pos: [String: Int] = [:]
        for (idx, id) in order.enumerated() {
            pos[id] = idx
        }
        let marks = order.enumerated().filter { isBreak($0.element) || isHole($0.element) }
        var out: [Entry] = []
        var next = 0
        for entry in all {
            let spot = pos[entry.id] ?? Int.max
            var cut: String?
            var held: [Entry] = []
            while next < marks.count, marks[next].offset < spot {
                let id = marks[next].element
                next += 1
                if isBreak(id) {
                    cut = id
                    held = []
                } else {
                    held.append(Entry(id: id, isHole: true))
                }
            }
            if let cut, !out.isEmpty {
                out.append(Entry(id: cut, isBreak: true))
            }
            out.append(contentsOf: held)
            out.append(entry)
        }
        return out
    }

    /// 磚改成一排四個時，寬磚時期留的空位、換頁標記清掉一次（記在 grid）。算親手排
    @discardableResult
    static func packGrid(_ book: inout Notebook, now: Double) -> Bool {
        if book.grid == gridCols {
            return false
        }
        book.grid = gridCols
        if let order = book.order {
            book.order = order.filter { !isHole($0) && !isBreak($0) }
        }
        touchLayout(&book, now: now)
        fixOrder(&book)
        return true
    }
}

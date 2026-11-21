import Foundation

/// 資料夾、空位、目錄排列的同步。對應 Expo 版 model.ts 的 D1（資料夾）、自由擺放、C2（排列同步）。
extension Seats {
    private static func removeFromFolder(_ book: inout Notebook, folderID: String, noteID: String) {
        guard let idx = book.folders?.firstIndex(where: { $0.id == folderID }) else { return }
        book.folders?[idx].ids.removeAll { $0 == noteID }
    }

    /// 從資料夾拿走一張之後：看得到的只剩一張就拆掉資料夾，剩下的紙照原本順序站在資料夾那格。
    /// 全部在最近刪除的不拆（還原時才回得來）
    private static func dissolveIfOne(_ book: inout Notebook, folderID: String) {
        guard let folder = book.folders?.first(where: { $0.id == folderID }) else { return }
        let shown = folder.ids.filter { id in book.notes.contains { $0.id == id && !$0.deleted } }
        guard shown.count == 1, let spot = book.order?.firstIndex(of: folderID) else { return }
        book.order?.replaceSubrange(spot ... spot, with: folder.ids)
        book.folders?.removeAll { $0.id == folderID }
    }

    private static func leaveOldFolder(_ book: inout Notebook, noteID: String) {
        guard let from = folderOf(book, noteID) else { return }
        removeFromFolder(&book, folderID: from.id, noteID: noteID)
        dissolveIfOne(&book, folderID: from.id)
    }

    /// 新資料夾：在那張紙的位置開一個資料夾，裡面只有它
    @discardableResult
    static func newFolder(_ book: inout Notebook, noteID: String, now: Double, id: String = "f" + Ident.make()) -> Folder {
        fixOrder(&book)
        let folder = Folder(id: id, name: NoteCoding.folderName, ids: [noteID])
        leaveOldFolder(&book, noteID: noteID)
        if let spot = book.order?.firstIndex(of: noteID) { book.order?[spot] = id } else { book.order?.append(id) }
        book.folders = (book.folders ?? []) + [folder]
        touchLayout(&book, now: now)
        fixOrder(&book)
        return folder
    }

    /// 放進現有的資料夾：排在裡面最後一張。leave＝原本那格留空位
    @discardableResult
    static func intoFolder(_ book: inout Notebook, noteID: String, folderID: String, now: Double, leave: Bool = true) -> Bool {
        fixOrder(&book)
        guard let target = book.folders?.first(where: { $0.id == folderID }), !target.ids.contains(noteID) else { return false }
        leaveOldFolder(&book, noteID: noteID)
        let order = book.order ?? []
        book.order = leave ? order.map { $0 == noteID ? newHole() : $0 } : order.filter { $0 != noteID }
        if let idx = book.folders?.firstIndex(where: { $0.id == folderID }) { book.folders?[idx].ids.append(noteID) }
        touchLayout(&book, now: now)
        fixOrder(&book)
        return true
    }

    /// 移出資料夾：hole＝放進這個空位、after＝排在這格後面；沒給就排在資料夾後面一格。
    /// 是最後一張就資料夾拿掉、紙站在資料夾原本的位置
    @discardableResult
    static func outOfFolder(_ book: inout Notebook, noteID: String, now: Double, hole: String? = nil, after: String? = nil) -> Bool {
        fixOrder(&book)
        guard let folder = folderOf(book, noteID) else { return false }
        removeFromFolder(&book, folderID: folder.id, noteID: noteID)
        let spot = book.order?.firstIndex(of: folder.id)
        if folder.ids.count > 1 {
            let holeSpot = hole.flatMap { isHole($0) ? book.order?.firstIndex(of: $0) : nil }
            let afterSpot = after.flatMap { book.order?.firstIndex(of: $0) }
            if let holeSpot {
                book.order?[holeSpot] = noteID
            } else {
                book.order?.insert(noteID, at: ((afterSpot ?? spot) ?? -1) + 1)
            }
            dissolveIfOne(&book, folderID: folder.id)
        } else {
            if let spot { book.order?[spot] = noteID }
            book.folders?.removeAll { $0.id == folder.id }
        }
        touchLayout(&book, now: now)
        fixOrder(&book)
        return true
    }

    /// 新的一張放進目錄指定的位置（空位、或某一格後面）。沒給、找不到就不放（存檔時排最後）。回傳有沒有放
    @discardableResult
    static func seatNew(_ book: inout Notebook, noteID: String, now: Double, hole: String? = nil, after: String? = nil) -> Bool {
        fixOrder(&book)
        let order = book.order ?? []
        let holeOK = hole.map { isHole($0) && order.contains($0) } ?? false
        let afterOK = after.map { $0 != noteID && order.contains($0) } ?? false
        if !holeOK, !afterOK { return false }
        var next = order.filter { $0 != noteID }
        if holeOK, let hole, let spot = next.firstIndex(of: hole) {
            next[spot] = noteID
        } else if let after, let spot = next.firstIndex(of: after) {
            next.insert(noteID, at: spot + 1)
        }
        book.order = next
        touchLayout(&book, now: now)
        fixOrder(&book)
        return true
    }

    /// 切換清單的「新的一張」放哪：目錄裡第一個空位；沒有空位就不放
    @discardableResult
    static func seatFirstHole(_ book: inout Notebook, noteID: String, now: Double) -> Bool {
        guard let hole = seatedLayout(book).first(where: \.isHole) else { return false }
        return seatNew(&book, noteID: noteID, now: now, hole: hole.id)
    }

    /// 刪掉一張（進最近刪除）時：在它的座位前面放它專用的空位。在資料夾裡的、已經有的不放
    @discardableResult
    static func leaveHole(_ book: inout Notebook, noteID: String, now: Double) -> Bool {
        fixOrder(&book)
        guard let spot = book.order?.firstIndex(of: noteID), book.order?.contains(holeFor(noteID)) == false else { return false }
        book.order?.insert(holeFor(noteID), at: spot)
        touchLayout(&book, now: now)
        fixOrder(&book)
        return true
    }

    /// 還原時：它專用的空位還挨著它（中間只隔著別張最近刪除的、別的空位）就拿掉，紙站回那格
    @discardableResult
    static func fillHole(_ book: inout Notebook, noteID: String, now: Double) -> Bool {
        fixOrder(&book)
        guard let order = book.order, let spot = order.firstIndex(of: noteID),
              let holeSpot = order.firstIndex(of: holeFor(noteID)) else { return false }
        let between = order[(min(spot, holeSpot) + 1) ..< max(spot, holeSpot)]
        let clear = between.allSatisfy { id in isHole(id) || book.notes.contains { $0.id == id && $0.deleted } }
        if !clear { return false }
        book.order?.remove(at: holeSpot)
        touchLayout(&book, now: now)
        fixOrder(&book)
        return true
    }

    /// 把紙放進資料夾的指定位置，也用來在資料夾裡換順序。visible＝放完之後資料夾裡看得到的紙想要的順序
    @discardableResult
    static func placeInFolder(_ book: inout Notebook, noteID: String, folderID: String, visible: [String], now: Double) -> Bool {
        fixOrder(&book)
        guard let folder = book.folders?.first(where: { $0.id == folderID }), visible.contains(noteID),
              book.folders?.contains(where: { $0.id == noteID }) == false else { return false }
        // 先驗再動：visible 只能有這張和這個資料夾原本的紙、不重複
        if Set(visible).count != visible.count || visible.contains(where: { $0 != noteID && !folder.ids.contains($0) }) { return false }
        if !folder.ids.contains(noteID), !intoFolder(&book, noteID: noteID, folderID: folderID, now: now) { return false }
        guard let idx = book.folders?.firstIndex(where: { $0.id == folderID }), let ids = book.folders?[idx].ids else { return false }
        let set = Set(visible)
        var used = 0
        book.folders?[idx].ids = ids.map { id in
            guard set.contains(id), used < visible.count else { return id }
            used += 1
            return visible[used - 1]
        }
        touchLayout(&book, now: now)
        fixOrder(&book)
        return true
    }

    /// 把紙放到目錄的指定位置；在資料夾裡的先拿出來
    static func placeTop(_ book: inout Notebook, noteID: String, visible: [String], now: Double) {
        if folderOf(book, noteID) != nil { outOfFolder(&book, noteID: noteID, now: now) }
        reseat(&book, visible: visible, now: now)
        touchLayout(&book, now: now)
    }

    /// 改資料夾名：清空或沒變就不改
    @discardableResult
    static func renameFolder(_ book: inout Notebook, folderID: String, name: String, now: Double) -> Bool {
        guard let idx = book.folders?.firstIndex(where: { $0.id == folderID }) else { return false }
        if Labels.trim(name).isEmpty || name == book.folders?[idx].name { return false }
        book.folders?[idx].name = name
        touchLayout(&book, now: now)
        return true
    }

    // MARK: 目錄排列同步（iCloud 上的 layout.json：{ order, mod, folders }）

    struct Layout: Equatable {
        var order: [String]
        var mod: Double
        var folders: [Folder]

        var json: JSONValue {
            .object([
                "order": .array(order.map { .string($0) }), "mod": .number(mod),
                "folders": .array(folders.map(NoteCoding.json)),
            ])
        }
    }

    /// 拉 iCloud 時 layout.json 的三種情況
    enum LayoutFetch {
        case missing // 沒有這個檔
        case unreadable // 有這個檔但這次讀不到（還沒下載、逾時）
        case found(JSONValue)
    }

    /// 外面讀進來的 layout.json 先驗：格式不對回 nil（當成 iCloud 上沒有）
    static func readLayout(_ raw: JSONValue?) -> Layout? {
        guard let dict = raw?.objectValue, let order = dict["order"]?.arrayValue,
              let mod = dict["mod"]?.numberValue, mod.isFinite, mod >= 0 else { return nil }
        let folders: [Folder] = (dict["folders"]?.arrayValue ?? []).compactMap { val in
            guard let inner = val.objectValue, let id = inner["id"]?.stringValue, let ids = inner["ids"]?.arrayValue else { return nil }
            return Folder(id: id, name: inner["name"]?.stringValue ?? NoteCoding.folderName, ids: ids.compactMap(\.stringValue))
        }
        return Layout(order: order.compactMap(\.stringValue), mod: mod, folders: folders)
    }

    /// 這台有自己的排列（已經有真的紙）：iCloud 上沒有 layout.json 時拿這台的當第一份，mod 從 0 起算。
    /// 剛裝好、只有教學紙的不算
    static func ownLayout(_ book: inout Notebook) {
        if book.orderMod == nil, book.notes.contains(where: { !Tutorial.isUntouched($0) }) { book.orderMod = 0 }
    }

    /// 要傳上 iCloud 的排列：跟上次對上的不一樣才傳
    static func layoutToSend(_ book: Notebook) -> Layout? {
        guard let order = book.order, let mod = book.orderMod, mod != book.orderSent else { return nil }
        return Layout(order: order, mod: mod, folders: book.folders ?? [])
    }

    /// 拉 iCloud 時合排列（紙合完之後）。這台排過還沒傳、而且比 iCloud 那份新 → 留著等上傳；
    /// 不然照 iCloud 那份排，這台沒有的紙跳過、那份沒有的補最後。回傳目錄順序有沒有變
    @discardableResult
    static func mergeLayout(_ book: inout Notebook, _ fetch: LayoutFetch) -> Bool {
        let raw: JSONValue?
        switch fetch {
        case .unreadable: return false
        case .missing: raw = nil
        case let .found(val): raw = val
        }
        guard let remote = readLayout(raw) else {
            if book.orderMod != nil { book.orderSent = nil }
            return false
        }
        if let mine = book.orderMod, mine > remote.mod {
            if book.orderSent == mine { book.orderSent = nil }
            return false
        }
        let beforeOrder = book.order ?? [], beforeFolders = book.folders ?? []
        book.order = remote.order
        book.folders = remote.folders
        book.orderMod = remote.mod
        book.orderSent = remote.mod
        fixOrder(&book)
        return (book.order ?? []) != beforeOrder || (book.folders ?? []) != beforeFolders
    }
}

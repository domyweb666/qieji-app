import Foundation

/// 存檔 JSON ⇄ 資料結構。外面進來的紙（舊存檔、iCloud 資料夾裡的檔、網頁版備份）欄位型別不一定對，一律先走這裡補好。
/// 對應 Expo 版 model.ts 的 fixNote、readState。
enum NoteCoding {
    static let folderName = "新資料夾"
    private static let noteKeys: Set<String> = [
        "id", "type", "title", "body", "items", "bin", "color", "glyph", "cover", "locked", "pinned", "deleted",
        "deletedAt", "created", "updated", "b", "h", "mod", "sh",
    ]
    private static let bookKeys: Set<String> = [
        "sort", "notes", "garden", "gone", "order", "orderMod", "orderSent", "folders", "grid",
    ]

    // MARK: 小工具

    /// 字：字串原樣、數字轉成字、其他當成空的
    static func str(_ val: JSONValue?) -> String {
        switch val {
        case let .string(text): return text
        case let .number(num) where num.isFinite: return JSONValue.jsNumber(num)
        default: return ""
        }
    }

    static func idOf(_ val: JSONValue?) -> String {
        switch val {
        case let .string(text) where !text.isEmpty: return text
        case let .number(num) where num.isFinite: return JSONValue.jsNumber(num)
        default: return Ident.make()
        }
    }

    static func time(_ val: JSONValue?) -> Double? {
        guard let num = val?.numberValue, Clock.validTime(num) else { return nil }
        return num
    }

    // MARK: 讀一張紙

    static func item(_ dict: [String: JSONValue]) -> Item {
        Item(
            id: idOf(dict["id"]), text: str(dict["t"]), done: dict["done"]?.truthy ?? false,
            flagB: dict["b"].map(\.truthy) ?? true, binnedAt: time(dict["at"])
        )
    }

    private static func items(_ val: JSONValue?) -> [Item] {
        (val?.arrayValue ?? []).compactMap(\.objectValue).map(item)
    }

    static func note(_ dict: [String: JSONValue]) -> Note {
        var color = dict["color"]?.stringValue ?? ""
        if !NoteColor.isKey(color) { color = color == "pink" ? "red" : "yellow" }
        let deleted = dict["deleted"]?.truthy ?? false
        var glyph: String?
        if let raw = dict["glyph"]?.stringValue {
            glyph = Labels.graphemes(Labels.trim(raw)).first
        }
        var cover = dict["cover"]?.stringValue
        if let name = cover, !isCoverName(name) { cover = nil }
        let rawID = dict["id"]
        let noteID: String
        if case let .string(text) = rawID { noteID = text } else { noteID = idOf(rawID) }
        return Note(
            id: noteID,
            kind: dict["type"]?.stringValue ?? "check",
            title: str(dict["title"]),
            body: str(dict["body"]),
            items: items(dict["items"]),
            bin: items(dict["bin"]),
            color: color,
            glyph: glyph,
            cover: cover,
            locked: dict["locked"] == .bool(true),
            pinned: dict["pinned"]?.truthy ?? false,
            deleted: deleted,
            deletedAt: deleted ? time(dict["deletedAt"]) : nil,
            created: dict["created"]?.numberValue ?? 0,
            updated: dict["updated"]?.numberValue ?? 0,
            flagB: dict["b"].map(\.truthy) ?? true,
            hash: dict["h"]?.stringValue,
            mod: dict["mod"]?.numberValue,
            syncedHash: dict["sh"]?.stringValue,
            extra: dict.filter { !noteKeys.contains($0.key) }
        )
    }

    /// 封面代號會拿去組檔名：只准小寫英數 4～40 個字
    static func isCoverName(_ name: String) -> Bool {
        let count = name.unicodeScalars.count
        guard count >= 4, count <= 40 else { return false }
        return name.unicodeScalars.allSatisfy { ($0.value >= 0x61 && $0.value <= 0x7A) || ($0.value >= 0x30 && $0.value <= 0x39) }
    }

    // MARK: 寫一張紙

    static func json(_ item: Item) -> JSONValue {
        var dict: [String: JSONValue] = [
            "id": .string(item.id), "t": .string(item.text), "done": .bool(item.done), "b": .bool(item.flagB),
        ]
        if let at = item.binnedAt { dict["at"] = .number(at) }
        return .object(dict)
    }

    static func json(_ note: Note) -> JSONValue {
        var dict = note.extra
        dict["id"] = .string(note.id)
        dict["type"] = .string(note.kind)
        dict["title"] = .string(note.title)
        dict["body"] = .string(note.body)
        dict["items"] = .array(note.items.map(json))
        dict["bin"] = .array(note.bin.map(json))
        dict["color"] = .string(note.color)
        dict["pinned"] = .bool(note.pinned)
        dict["deleted"] = .bool(note.deleted)
        dict["created"] = .number(note.created)
        dict["updated"] = .number(note.updated)
        dict["b"] = .bool(note.flagB)
        if let glyph = note.glyph { dict["glyph"] = .string(glyph) }
        if let cover = note.cover { dict["cover"] = .string(cover) }
        if note.locked { dict["locked"] = .bool(true) }
        if let at = note.deletedAt { dict["deletedAt"] = .number(at) }
        if let hash = note.hash { dict["h"] = .string(hash) }
        if let mod = note.mod { dict["mod"] = .number(mod) }
        if let synced = note.syncedHash { dict["sh"] = .string(synced) }
        return .object(dict)
    }

    // MARK: 讀整份存檔

    /// 讀不出來（沒有存檔、JSON 壞掉、不是茄記的格式）回 nil：呼叫的人要先把原本那份另存，不能拿空的蓋掉
    static func readBook(_ raw: String?) -> Notebook? {
        guard let raw, let dict = JSONValue.parse(raw)?.objectValue, let list = dict["notes"]?.arrayValue else { return nil }
        var book = Notebook()
        book.notes = dedupe(list.compactMap(\.objectValue).map(note))
        book.garden = garden(dict["garden"], notes: book.notes)
        if let sort = dict["sort"]?.stringValue, Sorts.keys.contains(sort) { book.sort = sort }
        book.gone = gone(dict["gone"])
        if let order = dict["order"]?.arrayValue { book.order = order.compactMap(\.stringValue) }
        book.orderMod = dict["orderMod"]?.numberValue
        book.orderSent = dict["orderSent"]?.numberValue
        if let folders = dict["folders"]?.arrayValue { book.folders = folders.compactMap(folder) }
        book.grid = dict["grid"]?.numberValue
        book.extra = dict.filter { !bookKeys.contains($0.key) }
        return book
    }

    /// 同一個 id 出現兩次時只留最新的那份；一樣新留前面那份
    private static func dedupe(_ notes: [Note]) -> [Note] {
        var best: [String: Int] = [:]
        for (idx, note) in notes.enumerated() {
            if let old = best[note.id], notes[old].updated >= note.updated { continue }
            best[note.id] = idx
        }
        return notes.enumerated().filter { best[$0.element.id] == $0.offset }.map(\.element)
    }

    /// 茄子田（網頁版的功能）：app 不再計數，原樣留著。沒有的話照現有的紙算第一次
    private static func garden(_ val: JSONValue?, notes: [Note]) -> JSONValue {
        if let dict = val?.objectValue, dict["days"]?.truthy == true, dict["tot"]?.truthy == true { return .object(dict) }
        let live = notes.filter { !$0.deleted }
        let lines = live.flatMap(\.items)
        let filled = lines.filter { !Labels.trim($0.text).isEmpty }.count
            + live.filter { $0.isText && !Labels.trim($0.body).isEmpty }.count
        let done = lines.filter(\.done).count
        return .object(["days": .object([:]), "tot": .object(["f": .number(Double(filled)), "e": .number(Double(done))])])
    }

    static func gone(_ val: JSONValue?) -> [String: Double] {
        var out: [String: Double] = [:]
        for (id, stamp) in val?.objectValue ?? [:] {
            if let at = time(stamp) { out[id] = at }
        }
        return out
    }

    /// 格式不對的資料夾丟掉（沒有 id、ids 不是陣列）；名字、裡面的紙之後由 Seats.fixFolders 再整理
    static func folder(_ val: JSONValue) -> Folder? {
        guard let dict = val.objectValue, let id = dict["id"]?.stringValue, let ids = dict["ids"]?.arrayValue else { return nil }
        return Folder(id: id, name: dict["name"]?.stringValue ?? "", ids: ids.compactMap(\.stringValue))
    }

    // MARK: 寫整份存檔

    static func json(_ folder: Folder) -> JSONValue {
        .object(["id": .string(folder.id), "name": .string(folder.name), "ids": .array(folder.ids.map { .string($0) })])
    }

    static func json(_ book: Notebook) -> JSONValue {
        var dict = book.extra
        dict["sort"] = .string(book.sort)
        dict["notes"] = .array(book.notes.map(json))
        dict["garden"] = book.garden
        dict["gone"] = .object(book.gone.mapValues { .number($0) })
        if let order = book.order { dict["order"] = .array(order.map { .string($0) }) }
        if let mod = book.orderMod { dict["orderMod"] = .number(mod) }
        if let sent = book.orderSent { dict["orderSent"] = .number(sent) }
        if let folders = book.folders { dict["folders"] = .array(folders.map(json)) }
        if let grid = book.grid { dict["grid"] = .number(grid) }
        return .object(dict)
    }

    static func write(_ book: Notebook) -> String { json(book).stringify() }
}

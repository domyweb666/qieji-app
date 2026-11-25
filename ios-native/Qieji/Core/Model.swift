import Foundation

// 茄記的資料結構。規則從 Expo 版 src/lib/model.ts 逐條搬過來（2026-11-21），測試在 QiejiTests。
// 鐵則照舊：存檔的鍵永遠是 colornotes.v1 的格式；欄位只能加，不能改名或刪掉。
// 這個資料夾只放純計算，不碰畫面、不碰儲存。

/// 紙上的一行。存檔裡的鍵：id、t、done、b、at
struct Item: Equatable, Identifiable {
    var id: String
    var text: String // t
    var done: Bool
    var flagB: Bool // b：網頁版留下來的欄位，app 沒在用，原樣帶著
    var binnedAt: Double? // at：被刪掉的時間，只有在最近刪除裡才有

    init(id: String = Ident.make(), text: String, done: Bool = false, flagB: Bool = false, binnedAt: Double? = nil) {
        self.id = id
        self.text = text
        self.done = done
        self.flagB = flagB
        self.binnedAt = binnedAt
    }
}

/// 一張紙。存檔裡的鍵見 NoteCoding
struct Note: Equatable, Identifiable {
    var id: String
    var kind: String // type：'text'（舊的文字筆記）或 'check'（清單）
    var title: String
    var body: String
    var items: [Item]
    var bin: [Item] // 這張紙刪掉的行（最近刪除）
    var color: String
    var glyph: String? // 磚正中間的字；沒設＝名字的第一個字
    var cover: String? // 封面圖的檔名代號
    var locked: Bool // 上鎖（只算這支手機的事，不上傳）
    var pinned: Bool
    var deleted: Bool
    var deletedAt: Double?
    var created: Double
    var updated: Double
    var flagB: Bool // b
    var hash: String? // h：內容指紋
    var mod: Double? // 指紋上次變的時間（同步比新舊用）
    var syncedHash: String? // sh：上次跟 iCloud 對上時的指紋
    var extra: [String: JSONValue] = [:] // 這一版不認得的欄位，原樣留著

    var isText: Bool {
        kind == "text"
    }

    static func blank(color: String = "yellow", now: Double) -> Note {
        Note(
            id: Ident.make(), kind: "check", title: "", body: "", items: [], bin: [], color: color,
            glyph: nil, cover: nil, locked: false, pinned: false, deleted: false, deletedAt: nil,
            created: now, updated: now, flagB: false, hash: nil, mod: nil, syncedHash: nil
        )
    }
}

struct Folder: Equatable, Identifiable {
    var id: String
    var name: String
    var ids: [String]
}

/// 整份存檔（Expo 版叫 State；這裡改名，免得跟 SwiftUI 的 @State 撞）
struct Notebook: Equatable {
    var sort: String = "updated"
    var notes: [Note] = []
    var garden: JSONValue = .object(["days": .object([:]), "tot": .object(["f": .number(0), "e": .number(0)])])
    var gone: [String: Double] = [:] // 墓碑：永久拿掉的紙 id → 拿掉的時間
    var order: [String]? // 目錄座位表
    var orderMod: Double?
    var orderSent: Double?
    var folders: [Folder]?
    var grid: Double?
    var extra: [String: JSONValue] = [:]

    func note(_ id: String) -> Note? {
        notes.first { $0.id == id }
    }

    func index(_ id: String) -> Int? {
        notes.firstIndex { $0.id == id }
    }
}

/// 九種顏色。name 是蔬菜名，hue 是一般人說的顏色
enum NoteColor {
    static let keys = ["purple", "yellow", "orange", "red", "blue", "green", "gray", "black", "white"]
    static let names: [String: (name: String, hue: String)] = [
        "purple": ("茄子", "紫色"), "yellow": ("玉米", "黃色"), "orange": ("紅蘿蔔", "橘色"),
        "red": ("甜椒", "紅色"), "blue": ("藍莓", "藍色"), "green": ("青蔥", "綠色"),
        "gray": ("香菇", "奶茶色"), "black": ("黑豆", "深灰"), "white": ("白蘿蔔", "白色"),
    ]
    static func isKey(_ key: String) -> Bool {
        keys.contains(key)
    }
}

enum Sorts {
    static let keys = ["updated", "created", "title", "color"]
}

/// 第一次安裝時放的教學紙：每一行就是叫你做的那個動作
enum Tutorial {
    static let title = "從這裡開始"
    static let lines = [
        "想完的事，往右滑劃掉",
        "不要的，往左滑刪掉（刪了在最近刪除找得回來）",
        "點一下這行，就能改字",
        "按住這行，看還能做什麼",
        "按住右邊的小點點上下拖，換順序",
        "點左上的名字，換一張紙或開新的一張",
        "右下角 ＋，記下你現在想到的事",
    ]

    static func note(now: Double) -> Note {
        var note = Note.blank(now: now)
        note.title = title
        note.items = lines.map { Item(text: $0) }
        return note
    }

    /// 一個字都沒動過的教學紙：不上傳；iCloud 上有別的紙時本機這張拿掉
    static func isUntouched(_ note: Note) -> Bool {
        !note.deleted && !note.pinned && note.color == "yellow" && note.title == title && note.bin.isEmpty
            && note.items.count == lines.count
            && zip(note.items, lines).allSatisfy { $0.text == $1 && !$0.done }
    }
}

@testable import Qieji
import XCTest

/// 目錄座位表與行操作的對照答案：一連串亂數動作，每一步做完的樣子都要跟 Expo 版一樣。
final class SeatFixtureTests: XCTestCase {
    private static let all: [String: JSONValue] = {
        guard let url = Bundle(for: SeatFixtureTests.self).url(forResource: "fixtures", withExtension: "json"),
              let data = try? Data(contentsOf: url), let dict = JSONValue.parse(data)?.objectValue else { return [:] }
        return dict
    }()

    private func cases(_ name: String) -> [[String: JSONValue]] {
        (SeatFixtureTests.all[name]?.arrayValue ?? []).compactMap(\.objectValue)
    }

    private func strings(_ val: JSONValue?) -> [String] {
        (val?.arrayValue ?? []).compactMap(\.stringValue)
    }

    // MARK: 座位表

    /// 亂數的空位 id 改成固定的名字（跟產生器同一條規則）
    private func tameHoles(_ book: inout Notebook, count: inout Int) {
        guard let order = book.order else { return }
        let known = try? NSRegularExpression(pattern: "^\\.(H\\d+|h\\d*|n\\d+|add\\d+_\\d+)$")
        book.order = order.map { id in
            guard Seats.isHole(id) else { return id }
            let hit = known?.firstMatch(in: id, range: NSRange(id.startIndex..., in: id)) != nil
            if hit {
                return id
            }
            count += 1
            return ".H\(count)"
        }
    }

    private func seatView(_ book: Notebook) -> String {
        let ids = Set(book.notes.map(\.id))
        func norm(_ id: String) -> String {
            Seats.isHole(id) && !ids.contains(String(id.dropFirst())) ? ".?" : id
        }
        let layout: [JSONValue] = Seats.seatedLayout(book).map { entry in
            var tag = ""
            if entry.isBreak {
                tag = "B"
            } else if entry.isHole {
                tag = "H"
            } else if entry.folder != nil {
                tag = "F" + entry.notes.map(\.id).joined(separator: "+")
            }
            return .string(norm(entry.id) + tag)
        }
        return JSONValue.object([
            "order": book.order.map { .array($0.map { .string(norm($0)) }) } ?? .null,
            "folders": book.folders.map { .array($0.map(NoteCoding.json)) } ?? .null,
            "grid": book.grid.map { .number($0) } ?? .null,
            "hasMod": .bool(book.orderMod != nil),
            "layout": .array(layout),
        ]).stringify()
    }

    // 做一步。回傳值有的話轉成 JSON 好比對
    // swiftlint:disable:next cyclomatic_complexity
    private func run(_ opr: [String: JSONValue], on book: inout Notebook) -> JSONValue {
        let now = opr["now"]?.numberValue ?? 0
        let note = opr["note"]?.stringValue ?? ""
        let folder = opr["folder"]?.stringValue ?? ""
        switch opr["kind"]?.stringValue {
        case "fixOrder": return .bool(Seats.fixOrder(&book))
        case "reseat": Seats.reseat(&book, visible: strings(opr["visible"]), now: now)
        case "newFolder": Seats.newFolder(&book, noteID: note, now: now, id: opr["id"]?.stringValue ?? "")
        case "intoFolder":
            return .bool(Seats.intoFolder(&book, noteID: note, folderID: folder, now: now, leave: opr["leave"] == .bool(true)))
        case "outOfFolder":
            return .bool(Seats.outOfFolder(&book, noteID: note, now: now, hole: opr["hole"]?.stringValue, after: opr["after"]?.stringValue))
        case "leaveHole": return .bool(Seats.leaveHole(&book, noteID: note, now: now))
        case "fillHole": return .bool(Seats.fillHole(&book, noteID: note, now: now))
        case "seatNew":
            return .bool(Seats.seatNew(&book, noteID: note, now: now, hole: opr["hole"]?.stringValue, after: opr["after"]?.stringValue))
        case "seatFirstHole": return .bool(Seats.seatFirstHole(&book, noteID: note, now: now))
        case "packGrid": return .bool(Seats.packGrid(&book, now: now))
        case "placeInFolder":
            return .bool(Seats.placeInFolder(&book, noteID: note, folderID: folder, visible: strings(opr["visible"]), now: now))
        case "placeTop":
            Seats.fixOrder(&book)
            Seats.placeTop(&book, noteID: note, visible: strings(opr["visible"]), now: now)
        case "trash":
            Seats.leaveHole(&book, noteID: note, now: now)
            if let idx = book.index(note) {
                Trash.markDeleted(&book.notes[idx], now: now)
            }
        case "restore":
            if let idx = book.index(note) {
                Trash.markRestored(&book.notes[idx])
            }
            Seats.fillHole(&book, noteID: note, now: now)
        case "drop":
            Sync.dropNotes(&book, now: now) { $0.id == note }
            Seats.fixOrder(&book)
        case "renameFolder":
            return .bool(Seats.renameFolder(&book, folderID: folder, name: opr["name"]?.stringValue ?? "", now: now))
        case "addNote":
            var fresh = Note.blank(color: "purple", now: now)
            fresh.id = note
            fresh.title = "新的"
            fresh.flagB = true
            book.notes.append(fresh)
            Seats.fixOrder(&book)
        case "breakIn":
            Seats.fixOrder(&book)
            book.order?.insert(opr["mark"]?.stringValue ?? "", at: Int(opr["at"]?.numberValue ?? 0))
            Seats.fixOrder(&book)
        default: XCTFail("不認得的動作 \(opr["kind"]?.stringValue ?? "")")
        }
        return .null
    }

    func testSeatSequencesMatchExpoVersion() {
        let all = cases("seats")
        XCTAssertFalse(all.isEmpty)
        for (num, one) in all.enumerated() {
            guard var book = NoteCoding.readBook(one["start"]?.stringValue) else { XCTFail("讀不出起點 \(num)"); continue }
            var holes = 0
            for (idx, step) in (one["steps"]?.arrayValue ?? []).compactMap(\.objectValue).enumerated() {
                let opr = step["op"]?.objectValue ?? [:]
                let ret = run(opr, on: &book)
                tameHoles(&book, count: &holes)
                let kind = opr["kind"]?.stringValue ?? ""
                if let want = step["ret"], want != .null {
                    XCTAssertEqual(ret, want, "第 \(num) 組第 \(idx) 步 \(kind) 的回傳值")
                }
                let got = seatView(book)
                if got != step["view"]?.stringValue {
                    XCTFail("第 \(num) 組第 \(idx) 步 \(kind)：\n得到 \(got)\n應該 \(step["view"]?.stringValue ?? "")")
                    break
                }
            }
        }
    }

    // MARK: 行

    private func lineView(_ note: Note) -> String {
        JSONValue.object(["items": .array(note.items.map(NoteCoding.json)), "bin": .array(note.bin.map(NoteCoding.json))]).stringify()
    }

    func testLineSequencesMatchExpoVersion() {
        let all = cases("lines")
        XCTAssertFalse(all.isEmpty)
        for (num, one) in all.enumerated() {
            guard let raw = JSONValue.parse(one["start"]?.stringValue ?? "")?.objectValue else { XCTFail("讀不出起點 \(num)"); continue }
            var note = NoteCoding.note(raw)
            var before: [Item] = []
            var ids = Set<String>()
            for (idx, step) in (one["steps"]?.arrayValue ?? []).compactMap(\.objectValue).enumerated() {
                let opr = step["op"]?.objectValue ?? [:]
                let now = opr["now"]?.numberValue ?? 0
                let id = opr["id"]?.stringValue ?? ""
                var ret = JSONValue.null
                switch opr["kind"]?.stringValue {
                case "bin": ret = .bool(Lines.bin(&note, id, now: now) != nil)
                case "unbin": ret = .bool(Lines.unbin(&note, id, at: Int(opr["at"]?.numberValue ?? 0)) != nil)
                case "binDone":
                    before = note.items
                    let gone = Lines.binDone(&note, now: now)
                    ids = Set(gone.map(\.id))
                    ret = .number(Double(gone.count))
                case "unbinDone": ret = .number(Double(Lines.unbinDone(&note, before: before, ids: ids)))
                case "toggle":
                    if let spot = note.items.firstIndex(where: { $0.id == id }) {
                        note.items[spot].done.toggle()
                    }
                case "add": note.items.insert(Item(id: id, text: "新 \(id.dropFirst(3))", flagB: true), at: 0)
                case "purge":
                    var list = [note]
                    ret = .number(Double(Trash.purgeBin(&list, now: now)))
                    note = list[0]
                default: XCTFail("不認得的動作")
                }
                let kind = opr["kind"]?.stringValue ?? ""
                if let want = step["ret"], want != .null {
                    XCTAssertEqual(ret, want, "第 \(num) 組第 \(idx) 步 \(kind) 的回傳值")
                }
                let got = lineView(note)
                if got != step["view"]?.stringValue {
                    XCTFail("第 \(num) 組第 \(idx) 步 \(kind)：\n得到 \(got)\n應該 \(step["view"]?.stringValue ?? "")")
                    break
                }
            }
        }
    }
}

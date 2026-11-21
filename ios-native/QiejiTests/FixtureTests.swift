@testable import Qieji
import XCTest

/// 對照答案測試：fixtures.json 是用 Expo 版的 src/lib/model.ts 跑出來的（tools/gen-swift-fixtures.mjs）。
/// 同樣的輸入，Swift 版要算出一字不差的結果——兩個版本會同時在使用者的兩台手機上跑、共用同一個 iCloud 資料夾。
final class FixtureTests: XCTestCase {
    private static let all: [String: JSONValue] = {
        guard let url = Bundle(for: FixtureTests.self).url(forResource: "fixtures", withExtension: "json"),
              let data = try? Data(contentsOf: url), let dict = JSONValue.parse(data)?.objectValue else { return [:] }
        return dict
    }()

    private func cases(_ name: String) -> [[String: JSONValue]] {
        let list = (FixtureTests.all[name]?.arrayValue ?? []).compactMap(\.objectValue)
        XCTAssertFalse(list.isEmpty, "fixtures.json 裡沒有 \(name)")
        return list
    }

    private func book(_ text: JSONValue?) -> Notebook {
        NoteCoding.readBook(text?.stringValue) ?? Notebook()
    }

    private func canon(_ book: Notebook) -> String {
        NoteCoding.json(book).stringify()
    }

    /// 對照答案檔真的有讀到，而且每一組的數量跟產生器印的一樣（不然全部「通過」可能只是什麼都沒比）
    func testFixturesAreLoaded() {
        XCTAssertEqual(cases("prints").count, 10)
        XCTAssertEqual(cases("books").count, 10)
        XCTAssertEqual(cases("merges").count, 56)
        XCTAssertEqual(cases("layouts").count, 10)
        XCTAssertEqual(cases("lines").count, 40)
        let steps = cases("seats").reduce(0) { $0 + ($1["steps"]?.arrayValue?.count ?? 0) }
        XCTAssertEqual(cases("seats").count, 60)
        XCTAssertEqual(steps, 719)
    }

    /// 改一個字指紋就要不一樣；h、mod、sh 不算內容
    func testFingerprintReactsToContent() {
        var note = Note.blank(color: "purple", now: 1)
        note.id = "a"
        note.items = [Item(id: "1", text: "想法")]
        let base = Sync.fingerprint(note)
        var same = note
        same.hash = "zz"
        same.mod = 9
        same.syncedHash = "yy"
        XCTAssertEqual(Sync.fingerprint(same), base)
        var changed = note
        changed.items[0].text = "想法！"
        XCTAssertNotEqual(Sync.fingerprint(changed), base)
    }

    // MARK: 指紋、讀存檔

    func testFingerprintsMatchExpoVersion() {
        for one in cases("prints") {
            guard let raw = one["raw"]?.objectValue else { XCTFail("壞的案例"); continue }
            XCTAssertEqual(Sync.fingerprint(NoteCoding.note(raw)), one["print"]?.stringValue, "紙 \(raw["id"]?.stringValue ?? "")")
        }
    }

    func testReadBookMatchesExpoVersion() {
        for (idx, one) in cases("books").enumerated() {
            var got: String?
            if var read = NoteCoding.readBook(one["raw"]?.stringValue) {
                Seats.fixOrder(&read)
                got = canon(read)
            }
            XCTAssertEqual(got, one["out"]?.stringValue, "第 \(idx) 份存檔")
        }
    }

    func testWriteThenReadIsLossless() {
        for one in cases("books") {
            guard let first = NoteCoding.readBook(one["raw"]?.stringValue) else { continue }
            let again = NoteCoding.readBook(NoteCoding.write(first))
            XCTAssertEqual(again, first)
        }
    }

    // MARK: iCloud 合併

    func testMergeCloudMatchesExpoVersion() {
        for one in cases("merges") {
            let name = one["name"]?.stringValue ?? ""
            var local = book(one["local"])
            let remote = one["remote"]?.objectValue ?? [:]
            let res = Sync.mergeCloud(
                &local, notes: remote["notes"]?.arrayValue ?? [], gone: remote["gone"], now: one["now"]?.numberValue ?? 0
            )
            XCTAssertEqual(canon(local), one["out"]?.stringValue, "合併結果：\(name)")
            let want = one["res"]?.objectValue ?? [:]
            XCTAssertEqual(Double(res.added), want["added"]?.numberValue, "added：\(name)")
            XCTAssertEqual(Double(res.taken), want["taken"]?.numberValue, "taken：\(name)")
            XCTAssertEqual(Double(res.united), want["united"]?.numberValue, "united：\(name)")
            XCTAssertEqual(Double(res.removed), want["removed"]?.numberValue, "removed：\(name)")
            XCTAssertEqual(Double(res.spare), want["spare"]?.numberValue, "spare：\(name)")
            XCTAssertEqual(res.push, (want["push"]?.arrayValue ?? []).compactMap(\.stringValue), "push：\(name)")
            XCTAssertEqual(res.retyped, (want["retyped"]?.arrayValue ?? []).compactMap(\.stringValue), "retyped：\(name)")
            XCTAssertEqual(res.changed, want["changed"] == .bool(true), "changed：\(name)")
        }
    }

    func testLayoutMergeMatchesExpoVersion() {
        for one in cases("layouts") {
            let name = one["name"]?.stringValue ?? ""
            var local = book(one["local"])
            let fetch: Seats.LayoutFetch = switch one["fetch"]?.stringValue {
            case "missing": .missing
            case "unreadable": .unreadable
            default: .found(one["raw"] ?? .null)
            }
            let changed = Seats.mergeLayout(&local, fetch)
            XCTAssertEqual(changed, one["changed"] == .bool(true), "有沒有變：\(name)")
            let view = JSONValue.object([
                "order": .array((local.order ?? []).map { .string($0) }),
                "folders": local.folders.map { .array($0.map(NoteCoding.json)) } ?? .null,
                "orderMod": local.orderMod.map { .number($0) } ?? .null,
                "orderSent": local.orderSent.map { .number($0) } ?? .null,
            ])
            XCTAssertEqual(view.stringify(), one["out"]?.stringValue, "排列：\(name)")
        }
    }

    // MARK: 最近刪除、字

    func testExpiryRules() {
        for one in cases("expired") {
            let now = one["now"]?.numberValue ?? Double.nan
            XCTAssertEqual(Trash.isExpired(at: one["at"]?.numberValue, now: now), one["out"] == .bool(true))
        }
    }

    func testGraphemesAndGlyphs() {
        for one in cases("glyphs") {
            let text = one["t"]?.stringValue ?? ""
            XCTAssertEqual(Labels.graphemes(text), (one["parts"]?.arrayValue ?? []).compactMap(\.stringValue), "切字：\(text)")
            XCTAssertEqual(Labels.glyphProblem(text), one["problem"]?.stringValue, "提醒：\(text)")
        }
    }

    func testSplitPasted() {
        for one in cases("pasted") {
            XCTAssertEqual(Lines.splitPasted(one["t"]?.stringValue ?? ""), (one["out"]?.arrayValue ?? []).compactMap(\.stringValue))
        }
    }

    func testLabels() {
        for one in cases("labels") {
            guard let raw = one["raw"]?.objectValue else { continue }
            let note = NoteCoding.note(raw)
            XCTAssertEqual(Labels.label(note), one["label"]?.stringValue)
            XCTAssertEqual(Labels.glyph(note), one["glyph"]?.stringValue)
            XCTAssertEqual(Labels.pickLabel(note), one["pick"]?.stringValue)
            XCTAssertEqual(Labels.isEmpty(note), one["empty"] == .bool(true))
            XCTAssertEqual(Labels.plain(note), one["plain"]?.stringValue)
        }
    }
}

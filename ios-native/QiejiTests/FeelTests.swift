@testable import Qieji
import XCTest

/// 2026-11-23 手感修正：磚的樣子、封面小圖、最近開過的、換紙時清單換內容
final class FeelTests: XCTestCase {
    private func picture(_ size: CGSize) -> Data {
        UIGraphicsImageRenderer(size: size).image { ctx in
            UIColor.red.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
        .jpegData(compressionQuality: 0.8) ?? Data()
    }

    private func paper(_ title: String, lines: Int) -> Note {
        var note = Note.blank(now: 1000)
        note.title = title
        note.items = (0 ..< lines).map { Item(text: "\(title) \($0)") }
        return note
    }

    // MARK: 磚

    /// 封面圖從 iCloud 晚到：紙本身沒變，磚的樣子要變
    func testTileShowsCoverWhenItArrives() {
        var note = paper("封面", lines: 1)
        note.cover = "feeltestcover"
        XCTAssertNil(TileFace(small: note).paper?.photo)
        XCTAssertTrue(Covers.shared.write("feeltestcover", picture(CGSize(width: 900, height: 600))))
        XCTAssertEqual(TileFace(small: note).paper?.photo, "feeltestcover")
        // 上鎖的紙不露圖
        note.locked = true
        XCTAssertNil(TileFace(small: note).paper?.photo)
        Covers.shared.remove("feeltestcover")
        note.locked = false
        XCTAssertNil(TileFace(small: note).paper?.photo)
    }

    func testThumbIsSmall() {
        XCTAssertTrue(Covers.shared.write("feeltestthumb", picture(CGSize(width: 400, height: 300))))
        let thumb = Covers.shared.thumb("feeltestthumb")
        XCTAssertNotNil(thumb)
        XCTAssertLessThanOrEqual(min(thumb?.size.width ?? 0, thumb?.size.height ?? 0), Tok.Shape.tileMax * 3 + 1)
        Covers.shared.remove("feeltestthumb")
        XCTAssertNil(Covers.shared.thumb("feeltestthumb"))
    }

    /// 行改了、字改了，磚上的樣子沒變就不用重畫
    func testTileFaceIgnoresLines() {
        var note = paper("今天", lines: 3)
        let before = TileFace(Seats.Entry(id: note.id, note: note, notes: [note]), current: false)
        note.items.append(Item(text: "多一行"))
        XCTAssertEqual(before, TileFace(Seats.Entry(id: note.id, note: note, notes: [note]), current: false))
        note.pinned = true
        XCTAssertNotEqual(before, TileFace(Seats.Entry(id: note.id, note: note, notes: [note]), current: false))
    }

    // MARK: 最近開過的

    func testRecentIsKeptInOrderAndWritten() throws {
        let name = "qieji.feel.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        let disk = Disk(dir: dir, legacyDirs: [], defaults: defaults)
        for id in ["aa", "bb", "cc", "aa"] {
            disk.rememberLast(id)
        }
        XCTAssertEqual(disk.recent, ["aa", "cc", "bb"])
        // 存檔（進背景前會叫）做完，設定一定也寫好了
        XCTAssertTrue(disk.write(Notebook()))
        XCTAssertEqual(defaults.string(forKey: LegacyStore.lastKey), "aa")
        XCTAssertEqual(defaults.stringArray(forKey: LegacyStore.recentKey), ["aa", "cc", "bb"])
        try? FileManager.default.removeItem(at: dir)
    }

    // MARK: 排順序

    /// 前緣蓋過別行一半，那行就讓開；不用等中心對中心
    func testDragPassesAtHalfOfTheNeighbour() throws {
        var note = paper("排", lines: 4)
        note.items[2].text = "高\n的\n一\n行"
        let list = LineListView(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        let window = UIWindow(frame: list.frame)
        window.addSubview(list)
        window.isHidden = false
        list.source = { LineListView.items(note) }
        list.apply(LineListView.items(note), animated: false)
        list.layoutIfNeeded()
        func spot(_ from: Int, _ shift: CGFloat) throws -> Int {
            let row = try XCTUnwrap(list.live[note.items[from].id])
            var drag = LineDrag(
                id: row.id, row: row, from: from, to: from, height: list.heights[from], top: list.headHeight + list.tops[from],
                startY: 0, startOffset: 0, fingerY: 0
            )
            drag.shift = shift
            return list.targetIndex(drag)
        }
        let short = list.heights[0], tall = list.heights[2]
        XCTAssertGreaterThan(tall, short)
        XCTAssertEqual(try spot(0, 0), 0)
        XCTAssertEqual(try spot(0, short / 2 - 1), 0)
        XCTAssertEqual(try spot(0, short / 2 + 1), 1)
        XCTAssertEqual(try spot(0, short + tall / 2 + 1), 2)
        XCTAssertEqual(try spot(0, 5000), 3)
        XCTAssertEqual(try spot(3, 1 - tall / 2), 3)
        XCTAssertEqual(try spot(3, -tall / 2 - 1), 2)
        XCTAssertEqual(try spot(3, -5000), 0)
    }

    // MARK: 刪除先問

    /// 目錄長按選單的「刪除」：先問，按了才刪
    func testDirDeleteAsksFirst() {
        let store = Store()
        let id = store.makeNote(hole: nil, after: nil)
        let model = DirModel(store: store)
        model.confirmDelete(id)
        XCTAssertEqual(model.askDelete, id)
        XCTAssertEqual(store.book.note(id)?.deleted, false)
    }

    // MARK: 換紙

    func testSwapShowsOnlyTheNewPaper() {
        let first = paper("甲", lines: 30), second = paper("乙", lines: 3)
        let list = LineListView(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        let window = UIWindow(frame: list.frame)
        window.addSubview(list)
        window.isHidden = false
        list.paperID = first.id
        list.source = { LineListView.items(first) }
        list.apply(LineListView.items(first), animated: false)
        list.layoutIfNeeded()
        list.contentOffset.y = 300
        list.layoutIfNeeded()
        XCTAssertTrue(list.live.values.allSatisfy { $0.superview === list.content })

        list.swap(to: second.id, look: list.look, wire: { list.source = { LineListView.items(second) } }, front: nil)
        list.layoutIfNeeded()
        XCTAssertEqual(list.paperID, second.id)
        XCTAssertEqual(list.contentOffset.y, 0)
        XCTAssertEqual(Set(list.live.keys), Set(second.items.map(\.id)))
        XCTAssertTrue(list.live.values.allSatisfy { $0.superview === list.content && !$0.isHidden })
        XCTAssertFalse(list.fading.isEmpty)

        // 還沒淡完又換回去：舊的馬上收掉，不留在畫面上
        list.swap(to: first.id, look: list.look, wire: { list.source = { LineListView.items(first) } }, front: nil)
        list.layoutIfNeeded()
        XCTAssertTrue(list.live.keys.allSatisfy { id in first.items.contains { $0.id == id } })
        list.finishFade()
        XCTAssertTrue(list.fading.isEmpty)
        XCTAssertTrue(list.resting.isHidden)
        XCTAssertTrue(list.resting.bench.allSatisfy(\.isHidden))
        list.dismantle()
        XCTAssertTrue(list.live.isEmpty)
    }
}

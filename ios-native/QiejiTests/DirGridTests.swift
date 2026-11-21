@testable import Qieji
import XCTest

/// 目錄格子的純計算：尺寸、分頁、拖的時候整排怎麼換、資料夾裡的順序、手上那張瞄著哪。
final class DirGridTests: XCTestCase {
    private let metrics = DirMetrics(cell: 89)

    private func note(_ id: String) -> Note {
        var made = Note.blank(now: 1000)
        made.id = id
        made.title = id
        return made
    }

    private func book(_ order: [String], folders: [Folder] = []) -> Notebook {
        var made = Notebook()
        let inside = folders.flatMap(\.ids)
        let marks: Set<Character> = ["f", "|", "."]
        made.notes = (order.filter { id in id.first.map { !marks.contains($0) } ?? false } + inside).map { note($0) }
        made.folders = folders.isEmpty ? nil : folders
        made.order = order
        Seats.fixOrder(&made)
        return made
    }

    private func gridDrag(_ id: String, in list: [Seats.Entry]) -> DirDrag {
        let cells = list.map { $0.id == id ? DirCells.me : $0.id }
        return DirDrag(id: id, source: nil, page: 0, cells: cells, inFolder: nil, base: cells)
    }

    // MARK: 尺寸

    func testMetricsMatchExpoNumbers() {
        XCTAssertEqual(metrics.side, 64)
        XCTAssertEqual(metrics.tileHeight, 86)
        XCTAssertEqual(metrics.pitch, 106)
        XCTAssertEqual(metrics.slot(5), CGPoint(x: 89, y: 106))
        XCTAssertEqual(metrics.slot(4, cols: 3), CGPoint(x: 89, y: 106))
        XCTAssertEqual(metrics.cellAt(CGPoint(x: 100, y: 110)), 5)
        XCTAssertEqual(metrics.cellAt(CGPoint(x: 400, y: 0)), 3)
        XCTAssertEqual(metrics.cellAt(CGPoint(x: -1, y: 10)), -1)
        XCTAssertEqual(metrics.rows(in: 400), 3)
        XCTAssertEqual(metrics.rows(in: 10), 1)
        XCTAssertEqual(metrics.height(rows: 3), 298)
    }

    func testNarrowCellShrinksTile() {
        XCTAssertEqual(DirMetrics(cell: 70).side, 46)
    }

    // MARK: 分頁

    func testPaginateFillsThenBreaks() {
        let data = book(["a", "b", "c", "d", "e"])
        let list = Seats.seatedLayout(data)
        XCTAssertEqual(DirCells.paginate(list, perPage: 4), [[0, 1, 2, 3], [4]])
        XCTAssertEqual(DirCells.paginate(list, perPage: 8), [[0, 1, 2, 3, 4]])
    }

    func testPaginateHonoursBreakMarks() {
        let data = book(["a", "b", "|x", "c"])
        let list = Seats.seatedLayout(data)
        XCTAssertEqual(list.map(\.id), ["a", "b", "|x", "c"])
        XCTAssertEqual(DirCells.paginate(list, perPage: 8), [[0, 1], [3]])
    }

    func testFirstEmptyFindsHoleThenTail() {
        let data = book(["a", ".h", "b"])
        let list = Seats.seatedLayout(data)
        XCTAssertEqual(DirCells.firstEmpty(list, page: [0, 1, 2], perPage: 4), 1)
        let full = Seats.seatedLayout(book(["a", "b"]))
        XCTAssertEqual(DirCells.firstEmpty(full, page: [0, 1], perPage: 4), 2)
        XCTAssertEqual(DirCells.firstEmpty(full, page: [0, 1], perPage: 2), -1)
    }

    // MARK: 拖的時候整排怎麼換

    func testPlaceSwapsOnlyWithTheTileUnderneath() {
        let data = book(["a", "b", "c", "d", "e"])
        let list = Seats.seatedLayout(data)
        var drag = gridDrag("a", in: list)
        let first = DirCells.place(drag, page: 0, slot: 2, on: DirBoard(list: list, book: data, perPage: 4))
        XCTAssertEqual(first, ["c", "b", "@", "d", "e"])
        // 經過 c 再到 b：c 回自己那格，只有 b 跟拿起那格對調
        drag.cells = first
        let second = DirCells.place(drag, page: 0, slot: 1, on: DirBoard(list: list, book: data, perPage: 4))
        XCTAssertEqual(second, ["b", "@", "c", "d", "e"])
        // 停回拿起那格＝整排回到拿起時的樣子
        drag.cells = second
        XCTAssertEqual(DirCells.place(drag, page: 0, slot: 0, on: DirBoard(list: list, book: data, perPage: 4)), drag.base)
    }

    func testPlaceIntoEmptyCellLeavesHoleBehind() throws {
        let data = book(["a", "b", "c", "d", "e"])
        let list = Seats.seatedLayout(data)
        let drag = gridDrag("a", in: list)
        let cells = try XCTUnwrap(DirCells.place(drag, page: 1, slot: 2, on: DirBoard(list: list, book: data, perPage: 4)))
        XCTAssertEqual(cells.count, 7)
        XCTAssertTrue(Seats.isHole(cells[0]))
        XCTAssertEqual(Array(cells[1 ... 4]), ["b", "c", "d", "e"])
        XCTAssertTrue(Seats.isHole(cells[5]))
        XCTAssertEqual(cells[6], "@")
        // 畫出來：第一頁是空位＋b c d，第二頁是 e、空位、a
        var moved = drag
        moved.cells = cells
        let row = DirCells.flat(moved, list: list, book: data)
        XCTAssertEqual(row.map(\.entry.isHole), [true, false, false, false, false, true, false])
        XCTAssertEqual(row.last?.entry.id, "a")
        XCTAssertEqual(DirCells.paginate(row.map(\.entry), perPage: 4), [[0, 1, 2, 3], [4, 5, 6]])
        XCTAssertEqual(DirCells.keys(moved, row), cells)
    }

    func testPlaceRefusesFullOrMissingPage() {
        let data = book(["a", "b", "c", "d", "e"])
        let list = Seats.seatedLayout(data)
        let drag = gridDrag("a", in: list)
        XCTAssertNil(DirCells.place(drag, page: 1, slot: 4, on: DirBoard(list: list, book: data, perPage: 4)))
        XCTAssertNil(DirCells.place(drag, page: 3, slot: 0, on: DirBoard(list: list, book: data, perPage: 4)))
    }

    func testFlatDropsTrailingHolesAndBreaks() {
        let data = book(["a", "b"])
        let list = Seats.seatedLayout(data)
        var drag = gridDrag("a", in: list)
        drag.cells = ["@", "b", ".x", "|y"]
        XCTAssertEqual(DirCells.flat(drag, list: list, book: data).map(\.entry.id), ["a", "b"])
    }

    // MARK: 資料夾

    func testTakingOneOutOfTwoShowsTheOtherAlone() {
        let data = book(["a", "f1", "d"], folders: [Folder(id: "f1", name: "工作", ids: ["b", "c"])])
        let list = Seats.seatedLayout(data)
        XCTAssertEqual(list.map(\.id), ["a", "f1", "d"])
        var drag = DirDrag(id: "b", source: "f1", page: 0, cells: nil, inFolder: nil, folderSlot: 0, startSlot: 0)
        // 已經拖到資料夾外面：那格先畫成剩下的那張，格子表裡還是記資料夾
        let outside = DirCells.flat(drag, list: list, book: data)
        XCTAssertEqual(outside.map(\.entry.id), ["a", "c", "d"])
        XCTAssertEqual(DirCells.keys(drag, outside), ["a", "f1", "d"])
        // 手指還在資料夾裡：資料夾照樣是資料夾，只是少了手上那張
        drag.inFolder = "f1"
        let inside = DirCells.flat(drag, list: list, book: data)
        XCTAssertEqual(inside.map(\.entry.id), ["a", "f1", "d"])
        XCTAssertEqual(inside[1].entry.notes.map(\.id), ["c"])
    }

    func testFolderNotesPutsDraggedAtItsSlot() throws {
        let data = book(["f1"], folders: [Folder(id: "f1", name: "工作", ids: ["b", "c", "d"])])
        let entry = try XCTUnwrap(Seats.seatedLayout(data).first)
        XCTAssertEqual(DirCells.folderNotes(entry, drag: nil, book: data).map(\.id), ["b", "c", "d"])
        var drag = DirDrag(id: "b", source: "f1", page: 0, cells: nil, inFolder: "f1", folderSlot: 2, startSlot: 0)
        XCTAssertEqual(DirCells.folderNotes(entry, drag: drag, book: data).map(\.id), ["c", "d", "b"])
        drag.folderOrder = ["d", "c"]
        drag.folderSlot = 1
        XCTAssertEqual(DirCells.folderNotes(entry, drag: drag, book: data).map(\.id), ["d", "b", "c"])
        // 拖出去了：留在拿起那格（畫面上那層是藏起來的）
        drag.inFolder = nil
        drag.folderOrder = nil
        XCTAssertEqual(DirCells.folderNotes(entry, drag: drag, book: data).map(\.id), ["b", "c", "d"])
    }

    // MARK: 瞄哪

    private func gridGeo() -> DirGeo {
        var geo = DirGeo()
        geo.origin = CGPoint(x: 16, y: 200)
        geo.count = 5
        geo.cap = 12
        geo.last = 0
        geo.base = 0
        geo.width = 89
        return geo
    }

    /// 讓拖著那塊的方磚中心落在第 slot 格的正中間，再偏 dx、dy
    private func corner(_ slot: Int, dx: CGFloat = 0, dy: CGFloat = 0) -> CGPoint {
        let spot = metrics.slot(slot)
        return CGPoint(x: 16 + spot.x + dx, y: 200 + spot.y + dy)
    }

    private func aim(_ corner: CGPoint, _ geo: DirGeo, current: DirAim = .none) -> DirAim {
        DirCells.aim(corner: corner, finger: corner, geo: geo, metrics: metrics, current: current)
    }

    func testAimStacksWhenAlignedSwapsWhenPast() {
        let geo = gridGeo()
        XCTAssertEqual(aim(corner(0), geo), DirAim.none)
        XCTAssertEqual(aim(corner(1), geo), .stack(1))
        XCTAssertEqual(aim(corner(1, dx: 20), geo), .past(1))
        XCTAssertEqual(aim(corner(1, dy: 30), geo), .swap(1))
        // 已經準備疊了就放寬：同樣推過 20 點還算疊
        XCTAssertEqual(aim(corner(1, dx: 20), geo, current: .stack(1)), .stack(1))
        XCTAssertEqual(aim(corner(1, dx: 24), geo, current: .stack(1)), .past(1))
    }

    func testAimNeverStacksAFolder() {
        var geo = gridGeo()
        geo.holdingFolder = true
        XCTAssertEqual(aim(corner(1), geo), .swap(1))
    }

    func testAimEmptyCells() {
        var geo = gridGeo()
        XCTAssertEqual(aim(corner(6), geo), .cell(6))
        XCTAssertEqual(aim(corner(12), geo), DirAim.none)
        geo.holes = [1]
        XCTAssertEqual(aim(corner(1), geo), .cell(1))
    }

    func testAimComingBackToStartIsNotAStack() {
        var geo = gridGeo()
        geo.last = 2
        geo.base = 1
        XCTAssertEqual(aim(corner(1), geo), .swap(1))
    }

    func testAimInsideOpenFolder() {
        var geo = gridGeo()
        geo.folderOpen = true
        geo.box = CGRect(x: 45, y: 262, width: 299, height: 322)
        geo.folderCount = 4
        geo.folderLast = 2
        func inBox(_ slot: Int) -> CGPoint {
            let spot = metrics.slot(slot, cols: 3)
            return CGPoint(x: 45 + 16 + spot.x, y: 262 + 16 + spot.y)
        }
        let inside = CGPoint(x: 100, y: 300)
        XCTAssertEqual(DirCells.aim(corner: inBox(0), finger: inside, geo: geo, metrics: metrics, current: .none), .folderSwap(0))
        XCTAssertEqual(DirCells.aim(corner: inBox(2), finger: inside, geo: geo, metrics: metrics, current: .none), DirAim.none)
        XCTAssertEqual(DirCells.aim(corner: inBox(4), finger: inside, geo: geo, metrics: metrics, current: .none), .folderEnd)
        let outside = CGPoint(x: 100, y: 100)
        XCTAssertEqual(DirCells.aim(corner: inBox(0), finger: outside, geo: geo, metrics: metrics, current: .none), .out)
        geo.box = .zero
        XCTAssertEqual(DirCells.aim(corner: inBox(0), finger: inside, geo: geo, metrics: metrics, current: .none), DirAim.none)
    }
}

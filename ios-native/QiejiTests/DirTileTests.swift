@testable import Qieji
import XCTest

/// 點一下、瞄著、彈一下只改那塊磚；一頁沒變就不重算（2026-11-26 效能審查第 3 條）
final class DirTileTests: XCTestCase {
    private struct Rig {
        let model: DirModel
        let grid: DirGridView
        let notes: [String]
    }

    private func rig() -> Rig {
        let store = Store()
        let notes = (0 ..< 3).map { _ in store.makeNote(hole: nil, after: nil) }
        let model = DirModel(store: store)
        model.settle()
        let grid = DirGridView(frame: CGRect(x: 0, y: 0, width: 400, height: 400))
        grid.model = model
        model.pageGrids.add(grid)
        let page = DirPage(items: model.entries, currentID: nil, editing: false, dragID: nil, cell: 80)
        grid.show(page.slots(model), size: CGSize(width: 80, height: 100), calm: true, animated: false)
        return Rig(model: model, grid: grid, notes: notes)
    }

    func testHeldMovesFromTileToTile() {
        let rig = rig()
        let first = rig.notes[0], second = rig.notes[1]
        rig.model.heldID = first
        XCTAssertEqual(rig.grid.slot(first)?.held, true)
        XCTAssertEqual(rig.grid.slot(second)?.held, false)
        rig.model.heldID = second
        XCTAssertEqual(rig.grid.slot(first)?.held, false)
        XCTAssertEqual(rig.grid.slot(second)?.held, true)
        rig.model.heldID = nil
        XCTAssertEqual(rig.grid.slot(second)?.held, false)
    }

    func testStackAndPopGoStraightToTheTile() {
        let rig = rig()
        let first = rig.notes[0]
        rig.model.stackOn = first
        XCTAssertEqual(rig.grid.slot(first)?.target, true)
        rig.model.tilesQuiet = true
        rig.model.stackOn = nil
        rig.model.tilesQuiet = false
        XCTAssertEqual(rig.grid.slot(first)?.target, false)
        rig.model.popID = first
        XCTAssertEqual(rig.grid.slot(first)?.pop, true)
    }

    /// 資料夾開著時藏起來的磚：之後單改按著，也不會被放出來
    func testCoveredStaysWhenPressed() {
        let rig = rig()
        let first = rig.notes[0]
        rig.model.setCover(first, true)
        rig.model.heldID = first
        XCTAssertEqual(rig.grid.slot(first)?.covered, true)
        XCTAssertEqual(rig.grid.slot(first)?.held, true)
    }

    /// 正在看的那張、拖著的那張只算進有它的那頁：別頁比起來一樣，不用重算
    func testPageOnlyKeepsWhatIsOnIt() {
        let rig = rig()
        let items = rig.model.entries
        let here = DirPage(items: items, currentID: rig.notes[0], editing: false, dragID: rig.notes[1], cell: 80)
        XCTAssertEqual(here.currentID, rig.notes[0])
        XCTAssertEqual(here.dragID, rig.notes[1])
        let away = DirPage(items: items, currentID: "elsewhere", editing: false, dragID: "elsewhere", cell: 80)
        XCTAssertEqual(away, DirPage(items: items, currentID: "other", editing: false, dragID: nil, cell: 80))
        XCTAssertNotEqual(here, away)
    }

    func testSearchAsksOncePerQuery() {
        let rig = rig()
        rig.model.query = "x"
        let first = rig.model.searchHits()
        XCTAssertEqual(rig.model.searchSeen?.query, "x")
        XCTAssertEqual(rig.model.searchHits(), first)
        rig.model.query = ""
        XCTAssertTrue(rig.model.searchHits().isEmpty)
    }

    /// 拉把手只改面板的位置那一份
    func testPullOnlyMovesTheSlide() {
        let rig = rig()
        rig.model.screen = CGSize(width: 402, height: 874)
        rig.model.progress = 1
        rig.model.pull(Tok.Gesture.pullActivate + 50)
        XCTAssertLessThan(rig.model.slide.progress, 1)
        XCTAssertEqual(rig.model.progress, rig.model.slide.progress)
    }
}

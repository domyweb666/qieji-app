@testable import Qieji
import XCTest

/// 2026-11-25 按住一行：卡片放哪、收去哪、變暗的規矩、浮起的那一份
final class RowMenuTests: XCTestCase {
    private struct Paper {
        let list: LineListView
        let note: Note
        let window: UIWindow
    }

    private func paper(_ texts: [String]) -> Paper {
        var note = Note.blank(now: 1000)
        note.items = texts.map { Item(text: $0) }
        let list = LineListView(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        let window = UIWindow(frame: list.frame)
        window.addSubview(list)
        window.isHidden = false
        let items = LineListView.items(note)
        list.source = { items }
        list.apply(items, animated: false)
        list.layoutIfNeeded()
        return Paper(list: list, note: note, window: window)
    }

    // MARK: 卡片放哪

    private func place(_ top: CGFloat, _ tall: CGFloat) -> RowMenuPlace {
        RowMenuPlace(row: CGRect(x: 8, y: top, width: 386, height: tall), top: 62, bottom: 840)
    }

    /// 下面放得下就放下面、隔 8 點；剛好離安全區底 8 點也算放得下
    func testCardGoesBelowWhenItFits() {
        XCTAssertEqual(place(200, 52).spot(192).top, 260)
        XCTAssertTrue(place(200, 52).spot(192).below)
        let last = place(580, 52).spot(192) // 632 + 8 + 192 = 832 = 840 - 8
        XCTAssertEqual(last.top, 640)
        XCTAssertTrue(last.below)
    }

    /// 差一點點放不下就放上面、隔 8 點；卡片照實際的高算
    func testCardGoesAboveWhenItDoesNotFit() {
        let over = place(581, 52).spot(192)
        XCTAssertEqual(over.top, 381)
        XCTAssertFalse(over.below)
        XCTAssertFalse(place(500, 52).spot(300).below)
        XCTAssertTrue(place(500, 52).spot(48).below)
    }

    /// 上下都放不下：夾在安全區裡
    func testCardStaysInsideWhenTheRowIsHuge() {
        XCTAssertEqual(place(153, 1200).spot(192).top, 640)
        XCTAssertEqual(place(153, 1200).spot(900).top, 62)
    }

    // MARK: 收去哪

    func testLiftGoesHomeOnlyWhenTheRowIsNear() {
        XCTAssertEqual(RowExit.back(from: 300, to: 300), .home(0))
        XCTAssertEqual(RowExit.back(from: 300, to: 280), .home(-20))
        XCTAssertEqual(RowExit.back(from: 300, to: 300 + Tok.Motion.rowHomeMax), .home(Tok.Motion.rowHomeMax))
        XCTAssertEqual(RowExit.back(from: 300, to: 353), .fade)
        XCTAssertEqual(RowExit.back(from: 300, to: nil), .fade)
    }

    func testSeenTopFollowsTheList() throws {
        let page = paper((0 ..< 30).map { "第 \($0) 行" })
        let list = page.list, id = page.note.items[3].id
        let before = try XCTUnwrap(list.seenTop(id))
        list.contentOffset.y = 20
        list.layoutIfNeeded()
        XCTAssertEqual(list.seenTop(id), before - 20)
        list.live[id]?.leaving = true
        XCTAssertNil(list.seenTop(id))
        XCTAssertNil(list.seenTop("沒有這一行"))
        page.window.isHidden = true
    }

    // MARK: 按住變暗

    func testPressDarkensOnlyOnAPlainRow() {
        XCTAssertTrue(PressRule.darkens(PressRule.Touch()))
        XCTAssertFalse(PressRule.darkens(PressRule.Touch(onRow: false)))
        XCTAssertFalse(PressRule.darkens(PressRule.Touch(inGrip: true)))
        XCTAssertFalse(PressRule.darkens(PressRule.Touch(typing: true)))
        XCTAssertFalse(PressRule.darkens(PressRule.Touch(stopping: true)))
        XCTAssertFalse(PressRule.darkens(PressRule.Touch(landing: true)))
    }

    /// 移動超過按住容許的距離才算移走（斜的也照直線距離）
    func testPressLetsGoWhenTheFingerStrays() {
        let most = Tok.Gesture.longPressMove
        XCTAssertFalse(PressRule.strayed(from: .zero, to: CGPoint(x: most, y: 0)))
        XCTAssertTrue(PressRule.strayed(from: .zero, to: CGPoint(x: 0, y: most + 1)))
        XCTAssertTrue(PressRule.strayed(from: .zero, to: CGPoint(x: most * 0.8, y: most * 0.8)))
    }

    /// 變暗走完剛好是選單跳出來那一刻；這個手勢不擋任何別的手勢
    func testPressEndsWhenTheMenuComes() {
        XCTAssertEqual(Tok.Motion.rowPressWait + Tok.Motion.rowPressInSeconds, Tok.Gesture.longPress, accuracy: 0.001)
        let press = PressWatch()
        XCTAssertFalse(press.canPrevent(UITapGestureRecognizer()))
        XCTAssertFalse(press.cancelsTouchesInView)
        XCTAssertFalse(press.delaysTouchesEnded)
    }

    /// 回收的行不留著暗
    func testRecycledRowIsNotDark() throws {
        let page = paper(["一", "二"])
        let row = try XCTUnwrap(page.list.live[page.note.items[0].id])
        row.press(true)
        row.clear()
        page.window.layoutIfNeeded()
        XCTAssertEqual(row.seenShade, 0)
    }

    // MARK: 浮起的那一份

    /// 左右各裁 8 點、不含最下面那條格線；上面被擋住的那段不浮起
    func testLiftIsCutFromTheRow() throws {
        let page = paper(["一行", String(repeating: "很長的一行", count: 40)])
        let row = try XCTUnwrap(page.list.live[page.note.items[1].id])
        let whole = try XCTUnwrap(RowLiftView(row, paper: .white, cut: 0, fresh: true))
        XCTAssertEqual(whole.bounds.width, row.bounds.width - 16)
        XCTAssertEqual(whole.bounds.height, row.bounds.height - 1)
        let part = try XCTUnwrap(RowLiftView(row, paper: .white, cut: 100, fresh: true))
        XCTAssertEqual(part.bounds.height, row.bounds.height - 101)
        XCTAssertNil(RowLiftView(row, paper: .white, cut: row.bounds.height, fresh: true))
        page.window.isHidden = true
    }
}

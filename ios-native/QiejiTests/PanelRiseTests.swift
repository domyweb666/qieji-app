@testable import Qieji
import XCTest

/// ⋯「刪除這張」回目錄：面板要等下一格畫面才開始升（2.1 第 9 項）。
/// 只排到主佇列的話，從提示框按鈕刪除時主佇列比畫面先跑，面板那層讀到還沒改的位置、卡在螢幕外，只剩霧
final class PanelRiseTests: XCTestCase {
    func testRiseWaitsForNextFrame() {
        let store = Store()
        let keep = store.makeNote(hole: nil, after: nil)
        store.setTitle(keep, "留著的")
        let gone = store.makeNote(hole: nil, after: nil)
        store.setTitle(gone, "要刪的")
        let model = DirModel(store: store)
        model.screen = CGSize(width: 402, height: 874)
        model.gridFrame = CGRect(x: 0, y: 200, width: 402, height: 560)
        model.settle()
        store.open(gone)
        model.markOrigin(gone)

        model.trashPaper(gone)
        XCTAssertTrue(model.shown)
        XCTAssertEqual(model.progress, 0)

        // 主佇列跑一輪：這時還不准開始升（畫面可能還沒畫出起點）
        let hop = expectation(description: "主佇列一輪")
        DispatchQueue.main.async { hop.fulfill() }
        wait(for: [hop], timeout: 1)
        XCTAssertEqual(model.progress, 0)
        XCTAssertFalse(model.isOpen)

        // 下一格畫面：開始升（等兩格再看，同一格兩個計時器誰先不一定）
        let frames = expectation(description: "兩格")
        NextFrame.run { NextFrame.run { frames.fulfill() } }
        wait(for: [frames], timeout: 1)
        XCTAssertTrue(model.isOpen)
        XCTAssertEqual(model.progress, 1)
    }

    func testNextFrameRunsOnce() {
        var count = 0
        let ran = expectation(description: "跑了")
        NextFrame.run {
            count += 1
            ran.fulfill()
        }
        wait(for: [ran], timeout: 1)
        let later = expectation(description: "再等兩格")
        NextFrame.run { NextFrame.run { later.fulfill() } }
        wait(for: [later], timeout: 1)
        XCTAssertEqual(count, 1)
    }
}

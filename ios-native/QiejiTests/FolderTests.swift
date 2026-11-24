@testable import Qieji
import XCTest

/// 資料夾從磚放大（2026-11-25 規格 B）：進度、收去哪塊磚、落點的框、中途反悔
final class FolderTests: XCTestCase {
    private struct Rig {
        let model: DirModel
        let stage: FolderStage
        let window: UIWindow
        let folders: [String]
    }

    /// 兩個資料夾（各兩張）加幾張紙的目錄，面板停在全開
    private func rig(_ loose: Int = 3) throws -> Rig {
        let store = Store()
        let model = DirModel(store: store)
        var folders: [String] = []
        for _ in 0 ..< 2 {
            let first = store.makeNote(hole: nil, after: nil), second = store.makeNote(hole: nil, after: nil)
            var made: String?
            store.edit { book in made = Seats.newFolder(&book, noteID: first, now: Clock.now()).id }
            let id = try XCTUnwrap(made)
            store.edit { book in _ = Seats.intoFolder(&book, noteID: second, folderID: id, now: Clock.now()) }
            folders.append(id)
        }
        for _ in 0 ..< loose {
            _ = store.makeNote(hole: nil, after: nil)
        }
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
        model.screen = window.bounds.size
        model.gridFrame = CGRect(x: 0, y: 200, width: 402, height: 560)
        let stage = FolderStage(model)
        stage.frame = window.bounds
        window.addSubview(stage)
        window.isHidden = false
        model.folderStage = stage
        stage.prepare(cards: FolderStage.cardMax)
        model.settle()
        model.shown = true
        model.isOpen = true
        stage.sync()
        return Rig(model: model, stage: stage, window: window, folders: folders)
    }

    private func card(_ rig: Rig, _ id: String) throws -> FolderCard {
        try XCTUnwrap(rig.stage.cards.first { $0.id == id && !$0.isHidden })
    }

    // MARK: 進度

    /// 中途反悔：從現在的地方、帶著現在的速度，不跳；不過頭；會停在終點
    func testFlightTurnsWithoutJump() {
        let open = FolderFlight(from: 0, goal: 1)
        XCTAssertEqual(open.value(0), 0)
        XCTAssertEqual(open.value(open.span), 1)
        XCTAssertTrue(open.frames.allSatisfy { $0 >= 0 && $0 <= 1 })
        // 跟 dirPanel 同一個彈簧：0.06、0.12、0.2 秒走到比較頁的位置
        let pace = 2 * Double.pi / 0.34
        for time in [0.06, 0.12, 0.2] {
            XCTAssertEqual(Double(open.value(time)), 1 - exp(-pace * time) * (1 + pace * time), accuracy: 0.0001)
        }
        for time in [0.02, 0.08, 0.15] {
            let back = open.turned(to: 0, after: time)
            XCTAssertEqual(back.from, open.value(time))
            XCTAssertEqual(back.pace(0), open.pace(time))
            XCTAssertEqual(back.value(0.001), open.value(time + 0.001), accuracy: 0.003)
            XCTAssertEqual(back.value(back.span), 0)
            XCTAssertTrue(back.frames.allSatisfy { $0 > -0.001 && $0 <= 1 })
        }
        XCTAssertEqual(FolderFlight.still(1).turned(to: 0, after: 5).from, 1)
    }

    /// 收著＝方磚的位置、大小、圓角；開著＝定位的框、圓角 24
    func testPoseMatchesTileAndBox() {
        let home = CGRect(x: 214, y: 314, width: 64, height: 64), box = CGRect(x: 47, y: 301, width: 308, height: 330)
        let shut = FolderPose(home: home, box: box, at: 0), open = FolderPose(home: home, box: box, at: 1)
        XCTAssertEqual(shut.center, CGPoint(x: home.midX, y: home.midY))
        XCTAssertEqual(shut.scale.width * box.width, 64, accuracy: 0.001)
        XCTAssertEqual(shut.scale.height * box.height, 64, accuracy: 0.001)
        XCTAssertEqual(shut.radius * shut.scale.width, 14, accuracy: 0.001)
        XCTAssertEqual(open.center, CGPoint(x: box.midX, y: box.midY))
        XCTAssertEqual(open.scale, CGSize(width: 1, height: 1))
        XCTAssertEqual(open.radius, 24)
        XCTAssertEqual(FolderPose.late(0.35), 0)
        XCTAssertEqual(FolderPose.late(1), 1)
        XCTAssertEqual(FolderPose.cover(0), 1)
    }

    /// 收到一半磚換了位置：換的那一刻不跳，到 0 剛好在新的位置
    func testHomeMovesWithoutJump() {
        let old = CGRect(x: 10, y: 10, width: 64, height: 64), new = CGRect(x: 110, y: 210, width: 64, height: 64)
        let home = FolderHome(rect: old).moved(to: new, at: 0.6)
        XCTAssertEqual(home.rect(at: 0.6), old)
        XCTAssertEqual(home.rect(at: 0), new)
        XCTAssertEqual(FolderHome(rect: old).moved(to: old, at: 0.6).old, nil)
    }

    // MARK: 收去哪塊磚

    func testHomeFollowsWhereTheTileIsNow() throws {
        let rig = try rig()
        let model = rig.model, id = rig.folders[0]
        func spot() throws -> CGRect {
            let slot = try XCTUnwrap(model.pages[model.page].firstIndex { $0.id == id })
            let at = model.metrics.slot(slot), side = model.metrics.side
            return CGRect(
                x: model.gridOrigin.x + at.x + (model.cellWidth - side) / 2, y: model.gridOrigin.y + at.y, width: side, height: side
            )
        }
        let before = try XCTUnwrap(model.folderHome(id))
        XCTAssertEqual(before, try spot())
        // 改過排列：跟著去新的位置
        model.moveBy(id, 1)
        model.moveBy(id, 1)
        let after = try XCTUnwrap(model.folderHome(id))
        XCTAssertNotEqual(before, after)
        XCTAssertEqual(after, try spot())
        rig.window.isHidden = true
    }

    /// 翻到別頁、在搜尋、資料夾不在了：沒有磚可以縮回去
    func testHomeIsGoneOffThePage() throws {
        let rig = try rig(30)
        let model = rig.model
        let page = try XCTUnwrap(model.pages.firstIndex { $0.contains { $0.id == rig.folders[0] } })
        model.page = page
        XCTAssertNotNil(model.folderHome(rig.folders[0]))
        model.page = page == 0 ? 1 : 0
        XCTAssertNil(model.folderHome(rig.folders[0]))
        model.page = page
        model.query = "找"
        XCTAssertNil(model.folderHome(rig.folders[0]))
        model.query = ""
        XCTAssertNil(model.folderHome("沒有這個"))
        rig.window.isHidden = true
    }

    /// 磚不在畫面上：框不縮，改淡出；磚馬上放出來
    func testClosesByFadingWhenTileIsOffThePage() throws {
        let rig = try rig(30)
        let model = rig.model, id = rig.folders[0]
        model.page = try XCTUnwrap(model.pages.firstIndex { $0.contains { $0.id == id } })
        model.showFolder(id)
        rig.stage.step(at: CACurrentMediaTime() + 5)
        let box = try card(rig, id)
        model.page = model.page == 0 ? 1 : 0
        model.closeFolder()
        XCTAssertEqual(box.grow, .still(1))
        XCTAssertEqual(box.show.goal, 0)
        XCTAssertFalse(model.folderCovers.contains(id))
        rig.stage.step(at: CACurrentMediaTime() + 5)
        XCTAssertTrue(box.isHidden)
        rig.window.isHidden = true
    }

    // MARK: 開著、開的途中

    /// 一打開落點就照定位的框算，框裡的磚馬上點得到
    func testBoxIsInPlaceWhileOpening() throws {
        let rig = try rig()
        let model = rig.model, id = rig.folders[1]
        XCTAssertEqual(model.folderBox, .zero)
        model.showFolder(id)
        let box = try card(rig, id)
        XCTAssertTrue(box.moving)
        XCTAssertEqual(box.grow, FolderFlight(from: 0, goal: 1))
        XCTAssertTrue(model.folderCovers.contains(id))
        let rest = model.folderBox
        XCTAssertEqual(rest, model.folderPlace.box)
        XCTAssertEqual(rest.midX, 201, accuracy: 0.5)
        let first = CGPoint(x: rest.minX + Tok.Space.lg + model.cellWidth / 2, y: rest.minY + Tok.Space.lg + 10)
        XCTAssertEqual(model.hit(.folder, first)?.id, model.folderList.first?.id)
        // 手指碰得到的就是定位的捲動區；框外是「點了就收」
        XCTAssertTrue(rig.stage.hitTest(first, with: nil)?.isDescendant(of: box) ?? false)
        XCTAssertFalse(rig.stage.hitTest(CGPoint(x: 20, y: 120), with: nil)?.isDescendant(of: box) ?? true)
        rig.stage.step(at: CACurrentMediaTime() + 5)
        XCTAssertFalse(box.moving)
        XCTAssertEqual(model.folderBox, rest)
        rig.window.isHidden = true
    }

    /// 刪除這張回到打開的資料夾（QC-0002）：直接開著，不放大
    func testComingBackToFolderIsInstant() throws {
        let rig = try rig()
        let model = rig.model, id = rig.folders[0]
        model.shown = false
        model.isOpen = false
        model.open(at: DirModel.Origin(id: "x", page: 0, folder: id))
        let box = try card(rig, id)
        XCTAssertTrue(box.up)
        XCTAssertFalse(box.moving)
        XCTAssertEqual(box.grow, .still(1))
        // 目錄收完：資料夾也直接收掉
        model.isOpen = false
        model.openFolder = nil
        XCTAssertTrue(box.isHidden)
        XCTAssertTrue(model.folderCovers.isEmpty)
        rig.window.isHidden = true
    }

    /// 開到一半收、收到一半又開、最後收完：狀態都對
    func testChangingMindMidway() throws {
        let rig = try rig()
        let model = rig.model, id = rig.folders[0], far = CACurrentMediaTime() + 5
        model.showFolder(id)
        let box = try card(rig, id)
        model.closeFolder()
        XCTAssertFalse(box.up)
        XCTAssertEqual(box.grow.goal, 0)
        XCTAssertLessThan(box.grow.from, 1)
        // 收的時候手指馬上碰得到後面的目錄
        XCTAssertNil(rig.stage.hitTest(CGPoint(x: 201, y: 437), with: nil))
        XCTAssertTrue(model.folderCovers.contains(id))
        model.showFolder(id)
        XCTAssertTrue(box.up)
        XCTAssertEqual(box.grow.goal, 1)
        XCTAssertEqual(try card(rig, id), box)
        rig.stage.step(at: far)
        XCTAssertTrue(box.up)
        XCTAssertFalse(box.moving)
        model.closeFolder()
        XCTAssertEqual(box.grow.from, 1)
        rig.stage.step(at: far + 5)
        XCTAssertTrue(box.isHidden)
        XCTAssertFalse(model.folderCovers.contains(id))
        rig.window.isHidden = true
    }

    /// 收到一半點另一個資料夾：舊的自己縮完，新的照樣放大、點得到
    func testOpeningAnotherWhileClosing() throws {
        let rig = try rig()
        let model = rig.model
        model.showFolder(rig.folders[0])
        rig.stage.step(at: CACurrentMediaTime() + 5)
        let old = try card(rig, rig.folders[0])
        model.closeFolder()
        model.showFolder(rig.folders[1])
        let new = try card(rig, rig.folders[1])
        XCTAssertFalse(old === new)
        XCTAssertTrue(old.moving)
        XCTAssertEqual(old.grow.goal, 0)
        XCTAssertTrue(new.up)
        let rest = model.folderBox
        let first = CGPoint(x: rest.minX + Tok.Space.lg + model.cellWidth / 2, y: rest.minY + Tok.Space.lg + 10)
        XCTAssertTrue(rig.stage.hitTest(first, with: nil)?.isDescendant(of: new) ?? false)
        rig.stage.step(at: CACurrentMediaTime() + 5)
        XCTAssertTrue(old.isHidden)
        XCTAssertTrue(new.up)
        XCTAssertEqual(model.folderCovers, [rig.folders[1]])
        rig.window.isHidden = true
    }

    /// 從資料夾拿起拖到外面：框收起來，但捲動區（掛著手勢）留到放手
    func testDraggingOutKeepsTheScrollView() throws {
        let rig = try rig()
        let model = rig.model, id = rig.folders[0]
        model.showFolder(id)
        rig.stage.step(at: CACurrentMediaTime() + 5)
        let box = try card(rig, id), note = try XCTUnwrap(model.folderList.first)
        model.scene.drag = DirDrag(id: note.id, source: id, page: 0, cells: model.entries.map(\.id), inFolder: nil)
        rig.stage.sync()
        XCTAssertTrue(model.folderHidden)
        XCTAssertFalse(box.up)
        rig.stage.step(at: CACurrentMediaTime() + 5)
        XCTAssertFalse(box.isHidden)
        XCTAssertNotNil(box.scroll.window)
        XCTAssertNil(rig.stage.hitTest(CGPoint(x: 201, y: 437), with: nil))
        model.scene.drag = nil
        model.openFolder = nil
        XCTAssertTrue(box.isHidden)
        XCTAssertTrue(model.folderCovers.isEmpty)
        rig.window.isHidden = true
    }
}

@testable import Qieji
import XCTest

/// ⋯「刪除這張」回到目錄時站回原本的地方（2.1 第 8 項，接 QC-0002）：資料夾第幾頁、搜尋的字
final class BackSpotTests: XCTestCase {
    private struct Rig {
        let store: Store
        let model: DirModel
        let stage: FolderStage
        let window: UIWindow
        let folder: String
        let inside: [String] // 資料夾裡的紙，照順序
    }

    /// 一個資料夾（inside 張）加幾張散的紙，面板停在全開。每張都有名字，換張時才不會被當成空白的紙收掉
    private func rig(inside count: Int, loose: Int = 3, folderLast: Bool = false) throws -> Rig {
        let store = Store()
        let model = DirModel(store: store)
        func makeLoose() {
            for index in 0 ..< loose {
                let id = store.makeNote(hole: nil, after: nil)
                store.setTitle(id, "散的 \(index)")
            }
        }
        if folderLast {
            makeLoose()
        }
        var ids: [String] = []
        // 排在最後一格（不然新紙的位置看建立時間，同一毫秒建的先後不一定）
        let tail = folderLast ? Seats.seatedEntries(store.book).last?.id : nil
        for index in 0 ..< count {
            let id = store.makeNote(hole: nil, after: index == 0 ? tail : nil)
            store.setTitle(id, "夾裡 \(index)")
            ids.append(id)
        }
        var made: String?
        store.edit { book in made = Seats.newFolder(&book, noteID: ids[0], now: Clock.now()).id }
        let folder = try XCTUnwrap(made)
        for id in ids.dropFirst() {
            store.edit { book in _ = Seats.intoFolder(&book, noteID: id, folderID: folder, now: Clock.now()) }
        }
        if !folderLast {
            makeLoose()
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
        return Rig(store: store, model: model, stage: stage, window: window, folder: folder, inside: ids)
    }

    private func card(_ rig: Rig) throws -> FolderCard {
        try XCTUnwrap(rig.stage.cards.first { $0.id == rig.folder && !$0.isHidden })
    }

    /// 打開資料夾、翻到第 page 頁（跟手指翻頁一樣：捲動區先動，再回報頁數）
    private func openFolder(_ rig: Rig, page: Int) {
        rig.model.showFolder(rig.folder)
        rig.model.folderTouch.scroll(toPage: page, animated: false)
        rig.model.scrolled(.folder, to: page)
    }

    /// 點了一張、目錄收完（收完會把資料夾、搜尋的字都清掉）
    private func pickAndLeave(_ model: DirModel, _ id: String) {
        model.pick(id)
        model.shown = false
        model.isOpen = false
        model.openFolder = nil
        model.query = ""
    }

    private func entry(_ rig: Rig) throws -> Seats.Entry {
        try XCTUnwrap(rig.model.entries.first { $0.id == rig.folder && $0.folder != nil })
    }

    // MARK: 資料夾第幾頁

    /// 資料夾第二頁點進來的：回來開在第二頁（頁點、捲動區都在第二頁）
    func testTrashFromFolderSecondPageReturnsThere() throws {
        let rig = try rig(inside: DirMetrics.folderPer + 2)
        let model = rig.model
        openFolder(rig, page: 1)
        let gone = rig.inside[DirMetrics.folderPer]
        pickAndLeave(model, gone)
        model.trashPaper(gone)
        XCTAssertTrue(model.shown)
        XCTAssertEqual(model.openFolder?.id, rig.folder)
        XCTAssertEqual(model.folderPage, 1)
        XCTAssertEqual(try model.folderLook(entry(rig)).page, 1)
        let box = try card(rig)
        XCTAssertGreaterThan(box.scroll.bounds.width, 0)
        XCTAssertEqual(box.scroll.contentOffset.x, box.scroll.bounds.width, accuracy: 0.5)
        // 捲動區晚一格才回報頁數：回報完還是第二頁
        RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        XCTAssertEqual(model.folderPage, 1)
        XCTAssertEqual(box.scroll.contentOffset.x, box.scroll.bounds.width, accuracy: 0.5)
        // 按復原：人留在目錄、資料夾還開在第二頁
        rig.store.toast?.undo?()
        XCTAssertEqual(rig.store.book.note(gone)?.deleted, false)
        XCTAssertTrue(model.shown)
        XCTAssertEqual(model.openFolder?.id, rig.folder)
        XCTAssertEqual(model.folderPage, 1)
        rig.window.isHidden = true
    }

    /// 第二頁只有被刪的那張：那頁不在了，退到最後一頁（第一頁）
    func testTrashOnlyOnFolderPageFallsBackAPage() throws {
        let rig = try rig(inside: DirMetrics.folderPer + 1)
        let model = rig.model
        openFolder(rig, page: 1)
        let gone = rig.inside[DirMetrics.folderPer]
        pickAndLeave(model, gone)
        model.trashPaper(gone)
        XCTAssertEqual(model.openFolder?.id, rig.folder)
        XCTAssertEqual(model.folderPage, 0)
        XCTAssertEqual(try card(rig).scroll.contentOffset.x, 0, accuracy: 0.5)
        rig.window.isHidden = true
    }

    /// 三頁的資料夾、從第三頁點進來，刪掉後只剩兩頁：退到第二頁
    func testTrashOnThirdPageFallsBackToSecond() throws {
        let rig = try rig(inside: DirMetrics.folderPer * 2 + 1)
        let model = rig.model
        openFolder(rig, page: 2)
        let gone = rig.inside[DirMetrics.folderPer * 2]
        pickAndLeave(model, gone)
        model.trashPaper(gone)
        XCTAssertEqual(model.openFolder?.id, rig.folder)
        XCTAssertEqual(model.folderPage, 1)
        let box = try card(rig)
        XCTAssertEqual(box.scroll.contentOffset.x, box.scroll.bounds.width, accuracy: 0.5)
        rig.window.isHidden = true
    }

    /// 資料夾裡只有那一張，刪了資料夾就不在：不打開資料夾，目錄停在資料夾原本那頁
    func testTrashLastInFolderStaysOnGridPage() throws {
        let rig = try rig(inside: 1, loose: 40, folderLast: true)
        let model = rig.model
        let last = model.pages.count - 1
        XCTAssertGreaterThan(last, 0)
        XCTAssertTrue(model.pages[last].contains { $0.id == rig.folder })
        model.page = last
        openFolder(rig, page: 0)
        let gone = rig.inside[0]
        pickAndLeave(model, gone)
        model.trashPaper(gone)
        XCTAssertTrue(model.shown)
        XCTAssertNil(model.openFolder)
        XCTAssertGreaterThan(model.page, 0)
        XCTAssertEqual(model.page, min(last, model.pages.count - 1))
        rig.window.isHidden = true
    }

    // MARK: 目錄第幾頁（照舊）

    /// 目錄第二頁點進來的：回到第二頁、沒有搜尋的字
    func testTrashFromGridPageReturnsToPage() throws {
        let rig = try rig(inside: 2, loose: 40)
        let model = rig.model
        XCTAssertGreaterThan(model.pages.count, 1)
        model.page = 1
        let gone = try XCTUnwrap(model.pages[1].first { $0.note != nil && $0.folder == nil }?.id)
        pickAndLeave(model, gone)
        model.trashPaper(gone)
        XCTAssertTrue(model.shown)
        XCTAssertEqual(model.page, 1)
        XCTAssertNil(model.openFolder)
        XCTAssertEqual(model.query, "")
        rig.window.isHidden = true
    }

    // MARK: 搜尋

    private struct Shelf {
        let store: Store
        let model: DirModel
        let ids: [String]
    }

    private func searchBook() -> Shelf {
        let store = Store()
        var ids: [String] = []
        for title in ["蘋果清單", "蘋果派", "香蕉"] {
            let id = store.makeNote(hole: nil, after: nil)
            store.setTitle(id, title)
            ids.append(id)
        }
        let model = DirModel(store: store)
        model.open()
        return Shelf(store: store, model: model, ids: ids)
    }

    /// 搜尋結果點進來的：回來搜尋框還是那些字，結果照樣列著、少了被刪的那張
    func testTrashFromSearchKeepsWords() {
        let shelf = searchBook(), store = shelf.store, model = shelf.model, ids = shelf.ids
        model.query = "蘋果 "
        XCTAssertEqual(model.searchHits().map(\.note.id), [ids[0], ids[1]])
        pickAndLeave(model, ids[1])
        model.trashPaper(ids[1])
        XCTAssertTrue(model.shown)
        XCTAssertEqual(model.query, "蘋果 ")
        XCTAssertTrue(model.searching)
        XCTAssertEqual(model.searchHits().map(\.note.id), [ids[0]])
        // 按復原：人留在目錄，字還在，那張又列回來
        store.toast?.undo?()
        XCTAssertTrue(model.shown)
        XCTAssertEqual(model.query, "蘋果 ")
        XCTAssertEqual(model.searchHits().map(\.note.id), [ids[0], ids[1]])
    }

    /// 刪的是唯一的結果：字還在，顯示沒有結果
    func testTrashOnlySearchHitKeepsWordsWithNothing() {
        let shelf = searchBook(), model = shelf.model, ids = shelf.ids
        model.query = "香蕉"
        pickAndLeave(model, ids[2])
        model.trashPaper(ids[2])
        XCTAssertTrue(model.shown)
        XCTAssertEqual(model.query, "香蕉")
        XCTAssertTrue(model.searchHits().isEmpty)
    }

    /// 搜尋時按 ＋ 開的新紙不是從搜尋結果來的：回來照舊，不帶字
    func testNewPaperWhileSearchingDoesNotKeepWords() {
        let shelf = searchBook(), store = shelf.store, model = shelf.model
        model.query = "蘋果"
        model.add()
        let made = store.currentID ?? ""
        store.setTitle(made, "新的")
        model.shown = false
        model.isOpen = false
        model.query = ""
        model.trashPaper(made)
        XCTAssertTrue(model.shown)
        XCTAssertEqual(model.query, "")
    }

    /// 搜尋結果點進來、後來換到別張又換回來：不是從目錄來的了，目錄不升起
    func testSearchOriginForgottenAfterSwitching() {
        let shelf = searchBook(), store = shelf.store, model = shelf.model, ids = shelf.ids
        model.query = "蘋果"
        pickAndLeave(model, ids[1])
        store.open(ids[2])
        store.open(ids[1])
        model.trashPaper(ids[1])
        XCTAssertFalse(model.shown)
        XCTAssertEqual(model.query, "")
    }
}

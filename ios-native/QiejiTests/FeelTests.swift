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

    // MARK: 刪除這張回到哪（QC-0002）

    /// 從目錄點進來的：刪除回到目錄，復原時人留在目錄
    func testTrashFromDirReturnsToDir() {
        let store = Store()
        let keep = store.makeNote(hole: nil, after: nil), gone = store.makeNote(hole: nil, after: nil)
        store.setTitle(keep, "留著")
        store.setTitle(gone, "要刪的")
        store.open(keep)
        let model = DirModel(store: store)
        model.pick(gone)
        XCTAssertFalse(model.shown)
        model.trashPaper(gone)
        XCTAssertTrue(model.shown)
        XCTAssertEqual(store.book.note(gone)?.deleted, true)
        XCTAssertEqual(store.currentID, keep)
        store.toast?.undo?()
        XCTAssertEqual(store.book.note(gone)?.deleted, false)
        XCTAssertEqual(store.currentID, keep)
    }

    /// 不是從目錄點進來的（目錄點過、後來又用別的路打開也算）：目錄不升起
    func testTrashAfterSwitchingDoesNotOpenDir() {
        let store = Store()
        let keep = store.makeNote(hole: nil, after: nil), gone = store.makeNote(hole: nil, after: nil)
        store.setTitle(keep, "留著")
        store.setTitle(gone, "要刪的")
        let model = DirModel(store: store)
        model.pick(gone)
        store.open(keep)
        store.open(gone)
        model.trashPaper(gone)
        XCTAssertFalse(model.shown)
        XCTAssertEqual(store.currentID, keep)
    }

    /// 從資料夾裡點進來的：回到那個打開的資料夾
    func testTrashFromFolderReturnsToFolder() throws {
        let store = Store()
        let keep = store.makeNote(hole: nil, after: nil), gone = store.makeNote(hole: nil, after: nil)
        store.setTitle(keep, "留著")
        store.setTitle(gone, "要刪的")
        let model = DirModel(store: store)
        model.open()
        model.makeFolder(for: keep)
        let folder = try XCTUnwrap(model.openFolder?.id)
        model.moveInto(gone, folder: folder)
        model.pick(gone)
        model.shown = false // 收完了
        model.openFolder = nil
        model.trashPaper(gone)
        XCTAssertTrue(model.shown)
        XCTAssertEqual(model.openFolder?.id, folder)
    }

    // MARK: 面板往下拉（2026-11-25 手感審查 #2、#6）

    /// 放手：拉夠了或往下甩才收；往上甩回去，拉再多也不收；手指停住放開的小晃不算往上甩
    func testPullCloses() {
        XCTAssertTrue(Motions.pullCloses(61, speed: 0, over: 400))
        XCTAssertFalse(Motions.pullCloses(59, speed: 0, over: 400))
        XCTAssertTrue(Motions.pullCloses(20, speed: 600, over: 400))
        XCTAssertFalse(Motions.pullCloses(300, speed: -600, over: 400))
        XCTAssertTrue(Motions.pullCloses(300, speed: -20, over: 400))
    }

    private func openDir() -> DirModel {
        let model = DirModel(store: Store())
        model.open()
        model.progress = 1
        model.isOpen = true
        return model
    }

    /// 目錄的把手：起動的 10 點扣掉，不先跳一格；往上拉停在全開
    func testDirPullSkipsTheSlop() {
        let model = openDir()
        model.fading = false
        model.pull(Tok.Gesture.pullActivate)
        XCTAssertEqual(model.progress, 1)
        model.pull(Tok.Gesture.pullActivate + 50)
        XCTAssertEqual((1 - model.progress) * model.travel, 50, accuracy: 0.01)
        model.pull(-80)
        XCTAssertEqual(model.progress, 1)
    }

    func testDirPullEndLooksAtTheWayTheFingerGoes() {
        let model = openDir()
        model.fading = false
        model.pull(model.travel / 2)
        model.pullEnd(model.travel / 2, velocity: -600)
        XCTAssertTrue(model.isOpen)
        XCTAssertEqual(model.progress, 1)
        model.pull(model.travel / 2)
        model.pullEnd(model.travel / 2, velocity: 0)
        XCTAssertFalse(model.isOpen)
    }

    /// 把手：走不到 10 點放手是點一下、收起；拉了一小段放手、拉出去又拉回原點放手都彈回
    func testDirGrabTellsTapFromPull() {
        let model = openDir()
        model.fading = false
        model.grabMoved(.zero)
        model.grabMoved(CGSize(width: 0, height: 40))
        model.grabEnded(CGSize(width: 0, height: 40), velocity: 0)
        XCTAssertTrue(model.isOpen)
        model.grabMoved(.zero)
        model.grabMoved(CGSize(width: 0, height: 60))
        model.grabMoved(CGSize(width: 0, height: 2))
        model.grabEnded(CGSize(width: 0, height: 2), velocity: 0)
        XCTAssertTrue(model.isOpen)
        model.grabMoved(.zero)
        model.grabEnded(CGSize(width: 0, height: 4), velocity: 0)
        XCTAssertFalse(model.isOpen)
    }

    /// 減少動態（用淡的那次）：面板照樣跟手、不變淡；彈回歸零，收起留在拉到的地方淡掉
    func testDirPullFollowsWhenFading() {
        let model = openDir()
        model.fading = true
        model.pull(Tok.Gesture.pullActivate + 50)
        XCTAssertEqual(model.progress, 1)
        XCTAssertEqual(model.pulled, 50)
        model.pullEnd(60, velocity: 0)
        XCTAssertTrue(model.isOpen)
        XCTAssertEqual(model.pulled, 0)
        model.pull(Tok.Gesture.pullActivate + 300)
        model.pullEnd(Tok.Gesture.pullActivate + 300, velocity: 0)
        XCTAssertFalse(model.isOpen)
        XCTAssertEqual(model.pulled, 300)
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

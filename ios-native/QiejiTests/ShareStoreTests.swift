@testable import Qieji
import XCTest

/// 收件匣接上 Store：什麼時候併、什麼時候刪檔、名字什麼時候推
final class ShareStoreTests: XCTestCase {
    private var root = URL(fileURLWithPath: NSTemporaryDirectory())
    private var defaults = UserDefaults.standard
    private let suite = "qieji.tests.sharestore"

    private var folder: URL {
        root.appendingPathComponent("group/Inbox")
    }

    private var nativeDir: URL {
        root.appendingPathComponent("native")
    }

    private var inbox: ShareInbox {
        let folder = folder, defaults = defaults
        return ShareInbox(folder: { folder }, settings: { defaults })
    }

    override func setUp() {
        super.setUp()
        root = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("qieji-\(UUID().uuidString)")
        UserDefaults().removePersistentDomain(forName: suite)
        defaults = UserDefaults(suiteName: suite) ?? .standard
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: root)
        UserDefaults().removePersistentDomain(forName: suite)
        super.tearDown()
    }

    private func disk() -> Disk {
        Disk(dir: nativeDir, legacyDirs: [], defaults: defaults)
    }

    private func note(_ id: String, updated: Double = 1000) -> Note {
        var note = Note.blank(now: updated)
        note.id = id
        note.title = id
        note.items = [Item(id: "\(id)-0", text: "舊的")]
        return note
    }

    private func store(_ notes: [Note], last: String = "aaa") -> Store {
        let store = Store(disk: disk())
        store.inbox = inbox
        var book = Notebook()
        book.notes = notes
        Seats.fixOrder(&book)
        store.adopt(book, last: last)
        return store
    }

    @discardableResult
    private func share(_ texts: [String], note: String? = nil) throws -> ShareEntry {
        let entry = try XCTUnwrap(ShareEntry.make(texts, note: note))
        XCTAssertTrue(inbox.write(entry))
        return entry
    }

    private func left() -> Int {
        (try? FileManager.default.contentsOfDirectory(atPath: folder.path).count) ?? 0
    }

    private func texts(_ store: Store, _ id: String = "aaa") -> [String] {
        store.book.note(id)?.items.map(\.text) ?? []
    }

    private func saved(_ id: String = "aaa") -> [String] {
        disk().load().book.note(id)?.items.map(\.text) ?? []
    }

    @MainActor
    private func waitUntil(_ what: String, timeout: Double = 8, _ done: () -> Bool) async {
        let end = Date().addingTimeInterval(timeout)
        while !done() {
            if Date() > end {
                XCTFail("等不到：\(what)")
                return
            }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    @MainActor
    private func rest() async {
        try? await Task.sleep(nanoseconds: 300_000_000)
    }

    // MARK: 併進紙

    @MainActor
    func testMergesIntoCurrentAndRemovesFile() async throws {
        let store = store([note("aaa")])
        let entry = try share(["牛奶"], note: "aaa")
        store.takeInbox()
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(texts(store), ["牛奶", "舊的"])
        XCTAssertEqual(saved(), ["牛奶", "舊的"])
        XCTAssertNil(store.toast)
        let current = try XCTUnwrap(store.current)
        XCTAssertEqual(store.takeLanded(in: current), entry.lines[0].id)
        XCTAssertNil(store.takeLanded(in: current))
    }

    @MainActor
    func testTellsWhenItLandedElsewhere() async throws {
        let store = store([note("aaa"), note("bbb"), note("ccc")])
        try share(["牛奶"], note: "bbb")
        store.takeInbox()
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(store.toast?.text, Words.landedIn("bbb"))
        XCTAssertEqual(store.currentID, "aaa")
        XCTAssertNil(store.landed)
        try share(["蛋"], note: "bbb")
        try share(["蔥"], note: "ccc")
        store.takeInbox()
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(store.toast?.text, Words.landedMany(2))
    }

    /// 打開 app 與回到前景幾乎同時叫；收的時候又分享了一則
    @MainActor
    func testTwoCallsAtOnceMergeOnce() async throws {
        let store = store([note("aaa")])
        for round in 0 ..< 10 {
            try share(["第 \(round) 則"])
            store.takeInbox()
            store.takeInbox()
            try share(["第 \(round) 則之後"])
            store.takeInbox()
            await waitUntil("檔刪掉") { left() == 0 }
        }
        await rest()
        XCTAssertEqual(texts(store).count, 21)
        XCTAssertEqual(Set(texts(store)).count, 21)
        XCTAssertEqual(saved().count, 21)
        XCTAssertTrue(store.inboxGate.enter())
    }

    /// 存失敗：檔留著、字在記憶體裡只有一行；存得進去之後再來，還是一行，檔才刪
    @MainActor
    func testSaveFailureKeepsFileAndNeverDoubles() async throws {
        let store = store([note("aaa")])
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try Data().write(to: nativeDir) // 存檔資料夾的位置是一個檔：怎麼寫都會失敗
        try share(["牛奶"])
        store.takeInbox()
        await waitUntil("跳提示") { store.notice != nil }
        await rest()
        XCTAssertEqual(left(), 1)
        XCTAssertEqual(texts(store), ["牛奶", "舊的"])
        store.takeInbox()
        await rest()
        XCTAssertEqual(left(), 1)
        XCTAssertEqual(texts(store), ["牛奶", "舊的"])
        try FileManager.default.removeItem(at: nativeDir)
        store.takeInbox()
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(texts(store), ["牛奶", "舊的"])
        XCTAssertEqual(saved(), ["牛奶", "舊的"])
    }

    /// 存好了、檔還沒刪就被關掉：下次打開不再加，檔照樣刪。那行已經刪到最近刪除也一樣
    @MainActor
    func testKilledBeforeRemoveDoesNotDouble() async throws {
        let first = store([note("aaa")])
        let entry = try share(["牛奶"])
        first.takeInbox()
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertTrue(inbox.write(entry))
        let again = Store(disk: disk())
        again.inbox = inbox
        again.boot()
        again.takeInbox()
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(texts(again), ["牛奶", "舊的"])
        XCTAssertNil(again.toast)
        XCTAssertTrue(inbox.write(entry))
        again.binLine(entry.lines[0].id)
        again.takeInbox()
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(texts(again), ["舊的"])
        XCTAssertEqual(again.current?.bin.count, 1)
    }

    /// 紙還沒讀、存檔讀不出來（不准寫檔）、沒有存檔：不併、不刪
    @MainActor
    func testDoesNothingWhenItMustNotWrite() async throws {
        try share(["牛奶"])
        let early = Store(disk: disk())
        early.inbox = inbox
        early.takeInbox()
        let frozen = store([note("aaa")])
        frozen.frozen = true
        frozen.takeInbox()
        let demo = Store()
        demo.inbox = inbox
        demo.adopt(frozen.book, last: "aaa")
        demo.takeInbox()
        let off = store([note("aaa")])
        off.inbox = .off
        off.takeInbox()
        await rest()
        XCTAssertEqual(left(), 1)
        for one in [frozen, demo, off] {
            XCTAssertEqual(texts(one), ["舊的"])
        }
        XCTAssertTrue(early.book.notes.isEmpty)
    }

    @MainActor
    func testBadFilesDoNotBlockGoodOnes() async throws {
        let store = store([note("aaa")])
        let names = try ShareTests.writeBad(to: folder)
        try share(["好的"])
        store.takeInbox()
        await waitUntil("好的那個刪掉") { left() == names.count }
        XCTAssertEqual(texts(store), ["好的", "舊的"])
        store.takeInbox()
        await rest()
        XCTAssertEqual(texts(store), ["好的", "舊的"])
        XCTAssertEqual(left(), names.count)
    }

    /// 正在拖東西：等放手才併
    @MainActor
    func testWaitsForTheFinger() async throws {
        let store = store([note("aaa")])
        var dragging = true
        store.inboxHold = { dragging }
        try share(["牛奶"])
        store.takeInbox()
        await rest()
        XCTAssertEqual(texts(store), ["舊的"])
        XCTAssertEqual(left(), 1)
        dragging = false
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(texts(store), ["牛奶", "舊的"])
    }

    /// 打到一半的字不動
    @MainActor
    func testDraftIsLeftAlone() async throws {
        let store = store([note("aaa")])
        store.draft = "打到一半"
        try share(["牛奶"])
        store.takeInbox()
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(store.draft, "打到一半")
        XCTAssertEqual(store.composeAsk, 0)
        XCTAssertEqual(store.seekAsk, 0)
    }

    // MARK: 清除

    @MainActor
    func testWipeClearsInboxAndName() async throws {
        let store = store([note("aaa")])
        store.pushTarget(now: true)
        XCTAssertEqual(inbox.target()?.title, "aaa")
        try share(["牛奶"])
        XCTAssertTrue(store.wipe())
        XCTAssertNil(inbox.target())
        XCTAssertEqual(left(), 0)
        // 之後推的是新的那張
        await waitUntil("推新的名字") { inbox.target() != nil }
        XCTAssertEqual(inbox.target()?.title, Tutorial.title)
    }

    /// 讀到一半按了清除：那些字不准回來
    @MainActor
    func testWipeDropsWhatWasBeingRead() async throws {
        for _ in 0 ..< 10 {
            let store = store([note("aaa")])
            try share(["不准回來"])
            store.takeInbox()
            if Bool.random() {
                Thread.sleep(forTimeInterval: 0.01)
            }
            XCTAssertTrue(store.wipe())
            await rest()
            XCTAssertFalse(store.book.notes.contains { $0.items.contains { $0.text == "不准回來" } })
            XCTAssertEqual(left(), 0)
            XCTAssertTrue(store.inboxGate.enter())
        }
    }

    @MainActor
    func testWipeFailsWhenInboxStays() throws {
        let store = store([note("aaa")])
        try share(["牛奶"])
        let parent = folder.deletingLastPathComponent().path
        try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: parent)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: parent) }
        XCTAssertFalse(store.wipe())
        XCTAssertEqual(texts(store), ["舊的"])
    }

    // MARK: 名字

    @MainActor
    func testNameFollowsSaves() async {
        let store = store([note("aaa"), note("bbb")])
        store.setColor("aaa", "red")
        store.setGlyph("aaa", "茄")
        store.rename("aaa", "今天想到的")
        store.flush()
        let want = ShareTarget(id: "aaa", title: "今天想到的", glyph: "茄", color: "red")
        await waitUntil("名字推出去") { inbox.target() == want }
        store.trashNote("aaa")
        store.flush()
        await waitUntil("刪掉的換掉") { inbox.target()?.id == "bbb" }
        // 換紙：停一下才推
        let pad = store.newPad()
        XCTAssertEqual(store.currentID, pad)
        store.open("bbb")
        await waitUntil("不是記事本") { inbox.target()?.id == "bbb" }
    }

    /// 上鎖那一刻就換掉，不等存檔；全都鎖了就什麼都不放
    @MainActor
    func testLockedNamesLeaveAtOnce() {
        let store = store([note("aaa"), note("bbb")])
        store.pushTarget(now: true)
        XCTAssertEqual(inbox.target()?.id, "aaa")
        store.setLocked("aaa", true)
        store.pushTarget(now: true)
        XCTAssertEqual(inbox.target()?.id, "bbb")
        store.setLocked("bbb", true)
        store.pushTarget(now: true)
        XCTAssertNil(inbox.target())
        XCTAssertNil(defaults.object(forKey: ShareInbox.targetKey))
    }

    @MainActor
    func testNeverNamesPadsDeletedOrFull() {
        var pad = note("pad"), gone = note("gone"), full = note("full")
        pad.kind = "text"
        gone.deleted = true
        full.items = (0 ..< Lines.max).map { Item(text: "\($0)") }
        let store = store([pad, gone, full], last: "pad")
        store.pushTarget(now: true)
        XCTAssertNil(inbox.target())
    }

    /// 免費：還不知道買了沒也推。假資料不推
    @MainActor
    func testNameDoesNotNeedPurchase() async {
        let store = store([note("aaa")])
        XCTAssertFalse(store.fullKnown)
        store.pushWidget()
        await waitUntil("名字推出去") { inbox.target()?.id == "aaa" }
        inbox.setTarget(nil)
        let demo = Store()
        demo.inbox = inbox
        demo.adopt(store.book, last: "aaa")
        demo.pushTarget(now: true)
        XCTAssertNil(inbox.target())
    }
}

/// 併進正在看的那張時清單怎麼動：打字的那行留在原地，輸入框開著不捲，手上沒事才捲回最上面
final class ShareListTests: XCTestCase {
    @MainActor
    private func list(_ rows: Int) -> (LineListView, UIWindow) {
        let list = LineListView(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        let window = UIWindow(frame: list.frame)
        window.addSubview(list)
        window.isHidden = false
        let items = (0 ..< rows).map { LineItem(id: "r\($0)", text: "第 \($0) 行", done: false) }
        list.source = { items }
        list.apply(items, animated: false)
        list.layoutIfNeeded()
        return (list, window)
    }

    @MainActor
    private func land(_ list: LineListView) {
        let next = [LineItem(id: "new1", text: "分享的", done: false), LineItem(id: "new2", text: "第二行", done: false)] + list.rows
        list.source = { next }
        list.takeIn("new1")
        list.layoutIfNeeded()
    }

    /// 那一行在畫面上的高度
    @MainActor
    private func seen(_ list: LineListView, _ id: String) throws -> CGFloat {
        try XCTUnwrap(list.restFrame(id)).minY - list.contentOffset.y
    }

    @MainActor
    func testTypingLineStaysPut() throws {
        for start in [CGFloat(0), 300] {
            let (list, window) = list(60)
            list.contentOffset.y = start
            list.layoutIfNeeded()
            list.editingID = "r8"
            let before = try seen(list, "r8")
            land(list)
            XCTAssertEqual(try seen(list, "r8"), before, accuracy: 0.5)
            XCTAssertEqual(list.editingID, "r8")
            XCTAssertNotNil(list.live["r8"])
            window.isHidden = true
        }
    }

    @MainActor
    func testComposerOpenDoesNotScroll() throws {
        let (list, window) = list(60)
        list.keyboardOverlap = 300
        land(list)
        XCTAssertEqual(list.contentOffset.y, 0)
        XCTAssertEqual(list.rows.first?.id, "new1")
        list.contentOffset.y = 400
        list.layoutIfNeeded()
        let before = try seen(list, "r12")
        let next = [LineItem(id: "new3", text: "又一則", done: false)] + list.rows
        list.source = { next }
        list.takeIn("new3")
        XCTAssertEqual(try seen(list, "r12"), before, accuracy: 0.5)
        window.isHidden = true
    }

    @MainActor
    func testIdleGoesToTop() async throws {
        let (list, window) = list(60)
        list.contentOffset.y = 400
        list.layoutIfNeeded()
        land(list)
        let end = Date().addingTimeInterval(5)
        while list.contentOffset.y > 0.5, Date() < end {
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTAssertEqual(list.contentOffset.y, 0, accuracy: 0.5)
        list.layoutIfNeeded()
        XCTAssertNotNil(list.live["new1"])
        window.isHidden = true
    }
}

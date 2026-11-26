@testable import Qieji
import XCTest

/// 冷啟動的存檔排到背景（效能審查第 4 條）：讀到自己的存檔，打開那一格不寫、之後在背景存；
/// 從 1.1 搬過來、讀不出來另存過的照樣當下寫。資料一個字都不准少。
final class BootSaveTests: XCTestCase {
    private var root = URL(fileURLWithPath: NSTemporaryDirectory())
    private var defaults = UserDefaults.standard
    private let suite = "qieji.tests.bootsave"

    private var dir: URL {
        root.appendingPathComponent("QiejiNative")
    }

    private var legacyDir: URL {
        root.appendingPathComponent("RCTAsyncLocalStorage_V1")
    }

    private var state: URL {
        dir.appendingPathComponent("state.json")
    }

    override func setUpWithError() throws {
        try super.setUpWithError()
        root = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("qieji-\(UUID().uuidString)")
        UserDefaults().removePersistentDomain(forName: suite)
        defaults = UserDefaults(suiteName: suite) ?? .standard
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: root)
        UserDefaults().removePersistentDomain(forName: suite)
        super.tearDown()
    }

    private func disk() -> Disk {
        Disk(dir: dir, legacyDirs: [legacyDir], defaults: defaults)
    }

    private func boot() -> Store {
        let store = Store(disk: disk())
        store.boot()
        return store
    }

    private func saved() -> String? {
        try? String(contentsOf: state, encoding: .utf8)
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

    /// 還沒算過指紋的存檔（升級前存的）：一張千行的紙、一張小的，最近刪除裡有一行
    private func unstamped() -> String {
        var big = Note.blank(color: "purple", now: 1000)
        big.id = "boot-big"
        big.title = "千行的紙"
        big.items = (0 ..< 1000).map { Item(id: "bb\($0)", text: "第 \($0) 行", done: $0 % 9 == 0) }
        big.bin = [Item(id: "bbx", text: "刪掉的那行", binnedAt: Clock.now())]
        var small = Note.blank(now: 2000)
        small.id = "boot-small"
        small.title = "小的"
        small.items = [Item(id: "bs0", text: "一行")]
        var book = Notebook()
        book.notes = [big, small]
        book.grid = Seats.gridCols
        return NoteCoding.write(book)
    }

    /// 打開那一格不寫；之後在背景存，指紋補好、字一個都沒少
    @MainActor
    func testBootSavesInBackgroundNotRightAway() async throws {
        let raw = unstamped()
        try raw.write(to: state, atomically: true, encoding: .utf8)
        let store = boot()
        XCTAssertEqual(saved(), raw)
        await waitUntil("背景存好") { saved() != raw }
        let book = try XCTUnwrap(saved().flatMap(NoteCoding.readBook))
        let before = try XCTUnwrap(NoteCoding.readBook(raw))
        XCTAssertEqual(book.notes.map(\.items), before.notes.map(\.items))
        XCTAssertEqual(book.notes.map(\.bin), before.notes.map(\.bin))
        XCTAssertEqual(book.notes.map(\.title), before.notes.map(\.title))
        for note in book.notes {
            XCTAssertEqual(note.hash, Sync.fingerprint(note))
            XCTAssertEqual(note.mod, note.updated) // 舊存檔第一次算指紋：mod 從 updated 起算，不變成「剛剛改的」
        }
        XCTAssertEqual(store.book.notes.map(\.hash), book.notes.map(\.hash))
    }

    /// 打開後還沒存就被殺掉：檔還是原本那份，下次打開讀到的一模一樣
    @MainActor
    func testKilledBeforeBootSaveLosesNothing() async throws {
        let raw = unstamped()
        try raw.write(to: state, atomically: true, encoding: .utf8)
        let first = boot()
        let second = boot() // 第一個還沒存（主執行緒沒放手），檔沒動
        XCTAssertEqual(saved(), raw)
        XCTAssertEqual(second.book, first.book)
        XCTAssertEqual(second.book.notes.first?.items.count, 1000)
        XCTAssertEqual(second.current?.id, first.current?.id)
        await waitUntil("背景存好") { saved() != raw }
        let book = try XCTUnwrap(saved().flatMap(NoteCoding.readBook))
        XCTAssertEqual(book.notes.map(\.items), first.book.notes.map(\.items))
    }

    /// 打開馬上記一行：存的是記了之後那份，背景那趟不會拿舊的蓋回去
    @MainActor
    func testTypingRightAfterBootIsKept() async throws {
        try unstamped().write(to: state, atomically: true, encoding: .utf8)
        let store = boot()
        let added = try XCTUnwrap(store.addTop("剛打開就記的"))
        await waitUntil("記的那行存進去") {
            saved().flatMap(NoteCoding.readBook)?.notes.flatMap(\.items).contains { $0.id == added } == true
        }
        try await Task.sleep(nanoseconds: 600_000_000)
        let book = try XCTUnwrap(saved().flatMap(NoteCoding.readBook))
        XCTAssertEqual(book.note(store.currentID ?? "")?.items.first?.text, "剛打開就記的")
        XCTAssertEqual(book, store.book)
    }

    /// 打開馬上進背景：當場寫（flush），排著的那趟取消，之後檔不再變
    @MainActor
    func testFlushRightAfterBootWritesNow() async throws {
        let raw = unstamped()
        try raw.write(to: state, atomically: true, encoding: .utf8)
        let store = boot()
        store.flush()
        let now = try XCTUnwrap(saved())
        XCTAssertNotEqual(now, raw)
        XCTAssertTrue(NoteCoding.readBook(now)?.notes.allSatisfy { $0.hash != nil } == true)
        try await Task.sleep(nanoseconds: 600_000_000)
        XCTAssertEqual(saved(), now)
    }

    /// app 自己存過的檔：打開不重寫（修改時間不變）
    @MainActor
    func testUnchangedFileIsNotRewritten() async throws {
        try unstamped().write(to: state, atomically: true, encoding: .utf8)
        boot().flush()
        let raw = try XCTUnwrap(saved())
        let stamp = try FileManager.default.attributesOfItem(atPath: state.path)[.modificationDate] as? Date
        try await Task.sleep(nanoseconds: 50_000_000)
        let store = boot()
        try await Task.sleep(nanoseconds: 600_000_000)
        XCTAssertEqual(saved(), raw)
        XCTAssertEqual(try FileManager.default.attributesOfItem(atPath: state.path)[.modificationDate] as? Date, stamp)
        XCTAssertTrue(store.loaded)
    }

    /// 從 1.1 搬過來：boot 回來的時候 state.json 已經寫好（不排到背景）
    func testLegacyMoveWritesBeforeBootReturns() throws {
        try FileManager.default.createDirectory(at: legacyDir, withIntermediateDirectories: true)
        var note = Note.blank(color: "purple", now: 1000)
        note.id = "boot-old"
        note.title = "舊版的紙"
        note.items = [Item(id: "o1", text: "舊版記的")]
        var old = Notebook()
        old.notes = [note]
        let manifest = JSONValue.object([LegacyStore.bookKey: .string(NoteCoding.write(old))])
        try manifest.stringify().write(to: legacyDir.appendingPathComponent("manifest.json"), atomically: true, encoding: .utf8)
        let store = boot()
        XCTAssertEqual(store.book.notes.first?.title, "舊版的紙")
        let book = try XCTUnwrap(saved().flatMap(NoteCoding.readBook))
        XCTAssertEqual(book.notes.first?.items.first?.text, "舊版記的")
    }

    /// 存檔讀不出來、另存過：boot 回來時原本那份已另存、新的已寫好（跟以前一樣當下寫）
    func testUnreadableFileIsRescuedAndReplacedRightAway() throws {
        try Data("不是 JSON".utf8).write(to: state)
        let store = boot()
        XCTAssertFalse(store.frozen)
        XCTAssertEqual(try? Data(contentsOf: dir.appendingPathComponent("unreadable.json")), Data("不是 JSON".utf8))
        XCTAssertNotNil(saved().flatMap(NoteCoding.readBook))
    }
}

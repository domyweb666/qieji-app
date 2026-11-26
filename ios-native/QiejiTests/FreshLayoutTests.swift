@testable import Qieji
import XCTest

/// 剛裝好、從空的開始、清除所有資料之後，還沒跟 iCloud 對過就排了目錄（離線、同步關著）：
/// 第一次拉到 iCloud 時照 iCloud 的排列與資料夾，不准拿這台的蓋掉（還剩的第 2 條，2026-11-26）
final class FreshLayoutTests: XCTestCase {
    private var root = URL(fileURLWithPath: NSTemporaryDirectory())
    private var defaults = UserDefaults.standard
    private let suite = "qieji.tests.freshlayout"
    private let cloudMod: Double = 1_800_000_000_000
    private let later: Double = 1_900_000_000_000

    private var dir: URL {
        root.appendingPathComponent("QiejiNative")
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
        try? FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: state.path)
        try? FileManager.default.removeItem(at: root)
        UserDefaults().removePersistentDomain(forName: suite)
        super.tearDown()
    }

    private func boot() -> Store {
        let store = Store(disk: Disk(dir: dir, legacyDirs: [], defaults: defaults))
        store.boot()
        return store
    }

    private func paper(_ id: String, _ text: String, at: Double = 1000) -> Note {
        var note = Note.blank(color: "purple", now: at)
        note.id = id
        note.title = id
        note.items = [Item(id: "\(id)-0", text: text)]
        return note
    }

    /// 別台放在 iCloud 上的：c1、c2 兩張，排成「c2、資料夾 f1（裡面 c1）」
    private func cloudNotes() -> [JSONValue] {
        [paper("c1", "雲上的一"), paper("c2", "雲上的二")].map(NoteCoding.json)
    }

    private var cloudFolder: Folder {
        Folder(id: "f1", name: "雲上的夾", ids: ["c1"])
    }

    private func cloudLayout() -> Seats.LayoutFetch {
        .found(Seats.Layout(order: ["c2", "f1"], mod: cloudMod, folders: [cloudFolder]).json)
    }

    /// 這台在還沒拉之前親手排過目錄（倒過來排）
    private func shuffle(_ store: Store) {
        store.edit { book in
            Seats.fixOrder(&book)
            let shown = (book.order ?? []).filter { !Seats.isHole($0) && !Seats.isBreak($0) }
            Seats.reseat(&book, visible: shown.reversed(), now: self.later)
        }
        XCTAssertEqual(store.book.orderMod, later)
    }

    private func addMine(_ store: Store, _ id: String = "mine") {
        store.edit { book in
            book.notes.append(self.paper(id, "這台記的", at: self.later - 10))
            Seats.fixOrder(&book)
        }
    }

    private func expectCloudLayout(_ store: Store, file: StaticString = #filePath, line: UInt = #line) {
        let order = store.book.order ?? []
        XCTAssertEqual(Array(order.prefix(2)), ["c2", "f1"], file: file, line: line)
        XCTAssertEqual(store.book.folders?.first, cloudFolder, file: file, line: line)
        XCTAssertTrue(order.contains("mine"), file: file, line: line) // 這台的紙還在，補在後面
        XCTAssertNotNil(store.book.note("mine"), file: file, line: line)
    }

    /// 剛裝好：第一次拉到之前排過，照 iCloud 的
    func testFreshInstallTakesCloudLayout() {
        let store = boot()
        addMine(store)
        shuffle(store)
        store.mergeCloud(notes: cloudNotes(), gone: nil, layout: cloudLayout())
        expectCloudLayout(store)
        XCTAssertNil(Seats.layoutToSend(store.book)) // 跟 iCloud 一樣，不用傳
    }

    /// 關掉 app 再打開（中間還沒拉到）也一樣
    func testFreshInstallRemembersAcrossLaunches() {
        let first = boot()
        addMine(first)
        first.flush()
        let store = boot()
        shuffle(store)
        store.flush()
        let again = boot()
        again.mergeCloud(notes: cloudNotes(), gone: nil, layout: cloudLayout())
        expectCloudLayout(again)
    }

    /// 從空的開始之後、重開 app、再排目錄：照 iCloud 的
    func testStartOverTakesCloudLayout() throws {
        var old = Notebook()
        old.notes = [paper("lost", "讀不到的")]
        try NoteCoding.write(old).write(to: state, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0], ofItemAtPath: state.path)
        try XCTSkipIf((try? Data(contentsOf: state)) != nil, "這台機器擋不住讀取")
        let frozen = boot()
        XCTAssertTrue(frozen.frozen)
        XCTAssertTrue(frozen.startOver())
        addMine(frozen)
        frozen.flush()
        let store = boot()
        XCTAssertFalse(store.frozen)
        shuffle(store)
        store.mergeCloud(notes: cloudNotes(), gone: nil, layout: cloudLayout())
        expectCloudLayout(store)
    }

    /// 清除所有資料之後再排：照 iCloud 的
    func testWipeTakesCloudLayout() {
        let store = boot()
        store.edit { book in
            book.notes.append(self.paper("old", "清掉之前的"))
            book.orderMod = self.cloudMod
            book.orderSent = self.cloudMod
        }
        store.flush()
        XCTAssertTrue(store.wipe())
        addMine(store)
        shuffle(store)
        store.mergeCloud(notes: cloudNotes(), gone: nil, layout: cloudLayout())
        expectCloudLayout(store)
    }

    /// 對到之前這台開的資料夾：照 iCloud 的就沒有這個資料夾，裡面的紙拆出來補在最後，一張都不少；這次不傳
    func testLocalFoldersGiveWayOnTheFirstMerge() {
        let store = boot()
        addMine(store)
        addMine(store, "mine2")
        store.edit { book in
            book.folders = [Folder(id: "lf", name: "這台的夾", ids: ["mine2"])]
            Seats.fixOrder(&book)
        }
        shuffle(store)
        store.mergeCloud(notes: cloudNotes(), gone: nil, layout: cloudLayout())
        expectCloudLayout(store)
        XCTAssertEqual(store.book.folders?.map(\.id), ["f1"])
        XCTAssertTrue(store.book.order?.contains("mine2") == true)
        XCTAssertNotNil(store.book.note("mine2"))
        XCTAssertNil(Seats.layoutToSend(store.book))
    }

    /// iCloud 上沒有排列：這台的就是第一份，照樣傳上去
    func testFreshInstallWithoutCloudLayoutKeepsItsOwn() {
        let store = boot()
        addMine(store)
        shuffle(store)
        let mine = store.book.order
        store.mergeCloud(notes: cloudNotes(), gone: nil, layout: .missing)
        XCTAssertEqual(Array((store.book.order ?? []).prefix(mine?.count ?? 0)), mine)
        XCTAssertNotNil(Seats.layoutToSend(store.book))
    }

    /// 用了一陣子、跟 iCloud 對過的手機：後排的那台為準，跟以前一樣
    func testUsedPhoneStillWinsWithNewerLayout() throws {
        var book = Notebook()
        book.notes = [paper("c1", "雲上的一"), paper("c2", "雲上的二"), paper("mine", "這台記的")]
        book.order = ["mine", "c1", "c2"]
        book.orderMod = cloudMod - 1
        book.orderSent = cloudMod - 1
        book.grid = Seats.gridCols
        try NoteCoding.write(book).write(to: state, atomically: true, encoding: .utf8)
        let store = boot()
        shuffle(store)
        let mine = store.book.order
        store.mergeCloud(notes: cloudNotes(), gone: nil, layout: cloudLayout())
        XCTAssertEqual(store.book.order, mine)
        XCTAssertNotNil(Seats.layoutToSend(store.book))
    }
}

@testable import Qieji
import XCTest

/// 同步、回到前景那幾件事：畫面上看不到的變動不叫畫面重畫、不在主執行緒寫檔；什麼都沒變就什麼都不做（效能審查第 1 條）
final class SyncQuietTests: XCTestCase {
    private var dir = URL(fileURLWithPath: NSTemporaryDirectory())
    private var suite = ""

    override func setUp() {
        super.setUp()
        suite = "qieji.quiet.\(UUID().uuidString)"
        dir = FileManager.default.temporaryDirectory.appendingPathComponent(suite)
    }

    override func tearDown() {
        UserDefaults().removePersistentDomain(forName: suite)
        try? FileManager.default.removeItem(at: dir)
        super.tearDown()
    }

    private var stateFile: URL {
        dir.appendingPathComponent("state.json")
    }

    private func disk() throws -> Disk {
        try Disk(dir: dir, legacyDirs: [], defaults: XCTUnwrap(UserDefaults(suiteName: suite)))
    }

    /// 一張兩行的紙，指紋算好；synced＝跟 iCloud 對過了
    private func paper(synced: Bool) -> Note {
        var note = Note.blank(now: 1000)
        note.title = "買菜"
        note.items = [Item(text: "青蔥"), Item(text: "豆腐")]
        note.hash = PrintCache.shared.print(of: note)
        note.mod = 1000
        if synced {
            note.syncedHash = note.hash
        }
        return note
    }

    private func store(_ notes: [Note]) throws -> Store {
        var book = Notebook()
        book.notes = notes
        Seats.fixOrder(&book) // 目錄排列先排好：不然第一次存檔補排列，那是看得到的變動
        let store = try Store(book: book, disk: disk())
        store.adopt(book, last: notes.first?.id)
        return store
    }

    /// 數資料換了幾次「看得到的」（onBook 跟叫畫面重畫是同一個時機；quiet 的不算）
    private func count(_ store: Store) -> () -> Int {
        var calls = 0
        store.onBook = { calls += 1 }
        return { calls }
    }

    /// iCloud 上那張的原樣（跟上傳時一樣：不帶 sh）
    private func cloud(_ note: Note) -> [Note] {
        var paper = note
        paper.syncedHash = nil
        return Sync.decodeCloud([NoteCoding.json(paper)])
    }

    /// 讓主執行緒跑一下（背景存檔回來、延後的重畫）。不用 wait(for:)：見 CloudLinkTests.waitUntil 的說明
    @MainActor
    private func rest(_ seconds: Double = 0.8) async {
        try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }

    private func saved(_ note: Note) throws -> Note? {
        try disk().load().book.note(note.id)
    }

    // MARK: 上傳完記下記號

    @MainActor
    func testAdoptSyncOnlyMarksDoesNotRedrawAndSavesInBackground() async throws {
        let note = paper(synced: false)
        let store = try store([note])
        let redraws = count(store)
        var sent = store.book
        sent.notes[0].syncedHash = note.hash
        store.adoptSync(from: sent)
        XCTAssertEqual(store.book.note(note.id)?.syncedHash, note.hash)
        XCTAssertEqual(redraws(), 0)
        await rest()
        XCTAssertEqual(redraws(), 0)
        XCTAssertEqual(try saved(note)?.syncedHash, note.hash)
    }

    @MainActor
    func testAdoptSyncSkipsNoteChangedWhileUploading() async throws {
        let note = paper(synced: false)
        let store = try store([note])
        var sent = store.book
        sent.notes[0].syncedHash = note.hash
        store.editNote(note.id) { $0.items[0].text = "青蔥兩把" }
        await rest() // 存檔時指紋換成新的
        store.adoptSync(from: sent)
        XCTAssertNil(store.book.note(note.id)?.syncedHash)
    }

    // MARK: 回到前景合併

    @MainActor
    func testMergeCloudNothingChangedDoesNothing() async throws {
        let note = paper(synced: true)
        let store = try store([note])
        let redraws = count(store)
        let before = store.book
        store.mergeCloud(cloud: cloud(note), gone: .object([:]), layout: .unreadable)
        XCTAssertEqual(store.book, before)
        XCTAssertEqual(redraws(), 0)
        await rest()
        XCTAssertEqual(redraws(), 0)
        XCTAssertFalse(FileManager.default.fileExists(atPath: stateFile.path))
    }

    @MainActor
    func testMergeCloudOnlyMarksDoesNotRedrawButSaves() async throws {
        let note = paper(synced: false)
        let store = try store([note])
        let redraws = count(store)
        store.mergeCloud(cloud: cloud(note), gone: .object([:]), layout: .unreadable)
        XCTAssertEqual(store.book.note(note.id)?.syncedHash, note.hash)
        XCTAssertEqual(redraws(), 0)
        await rest()
        XCTAssertEqual(redraws(), 0)
        XCTAssertEqual(try saved(note)?.syncedHash, note.hash)
    }

    @MainActor
    func testMergeCloudWithChangeRedrawsAndSaves() async throws {
        let note = paper(synced: true)
        let store = try store([note])
        let redraws = count(store)
        var other = note
        other.items.append(Item(text: "雞蛋"))
        other.mod = 2000
        other.hash = Sync.fingerprint(other)
        store.mergeCloud(cloud: cloud(other), gone: .object([:]), layout: .unreadable)
        XCTAssertEqual(store.book.note(note.id)?.items.map(\.text), ["青蔥", "豆腐", "雞蛋"])
        XCTAssertGreaterThan(redraws(), 0)
        await rest()
        XCTAssertEqual(try saved(note)?.items.map(\.text), ["青蔥", "豆腐", "雞蛋"])
    }

    /// 背景解好再合，跟拿原檔合結果一樣
    func testDecodedMergeMatchesRawMerge() {
        let mine = paper(synced: true)
        var theirs = mine
        theirs.items.insert(Item(text: "別台加的"), at: 0)
        theirs.mod = 3000
        theirs.locked = true
        var fresh = Note.blank(now: 500)
        fresh.title = "別台新開的"
        fresh.items = [Item(text: "一行")]
        var raws = [theirs, fresh].map { note -> JSONValue in
            var paper = note
            paper.syncedHash = nil
            return NoteCoding.json(paper)
        }
        raws.append(.object(["id": .number(3)])) // id 不是字串：不理
        var lhs = Notebook(), rhs = Notebook()
        lhs.notes = [mine]
        rhs.notes = [mine]
        let gone: JSONValue = .object(["zzz": .number(100)])
        let raw = Sync.mergeCloud(&lhs, notes: raws, gone: gone, now: 5000)
        let decoded = Sync.mergeCloud(&rhs, cloud: Sync.decodeCloud(raws), gone: gone, now: 5000)
        XCTAssertEqual(raw, decoded)
        XCTAssertEqual(lhs, rhs)
        XCTAssertEqual(lhs.note(mine.id)?.locked, false)
    }

    // MARK: 回到前景清最近刪除

    @MainActor
    func testPurgeTrashNothingExpiredLeavesBookAlone() async throws {
        let now = Clock.now()
        var kept = paper(synced: true)
        kept.deleted = true
        kept.deletedAt = now - 86_400_000
        kept.bin = [Item(text: "昨天刪的", binnedAt: now - 86_400_000)]
        let other = paper(synced: true)
        let store = try store([other, kept])
        let redraws = count(store)
        let before = store.book
        store.purgeTrash(now: now)
        XCTAssertEqual(store.book, before)
        XCTAssertEqual(redraws(), 0)
        await rest()
        XCTAssertFalse(FileManager.default.fileExists(atPath: stateFile.path))
    }

    @MainActor
    func testPurgeTrashDropsExpiredAndSaves() async throws {
        let now = Clock.now()
        var old = paper(synced: true)
        old.deleted = true
        old.deletedAt = now - 31 * 86_400_000
        var other = paper(synced: true)
        other.bin = [Item(text: "很久以前刪的", binnedAt: now - 31 * 86_400_000), Item(text: "昨天刪的", binnedAt: now - 86_400_000)]
        let store = try store([other, old])
        let redraws = count(store)
        store.purgeTrash(now: now)
        XCTAssertNil(store.book.note(old.id))
        XCTAssertNotNil(store.book.gone[old.id])
        XCTAssertEqual(store.book.note(other.id)?.bin.map(\.text), ["昨天刪的"])
        XCTAssertGreaterThan(redraws(), 0)
        await rest()
        XCTAssertNil(try saved(old))
        XCTAssertEqual(try saved(other)?.bin.map(\.text), ["昨天刪的"])
    }

    @MainActor
    func testPurgeTrashStampsMissingTimes() async throws {
        var old = paper(synced: true)
        old.deleted = true
        old.deletedAt = nil
        let store = try store([paper(synced: true), old])
        store.purgeTrash(now: Clock.now())
        XCTAssertNotNil(store.book.note(old.id)?.deletedAt)
        await rest()
        XCTAssertNotNil(try saved(old)?.deletedAt)
    }
}

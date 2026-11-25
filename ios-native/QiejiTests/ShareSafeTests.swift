@testable import Qieji
import XCTest

/// 分享進來的資料安全：跟 iCloud 同步撞在一起、存檔前紙被拿掉、存失敗又永久刪除
class ShareSafeCase: XCTestCase {
    var root = URL(fileURLWithPath: NSTemporaryDirectory())
    var defaults = UserDefaults.standard
    private let suite = "qieji.tests.sharesafe"

    var folder: URL {
        root.appendingPathComponent("group/Inbox")
    }

    var nativeDir: URL {
        root.appendingPathComponent("native")
    }

    var names: URL {
        root.appendingPathComponent("group/ShareTargets.json")
    }

    var inbox: ShareInbox {
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

    func disk() -> Disk {
        Disk(dir: nativeDir, legacyDirs: [], defaults: defaults)
    }

    func note(_ id: String, _ lines: [String] = ["舊的"], updated: Double = 1000) -> Note {
        var note = Note.blank(now: updated)
        note.id = id
        note.title = id
        note.items = lines.enumerated().map { Item(id: "\(id)-\($0)", text: $1) }
        return note
    }

    func store(_ notes: [Note], last: String = "aaa") -> Store {
        let store = Store(disk: disk())
        store.inbox = inbox
        var book = Notebook()
        book.notes = notes
        Seats.fixOrder(&book)
        store.adopt(book, last: last)
        return store
    }

    @discardableResult
    func share(_ texts: [String], note: String? = nil) throws -> ShareEntry {
        let entry = try XCTUnwrap(ShareEntry.make(texts, note: note))
        XCTAssertTrue(inbox.write(entry))
        return entry
    }

    func left() -> Int {
        (try? FileManager.default.contentsOfDirectory(atPath: folder.path).count) ?? 0
    }

    func texts(_ store: Store, _ id: String = "aaa") -> [String] {
        store.book.note(id)?.items.map(\.text) ?? []
    }

    func everywhere(_ store: Store) -> [String] {
        store.book.notes.flatMap { ($0.items + $0.bin).map(\.text) }
    }

    /// XCTestCase 的方法預設給 ObjC 看得到：async 又帶不逃逸的閉包會編不過
    @nonobjc @MainActor
    func waitUntil(_ what: String, timeout: Double = 8, _ done: () -> Bool) async {
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
    func rest(_ seconds: Double = 0.3) async {
        try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }
}

/// 併進去之後、存檔前後出事（第 2、3 條），與第 4、5 條
final class ShareSafeTests: ShareSafeCase {
    /// 併進去之後、存檔之前，同步因為墓碑把整張拿掉：檔留著，下次併到別張
    @MainActor
    func testTombstoneBeforeSaveKeepsTheFile() async throws {
        let store = store([note("aaa"), note("bbb")])
        try share(["分享的"], note: "aaa")
        var hit = false
        store.onBook = { [weak store] in
            guard let store, !hit, store.book.note("aaa")?.items.first?.text == "分享的" else { return }
            hit = true
            // 排在「背景算好指紋再存」之前
            DispatchQueue.main.async {
                store.mergeCloud(notes: [], gone: .object(["aaa": .number(Clock.now() + 60000)]), layout: .missing)
            }
        }
        store.takeInbox()
        await waitUntil("整張拿掉") { hit && store.book.note("aaa") == nil }
        await rest()
        XCTAssertEqual(left(), 1)
        XCTAssertFalse(everywhere(store).contains("分享的"))
        store.takeInbox()
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(texts(store, "bbb"), ["分享的", "舊的"])
        XCTAssertEqual(disk().load().book.note("bbb")?.items.map(\.text), ["分享的", "舊的"])
    }

    /// 存失敗、檔留著，使用者把那行永久刪掉：下次不准又加回來
    @MainActor
    func testDeletedForeverAfterFailedSaveStaysGone() async throws {
        let store = store([note("aaa")])
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try Data().write(to: nativeDir) // 怎麼寫都會失敗
        let entry = try share(["分享的"])
        store.takeInbox()
        await waitUntil("跳提示") { store.notice != nil }
        await rest()
        XCTAssertEqual(left(), 1)
        store.binLine(entry.lines[0].id)
        store.deleteLineForever(noteID: "aaa", itemID: entry.lines[0].id)
        try FileManager.default.removeItem(at: nativeDir)
        store.takeInbox()
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(everywhere(store), ["舊的"])
        XCTAssertEqual(disk().load().book.note("aaa")?.items.map(\.text), ["舊的"])
    }

    /// 存好了但檔刪不掉：那行永久刪掉、那張整張永久刪掉，都不准再加回來
    @MainActor
    func testDeletedForeverWhileFileStuckStaysGone() async throws {
        let store = store([note("aaa"), note("bbb")])
        let one = try share(["第一則"], note: "aaa")
        try share(["第二則"], note: "bbb")
        try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: folder.path)
        store.takeInbox()
        await waitUntil("存好") { self.disk().load().book.note("bbb")?.items.first?.text == "第二則" }
        await rest()
        XCTAssertEqual(left(), 2)
        store.binLine(one.lines[0].id)
        store.deleteLineForever(noteID: "aaa", itemID: one.lines[0].id)
        store.trashNote("bbb")
        store.deleteForever("bbb")
        store.takeInbox()
        await rest()
        XCTAssertEqual(everywhere(store), ["舊的"])
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: folder.path)
        store.takeInbox()
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(everywhere(store), ["舊的"])
    }

    func testFindsOnlyTheOnesAsked() {
        var book = Notebook()
        var gone = note("ccc", ["丙"])
        gone.bin = [Item(id: "binned", text: "刪掉的")]
        gone.deleted = true
        book.notes = [note("aaa", ["甲", "乙"]), gone]
        XCTAssertEqual(InboxMerge.found(["aaa-1", "binned", "沒有"], in: book), ["aaa-1", "binned"])
        XCTAssertEqual(InboxMerge.found([], in: book), [])
    }

    /// 一批只看這麼多個，其餘接著下一批；全部收完、先後不亂
    @MainActor
    func testTakesManyInBatches() async throws {
        let store = store([note("aaa", [])])
        let count = ShareInbox.maxFiles * 2 + 3
        for index in 1 ... count {
            var entry = try XCTUnwrap(ShareEntry.make(["\(index)"], note: nil, now: 1_790_000_000_000 + Double(index)))
            entry.at = Double(index)
            XCTAssertTrue(inbox.write(entry))
        }
        let batch = inbox.read()
        XCTAssertEqual(batch.mail.count, ShareInbox.maxFiles)
        XCTAssertTrue(batch.more)
        store.takeInbox()
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(texts(store), (1 ... count).reversed().map { "\($0)" })
        await rest()
        XCTAssertTrue(store.inboxGate.enter())
    }

    /// 壞檔這次打開只讀一次（也不佔位子）；一時讀不到的下次再試
    @MainActor
    func testBadFilesAreNotReadAgain() async throws {
        let store = store([note("aaa")])
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        for index in 0 ..< ShareInbox.maxFiles + 1 {
            try Data("壞的".utf8).write(to: folder.appendingPathComponent("0bad\(index).json"))
        }
        let shut = try share(["讀不到的"])
        let shutFile = folder.appendingPathComponent("\(shut.lines[0].id).json")
        try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: shutFile.path)
        try share(["好的"])
        store.takeInbox()
        await waitUntil("好的收了") { texts(store) == ["好的", "舊的"] }
        await rest()
        // 壞檔裡換成好的：這次打開不會再讀到它
        let late = try XCTUnwrap(ShareEntry.make(["不會再讀"], note: nil))
        try JSONEncoder().encode(late).write(to: folder.appendingPathComponent("0bad0.json"))
        try FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: shutFile.path)
        store.takeInbox()
        await waitUntil("讀不到的也收了") { texts(store) == ["讀不到的", "好的", "舊的"] }
        await rest()
        XCTAssertEqual(left(), ShareInbox.maxFiles + 1)
        XCTAssertEqual(texts(store).count, 3)
    }

    /// 上鎖那一刻推紙單：不排在讀檔後面
    @MainActor
    func testLockingDoesNotWaitForReading() async {
        let store = store([note("aaa"), note("bbb")])
        let folder = folder, defaults = defaults
        store.inbox = ShareInbox(folder: {
            if String(cString: __dispatch_queue_get_label(nil)) == "org.domyweb.qieji.inbox" {
                Thread.sleep(forTimeInterval: 1.5)
            }
            return folder
        }, settings: { defaults })
        store.pushTarget()
        store.takeInbox()
        await rest(0.1)
        store.setLocked("aaa", true)
        let start = Date()
        store.pushTarget(now: true)
        XCTAssertLessThan(Date().timeIntervalSince(start), 0.5)
        XCTAssertEqual(inbox.targets().map(\.id), ["bbb"])
        await rest(2)
    }

    /// 正有「復原」可以按：不蓋掉
    @MainActor
    func testDoesNotCoverUndo() async throws {
        let store = store([note("aaa", ["一", "二"]), note("bbb")])
        store.binLine("aaa-0")
        XCTAssertNotNil(store.toast?.undo)
        try share(["分享的"], note: "bbb")
        store.takeInbox()
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(store.toast?.text, Words.movedToTrash)
        XCTAssertNotNil(store.toast?.undo)
        store.toast = Store.Toast(text: Words.pinned)
        try share(["又一則"], note: "bbb")
        store.takeInbox()
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(store.toast?.text, Words.landedIn("bbb"))
    }

    /// 真的 app 拿不到共用區：不知道裡面還有沒有字，不准說清乾淨了
    @MainActor
    func testWipeWithoutContainerIsNotClean() {
        let defaults = defaults
        XCTAssertFalse(ShareInbox(folder: { nil }, settings: { defaults }).wipe())
        XCTAssertFalse(ShareInbox(folder: { self.folder }, settings: { nil }).wipe())
        XCTAssertTrue(ShareInbox.off.wipe())
        let store = store([note("aaa")])
        store.inbox = ShareInbox(folder: { nil }, settings: { nil })
        XCTAssertFalse(store.wipe())
        XCTAssertEqual(texts(store), ["舊的"])
    }
}

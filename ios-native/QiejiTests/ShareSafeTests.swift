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
            Thread.sleep(forTimeInterval: 1.5)
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

/// 可選的紙單：順序、張數、誰不准出現、什麼時候跟著變
final class ShareTargetsTests: ShareSafeCase {
    private func pin(_ id: String, created: Double) -> Note {
        var note = note(id)
        note.pinned = true
        note.created = created
        return note
    }

    private func bad(_ id: String) -> [Note] {
        var locked = note("\(id)-lock"), pad = note("\(id)-pad"), gone = note("\(id)-gone"), full = note("\(id)-full")
        locked.locked = true
        pad.kind = "text"
        gone.deleted = true
        full.items = (0 ..< Lines.max).map { Item(text: "\($0)") }
        return [locked, pad, gone, full]
    }

    private func choices(_ notes: [Note], current: String? = nil, recent: [String] = []) -> [String] {
        var book = Notebook()
        book.notes = notes
        return InboxMerge.choices(book, current: current, recent: recent).map(\.id)
    }

    private func names() -> [String] {
        inbox.targets().map(\.id)
    }

    /// 預設那張 → 釘選（照建立先後）→ 最近開過的 → 最近改過的補。總張數跟切換清單一樣
    func testOrderAndCount() {
        let pins = [pin("p2", created: 20), pin("p1", created: 10)]
        let rest = (1 ... 8).map { note("n\($0)", updated: Double($0)) }
        // 預設那張沒釘選：算最近的一張
        XCTAssertEqual(
            choices(pins + rest, current: "n3", recent: ["n3", "n1", "p1"]), ["n3", "p1", "p2", "n1", "n8", "n7", "n6"]
        )
        // 預設那張不在最近開過的裡面：張數一樣
        XCTAssertEqual(choices(pins + rest, current: "n3", recent: ["n1"]), ["n3", "p1", "p2", "n1", "n8", "n7", "n6"])
        // 預設那張是釘選的：提到最前面，不重複
        XCTAssertEqual(
            choices(pins + rest, current: "p2", recent: ["p2", "n1"]), ["p2", "p1", "n1", "n8", "n7", "n6", "n5"]
        )
        // 最近開過的夠多：不補，多的不放
        XCTAssertEqual(
            choices(rest, current: "n1", recent: ["n1", "n2", "n3", "n4", "n5", "n6"]), ["n1", "n2", "n3", "n4", "n5"]
        )
        // 沒有正在看的、沒開過：最近改過的
        XCTAssertEqual(choices(rest), ["n8", "n7", "n6", "n5", "n4"])
        XCTAssertEqual(choices([note("one")], current: "one"), ["one"])
        XCTAssertEqual(choices([]), [])
    }

    /// 跟切換清單同樣的紙（都能記的時候）
    func testSamePapersAsSwitchList() {
        var book = Notebook()
        book.notes = (1 ... 7).map { pin("p\($0)", created: Double($0)) } + (1 ... 9).map { note("n\($0)", updated: Double($0)) }
        for current in ["n2", "p3", "n9"] {
            let recent = [current, "n4", "p1", "n1"]
            let lists = Seats.switchList(book, recent: recent)
            let made = InboxMerge.choices(book, current: current, recent: recent).map(\.id)
            XCTAssertEqual(made.first, current)
            XCTAssertEqual(Set(made), Set((lists.pinned + lists.recent).map(\.id)))
            XCTAssertEqual(made.count, Seats.pinMax + Seats.recentMax)
        }
    }

    /// 上鎖、記事本、刪掉、滿了：不出現、也不佔名額（釘選的、最近開過的、補的都一樣）
    func testBadPapersTakeNoPlace() {
        let badPins = bad("p").map { one -> Note in
            var one = one
            one.pinned = true
            one.created = 1
            return one
        }
        let badRecent = bad("r"), badNew = bad("u").map { one -> Note in
            var one = one
            one.updated = 9999
            return one
        }
        let pins = (1 ... 5).map { pin("p\($0)", created: Double($0 + 10)) }
        let rest = (1 ... 6).map { note("n\($0)", updated: Double($0)) }
        XCTAssertEqual(
            choices(badPins + badRecent + badNew + pins + rest, current: "r-lock", recent: badRecent.map(\.id) + ["n1"]),
            ["n1", "p1", "p2", "p3", "p4", "p5", "n6", "n5", "n4", "n3"]
        )
        XCTAssertEqual(choices(badPins + badRecent, current: "r-pad", recent: badRecent.map(\.id)), [])
    }

    /// 上鎖那一刻就從紙單消失，不是預設那張也一樣；連檔裡的原樣都找不到名字
    @MainActor
    func testLockedPaperLeavesTheListAtOnce() throws {
        let store = store([note("aaa"), note("bbb"), note("ccc")])
        store.pushTarget(now: true)
        XCTAssertEqual(names(), ["aaa", "bbb", "ccc"])
        store.setLocked("bbb", true)
        store.pushTarget(now: true)
        XCTAssertEqual(names(), ["aaa", "ccc"])
        let raw = try XCTUnwrap(defaults.data(forKey: ShareInbox.targetsKey))
        XCTAssertFalse(String(bytes: raw, encoding: .utf8)?.contains("bbb") ?? true)
    }

    /// 釘選、取消釘選（不動修改時間的那種也算）、換張、改名、換色、換圖示：紙單跟著變
    @MainActor
    func testListFollowsChanges() async {
        let store = store([note("aaa"), note("bbb", updated: 900), note("ccc", updated: 800)])
        store.pushTarget(now: true)
        XCTAssertEqual(names(), ["aaa", "bbb", "ccc"])
        store.togglePin("ccc")
        await waitUntil("釘選的排前面") { names() == ["aaa", "ccc", "bbb"] }
        store.togglePin("ccc")
        await waitUntil("取消釘選") { names() == ["aaa", "bbb", "ccc"] }
        store.open("bbb")
        await waitUntil("換張") { names() == ["bbb", "aaa", "ccc"] }
        store.rename("aaa", "買東西")
        store.setColor("aaa", "red")
        store.setGlyph("aaa", "買")
        let want = ShareTarget(id: "aaa", title: "買東西", glyph: "買", color: "red")
        await waitUntil("改名、換色、換圖示") { inbox.targets().contains(want) }
        store.setLocked("bbb", true)
        await waitUntil("存檔那條也會拿掉") { !names().contains("bbb") }
    }

    /// 真的清除：新舊兩個鍵都不留
    @MainActor
    func testWipeTakesBothKeys() {
        let store = store([note("aaa"), note("bbb")])
        store.pushTarget(now: true)
        XCTAssertEqual(names().count, 2)
        defaults.set(Data("舊的".utf8), forKey: ShareInbox.oldTargetKey)
        XCTAssertTrue(store.wipeInbox())
        XCTAssertNil(defaults.object(forKey: ShareInbox.targetsKey))
        XCTAssertNil(defaults.object(forKey: ShareInbox.oldTargetKey))
        // 清完再推：一樣的內容也要寫
        store.pushTarget(now: true)
        XCTAssertEqual(names().count, 2)
    }
}

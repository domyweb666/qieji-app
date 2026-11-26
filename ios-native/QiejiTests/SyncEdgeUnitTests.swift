@testable import Qieji
import XCTest

/// 同步邊角三條（2026-11-26）用到的新規則，一條一條驗
final class SyncEdgeUnitTests: ShareSafeCase {
    private var cloudDir: URL {
        root.appendingPathComponent("cloud")
    }

    // MARK: 1. 這台還沒有最新那份

    /// 系統說是最新的才讀；有一份但比較舊、還沒下載都不讀；不是 iCloud 的檔照舊讀
    func testOnlyTheCurrentCopyCounts() {
        XCTAssertTrue(ICloudDrive.isCurrent(.current))
        XCTAssertFalse(ICloudDrive.isCurrent(.downloaded))
        XCTAssertFalse(ICloudDrive.isCurrent(.notDownloaded))
        XCTAssertTrue(ICloudDrive.isCurrent(nil))
    }

    func testNoteIDFromFileName() {
        XCTAssertEqual(CloudSync.noteID("abc.json"), "abc")
        XCTAssertNil(CloudSync.noteID(CloudSync.goneFile))
        XCTAssertNil(CloudSync.noteID(CloudSync.layoutFile))
        XCTAssertNil(CloudSync.noteID("cover-x.b64"))
        XCTAssertNil(CloudSync.noteID(".json"))
    }

    /// 拉的時候：還沒好的那張不拿來合，記進 behind；排列還沒好當成這次讀不到
    func testFetchSkipsAndReportsLaggingFiles() throws {
        let drive = FolderDrive(dir: cloudDir)
        try drive.write("aaa.json", NoteCoding.json(note("aaa")).stringify())
        try drive.write("bbb.json", NoteCoding.json(note("bbb")).stringify())
        try drive.write(CloudSync.layoutFile, Seats.Layout(order: ["aaa"], mod: 5, folders: []).json.stringify())
        var lagging = drive
        lagging.behind = ["bbb.json", CloudSync.layoutFile]
        guard case let .got(notes, _, layout, names, behind) = CloudSync(drive: lagging).fetch() else {
            return XCTFail("拉不到")
        }
        XCTAssertEqual(notes.compactMap { $0.objectValue?["id"]?.stringValue }, ["aaa"])
        XCTAssertEqual(behind, ["bbb.json", CloudSync.layoutFile])
        XCTAssertTrue(names.contains("bbb.json"))
        guard case .unreadable = layout else {
            return XCTFail("排列還沒好要當成這次讀不到")
        }
    }

    /// 傳的時候：iCloud 上那張這台還沒有最新的，不准蓋上去
    func testPushSkipsLaggingNote() throws {
        let drive = FolderDrive(dir: cloudDir)
        let theirs = NoteCoding.json(note("aaa", ["別台改的"])).stringify()
        try drive.write("aaa.json", theirs)
        var book = Notebook()
        book.notes = [note("aaa", ["這台改的"])]
        Sync.stampMods(&book, now: Clock.now())
        var lagging = drive
        lagging.behind = ["aaa.json"]
        var gone = ""
        let out = CloudSync(drive: lagging).push(&book, goneSent: &gone)
        XCTAssertEqual(out.synced, 0)
        XCTAssertEqual(try drive.read("aaa.json"), theirs)
        XCTAssertNil(book.notes[0].syncedHash)
    }

    // MARK: 1. 分享進來的字等那張

    private func entry(_ text: String, note: String?) throws -> ShareEntry {
        try XCTUnwrap(ShareEntry.make([text], note: note))
    }

    /// 要放的那張還沒好：這則先不放；別張照放；等夠久的照放
    func testRunHoldsOnlyLaggingTargets() throws {
        var book = Notebook()
        book.notes = [note("aaa"), note("bbb")]
        let wait = try entry("等的", note: "aaa")
        let goes = try entry("照放的", note: "bbb")
        let out = InboxMerge.run(&book, [wait, goes], current: "aaa", recent: [], behind: ["aaa"], now: 9000)
        XCTAssertEqual(out.held, [InboxMerge.key(wait)].compactMap { $0 })
        XCTAssertEqual(book.note("aaa")?.items.map(\.text), ["舊的"])
        XCTAssertEqual(book.note("bbb")?.items.map(\.text), ["照放的", "舊的"])

        var late = Notebook()
        late.notes = [note("aaa")]
        let key = try XCTUnwrap(InboxMerge.key(wait))
        let again = InboxMerge.run(&late, [wait], current: "aaa", recent: [], behind: ["aaa"], late: [key], now: 9000)
        XCTAssertTrue(again.held.isEmpty)
        XCTAssertEqual(late.note("aaa")?.items.map(\.text), ["等的", "舊的"])
    }

    /// 沒指定哪張、會放進正在看的這張而它還沒好：也等
    func testRunHoldsWhenCurrentIsLagging() throws {
        var book = Notebook()
        book.notes = [note("aaa")]
        let out = try InboxMerge.run(&book, [entry("等的", note: nil)], current: "aaa", recent: [], behind: ["aaa"], now: 9000)
        XCTAssertEqual(out.held.count, 1)
        XCTAssertEqual(book.notes.count, 1) // 不另外開一張
    }

    /// 等了 behindGiveUp 還沒好：照放（字不留在收件匣裡看不到）
    @MainActor
    func testHeldTooLongIsPlaced() async throws {
        let store = store([note("aaa")])
        store.cloudBehind = ["aaa"]
        let sent = try share(["分享的"], note: "aaa")
        let key = try XCTUnwrap(InboxMerge.key(sent))
        store.takeInbox()
        await waitUntil("記下在等") { store.inboxHeld[key] != nil }
        await rest(0.3)
        XCTAssertEqual(left(), 1)
        XCTAssertEqual(texts(store), ["舊的"])
        store.inboxHeld[key] = Clock.now() - Tok.Timing.behindGiveUp * 1000 - 1
        store.takeInbox()
        await waitUntil("放進去") { left() == 0 }
        XCTAssertEqual(texts(store), ["分享的", "舊的"])
        XCTAssertTrue(store.inboxHeld.isEmpty)
    }

    /// 那張下載好了、或關掉同步：在等的馬上放
    @MainActor
    func testCaughtUpReleasesHeld() async throws {
        for next in [Set<String>(), ["bbb"]] {
            let store = store([note("aaa"), note("bbb")])
            store.cloudBehind = ["aaa", "bbb"]
            try share(["分享的"], note: "aaa")
            store.takeInbox()
            await waitUntil("在等") { !store.inboxHeld.isEmpty }
            XCTAssertEqual(left(), 1)
            store.setCloudBehind(next)
            await waitUntil("放進去") { left() == 0 }
            XCTAssertEqual(texts(store), ["分享的", "舊的"])
        }
    }

    // MARK: 2. 剛從空的開始的排列

    func testFreshMarkIsSavedAndRead() {
        var book = Notebook()
        book.orderFresh = true
        XCTAssertEqual(NoteCoding.readBook(NoteCoding.write(book))?.orderFresh, true)
        XCTAssertEqual(NoteCoding.readBook(NoteCoding.write(Notebook()))?.orderFresh, false)
        XCTAssertFalse(NoteCoding.write(Notebook()).contains("orderFresh")) // 平常的存檔一個字都不多
    }

    func testFreshInstallIsMarked() {
        let found = disk().load()
        XCTAssertEqual(found.source, .fresh)
        XCTAssertTrue(found.book.orderFresh)
    }

    /// 還沒對過不傳；排列這次讀不到就繼續等；iCloud 上沒有就算對過了
    func testFreshLayoutWaitsForTheCloudOne() {
        var book = Notebook()
        book.notes = [note("aaa")]
        book.orderFresh = true
        Seats.fixOrder(&book)
        Seats.touchLayout(&book, now: 5000)
        XCTAssertNil(Seats.layoutToSend(book))
        XCTAssertFalse(Seats.mergeLayout(&book, .unreadable))
        XCTAssertTrue(book.orderFresh)
        Seats.mergeLayout(&book, .missing)
        XCTAssertFalse(book.orderFresh)
        XCTAssertNotNil(Seats.layoutToSend(book))
    }

    /// 只拿掉「還沒對過」的記號也要存下來，但不叫畫面重畫（跟其他同步記號一樣）
    func testFreshMarkIsOnlyAMark() {
        var one = Notebook()
        one.orderFresh = true
        var two = one
        two.orderFresh = false
        XCTAssertTrue(Sync.onlyMarks(one, two))
    }
}

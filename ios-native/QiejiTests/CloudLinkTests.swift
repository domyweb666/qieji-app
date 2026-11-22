@testable import Qieji
import XCTest

/// iCloud 接上 app 之後的時機（CloudLink）：用一個本機資料夾假扮 iCloud，兩份資料當兩台手機。
/// 合併規則本身由 CloudTests、FixtureTests 對照 Expo 版測過，這裡只測「准不准、什麼時候拉、傳」
final class CloudLinkTests: XCTestCase {
    private var dir = URL(fileURLWithPath: NSTemporaryDirectory())

    override func setUp() {
        super.setUp()
        dir = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("cloudlink-\(UUID().uuidString)")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: dir)
        super.tearDown()
    }

    private func phone(_ notes: [Note]) -> (Store, CloudLink) {
        var book = Notebook()
        book.notes = notes
        Seats.fixOrder(&book)
        let store = Store()
        store.adopt(book, last: notes.first?.id)
        Sync.stampMods(&book, now: Clock.now())
        store.replaceBook(book)
        let link = CloudLink(drive: FolderDrive(dir: dir))
        link.store = store
        return (store, link)
    }

    /// 等到 done() 成立，最多 timeout 秒。用 async 的等法：測試在主執行緒上讓出來，
    /// CloudLink 從背景回主執行緒的事（合併、等 2 秒再傳）才輪得到。
    /// 2026-11-22 GitHub 的 Xcode 26.6／iOS 26.5 上，原本用 XCTest 的 wait(for:) 等，這幾件事一直沒跑、三次都等到逾時
    /// （limrun 的 Xcode 26.4、27.1 都過）。推測是那一版的 wait(for:) 等的時候不處理主執行緒排的事，所以改成不靠它
    @MainActor
    private func waitUntil(_ what: String, timeout: Double = 8, _ done: () -> Bool) async {
        let end = Date().addingTimeInterval(timeout)
        while !done() {
            if Date() > end {
                XCTFail("等不到：\(what)")
                return
            }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
    }

    func testNotAllowedTouchesNothing() {
        var note = Note.blank(now: 1000)
        note.title = "不准同步"
        note.items = [Item(text: "一行")]
        let (_, link) = phone([note])
        link.pull()
        link.pushSoon(now: true)
        let files = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
        XCTAssertTrue(files.isEmpty)
    }

    @MainActor
    func testNoteTravelsFromOnePhoneToAnother() async {
        var note = Note.blank(now: 1000)
        note.title = "從 A 來的"
        note.items = [Item(text: "牛奶")]
        let (storeA, linkA) = phone([note])
        linkA.setAllowed(true) // 先拉（空的）才准傳，傳的時候等 2 秒
        await waitUntil("A 傳上去") { storeA.book.note(note.id)?.syncedHash != nil }

        var other = Note.blank(now: 2000)
        other.title = "B 自己的"
        other.items = [Item(text: "豆腐")]
        let (storeB, linkB) = phone([other])
        linkB.setAllowed(true)
        await waitUntil("B 拉下來") { storeB.book.note(note.id) != nil }
        XCTAssertEqual(storeB.book.note(note.id)?.items.map(\.text), ["牛奶"])
        XCTAssertNotNil(storeB.book.note(other.id))
    }

    @MainActor
    func testLockedNoteStaysOnThePhone() async {
        var open = Note.blank(now: 1000)
        open.title = "公開"
        open.items = [Item(text: "a")]
        var secret = Note.blank(now: 1000)
        secret.title = "秘密"
        secret.locked = true
        secret.items = [Item(text: "b")]
        let (storeA, linkA) = phone([open, secret])
        linkA.setAllowed(true)
        await waitUntil("公開那張傳上去") { storeA.book.note(open.id)?.syncedHash != nil }
        let files = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
        XCTAssertTrue(files.contains("\(open.id).json"))
        XCTAssertFalse(files.contains("\(secret.id).json"))
    }
}

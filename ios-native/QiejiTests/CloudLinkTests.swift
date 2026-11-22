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

    private func wait(_ what: String, timeout: Double = 8, _ done: @escaping () -> Bool) {
        let gate = expectation(description: what)
        func poll() {
            if done() {
                gate.fulfill()
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1, execute: poll)
            }
        }
        poll()
        wait(for: [gate], timeout: timeout)
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

    func testNoteTravelsFromOnePhoneToAnother() {
        var note = Note.blank(now: 1000)
        note.title = "從 A 來的"
        note.items = [Item(text: "牛奶")]
        let (storeA, linkA) = phone([note])
        linkA.setAllowed(true) // 先拉（空的）才准傳，傳的時候等 2 秒
        wait("A 傳上去") { storeA.book.note(note.id)?.syncedHash != nil }

        var other = Note.blank(now: 2000)
        other.title = "B 自己的"
        other.items = [Item(text: "豆腐")]
        let (storeB, linkB) = phone([other])
        linkB.setAllowed(true)
        wait("B 拉下來") { storeB.book.note(note.id) != nil }
        XCTAssertEqual(storeB.book.note(note.id)?.items.map(\.text), ["牛奶"])
        XCTAssertNotNil(storeB.book.note(other.id))
    }

    func testLockedNoteStaysOnThePhone() {
        var open = Note.blank(now: 1000)
        open.title = "公開"
        open.items = [Item(text: "a")]
        var secret = Note.blank(now: 1000)
        secret.title = "秘密"
        secret.locked = true
        secret.items = [Item(text: "b")]
        let (storeA, linkA) = phone([open, secret])
        linkA.setAllowed(true)
        wait("公開那張傳上去") { storeA.book.note(open.id)?.syncedHash != nil }
        let files = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
        XCTAssertTrue(files.contains("\(open.id).json"))
        XCTAssertFalse(files.contains("\(secret.id).json"))
    }
}

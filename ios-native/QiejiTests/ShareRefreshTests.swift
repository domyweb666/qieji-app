@testable import Qieji
import XCTest

/// 分享面板開著時切去茄記上鎖、刪紙、改名再切回來：app 寫完紙單要講一聲，面板跟著換；挑過的那張不在了回到預設
final class ShareRefreshTests: ShareSafeCase {
    /// 跨佇列數講了幾聲
    private final class Heard: @unchecked Sendable {
        private let lock = NSLock()
        private var count = 0

        func add() {
            lock.lock()
            count += 1
            lock.unlock()
        }

        var times: Int {
            lock.lock()
            defer { lock.unlock() }
            return count
        }
    }

    private func target(_ id: String) -> ShareTarget {
        ShareTarget(id: id, title: "紙 \(id)", glyph: "紙", color: "purple")
    }

    private func listening(_ heard: Heard) -> ShareInbox {
        var inbox = inbox
        inbox.announce = { heard.add() }
        return inbox
    }

    // MARK: 講一聲

    /// 檔真的換了才講：一樣的不講，拿掉（上鎖到一張都沒有）也講，本來就沒有的不講
    func testAnnouncesOnlyWhenTheListChanges() {
        let heard = Heard(), inbox = listening(heard)
        XCTAssertTrue(inbox.setTargets([target("n1"), target("n2")]))
        XCTAssertEqual(heard.times, 1)
        XCTAssertTrue(inbox.setTargets([target("n1"), target("n2")]))
        XCTAssertEqual(heard.times, 1)
        XCTAssertTrue(inbox.setTargets([target("n2")]))
        XCTAssertEqual(heard.times, 2)
        XCTAssertTrue(inbox.setTargets([]))
        XCTAssertEqual(heard.times, 3)
        XCTAssertTrue(inbox.setTargets([]))
        XCTAssertEqual(heard.times, 3)
    }

    /// 寫不進去：舊的拿掉了，也要講（面板上不准留著舊名字）
    func testAnnouncesWhenTheOldListIsDropped() throws {
        let heard = Heard(), inbox = listening(heard)
        XCTAssertTrue(inbox.setTargets([target("n1")]))
        // 資料夾不給動：換檔、刪檔都不行，只能把原檔寫成空的
        let dir = names.deletingLastPathComponent().path
        let old = try XCTUnwrap(FileManager.default.attributesOfItem(atPath: dir)[.posixPermissions] as? Int)
        try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: dir)
        defer { try? FileManager.default.setAttributes([.posixPermissions: old], ofItemAtPath: dir) }
        XCTAssertFalse(inbox.setTargets([target("n2")]))
        XCTAssertEqual(heard.times, 2)
        XCTAssertEqual(inbox.targets(), [])
    }

    /// 真的跨得過去：講一聲之後，接著聽的這個行程收得到
    func testPingReachesTheListener() {
        ShareInbox.listen()
        let got = expectation(forNotification: ShareInbox.changed, object: nil)
        ShareInbox.ping()
        wait(for: [got], timeout: 5)
    }

    /// 上鎖那一刻：紙單換掉、而且講一聲（面板開著才會馬上拿掉那張的名字）
    @MainActor
    func testLockingTellsTheOpenPanel() {
        let heard = Heard()
        let store = store([note("aaa"), note("bbb")])
        store.inbox = listening(heard)
        store.pushTarget(now: true) // 排著的先寫完（同一條佇列）
        let base = heard.times
        XCTAssertEqual(inbox.targets().map(\.id), ["aaa", "bbb"])
        store.setLocked("bbb", true)
        store.pushTarget(now: true)
        XCTAssertEqual(heard.times, base + 1)
        XCTAssertEqual(inbox.targets().map(\.id), ["aaa"])
        XCTAssertFalse(inbox.targets().contains { $0.title == "bbb" })
    }

    /// 改名、刪紙：存檔那條推出去時也講
    @MainActor
    func testRenameAndDeleteTellThePanel() async {
        let heard = Heard()
        let store = store([note("aaa"), note("bbb")])
        store.inbox = listening(heard)
        store.pushTarget(now: true)
        let base = heard.times
        store.rename("bbb", "買菜")
        store.flush()
        await waitUntil("改名推出去") { inbox.targets().contains { $0.title == "買菜" } }
        await waitUntil("改名講一聲") { heard.times > base }
        let renamed = heard.times
        store.trashNote("bbb")
        store.flush()
        await waitUntil("刪掉的拿掉") { inbox.targets().map(\.id) == ["aaa"] }
        await waitUntil("刪紙講一聲") { heard.times > renamed }
    }

    // MARK: 面板跟著換

    /// 挑過的那張還在就跟著它（位置變了也一樣）；上鎖、刪掉、滿了不在紙單上了是 nil（回到預設）
    func testPickedPaperIsFollowed() {
        let old = [target("a"), target("b"), target("c")]
        XCTAssertEqual(ShareTarget.follow(1, from: old, in: [target("c"), target("a"), target("b")]), 2)
        XCTAssertEqual(ShareTarget.follow(0, from: old, in: [target("b"), target("a")]), 1)
        XCTAssertNil(ShareTarget.follow(1, from: old, in: [target("a"), target("c")]))
        XCTAssertNil(ShareTarget.follow(2, from: old, in: []))
        XCTAssertNil(ShareTarget.follow(5, from: old, in: old))
        XCTAssertNil(ShareTarget.follow(0, from: [], in: old))
        // 改了名字還是同一張
        var renamed = target("b")
        renamed.title = "買菜"
        XCTAssertEqual(ShareTarget.follow(1, from: old, in: [target("a"), renamed]), 1)
    }

    // MARK: 同名的分得出來

    private func stamp(_ day: Int, _ hour: Int, _ minute: Int, _ second: Int = 0, ms: Int = 0) -> Double {
        let parts = DateComponents(year: 2026, month: 11, day: day, hour: hour, minute: minute, second: second)
        return (Calendar.current.date(from: parts)?.timeIntervalSince1970 ?? 0) * 1000 + Double(ms)
    }

    private func paper(_ title: String, _ created: Double) -> Note {
        var note = note("x", ["不准外露的第一行"])
        note.title = title
        note.created = created
        return note
    }

    /// 同一分鐘開的兩張沒取名的（多米 11/25 看到兩個「未命名・11/25 10:16」）：加到秒，不加日期，一行放得下
    func testSameMinuteGetsSeconds() {
        let one = paper("", stamp(25, 10, 16, 5)), two = paper("", stamp(25, 10, 16, 41))
        XCTAssertEqual(InboxMerge.names([one, two]), ["未命名・10:16:05", "未命名・10:16:41"])
        XCTAssertEqual(InboxMerge.names([one, two, paper("買菜", stamp(25, 10, 16, 5))]).last, "買菜")
    }

    /// 只看時分會撞到別天的：再往長的試
    func testEachTakesTheShortestThatIsItsOwn() {
        let notes = [
            paper("", stamp(25, 10, 16)), paper("", stamp(25, 10, 20)), paper("", stamp(24, 10, 16)), paper("", stamp(24, 11, 0)),
            paper("", stamp(23, 9, 0)),
        ]
        XCTAssertEqual(
            InboxMerge.names(notes),
            ["未命名・11/25 10:16", "未命名・10:20", "未命名・11/24 10:16", "未命名・11:00", "未命名・11/23"]
        )
        let seconds = [paper("", stamp(25, 10, 16, 5)), paper("", stamp(25, 10, 16, 30)), paper("", stamp(24, 10, 16, 5))]
        XCTAssertEqual(InboxMerge.names(seconds), ["未命名・11/25 10:16:05", "未命名・10:16:30", "未命名・11/24"])
    }

    /// 同一秒開的（不太可能，但不准一樣）：後面的加（2）（3）
    func testSameSecondGetsANumber() {
        let notes = [paper("", stamp(25, 10, 16, 5)), paper("", stamp(25, 10, 16, 5, ms: 300)), paper("", stamp(25, 10, 16, 5, ms: 600))]
        XCTAssertEqual(
            InboxMerge.names(notes), ["未命名・11/25 10:16:05", "未命名・11/25 10:16:05（2）", "未命名・11/25 10:16:05（3）"]
        )
    }

    /// 隨便亂排：每一行都不一樣；沒撞名的照原名；第一行不准出現
    func testNamesAreAlwaysDifferent() {
        var rng = SystemRandomNumberGenerator()
        for _ in 0 ..< 200 {
            let notes = (0 ..< Int.random(in: 1 ... 12, using: &rng)).map { _ in
                paper(["", "買菜", "書"].randomElement(using: &rng) ?? "", stamp(
                    Int.random(in: 24 ... 25, using: &rng), Int.random(in: 10 ... 11, using: &rng),
                    Int.random(in: 0 ... 1, using: &rng), Int.random(in: 0 ... 1, using: &rng), ms: Int.random(in: 0 ... 1, using: &rng)
                ))
            }
            let names = InboxMerge.names(notes)
            XCTAssertEqual(Set(names).count, names.count, "\(names)")
            XCTAssertFalse(names.contains { $0.contains("第一行") })
            let labels = notes.map(Labels.label)
            for (name, label) in zip(names, labels) where labels.filter({ $0 == label }).count == 1 {
                XCTAssertEqual(name, label)
            }
        }
    }
}

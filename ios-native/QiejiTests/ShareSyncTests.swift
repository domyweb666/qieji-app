@testable import Qieji
import XCTest

/// 假的 iCloud 資料夾，可以慢、可以壞、可以數拉了幾次
private final class TestDrive: CloudDrive {
    let base: FolderDrive
    var online = true
    var broken = false
    var slow: Double = 0 // 列檔名（拉）要多久
    var slowWrite: Double = 0 // 寫一個檔（傳）要多久
    private let lock = NSLock()
    private var listed = 0

    init(dir: URL) {
        base = FolderDrive(dir: dir)
    }

    var pulls: Int {
        lock.lock()
        defer { lock.unlock() }
        return listed
    }

    func available() -> Bool {
        online
    }

    func names() throws -> [String] {
        lock.lock()
        listed += 1
        lock.unlock()
        Thread.sleep(forTimeInterval: slow)
        if broken {
            throw CloudError.notFound
        }
        return try base.names()
    }

    func read(_ name: String) throws -> String {
        try base.read(name)
    }

    func write(_ name: String, _ text: String) throws {
        Thread.sleep(forTimeInterval: slowWrite)
        try base.write(name, text)
    }

    func remove(_ name: String) throws {
        try base.remove(name)
    }
}

/// 收件匣等同步（第 1 條）
final class ShareSyncTests: ShareSafeCase {
    private var cloudDir: URL {
        root.appendingPathComponent("cloud")
    }

    private func drive(slow: Double = 0.4) -> TestDrive {
        let drive = TestDrive(dir: cloudDir)
        drive.slow = slow
        return drive
    }

    private func link(_ drive: TestDrive, _ store: Store) -> CloudLink {
        let link = CloudLink(drive: drive)
        link.store = store
        return link
    }

    private func put(_ note: Note) throws {
        var book = Notebook()
        var paper = note
        paper.hash = nil
        paper.mod = Clock.now()
        paper.syncedHash = nil
        book.notes = [paper]
        Sync.stampMods(&book, now: Clock.now())
        try FolderDrive(dir: cloudDir).write("\(note.id).json", NoteCoding.json(book.notes[0]).stringify())
    }

    private func cloudTexts(_ id: String) -> [String] {
        guard let text = try? FolderDrive(dir: cloudDir).read("\(id).json"),
              let dict = JSONValue.parse(text)?.objectValue else { return [] }
        return NoteCoding.note(dict).items.map(\.text)
    }

    /// A 跟 iCloud 對過的紙
    private func synced(_ notes: [Note]) throws -> Store {
        let store = store(notes)
        var book = store.book
        Sync.stampMods(&book, now: Clock.now())
        for idx in book.notes.indices {
            book.notes[idx].syncedHash = book.notes[idx].hash
            try put(book.notes[idx])
        }
        store.replaceBook(book)
        return store
    }

    /// B 改了一行、刪了一行、改了名字，A 還沒拉：分享的一行要併在 B 改完的那份上
    @MainActor
    func testOtherPhonesEditsSurvive() async throws {
        let store = try synced([note("aaa", ["一", "二", "三"])])
        var theirs = note("aaa", ["B 改過的一", "三"])
        theirs.items[1].id = "aaa-2"
        theirs.items[1].done = true
        theirs.title = "B 取的名字"
        try put(theirs)
        let link = link(drive(), store)
        try share(["分享的"], note: "aaa")
        link.setAllowed(true)
        store.takeInbox(after: link)
        await rest(0.2)
        XCTAssertEqual(texts(store), ["一", "二", "三"]) // 還在等
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(texts(store), ["分享的", "B 改過的一", "三"])
        XCTAssertEqual(store.book.note("aaa")?.title, "B 取的名字")
        XCTAssertEqual(store.book.note("aaa")?.items.last?.done, true)
        await waitUntil("傳上去") { cloudTexts("aaa") == ["分享的", "B 改過的一", "三"] }
    }

    /// 回到前景：上一輪早就拉完了，這次再拉一輪才併
    @MainActor
    func testComingBackWaitsForANewRound() async throws {
        let store = try synced([note("aaa", ["一"])])
        let drive = drive(slow: 0)
        let link = link(drive, store)
        link.setAllowed(true)
        await waitUntil("第一輪") { link.lastSync != nil }
        try put(note("aaa", ["B 改過的一"]))
        drive.slow = 0.4
        try share(["分享的"], note: "aaa")
        link.pull()
        store.takeInbox(after: link)
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(texts(store), ["分享的", "B 改過的一"])
    }

    /// 正在傳：等傳完再拉一輪，那一輪拉完才叫
    @MainActor
    func testWaitsOutAPushThenPulls() async throws {
        let store = try synced([note("aaa", ["一"])])
        let drive = drive(slow: 0)
        let link = link(drive, store)
        link.setAllowed(true)
        await waitUntil("第一輪") { link.lastSync != nil }
        drive.slowWrite = 1
        store.edit { $0.notes.append(self.note("bbb", ["新的"])) }
        store.flush()
        let before = drive.pulls
        link.pushSoon(now: true)
        await rest(0.3) // 已經在傳 bbb（要一秒以上）
        try put(note("aaa", ["B 改過的一"]))
        var calls = 0
        link.whenPulled {
            calls += 1
            XCTAssertEqual(self.texts(store), ["B 改過的一"])
        }
        XCTAssertEqual(calls, 0)
        await waitUntil("叫我") { calls == 1 }
        XCTAssertGreaterThan(drive.pulls, before)
        await rest()
        XCTAssertEqual(calls, 1)
    }

    /// 正在傳、傳的時候發現別台改過：等它自己再拉的那一輪
    @MainActor
    func testWaitsForTheRoundAfterAConflict() async throws {
        let store = try synced([note("aaa", ["一"]), note("bbb", ["乙"])])
        let drive = drive(slow: 0)
        let link = link(drive, store)
        link.setAllowed(true)
        await waitUntil("第一輪") { link.lastSync != nil }
        drive.slowWrite = 0.6
        try put(note("bbb", ["B 改過的乙"]))
        store.setText("aaa-0", "A 改的", in: "aaa")
        store.setText("bbb-0", "A 也改了", in: "bbb")
        store.flush()
        link.pushSoon(now: true)
        await rest(0.2)
        var calls = 0
        link.whenPulled {
            calls += 1
            XCTAssertEqual(store.book.note("bbb")?.hash, store.book.note("bbb").map(Sync.fingerprint))
            XCTAssertNotEqual(store.book.note("bbb")?.hash, store.book.note("bbb")?.syncedHash) // 合過了，等著傳
        }
        XCTAssertEqual(calls, 0)
        await waitUntil("叫我") { calls == 1 }
        await rest()
        XCTAssertEqual(calls, 1)
    }

    /// 沒在同步：立刻併
    @MainActor
    func testNotSyncingDoesNotWait() async throws {
        let store = store([note("aaa")])
        let drive = drive(slow: 3)
        let link = link(drive, store)
        var called = false
        link.whenPulled { called = true }
        XCTAssertTrue(called)
        try share(["分享的"])
        store.takeInbox(after: link)
        await waitUntil("檔刪掉", timeout: 2) { left() == 0 }
        XCTAssertEqual(texts(store), ["分享的", "舊的"])
        XCTAssertEqual(drive.pulls, 0)
    }

    /// iCloud 沒開、列不出資料夾：有結果就併
    @MainActor
    func testMergesWhenCloudCannotBeRead() async throws {
        for broken in [true, false] {
            let store = store([note("aaa")])
            let drive = drive(slow: 0.1)
            drive.broken = broken
            drive.online = broken
            let link = link(drive, store)
            try share(["分享的"])
            link.setAllowed(true)
            store.takeInbox(after: link)
            await waitUntil("檔刪掉", timeout: 3) { left() == 0 }
            XCTAssertEqual(texts(store), ["分享的", "舊的"])
        }
    }

    /// 換了一個 iCloud，停下來問「放進去」：還沒答就照樣併，之後每次也是
    @MainActor
    func testMergesWhileAsking() async throws {
        let store = try synced([note("aaa")])
        try FileManager.default.removeItem(at: cloudDir)
        let link = link(drive(slow: 0.1), store)
        try share(["分享的"])
        link.setAllowed(true)
        store.takeInbox(after: link)
        await waitUntil("檔刪掉", timeout: 3) { left() == 0 }
        XCTAssertTrue(link.asking)
        XCTAssertEqual(texts(store), ["分享的", "舊的"])
        link.decline()
        var called = false
        link.whenPulled { called = true }
        XCTAssertTrue(called)
    }

    /// 不准寫檔、紙還沒讀好：這一輪不會有，不要一直等（收件匣自己會擋）
    @MainActor
    func testFrozenIsAnsweredAtOnce() {
        let frozen = store([note("aaa")])
        frozen.frozen = true
        let early = Store(disk: disk())
        for one in [frozen, early] {
            let link = link(drive(), one)
            link.setAllowed(true)
            var called = false
            link.whenPulled { called = true }
            XCTAssertTrue(called)
        }
    }

    /// 太久沒結果：照併，只併一次
    @MainActor
    func testGivesUpWaiting() async {
        let store = store([note("aaa")])
        let link = link(drive(slow: 1.5), store)
        link.setAllowed(true)
        var calls = 0
        link.whenPulled(limit: 0.2) { calls += 1 }
        XCTAssertEqual(calls, 0)
        await rest(0.4) // 還在拉：一次不夠，再等
        XCTAssertEqual(calls, 0)
        await waitUntil("三次之後", timeout: 1) { calls == 1 }
        XCTAssertNil(link.lastSync)
        await waitUntil("那一輪拉完") { link.lastSync != nil }
        await rest()
        XCTAssertEqual(calls, 1)
    }

    /// 還在拉就再等：第二次等到了，併在別台改完的那份上
    @MainActor
    func testKeepsWaitingWhileStillPulling() async throws {
        let store = try synced([note("aaa", ["一"])])
        try put(note("aaa", ["B 改過的一"]))
        let link = link(drive(slow: 0.9), store)
        link.setAllowed(true)
        var seen: [String] = []
        link.whenPulled(limit: 0.4) { seen = self.texts(store) }
        await waitUntil("叫我") { !seen.isEmpty }
        XCTAssertEqual(seen, ["B 改過的一"])
        XCTAssertNotNil(link.lastSync)
    }

    /// 沒在拉的不多等：還不知道買了沒、正在傳，第一次到了就叫
    @MainActor
    func testDoesNotWaitLongerWhenNotPulling() async throws {
        let one = link(drive(), store([note("aaa")]))
        one.setDeciding(true)
        var start = Date(), took = 0.0
        one.whenPulled(limit: 0.3) { took = -start.timeIntervalSinceNow }
        await waitUntil("不知道買了沒") { took > 0 }
        XCTAssertLessThan(took, 0.55)

        let store = try synced([note("aaa", ["一"])])
        let drive = drive(slow: 0)
        let two = link(drive, store)
        two.setAllowed(true)
        await waitUntil("第一輪") { two.lastSync != nil }
        drive.slowWrite = 2
        store.edit { $0.notes.append(self.note("bbb", ["新的"])) }
        store.flush()
        two.pushSoon(now: true)
        await rest(0.2)
        start = Date()
        took = 0
        two.whenPulled(limit: 0.3) { took = -start.timeIntervalSinceNow }
        await waitUntil("正在傳") { took > 0 }
        XCTAssertLessThan(took, 0.55)
    }

    /// 睡前拉到一半的那輪：回來不算，再拉一輪才放行
    @MainActor
    func testRoundFromBeforeSleepDoesNotCount() async throws {
        let store = try synced([note("aaa", ["一"])])
        let drive = drive(slow: 0.6)
        let link = link(drive, store)
        link.setAllowed(true)
        await rest(0.1) // 這一輪開始列檔名了
        link.forgetWaiting()
        XCTAssertEqual(drive.pulls, 1)
        try share(["分享的"], note: "aaa")
        store.takeInbox(after: link)
        link.pull()
        await waitUntil("睡前那輪拉完") { link.lastSync != nil }
        try put(note("aaa", ["B 改過的一"]))
        XCTAssertEqual(left(), 1)
        XCTAssertEqual(texts(store), ["一"])
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(texts(store), ["分享的", "B 改過的一"])
        XCTAssertEqual(drive.pulls, 2)
    }

    /// 在背景才開始拉的那輪也一樣；回來之後才開始的就算數，不多拉
    @MainActor
    func testRoundStartedWhileAwayDoesNotCount() async {
        let store = store([note("aaa")])
        let drive = drive(slow: 0.4)
        let link = link(drive, store)
        link.forgetWaiting()
        link.setAllowed(true)
        var calls = 0
        link.whenPulled { calls += 1 }
        await waitUntil("叫我") { calls == 1 }
        XCTAssertEqual(drive.pulls, 2)
        link.forgetWaiting()
        await rest()
        link.whenPulled { calls += 1 }
        link.pull()
        await waitUntil("叫我") { calls == 2 }
        XCTAssertEqual(drive.pulls, 3)
    }

    /// 過期的那輪一直不回來：保底時間到照樣叫，只叫一次；停在問「放進去」也不會一直等
    @MainActor
    func testStaleRoundNeverHangs() async throws {
        let slow = store([note("aaa")])
        let link = link(drive(slow: 1.5), slow)
        link.setAllowed(true)
        link.forgetWaiting()
        var calls = 0
        link.whenPulled(limit: 0.2) { calls += 1 }
        await waitUntil("保底", timeout: 1.2) { calls == 1 }
        await waitUntil("那一輪拉完") { link.lastSync != nil }
        await rest()
        XCTAssertEqual(calls, 1)

        let store = try synced([note("aaa")])
        try FileManager.default.removeItem(at: cloudDir)
        let other = self.link(drive(slow: 0.2), store)
        other.setAllowed(true)
        other.forgetWaiting()
        var asked = 0
        other.whenPulled { asked += 1 }
        await waitUntil("叫我", timeout: 2) { asked == 1 }
        XCTAssertTrue(other.asking)
    }

    /// 拉到一半關掉同步、離開前景
    @MainActor
    func testTurnedOffOrLeftHalfway() async {
        let store = store([note("aaa")])
        let one = link(drive(), store)
        one.setAllowed(true)
        var off = 0
        one.whenPulled { off += 1 }
        one.setAllowed(false)
        XCTAssertEqual(off, 1)
        // 那一輪還沒回來：已經沒在同步了，不等它
        one.whenPulled { off += 1 }
        XCTAssertEqual(off, 2)
        let two = link(drive(), store)
        two.setAllowed(true)
        var away = 0
        two.whenPulled(limit: 0.1) { away += 1 }
        two.forgetWaiting()
        await waitUntil("那一輪拉完") { two.lastSync != nil }
        XCTAssertEqual(away, 0)
        XCTAssertEqual(off, 2)
    }

    /// 重裝後第一次打開：還不知道買了沒就先等，不准動到教學紙；知道買了就等那一輪
    @MainActor
    func testReinstallLeavesTheTutorialAlone() async throws {
        try put(note("bbb", ["iCloud 上的"]))
        let store = Store(disk: disk())
        store.inbox = inbox
        store.boot()
        XCTAssertTrue(store.book.notes.allSatisfy(Tutorial.isUntouched))
        let link = link(drive(slow: 0.2), store)
        try share(["分享的"])
        link.setAllowed(false)
        link.setDeciding(true)
        store.takeInbox(after: link)
        await rest(0.5)
        XCTAssertTrue(store.book.notes.allSatisfy(Tutorial.isUntouched))
        XCTAssertEqual(left(), 1)
        link.setAllowed(true)
        link.setDeciding(false)
        await waitUntil("檔刪掉") { left() == 0 }
        XCTAssertEqual(store.book.notes.map(\.id), ["bbb"])
        XCTAssertEqual(texts(store, "bbb"), ["分享的", "iCloud 上的"])
    }

    /// 問過 Apple、確定沒買：馬上併
    @MainActor
    func testDecidedNotToSync() {
        let link = link(drive(), store([note("aaa")]))
        link.setDeciding(true)
        var called = false
        link.whenPulled { called = true }
        link.setAllowed(false)
        XCTAssertFalse(called)
        link.setDeciding(false)
        XCTAssertTrue(called)
    }
}

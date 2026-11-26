@testable import Qieji
import XCTest

/// 假的 iCloud：lagging 裡的檔＝這台手上那份還不是最新的（別台改過、新的那份還在路上）。
/// 真的 iCloud 讀這種檔時會回「還沒好」；寫照樣寫得進去（所以沒先看就寫，會蓋掉別台的）
final class LagDrive: CloudDrive {
    let base: FolderDrive
    private let lock = NSLock()
    private var lag: Set<String> = []

    init(dir: URL) {
        base = FolderDrive(dir: dir)
    }

    var lagging: Set<String> {
        get {
            lock.lock()
            defer { lock.unlock() }
            return lag
        }
        set {
            lock.lock()
            lag = newValue
            lock.unlock()
        }
    }

    func available() -> Bool {
        true
    }

    func names() throws -> [String] {
        try base.names()
    }

    func read(_ name: String) throws -> String {
        if lagging.contains(name) {
            _ = try base.read(name) // 沒有這個檔照樣回 notFound
            throw CloudError.notReady
        }
        return try base.read(name)
    }

    func write(_ name: String, _ text: String) throws {
        try base.write(name, text)
    }

    func remove(_ name: String) throws {
        try base.remove(name)
    }
}

/// iCloud 檔這台還沒下載到最新：不准拿舊的當真，分享進來的字等它下載好再放（還剩的第 1 條，2026-11-26）
final class StaleCloudTests: ShareSafeCase {
    var cloudDir: URL {
        root.appendingPathComponent("cloud")
    }

    func link(_ drive: CloudDrive, _ store: Store) -> CloudLink {
        let link = CloudLink(drive: drive)
        link.store = store
        return link
    }

    func put(_ note: Note) throws {
        var book = Notebook()
        var paper = note
        paper.hash = nil
        paper.mod = Clock.now()
        paper.syncedHash = nil
        book.notes = [paper]
        Sync.stampMods(&book, now: Clock.now())
        try FolderDrive(dir: cloudDir).write("\(note.id).json", NoteCoding.json(book.notes[0]).stringify())
    }

    func cloudNote(_ id: String) -> Note? {
        guard let text = try? FolderDrive(dir: cloudDir).read("\(id).json"),
              let dict = JSONValue.parse(text)?.objectValue else { return nil }
        return NoteCoding.note(dict)
    }

    func cloudTexts(_ id: String) -> [String] {
        cloudNote(id)?.items.map(\.text) ?? []
    }

    /// 跟 iCloud 對過的紙（兩邊一樣）
    func synced(_ notes: [Note]) throws -> Store {
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

    /// B 劃掉一行、刪一行、改了名字，這台手上那份還是舊的：分享的字先留在收件匣；下載好了才放，B 改的都還在
    @MainActor
    func testSharedLinesWaitForTheNewestCopy() async throws {
        let store = try synced([note("aaa", ["一", "二", "三"])])
        var theirs = note("aaa", ["B 改過的一", "三"])
        theirs.items[1].id = "aaa-2"
        theirs.items[1].done = true
        theirs.title = "B 取的名字"
        try put(theirs)
        let drive = LagDrive(dir: cloudDir)
        drive.lagging = ["aaa.json"]
        let link = link(drive, store)
        try share(["分享的"], note: "aaa")
        link.setAllowed(true)
        store.takeInbox(after: link)
        await waitUntil("拉完一輪") { link.lastSync != nil }
        await rest(0.6)
        XCTAssertEqual(left(), 1) // 字還在收件匣，沒丟
        XCTAssertEqual(texts(store), ["一", "二", "三"])
        XCTAssertEqual(cloudTexts("aaa"), ["B 改過的一", "三"]) // iCloud 上 B 的那份沒被蓋
        drive.lagging = []
        await waitUntil("下載好了、放進去", timeout: 10) { left() == 0 }
        XCTAssertEqual(texts(store), ["分享的", "B 改過的一", "三"])
        XCTAssertEqual(store.book.note("aaa")?.title, "B 取的名字")
        XCTAssertEqual(store.book.note("aaa")?.items.last?.done, true)
        await waitUntil("傳上去") { cloudTexts("aaa") == ["分享的", "B 改過的一", "三"] }
        XCTAssertEqual(cloudNote("aaa")?.title, "B 取的名字")
    }

    /// 只有別張還沒下載好：要放的那張是最新的，照放，不用等
    @MainActor
    func testOtherNotesLaggingDoNotHoldTheShare() async throws {
        let store = try synced([note("aaa", ["一"]), note("bbb", ["乙"])])
        let drive = LagDrive(dir: cloudDir)
        drive.lagging = ["bbb.json"]
        let link = link(drive, store)
        try share(["分享的"], note: "aaa")
        link.setAllowed(true)
        store.takeInbox(after: link)
        await waitUntil("放進去") { left() == 0 }
        XCTAssertEqual(texts(store), ["分享的", "一"])
    }

    /// 這台改了一行、iCloud 上那張別台改過還沒下載下來：不准蓋上去；下載好了兩邊合起來再傳
    @MainActor
    func testLocalEditWaitsForTheNewestCopy() async throws {
        let store = try synced([note("aaa", ["一"])])
        try put(note("aaa", ["一", "B 加的"]))
        let drive = LagDrive(dir: cloudDir)
        drive.lagging = ["aaa.json"]
        let link = link(drive, store)
        link.setAllowed(true)
        await waitUntil("拉完一輪") { link.lastSync != nil }
        store.setText("aaa-0", "A 改的", in: "aaa")
        store.flush()
        link.pushSoon(now: true)
        await rest(0.8)
        XCTAssertEqual(cloudTexts("aaa"), ["一", "B 加的"])
        drive.lagging = []
        await waitUntil("合起來傳上去", timeout: 10) { cloudTexts("aaa") == ["A 改的", "B 加的"] }
        XCTAssertEqual(texts(store), ["A 改的", "B 加的"])
    }
}

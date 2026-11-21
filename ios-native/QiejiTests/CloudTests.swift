@testable import Qieji
import XCTest

/// iCloud 傳輸層：用一個本機資料夾假扮 iCloud 雲碟，兩份資料當兩台手機，來回同步。
final class CloudTests: XCTestCase {
    private var dir = URL(fileURLWithPath: NSTemporaryDirectory())
    private let base: Double = 1_794_000_000_000

    override func setUp() {
        super.setUp()
        dir = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("qieji-cloud-\(UUID().uuidString)")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: dir)
        super.tearDown()
    }

    private var sync: CloudSync {
        CloudSync(drive: FolderDrive(dir: dir))
    }

    private func phone(_ titles: [String]) -> Notebook {
        var book = Notebook()
        for (idx, title) in titles.enumerated() {
            var note = Note.blank(color: "purple", now: base + Double(idx))
            note.id = "n\(idx)"
            note.title = title
            note.items = [Item(id: "n\(idx)-0", text: "\(title) 的第一行")]
            book.notes.append(note)
        }
        Seats.fixOrder(&book)
        return book
    }

    /// 一台手機存檔之後的上傳
    @discardableResult
    private func save(_ book: inout Notebook, gone: inout String, now: Double) -> CloudSync.Pushed {
        Sync.stampMods(&book, now: now)
        Seats.fixOrder(&book)
        return sync.push(&book, goneSent: &gone)
    }

    /// 一台手機拉 iCloud、合進來
    @discardableResult
    private func pull(_ book: inout Notebook, now: Double) -> Sync.MergeResult {
        guard case let .got(notes, gone, layout, _) = sync.fetch() else {
            XCTFail("拉不到")
            return Sync.MergeResult()
        }
        let res = Sync.mergeCloud(&book, notes: notes, gone: gone, now: now)
        Seats.mergeLayout(&book, layout)
        return res
    }

    private func files() -> [String] {
        ((try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []).sorted()
    }

    func testOffWhenCloudUnavailable() {
        let offline = CloudSync(drive: FolderDrive(dir: dir, online: false))
        guard case .off = offline.fetch() else {
            XCTFail("沒登入應該回 off")
            return
        }
        var book = phone(["甲"])
        var gone = ""
        Sync.stampMods(&book, now: base)
        XCTAssertEqual(offline.push(&book, goneSent: &gone), CloudSync.Pushed())
        XCTAssertNil(book.notes[0].syncedHash)
    }

    func testFirstUploadThenSecondPhoneGetsEverything() {
        var one = phone(["甲", "乙"])
        var goneOne = ""
        Seats.ownLayout(&one)
        let pushed = save(&one, gone: &goneOne, now: base + 10)
        XCTAssertEqual(pushed.synced, 3) // 兩張紙＋排列
        XCTAssertEqual(files(), ["layout.json", "n0.json", "n1.json"])
        XCTAssertTrue(one.notes.allSatisfy { $0.syncedHash == $0.hash })
        // 傳上去的檔不帶 sh
        let raw = (try? String(contentsOf: dir.appendingPathComponent("n0.json"), encoding: .utf8)) ?? ""
        XCTAssertFalse(raw.contains("\"sh\""))
        XCTAssertTrue(raw.contains("\"h\""))

        // 第二台剛裝好，只有教學紙
        var two = Notebook()
        two.notes = [Tutorial.note(now: base + 20)]
        let res = pull(&two, now: base + 30)
        XCTAssertEqual(res.added, 2)
        XCTAssertEqual(res.spare, 1) // 沒動過的教學紙拿掉
        XCTAssertEqual(two.notes.map(\.title).sorted(), ["乙", "甲"])
        XCTAssertEqual(two.order, one.order)
        // 第二台接著存檔：沒有東西要傳
        var goneTwo = ""
        XCTAssertEqual(save(&two, gone: &goneTwo, now: base + 40).synced, 0)
    }

    func testEditOnOnePhoneReachesTheOther() {
        var one = phone(["甲"])
        var two = phone([])
        var goneOne = "", goneTwo = ""
        save(&one, gone: &goneOne, now: base + 10)
        pull(&two, now: base + 20)
        save(&two, gone: &goneTwo, now: base + 21)

        two.notes[0].items.append(Item(id: "new", text: "第二台加的"))
        two.notes[0].updated = base + 30
        XCTAssertEqual(save(&two, gone: &goneTwo, now: base + 31).synced, 1)

        let res = pull(&one, now: base + 40)
        XCTAssertEqual(res.taken, 1)
        XCTAssertEqual(one.notes[0].items.map(\.text), ["甲 的第一行", "第二台加的"])
    }

    func testBothEditedWithoutPullingIsNotOverwritten() {
        var one = phone(["甲"])
        var two = phone([])
        var goneOne = "", goneTwo = ""
        save(&one, gone: &goneOne, now: base + 10)
        pull(&two, now: base + 20)
        save(&two, gone: &goneTwo, now: base + 21)

        // 兩台各自加一行，第二台先傳
        one.notes[0].items.append(Item(id: "a", text: "第一台加的"))
        two.notes[0].items.append(Item(id: "b", text: "第二台加的"))
        save(&two, gone: &goneTwo, now: base + 30)

        // 第一台沒拉就傳：發現 iCloud 上那份別台改過，不蓋、回報要先拉
        let blocked = save(&one, gone: &goneOne, now: base + 31)
        XCTAssertTrue(blocked.conflict)
        XCTAssertEqual(blocked.synced, 0)

        // 拉下來合：兩邊的行都在
        let res = pull(&one, now: base + 40)
        XCTAssertEqual(res.united, 1)
        XCTAssertEqual(Set(one.notes[0].items.map(\.id)), ["n0-0", "a", "b"])
        XCTAssertEqual(save(&one, gone: &goneOne, now: base + 41).synced, 1)

        // 第二台再拉：也拿到三行，兩台一樣
        pull(&two, now: base + 50)
        XCTAssertEqual(two.notes[0].items, one.notes[0].items)
    }

    func testPermanentDeleteLeavesTombstoneAndRemovesFile() {
        var one = phone(["甲", "乙"])
        var two = phone([])
        var goneOne = "", goneTwo = ""
        save(&one, gone: &goneOne, now: base + 10)
        pull(&two, now: base + 20)
        save(&two, gone: &goneTwo, now: base + 21)

        Sync.dropNotes(&one, now: base + 30) { $0.id == "n0" }
        let pushed = save(&one, gone: &goneOne, now: base + 31)
        XCTAssertTrue(pushed.goneWritten)
        XCTAssertFalse(files().contains("n0.json")) // iCloud 上那張的檔拿掉了
        XCTAssertTrue(files().contains("gone.json"))

        let res = pull(&two, now: base + 40)
        XCTAssertEqual(res.removed, 1)
        XCTAssertEqual(two.notes.map(\.id), ["n1"])
        // 第二台存檔不會把刪掉的紙傳回去
        save(&two, gone: &goneTwo, now: base + 41)
        XCTAssertFalse(files().contains("n0.json"))
    }

    func testOfflinePhoneKeepsEditingAfterTombstone() {
        var one = phone(["甲"])
        var two = phone([])
        var goneOne = "", goneTwo = ""
        save(&one, gone: &goneOne, now: base + 10)
        pull(&two, now: base + 20)
        save(&two, gone: &goneTwo, now: base + 21)

        Sync.dropNotes(&one, now: base + 30) { $0.id == "n0" }
        save(&one, gone: &goneOne, now: base + 31)

        // 第二台離線，在墓碑之後還在這張上記東西
        two.notes[0].items.append(Item(id: "late", text: "離線時記的"))
        Sync.stampMods(&two, now: base + 100)
        let res = pull(&two, now: base + 110)
        XCTAssertEqual(res.removed, 0) // 拿不準就留著
        XCTAssertEqual(two.notes.count, 1)
    }

    func testLockedAndTutorialNotesAreNotUploaded() {
        var one = phone(["甲"])
        one.notes[0].locked = true
        one.notes.append(Tutorial.note(now: base))
        var gone = ""
        save(&one, gone: &gone, now: base + 10)
        XCTAssertFalse(files().contains("n0.json"))
        XCTAssertEqual(files().filter { $0 != "layout.json" }, [])
    }

    func testLayoutNewerOnCloudIsNotOverwritten() {
        var one = phone(["甲", "乙", "丙"])
        var two = phone([])
        var goneOne = "", goneTwo = ""
        Seats.ownLayout(&one)
        save(&one, gone: &goneOne, now: base + 10)
        pull(&two, now: base + 20)
        save(&two, gone: &goneTwo, now: base + 21)

        // 第二台先排、先傳；第一台後來才拿到手機、排得比較早
        Seats.reseat(&two, visible: ["n0", "n1", "n2"], now: base + 60)
        XCTAssertEqual(save(&two, gone: &goneTwo, now: base + 61).synced, 1)
        Seats.reseat(&one, visible: ["n1", "n0", "n2"], now: base + 50)
        XCTAssertTrue(save(&one, gone: &goneOne, now: base + 62).conflict)
        pull(&one, now: base + 70)
        XCTAssertEqual(one.order, ["n0", "n1", "n2"])
    }

    func testBrokenFilesAreIgnored() throws {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try "{壞的".write(to: dir.appendingPathComponent("bad.json"), atomically: true, encoding: .utf8)
        try "不是紙".write(to: dir.appendingPathComponent("notes.txt"), atomically: true, encoding: .utf8)
        try "[1,2]".write(to: dir.appendingPathComponent("layout.json"), atomically: true, encoding: .utf8)
        var one = phone(["甲"])
        let res = pull(&one, now: base + 10)
        XCTAssertFalse(res.changed)
        XCTAssertEqual(one.notes.count, 1)
    }
}

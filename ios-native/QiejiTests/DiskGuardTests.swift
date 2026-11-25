@testable import Qieji
import XCTest

/// 原本的存檔讀不到、又沒能另存：這次打開什麼都不准寫，原檔一個位元都不准變。
final class DiskGuardTests: XCTestCase {
    private var root = URL(fileURLWithPath: NSTemporaryDirectory())
    private var defaults = UserDefaults.standard
    private let suite = "qieji.tests.diskguard"

    private var dir: URL {
        root.appendingPathComponent("QiejiNative")
    }

    private var legacyDir: URL {
        root.appendingPathComponent("RCTAsyncLocalStorage_V1")
    }

    private var state: URL {
        dir.appendingPathComponent("state.json")
    }

    override func setUpWithError() throws {
        try super.setUpWithError()
        root = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("qieji-\(UUID().uuidString)")
        UserDefaults().removePersistentDomain(forName: suite)
        defaults = UserDefaults(suiteName: suite) ?? .standard
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? mode(0o755, dir)
        try? FileManager.default.removeItem(at: root)
        UserDefaults().removePersistentDomain(forName: suite)
        super.tearDown()
    }

    private func disk() -> Disk {
        Disk(dir: dir, legacyDirs: [legacyDir], defaults: defaults)
    }

    private func mode(_ bits: Int, _ url: URL) throws {
        try FileManager.default.setAttributes([.posixPermissions: bits], ofItemAtPath: url.path)
    }

    private func sample(_ title: String) -> String {
        var note = Note.blank(color: "purple", now: 1000)
        note.id = "mine"
        note.title = title
        note.items = [Item(id: "i1", text: "原本記的")]
        var book = Notebook()
        book.notes = [note]
        return NoteCoding.write(book)
    }

    /// 放一份存檔，然後讓它讀不到（檔在、權限不給讀；資料夾照樣可寫，所以舊的程式蓋得掉）
    private func lockedState(_ raw: String) throws {
        try raw.write(to: state, atomically: true, encoding: .utf8)
        try mode(0, state)
        try XCTSkipIf((try? Data(contentsOf: state)) != nil, "這台機器擋不住讀取")
    }

    private func bytes(_ name: String) -> Data? {
        try? Data(contentsOf: dir.appendingPathComponent(name))
    }

    private func texts(_ store: Store) -> [String] {
        store.book.notes.flatMap(\.items).map(\.text)
    }

    // MARK: 一時讀不到

    func testUnreadFileIsNeverOverwritten() throws {
        let raw = sample("原本的紙")
        try lockedState(raw)
        let found = disk().load()
        XCTAssertEqual(found.source, .native)
        XCTAssertTrue(found.frozen)
        XCTAssertTrue(found.unreadable)
        XCTAssertTrue(found.book.notes.isEmpty)
        let store = Store(disk: disk())
        store.boot()
        store.ensureCurrent()
        XCTAssertNotNil(store.addTop("讀不到的時候記的"))
        store.saveSoon()
        store.flush()
        XCTAssertFalse(store.wipe())
        try mode(0o644, state)
        XCTAssertEqual(try String(contentsOf: state, encoding: .utf8), raw)
        XCTAssertEqual(store.notice?.title, Words.unreadTitle)
    }

    /// 讀不到新的存檔時，不准退回去搬 1.1 的舊資料
    func testUnreadFileDoesNotFallBackToLegacy() throws {
        let raw = sample("原本的紙")
        try FileManager.default.createDirectory(at: legacyDir, withIntermediateDirectories: true)
        try JSONValue.object([LegacyStore.bookKey: .string(sample("舊版的紙"))]).stringify().write(
            to: legacyDir.appendingPathComponent(LegacyStore.manifest), atomically: true, encoding: .utf8
        )
        try lockedState(raw)
        let store = Store(disk: disk())
        store.boot()
        store.flush()
        XCTAssertTrue(store.book.notes.allSatisfy(Labels.isEmpty)) // 只有一張空白的，沒有舊版那張
        XCTAssertNil(bytes("from-expo.json"))
        try mode(0o644, state)
        XCTAssertEqual(try String(contentsOf: state, encoding: .utf8), raw)
    }

    /// 回到前景再讀一次：紙回來了，中間記的字也留著，一起存進去
    func testThawBringsPapersBackAndKeepsWhatWasTyped() throws {
        defaults.set("mine", forKey: LegacyStore.lastKey)
        try lockedState(sample("原本的紙"))
        let store = Store(disk: disk())
        store.boot()
        store.ensureCurrent()
        XCTAssertNotNil(store.addTop("讀不到的時候記的"))
        store.newNote(compose: false) // 這張是空白的，不准帶回去
        store.thaw()
        XCTAssertTrue(store.frozen) // 還是讀不到：照樣不寫
        XCTAssertEqual(store.notice?.title, Words.unreadTitle)
        try mode(0o644, state)
        store.thaw()
        XCTAssertFalse(store.frozen)
        XCTAssertNil(store.notice)
        XCTAssertEqual(store.toast?.text, Words.typedKept)
        XCTAssertEqual(store.currentID, "mine")
        XCTAssertEqual(store.book.notes.count, 2)
        XCTAssertEqual(Set(texts(store)), ["原本記的", "讀不到的時候記的"])
        let again = Store(disk: disk())
        again.boot()
        XCTAssertEqual(Set(texts(again)), ["原本記的", "讀不到的時候記的"])
    }

    /// 讀不到的這段時間，「上次那張、最近開過」不准被空白紙洗掉
    func testUnreadKeepsLastAndRecent() throws {
        defaults.set("mine", forKey: LegacyStore.lastKey)
        defaults.set(["mine", "other"], forKey: LegacyStore.recentKey)
        try lockedState(sample("原本的紙"))
        let one = disk()
        let store = Store(disk: one)
        store.boot()
        store.ensureCurrent()
        store.newNote(compose: false)
        XCTAssertFalse(one.write(Notebook())) // 等排隊的設定寫完；繞過 Store 直接叫也不准寫
        XCTAssertEqual(defaults.string(forKey: LegacyStore.lastKey), "mine")
        XCTAssertEqual(defaults.stringArray(forKey: LegacyStore.recentKey), ["mine", "other"])
        try mode(0o644, state)
        XCTAssertEqual(try NoteCoding.readBook(String(contentsOf: state, encoding: .utf8))?.notes.first?.title, "原本的紙")
    }

    /// 沒有存檔就是新裝的，跟讀不到分得開
    func testMissingFileIsStillFresh() {
        let found = disk().load(now: 5000)
        XCTAssertEqual(found.source, .fresh)
        XCTAssertFalse(found.frozen)
    }

    // MARK: 內容壞掉

    /// 位元組不是合法的文字：以前會被當成新裝的，接著蓋掉
    func testBrokenBytesAreRescuedAsIs() throws {
        let bad = Data([0x7B, 0xFF, 0xFE, 0x22, 0x41, 0x7D])
        try bad.write(to: state)
        let store = Store(disk: disk())
        store.boot()
        XCTAssertFalse(store.frozen)
        XCTAssertEqual(store.notice?.title, Words.unreadableTitle)
        store.ensureCurrent()
        XCTAssertNotNil(store.addTop("之後記的"))
        store.flush()
        XCTAssertEqual(bytes("unreadable.json"), bad)
        // 下次打開不准把排列時間改成現在（會蓋掉 iCloud 的排列）
        var saved = disk().load().book
        XCTAssertFalse(Seats.packGrid(&saved, now: 9_999_999))
        let again = Store(disk: disk())
        again.boot()
        XCTAssertEqual(texts(again), ["之後記的"])
    }

    /// 另存不成：這次什麼都不寫，提示不准說「已經另存」。等另存得了再繼續
    func testFailedRescueFreezes() throws {
        let raw = "壞掉的存檔"
        try raw.write(to: state, atomically: true, encoding: .utf8)
        try mode(0o555, dir)
        try XCTSkipIf((try? Data().write(to: dir.appendingPathComponent("probe"))) != nil, "這台機器擋不住寫入")
        let store = Store(disk: disk())
        store.boot()
        XCTAssertTrue(store.frozen)
        XCTAssertEqual(store.notice?.title, Words.unreadTitle)
        try mode(0o755, dir)
        store.ensureCurrent()
        XCTAssertNotNil(store.addTop("另存不成的時候記的"))
        store.flush()
        XCTAssertEqual(try String(contentsOf: state, encoding: .utf8), raw)
        store.thaw()
        XCTAssertFalse(store.frozen)
        XCTAssertEqual(store.notice?.title, Words.unreadableTitle)
        XCTAssertEqual(bytes("unreadable.json"), Data(raw.utf8))
        let again = Store(disk: disk())
        again.boot()
        XCTAssertEqual(texts(again), ["另存不成的時候記的"])
    }

    /// 壞第二次：第一次另存的那份不准被蓋掉；清除所有資料兩份都拿掉
    func testSecondRescueKeepsTheFirst() throws {
        for raw in ["第一次壞的", "第二次壞的", "第二次壞的"] {
            try raw.write(to: state, atomically: true, encoding: .utf8)
            XCTAssertFalse(disk().load().frozen)
        }
        XCTAssertEqual(bytes("unreadable.json"), Data("第一次壞的".utf8))
        XCTAssertEqual(bytes("unreadable-2.json"), Data("第二次壞的".utf8))
        XCTAssertNil(bytes("unreadable-3.json"))
        XCTAssertTrue(disk().wipe())
        XCTAssertNil(bytes("unreadable.json"))
        XCTAssertNil(bytes("unreadable-2.json"))
    }

    // MARK: 永久讀不到的出路

    private func boot() -> Store {
        let store = Store(disk: disk())
        store.boot()
        return store
    }

    /// 第三次冷啟動還讀不到才給；回到前景再試不算一次；讀到一次就歸零
    func testOfferOnlyAfterThirdLaunch() throws {
        try lockedState(sample("原本的紙"))
        for _ in 1 ..< Disk.offerAfter {
            let store = boot()
            XCTAssertEqual(store.notice?.offer, false)
            for _ in 0 ..< 5 {
                store.thaw()
            }
            XCTAssertEqual(store.notice?.offer, false)
        }
        let third = boot()
        XCTAssertEqual(third.notice?.offer, true)
        third.notice = nil
        third.thaw()
        XCTAssertEqual(third.notice?.offer, true)
        try mode(0o644, state)
        third.thaw()
        XCTAssertNil(third.notice)
        try mode(0, state)
        XCTAssertEqual(boot().notice?.offer, false)
    }

    /// 原檔一個位元都沒變、換了名字留著；中間記的字存進新的；重開還在；不會再跳
    func testStartOverKeepsTheOriginalAside() throws {
        let raw = sample("原本的紙")
        try lockedState(raw)
        let store = boot()
        XCTAssertNotNil(store.addTop("讀不到的時候記的"))
        XCTAssertTrue(store.startOver())
        XCTAssertFalse(store.frozen)
        XCTAssertEqual(store.toast?.text, Words.startedOver)
        XCTAssertNil(store.notice)
        XCTAssertNil(store.book.orderMod) // 空的這份不准認領排列：比 iCloud 的新就會蓋過去
        XCTAssertTrue(disk().hasAside)
        XCTAssertNotNil(store.addTop("之後記的"))
        store.flush()
        let aside = dir.appendingPathComponent("unreadable.json")
        try mode(0o644, aside)
        XCTAssertEqual(bytes("unreadable.json"), Data(raw.utf8))
        let again = boot()
        XCTAssertNil(again.notice)
        XCTAssertEqual(texts(again), ["之後記的", "讀不到的時候記的"])
        XCTAssertTrue(again.book.gone.isEmpty) // 不准立墓碑：會把 iCloud 的也刪掉
    }

    /// 什麼都沒記也能從空的開始
    func testStartOverWithNothingTyped() throws {
        try lockedState(sample("原本的紙"))
        let store = boot()
        XCTAssertTrue(store.startOver())
        XCTAssertNotNil(store.current)
        XCTAssertNotNil(store.addTop("之後記的"))
        store.flush()
        XCTAssertEqual(texts(boot()), ["之後記的"])
    }

    /// 按下去那一刻剛好讀得到：紙回來，什麼都不移
    func testStartOverReadsOnceMoreFirst() throws {
        try lockedState(sample("原本的紙"))
        let store = boot()
        XCTAssertNotNil(store.addTop("讀不到的時候記的"))
        try mode(0o644, state)
        XCTAssertTrue(store.startOver())
        XCTAssertEqual(Set(texts(store)), ["原本記的", "讀不到的時候記的"])
        XCTAssertNil(bytes("unreadable.json"))
    }

    /// 移不成：原檔沒動、照樣不寫，講沒移成；記的字還在畫面上，之後可以再試
    func testStartOverFailureTouchesNothing() throws {
        let raw = sample("原本的紙")
        try lockedState(raw)
        let store = boot()
        XCTAssertNotNil(store.addTop("讀不到的時候記的"))
        try mode(0o555, dir)
        try XCTSkipIf((try? Data().write(to: dir.appendingPathComponent("probe"))) != nil, "這台機器擋不住寫入")
        XCTAssertFalse(store.startOver())
        XCTAssertTrue(store.frozen)
        XCTAssertEqual(store.notice?.title, Words.startOverFailTitle)
        XCTAssertEqual(texts(store), ["讀不到的時候記的"])
        try mode(0o755, dir)
        store.flush()
        try mode(0o644, state)
        XCTAssertEqual(try String(contentsOf: state, encoding: .utf8), raw)
        try mode(0, state)
        XCTAssertTrue(store.startOver())
        XCTAssertEqual(texts(boot()), ["讀不到的時候記的"])
    }

    /// 問到一半切走再回來：還讀不到就不疊提示；讀到了就不用問了
    func testAskingIsNotStackedAndClosesWhenBack() throws {
        try lockedState(sample("原本的紙"))
        let store = boot()
        store.notice = nil
        store.startOverAsk = true
        store.thaw()
        XCTAssertNil(store.notice)
        XCTAssertTrue(store.startOverAsk)
        try mode(0o644, state)
        store.thaw()
        XCTAssertFalse(store.startOverAsk)
        XCTAssertNil(store.notice)
        XCTAssertFalse(disk().hasAside)
    }

    /// 從 1.1 搬家時備份不成的那種 frozen：不算次數、沒有按鈕、移不了
    func testLegacyFrozenHasNoExit() throws {
        try FileManager.default.createDirectory(at: legacyDir, withIntermediateDirectories: true)
        try JSONValue.object([LegacyStore.bookKey: .string(sample("舊版的紙"))]).stringify().write(
            to: legacyDir.appendingPathComponent(LegacyStore.manifest), atomically: true, encoding: .utf8
        )
        try mode(0o555, dir)
        try XCTSkipIf((try? Data().write(to: dir.appendingPathComponent("probe"))) != nil, "這台機器擋不住寫入")
        for _ in 0 ... Disk.offerAfter {
            let store = boot()
            XCTAssertTrue(store.frozen)
            XCTAssertEqual(store.notice?.offer, false)
            XCTAssertFalse(store.startOver())
        }
        try mode(0o755, dir)
        XCTAssertEqual(texts(boot()), ["原本記的"])
    }

    /// 旁邊已經有另存的：不准蓋掉，用下一個名字
    func testStartOverDoesNotReplaceAnEarlierCopy() throws {
        let raw = sample("原本的紙")
        try Data("以前另存的".utf8).write(to: dir.appendingPathComponent("unreadable.json"))
        try lockedState(raw)
        XCTAssertTrue(boot().startOver())
        XCTAssertEqual(bytes("unreadable.json"), Data("以前另存的".utf8))
        try mode(0o644, dir.appendingPathComponent("unreadable-2.json"))
        XCTAssertEqual(bytes("unreadable-2.json"), Data(raw.utf8))
    }

    /// 平常讀得到的時候叫了也沒作用
    func testStartOverDoesNothingWhenFine() throws {
        let raw = sample("原本的紙")
        try raw.write(to: state, atomically: true, encoding: .utf8)
        let one = disk()
        let store = Store(disk: one)
        store.boot()
        XCTAssertFalse(store.startOver())
        XCTAssertFalse(one.setAside(for: Notebook()))
        XCTAssertEqual(store.book.notes.first?.title, "原本的紙")
        XCTAssertNil(bytes("unreadable.json"))
    }
}

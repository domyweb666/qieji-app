@testable import Qieji
import XCTest

/// 1.1 的舊檔在、但現在讀不到：不准當成新裝的。讀到之前什麼都不寫，讀到了照樣搬。
final class LegacyGuardTests: XCTestCase {
    private var root = URL(fileURLWithPath: NSTemporaryDirectory())
    private var defaults = UserDefaults.standard
    private let suite = "qieji.tests.legacyguard"

    private var dir: URL {
        root.appendingPathComponent("QiejiNative")
    }

    private var legacyDir: URL {
        root.appendingPathComponent("RCTAsyncLocalStorage_V1")
    }

    private var manifest: URL {
        legacyDir.appendingPathComponent(LegacyStore.manifest)
    }

    private var big: URL {
        legacyDir.appendingPathComponent(LegacyStore.md5(LegacyStore.bookKey))
    }

    override func setUpWithError() throws {
        try super.setUpWithError()
        root = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("qieji-\(UUID().uuidString)")
        UserDefaults().removePersistentDomain(forName: suite)
        defaults = UserDefaults(suiteName: suite) ?? .standard
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: legacyDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        for url in [dir, legacyDir, manifest, big] {
            try? mode(0o755, url)
        }
        try? FileManager.default.removeItem(at: root)
        UserDefaults().removePersistentDomain(forName: suite)
        super.tearDown()
    }

    private func mode(_ bits: Int, _ url: URL) throws {
        try FileManager.default.setAttributes([.posixPermissions: bits], ofItemAtPath: url.path)
    }

    private func block(_ url: URL) throws {
        try mode(0, url)
        try XCTSkipIf((try? Data(contentsOf: url)) != nil, "這台機器擋不住讀取")
    }

    private func disk(_ dirs: [URL]? = nil) -> Disk {
        Disk(dir: dir, legacyDirs: dirs ?? [legacyDir], defaults: defaults)
    }

    private func boot() -> Store {
        let store = Store(disk: disk())
        store.boot()
        return store
    }

    private func sample(lines: Int = 1) -> String {
        var note = Note.blank(color: "purple", now: 1000)
        note.id = "old"
        note.title = "舊版的紙"
        note.items = (0 ..< lines).map { Item(id: "i\($0)", text: "舊版記的第 \($0) 行") }
        var book = Notebook()
        book.notes = [note]
        return NoteCoding.write(book)
    }

    /// 照 AsyncStorage 的存法放一份 1.1 的舊檔（超過 1024 字的另外放一個檔）
    private func writeLegacy(_ raw: String, more: [String: String] = [:]) throws {
        var dict: [String: JSONValue] = more.mapValues { .string($0) }
        if (raw as NSString).length <= 1024 {
            dict[LegacyStore.bookKey] = .string(raw)
        } else {
            dict[LegacyStore.bookKey] = .null
            try raw.write(to: big, atomically: true, encoding: .utf8)
        }
        try JSONValue.object(dict).stringify().write(to: manifest, atomically: true, encoding: .utf8)
    }

    private func texts(_ store: Store) -> [String] {
        store.book.notes.flatMap(\.items).map(\.text)
    }

    private func has(_ name: String) -> Bool {
        FileManager.default.fileExists(atPath: dir.appendingPathComponent(name).path)
    }

    // MARK: 第一次從 1.1 升上來

    func testBlockedManifestIsNotAFreshInstall() throws {
        let raw = sample()
        try writeLegacy(raw)
        try block(manifest)
        let store = boot()
        XCTAssertTrue(store.frozen)
        XCTAssertEqual(store.notice?.title, Words.unreadTitle)
        XCTAssertNotNil(store.addTop("讀不到的時候記的"))
        store.flush()
        XCTAssertFalse(has("state.json"))
        XCTAssertFalse(has("from-expo.json"))
        try mode(0o644, manifest)
        store.thaw()
        XCTAssertFalse(store.frozen)
        XCTAssertNil(store.notice)
        XCTAssertEqual(Set(texts(store)), ["舊版記的第 0 行", "讀不到的時候記的"])
        XCTAssertEqual(try String(contentsOf: dir.appendingPathComponent("from-expo.json"), encoding: .utf8), raw)
        let again = boot()
        XCTAssertEqual(Set(texts(again)), ["舊版記的第 0 行", "讀不到的時候記的"])
        XCTAssertNil(again.notice)
    }

    func testBlockedBigFileIsNotAFreshInstall() throws {
        try writeLegacy(sample(lines: 300))
        try block(big)
        let store = boot()
        XCTAssertTrue(store.frozen)
        store.flush()
        XCTAssertFalse(has("state.json"))
        try mode(0o644, big)
        XCTAssertEqual(texts(boot()).count, 300)
    }

    /// 新的位置讀不到，不准退去搬更舊的那份
    func testBlockedNewPlaceDoesNotFallToTheOlderOne() throws {
        let older = root.appendingPathComponent("docs")
        try FileManager.default.createDirectory(at: older, withIntermediateDirectories: true)
        try JSONValue.object([LegacyStore.bookKey: .string(sample(lines: 2))]).stringify().write(
            to: older.appendingPathComponent(LegacyStore.manifest), atomically: true, encoding: .utf8
        )
        try writeLegacy(sample())
        try block(manifest)
        XCTAssertTrue(disk([legacyDir, older]).load().frozen)
        XCTAssertFalse(has("from-expo.json"))
    }

    /// 上次打開只留下一張沒動過的教學紙、這次舊檔讀不到：不寫；讀到了照樣補搬
    func testTutorialOnlyWaitsForTheLegacyFile() throws {
        let fresh = disk([])
        XCTAssertTrue(fresh.write(fresh.load(now: 5000).book))
        let before = try Data(contentsOf: dir.appendingPathComponent("state.json"))
        try writeLegacy(sample())
        try block(manifest)
        let store = boot()
        XCTAssertTrue(store.frozen)
        XCTAssertNotNil(store.addTop("讀不到的時候記的"))
        store.flush()
        XCTAssertEqual(try Data(contentsOf: dir.appendingPathComponent("state.json")), before)
        try mode(0o644, manifest)
        store.thaw()
        XCTAssertEqual(Set(texts(store)), ["舊版記的第 0 行", "讀不到的時候記的"])
    }

    // MARK: 不該被擋的人

    /// 搬過了、手上有自己的紙：舊檔讀不讀得到都沒關係
    func testAlreadyMigratedIsNotAffected() throws {
        try writeLegacy(sample())
        XCTAssertFalse(boot().frozen)
        try block(manifest)
        let store = boot()
        XCTAssertFalse(store.frozen)
        XCTAssertNil(store.notice)
        XCTAssertEqual(texts(store), ["舊版記的第 0 行"])
    }

    /// 清除過所有資料：不再看舊檔
    func testWipedIsNotAffected() throws {
        try writeLegacy(sample())
        let store = boot()
        XCTAssertTrue(store.wipe())
        try block(manifest)
        XCTAssertFalse(boot().frozen)
    }

    /// 舊檔裡沒有紙、或根本沒裝過舊版：照樣是新裝
    func testNoBookOrNoFolderIsStillFresh() throws {
        XCTAssertEqual(disk([root.appendingPathComponent("沒有這個")]).load().source, .fresh)
        try JSONValue.object(["cn.hint": .string("1")]).stringify().write(to: manifest, atomically: true, encoding: .utf8)
        XCTAssertEqual(disk().load().source, .fresh)
    }

    /// 舊檔裡混到不合法的位元組：原樣另存、照實講，不准拿壞掉的字去蓋 iCloud 上好的
    func testBrokenBytesInTheBigFileAreKeptAsIs() throws {
        try writeLegacy(sample(lines: 300))
        var data = try Data(contentsOf: big)
        let spot = try XCTUnwrap(data.range(of: Data("第 299 行".utf8)))
        data.replaceSubrange(spot.lowerBound ..< spot.lowerBound + 1, with: [0xFF])
        try data.write(to: big)
        let store = boot()
        XCTAssertFalse(store.frozen)
        XCTAssertEqual(store.notice?.title, Words.unreadableTitle)
        XCTAssertTrue(texts(store).isEmpty)
        XCTAssertEqual(try Data(contentsOf: dir.appendingPathComponent("from-expo.json")), data)
        XCTAssertEqual(try Data(contentsOf: big), data)
    }

    /// manifest 壞到看不懂：也不准當成新裝
    func testBrokenManifestIsNotAFreshInstall() throws {
        try Data("{壞掉".utf8).write(to: manifest)
        let store = boot()
        XCTAssertTrue(store.frozen)
        store.flush()
        XCTAssertFalse(has("state.json"))
    }

    // MARK: 出路

    /// 一直讀不到：第三次打開給「從空的開始」。舊檔一個位元都不動；之後舊檔還是讀不到也不再擋
    func testStartOverLeavesTheLegacyFileAlone() throws {
        try writeLegacy(sample())
        let before = try Data(contentsOf: manifest)
        try block(manifest)
        for _ in 1 ..< Disk.offerAfter {
            XCTAssertEqual(boot().notice?.offer, false)
        }
        let store = boot()
        XCTAssertEqual(store.notice?.offer, true)
        XCTAssertNotNil(store.addTop("讀不到的時候記的"))
        XCTAssertTrue(store.startOver())
        XCTAssertFalse(has("unreadable.json"))
        let again = boot()
        XCTAssertFalse(again.frozen)
        XCTAssertNil(again.notice)
        XCTAssertEqual(texts(again), ["讀不到的時候記的"])
        try mode(0o644, manifest)
        XCTAssertEqual(try Data(contentsOf: manifest), before)
    }

    /// 什麼都沒記就從空的開始：下次打開也不再擋
    func testStartOverWithNothingTypedIsNotAskedAgain() throws {
        try writeLegacy(sample())
        try block(manifest)
        XCTAssertTrue(boot().startOver())
        XCTAssertFalse(boot().frozen)
    }

    // MARK: 1.1 的設定

    /// 舊檔讀不到：設定這次先不搬、也不記成搬過了（不然關掉同步的人會變成開著）。讀到了補搬
    func testSettingsWaitForTheLegacyFile() throws {
        try writeLegacy(sample(), more: [LegacyStore.syncOffKey: "1"])
        try block(manifest)
        let prefs = Prefs(defaults: defaults)
        prefs.start(old: nil, fresh: false, dirs: [legacyDir])
        XCTAssertNil(prefs.string(LegacyStore.syncOffKey))
        try mode(0o644, manifest)
        prefs.start(old: nil, fresh: false, dirs: [legacyDir])
        XCTAssertEqual(prefs.string(LegacyStore.syncOffKey), "1")
        XCTAssertFalse(prefs.giveUpImport())
    }

    /// 只有放紙的大檔讀不到：設定照搬
    func testSettingsDoNotNeedTheBigFile() throws {
        try writeLegacy(sample(lines: 300), more: [LegacyStore.syncOffKey: "1"])
        try block(big)
        let prefs = Prefs(defaults: defaults)
        prefs.start(old: nil, fresh: false, dirs: [legacyDir])
        XCTAssertEqual(prefs.string(LegacyStore.syncOffKey), "1")
    }

    /// 設定一直讀不到、從空的開始：同步當成關著，之後讀得到也不再改他自己選的
    func testGivingUpSettingsLeavesSyncOff() throws {
        try writeLegacy(sample(), more: [LegacyStore.syncOffKey: "1"])
        try block(manifest)
        let prefs = Prefs(defaults: defaults)
        prefs.start(old: nil, fresh: false, dirs: [legacyDir])
        XCTAssertTrue(prefs.giveUpImport())
        XCTAssertEqual(prefs.string(LegacyStore.syncOffKey), "1")
        prefs.set(LegacyStore.syncOffKey, nil) // 他自己打開
        try mode(0o644, manifest)
        prefs.start(old: nil, fresh: false, dirs: [legacyDir])
        XCTAssertNil(prefs.string(LegacyStore.syncOffKey))
    }
}

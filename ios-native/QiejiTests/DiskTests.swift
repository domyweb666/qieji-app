@testable import Qieji
import XCTest

/// 讀 Expo 版留下來的舊存檔、搬到 Swift 版自己的存檔。用假造的 AsyncStorage 資料夾測（格式對過套件的原生程式）。
final class DiskTests: XCTestCase {
    private var root = URL(fileURLWithPath: NSTemporaryDirectory())
    private var legacyDir: URL {
        root.appendingPathComponent("support/org.domyweb.qieji/RCTAsyncLocalStorage_V1")
    }

    private var nativeDir: URL {
        root.appendingPathComponent("support/org.domyweb.qieji/QiejiNative")
    }

    private var defaults = UserDefaults.standard
    private let suite = "qieji.tests.disk"

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

    private func disk() -> Disk {
        Disk(dir: nativeDir, legacyDirs: [legacyDir], defaults: defaults)
    }

    /// 照 AsyncStorage 的規矩寫一個假的舊存檔：短的值放 manifest 裡，超過 1024 字的另外放一個以 MD5 命名的檔
    private func writeLegacy(_ pairs: [String: String]) throws {
        try FileManager.default.createDirectory(at: legacyDir, withIntermediateDirectories: true)
        var manifest: [String: JSONValue] = [:]
        for (key, val) in pairs {
            if (val as NSString).length <= 1024 {
                manifest[key] = .string(val)
            } else {
                manifest[key] = .null
                try val.write(to: legacyDir.appendingPathComponent(LegacyStore.md5(key)), atomically: true, encoding: .utf8)
            }
        }
        try JSONValue.object(manifest).stringify().write(
            to: legacyDir.appendingPathComponent("manifest.json"), atomically: true, encoding: .utf8
        )
    }

    private func sampleBook(lines: Int) -> String {
        var note = Note.blank(color: "purple", now: 1000)
        note.id = "aaa"
        note.title = "舊版的紙"
        note.items = (0 ..< lines).map { Item(id: "i\($0)", text: "舊版記的第 \($0) 行，要原封不動搬過來", flagB: true) }
        var book = Notebook()
        book.notes = [note]
        return NoteCoding.write(book)
    }

    func testMD5MatchesKnownAnswer() {
        XCTAssertEqual(LegacyStore.md5("colornotes.v1"), "5cd3eeac31e4bcf12d9a2f66a56b177d")
    }

    func testFreshInstallGetsTutorial() {
        let found = disk().load(now: 5000)
        XCTAssertEqual(found.source, .fresh)
        XCTAssertEqual(found.book.notes.count, 1)
        XCTAssertTrue(Tutorial.isUntouched(found.book.notes[0]))
        XCTAssertEqual(found.last, found.book.notes[0].id)
    }

    func testSmallLegacyStoreInManifest() throws {
        let raw = sampleBook(lines: 1)
        XCTAssertLessThanOrEqual((raw as NSString).length, 1024)
        try writeLegacy([LegacyStore.bookKey: raw, LegacyStore.lastKey: "aaa", LegacyStore.recentKey: "[\"aaa\",\"zzz\"]"])
        let found = disk().load()
        XCTAssertEqual(found.source, .legacy)
        XCTAssertFalse(found.unreadable)
        XCTAssertEqual(found.book.notes.first?.title, "舊版的紙")
        XCTAssertEqual(found.last, "aaa")
        XCTAssertEqual(found.recent, ["aaa", "zzz"])
    }

    func testBigLegacyStoreInSeparateFile() throws {
        let raw = sampleBook(lines: 300)
        XCTAssertGreaterThan((raw as NSString).length, 1024)
        try writeLegacy([LegacyStore.bookKey: raw, "qieji.full.v1": "1"])
        let found = disk().load()
        XCTAssertEqual(found.source, .legacy)
        XCTAssertEqual(found.book.notes.first?.items.count, 300)
        XCTAssertEqual(found.book.notes.first?.items.last?.text, "舊版記的第 299 行，要原封不動搬過來")
        XCTAssertEqual(found.legacy["qieji.full.v1"], "1")
    }

    func testMigrationKeepsLegacyUntouchedAndCopiesRaw() throws {
        let raw = sampleBook(lines: 300)
        try writeLegacy([LegacyStore.bookKey: raw])
        let big = legacyDir.appendingPathComponent(LegacyStore.md5(LegacyStore.bookKey))
        let first = disk()
        let found = first.load()
        XCTAssertTrue(first.write(found.book))
        // 舊存檔一個字都沒動
        XCTAssertEqual(try String(contentsOf: big, encoding: .utf8), raw)
        // 原文另存了一份
        XCTAssertEqual(try String(contentsOf: nativeDir.appendingPathComponent("from-expo.json"), encoding: .utf8), raw)
        // 第二次打開讀的是 Swift 版自己的存檔，不再去搬
        var changed = found.book
        changed.notes[0].title = "在 Swift 版改過"
        XCTAssertTrue(first.write(changed))
        let again = disk().load()
        XCTAssertEqual(again.source, .native)
        XCTAssertEqual(again.book.notes.first?.title, "在 Swift 版改過")
    }

    func testUnreadableLegacyIsNotLost() throws {
        try writeLegacy([LegacyStore.bookKey: "{這不是 JSON"])
        let found = disk().load()
        XCTAssertEqual(found.source, .legacy)
        XCTAssertTrue(found.unreadable)
        XCTAssertFalse(found.frozen)
        XCTAssertEqual(try String(contentsOf: nativeDir.appendingPathComponent("from-expo.json"), encoding: .utf8), "{這不是 JSON")
    }

    func testUnreadableNativeFileIsRescued() throws {
        try FileManager.default.createDirectory(at: nativeDir, withIntermediateDirectories: true)
        try "壞掉的存檔".write(to: nativeDir.appendingPathComponent("state.json"), atomically: true, encoding: .utf8)
        let found = disk().load()
        XCTAssertTrue(found.unreadable)
        XCTAssertEqual(try String(contentsOf: nativeDir.appendingPathComponent("unreadable.json"), encoding: .utf8), "壞掉的存檔")
    }

    func testWriteSkipsWhenNothingChanged() throws {
        let one = disk()
        let found = one.load(now: 5000)
        XCTAssertTrue(one.write(found.book))
        let file = nativeDir.appendingPathComponent("state.json")
        let stamp = try FileManager.default.attributesOfItem(atPath: file.path)[.modificationDate] as? Date
        Thread.sleep(forTimeInterval: 0.05)
        XCTAssertTrue(one.write(found.book))
        let after = try FileManager.default.attributesOfItem(atPath: file.path)[.modificationDate] as? Date
        XCTAssertEqual(stamp, after)
    }

    func testStoreRoundTrip() {
        let one = disk()
        let store = Store(disk: one)
        store.boot()
        XCTAssertTrue(store.loaded)
        XCTAssertNotNil(store.addTop("記一行"))
        store.flush()
        let again = Store(disk: disk())
        again.boot()
        XCTAssertEqual(again.current?.items.first?.text, "記一行")
        XCTAssertEqual(again.current?.items.count, Tutorial.lines.count + 1)
    }
}

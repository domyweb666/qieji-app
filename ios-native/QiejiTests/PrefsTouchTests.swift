@testable import Qieji
import XCTest

/// 1.1 的舊檔讀不到的那段時間，使用者自己改過的設定：之後讀到舊檔，不准被 1.1 的值蓋回去（還剩的第 3 條，2026-11-26）
final class PrefsTouchTests: XCTestCase {
    private var root = URL(fileURLWithPath: NSTemporaryDirectory())
    private var defaults = UserDefaults.standard
    private let suite = "qieji.tests.prefstouch"

    private var legacyDir: URL {
        root.appendingPathComponent("RCTAsyncLocalStorage_V1")
    }

    private var manifest: URL {
        legacyDir.appendingPathComponent(LegacyStore.manifest)
    }

    /// 1.1 的設定：同步關著、深色、字級特大
    private let old = [LegacyStore.syncOffKey: "1", LegacyStore.lookKey: "dark", LegacyStore.textSizeKey: "1.3"]

    override func setUpWithError() throws {
        try super.setUpWithError()
        root = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("qieji-\(UUID().uuidString)")
        UserDefaults().removePersistentDomain(forName: suite)
        defaults = UserDefaults(suiteName: suite) ?? .standard
        try FileManager.default.createDirectory(at: legacyDir, withIntermediateDirectories: true)
        let dict = JSONValue.object(old.mapValues { .string($0) })
        try dict.stringify().write(to: manifest, atomically: true, encoding: .utf8)
    }

    override func tearDown() {
        try? FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: manifest.path)
        try? FileManager.default.removeItem(at: root)
        UserDefaults().removePersistentDomain(forName: suite)
        super.tearDown()
    }

    private func block() throws {
        try FileManager.default.setAttributes([.posixPermissions: 0], ofItemAtPath: manifest.path)
        try XCTSkipIf((try? Data(contentsOf: manifest)) != nil, "這台機器擋不住讀取")
    }

    private func unblock() throws {
        try FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: manifest.path)
    }

    /// 讀不到的時候：同步關了又開、外觀改了又改回跟隨系統。讀到舊檔之後還是他選的；沒碰過的字級照搬
    func testChangesWhileUnreadWin() throws {
        try block()
        let prefs = Prefs(defaults: defaults)
        prefs.start(old: nil, fresh: false, dirs: [legacyDir])
        prefs.set(LegacyStore.syncOffKey, "1")
        prefs.set(LegacyStore.syncOffKey, nil)
        prefs.set(LegacyStore.lookKey, "light")
        prefs.set(LegacyStore.lookKey, nil)
        try unblock()
        prefs.start(old: nil, fresh: false, dirs: [legacyDir])
        XCTAssertNil(prefs.string(LegacyStore.syncOffKey))
        XCTAssertNil(prefs.string(LegacyStore.lookKey))
        XCTAssertEqual(prefs.string(LegacyStore.textSizeKey), "1.3")
    }

    /// 改完關掉 app、下次打開才讀到：一樣是他選的
    func testChangesSurviveRelaunch() throws {
        try block()
        let before = Prefs(defaults: defaults)
        before.start(old: nil, fresh: false, dirs: [legacyDir])
        before.set(LegacyStore.lookKey, "light")
        before.set(LegacyStore.lookKey, nil)
        try unblock()
        let after = Prefs(defaults: defaults)
        after.start(old: nil, fresh: false, dirs: [legacyDir])
        XCTAssertNil(after.string(LegacyStore.lookKey))
        XCTAssertEqual(after.string(LegacyStore.syncOffKey), "1")
    }

    /// 回到前景讀到存檔時，Disk 直接把 1.1 的值帶來（old 不是 nil）：一樣不蓋
    func testChangesWinOverValuesHandedIn() throws {
        try block()
        let prefs = Prefs(defaults: defaults)
        prefs.start(old: nil, fresh: false, dirs: [legacyDir])
        prefs.set(LegacyStore.syncOffKey, "1")
        prefs.set(LegacyStore.syncOffKey, nil)
        prefs.start(old: old, fresh: false, dirs: [legacyDir])
        XCTAssertNil(prefs.string(LegacyStore.syncOffKey))
        XCTAssertEqual(prefs.string(LegacyStore.lookKey), "dark")
    }

    /// 讀不到、他自己打開了同步，然後從空的開始：不准替他關掉
    func testGivingUpKeepsSyncHeTurnedOn() throws {
        try block()
        let prefs = Prefs(defaults: defaults)
        prefs.start(old: nil, fresh: false, dirs: [legacyDir])
        prefs.set(LegacyStore.syncOffKey, "1")
        prefs.set(LegacyStore.syncOffKey, nil)
        XCTAssertFalse(prefs.giveUpImport())
        XCTAssertNil(prefs.string(LegacyStore.syncOffKey))
    }

    /// 搬完之後改的設定是平常的改，跟以前一樣；搬過就不再搬
    func testAfterImportNothingChanges() {
        let prefs = Prefs(defaults: defaults)
        prefs.start(old: nil, fresh: false, dirs: [legacyDir])
        XCTAssertEqual(prefs.string(LegacyStore.syncOffKey), "1")
        prefs.set(LegacyStore.syncOffKey, nil)
        prefs.start(old: nil, fresh: false, dirs: [legacyDir])
        XCTAssertNil(prefs.string(LegacyStore.syncOffKey))
        XCTAssertEqual(prefs.string(LegacyStore.lookKey), "dark")
    }
}

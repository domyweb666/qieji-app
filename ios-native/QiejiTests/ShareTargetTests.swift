@testable import Qieji
import XCTest

/// 可選的紙單那個檔：寫、讀、清、寫不進去
final class ShareTargetFileTests: XCTestCase {
    private var root = URL(fileURLWithPath: NSTemporaryDirectory())
    private var defaults = UserDefaults.standard
    private let suite = "qieji.tests.sharetargets"

    private var folder: URL {
        root.appendingPathComponent("group/Inbox")
    }

    private var names: URL {
        root.appendingPathComponent("group/ShareTargets.json")
    }

    private var inbox: ShareInbox {
        let folder = folder, defaults = defaults
        return ShareInbox(folder: { folder }, settings: { defaults })
    }

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

    private func target(_ id: String) -> ShareTarget {
        ShareTarget(id: id, title: "紙 \(id)", glyph: "紙", color: "purple")
    }

    private func put(_ data: Data) throws {
        try FileManager.default.createDirectory(at: names.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: names)
    }

    private func put(_ list: [ShareTarget]) throws {
        try put(JSONEncoder().encode(list))
    }

    private var isThere: Bool {
        FileManager.default.fileExists(atPath: names.path)
    }

    /// 紙單不准動的時候：資料夾（換檔、刪檔）、檔本身（寫進原檔）
    private func lock(_ path: String, _ mode: Int, _ body: () throws -> Void) throws {
        let old = try XCTUnwrap(FileManager.default.attributesOfItem(atPath: path)[.posixPermissions] as? Int)
        try FileManager.default.setAttributes([.posixPermissions: mode], ofItemAtPath: path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: old], ofItemAtPath: path) }
        try body()
    }

    func testTargetsRoundTripAndRemove() {
        let list = [target("n1"), target("n2")]
        XCTAssertEqual(inbox.targets(), [])
        XCTAssertTrue(inbox.setTargets([]))
        XCTAssertTrue(inbox.setTargets(list))
        XCTAssertEqual(inbox.targets(), list)
        XCTAssertTrue(inbox.setTargets(Array(list.reversed())))
        XCTAssertEqual(inbox.targets().map(\.id), ["n2", "n1"])
        XCTAssertTrue(inbox.setTargets([]))
        XCTAssertEqual(inbox.targets(), [])
        XCTAssertFalse(isThere)
        XCTAssertEqual(inbox.read().names, [])
    }

    /// 換了內容，早就開著的另一個馬上讀到新的；什麼都不放進 UserDefaults
    func testOtherInboxSeesNewTargetsAtOnce() {
        let other = inbox
        for list in [[target("n1")], [target("n2"), target("n1")], [], [target("n3")]] {
            inbox.setTargets(list)
            XCTAssertEqual(other.targets(), list)
        }
        XCTAssertNil(defaults.persistentDomain(forName: suite))
    }

    func testOldKeysAreDropped() {
        for list in [[], [target("n1")], [target("n1")]] {
            for key in ShareInbox.oldKeys {
                defaults.set(Data("舊的".utf8), forKey: key)
            }
            inbox.setTargets(list)
            XCTAssertEqual(ShareInbox.oldKeys.compactMap { defaults.object(forKey: $0) as? Data }, [])
        }
    }

    /// 跟磁碟上的一樣不寫；裡面被塞了讀的時候會丟掉的，照寫
    func testSameTargetsAreNotWrittenAgain() throws {
        func stamp() throws -> NSObject? {
            // 原子寫入會換一個檔
            try FileManager.default.attributesOfItem(atPath: names.path)[.systemFileNumber] as? NSObject
        }
        inbox.setTargets([target("n1"), target("n2")])
        let first = try XCTUnwrap(stamp())
        XCTAssertTrue(inbox.setTargets([target("n1"), target("n2")]))
        XCTAssertEqual(try stamp(), first)
        inbox.setTargets([target("n1")])
        XCTAssertNotEqual(try stamp(), first)
        try put([target("n1"), target("n1")])
        XCTAssertEqual(inbox.targets(), [target("n1")])
        XCTAssertTrue(inbox.setTargets([target("n1")]))
        XCTAssertEqual(try JSONDecoder().decode([ShareTarget].self, from: Data(contentsOf: names)), [target("n1")])
        // 檔不見了：一樣的內容也要寫
        try FileManager.default.removeItem(at: names)
        XCTAssertTrue(inbox.setTargets([target("n1")]))
        XCTAssertEqual(inbox.targets(), [target("n1")])
    }

    func testBadTargetsReadAsEmpty() throws {
        let good = #"{"id":"n1","title":"紙","glyph":"紙","color":"red"}"#
        let bad = [
            "", "不是 JSON", "null", "{}", good, #""n1""#, "[1]", "[null]", "[\(good),{}]", #"[{"id":"n1"}]"#,
            #"[{"id":1,"title":"紙","glyph":"紙","color":"red"}]"#, String(repeating: "[", count: 10000),
            "[\(good)" + String(repeating: " ", count: ShareInbox.maxTargetBytes) + "]",
        ]
        for text in bad {
            try put(Data(text.utf8))
            XCTAssertEqual(inbox.targets(), [], text)
        }
        try put(Data([0xFF, 0xFE, 0x00]))
        XCTAssertEqual(inbox.targets(), [])
        try put(Data("[\(good)]".utf8))
        XCTAssertEqual(inbox.targets().map(\.id), ["n1"])
        // 不是檔
        try FileManager.default.removeItem(at: names)
        try FileManager.default.createDirectory(at: names, withIntermediateDirectories: true)
        XCTAssertEqual(inbox.targets(), [])
    }

    /// id 空的、重複的丟掉；最多 20 張，丟掉的不佔名額
    func testTargetsDropEmptyRepeatedAndExtra() throws {
        let many = (1 ... 30).map { target("n\($0)") }
        let list = [target(""), many[0], many[0]] + many
        try put(list)
        XCTAssertEqual(inbox.targets(), Array(many.prefix(20)))
        inbox.setTargets(list)
        XCTAssertEqual(try JSONDecoder().decode([ShareTarget].self, from: Data(contentsOf: names)), Array(many.prefix(20)))
        inbox.setTargets([target("")])
        XCTAssertFalse(isThere)
    }

    /// 名字沒有長度上限：放不下就少放後面的，不准寫一份自己讀不回來的
    func testLongNamesStillRead() {
        var long = (1 ... 3).map { target("n\($0)") }
        for index in long.indices {
            long[index].title = String(repeating: "長", count: ShareInbox.maxTargetBytes / 3 / 2)
        }
        XCTAssertTrue(inbox.setTargets([target("n0")] + long))
        XCTAssertEqual(inbox.targets().map(\.id), ["n0", "n1"])
        long[0].title += long[0].title
        XCTAssertTrue(inbox.setTargets(long))
        XCTAssertFalse(isThere)
    }

    /// 換不了檔、刪不掉：舊的不准留著，而且講沒寫成
    func testFailedWriteDoesNotKeepTheOldNames() throws {
        XCTAssertTrue(inbox.setTargets([target("n1"), target("n2")]))
        let dir = names.deletingLastPathComponent().path
        try lock(dir, 0o555) {
            XCTAssertFalse(inbox.setTargets([target("n1")]))
            XCTAssertEqual(try String(contentsOf: names, encoding: .utf8), "[]")
            XCTAssertEqual(inbox.targets(), [])
        }
        XCTAssertTrue(inbox.setTargets([target("n1")]))
        XCTAssertEqual(inbox.targets(), [target("n1")])
        // 要清空、刪不掉：換成空的就算數
        try lock(dir, 0o555) {
            XCTAssertTrue(inbox.setTargets([]))
            XCTAssertEqual(try String(contentsOf: names, encoding: .utf8), "[]")
        }
        XCTAssertTrue(inbox.setTargets([target("n1")]))
        // 連原檔都寫不進去：一定要講
        try lock(dir, 0o555) {
            try lock(names.path, 0o444) {
                XCTAssertFalse(inbox.setTargets([]))
                XCTAssertFalse(inbox.setTargets([target("n2")]))
                XCTAssertFalse(inbox.wipe())
            }
        }
        XCTAssertTrue(inbox.setTargets([]))
        XCTAssertFalse(isThere)
    }

    func testTargetsWithoutContainer() {
        let none = ShareInbox(folder: { nil }, settings: { nil })
        XCTAssertFalse(none.setTargets([target("n1")]))
        XCTAssertEqual(none.targets(), [])
        XCTAssertTrue(ShareInbox.off.setTargets([target("n1")]))
        XCTAssertEqual(ShareInbox.off.targets(), [])
    }

    func testWipeTakesEverything() throws {
        XCTAssertTrue(inbox.wipe())
        XCTAssertTrue(try inbox.write(XCTUnwrap(ShareEntry.make(["牛奶"], note: nil))))
        _ = try ShareTests.writeBad(to: folder)
        inbox.setTargets([target("n1"), target("n2")])
        for key in ShareInbox.oldKeys {
            defaults.set(Data("舊的".utf8), forKey: key)
        }
        XCTAssertTrue(inbox.wipe())
        XCTAssertFalse(FileManager.default.fileExists(atPath: folder.path))
        XCTAssertFalse(isThere)
        XCTAssertEqual(ShareInbox.oldKeys.compactMap { defaults.object(forKey: $0) as? Data }, [])
        // 只有紙單、壞掉的紙單
        try put(Data("壞的".utf8))
        XCTAssertTrue(inbox.wipe())
        XCTAssertFalse(isThere)
    }

    /// 紙單的檔刪不掉（就算換成空的了）：不准說清乾淨了
    func testWipeSaysWhenTheListStays() throws {
        inbox.setTargets([target("n1")])
        try lock(names.deletingLastPathComponent().path, 0o555) {
            XCTAssertFalse(inbox.wipe())
            XCTAssertEqual(inbox.targets(), [])
        }
        XCTAssertTrue(inbox.wipe())
    }
}

/// 可選的紙單：順序、張數、誰不准出現、什麼時候跟著變
final class ShareTargetsTests: ShareSafeCase {
    private func pin(_ id: String, created: Double) -> Note {
        var note = note(id)
        note.pinned = true
        note.created = created
        return note
    }

    private func bad(_ id: String) -> [Note] {
        var locked = note("\(id)-lock"), pad = note("\(id)-pad"), gone = note("\(id)-gone"), full = note("\(id)-full")
        locked.locked = true
        pad.kind = "text"
        gone.deleted = true
        full.items = (0 ..< Lines.max).map { Item(text: "\($0)") }
        return [locked, pad, gone, full]
    }

    private func choices(_ notes: [Note], current: String? = nil, recent: [String] = []) -> [String] {
        var book = Notebook()
        book.notes = notes
        return InboxMerge.choices(book, current: current, recent: recent).map(\.id)
    }

    private func listed() -> [String] {
        inbox.targets().map(\.id)
    }

    /// 預設那張 → 釘選（照建立先後）→ 最近開過的 → 最近改過的補。總張數跟切換清單一樣
    func testOrderAndCount() {
        let pins = [pin("p2", created: 20), pin("p1", created: 10)]
        let rest = (1 ... 8).map { note("n\($0)", updated: Double($0)) }
        // 預設那張沒釘選：算最近的一張
        XCTAssertEqual(
            choices(pins + rest, current: "n3", recent: ["n3", "n1", "p1"]), ["n3", "p1", "p2", "n1", "n8", "n7", "n6"]
        )
        // 預設那張不在最近開過的裡面：張數一樣
        XCTAssertEqual(choices(pins + rest, current: "n3", recent: ["n1"]), ["n3", "p1", "p2", "n1", "n8", "n7", "n6"])
        // 預設那張是釘選的：提到最前面，不重複
        XCTAssertEqual(
            choices(pins + rest, current: "p2", recent: ["p2", "n1"]), ["p2", "p1", "n1", "n8", "n7", "n6", "n5"]
        )
        // 最近開過的夠多：不補，多的不放
        XCTAssertEqual(
            choices(rest, current: "n1", recent: ["n1", "n2", "n3", "n4", "n5", "n6"]), ["n1", "n2", "n3", "n4", "n5"]
        )
        // 沒有正在看的、沒開過：最近改過的
        XCTAssertEqual(choices(rest), ["n8", "n7", "n6", "n5", "n4"])
        XCTAssertEqual(choices([note("one")], current: "one"), ["one"])
        XCTAssertEqual(choices([]), [])
    }

    /// 跟切換清單同樣的紙（都能記的時候）
    func testSamePapersAsSwitchList() {
        var book = Notebook()
        book.notes = (1 ... 7).map { pin("p\($0)", created: Double($0)) } + (1 ... 9).map { note("n\($0)", updated: Double($0)) }
        for current in ["n2", "p3", "n9"] {
            let recent = [current, "n4", "p1", "n1"]
            let lists = Seats.switchList(book, recent: recent)
            let made = InboxMerge.choices(book, current: current, recent: recent).map(\.id)
            XCTAssertEqual(made.first, current)
            XCTAssertEqual(Set(made), Set((lists.pinned + lists.recent).map(\.id)))
            XCTAssertEqual(made.count, Seats.pinMax + Seats.recentMax)
        }
    }

    /// 上鎖、記事本、刪掉、滿了：不出現、也不佔名額（釘選的、最近開過的、補的都一樣）
    func testBadPapersTakeNoPlace() {
        let badPins = bad("p").map { one -> Note in
            var one = one
            one.pinned = true
            one.created = 1
            return one
        }
        let badRecent = bad("r"), badNew = bad("u").map { one -> Note in
            var one = one
            one.updated = 9999
            return one
        }
        let pins = (1 ... 5).map { pin("p\($0)", created: Double($0 + 10)) }
        let rest = (1 ... 6).map { note("n\($0)", updated: Double($0)) }
        XCTAssertEqual(
            choices(badPins + badRecent + badNew + pins + rest, current: "r-lock", recent: badRecent.map(\.id) + ["n1"]),
            ["n1", "p1", "p2", "p3", "p4", "p5", "n6", "n5", "n4", "n3"]
        )
        XCTAssertEqual(choices(badPins + badRecent, current: "r-pad", recent: badRecent.map(\.id)), [])
    }

    /// 上鎖那一刻就從紙單消失，不是預設那張也一樣；連檔裡的原樣都找不到名字
    @MainActor
    func testLockedPaperLeavesTheListAtOnce() throws {
        let store = store([note("aaa"), note("bbb"), note("ccc")])
        store.pushTarget(now: true)
        XCTAssertEqual(listed(), ["aaa", "bbb", "ccc"])
        store.setLocked("bbb", true)
        store.pushTarget(now: true)
        XCTAssertEqual(listed(), ["aaa", "ccc"])
        XCTAssertFalse(try String(contentsOf: names, encoding: .utf8).contains("bbb"))
    }

    /// 沒寫成：下一次內容一樣也要再推（平常那條、上鎖那條都是）
    @MainActor
    func testFailedPushIsTriedAgain() async throws {
        let store = store([note("aaa"), note("bbb")])
        let dir = names.deletingLastPathComponent().path
        let shut: @Sendable (Int) throws -> Void = { try FileManager.default.setAttributes([.posixPermissions: $0], ofItemAtPath: dir) }
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        defer { try? shut(0o755) }
        try shut(0o555)
        store.pushTarget()
        XCTAssertNotNil(store.targetsSent)
        await waitUntil("沒寫成就忘掉") { store.targetsSent == nil }
        try shut(0o755)
        store.pushTarget()
        await waitUntil("再推一次") { listed() == ["aaa", "bbb"] }
        XCTAssertNotNil(store.targetsSent)
        // 上鎖那一刻換不了檔：舊的不准留著
        try shut(0o555)
        store.setLocked("bbb", true)
        store.pushTarget(now: true)
        XCTAssertEqual(listed(), [])
        XCTAssertFalse(try String(contentsOf: names, encoding: .utf8).contains("bbb"))
        XCTAssertNil(store.targetsSent)
        try shut(0o755)
        store.pushTarget()
        await waitUntil("再推一次") { listed() == ["aaa"] }
    }

    /// 第一次跟系統拿共用容器在背景：打開 app 那一下推過，上鎖在主執行緒拿的不是第一次
    @MainActor
    func testFirstContainerIsNotOnMain() async {
        let store = store([note("aaa"), note("bbb")])
        let folder = folder, defaults = defaults, seen = Seen()
        store.inbox = ShareInbox(folder: {
            seen.add(Thread.isMainThread)
            return folder
        }, settings: { defaults })
        store.fullKnown = true // QiejiApp 打開時走的就是這一步
        store.setLocked("bbb", true)
        store.pushTarget(now: true)
        XCTAssertEqual(listed(), ["aaa"])
        XCTAssertEqual(seen.list.first, false)
        await rest(0.1)
    }

    private final class Seen: @unchecked Sendable {
        private let lock = NSLock()
        private var all: [Bool] = []

        var list: [Bool] {
            lock.withLock { all }
        }

        func add(_ one: Bool) {
            lock.withLock { all.append(one) }
        }
    }

    /// 釘選、取消釘選（不動修改時間的那種也算）、換張、改名、換色、換圖示：紙單跟著變
    @MainActor
    func testListFollowsChanges() async {
        let store = store([note("aaa"), note("bbb", updated: 900), note("ccc", updated: 800)])
        store.pushTarget(now: true)
        XCTAssertEqual(listed(), ["aaa", "bbb", "ccc"])
        store.togglePin("ccc")
        await waitUntil("釘選的排前面") { listed() == ["aaa", "ccc", "bbb"] }
        store.togglePin("ccc")
        await waitUntil("取消釘選") { listed() == ["aaa", "bbb", "ccc"] }
        store.open("bbb")
        await waitUntil("換張") { listed() == ["bbb", "aaa", "ccc"] }
        store.rename("aaa", "買東西")
        store.setColor("aaa", "red")
        store.setGlyph("aaa", "買")
        let want = ShareTarget(id: "aaa", title: "買東西", glyph: "買", color: "red")
        await waitUntil("改名、換色、換圖示") { inbox.targets().contains(want) }
        store.setLocked("bbb", true)
        await waitUntil("存檔那條也會拿掉") { !listed().contains("bbb") }
    }

    private func stamp(_ day: Int, _ hour: Int, _ minute: Int) -> Double {
        let parts = DateComponents(year: 2026, month: 11, day: day, hour: hour, minute: minute)
        return (Calendar.current.date(from: parts)?.timeIntervalSince1970 ?? 0) * 1000
    }

    private func paper(_ title: String, _ created: Double) -> Note {
        var note = note("x", ["不准外露的第一行"])
        note.title = title
        note.created = created
        return note
    }

    /// 同名的分得出來：加開的日期，同一天的再加時分；不同名的不變；第一行不准出現
    func testSameNamesAreToldApart() {
        let early = stamp(24, 9, 5), noon = stamp(25, 12, 0), late = stamp(25, 18, 30)
        XCTAssertEqual(InboxMerge.names([paper("", noon)]), ["未命名"])
        XCTAssertEqual(InboxMerge.names([paper("", noon), paper("買菜", noon)]), ["未命名", "買菜"])
        XCTAssertEqual(InboxMerge.names([paper(" ", noon), paper("", early)]), ["未命名・11/25", "未命名・11/24"])
        XCTAssertEqual(
            InboxMerge.names([paper("", noon), paper("買菜", noon), paper("", early), paper("", late)]),
            ["未命名・11/25 12:00", "買菜", "未命名・11/24", "未命名・11/25 18:30"]
        )
        XCTAssertEqual(InboxMerge.names([paper("買菜", noon), paper("買菜", early)]), ["買菜・11/25", "買菜・11/24"])
        XCTAssertEqual(InboxMerge.names([]), [])
    }

    /// 推出去的紙單：兩張沒取名的有分開，共用區裡沒有紙的內容
    @MainActor
    func testUntitledInTheListHasDates() throws {
        var one = paper("", stamp(25, 12, 0)), two = paper("", stamp(24, 12, 0))
        one.id = "aaa"
        two.id = "bbb"
        let store = store([one, two])
        store.pushTarget(now: true)
        XCTAssertEqual(inbox.targets().map(\.title), ["未命名・11/25", "未命名・11/24"])
        XCTAssertFalse(try String(contentsOf: names, encoding: .utf8).contains("第一行"))
        store.rename("bbb", "買菜")
        store.pushTarget(now: true)
        XCTAssertEqual(inbox.targets().map(\.title), ["未命名", "買菜"])
    }

    /// 真的清除：紙單的檔、舊的鍵都不留
    @MainActor
    func testWipeTakesListAndOldKeys() {
        let store = store([note("aaa"), note("bbb")])
        store.pushTarget(now: true)
        XCTAssertEqual(listed().count, 2)
        for key in ShareInbox.oldKeys {
            defaults.set(Data("舊的".utf8), forKey: key)
        }
        XCTAssertTrue(store.wipeInbox())
        XCTAssertFalse(FileManager.default.fileExists(atPath: names.path))
        XCTAssertEqual(ShareInbox.oldKeys.compactMap { defaults.object(forKey: $0) as? Data }, [])
        // 清完再推：一樣的內容也要寫
        store.pushTarget(now: true)
        XCTAssertEqual(listed().count, 2)
    }
}

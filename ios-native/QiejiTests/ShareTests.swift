@testable import Qieji
import XCTest

/// 2.1 分享進來：組字、拆行、收件匣的檔
final class ShareTests: XCTestCase {
    private var root = URL(fileURLWithPath: NSTemporaryDirectory())
    private var defaults = UserDefaults.standard
    private let suite = "qieji.tests.share"

    private var folder: URL {
        root.appendingPathComponent("group/Inbox")
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

    // MARK: 組字（4A）

    private func compose(_ title: String?, _ text: String?, _ url: String?) -> String? {
        ShareText.compose(title: title, text: text, url: url.flatMap(URL.init(string:)))
    }

    func testTitleAndLinkAreTwoLines() {
        XCTAssertEqual(compose("好文章", nil, "https://a.b/c"), "好文章\nhttps://a.b/c")
        XCTAssertEqual(compose(" 好\n文章 ", "", "https://a.b/c"), "好 文章\nhttps://a.b/c")
        XCTAssertEqual(compose(nil, nil, "https://a.b/c"), "https://a.b/c")
        XCTAssertEqual(compose("  ", " \n", "HTTP://a.b/c"), "HTTP://a.b/c")
    }

    func testTextAndLinkAreTwoLines() {
        XCTAssertEqual(compose(nil, "選的字", "https://a.b/c"), "選的字\nhttps://a.b/c")
        XCTAssertEqual(compose("標題", "選的字\n第二行", "https://a.b/c"), "選的字\n第二行\nhttps://a.b/c")
        XCTAssertEqual(compose("標題", " 只有字 ", nil), "只有字")
        XCTAssertEqual(compose("只有標題", nil, nil), "只有標題")
    }

    func testSameLinkIsNotRepeated() {
        XCTAssertEqual(compose(nil, "看這個 https://a.b/c", "https://a.b/c"), "看這個 https://a.b/c")
        XCTAssertEqual(compose(nil, "https://a.b", "https://a.b/"), "https://a.b")
        XCTAssertEqual(compose("https://a.b/c", nil, "https://a.b/c"), "https://a.b/c")
        XCTAssertEqual(compose(nil, "（https://a.b/c）好看", "https://a.b/c"), "（https://a.b/c）好看")
        XCTAssertEqual(compose(nil, "https://a.b/茄子 很好", "https://a.b/%E8%8C%84%E5%AD%90"), "https://a.b/茄子 很好")
    }

    /// 只是另一個網址的開頭：不是同一個，不准少放
    func testLongerLinkIsNotTheSame() {
        XCTAssertEqual(compose(nil, "https://a.b/cd", "https://a.b/c"), "https://a.b/cd\nhttps://a.b/c")
        XCTAssertEqual(compose(nil, "https://a.b/c/d", "https://a.b/c/"), "https://a.b/c/d\nhttps://a.b/c/")
        XCTAssertEqual(compose(nil, "https://a.b/c?x=1", "https://a.b/c"), "https://a.b/c?x=1\nhttps://a.b/c")
        XCTAssertEqual(compose(nil, "https://a.b/cd https://a.b/c", "https://a.b/c"), "https://a.b/cd https://a.b/c")
    }

    func testOnlyWebLinks() {
        for bad in ["file:///private/a.txt", "javascript:alert(1)", "qieji://new", "mailto:a@b.c", "data:text/plain,hi", "https:"] {
            XCTAssertNil(compose(nil, nil, bad), bad)
            XCTAssertEqual(compose(nil, "有字", bad), "有字")
        }
        XCTAssertNil(compose(nil, nil, nil))
        XCTAssertNil(compose(" ", "\n", nil))
    }

    func testClipIsWholeCharacters() {
        let short = String(repeating: "茄", count: ShareText.max)
        XCTAssertEqual(ShareText.clip(short).text, short)
        XCTAssertFalse(ShareText.clip(short).cut)
        XCTAssertEqual(ShareText.clip(short + "子").text, short)
        XCTAssertTrue(ShareText.clip(short + "子").cut)
        let edge = String(repeating: "茄", count: ShareText.max - 1)
        XCTAssertEqual(ShareText.clip(edge + "👨‍👩‍👧").text, edge)
        let pile = "a" + String(repeating: "\u{301}", count: ShareText.max * 2)
        XCTAssertEqual(ShareText.clip(pile).text.utf16.count, ShareText.max)
        XCTAssertEqual(ShareText.clip("").text, "")
    }

    // MARK: 拆行（搬家之後行為不變）

    func testSplitIsTheSameRule() {
        for text in [
            "", "一行", "- 牛奶\n1. 蛋\n2、豆腐\n3)蔥\n\n• 米", "1.5 公升牛奶\n-5 度\r\n2.0 版",
            "- [ ] 牛奶\n* [x] 蛋\n  - [X] 蔥\n- [ ]", "- [x](https://a.b)\n[ ] 米\n- [買] 茶", "  前後空白\u{3000}\n\t",
        ] {
            XCTAssertEqual(LineSplit.lines(text), Lines.splitPasted(text), text)
        }
        XCTAssertEqual(LineSplit.lines("- 牛奶\n1. 蛋\n\n- [x] 蔥\n-5 度"), ["牛奶", "蛋", "蔥", "-5 度"])
    }

    // MARK: 收件匣的檔

    func testConstantsMatchTheApp() {
        XCTAssertEqual(ShareInbox.group, WidgetShare.group)
        XCTAssertEqual(ShareInbox.maxLines, Lines.max)
    }

    func testWriteReadRemove() throws {
        let entry = try XCTUnwrap(ShareEntry.make([" 牛奶 ", "", "蛋\n兩顆"], note: "n1", now: 1_795_000_000_000))
        XCTAssertEqual(entry.lines.map(\.text), ["牛奶", "蛋\n兩顆"])
        XCTAssertTrue(entry.lines.allSatisfy { Ident.born($0.id, now: 1_795_000_000_000) == 1_795_000_000_000 })
        XCTAssertTrue(inbox.write(entry))
        XCTAssertTrue(FileManager.default.fileExists(atPath: folder.appendingPathComponent("\(entry.lines[0].id).json").path))
        // 同一份再寫一次（按 ✓ 失敗再按）還是一則
        XCTAssertTrue(inbox.write(entry))
        let mail = inbox.read()
        XCTAssertEqual(mail.map(\.entry), [entry])
        inbox.remove(mail)
        XCTAssertTrue(inbox.read().isEmpty)
        inbox.remove(mail)
    }

    func testFileLooksLikeTheSpec() throws {
        let entry = try XCTUnwrap(ShareEntry.make(["牛奶"], note: nil, now: 1_795_000_000_000))
        XCTAssertTrue(inbox.write(entry))
        let file = folder.appendingPathComponent("\(entry.lines[0].id).json")
        let dict = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any]
        XCTAssertEqual(dict?["v"] as? Int, 1)
        XCTAssertEqual(dict?["at"] as? Double, 1_795_000_000_000)
        XCTAssertNil(dict?["note"])
        let line = (dict?["lines"] as? [[String: String]])?.first
        XCTAssertEqual(line, ["id": entry.lines[0].id, "t": "牛奶"])
    }

    func testEntryNeedsWordsAndRoom() {
        XCTAssertNil(ShareEntry.make([], note: nil))
        XCTAssertNil(ShareEntry.make([" ", "\n"], note: nil))
        let many = (1 ... Lines.max).map { "第 \($0) 行" }
        let full = ShareEntry.make(many, note: nil)
        XCTAssertEqual(full?.lines.count, Lines.max)
        XCTAssertEqual(full.map { Set($0.lines.map(\.id)).count }, Lines.max)
        XCTAssertNil(ShareEntry.make(many + ["多一行"], note: nil))
    }

    /// 寫進去的一定讀得回來；太大的不寫、不留半個檔
    func testWriteRefusesWhatCannotBeRead() throws {
        let worst = try XCTUnwrap(ShareEntry.make([String(repeating: "\u{1}", count: ShareText.max)], note: nil))
        XCTAssertTrue(inbox.write(worst))
        XCTAssertEqual(inbox.read().first?.entry, worst)
        inbox.remove(inbox.read())
        let huge = try XCTUnwrap(ShareEntry.make([String(repeating: "茄", count: 200_000)], note: nil))
        XCTAssertFalse(inbox.write(huge))
        XCTAssertTrue(inbox.read().isEmpty)
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: folder.path), [])
    }

    func testWriteFailsLoudlyWithoutContainer() throws {
        let entry = try XCTUnwrap(ShareEntry.make(["牛奶"], note: nil))
        XCTAssertFalse(ShareInbox.off.write(entry))
        XCTAssertTrue(ShareInbox.off.read().isEmpty)
        XCTAssertTrue(ShareInbox.off.wipe())
        // 資料夾的位置被一個檔佔住
        try FileManager.default.createDirectory(at: root.appendingPathComponent("group"), withIntermediateDirectories: true)
        try Data().write(to: folder)
        XCTAssertFalse(inbox.write(entry))
    }

    func testOldestFirst() throws {
        for (text, at) in [("三", 3000.0), ("一", 1000), ("二", 2000)] {
            var entry = try XCTUnwrap(ShareEntry.make([text], note: nil))
            entry.at = at
            XCTAssertTrue(inbox.write(entry))
        }
        XCTAssertEqual(inbox.read().map { $0.entry.lines[0].text }, ["一", "二", "三"])
    }

    /// 壞掉的跳過、不刪、不影響好的
    func testBadFilesAreSkippedAndKept() throws {
        let good = try XCTUnwrap(ShareEntry.make(["好的"], note: nil))
        XCTAssertTrue(inbox.write(good))
        let names = try ShareTests.writeBad(to: folder)
        XCTAssertEqual(inbox.read().map(\.entry), [good])
        inbox.remove(inbox.read())
        XCTAssertEqual(try Set(FileManager.default.contentsOfDirectory(atPath: folder.path)), names)
    }

    /// 各種壞檔。回傳檔名
    static func writeBad(to folder: URL) throws -> Set<String> {
        let line = #"{"id":"mvr2ntmoxnzlj","t":"字"}"#
        func file(_ lines: String, format: String = "1", at: String = "1000") -> String {
            #"{"v":\#(format),"at":\#(at),"lines":[\#(lines)]}"#
        }
        let many = (0 ... Lines.max).map { #"{"id":"\#(String(1_000_000_000 + $0))","t":"字"}"# }.joined(separator: ",")
        let big = file(#"{"id":"mvr2ntmoxnzlj","t":"\#(String(repeating: "a", count: ShareInbox.maxBytes))"}"#)
        let bad: [String] = [
            "", "不是 JSON", "[]", "null", file(line, format: "2"), file(line, format: #""1""#), #"{"at":1000,"lines":[\#(line)]}"#,
            file(""), file(many), file(line, at: "0"), file(line, at: "-5"), file(line, at: "null"), file(line, at: #""x""#),
            file(#"{"id":"MVR2NTMOXNZLJ","t":"字"}"#), file(#"{"id":"mvr2ntmo","t":"字"}"#), file(#"{"id":"mvr2ntmoxnzljj","t":"字"}"#),
            file(#"{"id":"../../state","t":"字"}"#), file(#"{"id":"茄茄茄茄茄茄茄茄茄","t":"字"}"#), file(#"{"id":12345678901,"t":"字"}"#),
            file(#"{"id":"mvr2ntmoxnzlj","t":""}"#), file(#"{"id":"mvr2ntmoxnzlj","t":" \n"}"#), file(#"{"id":"mvr2ntmoxnzlj"}"#),
            file(line + "," + line), file(line + #",{"id":"mvr2ntmoxnzl2","t":""}"#), #"{"v":1,"at":1000,"lines":"字"}"#,
            #"{"v":1,"at":1000,"note":5,"lines":[\#(line)]}"#, String(repeating: "[", count: 10000), big,
        ]
        var names: Set<String> = []
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        for (index, text) in bad.enumerated() {
            names.insert("bad\(index).json")
            try Data(text.utf8).write(to: folder.appendingPathComponent("bad\(index).json"))
        }
        try Data([0xFF, 0xFE, 0x00]).write(to: folder.appendingPathComponent("bytes.json"))
        try FileManager.default.createDirectory(at: folder.appendingPathComponent("dir.json"), withIntermediateDirectories: true)
        try Data("寫到一半".utf8).write(to: folder.appendingPathComponent("half.tmp"))
        return names.union(["bytes.json", "dir.json", "half.tmp"])
    }

    func testTargetRoundTripAndRemove() {
        let target = ShareTarget(id: "n1", title: "今天想到的", glyph: "今", color: "purple")
        XCTAssertNil(inbox.target())
        inbox.setTarget(target)
        XCTAssertEqual(inbox.target(), target)
        inbox.setTarget(nil)
        XCTAssertNil(inbox.target())
        defaults.set(Data("壞的".utf8), forKey: ShareInbox.targetKey)
        XCTAssertNil(inbox.target())
        inbox.setTarget(nil)
        XCTAssertNil(defaults.object(forKey: ShareInbox.targetKey))
    }

    func testWipeTakesEverything() throws {
        XCTAssertTrue(inbox.wipe())
        XCTAssertTrue(try inbox.write(XCTUnwrap(ShareEntry.make(["牛奶"], note: nil))))
        _ = try ShareTests.writeBad(to: folder)
        inbox.setTarget(ShareTarget(id: "n1", title: "紙", glyph: "紙", color: "red"))
        XCTAssertTrue(inbox.wipe())
        XCTAssertFalse(FileManager.default.fileExists(atPath: folder.path))
        XCTAssertNil(inbox.target())
    }

    func testWipeSaysWhenItCannot() throws {
        XCTAssertTrue(try inbox.write(XCTUnwrap(ShareEntry.make(["牛奶"], note: nil))))
        let parent = folder.deletingLastPathComponent().path
        try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: parent)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: parent) }
        XCTAssertFalse(inbox.wipe())
    }
}

/// 放進哪一張、怎麼放（純計算）
final class ShareMergeTests: XCTestCase {
    private func note(_ id: String, lines: Int = 0, updated: Double = 1000) -> Note {
        var note = Note.blank(now: updated)
        note.id = id
        note.title = id
        note.items = (0 ..< lines).map { Item(id: "\(id)-\($0)", text: "舊 \($0)") }
        return note
    }

    private func entry(_ texts: [String], note: String? = nil, at: Double = 1000) throws -> ShareEntry {
        var made = try XCTUnwrap(ShareEntry.make(texts, note: note))
        made.at = at
        return made
    }

    private func run(
        _ notes: [Note],
        _ entries: [ShareEntry],
        current: String? = nil,
        recent: [String] = []
    ) -> (Notebook, [String: String]) {
        var book = Notebook()
        book.notes = notes
        Seats.fixOrder(&book)
        let tops = InboxMerge.run(&book, entries, current: current, recent: recent, now: 9000)
        return (book, tops)
    }

    private func texts(_ book: Notebook, _ id: String) -> [String] {
        book.note(id)?.items.map(\.text) ?? []
    }

    func testOneLineGoesOnTop() throws {
        let one = try entry(["牛奶"], note: "bbb")
        let (book, tops) = run([note("aaa", lines: 1), note("bbb", lines: 1)], [one], current: "aaa")
        XCTAssertEqual(texts(book, "bbb"), ["牛奶", "舊 0"])
        XCTAssertEqual(texts(book, "aaa"), ["舊 0"])
        XCTAssertEqual(tops, ["bbb": one.lines[0].id])
        XCTAssertEqual(book.note("bbb")?.updated, 9000)
        XCTAssertEqual(book.note("aaa")?.updated, 1000)
        XCTAssertEqual(book.note("bbb")?.items[0], Item(id: one.lines[0].id, text: "牛奶"))
    }

    /// 拆的行照原本順序；比較新的那次在最上面
    func testSplitKeepsOrderAndNewestOnTop() throws {
        let old = try entry(["一", "二", "三"], at: 1000), new = try entry(["新"], at: 2000)
        let (book, tops) = run([note("aaa", lines: 1)], [old, new], current: "aaa")
        XCTAssertEqual(texts(book, "aaa"), ["新", "一", "二", "三", "舊 0"])
        XCTAssertEqual(tops, ["aaa": new.lines[0].id])
    }

    func testFallsBackInOrder() throws {
        var locked = note("lock"), pad = note("pad"), gone = note("gone")
        locked.locked = true
        pad.kind = "text"
        gone.deleted = true
        let full = note("full", lines: Lines.max)
        struct Case {
            var wanted: String?
            var current: String?
            var recent: [String] = []
            var lands: String
        }
        let cases = [
            Case(wanted: "ok1", current: "ok2", lands: "ok1"), Case(wanted: "不在了", current: "ok2", lands: "ok2"),
            Case(wanted: "lock", current: "ok2", lands: "ok2"), Case(wanted: "pad", current: "ok2", lands: "ok2"),
            Case(wanted: "gone", current: "ok2", lands: "ok2"), Case(wanted: "full", current: "ok2", lands: "ok2"),
            Case(current: "lock", recent: ["full", "ok1"], lands: "ok1"),
            Case(current: "pad", recent: ["gone", "pad", "lock"], lands: "ok2"), Case(lands: "ok2"),
        ]
        for one in cases {
            let notes = [locked, pad, gone, full, note("ok1", updated: 10), note("ok2", updated: 20)]
            let (_, tops) = try run(notes, [entry(["牛奶"], note: one.wanted)], current: one.current, recent: one.recent)
            XCTAssertEqual(Array(tops.keys), [one.lands], "\(one)")
        }
    }

    /// 拆成好幾行：放得下全部才算放得下
    func testSplitNeedsRoomForAll() throws {
        let tight = note("tight", lines: Lines.max - 1)
        let (one, _) = try run([tight, note("bbb")], [entry(["牛奶"], note: "tight")])
        XCTAssertEqual(one.note("tight")?.items.count, Lines.max)
        let (two, _) = try run([tight, note("bbb")], [entry(["牛奶", "蛋"], note: "tight")])
        XCTAssertEqual(two.note("tight")?.items.count, Lines.max - 1)
        XCTAssertEqual(texts(two, "bbb"), ["牛奶", "蛋"])
    }

    /// 一張能記的都沒有：開一張新的，之後的也放那張
    func testOpensNewPaperWhenNothingFits() throws {
        var locked = note("lock", lines: 1)
        locked.locked = true
        let (book, tops) = try run([locked], [entry(["牛奶"], note: "lock"), entry(["蛋"], note: "lock")], current: "lock")
        XCTAssertEqual(book.notes.count, 2)
        XCTAssertEqual(texts(book, "lock"), ["舊 0"])
        let fresh = try XCTUnwrap(tops.keys.first)
        XCTAssertEqual(texts(book, fresh), ["蛋", "牛奶"])
        let (empty, _) = try run([], [entry((1 ... Lines.max).map { "\($0)" })])
        XCTAssertEqual(empty.notes.first?.items.count, Lines.max)
    }

    func testKnownLinesAreNotAddedAgain() throws {
        let one = try entry(["牛奶", "蛋", "蔥"], note: "aaa")
        var here = note("aaa"), gone = note("gone")
        here.items = [Item(id: one.lines[0].id, text: "改過的牛奶")]
        gone.deleted = true
        gone.bin = [Item(id: one.lines[1].id, text: "蛋", binnedAt: 500)]
        let (book, _) = run([here, gone], [one, one], current: "aaa")
        XCTAssertEqual(texts(book, "aaa"), ["蔥", "改過的牛奶"])
        XCTAssertEqual(book.note("gone"), gone)
        let (again, tops) = run(book.notes, [one], current: "aaa")
        XCTAssertTrue(tops.isEmpty)
        XCTAssertEqual(again.notes, book.notes)
    }
}

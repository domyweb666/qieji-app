@testable import Qieji
import XCTest

/// 2.1 分享進來的面板（S2）：附件收成字、改過沒有、拆成幾行、✓ 那一份
final class ShareDraftTests: XCTestCase {
    private func url(_ text: String) throws -> URL {
        try XCTUnwrap(URL(string: text))
    }

    // MARK: 附件

    func testLinkTakesOnlyWeb() throws {
        XCTAssertEqual(try ShareHaul.link(url("https://a.b/c") as NSURL), try url("https://a.b/c"))
        XCTAssertEqual(ShareHaul.link(" https://a.b/c \n" as NSString), try url("https://a.b/c"))
        XCTAssertEqual(ShareHaul.link(Data("https://a.b/c".utf8) as NSData), try url("https://a.b/c"))
        XCTAssertNil(ShareHaul.link(URL(fileURLWithPath: "/tmp/a.txt")))
        XCTAssertNil(try ShareHaul.link(url("mailto:a@b.c")))
        XCTAssertNil(ShareHaul.link("只是一句話" as NSString))
        XCTAssertNil(ShareHaul.link(nil))
        XCTAssertNil(ShareHaul.link(NSNumber(value: 1)))
    }

    func testWordsTakeTextNotFiles() {
        XCTAssertEqual(ShareHaul.words("買菜" as NSString), "買菜")
        XCTAssertEqual(ShareHaul.words(NSAttributedString(string: "買菜")), "買菜")
        XCTAssertEqual(ShareHaul.words(Data("買菜".utf8)), "買菜")
        XCTAssertNil(ShareHaul.words(URL(fileURLWithPath: "/tmp/a.txt")))
        XCTAssertNil(ShareHaul.words(Data([0xFF, 0xFE, 0x00])))
        XCTAssertNil(ShareHaul.words(" \n " as NSString))
        XCTAssertNil(ShareHaul.words(nil))
    }

    /// 太大的資料只解前面那段；剛好切在一個字中間也解得開
    func testHugeDataIsCutNotDropped() throws {
        for head in ["", "a", "ab"] {
            let data = Data((head + String(repeating: "茄", count: ShareInbox.maxBytes)).utf8)
            let words = try XCTUnwrap(ShareHaul.words(data))
            XCTAssertTrue(words.hasPrefix(head + "茄茄"))
            XCTAssertFalse(words.contains("\u{FFFD}"))
            var haul = ShareHaul()
            haul.add(text: words)
            let found = try XCTUnwrap(haul.compose())
            XCTAssertTrue(found.cut)
            XCTAssertEqual(found.text.utf16.count, ShareText.max)
        }
    }

    func testPageIsTitleAndLink() throws {
        var haul = ShareHaul(title: "好文章")
        try haul.add(link: url("https://a.b/c"))
        XCTAssertEqual(haul.compose()?.text, "好文章\nhttps://a.b/c")
        XCTAssertEqual(haul.compose()?.cut, false)
        XCTAssertEqual(haul.link, "https://a.b/c")
    }

    func testEveryPieceIsKept() throws {
        var haul = ShareHaul(title: "標題")
        haul.add(text: " 一 ")
        haul.add(text: "二\n三")
        try haul.add(link: url("https://a.b/1"))
        try haul.add(link: url("https://a.b/2"))
        XCTAssertEqual(haul.compose()?.text, "一\n二\n三\nhttps://a.b/1\nhttps://a.b/2")
    }

    /// 有的 app 只給標題：那就是要記的字，換行照舊
    func testOnlyTitleKeepsItsLines() {
        XCTAssertEqual(ShareHaul(title: "第一行\n第二行").compose()?.text, "第一行\n第二行")
    }

    func testNothingUsable() {
        var haul = ShareHaul(title: "  ")
        XCTAssertNil(haul.compose())
        XCTAssertNil(haul.link)
        haul.miss()
        XCTAssertNil(haul.compose())
        XCTAssertEqual(haul.missed, 1)
    }

    // MARK: 改過、拆行

    func testEditedGoesBackWhenUndone() {
        var draft = ShareDraft("買菜")
        XCTAssertFalse(draft.edited)
        draft.text = "買菜！"
        XCTAssertTrue(draft.edited)
        draft.text = "買菜"
        XCTAssertFalse(draft.edited)
        draft.text = " \n"
        XCTAssertTrue(draft.isBlank)
        XCTAssertTrue(draft.edited)
    }

    func testRowsFollowTheText() {
        var draft = ShareDraft("- 茄子\n- 九層塔\n\n3. 蛋")
        XCTAssertEqual(draft.rows, ["茄子", "九層塔", "蛋"])
        draft.text = "茄子\n九層塔"
        XCTAssertEqual(draft.rows.count, 2)
        draft.text = "茄子\n"
        XCTAssertEqual(draft.rows, [])
        draft.text = String(repeating: "a\n", count: ShareInbox.maxLines)
        XCTAssertEqual(draft.rows.count, ShareInbox.maxLines)
        draft.text += "a"
        XCTAssertEqual(draft.rows, [])
    }

    /// 標題＋網址是一則，不給拆；改過還是那兩行也一樣；多一行才給
    func testTitleAndLinkIsNotSplit() {
        var draft = ShareDraft("好文章\nhttps://a.b/c", link: "https://a.b/c")
        XCTAssertEqual(draft.rows, [])
        draft.text = "好文章\nhttps://a.b/c 要看"
        XCTAssertEqual(draft.rows, [])
        draft.text = "好文章\n重點\nhttps://a.b/c"
        XCTAssertEqual(draft.rows.count, 3)
        draft.text = "好文章\n重點"
        XCTAssertEqual(draft.rows.count, 2)
    }

    // MARK: ✓ 那一份

    func testRetryIsTheSameEntry() throws {
        var draft = ShareDraft("買菜")
        let first = try XCTUnwrap(draft.entry(["買菜"], note: "a"))
        XCTAssertEqual(draft.entry(["買菜"], note: "a"), first)
        XCTAssertEqual(draft.entry([" 買菜 "], note: "a"), first)
    }

    func testChangedTextOrPaperIsANewEntry() throws {
        var draft = ShareDraft("買菜")
        let first = try XCTUnwrap(draft.entry(["買菜"], note: "a"))
        let moved = try XCTUnwrap(draft.entry(["買菜"], note: "b"))
        XCTAssertEqual(moved.note, "b")
        XCTAssertNotEqual(moved.lines[0].id, first.lines[0].id)
        let edited = try XCTUnwrap(draft.entry(["買菜", "蛋"], note: "b"))
        XCTAssertEqual(edited.lines.map(\.text), ["買菜", "蛋"])
        XCTAssertNil(draft.entry([" "], note: "b"))
        XCTAssertNotEqual(draft.entry(["買菜"], note: "a"), first)
    }

    /// 寫不成、再寫一次：收件匣只有一份
    func testFailedThenWrittenOnce() throws {
        let root = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("qieji-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let broken = ShareInbox(folder: { nil }, settings: { nil })
        let good = ShareInbox(folder: { root }, settings: { nil })
        var draft = ShareDraft("買菜")
        let one = try XCTUnwrap(draft.entry([draft.text], note: nil))
        XCTAssertFalse(broken.write(one))
        for _ in 0 ..< 2 {
            let again = try XCTUnwrap(draft.entry([draft.text], note: nil))
            XCTAssertTrue(good.write(again))
        }
        XCTAssertEqual(good.read().mail.map(\.entry), [one])
    }
}

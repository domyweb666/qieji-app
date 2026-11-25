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
        XCTAssertEqual(ShareHaul.words("買菜" as NSString)?.text, "買菜")
        XCTAssertEqual(ShareHaul.words(NSAttributedString(string: "買菜"))?.text, "買菜")
        XCTAssertEqual(ShareHaul.words(Data("買菜".utf8))?.text, "買菜")
        XCTAssertNil(ShareHaul.words(URL(fileURLWithPath: "/tmp/a.txt")))
        XCTAssertNil(ShareHaul.words(Data([0xFF, 0xFE, 0x00])))
        XCTAssertNil(ShareHaul.words(" \n " as NSString))
        XCTAssertNil(ShareHaul.words(nil))
    }

    /// 太大的資料只解前面那段；剛好切在一個字中間也解得開
    func testHugeDataIsCutNotDropped() throws {
        for head in ["", "a", "ab"] {
            let data = Data((head + String(repeating: "茄", count: ShareInbox.maxBytes)).utf8)
            let words = try XCTUnwrap(ShareHaul.words(data)).text
            XCTAssertTrue(words.hasPrefix(head + "茄茄"))
            XCTAssertFalse(words.contains("\u{FFFD}"))
            var haul = ShareHaul()
            haul.add(text: words)
            let found = try XCTUnwrap(haul.compose())
            XCTAssertTrue(found.cut)
            XCTAssertEqual(found.text.utf16.count, ShareText.max)
        }
    }

    /// 幾 MB 的字先截再往下做：不切壞字、頭尾空白不算、有講截過
    func testHugeTextIsCutFirst() throws {
        let long = "a" + String(repeating: "👨‍👩‍👧", count: 100_000) // 一百萬個單位，截的地方落在一個字中間
        for item in [long as NSString, NSAttributedString(string: long), NSMutableAttributedString(string: " \n" + long)] as [Any] {
            let words = try XCTUnwrap(ShareHaul.words(item))
            XCTAssertTrue(words.cut)
            XCTAssertTrue(words.text.hasPrefix("a👨‍👩‍👧"))
            XCTAssertTrue(words.text.hasSuffix("👨‍👩‍👧"))
            XCTAssertLessThanOrEqual(words.text.utf16.count, ShareText.readMax)
            XCTAssertGreaterThan(words.text.utf16.count, ShareText.readMax - 20)
        }
        let blank = String(repeating: " ", count: ShareText.readMax * 2)
        let padded = try XCTUnwrap(ShareHaul.words((blank + "買菜" + blank) as NSString))
        XCTAssertEqual(padded.text, "買菜")
        XCTAssertFalse(padded.cut)
        // 中間隔很遠還有字：截了就要講，就算剩下的不到兩萬字
        let far = try XCTUnwrap(ShareHaul.words(("買菜" + blank + "蛋") as NSString))
        XCTAssertTrue(far.cut)
        var haul = ShareHaul()
        haul.add(text: far.text, cut: far.cut)
        XCTAssertEqual(haul.found().text, "買菜")
        XCTAssertTrue(haul.found().cut)
    }

    // MARK: 標題與內文

    private func made(_ title: String?, _ content: String?, _ bits: [ShareBit?] = []) -> String? {
        var haul = ShareHaul()
        haul.add(bits, title: title, content: content)
        return haul.found().text
    }

    private func link(_ text: String = "https://a.b/c") throws -> ShareBit {
        try .link(url(text))
    }

    /// Safari：網頁標題放在內文那格、沒有標題、附件只有網址
    func testSafariPage() throws {
        XCTAssertEqual(try made(nil, "好文章", [link()]), "好文章\nhttps://a.b/c")
        XCTAssertEqual(try made(nil, " 好文章\n", [link()]), "好文章\nhttps://a.b/c")
        XCTAssertEqual(try made("好文章", nil, [link()]), "好文章\nhttps://a.b/c")
        XCTAssertEqual(try made("好文章", "好文章", [link()]), "好文章\nhttps://a.b/c")
        XCTAssertEqual(try made("好文章｜某報", "好文章", [link()]), "好文章｜某報\nhttps://a.b/c")
        XCTAssertEqual(try made(nil, nil, [link()]), "https://a.b/c")
    }

    /// 內文沒做成文字附件：不准不見，換行照舊
    func testContentIsKept() throws {
        XCTAssertEqual(try made("標題", "內文在這裡", [link()]), "內文在這裡\nhttps://a.b/c")
        XCTAssertEqual(try made("標題", "一\n二", [link()]), "一\n二\nhttps://a.b/c")
        XCTAssertEqual(try made(nil, "一\n二", [link()]), "一\n二\nhttps://a.b/c")
        XCTAssertEqual(made(nil, "一\n二"), "一\n二")
        XCTAssertEqual(made("標題", "內文在這裡"), "內文在這裡")
        XCTAssertEqual(made("標題", nil), "標題")
        // 說有文字、卻沒讀到：內文拿來用，照樣講有漏
        var haul = ShareHaul()
        haul.add([.missed], title: nil, content: "一\n二")
        XCTAssertEqual(haul.found(), ShareFound(text: "一\n二", missed: 1))
    }

    /// 附件裡有的、只是那個網址的：不再放一次
    func testContentIsNotRepeated() throws {
        XCTAssertEqual(made("標題", "一\n二", [.text("一\n二", cut: false)]), "一\n二")
        XCTAssertEqual(made("標題", "買菜…", [.text("買菜和蛋", cut: false)]), "買菜和蛋")
        XCTAssertEqual(try made("標題", "https://a.b/c", [link()]), "標題\nhttps://a.b/c")
        XCTAssertEqual(try made("標題", "https://a.b", [link("https://a.b/")]), "標題\nhttps://a.b/")
        XCTAssertEqual(try made("標題", "標題 https://a.b/c", [link()]), "標題 https://a.b/c")
        XCTAssertEqual(try made(nil, "標題 https://a.b/c", [link()]), "標題 https://a.b/c")
        XCTAssertEqual(try made("標題", "一\nhttps://a.b/c", [link()]), "一\nhttps://a.b/c")
        XCTAssertEqual(try made(nil, "https://a.b/c", [link()]), "https://a.b/c")
        // 好幾個項目：各看各的，前面收過的不重複
        var haul = ShareHaul()
        haul.add([.text("一\n二", cut: false)], title: nil, content: nil)
        try haul.add([link()], title: nil, content: "一\n二")
        try haul.add([link("https://a.b/d")], title: nil, content: "三\n四")
        XCTAssertEqual(haul.found().text, "一\n二\n三\n四\nhttps://a.b/c\nhttps://a.b/d")
    }

    /// 太長的標題、內文也先截，有講
    func testHugeContentIsCutFirst() {
        let long = String(repeating: "茄子\n", count: 100_000)
        var haul = ShareHaul()
        haul.add([], title: nil, content: long)
        XCTAssertTrue(haul.found().cut)
        XCTAssertLessThanOrEqual(haul.found().text?.utf16.count ?? 0, ShareText.max)
        haul = ShareHaul()
        haul.add([], title: String(repeating: "茄", count: 100_000), content: nil)
        XCTAssertTrue(haul.found().cut)
    }

    /// 圖片、影片不收，記下來要講一聲；不算沒讀到
    func testPicturesAreMentioned() {
        var haul = ShareHaul()
        haul.add([.image, .text("買菜", cut: false), .image], title: nil, content: nil)
        XCTAssertEqual(haul.found(), ShareFound(text: "買菜", image: true))
        haul.add([.movie], title: nil, content: nil)
        XCTAssertEqual(haul.found(), ShareFound(text: "買菜", image: true, movie: true))
        haul = ShareHaul()
        haul.add([.image], title: nil, content: nil)
        XCTAssertNil(haul.found().text)
    }

    // MARK: 一起讀、只等這麼久

    private func after(_ seconds: Double, _ text: String) -> () async -> ShareBit {
        {
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            return .text(text, cut: false)
        }
    }

    /// 順序照給的，不照讀完的先後；全部讀完就交，不用等滿
    func testGatherKeepsOrder() async {
        let start = Date()
        let bits = await ShareGather.run([after(0.3, "一"), after(0, "二"), after(0.1, "三")], limit: 5)
        XCTAssertEqual(bits, ["一", "二", "三"].map { .text($0, cut: false) })
        XCTAssertLessThan(-start.timeIntervalSinceNow, 3)
        let none = await ShareGather.run([], limit: 5)
        XCTAssertEqual(none, [])
    }

    /// 有一樣一直不回來：時間到用已經讀到的，沒讀到的算漏掉；遲到的不算、也不會交第二次
    func testGatherGivesUp() async {
        let start = Date()
        let bits = await ShareGather.run([after(0, "一"), after(1, "遲到"), after(0, "三")], limit: 0.4)
        XCTAssertLessThan(-start.timeIntervalSinceNow, 0.9)
        XCTAssertEqual(bits, [.text("一", cut: false), nil, .text("三", cut: false)])
        var haul = ShareHaul()
        haul.add(bits, title: nil, content: nil)
        XCTAssertEqual(haul.found(), ShareFound(text: "一\n三", missed: 1))
        try? await Task.sleep(nanoseconds: 1_000_000_000)
        XCTAssertEqual(haul.found().text, "一\n三")
    }

    // MARK: 兜起來

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

    /// 改到超過兩萬字：不給記、不給拆；刪回來就恢復。頭尾空白記的時候會去掉，不算
    func testTooLong() {
        let full = String(repeating: "茄\n", count: 500) + String(repeating: "茄", count: ShareText.max - 1000)
        var draft = ShareDraft(full)
        XCTAssertEqual(full.utf16.count, ShareText.max)
        XCTAssertFalse(draft.tooLong)
        XCTAssertEqual(draft.rows.count, 501)
        draft.text += "\n \n"
        XCTAssertFalse(draft.tooLong)
        XCTAssertEqual(draft.rows.count, 501)
        draft.text += "子"
        XCTAssertTrue(draft.tooLong)
        XCTAssertEqual(draft.rows, [])
        draft.text = full
        XCTAssertFalse(draft.tooLong)
        XCTAssertEqual(draft.rows.count, 501)
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

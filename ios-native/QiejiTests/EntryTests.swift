@testable import Qieji
import XCTest

/// 2.1 入口三件：圖示長按（C3）、每行的時間（C7）、拆成 N 行（C10）
final class EntryTests: XCTestCase {
    private func store(_ lines: [Item]) -> Store {
        var note = Note.blank(now: 1000)
        note.title = "測試"
        note.items = lines
        var book = Notebook()
        book.notes = [note]
        return Store(book: book)
    }

    private func texts(_ store: Store) -> [String] {
        store.current?.items.map(\.text) ?? []
    }

    // MARK: C3

    func testQuickActionTakesOnlyKnownTypeAndOnlyOnce() {
        let quick = QuickAction()
        XCTAssertFalse(quick.receive("別的"))
        XCTAssertFalse(quick.take())
        XCTAssertTrue(quick.receive(QuickAction.newLine))
        XCTAssertTrue(quick.take())
        XCTAssertFalse(quick.take())
    }

    /// project.yml 寫的捷徑型別要跟程式認的一樣
    func testQuickActionIsDeclared() {
        let items = Bundle.main.object(forInfoDictionaryKey: "UIApplicationShortcutItems") as? [[String: Any]]
        XCTAssertEqual(items?.compactMap { $0["UIApplicationShortcutItemType"] as? String }, [QuickAction.newLine])
    }

    // MARK: C7

    func testBornReadsTimeFromID() {
        let now: Double = 1_795_000_000_000
        XCTAssertEqual(Ident.born(Ident.make(now: 1_794_900_000_123), now: now), 1_794_900_000_123)
        // 網頁版、1.1 同一個寫法；尾巴可能不到五個字
        XCTAssertNotNil(Ident.born("mvr2ntmoxnz", now: now))
    }

    func testBornRefusesWhatIsNotOurs() {
        let now: Double = 1_795_000_000_000
        for id in ["", "abc", "1234567890123", "MVR2NTMOXNZLJ", "mvr2ntmo-xnzl", "mvr2ntmo", "mvr2ntmoxnzljabc", "買牛奶買牛奶買牛奶"] {
            XCTAssertNil(Ident.born(id, now: now), id)
        }
        // 手機時間被調過：比現在晚的不顯示
        XCTAssertNil(Ident.born(Ident.make(now: now + 1000), now: now))
    }

    // MARK: C10

    func testSplitKeepsNumbersThatAreNotListMarks() {
        XCTAssertEqual(Lines.splitPasted("1.5 公升牛奶\n-5 度\n2.0 版"), ["1.5 公升牛奶", "-5 度", "2.0 版"])
        XCTAssertEqual(Lines.splitPasted("- 牛奶\n1. 蛋\n2、豆腐\n3)蔥\n\n• 米"), ["牛奶", "蛋", "豆腐", "蔥", "米"])
    }

    func testPastedManyOnlyForPaste() {
        XCTAssertTrue(ComposerHost.pastedMany(prev: "", next: "牛奶\n蛋"))
        XCTAssertTrue(ComposerHost.pastedMany(prev: "買", next: "買牛奶\n蛋"))
        XCTAssertFalse(ComposerHost.pastedMany(prev: "牛奶", next: "牛奶\n"))
        XCTAssertFalse(ComposerHost.pastedMany(prev: "選掉的字", next: "選\n"))
        XCTAssertFalse(ComposerHost.pastedMany(prev: "牛奶\n", next: "牛奶\n蛋"))
        XCTAssertFalse(ComposerHost.pastedMany(prev: "牛奶\n蛋", next: "牛奶"))
    }

    func testSplitGoesOnTopInOrder() {
        let store = store([Item(text: "舊的")])
        XCTAssertEqual(store.addSplit("牛奶\n蛋\n豆腐")?.count, 3)
        XCTAssertEqual(texts(store), ["牛奶", "蛋", "豆腐", "舊的"])
        XCTAssertNil(store.addSplit("只有一行"))
        XCTAssertEqual(texts(store).count, 4)
    }

    func testSplitUndoPutsWholeTextBack() {
        let store = store([Item(text: "舊的")])
        _ = store.addSplit("- 牛奶\n- 蛋")
        store.toast?.undo?()
        XCTAssertEqual(texts(store), ["- 牛奶\n- 蛋", "舊的"])
    }

    func testSplitUndoLeavesChangedLinesAlone() throws {
        let store = store([])
        let ids = try XCTUnwrap(store.addSplit("牛奶\n蛋"))
        let undo = store.toast?.undo
        store.toggle(ids[0])
        undo?()
        XCTAssertEqual(texts(store), ["牛奶", "蛋"])
    }

    func testSplitDoesNothingWhenItDoesNotFit() {
        let store = store((1 ..< Lines.max).map { Item(text: "第 \($0) 行") })
        XCTAssertNil(store.addSplit("牛奶\n蛋"))
        XCTAssertEqual(texts(store).count, Lines.max - 1)
        XCTAssertNotNil(store.toast)
    }
}

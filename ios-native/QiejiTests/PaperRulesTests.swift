@testable import Qieji
import XCTest

/// 紙上的規則照 1.1.1：行首 Backspace、空行刪除、離開一張紙時收尾。只測資料，不碰畫面、不讀不寫存檔。
final class PaperRulesTests: XCTestCase {
    private func store(_ lines: [Item], extra: [Note] = []) -> Store {
        var note = Note.blank(now: 1000)
        note.title = "測試"
        note.items = lines
        var book = Notebook()
        book.notes = [note] + extra
        return Store(book: book)
    }

    private func texts(_ store: Store) -> [String] {
        store.current?.items.map(\.text) ?? []
    }

    func testBackspaceJoinsIntoPreviousLine() {
        let first = Item(text: "買"), second = Item(text: "牛奶")
        let store = store([first, second])
        let joined = store.joinUp(second.id, text: "牛奶")
        XCTAssertEqual(joined?.id, first.id)
        XCTAssertEqual(joined?.at, 1)
        XCTAssertEqual(texts(store), ["買牛奶"])
    }

    func testBackspaceDoesNotJoinStruckLines() {
        let done = Item(text: "做完了", done: true), next = Item(text: "下一件")
        let store = store([done, next])
        XCTAssertNil(store.joinUp(next.id, text: "下一件"))
        XCTAssertEqual(texts(store), ["做完了", "下一件"])

        let open = Item(text: "還沒做"), struck = Item(text: "劃掉的", done: true)
        let other = self.store([open, struck])
        XCTAssertNil(other.joinUp(struck.id, text: "劃掉的"))
        XCTAssertEqual(texts(other), ["還沒做", "劃掉的"])
    }

    func testBackspaceOnEmptyLineRemovesItEvenAfterStruckLine() {
        let done = Item(text: "做完了", done: true), empty = Item(text: "")
        let store = store([done, empty])
        let back = store.joinUp(empty.id, text: "")
        XCTAssertEqual(back?.id, done.id)
        XCTAssertEqual(back?.at, 3)
        XCTAssertEqual(texts(store), ["做完了"])
    }

    func testDeletingEmptyLineSkipsTrashAndToast() {
        let blank = Item(text: "  "), keep = Item(text: "留著")
        let store = store([blank, keep])
        store.binLine(blank.id)
        XCTAssertEqual(texts(store), ["留著"])
        XCTAssertEqual(store.current?.bin.count, 0)
        XCTAssertNil(store.toast)
    }

    func testDeletingLineGoesToTrashWithUndo() {
        let line = Item(text: "要刪的")
        let store = store([line])
        store.binLine(line.id)
        XCTAssertEqual(store.current?.bin.map(\.text), ["要刪的"])
        XCTAssertNotNil(store.toast?.undo)
    }

    func testLeavingNoteRemovesEmptyLines() {
        var other = Note.blank(now: 2000)
        other.title = "另一張"
        let store = store([Item(text: "a"), Item(text: ""), Item(text: " ")], extra: [other])
        let first = store.currentID
        store.open(other.id)
        XCTAssertEqual(store.book.note(first ?? "")?.items.map(\.text), ["a"])
    }

    func testLeavingBlankNoteDropsIt() {
        var blank = Note.blank(now: 3000)
        blank.items = [Item(text: "")]
        var other = Note.blank(now: 2000)
        other.title = "另一張"
        var book = Notebook()
        book.notes = [blank, other]
        let store = Store(book: book)
        store.open(blank.id)
        store.open(other.id)
        XCTAssertNil(store.book.note(blank.id))
        XCTAssertEqual(store.currentID, other.id)
    }

    func testLeavingBlankNoteWithTrashedLinesKeepsIt() {
        var blank = Note.blank(now: 3000)
        blank.bin = [Item(text: "刪掉的")]
        var other = Note.blank(now: 2000)
        other.title = "另一張"
        var book = Notebook()
        book.notes = [blank, other]
        let store = Store(book: book)
        store.open(blank.id)
        store.open(other.id)
        XCTAssertNotNil(store.book.note(blank.id))
    }
}

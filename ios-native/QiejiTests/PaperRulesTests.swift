@testable import Qieji
import XCTest

/// 紙上的規則：行首 Backspace（有字的不併到別則，QC-0001）、空行刪除、離開一張紙時收尾。只測資料，不碰畫面、不讀不寫存檔。
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

    func testBackspaceKeepsTextInItsOwnLine() {
        let first = Item(text: "買"), second = Item(text: "牛奶")
        let store = store([first, second])
        XCTAssertNil(store.joinUp(second.id, text: "牛奶"))
        XCTAssertEqual(texts(store), ["買", "牛奶"])
        XCTAssertEqual(store.current?.items.map(\.id), [first.id, second.id])
    }

    func testBackspaceOnEmptyLineMovesToPreviousEnd() {
        let first = Item(text: "買"), empty = Item(text: "")
        let store = store([first, empty])
        let back = store.joinUp(empty.id, text: "")
        XCTAssertEqual(back?.id, first.id)
        XCTAssertEqual(back?.at, 1)
        XCTAssertEqual(texts(store), ["買"])
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

    // MARK: ⋯ 選單（第 4 項）

    private func notes(_ count: Int, pinned: Int = 0) -> [Note] {
        (0 ..< count).map { idx in
            var note = Note.blank(now: Double(1000 + idx))
            note.title = "第\(idx)張"
            note.items = [Item(text: "內容")]
            note.pinned = idx < pinned
            return note
        }
    }

    private func storeOf(_ list: [Note]) -> Store {
        var book = Notebook()
        book.notes = list
        return Store(book: book)
    }

    func testPinUntilFullThenAsk() {
        let list = notes(7, pinned: 5)
        let store = storeOf(list)
        XCTAssertNil(store.pinOrAsk(list[0].id)) // 取消釘選
        XCTAssertEqual(store.book.note(list[0].id)?.pinned, false)
        XCTAssertEqual(store.toast?.text, Words.unpinned)
        XCTAssertNil(store.pinOrAsk(list[5].id)) // 剛好空出一格
        XCTAssertEqual(store.book.note(list[5].id)?.pinned, true)
        let ask = store.pinOrAsk(list[6].id) // 又滿了：不動，回傳五張讓畫面問
        XCTAssertEqual(ask?.count, Seats.pinMax)
        XCTAssertEqual(store.book.note(list[6].id)?.pinned, false)
    }

    func testSwapPinAndUndo() {
        let list = notes(6, pinned: 5)
        let store = storeOf(list)
        store.swapPin(list[5].id, out: list[2].id)
        XCTAssertEqual(store.book.note(list[5].id)?.pinned, true)
        XCTAssertEqual(store.book.note(list[2].id)?.pinned, false)
        XCTAssertEqual(store.toast?.text, Words.swappedPin("第2張"))
        store.toast?.undo?()
        XCTAssertEqual(store.book.note(list[5].id)?.pinned, false)
        XCTAssertEqual(store.book.note(list[2].id)?.pinned, true)
    }

    func testDeleteThisNoteGoesToLatestAndUndoReturns() {
        var list = notes(3, pinned: 1)
        list[1].updated = 9000 // 最近改過的
        let store = storeOf(list)
        store.open(list[0].id)
        store.trashNote(list[0].id, reopen: true)
        XCTAssertEqual(store.book.note(list[0].id)?.deleted, true)
        XCTAssertEqual(store.book.note(list[0].id)?.pinned, false)
        XCTAssertEqual(store.currentID, list[1].id)
        XCTAssertEqual(store.toast?.text, Words.movedToTrash)
        store.toast?.undo?()
        XCTAssertEqual(store.book.note(list[0].id)?.deleted, false)
        XCTAssertEqual(store.book.note(list[0].id)?.pinned, true)
        XCTAssertEqual(store.currentID, list[0].id)
    }

    func testDeletingBlankNoteDropsItWithoutToast() {
        var list = notes(2)
        list[0].title = ""
        list[0].items = [Item(text: " ")]
        let store = storeOf(list)
        store.open(list[0].id)
        store.trashNote(list[0].id, reopen: true)
        XCTAssertNil(store.book.note(list[0].id))
        XCTAssertNil(store.toast)
        XCTAssertEqual(store.currentID, list[1].id)
    }

    func testReverseUnstrikeAndClearDone() {
        let store = store([Item(text: "一", done: true), Item(text: "二"), Item(text: "三", done: true)])
        let id = store.currentID ?? ""
        store.reverseLines(id)
        XCTAssertEqual(texts(store), ["三", "二", "一"])
        store.clearDone(id)
        XCTAssertEqual(texts(store), ["二"])
        XCTAssertEqual(store.toast?.text, Words.cleared(2))
        store.toast?.undo?()
        XCTAssertEqual(texts(store), ["三", "二", "一"])
        store.unstrikeAll(id)
        XCTAssertEqual(store.current?.items.filter(\.done).count, 0)
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

    /// 搜尋點一行（1.1 openAt／takeSeek）：換到那張；只有那張紙拿得到要捲去的那行，拿一次就清掉
    func testSearchLineIsTakenOnceByItsNote() {
        let here = Item(text: "這一張")
        var other = Note.blank(now: 2000)
        other.title = "另一張"
        let target = Item(text: "要找的那行")
        other.items = [Item(text: "前面"), target]
        let store = store([here], extra: [other])
        let first = store.current
        store.openAt(other.id, line: target.id)
        XCTAssertEqual(store.currentID, other.id)
        XCTAssertNil(first.flatMap { store.takeSeek(in: $0) })
        XCTAssertEqual(store.current.flatMap { store.takeSeek(in: $0) }, target.id)
        XCTAssertNil(store.current.flatMap { store.takeSeek(in: $0) })
    }

    /// 目錄 VoiceOver 的「改名字」：記下要改哪一張，紙那邊看到是自己才開始改
    func testRenameRequestNamesTheNote() {
        let store = store([Item(text: "一")])
        let before = store.renameAsk
        store.requestRename("abc")
        XCTAssertEqual(store.renameID, "abc")
        XCTAssertEqual(store.renameAsk, before + 1)
    }

    /// 刪除滑出途中換了紙：刪的還是原本那張的那一行，換過去的那張不動；復原也回到原本那張
    func testBinAfterSwitchingPaper() throws {
        var book = Notebook()
        var first = Note.blank(color: "yellow", now: 1)
        let line = Item(text: "要刪的")
        first.items = [line, Item(text: "留著")]
        var second = Note.blank(color: "green", now: 2)
        second.items = [Item(text: "另一張")]
        book.notes = [first, second]
        let store = Store(book: book)
        store.open(first.id)
        store.open(second.id)
        store.binLine(line.id, in: first.id)
        XCTAssertEqual(store.book.note(first.id)?.items.map(\.text), ["留著"])
        XCTAssertEqual(store.book.note(second.id)?.items.map(\.text), ["另一張"])
        try XCTUnwrap(store.toast?.undo)()
        XCTAssertEqual(store.book.note(first.id)?.items.map(\.text), ["要刪的", "留著"])
    }

    /// 打字當下資料就是新的（畫面可以慢一拍重畫，資料不行）
    func testTypingIsInTheBookRightAway() {
        var book = Notebook()
        var first = Note.blank(color: "yellow", now: 1)
        let line = Item(text: "a")
        first.items = [line]
        book.notes = [first]
        let store = Store(book: book)
        store.setText(line.id, "ab", in: first.id)
        XCTAssertEqual(store.current?.items.first?.text, "ab")
    }
}

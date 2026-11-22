@testable import Qieji
import XCTest

/// 推給桌面小工具的內容（1.1 widget.ts）：沒買只放一句話、上鎖的紙不露內容、空行不推、記事本一行一行拿
final class WidgetTests: XCTestCase {
    func testNotBoughtShowsOnlyTheNotice() {
        var note = Note.blank(now: 1000)
        note.title = "秘密清單"
        note.items = [Item(text: "不該出現")]
        let snap = WidgetSnap.make(note: note, full: false)
        XCTAssertEqual(snap.locked, WidgetSnap.lockedText)
        XCTAssertEqual(snap.title, Words.appName)
        XCTAssertTrue(snap.lines.isEmpty)
    }

    func testLockedNoteHidesNameAndLines() {
        var note = Note.blank(now: 1000)
        note.title = "日記"
        note.locked = true
        note.items = [Item(text: "不該出現")]
        let snap = WidgetSnap.make(note: note, full: true)
        XCTAssertEqual(snap.title, Words.appName)
        XCTAssertEqual(snap.lines.map(\.text), [WidgetSnap.lockedNote])
    }

    func testLinesSkipBlanksAndKeepStrikes() {
        var note = Note.blank(now: 1000)
        note.title = "買菜"
        note.items = [Item(text: "青蔥"), Item(text: "  "), Item(text: "豆腐", done: true)] + (1 ... 20).map { Item(text: "第\($0)") }
        let snap = WidgetSnap.make(note: note, full: true)
        XCTAssertEqual(snap.title, "買菜")
        XCTAssertEqual(snap.lines.count, WidgetShare.largeLines)
        XCTAssertEqual(snap.lines[0], WidgetSnap.Line(text: "青蔥", done: false))
        XCTAssertEqual(snap.lines[1], WidgetSnap.Line(text: "豆腐", done: true))
    }

    func testNotepadUsesBodyLines() {
        var note = Note.blank(now: 1000)
        note.kind = "text"
        note.body = "第一段\n\n  第二段  \n"
        let snap = WidgetSnap.make(note: note, full: true)
        XCTAssertEqual(snap.lines.map(\.text), ["第一段", "第二段"])
    }
}

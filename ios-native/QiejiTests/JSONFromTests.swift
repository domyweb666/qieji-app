@testable import Qieji
import XCTest

/// 讀存檔變快（效能審查第 4 條）：JSONValue.from 改成直接看 Foundation 類別、存檔位元組直接解。
/// 讀出來的值要跟改之前的寫法一模一樣：舊寫法原樣抄在這裡當對照答案。
final class JSONFromTests: XCTestCase {
    /// 改之前的 JSONValue.from（2026-11-26 bbda6c4），一字不改
    private static func before(_ any: Any) -> JSONValue {
        if any is NSNull {
            return .null
        }
        if let num = any as? NSNumber {
            if CFGetTypeID(num) == CFBooleanGetTypeID() {
                return .bool(num.boolValue)
            }
            return .number(num.doubleValue)
        }
        if let str = any as? String {
            return .string(str)
        }
        if let arr = any as? [Any] {
            return .array(arr.map(before))
        }
        if let dict = any as? [String: Any] {
            return .object(dict.mapValues(before))
        }
        return .null
    }

    private func check(_ text: String, file: StaticString = #filePath, line: UInt = #line) throws {
        let data = Data(text.utf8)
        let any = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
        let now = JSONValue.parse(data)
        XCTAssertNotNil(now, text, file: file, line: line)
        XCTAssertEqual(now, Self.before(any), text, file: file, line: line)
        XCTAssertEqual(JSONValue.parse(text), now, text, file: file, line: line)
    }

    func testSameValuesAsBefore() throws {
        let cases = [
            "null", "true", "false", "0", "1", "-0", "0.1", "1e21", "1.5e-7", "-123.456", "9007199254740993",
            "12345678901234567890", "1e308", "5e-324", "\"\"", "\"字\"", "\"引號\\\" 反斜線\\\\ 換行\\n 定位\\t\"",
            "\"\\u0000\\u001f\\u2028\\ud83c\\udf46 茄子\"", "\"é e\\u0301\"", "[]", "{}", "[[],{},[null]]",
            "[1,true,\"1\",null,0,false]", "{\"a\":1,\"b\":true,\"c\":[1,{\"d\":null}],\"e\":{\"f\":\"g\"}}",
            "{\"done\":1,\"b\":0,\"t\":\"0\",\"at\":1.7e12}", "{\"\":\"空的鍵\",\"鍵\":\"值\"}",
        ]
        for text in cases {
            try check(text)
        }
    }

    /// Expo 版跑出來的對照資料整份
    func testFixturesSameAsBefore() throws {
        let url = try XCTUnwrap(Bundle(for: JSONFromTests.self).url(forResource: "fixtures", withExtension: "json"))
        try check(String(contentsOf: url, encoding: .utf8))
    }

    /// 千行的紙、各種欄位都有的一整份存檔：讀出來跟以前一樣，位元組直接解跟從字解也一樣
    func testWholeBookSameAsBefore() throws {
        var note = Note.blank(color: "purple", now: 1000)
        note.id = "json-big"
        note.title = "千行 \"引號\""
        note.glyph = "茄"
        note.items = (0 ..< 1000).map { Item(id: "j\($0)", text: "第 \($0) 行 🍆\n換行", done: $0 % 3 == 0, flagB: $0 % 2 == 0) }
        note.bin = [Item(id: "jx", text: "刪掉的", binnedAt: 1_700_000_000_000.5)]
        note.extra = ["future": .array([.number(1), .bool(false), .null, .object(["x": .string("y")])])]
        note.hash = "abc"
        note.mod = 12.25
        var book = Notebook()
        book.notes = [note, Tutorial.note(now: 2000)]
        book.order = ["json-big"]
        book.folders = [Folder(id: "f", name: "夾", ids: ["json-big"])]
        book.gone = ["dead": 3000]
        book.extra = ["other": .string("留著")]
        let text = NoteCoding.write(book)
        try check(text)
        let fromData = try XCTUnwrap(NoteCoding.readBook(Data(text.utf8)))
        XCTAssertEqual(fromData, NoteCoding.readBook(text))
        XCTAssertEqual(NoteCoding.write(fromData), text)
    }

    /// 不是 JSON、不是茄記的格式：一樣讀不出來
    func testUnreadableStaysUnreadable() {
        for text in ["", "不是 JSON", "{\"notes\":1}", "[1,2]", "{\"notes\":[1,", "\u{FEFF}"] {
            XCTAssertNil(NoteCoding.readBook(Data(text.utf8)), text)
            XCTAssertNil(NoteCoding.readBook(text), text)
        }
    }
}

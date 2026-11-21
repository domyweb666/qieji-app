import Foundation
import SwiftUI

/// 整個 app 只有一份資料。畫面改資料一律走這裡的方法：改完畫面重畫、稍後存檔。
final class Store: ObservableObject {
    @Published private(set) var book: Notebook
    @Published private(set) var currentID: String?
    @Published var toast: Toast?
    /// 要紙升起輸入框（開了新的一張、控制中心按了「記一行」）：每要一次加一
    @Published var composeAsk = 0
    private var composePending = false

    /// 要現在這張紙升起輸入框。紙還沒出現就先留著，出現時自己拿
    func requestCompose() {
        composePending = true
        composeAsk += 1
    }

    func takeCompose() -> Bool {
        let had = composePending
        composePending = false
        return had
    }

    @Published private(set) var loaded = false
    /// 這次打開不准寫檔（舊存檔沒能先備份）
    var frozen = false

    let disk: Disk?
    private var saveTask: DispatchWorkItem?

    struct Toast: Equatable {
        let id = UUID()
        var text: String
        var undo: (() -> Void)?
        static func == (lhs: Toast, rhs: Toast) -> Bool {
            lhs.id == rhs.id
        }
    }

    init(book: Notebook = Notebook(), disk: Disk? = nil) {
        self.book = book
        self.disk = disk
        currentID = book.notes.first { !$0.deleted }?.id
    }

    var current: Note? {
        currentID.flatMap { book.note($0) }
    }

    // MARK: 改資料的共用入口

    /// 改整份資料：改完重畫、排存檔
    func edit(_ change: (inout Notebook) -> Void) {
        change(&book)
        scheduleSave()
    }

    /// 改現在這張紙。touch＝算不算「改過」（會動修改時間）
    func editCurrent(touch: Bool = true, _ change: (inout Note) -> Void) {
        guard let id = currentID, let idx = book.index(id) else { return }
        change(&book.notes[idx])
        if touch {
            book.notes[idx].updated = Clock.now()
        }
        scheduleSave()
    }

    func open(_ id: String) {
        guard book.note(id) != nil else { return }
        currentID = id
        disk?.rememberLast(id)
    }

    // MARK: 紙上的行

    /// 右下 ＋ 記一行：放在最上面。回傳新行的 id；滿了回 nil
    @discardableResult
    func addTop(_ text: String) -> String? {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, let note = current else { return nil }
        guard Lines.room(note) > 0 else { toast = Toast(text: Words.full(Lines.max)); return nil }
        let item = Item(text: clean)
        editCurrent { $0.items.insert(item, at: 0) }
        return item.id
    }

    func setText(_ itemID: String, _ text: String) {
        editCurrent { note in
            guard let idx = note.items.firstIndex(where: { $0.id == itemID }), note.items[idx].text != text else { return }
            note.items[idx].text = text
        }
    }

    func toggle(_ itemID: String) {
        editCurrent { note in
            guard let idx = note.items.firstIndex(where: { $0.id == itemID }),
                  !note.items[idx].text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
            note.items[idx].done.toggle()
        }
    }

    /// 刪一行：進這張紙的最近刪除，跳一條可以復原的提示
    func binLine(_ itemID: String) {
        guard let note = current, let at = note.items.firstIndex(where: { $0.id == itemID }) else { return }
        let noteID = note.id
        editCurrent { _ = Lines.bin(&$0, itemID, now: Clock.now()) }
        toast = Toast(text: Words.lineDeleted) { [weak self] in
            self?.edit { book in
                guard let idx = book.index(noteID) else { return }
                _ = Lines.unbin(&book.notes[idx], itemID, at: at)
            }
        }
    }

    /// 打字打到空的就離開那一行：直接拿掉（沒有字，不進最近刪除）
    func dropIfEmpty(_ itemID: String) {
        guard let note = current, let item = note.items.first(where: { $0.id == itemID }),
              item.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        editCurrent(touch: false) { $0.items.removeAll { $0.id == itemID } }
    }

    func move(_ itemID: String, to target: Int) {
        editCurrent { note in
            guard let from = note.items.firstIndex(where: { $0.id == itemID }) else { return }
            let item = note.items.remove(at: from)
            note.items.insert(item, at: max(0, min(target, note.items.count)))
        }
    }

    /// 在一行裡按 Return：從游標切成兩行。回傳新那一行的 id；滿了回 nil
    func split(_ itemID: String, before: String, after: String) -> String? {
        guard let note = current, let at = note.items.firstIndex(where: { $0.id == itemID }) else { return nil }
        guard Lines.room(note) > 0 else { toast = Toast(text: Words.full(Lines.max)); return nil }
        let next = Item(text: after, done: false)
        editCurrent { note in
            note.items[at].text = before
            note.items.insert(next, at: at + 1)
        }
        return next.id
    }

    /// 游標在最前面按 Backspace：這一行的字接到上一行後面。回傳上一行的 id 和接合處（原本上一行有幾個字）
    func joinUp(_ itemID: String, text: String) -> (id: String, at: Int)? {
        guard let note = current, let at = note.items.firstIndex(where: { $0.id == itemID }), at > 0 else { return nil }
        let prev = note.items[at - 1]
        let seam = (prev.text as NSString).length
        editCurrent { note in
            note.items[at - 1].text = prev.text + text
            note.items.remove(at: at)
        }
        return (prev.id, seam)
    }

    // MARK: 存檔（稍後存：打字中每次改字都會叫到）

    private func scheduleSave() {
        guard disk != nil else { return }
        saveTask?.cancel()
        let task = DispatchWorkItem { [weak self] in self?.flush() }
        saveTask = task
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Timing.saveDebounce, execute: task)
    }

    /// 馬上存（進背景時叫）
    func flush() {
        saveTask?.cancel()
        guard let disk, loaded, !frozen else { return }
        Sync.stampMods(&book, now: Clock.now())
        _ = Seats.fixOrder(&book)
        if !disk.write(book) {
            toast = Toast(text: Words.saveFailed)
        }
    }

    /// 讀完資料後呼叫一次
    func adopt(_ book: Notebook, last: String?) {
        self.book = book
        currentID = last.flatMap { id in book.note(id).flatMap { $0.deleted ? nil : id } }
            ?? book.notes.first { !$0.deleted }?.id
        loaded = true
    }
}

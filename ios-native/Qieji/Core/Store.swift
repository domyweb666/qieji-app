import Foundation
import SwiftUI

/// 整個 app 只有一份資料。畫面改資料一律走這裡的方法：改完畫面重畫、稍後存檔。
final class Store: ObservableObject {
    @Published private(set) var book: Notebook {
        didSet { onBook() }
    }

    /// 資料換了馬上叫（目錄開著時照新的排）
    var onBook: () -> Void = {}
    @Published private(set) var currentID: String?
    @Published var toast: Toast?
    /// 要人讀完的訊息（會丟字的錯誤）：系統提示框、一顆按鈕，不像提示條會自己消失（1.1 06-首次體驗 ❓7）
    @Published var notice: Notice?
    private var saveFailed = false

    struct Notice: Equatable {
        let title: String
        let body: String
    }

    /// 要紙升起輸入框（開了新的一張、控制中心按了「記一行」）：每要一次加一
    @Published var composeAsk = 0
    private var composePending = false
    /// 右下 ＋ 被按了一下（＋ 畫在紙外面，換紙時不跟著閃）：每按一次加一，紙自己決定開不開輸入框
    @Published var plusAsk = 0
    /// 從搜尋點一行過來（1.1 openAt／takeSeek）：換到那張，紙捲到那一行、亮一下。紙拿一次就清掉
    var seek: String?
    @Published var seekAsk = 0
    /// VoiceOver 在目錄的「改名字」（1.1 requestRename）：換到那張，清單名變成可以打字
    var renameID: String?
    @Published var renameAsk = 0
    /// 右下 ＋ 要不要畫（紙依自己的狀態說：鍵盤、輸入框、選單開著就不畫）
    @Published var fabShown = false
    /// 輸入框裡打到一半的字：換到別張紙時跟著原本那張走，不丟（1.1 closeNote）
    var draft = ""

    /// 要現在這張紙升起輸入框。紙還沒出現就先留著，出現時自己拿
    func openAt(_ id: String, line: String) {
        seek = line
        open(id)
        seekAsk += 1
    }

    /// 紙要搜尋點的那一行：是這張的才給，給了就清掉
    func takeSeek(in note: Note) -> String? {
        guard let line = seek, note.items.contains(where: { $0.id == line }) else { return nil }
        seek = nil
        return line
    }

    func requestRename(_ id: String) {
        renameID = id
        renameAsk += 1
    }

    func requestCompose() {
        composePending = true
        composeAsk += 1
    }

    func takeCompose() -> Bool {
        let had = composePending
        composePending = false
        return had
    }

    /// 買了完整版沒。內購還沒搬來（StoreKit 2 待做），現在只有假資料模式是 true；判斷不出來一律當沒買（安全標準授權段）
    var isFull = false {
        didSet {
            if isFull != oldValue {
                pushWidget()
            }
        }
    }

    /// 已經知道買了沒（讀到手機上次記的結果）：在這之前不推小工具
    var fullKnown = false {
        didSet { pushWidget() }
    }

    var widgetSent: Data?
    var widgetWork: DispatchWorkItem?

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

    /// 換到另一張紙。離開的那張收尾（1.1 closeNote）：空行拿掉，整張空白就不留
    func open(_ id: String) {
        guard book.note(id) != nil else { return }
        let leaving = currentID
        currentID = id
        disk?.rememberLast(id)
        pushWidgetSoon()
        if let leaving, leaving != id {
            keepDraft(in: leaving)
            tidy(leaving)
        }
    }

    /// 拿走輸入框裡的字（拿了就清空）
    func takeDraft() -> String {
        let text = draft
        draft = ""
        return text
    }

    /// 輸入框裡打到一半的字記成那張紙最上面一行（換紙、切到別的 app 時用；滿了也照記，字不能丟）
    func keepDraft(in id: String) {
        let clean = Labels.trim(takeDraft())
        guard !clean.isEmpty, book.note(id) != nil else { return }
        editNote(id) { $0.items.insert(Item(text: clean), at: 0) }
    }

    // MARK: 紙上的行

    /// 右下 ＋ 記一行：放在最上面。回傳新行的 id；沒字回 nil。
    /// 收起輸入框時打的字照記，滿 1000 行也不丟（1.1 closeComposer）；滿了不准再開輸入框，在按 ＋ 那一刻擋
    @discardableResult
    func addTop(_ text: String) -> String? {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, current != nil else { return nil }
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
        var struck = false
        editCurrent { note in
            guard let idx = note.items.firstIndex(where: { $0.id == itemID }),
                  !note.items[idx].text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
            note.items[idx].done.toggle()
            struck = note.items[idx].done
        }
        // 評分提示只數「劃掉」，恢復不算（1.1 片 C2）
        if struck, disk != nil {
            ReviewAsk.struck()
        }
    }

    /// 刪一行：進這張紙的最近刪除，跳一條可以復原的提示。空行直接拿掉，不進最近刪除、不提示（1.1 一樣）
    func binLine(_ itemID: String) {
        guard let note = current, let at = note.items.firstIndex(where: { $0.id == itemID }) else { return }
        if Labels.trim(note.items[at].text).isEmpty {
            editCurrent { $0.items.remove(at: at) }
            return
        }
        let noteID = note.id
        editCurrent { _ = Lines.bin(&$0, itemID, now: Clock.now()) }
        toast = Toast(text: Words.movedToTrash) { [weak self] in
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

    /// 游標在最前面按 Backspace（1.1 A5）：空的一行＝這行拿掉、游標回到上一行最後面；有字的行＝字接到上一行後面。
    /// 劃掉的行不參與併行（多米定）：上一行或這一行是劃掉的，有字的行按了沒反應。
    /// 回傳游標要去的那行 id 和位置（原本上一行有幾個字）；沒接手回 nil
    func joinUp(_ itemID: String, text: String) -> (id: String, at: Int)? {
        guard let note = current, let at = note.items.firstIndex(where: { $0.id == itemID }), at > 0 else { return nil }
        let prev = note.items[at - 1], line = note.items[at]
        let seam = (prev.text as NSString).length
        if text.isEmpty {
            editCurrent { $0.items.remove(at: at) }
            return (prev.id, seam)
        }
        if prev.done || line.done {
            return nil
        }
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
        if disk.write(book) {
            saveFailed = false
            pushWidget() // 存檔成功才推給桌面小工具（1.1 多米 2026-10-31）
            if CloudLink.shared.store === self {
                CloudLink.shared.pushSoon() // 存檔成功才把改過的紙傳上 iCloud
            }
        } else if !saveFailed {
            // 存不進去時字還在記憶體裡，下次有改動或進背景會再存一次；但這時把 app 關掉就會不見，要講清楚。
            // 打字中每 0.25 秒會再存一次：失敗只報一次，成功存回去之後再失敗才再報
            saveFailed = true
            notice = Notice(title: Words.saveFailTitle, body: Words.saveFailBody)
        }
    }

    /// 整份換掉（iCloud 合併、記下傳過的記號）
    func replaceBook(_ next: Notebook) {
        book = next
    }

    /// 讀完資料後呼叫一次
    func adopt(_ book: Notebook, last: String?) {
        self.book = book
        // 上次那張；不在了就是最近改過的那張（1.1 根畫面同一條規則）
        currentID = last.flatMap { id in book.note(id).flatMap { $0.deleted ? nil : id } }
            ?? book.notes.filter { !$0.deleted }.max { $0.updated < $1.updated }?.id
        loaded = true
    }
}

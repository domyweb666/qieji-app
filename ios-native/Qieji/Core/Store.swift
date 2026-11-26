import Foundation
import SwiftUI

/// 整個 app 只有一份資料。畫面改資料一律走這裡的方法：改完畫面重畫、稍後存檔。
final class Store: ObservableObject {
    private(set) var book: Notebook {
        willSet {
            if !quiet {
                objectWillChange.send()
            }
        }
        didSet {
            if !quiet {
                onBook()
            }
        }
    }

    /// 這次換的東西畫面上看不到（同步用的指紋與時間）：不叫畫面重畫
    private var quiet = false
    /// 資料換了馬上叫（目錄開著時照新的排）
    var onBook: () -> Void = {}
    /// 換紙了馬上叫（目錄開著時框到新的那張）
    var onCurrent: () -> Void = {}
    @Published private(set) var currentID: String? {
        didSet { onCurrent() }
    }

    /// 提示條自己一份（跟 fab 一樣）：出現、收起只重畫提示條，不叫紙跟著重算
    let toasts = Toasts()
    var toast: Toast? {
        get { toasts.now }
        set { toasts.now = newValue }
    }

    /// 要人讀完的訊息（會丟字的錯誤）：系統提示框、一顆按鈕，不像提示條會自己消失（1.1 06-首次體驗 ❓7）
    @Published var notice: Notice?
    private var saveFailed = false
    private var saveTurn = 0 // 第幾次存檔
    private var savedTurn = 0 // 最新有結果的是第幾次

    struct Notice: Equatable {
        let title: String
        let body: String
        var offer = false // 給「從空的開始」
    }

    /// 要紙升起輸入框（開了新的一張、控制中心按了「記一行」）：每要一次加一
    @Published var composeAsk = 0
    private var composePending = false
    /// 右下 ＋ 被按了一下（＋ 畫在紙外面，換紙時不跟著閃）：每按一次加一，紙自己決定開不開輸入框。
    /// 自己一份（跟 fab 一樣）：按下去只有紙上看著它的小 modifier 醒來，紙和根畫面不會因為 store 變了先多重算一次
    let plus = Plus()
    /// 從搜尋點一行過來（1.1 openAt／takeSeek）：換到那張，紙捲到那一行、亮一下。紙拿一次就清掉
    var seek: String?
    @Published var seekAsk = 0
    /// VoiceOver 在目錄的「改名字」（1.1 requestRename）：換到那張，清單名變成可以打字
    var renameID: String?
    @Published var renameAsk = 0
    /// 右下 ＋ 要不要畫（紙依自己的狀態說：鍵盤、輸入框、選單開著就不畫）。自己一份：變的時候只重畫 ＋，不叫整個畫面重畫
    let fab = Fab()
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

    /// 分享進來（StoreInbox）：收件匣在哪。只有真的 app 才接 App Group，假資料、測試不碰
    var inbox = ShareInbox.off
    let inboxGate = InboxGate()
    let inboxBad = InboxBad()
    var inboxPut: [String: String] = [:] // 這次打開併進去、還沒確定存好的：行 id → 哪一張
    var inboxKept: Set<String> = [] // 這次打開已經有著落的行 id（存進去過、使用者自己刪掉）：不准再加
    var inboxTurn = 0 // 清除所有資料一次加一：清之前讀到的不算
    var inboxHold: () -> Bool = { false } // 手上正在拖東西：先不併
    var targetsSent: [ShareTarget]? // 上次推出去的紙單（nil＝還沒推過）
    var landed: (note: String, line: String)? // 剛併進正在看的那張的最上面一行：紙拿去亮一下
    /// iCloud 上有、這台還沒有最新那份的紙（CloudLink 每拉一輪告訴一次，沒在同步就是空的）。分享進來的字先不放進去
    var cloudBehind: Set<String> = []
    var inboxHeld: [String: Double] = [:] // 收件匣裡在等那張下載好的（第一行 id）→ 這次打開第一次等的時間（毫秒）

    @Published private(set) var loaded = false
    /// 這次打開不准寫檔（原本的存檔讀不到、或沒能先備份）。回到前景再試（thaw）
    var frozen = false
    var unreadTries = 0 // 連續第幾次打開讀不到
    @Published var startOverAsk = false // 正在問「要從空的開始嗎？」

    let disk: Disk?
    private var saveTask: DispatchWorkItem?
    private var showTask: DispatchWorkItem? // 打字停下來之後重畫一次
    /// 存檔前在背景先把指紋算好（千行的紙一張要十幾毫秒，在主執行緒算會卡一格）
    private static let warmQueue = DispatchQueue(label: "org.domyweb.qieji.print", qos: .userInitiated)

    final class Fab: ObservableObject {
        @Published var shown = false
    }

    final class Plus: ObservableObject {
        @Published var asks = 0
    }

    final class Toasts: ObservableObject {
        @Published var now: Toast?
    }

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

    /// 改一張紙（沒講就是現在這張）。touch＝算不算「改過」（會動修改時間）。
    /// 紙上的行一律講明是哪一張：刪除的行滑出途中換了紙，也要刪到原本那張
    func editCurrent(_ noteID: String? = nil, touch: Bool = true, _ change: (inout Note) -> Void) {
        guard let id = noteID ?? currentID, let idx = book.index(id) else { return }
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
        if !frozen {
            disk?.rememberLast(id)
        }
        pushWidgetSoon()
        if let leaving, leaving != id {
            PerfMeter.time("tidy") {
                keepDraft(in: leaving)
                tidy(leaving)
            }
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

    /// 一行打字（每個字叫一次）。字在輸入框裡已經看得到，不叫整個畫面重畫（1.1 touch(quiet)）；停一下才重畫一次（時間列、選單）
    func setText(_ itemID: String, _ text: String, in noteID: String? = nil) {
        quietly {
            editCurrent(noteID) { note in
                guard let idx = note.items.firstIndex(where: { $0.id == itemID }), note.items[idx].text != text else { return }
                note.items[idx].text = text
            }
        }
    }

    /// 改了但先不重畫：停手一下再重畫一次
    func quietly(_ change: () -> Void) {
        quiet = true
        change()
        quiet = false
        showTask?.cancel()
        let task = DispatchWorkItem { [weak self] in self?.objectWillChange.send() }
        showTask = task
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Timing.saveDebounce, execute: task)
    }

    func toggle(_ itemID: String, in noteID: String? = nil) {
        var struck = false
        editCurrent(noteID) { note in
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
    func binLine(_ itemID: String, in paper: String? = nil) {
        guard let note = (paper ?? currentID).flatMap({ book.note($0) }),
              let at = note.items.firstIndex(where: { $0.id == itemID }) else { return }
        let noteID = note.id
        if Labels.trim(note.items[at].text).isEmpty {
            editCurrent(noteID) { $0.items.remove(at: at) }
            return
        }
        editCurrent(noteID) { _ = Lines.bin(&$0, itemID, now: Clock.now()) }
        toast = Toast(text: Words.movedToTrash) { [weak self] in
            guard let self else { return }
            // 這幾秒內又記滿 1000 行：放不回去，行還在最近刪除（1.1 remove 的復原同一條）
            guard book.note(noteID).map({ Lines.room($0) > 0 }) ?? false else {
                DispatchQueue.main.async { self.toast = Toast(text: Words.full(Lines.max)) }
                return
            }
            edit { book in
                guard let idx = book.index(noteID) else { return }
                _ = Lines.unbin(&book.notes[idx], itemID, at: at)
            }
        }
    }

    /// 打字打到空的就離開那一行：直接拿掉（沒有字，不進最近刪除）
    func dropIfEmpty(_ itemID: String, in noteID: String? = nil) {
        guard let note = (noteID ?? currentID).flatMap({ book.note($0) }), let item = note.items.first(where: { $0.id == itemID }),
              item.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        editCurrent(note.id, touch: false) { $0.items.removeAll { $0.id == itemID } }
    }

    func move(_ itemID: String, to target: Int, in noteID: String? = nil) {
        editCurrent(noteID) { note in
            guard let from = note.items.firstIndex(where: { $0.id == itemID }) else { return }
            let item = note.items.remove(at: from)
            note.items.insert(item, at: max(0, min(target, note.items.count)))
        }
    }

    /// 游標在最前面按 Backspace：空的一行＝這行拿掉、游標回到上一行最後面；有字的行＝沒反應，不併到別則（QC-0001，推翻 1.1 A5 的併行）。
    /// 回傳游標要去的那行 id 和位置（上一行有幾個字）；沒接手回 nil
    func joinUp(_ itemID: String, text: String, in noteID: String? = nil) -> (id: String, at: Int)? {
        guard let note = (noteID ?? currentID).flatMap({ book.note($0) }), let at = note.items.firstIndex(where: { $0.id == itemID }),
              at > 0, text.isEmpty else { return nil }
        let prev = note.items[at - 1]
        editCurrent(note.id) { $0.items.remove(at: at) }
        return (prev.id, (prev.text as NSString).length)
    }

    // MARK: 存檔（稍後存：打字中每次改字都會叫到）

    private func scheduleSave() {
        guard disk != nil else { return }
        saveTask?.cancel()
        let task = DispatchWorkItem { [weak self] in self?.warmThenSave() }
        saveTask = task
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Timing.saveDebounce, execute: task)
    }

    /// 冷啟動讀完：不等、照平常的存法（指紋背景先算、背景寫，內容沒變就不寫）。
    /// 算完之前又改了字就交給那一趟；進背景的 flush() 會取消這一趟、當場寫
    func saveAfterBoot() {
        guard disk != nil else { return }
        saveTask?.cancel()
        saveTask = DispatchWorkItem {}
        warmThenSave()
    }

    /// 指紋在背景算好（記在 PrintCache）再存。算的時候又改了、或已經馬上存過：這一趟不用存
    private func warmThenSave() {
        guard let task = saveTask, !task.isCancelled else { return }
        let notes = book.notes
        Store.warmQueue.async {
            for note in notes {
                _ = PrintCache.shared.print(of: note)
            }
            DispatchQueue.main.async { [weak self] in
                guard let self, saveTask === task, !task.isCancelled else { return }
                saveSoon()
            }
        }
    }

    /// 平常的存檔：編碼和寫檔在背景做，不卡打字和捲動。done＝寫進檔案的那一份（沒寫成、現在不能存是 nil），在主執行緒叫
    func saveSoon(_ done: @escaping (Notebook?) -> Void = { _ in }) {
        guard let disk, readyToSave() else {
            done(nil)
            return
        }
        let turn = saveTurn, sent = book
        disk.writeLater(sent) { [weak self] saved in
            self?.saveDone(saved, turn: turn)
            done(saved ? sent : nil)
        }
    }

    /// 馬上存、存完才回來（進背景時叫）。背景還沒寫完的排在前面，最後留在檔案裡的一定是這一份
    func flush() {
        guard let disk, readyToSave() else { return }
        saveDone(disk.write(book), turn: saveTurn)
    }

    /// 存檔前：變過的紙記下時間與指紋、排列補齊。沒變就不換 book；只變指紋不叫畫面重畫
    private func readyToSave() -> Bool {
        saveTask?.cancel()
        guard loaded, !frozen else { return false }
        saveTurn += 1
        var copy = book
        let stamped = PerfMeter.time("stamp") { Sync.stampMods(&copy, now: Clock.now()) > 0 }
        let moved = PerfMeter.time("fixOrder") { Seats.fixOrder(&copy) }
        if stamped || moved {
            quiet = !moved
            book = copy
            quiet = false
        }
        return true
    }

    /// 存完了（或沒存成）。背景那筆的結果晚到、後面已經又存過一次：只認新的
    private func saveDone(_ saved: Bool, turn: Int) {
        guard turn > savedTurn else { return }
        savedTurn = turn
        if saved {
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

    /// 只換了畫面上看不到的同步記號（指紋、修改時間、上次傳上去的記號、墓碑）：不叫畫面重畫，存檔在背景。
    /// 已經排著一次存檔（打字中）就跟那一趟一起存，不提早在主執行緒算指紋
    func keepMarks(_ next: Notebook) {
        quiet = true
        book = next
        quiet = false
        saveInBackground()
    }

    /// 同步改過資料之後的存檔：排著的那一趟還沒存就交給它，不然現在在背景存一次（不在主執行緒寫檔）
    func saveInBackground() {
        if let task = saveTask, !task.isCancelled {
            return
        }
        saveSoon()
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

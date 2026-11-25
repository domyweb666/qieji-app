import Foundation

/// 整張紙的動作：開新的、改名、換色、釘選、刪除、還原、清最近刪除；以及打開 app 時讀資料。
extension Store {
    // MARK: 打開 app

    /// 讀資料（Swift 版自己的存檔；第一次會從 Expo 版搬）。只會真的做一次
    func boot() {
        guard !loaded, let disk else { return }
        let found = disk.load()
        startPrefs(found, with: disk)
        unreadTries = disk.tally(unread: found.canStartOver)
        start(found, with: disk)
    }

    /// 1.1 的設定照抄一次。1.1 的舊檔讀不到的時候沒有東西可抄：傳 nil，Prefs 自己會再找、找不到就下次
    private func startPrefs(_ found: Disk.Loaded, with disk: Disk) {
        Prefs.shared.start(
            old: found.source == .legacy && !found.legacy.isEmpty ? found.legacy : nil,
            fresh: found.source == .fresh, dirs: disk.legacyDirs
        )
    }

    /// 讀不到、這次不准寫檔的時候：回到前景再讀一次。讀到了，中間記的字跟著帶過去一起存
    func thaw() {
        guard loaded, frozen, let disk else { return }
        let found = disk.load()
        guard !found.frozen else {
            tellUnread(found)
            return
        }
        resume(found, with: disk)
    }

    /// 連續好幾次讀不到、使用者確認要從空的開始：原檔移到旁邊留著，中間記的字接著用。
    /// 先再讀一次：讀得到就照 thaw，什麼都不移。回傳現在能不能存了
    func startOver() -> Bool {
        guard loaded, frozen, let disk else { return false }
        let found = disk.load()
        guard found.frozen else {
            resume(found, with: disk)
            return true
        }
        var next = found
        next.book.notes = takeTyped()
        // 1.1 的舊檔讀得到、只是備份不成（多半是空間不夠）：清出空間就搬得了，不走這條
        guard found.canStartOver, disk.setAside(for: next.book) else {
            notice = Notice(title: Words.startOverFailTitle, body: Words.startOverFailBody)
            return false
        }
        // unreadable 照舊：跟另存過、從空的用起一樣，不替空的這份認領排列（ownLayout）
        next.frozen = false
        unreadTries = disk.tally(unread: false)
        start(next, with: disk)
        notice = nil
        // 1.1 的設定也讀不到的：同步先關著
        let syncOff = found.source == .legacy && Prefs.shared.giveUpImport()
        toast = Toast(text: syncOff && isFull ? Words.startedOverSyncOff : Words.startedOver)
        return true
    }

    /// 讀到了：換成讀到的那份，中間記的字接在後面
    private func resume(_ found: Disk.Loaded, with disk: Disk) {
        let typed = takeTyped()
        unreadTries = disk.tally(unread: false)
        toast = nil
        notice = nil
        startOverAsk = false // 問到一半就讀到了：不用問了
        startPrefs(found, with: disk)
        start(found, with: disk, adding: typed)
        if !typed.isEmpty, !found.unreadable {
            toast = Toast(text: Words.typedKept)
        }
    }

    /// 讀不到的時候使用者自己記的紙（空白的不算）。打到一半的先記進去
    private func takeTyped() -> [Note] {
        if let currentID {
            keepDraft(in: currentID)
        }
        return book.notes.filter { !Labels.isEmpty($0) || !$0.bin.isEmpty || $0.cover != nil }
    }

    private func start(_ read: Disk.Loaded, with disk: Disk, adding typed: [Note] = []) {
        var found = read
        if found.source != .fresh, !found.unreadable {
            Seats.ownLayout(&found.book)
            Seats.packGrid(&found.book, now: Clock.now())
        }
        frozen = found.frozen
        if !frozen {
            disk.seedRecent(found.recent, last: found.last)
        }
        found.book.notes += typed
        adopt(found.book, last: found.last)
        tellUnread(found)
        purgeTrash()
        flush()
    }

    /// 已經另存的：先講沒有損失，再講紙會從哪裡回來。沒另存成的不准說另存了
    private func tellUnread(_ found: Disk.Loaded) {
        // 正在問要不要從空的開始：不疊一個上去
        guard found.unreadable, !(found.frozen && startOverAsk) else { return }
        let offer = found.canStartOver && unreadTries >= Disk.offerAfter
        notice = found.frozen
            ? Notice(title: Words.unreadTitle, body: offer ? Words.unreadOfferBody : Words.unreadBody, offer: offer)
            : Notice(title: Words.unreadableTitle, body: Words.unreadableBody)
    }

    /// 最近刪除 30 天自動清：打開 app、回到前景各跑一次。清掉的紙立墓碑（不然同步會從另一台把它帶回來）
    func purgeTrash(now: Double = Clock.now()) {
        guard loaded else { return }
        edit { book in
            _ = Trash.stampOld(&book.notes, now: now)
            _ = Trash.stampOldBin(&book.notes, now: now)
            Sync.dropNotes(&book, now: now) { Trash.isExpired($0, now: now) }
            _ = Trash.purgeBin(&book.notes, now: now)
        }
        ensureCurrent()
    }

    /// 現在這張不見了（被刪、被同步拿掉）就換到最近改過的那張；一張都沒有就開一張新的（1.1 根畫面同一條規則）
    func ensureCurrent() {
        if let note = current, !note.deleted {
            return
        }
        openLatest()
    }

    /// 換到最近改過的那張；一張都沒有就開一張新的（不升輸入框）
    func openLatest() {
        if let latest = book.notes.filter({ !$0.deleted }).max(by: { $0.updated < $1.updated }) {
            open(latest.id)
        } else {
            newNote(compose: false)
        }
    }

    /// 換到上一張看的（最近開過、還在的）；沒有紀錄就換到最近改過的那張
    func openPrevious() {
        if let back = disk?.recent.first(where: { $0 != currentID && book.note($0)?.deleted == false }) {
            open(back)
        } else {
            openLatest()
        }
    }

    // MARK: 一張紙

    /// 開新的一張（預設玉米黃），放進目錄第一個空位，沒有空位就排最後。compose＝打開後直接升起輸入框。回傳新紙的 id
    @discardableResult
    func newNote(color: String = "yellow", compose: Bool = true) -> String {
        let now = Clock.now()
        let note = Note.blank(color: color, now: now)
        edit { book in
            book.notes.append(note)
            Seats.seatFirstHole(&book, noteID: note.id, now: now)
        }
        open(note.id)
        if compose {
            requestCompose()
        }
        return note.id
    }

    /// 離開一張完全空白的紙：直接拿掉，目錄不留空格。
    /// 比 1.1 多兩條保護：最近刪除裡還有它刪掉的行、或放了封面圖，就留著（1.1 會連那些行一起拿掉）
    func dropIfBlank(_ id: String) {
        guard let note = book.note(id), !note.deleted, Labels.isEmpty(note), note.bin.isEmpty, note.cover == nil else { return }
        edit { book in Sync.dropNotes(&book, now: Clock.now()) { $0.id == id } }
    }

    /// 離開一張紙時收尾（1.1 closeNote）：空行拿掉（不進最近刪除、不動修改時間），整張空白就不留
    func tidy(_ id: String) {
        guard let note = book.note(id), !note.deleted else { return }
        if note.items.contains(where: { Labels.trim($0.text).isEmpty }) {
            editNote(id, touch: false) { $0.items.removeAll { Labels.trim($0.text).isEmpty } }
        }
        dropIfBlank(id)
    }

    /// 打清單名（每打一個字叫一次）：換行換成空格；頭尾空白不修（打到一半的空格要留著，畫面上的名字另外修）
    func setTitle(_ id: String, _ text: String) {
        let clean = text.replacingOccurrences(of: "\n", with: " ")
        guard book.note(id)?.title != clean else { return }
        editNote(id) { $0.title = clean }
    }

    /// 清除所有資料（1.1 片 F2，多米 2026-11-14 定：只清這支手機）：紙、最近刪除、目錄排列、資料夾全部拿掉，回到剛裝好的樣子（一張教學紙）。
    /// 分享進來還沒併的字、共用區裡那張的名字也一起清（2.1）。
    /// 整份換成新的，不立墓碑：墓碑會在之後重新打開同步時傳上去，把 iCloud 和別台的紙也刪掉。iCloud 雲碟裡的檔案這裡完全不碰。
    /// 呼叫的人要先把 iCloud 同步關掉。回傳有沒有清乾淨、存成功
    func wipe() -> Bool {
        guard loaded, let disk, !frozen, disk.wipe(), wipeInbox() else { return false }
        var fresh = Notebook()
        fresh.grid = Seats.gridCols // 跟新裝的一樣（見 Disk）
        let first = Tutorial.note(now: Clock.now())
        fresh.notes = [first]
        Seats.fixOrder(&fresh)
        draft = ""
        toast = nil
        replaceBook(fresh)
        open(first.id)
        return disk.write(fresh)
    }

    /// 記事本的內文（每打一個字叫一次）
    func setBody(_ id: String, _ text: String) {
        guard let old = book.note(id)?.body, old != text else { return }
        // 打字不叫整個畫面重畫；從空的變有字（或反過來）提示字要換，照樣重畫
        guard old.isEmpty == text.isEmpty else {
            editNote(id) { $0.body = text }
            return
        }
        quietly { editNote(id) { $0.body = text } }
    }

    /// 開新的記事本（完整版）：玉米黃、放進目錄第一個空位，打開後游標直接在裡面
    @discardableResult
    func newPad() -> String {
        let now = Clock.now()
        var note = Note.blank(color: "yellow", now: now)
        note.kind = "text"
        edit { book in
            book.notes.append(note)
            Seats.seatFirstHole(&book, noteID: note.id, now: now)
        }
        open(note.id)
        requestCompose()
        return note.id
    }

    func rename(_ id: String, _ name: String) {
        let clean = name.replacingOccurrences(of: "\n", with: " ")
        editNote(id) { $0.title = Labels.trim(clean) }
    }

    func setColor(_ id: String, _ color: String) {
        guard NoteColor.isKey(color) else { return }
        editNote(id) { $0.color = color }
    }

    func togglePin(_ id: String) {
        editNote(id, touch: false) { $0.pinned.toggle() }
    }

    /// 釘選／取消釘選（1.1 pin.ts，紙的 ⋯ 和目錄長按共用）：取消直接取消；沒滿直接釘；
    /// 釘滿（5 張）不動，回傳現在釘著的那幾張，讓畫面問要換掉哪一張
    func pinOrAsk(_ id: String) -> [Note]? {
        guard let note = book.note(id) else { return nil }
        if note.pinned {
            editNote(id) { $0.pinned = false }
            toast = Toast(text: Words.unpinned)
            return nil
        }
        let pins = Seats.pinned(book)
        if pins.count < Seats.pinMax {
            editNote(id) { $0.pinned = true }
            toast = Toast(text: Words.pinned)
            return nil
        }
        return pins
    }

    /// 釘滿時換掉一張（1.1 swapPin）：換掉的那張不動修改時間，目錄裡位置不跳；可以復原
    func swapPin(_ id: String, out: String) {
        let name = book.note(out).map(Labels.pickLabel) ?? ""
        edit { book in
            guard let new = book.index(id), let old = book.index(out) else { return }
            book.notes[old].pinned = false
            book.notes[new].pinned = true
            book.notes[new].updated = Clock.now()
        }
        toast = Toast(text: Words.swappedPin(name)) { [weak self] in
            self?.edit { book in
                guard let new = book.index(id), let old = book.index(out) else { return }
                book.notes[old].pinned = true
                book.notes[new].pinned = false
            }
        }
    }

    /// 清掉劃掉的行：進這張紙的最近刪除，幾秒內可以復原
    func clearDone(_ id: String) {
        guard let note = book.note(id) else { return }
        let before = note.items
        var gone: [Item] = []
        editNote(id) { gone = Lines.binDone(&$0, now: Clock.now()) }
        guard !gone.isEmpty else { return }
        let ids = Set(gone.map(\.id))
        toast = Toast(text: Words.cleared(gone.count)) { [weak self] in
            self?.editNote(id) { _ = Lines.unbinDone(&$0, before: before, ids: ids) }
        }
    }

    /// ⋯「上下順序反轉」
    func reverseLines(_ id: String) {
        editNote(id) { $0.items.reverse() }
    }

    /// ⋯「全部恢復」：劃掉的行全部恢復
    func unstrikeAll(_ id: String) {
        editNote(id) { note in
            for idx in note.items.indices {
                note.items[idx].done = false
            }
        }
    }

    /// 刪除這張（1.1 del、目錄的「−」）：進最近刪除、目錄那格留空位、順便取消釘選、空行拿掉；整張空白就直接拿掉、不提示。
    /// 刪的是現在這張就換到上一張看的（QC-0002，推翻 1.1 換到最近改過的那張）。reopen＝復原時回到這張
    func trashNote(_ id: String, reopen: Bool = false) {
        guard let note = book.note(id), !note.deleted else { return }
        let wasPinned = note.pinned
        let now = Clock.now()
        edit { book in
            guard let idx = book.index(id) else { return }
            Seats.leaveHole(&book, noteID: id, now: now)
            Trash.markDeleted(&book.notes[idx], now: now)
            book.notes[idx].pinned = false
            book.notes[idx].items.removeAll { Labels.trim($0.text).isEmpty }
            let gone = book.notes[idx]
            if Labels.isEmpty(gone), gone.bin.isEmpty, gone.cover == nil {
                Sync.dropNotes(&book, now: now) { $0.id == id }
            }
        }
        if currentID == id {
            openPrevious()
        }
        guard book.note(id) != nil else { return }
        toast = Toast(text: Words.movedToTrash) { [weak self] in
            self?.restoreNote(id, repin: wasPinned, reopen: reopen)
        }
    }

    /// 從最近刪除還原：站回目錄原本那格。repin＝刪之前是釘選的就釘回去（這幾秒內又釘滿了就不擠掉別張）
    func restoreNote(_ id: String, repin: Bool = false, reopen: Bool = false) {
        let now = Clock.now()
        edit { book in
            guard let idx = book.index(id) else { return }
            Trash.markRestored(&book.notes[idx])
            if repin, Seats.pinned(book).count < Seats.pinMax {
                book.notes[idx].pinned = true
            }
            Seats.fillHole(&book, noteID: id, now: now)
        }
        if reopen {
            open(id)
        }
    }

    /// 永久刪除（不可逆）：拿掉、立墓碑
    func deleteForever(_ id: String) {
        edit { book in Sync.dropNotes(&book, now: Clock.now()) { $0.id == id && $0.deleted } }
    }

    func emptyTrash() {
        edit { book in
            Sync.dropNotes(&book, now: Clock.now()) { $0.deleted }
            for idx in book.notes.indices {
                book.notes[idx].bin = []
            }
        }
    }

    /// 最近刪除裡的一行放回它那張紙的最上面
    func restoreLine(noteID: String, itemID: String) {
        guard let note = book.note(noteID) else { return }
        guard Lines.room(note) > 0 else { toast = Toast(text: Words.full(Lines.max)); return }
        editNote(noteID) { _ = Lines.unbin(&$0, itemID) }
    }

    func deleteLineForever(noteID: String, itemID: String) {
        editNote(noteID, touch: false) { $0.bin.removeAll { $0.id == itemID } }
    }

    func editNote(_ id: String, touch: Bool = true, _ change: (inout Note) -> Void) {
        edit { book in
            guard let idx = book.index(id) else { return }
            change(&book.notes[idx])
            if touch {
                book.notes[idx].updated = Clock.now()
            }
        }
    }
}

extension Store {
    /// 改磚上的字：只收一個字，清空＝回到用名字的第一個字
    func setGlyph(_ id: String, _ text: String) {
        editNote(id, touch: false) { _ = Labels.setGlyph(&$0, text) }
    }
}

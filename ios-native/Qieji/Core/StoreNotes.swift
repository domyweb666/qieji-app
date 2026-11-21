import Foundation

/// 整張紙的動作：開新的、改名、換色、釘選、刪除、還原、清最近刪除；以及打開 app 時讀資料。
extension Store {
    // MARK: 打開 app

    /// 讀資料（Swift 版自己的存檔；第一次會從 Expo 版搬）。只會真的做一次
    func boot() {
        guard !loaded, let disk else { return }
        var found = disk.load()
        if found.source != .fresh, !found.unreadable {
            Seats.ownLayout(&found.book)
            Seats.packGrid(&found.book, now: Clock.now())
        }
        frozen = found.frozen
        disk.seedRecent(found.recent, last: found.last)
        adopt(found.book, last: found.last)
        if found.unreadable {
            toast = Toast(text: Words.unreadable)
        }
        purgeTrash()
        flush()
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

    /// 現在這張不見了（被刪、被同步拿掉）就換到目錄第一張；一張都沒有就開一張新的
    func ensureCurrent() {
        if let note = current, !note.deleted {
            return
        }
        if let first = Seats.seatedNotes(book).first {
            open(first.id)
        } else {
            newNote()
        }
    }

    // MARK: 一張紙

    /// 開新的一張（預設玉米黃），放進目錄第一個空位，沒有空位就排最後。回傳新紙的 id
    @discardableResult
    func newNote(color: String = "yellow") -> String {
        let now = Clock.now()
        let note = Note.blank(color: color, now: now)
        edit { book in
            book.notes.append(note)
            Seats.seatFirstHole(&book, noteID: note.id, now: now)
        }
        open(note.id)
        requestCompose()
        return note.id
    }

    /// 離開一張完全空白的紙：直接拿掉，目錄不留空格
    func dropIfBlank(_ id: String) {
        guard let note = book.note(id), !note.deleted, Labels.isEmpty(note), note.bin.isEmpty, note.cover == nil else { return }
        edit { book in Sync.dropNotes(&book, now: Clock.now()) { $0.id == id } }
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

    /// 清掉劃掉的行：進這張紙的最近刪除，幾秒內可以復原
    func clearDone(_ id: String) {
        guard let note = book.note(id) else { return }
        let before = note.items
        var gone: [Item] = []
        editNote(id) { gone = Lines.binDone(&$0, now: Clock.now()) }
        guard !gone.isEmpty else { return }
        let ids = Set(gone.map(\.id))
        toast = Toast(text: Words.cleared) { [weak self] in
            self?.editNote(id) { _ = Lines.unbinDone(&$0, before: before, ids: ids) }
        }
    }

    /// 刪除這張：進最近刪除，目錄原本那格留空位（還原時站回去）
    func trashNote(_ id: String) {
        let now = Clock.now()
        edit { book in
            guard let idx = book.index(id) else { return }
            Seats.leaveHole(&book, noteID: id, now: now)
            Trash.markDeleted(&book.notes[idx], now: now)
        }
        ensureCurrent()
        toast = Toast(text: Words.noteDeleted) { [weak self] in self?.restoreNote(id) }
    }

    func restoreNote(_ id: String) {
        let now = Clock.now()
        edit { book in
            guard let idx = book.index(id) else { return }
            Trash.markRestored(&book.notes[idx])
            Seats.fillHole(&book, noteID: id, now: now)
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

import UIKit

/// 震動回饋
enum Haptic {
    static func tick() {
        UISelectionFeedbackGenerator().selectionChanged()
    }

    static func menu() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    static func lift() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    static func pass() {
        UISelectionFeedbackGenerator().selectionChanged()
    }

    static func land() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
}

extension Store {
    /// 開新的一張（玉米黃）放進目錄指定的位置；不換紙、不開輸入框。回傳新紙的 id
    func makeNote(hole: String?, after: String?) -> String {
        let now = Clock.now()
        let note = Note.blank(color: "yellow", now: now)
        edit { book in
            book.notes.append(note)
            if hole != nil || after != nil {
                Seats.seatNew(&book, noteID: note.id, now: now, hole: hole, after: after)
            }
        }
        return note.id
    }

    /// 把現在這張紙的一行搬到另一張的最上面。那張滿了回 false（提示已經跳了）；其他情況回 true
    func moveLine(_ itemID: String, to target: String) -> Bool {
        guard let from = current, from.id != target, let dest = book.note(target),
              let item = from.items.first(where: { $0.id == itemID }) else { return true }
        guard Lines.room(dest) > 0 else {
            toast = Toast(text: Words.full(Lines.max))
            return false
        }
        let now = Clock.now()
        let fromID = from.id
        edit { book in
            guard let source = book.index(fromID), let goal = book.index(target) else { return }
            book.notes[source].items.removeAll { $0.id == itemID }
            book.notes[source].updated = now
            book.notes[goal].items.insert(item, at: 0)
            book.notes[goal].updated = now
        }
        toast = Toast(text: Words.movedTo(Labels.label(dest)))
        return true
    }
}

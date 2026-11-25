import Foundation

/// 輸入框貼上好幾行時的「拆成 N 行」（多米 2026-11-25 選 F2 甲）：按了才拆，不按照舊是一則
extension Store {
    /// 拆成好幾行放到現在這張最上面，照原本順序。回傳新行的 id（由上到下）；
    /// 拆不出兩行、這張放不下就不做（字還在輸入框裡，不會丟），回 nil
    func addSplit(_ text: String) -> [String]? {
        let lines = Lines.splitPasted(text)
        guard lines.count >= 2, let note = current else { return nil }
        guard Lines.room(note) >= lines.count else {
            toast = Toast(text: Words.splitNoRoom(Lines.room(note)))
            return nil
        }
        let fresh = lines.map { Item(text: $0) }
        editCurrent(note.id) { $0.items.insert(contentsOf: fresh, at: 0) }
        let whole = Labels.trim(text), noteID = note.id
        toast = Toast(text: Words.splitDone(fresh.count)) { [weak self] in
            self?.undoSplit(fresh, whole: whole, in: noteID)
        }
        return fresh.map(\.id)
    }

    /// 復原＝變回沒拆的那一則，放在拆出來的第一行的位置。有一行被改過、劃掉、刪掉、搬走就不動（不拿舊的蓋新的）
    private func undoSplit(_ fresh: [Item], whole: String, in noteID: String) {
        let ids = Set(fresh.map(\.id))
        guard let note = book.note(noteID), !note.deleted,
              let first = note.items.firstIndex(where: { ids.contains($0.id) }),
              fresh.allSatisfy({ note.items.contains($0) })
        else {
            // 提示條按完會自己收：下一輪再跳這一句
            DispatchQueue.main.async { self.toast = Toast(text: Words.splitKept) }
            return
        }
        editCurrent(noteID) { note in
            note.items.removeAll { ids.contains($0.id) }
            note.items.insert(Item(text: whole), at: first)
        }
    }
}

import SwiftUI

/// 按住一行的選單：開、收、每一項做什麼
extension PaperView {
    /// 那一行按住的當下已經拍好、位置記好了，這裡才收鍵盤
    func openRowMenu(_ grab: RowGrab) {
        KeyboardWatch.dismiss()
        guard let item = note.items.first(where: { $0.id == grab.id }) else { return }
        rowMenu = RowMenuAsk(grab: grab, items: rowItems(grab.id), born: PaperView.bornText(item))
    }

    /// 選單最下面那行小字；空行、讀不出時間就沒有
    static func bornText(_ item: Item) -> String? {
        guard !Labels.trim(item.text).isEmpty, let born = Ident.born(item.id) else { return nil }
        return Words.bornAt(Dates.full(born))
    }

    /// 選了一項：當下就做，選單同時收
    func pickRowMenu(_ item: MenuItem) {
        guard rowMenuOpen else { return }
        rowMenu?.picked = true
        item.run()
        closeRowMenu(item.after)
    }

    /// 浮起的那一份、卡片、霧一起收。馬上就碰得到後面，動畫走完才把整層拿掉
    func closeRowMenu(_ after: MenuItem.After = .home) {
        guard let ask = rowMenu, ask.exit == nil else { return }
        let list = remote.list, id = ask.grab.id
        if after == .redraw {
            list?.refresh()
            if let row = list?.live[id] {
                ask.grab.lift.reshoot(row)
            }
        }
        rowMenu?.exit = after == .fade ? .fade : RowExit.back(from: ask.grab.top, to: list?.seenTop(id))
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Motion.menuGoneSeconds) {
            if rowMenu?.token == ask.token {
                rowMenu = nil
            }
        }
    }

    /// 選單開著（收的途中不算）
    var rowMenuOpen: Bool {
        rowMenu.map { $0.exit == nil } ?? false
    }

    /// 選單開著時那一行被同步拿掉了
    var rowMenuLost: Bool {
        guard let ask = rowMenu, ask.exit == nil else { return false }
        return !note.items.contains { $0.id == ask.grab.id }
    }

    /// 項目照 1.1 rowActs：劃掉／恢復、搬到…、複製、刪除；空行只剩刪除
    func rowItems(_ id: String) -> [MenuItem] {
        guard let item = note.items.first(where: { $0.id == id }) else { return [] }
        let remove = MenuItem(label: Words.delete, icon: "trash", destructive: true, after: .fade) { fadeThenBin(id) }
        guard !Labels.trim(item.text).isEmpty else { return [remove] }
        return [
            MenuItem(
                label: item.done ? Words.unstrike : Words.strike,
                icon: item.done ? "arrow.uturn.backward" : "strikethrough", after: .redraw
            ) {
                store.toggle(id)
                Haptic.tick()
            },
            MenuItem(label: Words.moveTo, icon: "arrow.turn.up.right") { onMoveLine(id) },
            MenuItem(label: Words.copy, icon: "doc.on.doc") {
                UIPasteboard.general.string = item.text
                store.toast = Store.Toast(text: Words.copied)
            },
            remove,
        ]
    }

    /// 從選單刪一行：先淡出（0.15 秒），淡完才拿掉
    private func fadeThenBin(_ id: String) {
        let paper = note.id
        guard let list = remote.list else {
            store.binLine(id, in: paper)
            return
        }
        list.fadeOut(id) { store.binLine(id, in: paper) }
    }
}

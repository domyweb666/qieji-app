import SwiftUI
import UIKit

/// 拖磚放手之後改資料（從 DirModel+Drag 分出來的後半段）。規則照 Expo 版 DirPanel.tsx 的 drop。
extension DirModel {
    // MARK: 放手之後改資料

    /// 在打開的資料夾框裡＝放進那格（資料夾裡換順序也是這條）；準備疊了＝疊；目錄＝整排照放手當下的格子存回座位表。
    /// 資料夾開著但在框外放手：從資料夾拿的移出去，從目錄拿的回原位
    func drop() {
        for work in [aimWork, leaveWork, edgeWork, folderEdgeWork] {
            work?.cancel()
        }
        leaveWork = nil
        let now = drag
        let stamp = Clock.now()
        let row = now.map { flat($0) } ?? []
        let onto = stackOn.flatMap { id in row.first { $0.entry.id == id }?.entry }
        var into: String?
        var keepOpen = false
        if let now, let fid = now.inFolder {
            keepOpen = dropInFolder(now, folder: fid, stamp: stamp)
        } else if let now, let onto {
            into = dropOnto(now, onto: onto, stamp: stamp)
        } else if let now, now.cells != nil {
            let ids = row.map(\.entry.id), before = entries.map(\.id)
            if now.source != nil {
                store.edit { book in Seats.placeTop(&book, noteID: now.id, visible: ids, now: stamp) }
            } else if ids != before {
                store.edit { book in Seats.reseat(&book, visible: ids, now: stamp) }
            }
        }
        stackOn = nil
        stackSlot = -1
        geo.folderOpen = false
        aim = .none
        ready = false
        landing = false
        // 資料一換，版面就是落點那個樣子：這一步不要動畫，不然會閃
        var quiet = Transaction()
        quiet.disablesAnimations = true
        withTransaction(quiet) {
            setDrag(nil)
            ghost.entry = nil
            ghost.shift = .zero
            ghost.sinking = false
            ghost.lifted = false
        }
        if let into {
            pop(into)
        }
        if !keepOpen, let now, now.source != nil || now.inFolder != nil {
            openFolder = nil
        }
    }

    private func dropInFolder(_ now: DirDrag, folder fid: String, stamp: Double) -> Bool {
        if aim != .out, let entry = entries.first(where: { $0.id == fid }) {
            let ids = DirCells.folderNotes(entry, drag: now, book: store.book).map(\.id)
            store.edit { book in _ = Seats.placeInFolder(&book, noteID: now.id, folderID: fid, visible: ids, now: stamp) }
            return true
        }
        if now.source != nil, aim == .out {
            takeOut(now.id)
            return false
        }
        return now.source != nil
    }

    /// 疊成新資料夾不打開，名字先叫「新資料夾」。從資料夾拿出來的先拿出來，疊進去之後不留空位
    private func dropOnto(_ now: DirDrag, onto: Seats.Entry, stamp: Double) -> String? {
        var into: String?
        let leave = now.source == nil
        store.edit { book in
            if now.source != nil {
                Seats.outOfFolder(&book, noteID: now.id, now: stamp)
            }
            if onto.folder != nil {
                Seats.intoFolder(&book, noteID: now.id, folderID: onto.id, now: stamp, leave: leave)
                into = onto.id
            } else {
                let made = Seats.newFolder(&book, noteID: onto.id, now: stamp)
                Seats.intoFolder(&book, noteID: now.id, folderID: made.id, now: stamp, leave: leave)
                into = made.id
            }
        }
        return into
    }

    /// 有東西縮進來：那格放大一下再彈回
    func pop(_ id: String) {
        guard !calm else { return }
        popID = id
        _ = after(Tok.Motion.stackPopSeconds) { [weak self] in
            if self?.popID == id {
                self?.popID = nil
            }
        }
    }
}

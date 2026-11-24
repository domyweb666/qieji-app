import SwiftUI
import UIKit

/// 資料夾：打開、收起、改名、放進、移出
extension DirModel {
    func showFolder(_ id: String, naming: Bool = false) {
        // 收到一半又點同一個：留在同一頁，不然裡面的磚會跳一下
        if folderStage?.closing(id) != true {
            folderPage = 0
        }
        openFolder = OpenFolder(id: id, naming: naming)
    }

    func closeFolder() {
        endKeyboard()
        openFolder = nil
    }

    // MARK: 從磚放大、縮回磚

    /// 打開的資料夾放哪。手指算落點、畫面都用這個，放大途中也是定位的框
    var folderPlace: FolderPlace {
        FolderPlace(
            screen: screen, metrics: metrics, width: boxWidth, pages: FolderLook.pages(folderList.count), line: FolderPlace.line
        )
    }

    var folderBox: CGRect {
        openFolder == nil ? .zero : folderPlace.box
    }

    /// 從哪塊磚放大、縮回哪塊磚：那塊資料夾磚的方磚現在在螢幕的哪裡；不在這一頁、不在了＝nil（改淡入淡出）
    func folderHome(_ id: String) -> CGRect? {
        let shown = pages
        guard !searching, page < shown.count,
              let slot = shown[page].firstIndex(where: { $0.id == id && $0.folder != nil }) else { return nil }
        let spot = metrics.slot(slot), origin = gridOrigin, side = metrics.side
        return CGRect(x: origin.x + spot.x + (cellWidth - side) / 2, y: origin.y + spot.y, width: side, height: side)
    }

    /// 那塊磚先藏起來／放出來。直接改磚，跟框同一格換，不等 SwiftUI 重畫
    func setCover(_ id: String, _ on: Bool) {
        guard folderCovers.contains(id) != on else { return }
        if on {
            folderCovers.insert(id)
        } else {
            folderCovers.remove(id)
        }
        for grid in pageGrids.allObjects {
            grid.cover(id, on)
        }
    }

    /// 打開的資料夾要畫的東西
    func folderLook(_ entry: Seats.Entry) -> FolderLook {
        let notes = DirCells.folderNotes(entry, drag: drag, book: store.book)
        let per = DirMetrics.folderPer, pages = FolderLook.pages(notes.count), width = boxWidth, metrics = metrics
        let open = openFolder?.id == entry.id
        // 磚現在的樣子（從裡面拿一張出去的途中，磚上已經少一塊）
        let tile = self.pages.joined().first { $0.id == entry.id } ?? entry
        let slots = notes.enumerated().map { index, note in
            let spot = metrics.slot(index % per, cols: DirMetrics.folderCols)
            return DirSlot(
                entry: Seats.Entry(id: note.id, note: note, notes: [note]), index: index,
                spot: CGPoint(x: CGFloat(index / per) * width + Tok.Space.lg + spot.x, y: Tok.Space.lg + spot.y),
                current: note.id == store.currentID, editing: editing, hidden: drag?.id == note.id,
                held: open && heldID == note.id, inFolder: true
            )
        }
        return FolderLook(
            entry: entry, tile: TileFace(tile, current: tile.notes.contains { $0.id == store.currentID }),
            place: FolderPlace(screen: screen, metrics: metrics, width: width, pages: pages, line: FolderPlace.line),
            cell: metrics.cell, pages: pages, page: open ? folderPage : 0, slots: slots, solid: UIAccessibility.isReduceTransparencyEnabled
        )
    }

    func renameFolder(_ id: String, _ name: String) {
        guard store.book.folders?.first(where: { $0.id == id })?.name != name, !Labels.trim(name).isEmpty else { return }
        store.edit { book in _ = Seats.renameFolder(&book, folderID: id, name: name, now: Clock.now()) }
    }

    /// 移出資料夾（VoiceOver 動作、在框外放手）：放到資料夾那頁第一個空格，那頁滿了才排在資料夾後面一格
    func takeOut(_ id: String) {
        guard let folder = Seats.folderOf(store.book, id) else { return }
        let list = entries
        let index = pageIndex(list)
        var spot: (hole: String?, after: String?) = (nil, nil)
        if let page = index.first(where: { $0.contains { list[$0].id == folder.id } }) {
            spot = emptySpot(list, page: page)
        }
        store.edit { book in _ = Seats.outOfFolder(&book, noteID: id, now: Clock.now(), hole: spot.hole, after: spot.after) }
    }

    /// 放進資料夾（只剩 VoiceOver 動作）：還沒有資料夾就在這張的位置開一個新的、打開讓你取名；有就問放進哪一個
    func putIn(_ id: String) {
        if Seats.seatedEntries(store.book).contains(where: { $0.folder != nil }) {
            putInFor = id
        } else {
            makeFolder(for: id)
        }
    }

    func makeFolder(for id: String) {
        var made: String?
        store.edit { book in made = Seats.newFolder(&book, noteID: id, now: Clock.now()).id }
        if let made {
            showFolder(made, naming: true)
        }
    }

    func moveInto(_ id: String, folder: String) {
        store.edit { book in _ = Seats.intoFolder(&book, noteID: id, folderID: folder, now: Clock.now()) }
    }
}

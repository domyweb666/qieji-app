import SwiftUI
import UIKit

/// 資料夾：打開、收起、改名、放進、移出
extension DirModel {
    func showFolder(_ id: String, naming: Bool = false) {
        folderPage = 0
        openFolder = OpenFolder(id: id, naming: naming)
    }

    func closeFolder() {
        endKeyboard()
        openFolder = nil
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

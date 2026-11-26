import SwiftUI

/// 刪除這張之後回到哪：從目錄點進來的回到目錄（QC-0002）
extension DirModel {
    /// 從目錄打開一張：記下目錄停在哪一頁、打開著哪個資料夾、資料夾翻到第幾頁。search＝從搜尋結果點的，搜尋的字也記著
    func markOrigin(_ id: String, search: Bool = false) {
        let folder = openFolder?.id
        origin = Origin(
            id: id,
            page: page,
            folder: folder,
            folderPage: folder == nil ? 0 : folderPage,
            query: search && searching ? query : ""
        )
    }

    /// 換到別張了：那張不是從目錄點進來的
    func forgetOrigin() {
        if origin?.id != store.currentID {
            origin = nil
        }
    }

    /// 站回記下的那一頁、那個資料夾的那一頁、搜尋的字（頁少了就最後一頁，資料夾不在了就不打開，搜尋沒結果也留著字）
    func stand(at spot: Origin) {
        query = spot.query
        page = min(spot.page, max(0, pages.count - 1))
        guard let folder = spot.folder, let entry = entries.first(where: { $0.id == folder && $0.folder != nil }) else { return }
        let count = DirCells.folderNotes(entry, drag: drag, book: store.book).count
        // 頁數先定好再打開：框第一次排就是那一頁的頁點
        showFolder(folder, page: min(spot.folderPage, max(0, FolderLook.pages(count) - 1)))
        guard folderPage > 0 else { return }
        // 打開時捲動區放回第一頁，再捲到那一頁（不帶動畫，面板還在螢幕外）
        folderTouch.scroll(toPage: folderPage, animated: false)
    }

    /// 長按選單、VoiceOver 的「刪除」：跟「−」一樣先問一次（2026-11-24 芹查 #1）
    func confirmDelete(_ id: String) {
        menu = nil
        askDelete = id
    }

    func delete(_ id: String) {
        menu = nil
        store.trashNote(id)
        Haptic.land()
    }

    /// 紙的 ⋯「刪除這張」：從目錄點進來的回到目錄（復原也留在目錄，跟在目錄裡刪一樣）；不是的換到上一張看的
    func trashPaper(_ id: String) {
        let spot = origin?.id == id ? origin : nil
        store.trashNote(id, reopen: spot == nil)
        if let spot {
            open(at: spot)
        }
    }
}

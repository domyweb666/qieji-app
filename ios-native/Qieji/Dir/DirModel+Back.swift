import SwiftUI

/// 刪除這張之後回到哪：從目錄點進來的回到目錄（QC-0002）
extension DirModel {
    /// 從目錄打開一張：記下目錄停在哪一頁、打開著哪個資料夾
    func markOrigin(_ id: String) {
        origin = Origin(id: id, page: page, folder: openFolder?.id)
    }

    /// 換到別張了：那張不是從目錄點進來的
    func forgetOrigin() {
        if origin?.id != store.currentID {
            origin = nil
        }
    }

    /// 站回記下的那一頁、那個資料夾（頁少了就最後一頁，資料夾不在了就不打開）
    func stand(at spot: Origin) {
        page = min(spot.page, max(0, pages.count - 1))
        guard let folder = spot.folder else { return }
        showFolder(folder)
        if openEntry == nil {
            openFolder = nil
        }
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

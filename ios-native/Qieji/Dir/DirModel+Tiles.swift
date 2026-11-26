import SwiftUI
import UIKit

/// 只關一塊磚的狀態（按著、瞄著要疊、剛有東西縮進來）：跟 setCover 一樣直接改那塊磚。
/// 以前走 @Published，點一下磚每一頁的每一塊都重算一次、整個目錄重畫兩三次（2026-11-26 效能審查第 3 條）
extension DirModel {
    /// 目錄裡那塊磚改一樣東西：舊的那塊關掉、新的那塊打開
    func markTiles(_ old: String?, _ new: String?, _ change: @escaping (inout DirSlot, Bool) -> Void) {
        guard old != new else { return }
        let animated = !tilesQuiet
        for id in [old, new].compactMap({ $0 }) {
            let on = id == new
            for grid in pageGrids.allObjects {
                grid.mark(id, animated: animated) { change(&$0, on) }
            }
        }
    }

    /// 按著的那塊：目錄的磚，打開的資料夾裡的也一樣
    func markHeld(_ old: String?, _ new: String?) {
        markTiles(old, new) { $0.held = $1 }
        guard old != new else { return }
        if let old {
            folderStage?.mark(old, held: false)
        }
        if let new {
            folderStage?.mark(new, held: true)
        }
    }

    /// 搜尋結果：同一個字、資料沒變就用上次算好的（打一個字畫面會問好幾次）
    func searchHits() -> [Seats.LineHit] {
        let book = store.book
        if let seen = searchSeen, seen.query == query, seen.book == book {
            return seen.hits
        }
        let hits = Seats.searchLines(book, query: query)
        searchSeen = (query, book, hits)
        return hits
    }
}

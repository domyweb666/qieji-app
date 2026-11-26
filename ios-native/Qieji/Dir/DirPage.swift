import SwiftUI

/// 一頁要畫什麼（都是值）：一樣就整頁不重算
struct DirPage: Equatable {
    let items: [Seats.Entry]
    let currentID: String? // 那張在這頁才有
    let editing: Bool
    let dragID: String? // 拖著的那張在這頁才有
    let cell: CGFloat

    init(items: [Seats.Entry], currentID: String?, editing: Bool, dragID: String?, cell: CGFloat) {
        self.items = items
        let here = { (id: String) in items.contains { $0.id == id || $0.notes.contains { $0.id == id } } }
        self.currentID = currentID.flatMap { here($0) ? $0 : nil }
        self.editing = editing
        self.dragID = dragID.flatMap { here($0) ? $0 : nil }
        self.cell = cell
    }

    /// 按著、瞄著、彈一下、資料夾開著這幾樣排的那一刻才去 model 讀（平常直接改磚，見 DirModel+Tiles）
    func slots(_ model: DirModel) -> [DirSlot] {
        let metrics = DirMetrics(cell: cell)
        return items.enumerated().filter { !$0.element.isHole }.map { index, entry in
            DirSlot(
                entry: entry, index: index, spot: metrics.slot(index), current: isCurrent(entry), editing: editing,
                hidden: dragID == entry.id, target: model.stackOn == entry.id, pop: model.popID == entry.id,
                held: model.heldID == entry.id, covered: model.folderCovers.contains(entry.id)
            )
        }
    }

    private func isCurrent(_ entry: Seats.Entry) -> Bool {
        entry.folder != nil ? entry.notes.contains { $0.id == currentID } : entry.id == currentID
    }
}

/// 目錄的一頁。不看整個 model：只有這頁的磚、正在看的那張、抖動、拖著的那張變了才重算（2026-11-26 效能審查第 3 條）
struct DirPageView: View, Equatable {
    let model: DirModel
    let page: DirPage
    @ObservedObject private var covers = Covers.shared

    init(model: DirModel, page: DirPage) {
        self.model = model
        self.page = page
    }

    static func == (lhs: DirPageView, rhs: DirPageView) -> Bool {
        lhs.model === rhs.model && lhs.page == rhs.page
    }

    var body: some View {
        let metrics = DirMetrics(cell: page.cell)
        let rows = (page.items.count + DirMetrics.cols - 1) / DirMetrics.cols
        return DirGrid(model: model, page: page, covers: covers.version)
            .frame(width: metrics.cell * CGFloat(DirMetrics.cols), height: metrics.height(rows: rows), alignment: .topLeading)
    }
}

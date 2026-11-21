import CoreGraphics
import Foundation

// 目錄格子的純計算：尺寸、分頁、拖的時候整排怎麼換、手上那張瞄著哪。
// 從 Expo 版 src/components/DirPanel.tsx 逐條搬過來（2026-11-21）：sizeOf／slotX／cellAt、flatOf／cellsOf／paginate／placeAt／folderNotes、aimOf。
// 這個檔不碰畫面、不碰手勢，測試在 QiejiTests/DirGridTests.swift。

/// 一格多大。cell＝欄寬；方磚在格子上面置中，名字在方磚下面
struct DirMetrics: Equatable {
    var cell: CGFloat

    static let cols = Tok.Shape.gridCols
    static let folderCols = Tok.Shape.folderCols
    static let folderPer = Tok.Shape.folderCols * Tok.Shape.folderRows

    /// 方磚邊長
    var side: CGFloat {
        min(Tok.Shape.tileMax, cell - Tok.Shape.tileGapMin)
    }

    /// 一塊磚（方磚＋名字）的高
    var tileHeight: CGFloat {
        side + Tok.Shape.tileLabelGap + Tok.Shape.tileLabelH
    }

    /// 列距
    var pitch: CGFloat {
        tileHeight + Tok.Shape.tileRowGap
    }

    /// 第幾格的左上角（相對格子左上角）
    func slot(_ index: Int, cols: Int = DirMetrics.cols) -> CGPoint {
        CGPoint(x: CGFloat(index % cols) * cell, y: CGFloat(index / cols) * pitch)
    }

    /// 一個點（相對格子左上角）落在第幾格；在格子上面、左邊回 −1
    func cellAt(_ point: CGPoint, cols: Int = DirMetrics.cols) -> Int {
        if point.x < 0 || point.y < 0 {
            return -1
        }
        return Int(point.y / pitch) * cols + min(cols - 1, Int(point.x / cell))
    }

    /// 格子區這麼高放得下幾列整磚（不切半塊）
    func rows(in height: CGFloat) -> Int {
        max(1, Int((height - Tok.Space.sm - Tok.Space.md + Tok.Shape.tileRowGap) / pitch))
    }

    /// 幾列磚的總高
    func height(rows: Int) -> CGFloat {
        max(0, CGFloat(rows) * pitch - Tok.Shape.tileRowGap)
    }
}

/// 拖著的那一塊。cells＝目錄這一排的格子表（紙、資料夾、空位、換頁標記的 id，拖的那張記成 DirCells.me）；
/// 從資料夾拿起、手指還在資料夾裡時是 nil（目錄不多一格）。base＝拿起那一刻（或翻到這頁落下那一刻）的格子表：
/// 手上那張要放哪格一律從 base 重算，經過的別張才會回自己那格。
struct DirDrag: Equatable {
    var id: String
    var source: String? // 從哪個資料夾拿起（nil＝目錄）
    var page: Int
    var cells: [String]?
    var inFolder: String? // 現在對準哪個打開的資料夾
    var folderSlot = -1 // 資料夾裡讓出來那格
    var startSlot = -1 // 從資料夾拿起時在第幾格
    var folderOrder: [String]?
    var base: [String]?
}

/// 拖的時候畫出來的一格。key＝這格在格子表裡記成什麼（資料夾拿出來只剩一張、先畫成那張時，格子表裡還是記資料夾）
struct DirCell: Equatable, Identifiable {
    var entry: Seats.Entry
    var key: String?

    var id: String {
        entry.id
    }
}

/// 算格子表要看的現況：目錄現在的排法、整份資料、一頁幾格
struct DirBoard {
    var list: [Seats.Entry]
    var book: Notebook
    var perPage: Int
}

enum DirCells {
    static let me = "@"

    /// 拖的那張（從資料夾拿起的是一張紙，目錄裡的可能是紙或資料夾）
    static func dragged(_ drag: DirDrag, list: [Seats.Entry], book: Notebook) -> Seats.Entry? {
        if drag.source == nil {
            return list.first { $0.id == drag.id && !$0.isBreak }
        }
        guard let note = book.note(drag.id) else { return nil }
        return Seats.Entry(id: note.id, note: note, notes: [note])
    }

    /// 拖的時候目錄這一排：照格子表排，拖的那張在 me 那格。最後面的空位、換頁標記不算
    static func flat(_ drag: DirDrag, list: [Seats.Entry], book: Notebook) -> [DirCell] {
        var byID: [String: Seats.Entry] = [:]
        for entry in list {
            byID[entry.id] = entry
        }
        let mine = dragged(drag, list: list, book: book)
        var out: [DirCell] = []
        for id in drag.cells ?? list.map(\.id) {
            if id == me {
                if let mine {
                    out.append(DirCell(entry: mine))
                }
                continue
            }
            var entry = byID[id]
            if entry == nil, Seats.isHole(id) {
                entry = Seats.Entry(id: id, isHole: true)
            } else if entry == nil, Seats.isBreak(id) {
                entry = Seats.Entry(id: id, isBreak: true)
            }
            guard var found = entry, found.id != drag.id else { continue }
            if found.folder != nil, found.id == drag.source {
                // 從這個資料夾拿起的：那格資料夾拿掉這張；拿出來只剩一張就先畫成那張（放手時資料規則也這樣拆）
                let rest = found.notes.filter { $0.id != drag.id }
                if rest.count == 1, drag.inFolder == nil, let only = rest.first {
                    out.append(DirCell(entry: Seats.Entry(id: only.id, note: only, notes: rest), key: found.id))
                } else if !rest.isEmpty {
                    found.notes = rest
                    out.append(DirCell(entry: found))
                }
                continue
            }
            out.append(DirCell(entry: found))
        }
        while let last = out.last, last.entry.isHole || last.entry.isBreak {
            out.removeLast()
        }
        return out
    }

    /// 排好的這一排換回格子表
    static func keys(_ drag: DirDrag, _ cells: [DirCell]) -> [String] {
        cells.map { $0.entry.id == drag.id ? me : ($0.key ?? $0.entry.id) }
    }

    /// 排頁：一頁放滿就換下一頁，碰到換頁標記也換（那頁還空著就不換）。回傳每頁是 list 裡的第幾個（不含標記）
    static func paginate(_ list: [Seats.Entry], perPage: Int) -> [[Int]] {
        var out: [[Int]] = [[]]
        for (index, entry) in list.enumerated() {
            if entry.isBreak {
                if out.last?.isEmpty == false {
                    out.append([])
                }
                continue
            }
            if (out.last?.count ?? 0) >= perPage {
                out.append([])
            }
            out[out.count - 1].append(index)
        }
        if out.count > 1, out.last?.isEmpty == true {
            out.removeLast()
        }
        return out
    }

    /// 這頁第一個空格：空位，或最後一張後面（這頁還放得下）。沒有回 −1
    static func firstEmpty(_ list: [Seats.Entry], page: [Int], perPage: Int) -> Int {
        if let hole = page.firstIndex(where: { list[$0].isHole }) {
            return hole
        }
        return page.count < perPage ? page.count : -1
    }

    /// 拖的那張放進第 page 頁第 slot 格：那格是空位＝跟空位對調；那格有別張＝兩張對調；
    /// 那頁最後一張後面、這頁還放得下的格子＝中間補空位再放進去，原本那格變空位。放不進去回 nil。
    /// 從 base 算：停回拿起那格＝整排回到拿起時的樣子
    static func place(_ drag: DirDrag, page: Int, slot: Int, on board: DirBoard) -> [String]? {
        let list = board.list, book = board.book, perPage = board.perPage
        var from = drag
        if let base = drag.base {
            from.cells = base
        }
        let row = flat(from, list: list, book: book)
        let pages = paginate(row.map(\.entry), perPage: perPage)
        let here = page >= 0 && page < pages.count ? pages[page] : []
        var cells = keys(from, row)
        guard let mine = cells.firstIndex(of: me) else { return nil }
        if slot < here.count {
            let other = here[slot]
            if other != mine {
                cells.swapAt(mine, other)
            }
            return cells
        }
        guard let lastIndex = here.last, slot < perPage else { return nil }
        cells[mine] = Seats.newHole()
        let fill = (0 ..< (slot - here.count)).map { _ in Seats.newHole() }
        cells.insert(contentsOf: fill + [me], at: lastIndex + 1)
        return cells
    }

    /// 打開的資料夾裡排出來的紙：拖進來的放在讓出來那格；從這個資料夾拿起、已經拖到外面的不在裡面
    static func folderNotes(_ entry: Seats.Entry, drag: DirDrag?, book: Notebook) -> [Note] {
        guard let drag else { return entry.notes }
        var rest = entry.notes.filter { $0.id != drag.id }
        if drag.inFolder == entry.id, let order = drag.folderOrder {
            var rank: [String: Int] = [:]
            for (index, id) in order.enumerated() {
                rank[id] = index
            }
            rest = Seats.stable(rest) { (rank[$0.id] ?? Int.max) < (rank[$1.id] ?? Int.max) }
        }
        guard let mine = book.note(drag.id) else { return rest }
        if drag.source == nil, drag.inFolder != entry.id {
            return rest
        }
        let spot = drag.inFolder == entry.id ? drag.folderSlot : (drag.source == entry.id ? drag.startSlot : -1)
        if spot < 0 {
            return rest
        }
        rest.insert(mine, at: min(spot, rest.count))
        return rest
    }
}

/// 手上那張瞄著哪
enum DirAim: Equatable {
    case none // 落在自己那格、格子外面、還沒量好
    case swap(Int) // 跟這頁第幾格那張互換（手慢下來才換）
    case past(Int) // 推過那張的中心，馬上換
    case stack(Int) // 準備疊到那張上
    case cell(Int) // 放進這頁的空格
    case folderSwap(Int) // 跟資料夾裡第幾張互換
    case folderEnd // 資料夾這頁的空格（排到最後）
    case out // 資料夾開著、手指在框外（停一下收起）
}

/// 算瞄哪要用的現況（座標都是螢幕座標）
struct DirGeo: Equatable {
    var origin: CGPoint = .zero // 這頁格子的左上角
    var count = 1 // 這頁幾格
    var cap = 1 // 這頁最多幾格
    var last = -1 // 讓出來的那格在這頁第幾格（−1＝不在這頁）
    var base = -1 // 拖的那張拿起時在這頁第幾格
    var holes: Set<Int> = [] // 這頁哪幾格是空位
    var holdingFolder = false // 拖的是資料夾（不能疊）
    var folderOpen = false // 資料夾開著在對準
    var box: CGRect = .zero // 資料夾框
    var folderPage = 0
    var folderCount = 1
    var folderLast = 0
    var width: CGFloat = 0 // 浮起那塊的寬
}

extension DirCells {
    /// corner＝拖著那塊的左上角、finger＝手指：看方磚的中心落在哪一格。current＝上一次的結果（已經準備疊了就放寬）
    static func aim(corner: CGPoint, finger: CGPoint, geo: DirGeo, metrics: DirMetrics, current: DirAim) -> DirAim {
        let held = DirMetrics(cell: geo.width)
        let center = CGPoint(x: corner.x + geo.width / 2, y: corner.y + held.side / 2)
        if geo.folderOpen {
            return folderAim(center: center, finger: finger, geo: geo, metrics: metrics)
        }
        let cols = DirMetrics.cols
        let side = metrics.side
        let localX = center.x - geo.origin.x
        // 看中心離哪一列的方磚最近：方磚上下的空隙各半，上面那段也算這一格
        let row = Int(((center.y - geo.origin.y - side / 2) / metrics.pitch).rounded())
        if row < 0 || localX < 0 {
            return .none
        }
        let slot = row * cols + min(cols - 1, Int(localX / metrics.cell))
        if slot == geo.last {
            return .none
        }
        // 中心落在空格（這頁的空位，或最後一張後面、這頁還放得下的格子）：放進那格
        if slot < geo.count ? geo.holes.contains(slot) : slot < geo.cap {
            return .cell(slot)
        }
        if slot >= geo.count {
            return .none
        }
        // 落在有東西的格子：看「前進的方向」（從磚現在站的那格往這格）。沒偏太多、還沒推過對方中心太遠＝準備疊；
        // 推過中心＝馬上互換；偏太多（從旁邊錯開經過）＝手慢下來才互換。拿起那格站的是被換過去的那張，停回來是復原，不算疊
        let spot = metrics.slot(slot)
        let dx = center.x - (geo.origin.x + spot.x + metrics.cell / 2), dy = center.y - (geo.origin.y + spot.y + side / 2)
        let onIt = current == .stack(slot)
        var vx: CGFloat = 0, vy: CGFloat = 0
        if geo.last >= 0 {
            let from = metrics.slot(geo.last)
            vx = spot.x - from.x
            vy = spot.y - from.y
        }
        let len = hypot(vx, vy)
        let along = len > 0 ? (dx * vx + dy * vy) / len : 0
        let across = len > 0 ? abs(dx * vy - dy * vx) / len : max(abs(dx), abs(dy))
        if slot == geo.base {
            return .swap(slot)
        }
        if across >= (onIt ? Tok.Gesture.stackYHold : Tok.Gesture.stackY) * side {
            return .swap(slot)
        }
        if along >= (onIt ? Tok.Gesture.stackFarHold : Tok.Gesture.stackFar) * side {
            return .past(slot)
        }
        return geo.holdingFolder ? .swap(slot) : .stack(slot)
    }

    /// 資料夾裡不能疊：中心落在哪格就跟那格互換；落在最後一張後面＝排到最後。出框看手指（跟翻資料夾頁同一個基準）
    private static func folderAim(center: CGPoint, finger: CGPoint, geo: DirGeo, metrics: DirMetrics) -> DirAim {
        if geo.box.width == 0 {
            return .none
        }
        if !geo.box.insetBy(dx: -Tok.Space.md, dy: -Tok.Space.md).contains(finger) {
            return .out
        }
        let local = CGPoint(x: center.x - geo.box.minX - Tok.Space.lg, y: center.y - geo.box.minY - Tok.Space.lg)
        let slot = metrics.cellAt(local, cols: DirMetrics.folderCols)
        if slot < 0 || slot >= DirMetrics.folderPer {
            return .none
        }
        let index = geo.folderPage * DirMetrics.folderPer + slot
        if index >= geo.folderCount {
            return .folderEnd
        }
        return index == geo.folderLast ? .none : .folderSwap(index)
    }
}

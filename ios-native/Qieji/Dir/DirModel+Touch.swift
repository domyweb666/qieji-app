import SwiftUI
import UIKit

/// 手指點到哪一塊、點了／按住了要做什麼。磚的位置全部用算的（不是每塊磚各掛一組手勢），
/// 所以磚換位、換頁、進出資料夾時，手上的拖曳不會斷。
extension DirModel {
    /// 現在不收觸控：還在滑進落點（手指再碰會先 landNow）、正在放大打開、面板還沒停在全開
    var busy: Bool {
        landing || launch != nil || !isOpen
    }

    /// 螢幕上這個點是哪一塊磚
    func hit(_ zone: Zone, _ point: CGPoint) -> Hit? {
        switch zone {
        case .grid:
            guard !searching, openFolder == nil || folderHidden else { return nil }
            let origin = gridOrigin
            let local = CGPoint(x: point.x - origin.x, y: point.y - origin.y)
            let slot = metrics.cellAt(local)
            let shown = pages
            guard slot >= 0, local.x < cellWidth * CGFloat(DirMetrics.cols), page < shown.count,
                  slot < shown[page].count else { return nil }
            let entry = shown[page][slot]
            let spot = metrics.slot(slot)
            guard !entry.isHole, local.y - spot.y <= metrics.tileHeight else { return nil }
            return Hit(id: entry.id, isFolder: entry.folder != nil, slot: slot, corner: CGPoint(x: origin.x + spot.x, y: origin.y + spot.y))
        case .folder:
            guard openFolder != nil, !folderHidden else { return nil }
            let origin = CGPoint(x: folderBox.minX + Tok.Space.lg, y: folderBox.minY + Tok.Space.lg)
            let local = CGPoint(x: point.x - origin.x, y: point.y - origin.y)
            let slot = metrics.cellAt(local, cols: DirMetrics.folderCols)
            let list = folderList
            let index = folderPage * DirMetrics.folderPer + slot
            guard slot >= 0, slot < DirMetrics.folderPer, local.x < cellWidth * CGFloat(DirMetrics.folderCols),
                  index < list.count else { return nil }
            let spot = metrics.slot(slot, cols: DirMetrics.folderCols)
            guard local.y - spot.y <= metrics.tileHeight else { return nil }
            return Hit(id: list[index].id, isFolder: false, slot: index, corner: CGPoint(x: origin.x + spot.x, y: origin.y + spot.y))
        }
    }

    /// 抖動中磚左上角的「−」：圓點小，熱區往外補一圈。回傳點到哪一張
    private func minusHit(_ zone: Zone, _ point: CGPoint) -> String? {
        let inset = (cellWidth - metrics.side) / 2 - Tok.Space.sm
        func area(_ corner: CGPoint) -> CGRect {
            CGRect(x: corner.x + inset, y: corner.y - Tok.Space.sm, width: Tok.Shape.minusBadge, height: Tok.Shape.minusBadge)
                .insetBy(dx: -Tok.Space.md, dy: -Tok.Space.md)
        }
        switch zone {
        case .grid:
            let shown = pages
            guard page < shown.count else { return nil }
            for (slot, entry) in shown[page].enumerated() where entry.note != nil && entry.folder == nil {
                let spot = metrics.slot(slot)
                if area(CGPoint(x: gridOrigin.x + spot.x, y: gridOrigin.y + spot.y)).contains(point) {
                    return entry.id
                }
            }
        case .folder:
            let per = DirMetrics.folderPer
            for (index, note) in folderList.enumerated() where index / per == folderPage {
                let spot = metrics.slot(index % per, cols: DirMetrics.folderCols)
                let corner = CGPoint(x: folderBox.minX + Tok.Space.lg + spot.x, y: folderBox.minY + Tok.Space.lg + spot.y)
                if area(corner).contains(point) {
                    return note.id
                }
            }
        }
        return nil
    }

    /// 點一下。沒抖動：紙磚＝換紙、資料夾磚＝打開。抖動中：「−」＝問要不要刪、資料夾磚＝打開、空白處＝結束抖動，紙磚不動
    func tap(_ zone: Zone, at point: CGPoint) {
        guard drag == nil, !busy, menu == nil else { return }
        if editing, let id = minusHit(zone, point) {
            askDelete = id
            return
        }
        guard let hit = hit(zone, point) else {
            if zone == .grid, editing {
                editing = false
            }
            return
        }
        if hit.isFolder {
            showFolder(hit.id)
            return
        }
        if editing {
            return
        }
        let side = metrics.side
        pick(hit.id, from: CGRect(x: hit.corner.x + (cellWidth - side) / 2, y: hit.corner.y, width: side, height: side))
    }

    /// 按住不動到時間了。紙磚＝跳選單；資料夾磚、空白處＝進抖動。回傳「手指再拖一段就拿得起來」
    func holdBegan(_ zone: Zone, at point: CGPoint) -> Bool {
        guard drag == nil, !busy, !editing, menu == nil else { return false }
        guard let hit = hit(zone, point) else {
            if zone == .grid, !searching {
                Haptic.menu()
                editing = true
            }
            return false
        }
        endKeyboard()
        Haptic.menu()
        if hit.isFolder {
            editing = true
            return true
        }
        openMenu(hit)
        return true
    }

    /// 選單接在那塊磚正下方，放不下就正上方，跟磚同一邊
    private func openMenu(_ hit: Hit) {
        let rows: CGFloat = 3
        let height = Tok.Shape.swatchDot + Tok.Space.lg * 2 + Tok.Shape.menuRow * rows + Tok.Space.xs * 2 + Tok.Space.sm * 2
        let below = hit.corner.y + metrics.tileHeight + Tok.Space.sm
        let roof = Tok.Shape.dirPeek + Tok.Shape.hitMin
        let fits = below + height <= screen.height - safeBottom - Tok.Space.lg
        let top = fits ? below : max(roof, hit.corner.y - Tok.Space.sm - height)
        menu = Menu(id: hit.id, corner: hit.corner, width: cellWidth, top: top, leading: hit.corner.x + cellWidth / 2 < screen.width / 2)
    }

    /// 手指一按下：那塊磚變淡（抖動中是放大），看得出按到了；放手、開始翻頁就復原
    func pressDown(_ zone: Zone, at point: CGPoint) {
        guard drag == nil, !busy, menu == nil else { return }
        Haptic.prepare()
        heldID = hit(zone, point)?.id
    }

    func pressUp() {
        if heldID != nil {
            heldID = nil
        }
    }

    /// 捲動區自己翻了頁
    func scrolled(_ zone: Zone, to index: Int) {
        guard drag == nil else { return }
        switch zone {
        case .grid:
            if page != index {
                page = index
            }
        case .folder:
            if folderPage != index {
                folderPage = index
            }
        }
    }

    // MARK: VoiceOver

    func voiceLabel(_ entry: Seats.Entry) -> String {
        if let folder = entry.folder {
            return Words.folderVoice(folder.name, entry.notes.count)
        }
        guard let note = entry.note else { return "" }
        let hue = NoteColor.names[note.color]?.hue ?? ""
        return [Labels.label(note), hue, note.pinned ? Words.pinnedGroup : ""].filter { !$0.isEmpty }.joined(separator: "，")
    }

    /// 拖不了的人走這裡：改磚上的字、放進／移出資料夾、刪除、往前往後移
    func voiceActs(_ entry: Seats.Entry, inFolder: Bool = false) -> [VoiceAct] {
        let id = entry.id
        if entry.folder != nil {
            return [
                VoiceAct(name: Words.rename) { [weak self] in self?.showFolder(id, naming: true) },
                VoiceAct(name: Words.moveForward) { [weak self] in self?.moveBy(id, -1) },
                VoiceAct(name: Words.moveBack) { [weak self] in self?.moveBy(id, 1) },
            ]
        }
        var acts = [VoiceAct(name: Words.glyphEdit) { [weak self] in self?.glyphFor = id }]
        if inFolder {
            acts.append(VoiceAct(name: Words.takeOut) { [weak self] in self?.takeOut(id) })
        } else {
            acts.append(VoiceAct(name: Words.putIn) { [weak self] in self?.putIn(id) })
        }
        acts.append(VoiceAct(name: Words.delete) { [weak self] in self?.delete(id) })
        if !inFolder {
            acts.append(VoiceAct(name: Words.moveForward) { [weak self] in self?.moveBy(id, -1) })
            acts.append(VoiceAct(name: Words.moveBack) { [weak self] in self?.moveBy(id, 1) })
        }
        return acts
    }

    func voiceActivate(_ entry: Seats.Entry) {
        if entry.folder != nil {
            showFolder(entry.id)
        } else {
            pick(entry.id)
        }
    }
}

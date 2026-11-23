import SwiftUI
import UIKit

/// 拖磚：拿起、瞄哪、讓位、疊成資料夾、跨頁、進出資料夾、放手。
/// 規則照 Expo 版 DirPanel.tsx 的 useDragPan、onAim、onEdge、folderFlip、springClose、drop。
extension DirModel {
    private var fingerCorner: CGPoint {
        CGPoint(x: ghost.corner.x + ghost.shift.width, y: ghost.corner.y + ghost.shift.height)
    }

    /// 換拖曳狀態一律走這裡：同時把瞄哪要用的格子位置、格數、讓出來那格算好
    func setDrag(_ next: DirDrag) {
        drag = next
        let row = flat(next)
        let index = pageIndex(row.map(\.entry))
        let here = next.page >= 0 && next.page < index.count ? index[next.page] : []
        geo.origin = gridOrigin
        geo.count = max(1, here.count)
        geo.cap = perPage
        geo.holdingFolder = DirCells.dragged(next, list: entries, book: store.book)?.folder != nil
        geo.last = here.firstIndex { row[$0].entry.id == next.id } ?? -1
        var start = next
        if let base = next.base {
            start.cells = base
        }
        let baseRow = next.base == nil ? row : flat(start)
        let baseIndex = pageIndex(baseRow.map(\.entry))
        let baseHere = next.page >= 0 && next.page < baseIndex.count ? baseIndex[next.page] : []
        geo.base = baseHere.firstIndex { baseRow[$0].entry.id == next.id } ?? -1
        geo.holes = Set(here.enumerated().filter { row[$0.element].entry.isHole }.map(\.offset))
        if let fid = next.inFolder, let entry = entries.first(where: { $0.id == fid }) {
            geo.folderCount = max(1, DirCells.folderNotes(entry, drag: next, book: store.book).count)
            geo.folderLast = next.folderSlot
        }
    }

    // MARK: 拿起、跟手、放手

    /// 拿起來。start＝手指按下去的地方、finger＝手指現在的位置。回傳有沒有拿起
    func dragBegin(_ zone: Zone, start: CGPoint, finger: CGPoint) -> Bool {
        guard drag == nil, !landing, !searching, let hit = hit(zone, start) else { return false }
        touchStart = start
        menu = nil
        heldID = nil
        editing = true
        entered = true
        aim = .none
        stackSlot = -1
        edge = 0
        folderEdge = 0
        ready = false
        unstack()
        ghost.corner = hit.corner
        ghost.width = cellWidth
        let moved = CGSize(width: finger.x - start.x, height: finger.y - start.y)
        ghost.shift = moved
        ghost.sinking = false
        geo.width = cellWidth
        switch zone {
        case .grid:
            geo.folderOpen = false
            // 格子表照現在的排法，拖的那張那格記成 me
            let cells = entries.map { $0.id == hit.id ? DirCells.me : $0.id }
            setDrag(DirDrag(id: hit.id, source: nil, page: page, cells: cells, inFolder: nil, base: cells))
        case .folder:
            // 從打開的資料夾裡拿起：一開始對準這個資料夾，框外停一下才收起
            guard let fid = openFolder?.id else { return false }
            endKeyboard()
            geo.folderOpen = true
            geo.box = folderBox
            geo.folderPage = folderPage
            setDrag(DirDrag(id: hit.id, source: fid, page: page, cells: nil, inFolder: fid, folderSlot: hit.slot, startSlot: hit.slot))
        }
        // 手勢要走一段才啟動：磚先留在原位，很快補到手指的位置，不會一拿起就跳一下
        ghost.catchUp = calm ? .zero : CGSize(width: -moved.width, height: -moved.height)
        ghost.entry = drag.flatMap { DirCells.dragged($0, list: entries, book: store.book) }
        if !calm {
            // 先畫出「還在原位」那一格，下一格才開始補：一起改的話會直接出現在手指的位置
            DispatchQueue.main.async { [ghost] in
                withAnimation(Tok.Motion.dragCatch) { ghost.catchUp = .zero }
            }
        }
        withAnimation(calm ? nil : Tok.Motion.dragLift) { ghost.lifted = true }
        ready = true
        Haptic.lift()
        return true
    }

    /// 手指每動一格：磚跟手；算在不在邊緣、瞄著哪，變了才去計時
    func dragMove(_ finger: CGPoint) {
        guard drag != nil, !landing else { return }
        ghost.shift = CGSize(width: finger.x - touchStart.x, height: finger.y - touchStart.y)
        guard ready else { return }
        // 拖到左右邊緣停一下翻頁：看的是手指，不是磚的中心。資料夾開著的時候看框的左右邊
        var zone = 0
        if !geo.folderOpen {
            zone = finger.x < Tok.Gesture.edgeZone ? -1 : (finger.x > screen.width - Tok.Gesture.edgeZone ? 1 : 0)
        }
        if zone != edge {
            edge = zone
            onEdge(zone)
        }
        var inner = 0
        let box = geo.box
        if geo.folderOpen, box.width > 0, finger.y >= box.minY, finger.y <= box.maxY {
            if finger.x < box.minX + Tok.Gesture.edgeZone, finger.x >= box.minX - Tok.Space.md {
                inner = -1
            } else if finger.x > box.maxX - Tok.Gesture.edgeZone, finger.x <= box.maxX + Tok.Space.md {
                inner = 1
            }
        }
        if inner != folderEdge {
            folderEdge = inner
            onFolderEdge(inner)
        }
        let next = DirCells.aim(corner: fingerCorner, finger: finger, geo: geo, metrics: metrics, current: aim)
        if next == aim {
            return
        }
        aim = next
        onAim(next)
    }

    /// 放手：帶著放手的速度滑進要放的那格，停了才改資料（資料夾開著但手指在框外就不滑）。velocity＝手指每秒幾點
    func dragEnd(velocity: CGPoint = .zero) {
        guard drag != nil, !landing else { return }
        edgeWork?.cancel()
        folderEdgeWork?.cancel()
        edge = 0
        folderEdge = 0
        Haptic.land()
        withAnimation(calm ? nil : Tok.Motion.dragLift) { ghost.lifted = false }
        var target: CGPoint?
        if ready, geo.folderOpen {
            let slot = geo.folderLast - geo.folderPage * DirMetrics.folderPer
            if aim != .out, slot >= 0, slot < DirMetrics.folderPer {
                let spot = metrics.slot(slot, cols: DirMetrics.folderCols)
                target = CGPoint(x: geo.box.minX + Tok.Space.lg + spot.x, y: geo.box.minY + Tok.Space.lg + spot.y)
            }
        } else if ready {
            let slot = stackSlot >= 0 ? stackSlot : geo.last
            if slot >= 0 {
                let spot = metrics.slot(slot)
                target = CGPoint(x: geo.origin.x + spot.x, y: geo.origin.y + spot.y)
            }
        }
        guard let target, !calm else {
            drop()
            return
        }
        landing = true
        // 疊上去：滑到底下那張上面，同時縮小淡掉
        if stackSlot >= 0 {
            withAnimation(Tok.Motion.sink) { ghost.sinking = true }
        }
        let move = CGSize(width: target.x - ghost.corner.x, height: target.y - ghost.corner.y)
        let left = CGSize(width: move.width - ghost.shift.width, height: move.height - ghost.shift.height)
        let distance = hypot(left.width, left.height)
        // 手指的速度只算「朝落點」那一份
        let toward = distance > 1 ? (velocity.x * left.width + velocity.y * left.height) / distance : 0
        landTurn += 1
        let turn = landTurn
        Motions.run(Tok.Motion.landSpring(velocity: Motions.speed(toward, over: distance)), fallback: Tok.Motion.dragLandSeconds) {
            ghost.shift = move
        } done: { [weak self] in
            guard let self, landing, landTurn == turn else { return }
            drop()
        }
    }

    /// 還在滑進落點時手指又碰了：不等滑完，馬上落定，新的這一下照常收
    func landNow() {
        guard landing else { return }
        drop()
    }

    // MARK: 瞄的地方變了

    func unstack() {
        stackSlot = -1
        if stackOn != nil {
            stackOn = nil
        }
    }

    /// 先取消還在等的互換／疊。目錄：對準停一下＝準備疊；錯開、手停下來＝互換；中心在空格裡停一下＝放進那格。
    /// 資料夾裡：停一下＝互換；框外停一下＝收起
    func onAim(_ next: DirAim) {
        aimWork?.cancel()
        unstack()
        guard let now = drag, next != .none else { return }
        if next == .out {
            if entered, leaveWork == nil {
                leaveWork = after(Tok.Timing.folderLeave) { [weak self] in self?.springClose() }
            }
            return
        }
        leaveWork?.cancel()
        leaveWork = nil
        switch next {
        case let .past(slot):
            aimWork = after(Tok.Timing.swapPast) { [weak self] in self?.tryPlace(slot) }
        case .folderEnd, .folderSwap:
            entered = true
            guard now.inFolder != nil else { return }
            aimWork = after(Tok.Timing.swapDwell) { [weak self] in self?.swapInFolder(next) }
        case let .cell(slot):
            aimWork = after(Tok.Timing.swapDwell) { [weak self] in self?.tryPlace(slot) }
        case let .swap(slot):
            // 高度錯開經過的互換：手還在動就先不換，連續兩次沒動才換
            stillFrom = ghost.shift
            stills = 0
            aimWork = after(Tok.Timing.swapPoll) { [weak self] in self?.whenStill(slot) }
        case let .stack(slot):
            let row = flat(now)
            let index = pageIndex(row.map(\.entry))
            guard now.page < index.count, slot < index[now.page].count else { return }
            let under = row[index[now.page][slot]].entry
            guard under.id != now.id else { return }
            aimWork = after(Tok.Timing.stackHover) { [weak self] in
                self?.stackSlot = slot
                self?.stackOn = under.id
                Haptic.lift()
            }
        case .none, .out:
            break
        }
    }

    /// 放進空格或跟那格那張互換（拖的那張跟底下那張對調，其他都不動）
    private func tryPlace(_ slot: Int) {
        guard var now = drag, now.cells != nil,
              let cells = DirCells.place(now, page: now.page, slot: slot, on: board),
              cells != now.cells else { return }
        now.cells = cells
        setDrag(now)
        Haptic.pass()
    }

    private func whenStill(_ slot: Int) {
        let shift = ghost.shift
        let moved = hypot(shift.width - stillFrom.width, shift.height - stillFrom.height)
        stills = moved > Tok.Gesture.swapStill ? 0 : stills + 1
        stillFrom = shift
        if stills == 2 {
            tryPlace(slot)
        } else {
            aimWork = after(Tok.Timing.swapPoll) { [weak self] in self?.whenStill(slot) }
        }
    }

    private func swapInFolder(_ target: DirAim) {
        guard var now = drag, let fid = now.inFolder, let entry = entries.first(where: { $0.id == fid }) else { return }
        let list = DirCells.folderNotes(entry, drag: now, book: store.book)
        guard let mine = list.firstIndex(where: { $0.id == now.id }) else { return }
        if target == .folderEnd {
            if mine != list.count - 1 {
                now.folderSlot = list.count - 1
                setDrag(now)
                Haptic.pass()
            }
            return
        }
        guard case let .folderSwap(index) = target, index != mine, index < list.count else { return }
        // 互換：拖的那張跟那一張對調，其他不動
        var swapped = list
        swapped.swapAt(mine, index)
        now.folderSlot = index
        now.folderOrder = swapped.filter { $0.id != now.id }.map(\.id)
        setDrag(now)
        Haptic.pass()
    }

    /// 手指離開資料夾框夠久：資料夾收起，回到目錄繼續拖。從資料夾拿起的先放到這頁第一個空格，
    /// 這頁滿了才排在資料夾後面一格
    private func springClose() {
        leaveWork = nil
        guard var now = drag, now.inFolder != nil else { return }
        geo.folderOpen = false
        var cells = now.cells
        if let source = now.source {
            var out = now
            out.inFolder = nil
            out.cells = nil
            let row = flat(out)
            let list = row.map(\.entry)
            let index = pageIndex(list)
            let here = now.page < index.count ? index[now.page] : []
            let slot = DirCells.firstEmpty(list, page: here, perPage: perPage)
            var keys = DirCells.keys(out, row)
            if slot >= 0, slot < here.count {
                keys[here[slot]] = DirCells.me
            } else if slot >= 0, let last = here.last {
                keys.insert(DirCells.me, at: last + 1)
            } else {
                let spot = keys.firstIndex(of: source).map { $0 + 1 } ?? keys.count
                keys.insert(DirCells.me, at: spot)
            }
            cells = keys
        } else {
            openFolder = nil
            geo.box = .zero
        }
        now.inFolder = nil
        now.cells = cells
        now.base = cells
        setDrag(now)
        Haptic.pass()
        // 手指不動也先對一次目錄的格子（資料夾剛收起，只對目錄，用不到手指的位置）
        let corner = fingerCorner
        let held = DirMetrics(cell: geo.width)
        let center = CGPoint(x: corner.x + geo.width / 2, y: corner.y + held.side / 2)
        let next = DirCells.aim(corner: corner, finger: center, geo: geo, metrics: metrics, current: aim)
        aim = next
        onAim(next)
    }

    // MARK: 邊緣翻頁

    /// 在邊緣停 edgeFlip 就翻一頁；一直停著就再翻
    func onEdge(_ zone: Int) {
        edgeWork?.cancel()
        guard zone != 0 else { return }
        edgeWork = after(Tok.Timing.edgeFlip) { [weak self] in self?.flip(zone) }
    }

    private func flip(_ zone: Int) {
        guard let now = drag, now.inFolder == nil, now.cells != nil, edge == zone else { return }
        let target = now.page + zone
        guard target >= 0 else { return }
        aimWork?.cancel()
        unstack()
        // 離開這頁：在這頁預覽的互換、放格都不算（沒放手），從 base 開始放到新的一頁
        var from = now
        if let base = now.base {
            from.cells = base
        }
        let row = flat(from)
        let list = row.map(\.entry)
        let index = pageIndex(list)
        if target >= pages.count {
            openNewPage(now: now, from: from, row: row, index: index, target: target)
            return
        }
        gridTouch.scroll(toPage: target, animated: !calm)
        page = target
        // 翻過去：拖的那張不在這頁，就放進手指下面那格（空著的話），不然放到這頁第一個空格；這頁滿了先不動
        var landed = now
        landed.page = target
        let here = target < index.count ? index[target] : []
        var cells: [String]?
        if !here.contains(where: { list[$0].id == now.id }) {
            let corner = fingerCorner
            let held = DirMetrics(cell: geo.width)
            let local = CGPoint(x: corner.x + geo.width / 2 - gridOrigin.x, y: corner.y + held.side / 2 - gridOrigin.y)
            let under = metrics.cellAt(local)
            let free = under >= 0 && (under < here.count ? list[here[under]].isHole : under < perPage)
            let slot = free ? under : DirCells.firstEmpty(list, page: here, perPage: perPage)
            if slot >= 0 {
                cells = DirCells.place(landed, page: target, slot: slot, on: board)
            }
        }
        if let cells {
            landed.cells = cells
            landed.base = cells
        } else {
            landed.cells = from.cells // 那頁滿了：手上那張還算在拿起那格，這頁預覽的互換收回
        }
        setDrag(landed)
        aim = .none
        Haptic.pass()
        edgeWork = after(Tok.Timing.edgeFlip) { [weak self] in self?.flip(zone) }
    }

    /// 最後一頁再往右：這頁還有別張才開新的一頁（空位不算），拖的那張是新頁唯一一張，原本那格留空位
    private func openNewPage(now: DirDrag, from: DirDrag, row: [DirCell], index: [[Int]], target: Int) {
        let here = (now.page < index.count ? index[now.page] : []).filter { row[$0].entry.id != now.id && !row[$0].entry.isHole }
        var keys = DirCells.keys(from, row)
        guard !here.isEmpty, let mine = keys.firstIndex(of: DirCells.me) else { return }
        keys[mine] = Seats.newHole()
        keys.append(contentsOf: [Seats.newBreak(), DirCells.me])
        var next = now
        next.page = target
        next.cells = keys
        next.base = keys
        page = target
        setDrag(next)
        aim = .none
        // 新的一頁下一格才畫出來，等它出來再捲過去
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            gridTouch.scroll(toPage: target, animated: !calm)
        }
        Haptic.pass()
    }

    func onFolderEdge(_ zone: Int) {
        folderEdgeWork?.cancel()
        guard zone != 0 else { return }
        folderEdgeWork = after(Tok.Timing.edgeFlip) { [weak self] in self?.folderFlip(zone) }
    }

    /// 打開的資料夾裡拖到框的左右邊停一下：翻資料夾的頁，拖的那張跟著過去（往右排那頁第一格、往左排那頁最後一格）。
    /// 最後一頁再往右不動：頁數本來就算上手上這張（別張剛好排滿時，它自己已經在最後一頁）；照 1.1 再翻會翻到一頁空的
    private func folderFlip(_ zone: Int) {
        guard var now = drag, let fid = now.inFolder, folderEdge == zone,
              let entry = entries.first(where: { $0.id == fid }) else { return }
        let list = DirCells.folderNotes(entry, drag: now, book: store.book)
        let per = DirMetrics.folderPer
        let count = max(1, (list.count + per - 1) / per)
        let target = geo.folderPage + zone
        guard target >= 0, target < count else { return }
        now.folderSlot = min(list.count - 1, zone > 0 ? target * per : target * per + per - 1)
        setDrag(now)
        aimWork?.cancel()
        unstack()
        folderPage = target
        geo.folderPage = target
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            folderTouch.scroll(toPage: target, animated: !calm)
        }
        aim = .none
        Haptic.pass()
        folderEdgeWork = after(Tok.Timing.edgeFlip) { [weak self] in self?.folderFlip(zone) }
    }
}

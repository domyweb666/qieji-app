import SwiftUI
import UIKit

/// 清單資料變了之後怎麼動：換樣子、改字、多一行少一行、原地不動、捲到某一行
extension LineListView {
    // MARK: 更新

    /// 換樣子（顏色、字級）
    func restyle(_ next: LineLook) {
        guard next != look else { return }
        let resize = next.scale != look.scale || next.size != look.size
        look = next
        if resize, bounds.width > 0 {
            remeasureAll()
            contentSize = wantedSize
        }
        for row in live.values {
            if let index = spots[row.id] {
                row.show(rows[index], look: look)
            }
        }
        placeAll()
    }

    /// 照資料重排。stay＝最上面加了一行但看到的東西原地不動
    func refresh(animated: Bool = true, stay: Bool = false) {
        let next = PerfMeter.time("source") { source() }
        PerfMeter.time("apply") { apply(next, animated: animated, stay: stay) }
    }

    func apply(_ next: [LineItem], animated: Bool, stay: Bool = false) {
        guard next != rows, drag == nil else { return }
        guard bounds.width > 0 else {
            rows = next
            index()
            return
        }
        let before = rows, oldSpots = spots, oldTops = tops, oldHeights = heights, oldTotal = total
        let sameShape = before.count == next.count && zip(before, next).allSatisfy { $0.id == $1.id }
        rows = next
        index()
        showEmpty(animated: animated && window != nil)
        rebuild(before: before, oldSpots: oldSpots, oldHeights: oldHeights)
        if sameShape {
            for (index, row) in next.enumerated() where row != before[index] {
                if let seen = live[row.id] {
                    seen.show(row, look: look)
                    dress(seen, index)
                }
            }
            if heights != oldHeights {
                settleHeights(animated: animated)
            }
            return
        }
        for (id, row) in live {
            if let index = spots[id] {
                row.show(next[index], look: look)
                dress(row, index)
            } else {
                letGo(row)
            }
        }
        let move = animated && !calm && window != nil
        if stay {
            stayPut(added: total - oldTotal)
            return
        }
        guard move else {
            for (id, row) in live where spots[id] == nil {
                live[id] = nil
                recycle(row)
            }
            contentSize = wantedSize
            contentOffset.y = min(max(0, contentOffset.y), maxOffset)
            placeAll()
            fill()
            return
        }
        animateShape(oldSpots: oldSpots, oldTops: oldTops, oldHeights: oldHeights)
    }

    /// 正在打字的那行不見了（刪掉、被同步拿掉）：收掉打字
    private func letGo(_ row: LineRowView) {
        guard editingID == row.id else { return }
        editingID = nil
        row.field.delegate = nil
        row.field.resignFirstResponder()
        onEditing(nil)
    }

    func index() {
        spots = [:]
        for (index, row) in rows.enumerated() {
            spots[row.id] = index
        }
    }

    func rebuild(before: [LineItem], oldSpots: [String: Int], oldHeights: [CGFloat]) {
        let oldMeasured = measured
        var nextHeights: [CGFloat] = [], nextMeasured: [Bool] = []
        for row in rows {
            if let old = oldSpots[row.id], old < oldHeights.count, before[old].text == row.text {
                nextHeights.append(oldHeights[old])
                nextMeasured.append(oldMeasured[old])
            } else {
                nextHeights.append(tall(row, exact: true))
                nextMeasured.append(true)
            }
        }
        heights = nextHeights
        measured = nextMeasured
        stack()
    }

    /// 同樣的行、有行變高或變矮（打字多一行）：那一行馬上到位，其他行滑過去
    func settleHeights(animated: Bool) {
        if let id = editingID, let index = spots[id], let row = live[id] {
            row.frame = frame(at: index)
            row.layoutIfNeeded()
        }
        let target = min(max(0, contentOffset.y), maxOffset)
        guard animated, !calm else {
            contentSize = wantedSize
            placeAll()
            return
        }
        fill()
        contentSize = CGSize(width: bounds.width, height: max(contentSize.height, wantedSize.height))
        UIView.animate(withDuration: Tok.Motion.rowShiftSeconds, delay: 0, options: LineListView.shiftOptions) {
            self.contentOffset.y = target
            self.placeAll()
        } completion: { _ in self.contentSize = self.wantedSize }
    }

    static let shiftOptions: UIView.AnimationOptions = [.curveEaseInOut, .allowUserInteraction, .beginFromCurrentState]

    /// 輸入框記下一行、畫面原地不動：已經捲下去了就往下補捲新行那麼高
    func stayPut(added: CGFloat) {
        let offset = contentOffset.y
        contentSize = wantedSize
        if offset > Tok.Shape.rowMin {
            contentOffset.y = offset + added
        }
        placeAll()
        fill()
    }

    /// 行多了、少了、換位：新的淡入、拿掉的淡出，其他滑過去（1.1 rowShift 0.18 秒）
    func animateShape(oldSpots: [String: Int], oldTops: [CGFloat], oldHeights: [CGFloat]) {
        var gone: [LineRowView] = []
        for (id, row) in live where spots[id] == nil {
            live[id] = nil
            content.sendSubviewToBack(row)
            row.leaving = true
            gone.append(row)
        }
        leavers.append(contentsOf: gone)
        let target = min(max(0, contentOffset.y), maxOffset)
        // 變完之後看得到、現在還沒掛的：先掛在它原本的位置（本來就在的）或新的位置（剛加的，先看不到，墊在最底下讓別行滑開露出來）
        var fresh: [LineRowView] = []
        UIView.performWithoutAnimation {
            for index in window(from: target) where live[rows[index].id] == nil {
                let row = mount(index)
                if let old = oldSpots[rows[index].id], old < oldTops.count {
                    row.frame = CGRect(x: 0, y: headHeight + oldTops[old], width: bounds.width, height: oldHeights[old])
                } else {
                    row.frame = frame(at: index)
                    row.alpha = 0
                    content.sendSubviewToBack(row)
                    fresh.append(row)
                }
                row.layoutIfNeeded()
            }
        }
        fadeIn(fresh)
        contentSize = CGSize(width: bounds.width, height: max(contentSize.height, wantedSize.height))
        UIView.animate(withDuration: Tok.Motion.rowShiftSeconds, delay: 0, options: LineListView.shiftOptions) {
            if self.contentOffset.y != target, !self.isTracking {
                self.contentOffset.y = target
            }
            for row in gone {
                row.alpha = 0
            }
            self.placeAll()
        } completion: { _ in
            for row in gone {
                self.leavers.removeAll { $0 === row }
                self.recycle(row)
            }
            self.contentSize = self.wantedSize
            self.fill()
            self.backInside()
        }
    }

    /// 剛加的行淡進來。不能跟別行同一段動畫：那段從「現在看到的樣子」接著走，回收來的行會被當成本來就看得到、直接跳出來
    private func fadeIn(_ fresh: [LineRowView]) {
        for row in fresh {
            row.layer.removeAllAnimations()
        }
        UIView.animate(withDuration: Tok.Motion.rowShiftSeconds, delay: 0, options: [.curveEaseInOut, .allowUserInteraction]) {
            for row in fresh {
                row.alpha = 1
            }
        }
    }

    /// 紙底變短時手指正碰著（沒有跟著捲上來）：放開後補捲，不准停在一片空白上
    private func backInside() {
        guard !isTracking, !isDecelerating, contentOffset.y > maxOffset + 1 else { return }
        glider.go(self, to: maxOffset, seconds: Tok.Motion.seekSeconds)
    }

    // MARK: 從外面叫的

    /// 輸入框記下一行：捲回最上面、那行亮一下。已經捲下去的先原地補位再捲（行一邊讓位一邊捲，途中掛上的行會跟讓位中的疊在一起）
    func toTop(_ added: String?) {
        if contentOffset.y > Tok.Shape.rowMin, !calm {
            refresh(animated: false, stay: true)
        } else {
            refresh()
        }
        if let added {
            flash(added)
        }
        glider.toTop(self)
    }

    /// 從選單刪的行：先淡出，淡完才真的拿掉
    func fadeOut(_ id: String, then: @escaping () -> Void) {
        guard let row = live[id] else {
            then()
            refresh()
            return
        }
        row.leaving = true
        UIView.animate(withDuration: Tok.Motion.fadeSeconds) {
            row.alpha = 0
        } completion: { _ in
            then()
            self.refresh()
        }
    }

    func flash(_ id: String) {
        guard let row = live[id] else {
            freshID = id
            return
        }
        freshID = nil
        row.flash(wait: calm ? 0 : Tok.Motion.freshGlowDelay)
    }

    /// 搜尋點過來的那行：捲到畫面三分之一高、亮一下。三個螢幕內用捲的，更遠直接跳過去
    func seek(_ id: String) {
        guard let place = spots[id], bounds.height > 0 else { return }
        for index in max(0, place - LineListView.sharpRows) ..< min(rows.count, place + LineListView.sharpRows) {
            sharpen(index)
        }
        stack()
        contentSize = wantedSize
        placeAll()
        let want = headHeight + tops[place] - bounds.height * Tok.Shape.seekAnchor.y
        let target = min(max(0, want), maxOffset)
        let near = abs(target - contentOffset.y) < bounds.height * Tok.Gesture.seekNear
        glider.stop()
        if near, !calm {
            glider.go(self, to: target, seconds: Tok.Motion.seekSeconds)
        } else {
            contentOffset.y = target
        }
        fill()
        layoutIfNeeded()
        flash(id)
        // 還在捲過去的那行要到了才掛上：到了再亮一次
        DispatchQueue.main.asyncAfter(deadline: .now() + (near && !calm ? Tok.Motion.seekSeconds : 0)) { [weak self] in
            self?.flash(id)
        }
    }
}

extension LineListView: UIScrollViewDelegate {
    func scrollViewWillBeginDragging(_: UIScrollView) {
        glider.stop()
    }
}

/// 紙拿著它跟清單講話（清單本體由系統建、系統拆，紙不直接握著）
final class ListRemote {
    weak var list: LineListView?
    let spy = ScrollSpy()

    var editingID: String? {
        list?.editingID
    }

    var dragging: Bool {
        list?.drag != nil
    }
}

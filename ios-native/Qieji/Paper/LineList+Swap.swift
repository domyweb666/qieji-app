import SwiftUI
import UIKit

/// 換紙與收行：同一個清單換內容，不拆了重做。兩層輪流用：新的那層淡進來、舊的那層同時淡出去，
/// 舊的行淡完才收，藏在原本那層等下一次（重新掛一次，一個畫面的行要 8 毫秒）
extension LineListView {
    static let benchMax = 24
    static let warmRows = 8

    // MARK: 收行

    func recycle(_ row: LineRowView) {
        row.clear()
        row.isHidden = true
        guard let layer = row.superview as? LineLayer, layer.bench.count < LineListView.benchMax else {
            stow(row)
            return
        }
        layer.bench.append(row)
    }

    /// 整個拿下來，給別的清單用
    func stow(_ row: LineRowView) {
        row.removeFromSuperview()
        row.isHidden = false
        if LineListView.spare.count < LineListView.spareMax {
            LineListView.spare.append(row)
        }
    }

    /// 拿一行來用：先拿藏著的，再拿別的清單留下的，都沒有才做新的
    func takeRow() -> LineRowView {
        if let row = content.bench.popLast() {
            row.isHidden = false
            content.bringSubviewToFront(row)
            return row
        }
        let row = LineListView.spare.popLast() ?? LineRowView(frame: .zero)
        content.addSubview(row)
        return row
    }

    /// 先掛幾行藏著（打開 app 之後閒著的時候）：第一次換到行多的紙就不用現做
    func warmBench(_ count: Int) {
        guard resting.bench.count < LineListView.benchMax else { return }
        for _ in 0 ..< count {
            let row = LineListView.spare.popLast() ?? LineRowView(frame: .zero)
            row.bounds.size = CGSize(width: bounds.width, height: Tok.Shape.rowMin)
            row.isHidden = true
            resting.addSubview(row)
            row.layoutIfNeeded()
            resting.bench.append(row)
        }
    }

    /// 這個清單要拆了（換到記事本、上鎖的紙）：行全部還回去
    func dismantle() {
        leavePaper()
        finishFade()
        for layer in [content, resting] {
            for row in layer.bench {
                stow(row)
            }
            layer.bench = []
        }
    }

    // MARK: 換紙

    /// 先收尾上一張（它的動作還接著它自己那張），再叫 wire 接上新的；回到最上面
    func swap(to paper: String, look next: LineLook, wire: () -> Void, front: AnyView?) {
        // 有封面圖的：最前面那塊也要一起淡，蓋一張舊的樣子最省事
        let shot = window != nil && (hasHead || front != nil) ? snapshotView(afterScreenUpdates: false) : nil
        let offset = contentOffset.y, seen = bounds.size, wasEmpty = emptyAlpha
        finishFade()
        fading = leavePaper()
        layer.removeAllAnimations()
        (content, resting) = (resting, content)
        resting.frame = CGRect(origin: CGPoint(x: 0, y: -offset), size: resting.bounds.size)
        resting.isUserInteractionEnabled = false
        resting.accessibilityElementsHidden = true
        content.isUserInteractionEnabled = true
        content.accessibilityElementsHidden = false
        content.isHidden = false
        paperID = paper
        wire()
        look = next
        rows = source()
        index()
        (heights, tops, measured) = ([], [], [])
        setContentOffset(.zero, animated: false)
        setHead(front)
        if bounds.width > 0 {
            remeasureAll()
            contentSize = wantedSize
            content.frame = CGRect(origin: .zero, size: contentSize)
            fill(spare: LineListView.firstSpare)
            DispatchQueue.main.async { [weak self] in self?.fill() }
        }
        showEmpty(animated: false)
        fade(shot, seen, wasEmpty)
    }

    private func fade(_ shot: UIView?, _ seen: CGSize, _ wasEmpty: CGFloat) {
        fadeTurn += 1
        let turn = fadeTurn
        let nowEmpty = emptyAlpha
        guard window != nil else {
            finishFade()
            return
        }
        content.layer.removeAllAnimations()
        content.alpha = 0
        emptyAlpha = wasEmpty
        if let shot {
            shot.frame = CGRect(origin: .zero, size: seen)
            shot.isUserInteractionEnabled = false
            addSubview(shot)
            resting.isHidden = true // 舊的樣子已經在那張上面了
            headAlpha = 0
        }
        UIView.animate(withDuration: Tok.Motion.fadeSeconds, delay: 0, options: [.curveEaseInOut, .allowUserInteraction]) {
            self.content.alpha = 1
            self.resting.alpha = 0
            self.emptyAlpha = nowEmpty
            self.headAlpha = 1
            shot?.alpha = 0
        } completion: { _ in
            shot?.removeFromSuperview()
            if self.fadeTurn == turn {
                self.finishFade()
            }
        }
    }

    /// 舊的那層收掉（淡完了，或還沒淡完又換了一張）
    func finishFade() {
        for row in fading {
            recycle(row)
        }
        fading = []
        resting.layer.removeAllAnimations()
        resting.isHidden = true
        resting.alpha = 1
    }

    /// 上一張紙收尾：排順序落定、在打字的收掉、不再收手勢。行先留在原地給淡出用
    @discardableResult
    private func leavePaper() -> [LineRowView] {
        settleLanding()
        stopAutoScroll()
        pressUp()
        glider.stop()
        let old = Array(live.values) + leavers
        for row in old {
            row.field.delegate = nil
            row.field.onDeleteAtStart = nil
            row.field.resignFirstResponder()
        }
        (live, leavers) = ([:], [])
        editingID = nil
        swiping = nil
        freshID = nil
        return old
    }
}

import SwiftUI
import UIKit

/// 記下新的一行之後捲回最上面（1.1 toTop）：自己逐格捲 0.3 秒、先快後慢，手指一碰到紙就停；減少動態直接到頂。
/// 不用系統的捲動動畫：新行一插進來版面就變了，自己算每一格的位置比較不會頓
final class Glide: NSObject {
    private var link: CADisplayLink?
    private var from: CGFloat = 0
    private var start: CFTimeInterval = 0
    private weak var scroll: UIScrollView?

    func toTop(_ view: UIScrollView) {
        stop()
        let top = -view.adjustedContentInset.top
        guard view.contentOffset.y > top else { return }
        if UIAccessibility.isReduceMotionEnabled {
            view.contentOffset.y = top
            return
        }
        scroll = view
        from = view.contentOffset.y
        start = CACurrentMediaTime()
        let next = CADisplayLink(target: self, selector: #selector(step(_:)))
        next.add(to: .main, forMode: .common)
        link = next
    }

    @objc private func step(_: CADisplayLink) {
        guard let scroll, !scroll.isTracking else {
            stop()
            return
        }
        let progress = min(1, (CACurrentMediaTime() - start) / Tok.Motion.toTopSeconds)
        let eased = 1 - pow(1 - progress, 3)
        let top = -scroll.adjustedContentInset.top
        scroll.contentOffset.y = from + (top - from) * CGFloat(eased)
        if progress >= 1 {
            stop()
        }
    }

    func stop() {
        link?.invalidate()
        link = nil
    }
}

extension ListTouch {
    /// 搜尋點過來的那一行離現在看的地方在幾個螢幕內（還沒排出來的行當作很遠，直接跳過去）
    func near(_ id: String, screens: CGFloat) -> Bool {
        guard let scroll, let row = frames[id] else { return false }
        let height = scroll.bounds.height
        return abs(row.minY - height * Tok.Shape.seekAnchor.y - scroll.contentOffset.y) < height * screens
    }
}

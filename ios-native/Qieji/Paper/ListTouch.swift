import SwiftUI
import UIKit

/// 清單的手勢全部掛在捲動區上，一組就管整張紙（不是每一行各掛一組）：
/// 左右滑＝劃掉／刪除、右邊把手上下拖＝排順序、點一下＝改那一行、按住＝選單。
/// 手指先往上下動就交給系統捲動，所以捲動的手感是系統原生的。
final class ListTouch: NSObject, ObservableObject, UIGestureRecognizerDelegate {
    // 畫面要跟著動的值
    @Published var swipeID: String?
    @Published var swipeTx: CGFloat = 0
    @Published var swipeArmed = false
    @Published var dragID: String?
    @Published var dragDy: CGFloat = 0
    @Published var dragFrom = -1
    @Published var dragTo = -1
    @Published var dragHeight: CGFloat = 0
    @Published var floatY: CGFloat = 0 // 拖著的那一行浮在清單上面的位置（從清單頂算）

    /// 清單交進來的
    var order: [String] = []
    /// 每一行在捲動內容裡的位置（只有現在掛在畫面附近的行）
    var frames: [String: CGRect] = [:] {
        didSet {
            for (id, frame) in frames {
                heights[id] = frame.height
            }
        }
    }

    /// 看過的每一行多高（行離開畫面也記著：拖得很遠時靠它算位置）
    private var heights: [String: CGFloat] = [:]
    var onStrike: (String) -> Void = { _ in }
    var onDelete: (String) -> Void = { _ in }
    var onTap: (String, CGPoint) -> Void = { _, _ in }
    var onTapBlank: () -> Void = {}
    var onMove: (String, Int) -> Void = { _, _ in }
    var onLongPress: (String) -> Void = { _ in }

    private weak var scroll: UIScrollView?
    private let swipePan = UIPanGestureRecognizer()
    private let gripPan = UIPanGestureRecognizer()
    private let tap = UITapGestureRecognizer()
    private let hold = UILongPressGestureRecognizer()
    private let tick = UISelectionFeedbackGenerator()
    private let thud = UIImpactFeedbackGenerator(style: .light)
    private var dragScrollStart: CGFloat = 0
    private var landing = false
    private var autoLink: CADisplayLink?
    private var autoSpeed: CGFloat = 0 // 點／秒，正的往下捲
    private var dragTouchY: CGFloat = 0 // 手指在捲動區裡的位置（跟著捲動內容走的座標）
    private var dragStartY: CGFloat = 0
    private var heldTop: CGFloat = 0 // 拖著的那一行原本的頂端（捲動內容的座標）
    private var touchStart: CGPoint = .zero // 手指按下去的地方（捲動內容的座標）

    /// 把手那一條有多寬（從右邊算）
    static let gripStrip = Tok.Shape.hitMin + Tok.Space.xs * 3

    func attach(_ view: UIScrollView) {
        guard scroll !== view else { return }
        scroll = view
        swipePan.addTarget(self, action: #selector(onSwipe(_:)))
        gripPan.addTarget(self, action: #selector(onGrip(_:)))
        tap.addTarget(self, action: #selector(onTapped(_:)))
        hold.addTarget(self, action: #selector(onHeld(_:)))
        hold.minimumPressDuration = Tok.Gesture.longPress
        hold.allowableMovement = Tok.Gesture.longPressMove
        tap.cancelsTouchesInView = false
        for gesture in [swipePan, gripPan, tap, hold] as [UIGestureRecognizer] {
            gesture.delegate = self
            view.addGestureRecognizer(gesture)
        }
        // 我們的兩個拖曳一開始就會決定要不要接（方向、位置不對立刻放棄），系統捲動等它們放棄才開始，幾乎沒有延遲
        view.panGestureRecognizer.require(toFail: swipePan)
        view.panGestureRecognizer.require(toFail: gripPan)
    }

    /// 記下新的一行之後捲回最上面
    func scrollToTop() {
        guard let scroll else { return }
        scroll.setContentOffset(CGPoint(x: 0, y: -scroll.adjustedContentInset.top), animated: true)
    }

    // MARK: 誰可以開始

    func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
        guard let scroll, dragID == nil, !landing else { return false }
        let point = gesture === tap ? gesture.location(in: scroll) : touchStart
        let inGrip = point.x > scroll.bounds.width - ListTouch.gripStrip
        if gesture === swipePan {
            let speed = swipePan.velocity(in: scroll)
            return row(at: point) != nil && abs(speed.x) > abs(speed.y) && swipeID == nil
        }
        if gesture === gripPan {
            let speed = gripPan.velocity(in: scroll)
            return inGrip && row(at: point) != nil && abs(speed.y) >= abs(speed.x)
        }
        if gesture === hold {
            return row(at: point) != nil && !inGrip
        }
        return true
    }

    func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        // 正在打字的那一行自己收觸控（移游標、選字），不跟清單的手勢搶
        if gesture === tap || gesture === hold, touch.view is UITextView {
            return false
        }
        if let scroll, gesture !== tap {
            touchStart = touch.location(in: scroll)
        }
        return true
    }

    private func row(at point: CGPoint) -> String? {
        frames.first { $0.value.contains(point) }?.key
    }

    // MARK: 左右滑

    private func strikeLine(_ width: CGFloat) -> CGFloat {
        min(Tok.Gesture.strikeMax, width * Tok.Gesture.strikeRatio)
    }

    private func deleteLine(_ width: CGFloat) -> CGFloat {
        min(Tok.Gesture.deleteMax, width * Tok.Gesture.deleteRatio)
    }

    @objc private func onSwipe(_ gesture: UIPanGestureRecognizer) {
        guard let scroll else { return }
        let width = scroll.bounds.width
        switch gesture.state {
        case .began:
            swipeID = row(at: touchStart)
            swipeTx = 0
            swipeArmed = false
            tick.prepare()
        case .changed:
            let shift = gesture.translation(in: scroll).x
            let armed = shift > 0 ? shift >= strikeLine(width) : -shift >= deleteLine(width)
            if armed != swipeArmed {
                swipeArmed = armed
                if armed {
                    tick.selectionChanged()
                }
            }
            swipeTx = shift
        case .ended, .cancelled, .failed:
            finishSwipe(width: width, cancelled: gesture.state != .ended)
        default: break
        }
    }

    private func finishSwipe(width: CGFloat, cancelled: Bool) {
        guard let id = swipeID else { return }
        let shift = swipeTx
        let armed = swipeArmed && !cancelled
        swipeArmed = false
        if armed, shift < 0 {
            // 刪除：整行滑出畫面，滑完才真的拿掉
            withAnimation(Tok.Motion.deleteSlide) { swipeTx = -width }
            DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Motion.deleteSlideSeconds) { [weak self] in
                self?.onDelete(id)
                self?.swipeID = nil
                self?.swipeTx = 0
            }
            return
        }
        if armed {
            onStrike(id)
        }
        withAnimation(armed ? Tok.Motion.strikeReturn : Tok.Motion.snapBack) { swipeTx = 0 }
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Motion.deleteSlideSeconds) { [weak self] in
            if self?.swipeID == id, self?.swipeTx == 0 {
                self?.swipeID = nil
            }
        }
    }

    // MARK: 把手拖順序

    @objc private func onGrip(_ gesture: UIPanGestureRecognizer) {
        guard let scroll else { return }
        switch gesture.state {
        case .began:
            guard let id = row(at: touchStart), let from = order.firstIndex(of: id) else { return }
            dragScrollStart = scroll.contentOffset.y
            dragStartY = touchStart.y - scroll.contentOffset.y
            dragTouchY = gesture.location(in: scroll).y - scroll.contentOffset.y
            dragHeight = frames[id]?.height ?? Tok.Shape.rowMin
            heldTop = frames[id]?.minY ?? 0
            floatY = heldTop - scroll.contentOffset.y
            dragFrom = from
            dragTo = from
            dragDy = 0
            dragID = id
            tick.selectionChanged()
            thud.prepare()
            followFinger()
        case .changed:
            guard dragID != nil else { return }
            dragTouchY = gesture.location(in: scroll).y - scroll.contentOffset.y
            followFinger()
            steerAutoScroll()
        case .ended, .cancelled, .failed:
            stopAutoScroll()
            land()
        default: break
        }
    }

    /// 拖著的那行跟著手指：手指移了多少＋這段時間紙自己捲了多少
    private func followFinger() {
        guard let scroll, let id = dragID else {
            return
        }
        dragDy = (dragTouchY - dragStartY) + (scroll.contentOffset.y - dragScrollStart)
        floatY = heldTop + dragDy - scroll.contentOffset.y
        let target = targetIndex(for: id)
        if target != dragTo {
            dragTo = target
            tick.selectionChanged()
        }
    }

    /// 手指離上緣、下緣不到 dragAutoEdge：紙往那邊捲，貼到最邊上最快
    private func steerAutoScroll() {
        guard let scroll else {
            return
        }
        let edge = Tok.Gesture.dragAutoEdge
        let top = dragTouchY, bottom = scroll.bounds.height - scroll.adjustedContentInset.bottom - dragTouchY
        if top < edge {
            autoSpeed = -Tok.Gesture.dragAutoSpeed * min(1, (edge - top) / edge)
        } else if bottom < edge {
            autoSpeed = Tok.Gesture.dragAutoSpeed * min(1, (edge - bottom) / edge)
        } else {
            autoSpeed = 0
        }
        if autoSpeed == 0 {
            stopAutoScroll()
        } else if autoLink == nil {
            let link = CADisplayLink(target: self, selector: #selector(autoStep(_:)))
            link.add(to: .main, forMode: .common)
            autoLink = link
        }
    }

    @objc private func autoStep(_ link: CADisplayLink) {
        guard let scroll, dragID != nil else {
            stopAutoScroll()
            return
        }
        let low = -scroll.adjustedContentInset.top
        let high = max(low, scroll.contentSize.height + scroll.adjustedContentInset.bottom - scroll.bounds.height)
        let next = min(high, max(low, scroll.contentOffset.y + autoSpeed * CGFloat(link.targetTimestamp - link.timestamp)))
        if next == scroll.contentOffset.y {
            return
        }
        scroll.contentOffset.y = next
        followFinger()
    }

    private func stopAutoScroll() {
        autoLink?.invalidate()
        autoLink = nil
        autoSpeed = 0
    }

    /// 拖著的那行現在的中心，排在其他行的第幾個
    private func targetIndex(for id: String) -> Int {
        let mid = heldTop + dragHeight / 2 + dragDy
        var slot = 0
        var top: CGFloat = 0
        for other in order {
            let height = heights[other] ?? Tok.Shape.rowMin
            if other != id, top + height / 2 < mid {
                slot += 1
            }
            top += height
        }
        return min(slot, max(0, order.count - 1))
    }

    /// 放手：先滑進落點，滑完才真的換資料（資料一換，版面就是落點那個樣子，不會閃）
    private func land() {
        guard let id = dragID else { return }
        let from = dragFrom, target = dragTo
        landing = true
        thud.impactOccurred()
        let rest = landingOffset(from: from, target: target)
        let offset = scroll?.contentOffset.y ?? 0
        withAnimation(Tok.Motion.dragLand) {
            dragDy = rest
            floatY = heldTop + rest - offset
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Motion.deleteSlideSeconds) { [weak self] in
            guard let self else { return }
            var quiet = Transaction()
            quiet.disablesAnimations = true
            withTransaction(quiet) {
                if target != from {
                    self.onMove(id, target)
                }
                self.dragID = nil
                self.dragDy = 0
                self.dragFrom = -1
                self.dragTo = -1
            }
            landing = false
        }
    }

    private func landingOffset(from: Int, target: Int) -> CGFloat {
        guard from != target else { return 0 }
        let between = from < target ? order[(from + 1) ... target] : order[target ..< from]
        let sum = between.reduce(CGFloat(0)) { $0 + (heights[$1] ?? Tok.Shape.rowMin) }
        return from < target ? sum : -sum
    }

    /// 排順序時，別的行要讓多少
    func giveWay(index: Int) -> CGFloat {
        guard dragFrom >= 0, index != dragFrom else { return 0 }
        if dragFrom < dragTo, index > dragFrom, index <= dragTo {
            return -dragHeight
        }
        if dragFrom > dragTo, index < dragFrom, index >= dragTo {
            return dragHeight
        }
        return 0
    }

    // MARK: 點、按住

    @objc private func onTapped(_ gesture: UITapGestureRecognizer) {
        guard let scroll, gesture.state == .ended else { return }
        let point = gesture.location(in: scroll)
        guard let id = row(at: point), let frame = frames[id] else { onTapBlank(); return }
        if point.x > scroll.bounds.width - ListTouch.gripStrip {
            return
        }
        onTap(id, CGPoint(x: point.x - frame.minX - Tok.Space.lg, y: point.y - frame.minY))
    }

    @objc private func onHeld(_ gesture: UILongPressGestureRecognizer) {
        guard gesture.state == .began, let id = row(at: touchStart) else { return }
        tick.selectionChanged()
        onLongPress(id)
    }
}

/// 找到包著清單的那個系統捲動區，把手勢掛上去
struct ScrollHook: UIViewRepresentable {
    let touch: ListTouch

    func makeUIView(context _: Context) -> UIView {
        let view = HookView()
        view.touch = touch
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_: UIView, context _: Context) {}

    private final class HookView: UIView {
        weak var touch: ListTouch?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            var next = superview
            while let view = next {
                if let scroll = view as? UIScrollView {
                    touch?.attach(scroll)
                    return
                }
                next = view.superview
            }
        }
    }
}

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

    // 清單交進來的
    var order: [String] = []
    var frames: [String: CGRect] = [:] // 每一行在捲動內容裡的位置
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
        let point = gesture.location(in: scroll)
        let inGrip = point.x > scroll.bounds.width - ListTouch.gripStrip
        if gesture === swipePan {
            let speed = swipePan.velocity(in: scroll)
            return row(at: point) != nil && abs(speed.x) > abs(speed.y) && swipeID == nil
        }
        if gesture === gripPan {
            let speed = gripPan.velocity(in: scroll)
            return inGrip && row(at: point) != nil && abs(speed.y) >= abs(speed.x)
        }
        if gesture === hold { return row(at: point) != nil && !inGrip }
        return true
    }

    func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        // 正在打字的那一行自己收觸控（移游標、選字），不跟清單的手勢搶
        if gesture === tap || gesture === hold, touch.view is UITextView { return false }
        return true
    }

    private func row(at point: CGPoint) -> String? {
        frames.first { $0.value.contains(point) }?.key
    }

    // MARK: 左右滑

    private func strikeLine(_ width: CGFloat) -> CGFloat { min(Tok.Gesture.strikeMax, width * Tok.Gesture.strikeRatio) }
    private func deleteLine(_ width: CGFloat) -> CGFloat { min(Tok.Gesture.deleteMax, width * Tok.Gesture.deleteRatio) }

    @objc private func onSwipe(_ gesture: UIPanGestureRecognizer) {
        guard let scroll else { return }
        let width = scroll.bounds.width
        switch gesture.state {
        case .began:
            swipeID = row(at: gesture.location(in: scroll))
            swipeTx = 0
            swipeArmed = false
            tick.prepare()
        case .changed:
            let shift = gesture.translation(in: scroll).x
            let armed = shift > 0 ? shift >= strikeLine(width) : -shift >= deleteLine(width)
            if armed != swipeArmed {
                swipeArmed = armed
                if armed { tick.selectionChanged() }
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
        if armed { onStrike(id) }
        withAnimation(armed ? Tok.Motion.strikeReturn : Tok.Motion.snapBack) { swipeTx = 0 }
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Motion.deleteSlideSeconds) { [weak self] in
            if self?.swipeID == id, self?.swipeTx == 0 { self?.swipeID = nil }
        }
    }

    // MARK: 把手拖順序

    @objc private func onGrip(_ gesture: UIPanGestureRecognizer) {
        guard let scroll else { return }
        switch gesture.state {
        case .began:
            guard let id = row(at: gesture.location(in: scroll)), let from = order.firstIndex(of: id) else { return }
            dragScrollStart = scroll.contentOffset.y
            dragHeight = frames[id]?.height ?? Tok.Shape.rowMin
            dragFrom = from
            dragTo = from
            dragDy = 0
            dragID = id
            tick.selectionChanged()
            thud.prepare()
        case .changed:
            guard let id = dragID else { return }
            dragDy = gesture.translation(in: scroll).y + (scroll.contentOffset.y - dragScrollStart)
            let target = targetIndex(for: id)
            if target != dragTo {
                dragTo = target
                tick.selectionChanged()
            }
        case .ended, .cancelled, .failed:
            land()
        default: break
        }
    }

    /// 拖著的那行現在的中心，排在其他行的第幾個
    private func targetIndex(for id: String) -> Int {
        guard let mine = frames[id] else { return dragFrom }
        let mid = mine.midY + dragDy
        var slot = 0
        for other in order where other != id {
            guard let frame = frames[other] else { continue }
            if frame.midY < mid { slot += 1 }
        }
        return min(slot, max(0, order.count - 1))
    }

    /// 放手：先滑進落點，滑完才真的換資料（資料一換，版面就是落點那個樣子，不會閃）
    private func land() {
        guard let id = dragID else { return }
        let from = dragFrom, target = dragTo
        landing = true
        thud.impactOccurred()
        withAnimation(Tok.Motion.dragLand) { dragDy = landingOffset(id: id, from: from, target: target) }
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Motion.deleteSlideSeconds) { [weak self] in
            guard let self else { return }
            var quiet = Transaction()
            quiet.disablesAnimations = true
            withTransaction(quiet) {
                if target != from { self.onMove(id, target) }
                self.dragID = nil
                self.dragDy = 0
                self.dragFrom = -1
                self.dragTo = -1
            }
            self.landing = false
        }
    }

    private func landingOffset(id: String, from: Int, target: Int) -> CGFloat {
        guard from != target else { return 0 }
        let between = from < target ? order[(from + 1) ... target] : order[target ..< from]
        let sum = between.reduce(CGFloat(0)) { $0 + (frames[$1]?.height ?? Tok.Shape.rowMin) }
        _ = id
        return from < target ? sum : -sum
    }

    /// 排順序時，別的行要讓多少
    func giveWay(index: Int) -> CGFloat {
        guard dragFrom >= 0, index != dragFrom else { return 0 }
        if dragFrom < dragTo, index > dragFrom, index <= dragTo { return -dragHeight }
        if dragFrom > dragTo, index < dragFrom, index >= dragTo { return dragHeight }
        return 0
    }

    // MARK: 點、按住

    @objc private func onTapped(_ gesture: UITapGestureRecognizer) {
        guard let scroll, gesture.state == .ended else { return }
        let point = gesture.location(in: scroll)
        guard let id = row(at: point), let frame = frames[id] else { onTapBlank(); return }
        if point.x > scroll.bounds.width - ListTouch.gripStrip { return }
        onTap(id, CGPoint(x: point.x - frame.minX - Tok.Space.lg, y: point.y - frame.minY))
    }

    @objc private func onHeld(_ gesture: UILongPressGestureRecognizer) {
        guard let scroll, gesture.state == .began, let id = row(at: gesture.location(in: scroll)) else { return }
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

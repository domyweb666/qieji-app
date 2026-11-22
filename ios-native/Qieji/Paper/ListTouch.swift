import SwiftUI
import UIKit

/// 清單的手勢全部掛在捲動區上，一組就管整張紙（不是每一行各掛一組）：
/// 左右滑＝劃掉／刪除、右邊把手上下拖＝排順序、點一下＝改那一行、按住＝選單。
/// 手指先往上下動就交給系統捲動，所以捲動的手感是系統原生的。
final class ListTouch: NSObject, ObservableObject, UIGestureRecognizerDelegate {
    // 畫面要跟著動的值
    @Published var swipeID: String? // 手指正在滑的那一行
    @Published var swipeArmed = false
    @Published var slides: [String: CGFloat] = [:] // 每一行往左右移了多少（正在滑的、放手後還在滑回或滑出的）
    @Published var dims: [String: Double] = [:] // 減少動態時劃掉暗一下、刪除淡出
    @Published var labelScale: CGFloat = 1 // 底下「劃掉／刪除」越線那一刻放大再彈回
    private(set) var width: CGFloat = 0
    @Published var dragID: String?
    @Published var dragDy: CGFloat = 0
    @Published var dragFrom = -1
    @Published var dragTo = -1
    @Published var dragHeight: CGFloat = 0
    @Published var floatY: CGFloat = 0 // 拖著的那一行浮在清單上面的位置（從清單頂算）
    @Published var fading: Set<String> = [] // 從選單刪的行：先淡出，淡完才真的拿掉

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
    /// 按住一行：那一行的 id 和它在螢幕上的底邊（視窗座標，選單卡接在下面）
    var onLongPress: (String, CGFloat) -> Void = { _, _ in }

    /// 拿起一行排順序那一刻（1.1：拿起時收鍵盤）
    var onDragBegan: () -> Void = {}

    private weak var scroll: UIScrollView?
    private let swipePan = SwipePan()
    private let gripPan = GripPan()
    private let tap = UITapGestureRecognizer()
    private let hold = UILongPressGestureRecognizer()
    private var dragScrollStart: CGFloat = 0
    private var landing = false
    private var landTicket = 0 // 每次放手加一：落定的計時器拿著舊號碼就不做事（中途已經被 landNow 收掉）
    private var autoLink: CADisplayLink?
    private var autoSpeed: CGFloat = 0 // 點／秒，正的往下捲
    private var dragTouchY: CGFloat = 0 // 手指在捲動區裡的位置（跟著捲動內容走的座標）
    private var dragStartY: CGFloat = 0
    private var heldTop: CGFloat = 0 // 拖著的那一行原本的頂端（捲動內容的座標）
    private var touchStart: CGPoint = .zero // 手指按下去的地方（捲動內容的座標）

    /// 把手那一條有多寬（從右邊算，1.1 gripCol＝44）
    static let gripStrip = Tok.Shape.hitMin

    func attach(_ view: UIScrollView) {
        guard scroll !== view else { return }
        scroll = view
        gripPan.strip = ListTouch.gripStrip
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
        // 還在滑進落點時手指又碰了：馬上落定，這一下照常收
        landNow()
        guard let scroll, dragID == nil else { return false }
        let point = gesture === tap ? gesture.location(in: scroll) : touchStart
        let inGrip = point.x > scroll.bounds.width - ListTouch.gripStrip
        if gesture === swipePan {
            // 方向在 SwipePan 裡判斷（左右動 14 點才成立、先上下動 12 點就放棄）
            return row(at: point) != nil && swipeID == nil
        }
        if gesture === gripPan {
            // 方向在 GripPan 裡判斷（上下動 1 點就拿起、先左右動 10 點就放棄）
            return inGrip && row(at: point) != nil
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

    /// 底下「劃掉／刪除」的字多亮：越接近門檻越亮（0.35 到 1），越線就全亮（1.1 SwipeUnder）
    func glow(_ slide: CGFloat, armed: Bool) -> Double {
        if armed {
            return 1
        }
        let line = slide > 0 ? strikeLine(width) : deleteLine(width)
        let reach = max(1, line - Tok.Gesture.swipeActivate)
        let progress = Double(min(1, abs(slide) / reach))
        return Tok.Motion.swipeLabelFrom + (1 - Tok.Motion.swipeLabelFrom) * progress
    }

    @objc private func onSwipe(_ gesture: SwipePan) {
        guard let scroll else { return }
        width = scroll.bounds.width
        switch gesture.state {
        case .began:
            guard let id = row(at: touchStart) else { return }
            swipeID = id
            swipeArmed = false
            labelScale = 1
            dims[id] = nil
            Haptic.prepare()
            follow(gesture)
        case .changed:
            follow(gesture)
        case .ended, .cancelled, .failed:
            finishSwipe(cancelled: gesture.state != .ended, speed: gesture.speedX)
        default: break
        }
    }

    /// 行跟著手指：手勢走了 14 點才成立，扣掉那一段，行從手指底下 0 開始跟（不先跳一格）；門檻仍照手指走的距離判
    private func follow(_ gesture: SwipePan) {
        guard let id = swipeID else { return }
        let shift = gesture.shiftX
        let gap = Tok.Gesture.swipeActivate
        slides[id] = shift > 0 ? max(0, shift - gap) : min(0, shift + gap)
        let armed = shift > 0 ? shift > strikeLine(width) : -shift > deleteLine(width)
        guard armed != swipeArmed else { return }
        swipeArmed = armed
        guard armed else { return }
        Haptic.arm()
        // 越線那一刻字放大，再彈回原本大小（跟震動同一刻）；減少動態只有變亮
        if !UIAccessibility.isReduceMotionEnabled {
            labelScale = Tok.Motion.swipeLabelArm
            DispatchQueue.main.async { [weak self] in
                withAnimation(Tok.Motion.swipeLabel) { self?.labelScale = 1 }
            }
        }
    }

    /// 放手：滑回、滑出、彈回都接著手指放開的速度（1.1 2-4 做法 3）。劃掉在放手那一刻就改資料。
    /// 這一行放手後馬上可以滑下一行（連續劃、連續刪不會漏接）。減少動態：不滑，劃掉整行暗一下再亮回、刪除淡出
    private func finishSwipe(cancelled: Bool, speed: CGFloat) {
        guard let id = swipeID else { return }
        let shift = slides[id] ?? 0
        let armed = swipeArmed && !cancelled
        swipeID = nil
        swipeArmed = false
        let calm = UIAccessibility.isReduceMotionEnabled
        let toward = { (goal: CGFloat) -> CGFloat in abs(goal - shift) < 1 ? 0 : speed / (goal - shift) }
        if armed, shift < 0 {
            if calm {
                slides[id] = nil
                Motions.run(Tok.Motion.fade, fallback: Tok.Motion.fadeSeconds) { self.dims[id] = 0 } done: { [weak self] in
                    self?.removeLine(id)
                }
            } else {
                Motions.run(Tok.Motion.deleteSpring(velocity: toward(-width)), fallback: Tok.Motion.deleteSlideSeconds) {
                    self.slides[id] = -width
                } done: { [weak self] in
                    self?.removeLine(id)
                }
            }
            return
        }
        if armed {
            onStrike(id)
        }
        if calm {
            slides[id] = nil
            if armed {
                dims[id] = Tok.Motion.reducedDimFrom
                withAnimation(Tok.Motion.fade) { dims[id] = 1 }
            }
            return
        }
        Motions.run(Tok.Motion.returnSpring(velocity: toward(0)), fallback: Tok.Motion.dragLandSeconds) {
            slides[id] = 0
        } done: { [weak self] in
            if self?.slides[id] == 0 {
                self?.slides[id] = nil
            }
        }
    }

    /// 滑出畫面（或淡出）之後真的拿掉：下面的行滑上來補位（1.1 rowShift 0.18 秒）
    private func removeLine(_ id: String) {
        withAnimation(UIAccessibility.isReduceMotionEnabled ? nil : Tok.Motion.rowShift) {
            onDelete(id)
        }
        slides[id] = nil
        dims[id] = nil
    }

    // MARK: 把手拖順序

    @objc private func onGrip(_ gesture: GripPan) {
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
            Haptic.prepare()
            Haptic.lift()
            onDragBegan()
            followFinger()
        case .changed:
            guard dragID != nil else { return }
            dragTouchY = gesture.location(in: scroll).y - scroll.contentOffset.y
            followFinger()
            steerAutoScroll()
        case .ended, .cancelled, .failed:
            stopAutoScroll()
            land(speed: gesture.state == .ended ? gesture.speedY : 0)
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
            Haptic.pass()
        }
    }

    /// 手指離上緣、下緣不到 dragAutoEdge：紙往那邊捲，貼到最邊上最快
    private func steerAutoScroll() {
        guard let scroll else {
            return
        }
        let edge = Tok.Gesture.dragAutoEdge
        // 下緣從右下 ＋ 的上方算起（1.1 listBot：扣掉浮在紙上的 ＋ 那一截）
        let floor = scroll.bounds.height - scroll.adjustedContentInset.bottom - Tok.Shape.fab - Tok.Space.sm * 2
        let top = dragTouchY, bottom = floor - dragTouchY
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

    /// 放手：帶著手指放開的速度滑進落點（1.1 dragLand 接速度），滑完才真的換資料（資料一換，版面就是落點那個樣子，不會閃）。
    /// speed＝手指放開時上下的速度（點／秒）
    private func land(speed: CGFloat) {
        guard dragID != nil else { return }
        landing = true
        landTicket += 1
        let ticket = landTicket
        Haptic.land()
        let rest = landingOffset(from: dragFrom, target: dragTo)
        let offset = scroll?.contentOffset.y ?? 0
        let distance = rest - dragDy
        let spring = Tok.Motion.landSpring(velocity: abs(distance) < 1 ? 0 : speed / distance)
        Motions.run(spring, fallback: Tok.Motion.dragLandSeconds) {
            dragDy = rest
            floatY = heldTop + rest - offset
        } done: { [weak self] in
            guard let self, landTicket == ticket else { return }
            finishLanding()
        }
    }

    /// 還在滑進落點時手指又碰了：不等滑完，馬上落定
    private func landNow() {
        guard landing else { return }
        landTicket += 1
        finishLanding()
    }

    private func finishLanding() {
        guard let id = dragID else {
            landing = false
            return
        }
        let from = dragFrom, target = dragTo
        var quiet = Transaction()
        quiet.disablesAnimations = true
        withTransaction(quiet) {
            if target != from {
                onMove(id, target)
            }
            dragID = nil
            dragDy = 0
            dragFrom = -1
            dragTo = -1
        }
        landing = false
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

    /// 點一下：改那一行（點在把手上也一樣，1.1 把手只收拖曳）。游標落在點的位置
    @objc private func onTapped(_ gesture: UITapGestureRecognizer) {
        guard let scroll, gesture.state == .ended else { return }
        let point = gesture.location(in: scroll)
        guard let id = row(at: point), let frame = frames[id] else { onTapBlank(); return }
        onTap(id, CGPoint(x: point.x - frame.minX - Tok.Space.gutter, y: point.y - frame.minY))
    }

    @objc private func onHeld(_ gesture: UILongPressGestureRecognizer) {
        guard gesture.state == .began, let scroll, let id = row(at: touchStart), let frame = frames[id] else { return }
        Haptic.menu()
        // 位置表是捲動內容的座標；換成視窗座標（捲動區自己的座標就是內容座標）
        onLongPress(id, scroll.convert(CGPoint(x: 0, y: frame.maxY), to: nil).y)
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

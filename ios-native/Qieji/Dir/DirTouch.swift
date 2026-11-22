import SwiftUI
import UIKit

/// 目錄的手勢掛在系統的捲動區上（跟紙面 ListTouch 同一個做法）：翻頁是系統原生的整頁捲動，
/// 點、按住、拖磚由這裡接，再問 DirModel 那個點是哪一塊。目錄的格子、打開的資料夾各一組。
final class DirTouch: NSObject, UIGestureRecognizerDelegate {
    let zone: DirModel.Zone
    weak var model: DirModel?

    private weak var scroll: UIScrollView?
    private let tap = UITapGestureRecognizer()
    private let hold = UILongPressGestureRecognizer()
    private let pan = UIPanGestureRecognizer() // 抖動中直接拖
    private let press = UILongPressGestureRecognizer() // 手指一按下就算（只管磚變淡；抖動中是放大）
    private var start: CGPoint = .zero // 手指按下去的地方（螢幕座標）
    private var armed = false // 按住到時間了，再拖一段就拿起
    private var holdDrag = false
    private var panDrag = false
    private var panTried = false // 這次抖動中的拖已經試過拿起了
    private var speed = FingerSpeed()
    private var watch: NSKeyValueObservation?
    private var lastPage = 0

    init(zone: DirModel.Zone) {
        self.zone = zone
        super.init()
        tap.addTarget(self, action: #selector(onTap(_:)))
        hold.addTarget(self, action: #selector(onHold(_:)))
        pan.addTarget(self, action: #selector(onPan(_:)))
        press.addTarget(self, action: #selector(onPress(_:)))
        hold.minimumPressDuration = Tok.Gesture.longPress
        hold.allowableMovement = Tok.Gesture.longPressMove
        press.minimumPressDuration = 0
        for gesture in [tap, hold, pan, press] as [UIGestureRecognizer] {
            gesture.delegate = self
            gesture.cancelsTouchesInView = false
        }
    }

    func attach(_ view: UIScrollView) {
        guard scroll !== view else { return }
        scroll = view
        lastPage = 0
        view.isPagingEnabled = true
        view.showsHorizontalScrollIndicator = false
        for gesture in [tap, hold, pan, press] as [UIGestureRecognizer] {
            view.addGestureRecognizer(gesture)
        }
        // 抖動中手指在磚上一動就是拿起來；不在磚上我們的拖曳立刻放棄，系統才開始翻頁
        view.panGestureRecognizer.require(toFail: pan)
        // 開始翻頁：按著變淡的那塊復原（手指還在螢幕上，press 不會自己結束）
        view.panGestureRecognizer.addTarget(self, action: #selector(onPaging(_:)))
        watch = view.observe(\.contentOffset) { [weak self] view, _ in self?.scrolled(view) }
    }

    func scroll(toPage page: Int, animated: Bool) {
        guard let scroll else { return }
        scroll.setContentOffset(CGPoint(x: CGFloat(page) * scroll.bounds.width, y: 0), animated: animated)
    }

    private func scrolled(_ view: UIScrollView) {
        let width = view.bounds.width
        guard width > 0 else { return }
        let index = max(0, Int((view.contentOffset.x / width).rounded()))
        guard index != lastPage else { return }
        lastPage = index
        let zone = zone
        // 捲動的回報可能落在畫面更新途中，晚一格再改狀態
        DispatchQueue.main.async { [weak self] in self?.model?.scrolled(zone, to: index) }
    }

    // MARK: 誰可以開始

    func gestureRecognizer(_: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard let model else { return false }
        // 上一張還在滑進落點：不讓手指等，先落定再收這一下
        model.landNow()
        guard !model.busy, !holdDrag, !panDrag else { return false }
        start = touch.location(in: nil)
        return true
    }

    func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
        guard let model else { return false }
        if gesture === pan {
            let held = hold.state == .began || hold.state == .changed
            return model.editing && !held && model.drag == nil && model.hit(zone, start) != nil
        }
        if gesture === hold {
            return !model.editing && model.drag == nil
        }
        return true
    }

    func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        gesture === press || other === press
    }

    // MARK: 點、按住、拖

    @objc private func onTap(_ gesture: UITapGestureRecognizer) {
        guard gesture.state == .ended else { return }
        model?.tap(zone, at: gesture.location(in: nil))
    }

    @objc private func onPaging(_ gesture: UIPanGestureRecognizer) {
        if gesture.state == .began {
            model?.pressUp()
        }
    }

    @objc private func onPress(_ gesture: UILongPressGestureRecognizer) {
        switch gesture.state {
        case .began: model?.pressDown(zone, at: start)
        case .ended, .cancelled, .failed: model?.pressUp()
        default: break
        }
    }

    /// 按住：到時間先跳選單（或進抖動），手指再拖超過 tileDragHeld 才拿起來，之後一路跟到放手
    @objc private func onHold(_ gesture: UILongPressGestureRecognizer) {
        guard let model else { return }
        let finger = gesture.location(in: nil)
        switch gesture.state {
        case .began:
            holdDrag = false
            speed.reset()
            armed = model.holdBegan(zone, at: start)
            if armed {
                scroll?.panGestureRecognizer.isEnabled = false
            }
        case .changed:
            if armed, !holdDrag, hypot(finger.x - start.x, finger.y - start.y) >= Tok.Gesture.tileDragHeld {
                armed = false
                holdDrag = model.dragBegin(zone, start: start, finger: finger)
            }
            if holdDrag {
                speed.add(finger)
                model.dragMove(finger)
            }
        case .ended, .cancelled, .failed:
            if holdDrag {
                model.dragEnd(velocity: gesture.state == .ended ? speed.velocity : .zero)
            }
            holdDrag = false
            armed = false
            scroll?.panGestureRecognizer.isEnabled = true
        default: break
        }
    }

    @objc private func onPan(_ gesture: UIPanGestureRecognizer) {
        guard let model else { return }
        let finger = gesture.location(in: nil)
        switch gesture.state {
        case .began, .changed:
            if gesture.state == .began {
                panTried = false
            }
            // 抖動中手指在磚上移超過 12 點才拿起（1.1），之前還算是點
            if !panTried, hypot(finger.x - start.x, finger.y - start.y) >= Tok.Gesture.editLift {
                panTried = true
                panDrag = model.dragBegin(zone, start: start, finger: finger)
            }
            if panDrag {
                model.dragMove(finger)
            }
        case .ended, .cancelled, .failed:
            if panDrag {
                model.dragEnd(velocity: gesture.state == .ended ? gesture.velocity(in: nil) : .zero)
            }
            panDrag = false
            panTried = false
        default: break
        }
    }
}

/// 放手時手指多快：記最近一小段時間的位置，拿頭尾算（按住之後拖的那種手勢，系統不給速度）
struct FingerSpeed {
    private var points: [CGPoint] = []
    private var times: [CFTimeInterval] = []

    mutating func reset() {
        points.removeAll()
        times.removeAll()
    }

    mutating func add(_ point: CGPoint) {
        let now = CACurrentMediaTime()
        points.append(point)
        times.append(now)
        while let first = times.first, now - first > Tok.Gesture.speedWindow, times.count > 2 {
            points.removeFirst()
            times.removeFirst()
        }
    }

    /// 每秒幾點；手指停住超過那一小段時間才放手＝0
    var velocity: CGPoint {
        guard let first = points.first, let last = points.last, let begin = times.first, let end = times.last,
              end > begin, CACurrentMediaTime() - end < Tok.Gesture.speedWindow
        else { return .zero }
        let span = CGFloat(end - begin)
        return CGPoint(x: (last.x - first.x) / span, y: (last.y - first.y) / span)
    }
}

/// 找到包著格子的那個系統捲動區，把手勢掛上去
struct DirHook: UIViewRepresentable {
    let touch: DirTouch

    func makeUIView(context _: Context) -> UIView {
        let view = Finder()
        view.touch = touch
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_: UIView, context _: Context) {}

    private final class Finder: UIView {
        weak var touch: DirTouch?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard window != nil else { return }
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

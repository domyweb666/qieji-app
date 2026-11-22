import UIKit.UIGestureRecognizerSubclass

/// 把手的拖曳（1.1 dragActivate、dragFailX）：手指在右邊把手那一條，上下動 1 點就拿起；先左右動 10 點就放棄，讓給整行的滑動。
/// 系統的拖曳要走約 10 點才開始，拿起那一下行會跳一段，所以自己數
final class GripPan: UIGestureRecognizer {
    /// 把手那一條多寬（從右邊算）：從這條外面開始的觸控一開始就放棄，不擋系統捲動
    var strip: CGFloat = 0
    /// 手指放開前最後一小段的上下速度（點／秒）
    private(set) var speedY: CGFloat = 0
    private var start: CGPoint = .zero
    private var lastY: CGFloat = 0
    private var lastTime: TimeInterval = 0

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesBegan(touches, with: event)
        guard let view, touches.count == 1, let touch = touches.first,
              touch.location(in: view).x > view.bounds.width - strip
        else {
            state = .failed
            return
        }
        start = touch.location(in: view)
        lastY = start.y
        lastTime = touch.timestamp
        speedY = 0
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesMoved(touches, with: event)
        guard let view, let touch = touches.first else { return }
        let point = touch.location(in: view)
        let span = touch.timestamp - lastTime
        if span > 0 {
            speedY = (point.y - lastY) / CGFloat(span)
        }
        lastY = point.y
        lastTime = touch.timestamp
        switch state {
        case .possible:
            let sideways = abs(point.x - start.x), upDown = abs(point.y - start.y)
            if sideways >= Tok.Gesture.dragFailX, sideways > upDown {
                state = .failed
            } else if upDown >= Tok.Gesture.dragActivate {
                state = .began
            }
        case .began, .changed:
            state = .changed
        default:
            break
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesEnded(touches, with: event)
        state = state == .began || state == .changed ? .ended : .failed
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesCancelled(touches, with: event)
        state = state == .began || state == .changed ? .cancelled : .failed
    }

    override func reset() {
        super.reset()
        speedY = 0
    }
}

/// 一行的左右滑（1.1 swipeActivate、swipeFailY）：左右動超過 14 點才成立；先上下動超過 12 點就放棄，交給捲動
final class SwipePan: UIGestureRecognizer {
    /// 手指從按下去到現在左右走了多少（正的往右）
    private(set) var shiftX: CGFloat = 0
    /// 手指放開前最後一小段的左右速度（點／秒）
    private(set) var speedX: CGFloat = 0
    private var start: CGPoint = .zero
    private var lastX: CGFloat = 0
    private var lastTime: TimeInterval = 0

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesBegan(touches, with: event)
        guard let view, touches.count == 1, let touch = touches.first else {
            state = .failed
            return
        }
        start = touch.location(in: view)
        lastX = start.x
        lastTime = touch.timestamp
        shiftX = 0
        speedX = 0
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesMoved(touches, with: event)
        guard let view, let touch = touches.first else { return }
        let point = touch.location(in: view)
        let span = touch.timestamp - lastTime
        if span > 0 {
            speedX = (point.x - lastX) / CGFloat(span)
        }
        lastX = point.x
        lastTime = touch.timestamp
        shiftX = point.x - start.x
        switch state {
        case .possible:
            if abs(point.y - start.y) > Tok.Gesture.swipeFailY {
                state = .failed
            } else if abs(shiftX) > Tok.Gesture.swipeActivate {
                state = .began
            }
        case .began, .changed:
            state = .changed
        default:
            break
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesEnded(touches, with: event)
        state = state == .began || state == .changed ? .ended : .failed
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesCancelled(touches, with: event)
        state = state == .began || state == .changed ? .cancelled : .failed
    }

    override func reset() {
        super.reset()
        shiftX = 0
        speedX = 0
    }
}

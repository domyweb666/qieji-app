import UIKit

/// 清單的手勢全部掛在捲動區上，一組就管整張紙：左右滑＝劃掉／刪除、右邊把手上下拖＝排順序、點一下＝改那一行、按住＝選單。
/// 手指先往上下動就是捲動：捲動的手勢不用等別的手勢放棄，起步沒有延遲
extension LineListView: UIGestureRecognizerDelegate {
    func wireTouches() {
        gripPan.strip = Tok.Shape.hitMin
        swipePan.addTarget(self, action: #selector(onSwipe(_:)))
        gripPan.addTarget(self, action: #selector(onGrip(_:)))
        tap.addTarget(self, action: #selector(onTapped(_:)))
        hold.addTarget(self, action: #selector(onHeld(_:)))
        hold.minimumPressDuration = Tok.Gesture.longPress
        hold.allowableMovement = Tok.Gesture.longPressMove
        tap.cancelsTouchesInView = false
        for gesture in [swipePan, gripPan, tap, hold] as [UIGestureRecognizer] {
            gesture.delegate = self
            addGestureRecognizer(gesture)
        }
    }

    // MARK: 誰可以開始

    override func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
        // 還在滑進落點時手指又碰了：馬上落定，這一下照常收（捲動也是，不然剛放下那一刻捲不動）
        landNow()
        guard drag == nil else { return false }
        if gesture === panGestureRecognizer {
            // 往旁邊動的不算捲動：留給左右滑
            let speed = panGestureRecognizer.velocity(in: self)
            return abs(speed.y) >= abs(speed.x)
        }
        let inGrip = touchStart.x > bounds.width - Tok.Shape.hitMin
        if gesture === swipePan {
            return row(at: touchStart) != nil && swiping == nil
        }
        if gesture === gripPan {
            return inGrip && row(at: touchStart) != nil
        }
        if gesture === hold {
            return row(at: touchStart) != nil && !inGrip
        }
        return true
    }

    func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard [swipePan, gripPan, tap, hold].contains(gesture) else { return true }
        if inHead(touch.view) {
            return false
        }
        // 正在打字的那一行自己收觸控（移游標、選字），不跟清單的手勢搶
        let typing = editingID.flatMap { live[$0]?.field }
        if gesture === tap || gesture === hold, let typing, touch.view?.isDescendant(of: typing) == true {
            return false
        }
        if gesture === tap {
            touchStopped = isDecelerating
        } else {
            touchStart = touch.location(in: self)
        }
        return true
    }

    /// 這個點（捲動內容的座標）是哪一行。正在刪的不算
    func row(at point: CGPoint) -> LineRowView? {
        guard let index = index(atY: point.y), let row = live[rows[index].id], !row.leaving else { return nil }
        return row
    }

    // MARK: 點、按住

    @objc private func onTapped(_ gesture: UITapGestureRecognizer) {
        guard gesture.state == .ended, !touchStopped else { return }
        let point = gesture.location(in: self)
        guard let row = row(at: point) else {
            onBlank()
            return
        }
        let local = convert(point, to: row.field)
        beginEditing(row.id, point: local)
    }

    @objc private func onHeld(_ gesture: UILongPressGestureRecognizer) {
        guard gesture.state == .began, let row = row(at: touchStart) else { return }
        Haptic.menu()
        onMenu(row.id, row.convert(CGPoint(x: 0, y: row.bounds.maxY), to: nil).y)
    }

    // MARK: 左右滑

    private var strikeLine: CGFloat {
        min(Tok.Gesture.strikeMax, bounds.width * Tok.Gesture.strikeRatio)
    }

    private var deleteLine: CGFloat {
        min(Tok.Gesture.deleteMax, bounds.width * Tok.Gesture.deleteRatio)
    }

    /// 底下「劃掉／刪除」的字多亮：越接近門檻越亮（0.35 到 1），越線就全亮
    private func glow(_ spot: CGFloat, armed: Bool) -> Double {
        if armed {
            return 1
        }
        let line = spot > 0 ? strikeLine : deleteLine
        let progress = Double(min(1, abs(spot) / max(1, line - Tok.Gesture.swipeActivate)))
        return Tok.Motion.swipeLabelFrom + (1 - Tok.Motion.swipeLabelFrom) * progress
    }

    @objc private func onSwipe(_ gesture: SwipePan) {
        switch gesture.state {
        case .began:
            guard let row = row(at: touchStart) else { return }
            // 上一次還在滑回：從現在看到的位置接著拖
            swipeBase = row.runner == nil ? 0 : row.seenSlide
            row.runner?.stopAnimation(true)
            row.runner = nil
            placeAll() // 剛排好順序、還差一點點滑到：停在原地的那一點補回來
            row.card.alpha = 1
            row.struckAtStart = rows.first { $0.id == row.id }?.done ?? false
            row.beginSlide()
            swiping = row
            swipeArmed = false
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
        guard let row = swiping else { return }
        let shift = gesture.shiftX, gap = Tok.Gesture.swipeActivate
        let spot = swipeBase + (shift > 0 ? max(0, shift - gap) : min(0, shift + gap))
        let armed = shift > 0 ? shift > strikeLine : -shift > deleteLine
        row.move(to: spot, glow: glow(spot, armed: armed))
        guard armed != swipeArmed else { return }
        swipeArmed = armed
        guard armed else { return }
        Haptic.arm()
        if !calm {
            row.popLabel()
        }
    }

    /// 放手：滑回、滑出都接著手指放開的速度。劃掉在放手那一刻就改資料。這一行放手後馬上可以滑下一行
    private func finishSwipe(cancelled: Bool, speed: CGFloat) {
        guard let row = swiping else { return }
        swiping = nil
        let armed = swipeArmed && !cancelled, spot = row.slide
        swipeArmed = false
        let id = row.id
        if armed, spot < 0 {
            row.leaving = true
            let goal = -bounds.width
            let pace = abs(goal - spot) < 1 ? 0 : speed / (goal - spot)
            let span = calm ? Tok.Motion.fadeSeconds : Tok.Motion.slideOut
            run(row, Tok.Motion.spring(span, velocity: calm ? 0 : pace)) {
                if self.calm {
                    row.alpha = 0
                } else {
                    row.move(to: goal, glow: 1)
                }
            }
            // 字一離開畫面就拿掉這一行、下面補上（不等彈簧看不見的尾巴）
            let gone = Motions.arrival(span, velocity: calm ? 0 : pace, over: goal - spot, near: Tok.Motion.goneNear)
            // 滑出途中換了紙：清單已經拆了，資料照樣刪（刪到原本那張）
            let delete = onDelete
            DispatchQueue.main.asyncAfter(deadline: .now() + gone) { [weak self] in
                delete(id)
                self?.refresh()
            }
            return
        }
        if armed, spot > 0 {
            onStrike(id)
            refresh()
        }
        if calm {
            row.settle()
            if armed {
                row.card.alpha = CGFloat(Tok.Motion.reducedDimFrom)
                UIView.animate(withDuration: Tok.Motion.fadeSeconds) { row.card.alpha = 1 }
            }
            return
        }
        let pace = abs(spot) < 1 ? 0 : speed / -spot
        run(row, Tok.Motion.spring(Tok.Motion.slideBack, velocity: pace)) {
            row.move(to: 0, glow: 1)
        } done: {
            row.settle()
        }
    }

    private func run(
        _ row: LineRowView, _ spring: UISpringTimingParameters, _ body: @escaping () -> Void, done: @escaping () -> Void = {}
    ) {
        let runner = UIViewPropertyAnimator(duration: .zero, timingParameters: spring)
        runner.isUserInteractionEnabled = true
        runner.addAnimations(body)
        runner.addCompletion { [weak row] _ in
            row?.runner = nil
            done()
        }
        row.runner = runner
        runner.startAnimation()
    }
}

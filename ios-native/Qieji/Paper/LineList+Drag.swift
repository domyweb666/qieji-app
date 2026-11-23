import UIKit

/// 拿著排順序的那一行
struct LineDrag {
    let id: String
    let row: LineRowView
    let from: Int
    var to: Int
    let height: CGFloat
    let top: CGFloat // 原本的頂端（捲動內容的座標）
    let startY: CGFloat // 手指按下去的地方（畫面上）
    let startOffset: CGFloat
    var fingerY: CGFloat // 手指現在在畫面上的高度
    var shift: CGFloat = 0 // 移了多少（含這段時間紙自己捲的）
    var landing = false
}

/// 右邊把手上下拖：排順序。拿起那一行跟著手指，經過的行讓位，靠近上下緣紙自己捲；放手帶著速度滑進落點，滑完才換資料
extension LineListView {
    @objc func onGrip(_ gesture: GripPan) {
        switch gesture.state {
        case .began:
            guard let row = row(at: touchStart), let from = spot(of: row.id), row.runner == nil else { return }
            // 拿起那一刻收鍵盤（1.1）
            window?.endEditing(true)
            let finger = gesture.location(in: self).y - contentOffset.y
            drag = LineDrag(
                id: row.id, row: row, from: from, to: from, height: heights[from], top: headHeight + tops[from],
                startY: touchStart.y - contentOffset.y, startOffset: contentOffset.y, fingerY: finger
            )
            Haptic.prepare()
            Haptic.lift()
            row.superview?.bringSubviewToFront(row)
            row.lift(true, calm: calm)
            followFinger()
        case .changed:
            guard drag != nil, drag?.landing == false else { return }
            drag?.fingerY = gesture.location(in: self).y - contentOffset.y
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
        guard var now = drag else { return }
        now.shift = (now.fingerY - now.startY) + (contentOffset.y - now.startOffset)
        now.row.center.y = now.top + now.shift + now.height / 2
        let target = targetIndex(now)
        let moved = target != now.to
        now.to = target
        drag = now
        guard moved else { return }
        Haptic.pass()
        let place = { self.placeAll() }
        if calm {
            place()
        } else {
            UIView.animate(
                withDuration: Tok.Motion.dragShiftSeconds, delay: 0, usingSpringWithDamping: 1, initialSpringVelocity: 0,
                options: [.allowUserInteraction, .beginFromCurrentState], animations: place
            )
        }
    }

    /// 拖著的那行現在的中心，排在其他行的第幾個
    private func targetIndex(_ now: LineDrag) -> Int {
        let mid = now.top - headHeight + now.height / 2 + now.shift
        var slot = 0
        for (index, row) in rows.enumerated() where row.id != now.id && tops[index] + heights[index] / 2 < mid {
            slot += 1
        }
        return min(slot, max(0, rows.count - 1))
    }

    /// 排順序時，別的行要讓多少
    func giveWay(_ index: Int) -> CGFloat {
        guard let drag, index != drag.from else { return 0 }
        if drag.from < drag.to, index > drag.from, index <= drag.to {
            return -drag.height
        }
        if drag.from > drag.to, index < drag.from, index >= drag.to {
            return drag.height
        }
        return 0
    }

    // MARK: 靠近上下緣紙自己捲

    private func steerAutoScroll() {
        guard let drag else { return }
        let edge = Tok.Gesture.dragAutoEdge
        // 下緣從右下 ＋ 的上方算起（扣掉浮在紙上的 ＋ 那一截）
        let floor = bounds.height - bottomInset - Tok.Shape.fab - Tok.Space.sm * 2
        let top = drag.fingerY, bottom = floor - drag.fingerY
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
        guard drag != nil else {
            stopAutoScroll()
            return
        }
        let step = autoSpeed * CGFloat(link.targetTimestamp - link.timestamp)
        let next = min(maxOffset, max(0, contentOffset.y + step))
        guard next != contentOffset.y else { return }
        contentOffset.y = next
        followFinger()
    }

    func stopAutoScroll() {
        autoLink?.invalidate()
        autoLink = nil
        autoSpeed = 0
    }

    // MARK: 放手

    private func land(speed: CGFloat) {
        guard var now = drag, !now.landing else { return }
        now.landing = true
        drag = now
        dragTurn += 1
        let turn = dragTurn
        Haptic.land()
        let rest = landingShift(now)
        let left = rest - now.shift
        let row = now.row
        row.lift(false, calm: calm)
        guard !calm else {
            finishLanding()
            return
        }
        let runner = UIViewPropertyAnimator(
            duration: .zero, timingParameters: Tok.Motion.spring(Tok.Motion.slideBack, velocity: abs(left) < 1 ? 0 : speed / left)
        )
        runner.isUserInteractionEnabled = true
        runner.addAnimations { row.center.y = now.top + rest + now.height / 2 }
        runner.addCompletion { [weak self] _ in
            row.runner = nil
            guard let self, dragTurn == turn else { return }
            finishLanding()
        }
        row.runner = runner
        runner.startAnimation()
    }

    /// 還在滑進落點時手指又碰了：不等滑完，馬上落定
    func landNow() {
        guard let now = drag, now.landing else { return }
        dragTurn += 1
        now.row.runner?.stopAnimation(true)
        now.row.runner = nil
        finishLanding()
    }

    private func finishLanding() {
        guard let now = drag else { return }
        drag = nil
        now.row.layer.zPosition = 0
        if now.to != now.from {
            onMove(now.id, now.to)
        }
        refresh(animated: false)
        placeAll()
        fill()
    }

    private func landingShift(_ now: LineDrag) -> CGFloat {
        guard now.from != now.to else { return 0 }
        let between = now.from < now.to ? (now.from + 1) ... now.to : now.to ... (now.from - 1)
        let sum = between.reduce(CGFloat(0)) { $0 + heights[$1] }
        return now.from < now.to ? sum : -sum
    }
}

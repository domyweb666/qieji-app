import UIKit

/// 按住變暗的規矩
enum PressRule {
    /// 手指碰下去的這一刻是什麼狀況
    struct Touch {
        var onRow = true
        var inGrip = false // 右邊把手那一條
        var typing = false // 正在打字的那一行
        var stopping = false // 慣性捲動中，這一下是按停
        var landing = false // 還在排順序、滑進落點
    }

    static func darkens(_ touch: Touch) -> Bool {
        touch.onRow && !touch.inGrip && !touch.typing && !touch.stopping && !touch.landing
    }

    /// 手指離按下去的地方太遠：不算按住了
    static func strayed(from start: CGPoint, to now: CGPoint) -> Bool {
        hypot(now.x - start.x, now.y - start.y) > Tok.Gesture.longPressMove
    }
}

/// 按住一行：變暗的進退、浮起的那一份
extension LineListView {
    func wirePress() {
        press.onDown = { [weak self] in self?.pressDown() }
        press.onUp = { [weak self] in self?.pressUp() }
        press.delegate = self
        addGestureRecognizer(press)
    }

    /// 這一下要不要看（看觸控剛進來那一刻：再晚一點，慣性捲動已經被按停了）
    func pressable(_ touch: UITouch) -> Bool {
        let point = touch.location(in: self)
        let row = inHead(touch.view) ? nil : row(at: point)
        pressNext = row?.id
        return PressRule.darkens(PressRule.Touch(
            onRow: row != nil, inGrip: point.x > bounds.width - Tok.Shape.hitMin,
            typing: row != nil && row?.id == editingID, stopping: isDecelerating, landing: drag != nil
        ))
    }

    private func pressDown() {
        guard let id = pressNext else { return }
        pressedID = id
        pressTurn += 1
        let turn = pressTurn
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Motion.rowPressWait) { [weak self] in
            guard let self, pressTurn == turn, let row = live[id], !row.leaving, id != editingID else { return }
            row.press(true)
        }
    }

    /// 放手、捲動、左右滑、手指移走、浮起了：退掉
    func pressUp() {
        pressTurn += 1
        guard let id = pressedID else { return }
        pressedID = nil
        live[id]?.press(false)
    }

    // MARK: 浮起

    @objc func onHeld(_ gesture: UILongPressGestureRecognizer) {
        guard gesture.state == .began, let row = row(at: touchStart), let grab = grab(row) else { return }
        Haptic.menu()
        onMenu(grab)
    }

    /// 先記下那一行現在的位置和樣子，鍵盤之後才收（收的時候清單可能會動）
    private func grab(_ row: LineRowView) -> RowGrab? {
        guard let window else { return nil }
        let id = row.id, whole = row.convert(row.bounds, to: nil)
        let cut = max(0, convert(bounds, to: nil).minY - whole.minY)
        // 按在正在打字那一行的邊上：先收（空的一行會就此拿掉），不把游標拍進去
        let typing = editingID == id
        if typing {
            endEditingLine()
            guard live[id] === row, !row.leaving, spot(of: id) != nil else { return nil }
        }
        guard let lift = RowLiftView(row, paper: look.paper, grain: look.grain, cut: cut, fresh: typing) else { return nil }
        let seen = CGRect(
            x: whole.minX + Tok.Shape.rowLiftInset, y: whole.minY + cut, width: lift.bounds.width, height: lift.bounds.height
        )
        let safe = window.bounds.inset(by: window.safeAreaInsets)
        return RowGrab(
            id: id, top: whole.minY, lift: lift, place: RowMenuPlace(row: seen, top: safe.minY, bottom: safe.maxY),
            pivot: seen.intersection(window.bounds).midY
        )
    }

    /// 那一行現在的頂端在螢幕上的哪裡（沒掛著、正在刪＝nil）
    func seenTop(_ id: String) -> CGFloat? {
        guard let row = live[id], !row.leaving else { return nil }
        return row.convert(row.bounds, to: nil).minY
    }
}

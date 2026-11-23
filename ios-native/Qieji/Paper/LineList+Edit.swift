import UIKit

/// 打字與鍵盤。點一行馬上進那一行（不等 SwiftUI 轉一圈）；換到另一行鍵盤不收。
/// 鍵盤：不讓系統推畫面，只在打的那一行被擋住才捲，跟鍵盤同一段動畫（1.1 ensureVisible）
extension LineListView {
    // MARK: 進出一行

    /// point＝點在文字框裡的哪裡；caret＝游標放在第幾個字後面；都沒給＝行尾
    func beginEditing(_ id: String, point: CGPoint? = nil, caret: Int? = nil) {
        guard let index = spot(of: id) else { return }
        if live[id] == nil {
            // 那一行捲遠了（併到上一行、上一行剛好不在畫面上）：先捲過去
            contentOffset.y = min(max(0, headHeight + tops[index] - bounds.height * Tok.Shape.seekAnchor.y), maxOffset)
            fill()
        }
        guard let row = live[id] else { return }
        let old = editingID == id ? nil : editingID.flatMap { live[$0] }
        editingID = id
        row.editing = true
        LineTextView.carried = old?.field.textInputMode
        PerfMeter.time("become") { _ = row.field.becomeFirstResponder() }
        LineTextView.carried = nil
        // 先接手再放開：上一行先關掉觸控的話系統會先收鍵盤，接著又升起來
        old?.editing = false
        let field = row.field
        var spot = field.endOfDocument
        if let caret, let seam = field.position(from: field.beginningOfDocument, offset: caret) {
            spot = seam
        } else if let point, let near = field.closestPosition(to: point) {
            spot = near
        }
        field.selectedTextRange = field.textRange(from: spot, to: spot)
        PerfMeter.time("onEditing") { onEditing(id) }
        PerfMeter.time("showEditing") { showEditing(animated: true) }
    }

    func endEditingLine() {
        guard let id = editingID else { return }
        live[id]?.field.resignFirstResponder()
    }

    /// 游標在最前面按 Backspace：空的一行拿掉、有字的接到上一行後面。鍵盤不收，游標直接跳到上一行
    /// 等這一下按鍵處理完才換（還在刪字的半路換輸入框，系統會把鍵盤收掉再升起來）
    func joinUp(_ row: LineRowView) {
        let id = row.id
        DispatchQueue.main.async { [weak self, weak row] in
            guard let self, let row, row.id == id, editingID == id, row.field.selectedRange.location == 0 else { return }
            join(row)
        }
    }

    private func join(_ row: LineRowView) {
        guard let joined = onJoinUp(row.id, row.field.text ?? "") else { return }
        // 上一行的字先換成接好的，再進去；這一行接著拿掉
        if let item = source().first(where: { $0.id == joined.id }), let prev = live[joined.id] {
            prev.show(item, look: look)
        }
        beginEditing(joined.id, caret: joined.at)
        refresh()
    }

    // MARK: 打的那一行要看得到

    /// 沒被鍵盤擋住的高度（底下留一點空）
    private var clear: CGFloat {
        bounds.height - keyboardOverlap - Tok.Space.keyboardGap
    }

    /// 打的那一行被擋住才捲：整行放得下＝整行露出來；比看得到的地方還高＝露出游標那幾個字
    func editingOffset() -> CGFloat? {
        guard keyboardOverlap > 0, let id = editingID, let frame = restFrame(id), let row = live[id] else { return nil }
        let now = contentOffset.y
        var low = frame.minY, high = frame.maxY
        if frame.height > clear {
            let caret = row.field.selectedTextRange.map { row.field.caretRect(for: $0.end) }
            let spot = caret.map { $0.midY.isFinite ? $0.midY : frame.height } ?? frame.height
            low = frame.minY + spot - look.lineHeight
            high = frame.minY + spot + look.lineHeight
        }
        if low < now {
            return max(0, low)
        }
        if high > now + clear {
            return min(high - clear, maxOffset)
        }
        return nil
    }

    func showEditing(animated: Bool) {
        guard let target = editingOffset(), abs(target - contentOffset.y) > 0.5, !isDragging else { return }
        // 超過一個畫面遠（打字打到一半把紙捲走）：直接到，捲過去的途中中間的行還沒掛、會空白幾格
        if animated, !calm, abs(target - contentOffset.y) <= bounds.height {
            fill()
            UIView.animate(withDuration: Tok.Motion.rowShiftSeconds, delay: 0, options: LineListView.shiftOptions) {
                self.contentOffset.y = target
            }
        } else {
            contentOffset.y = target
        }
    }

    /// 文字框自己想捲的時候系統會叫這個：我們自己算（showEditing），不然打一個字畫面會跳兩次
    override func scrollRectToVisible(_: CGRect, animated _: Bool) {}

    // MARK: 鍵盤

    func watchKeyboard() {
        let center = NotificationCenter.default
        for name in [UIResponder.keyboardWillChangeFrameNotification, UIResponder.keyboardWillHideNotification] {
            keyboardTokens.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                self?.keyboardMoved(note)
            })
        }
    }

    private func keyboardMoved(_ note: Notification) {
        PerfMeter.time("keyboardMoved") { followKeyboard(note) }
    }

    private func followKeyboard(_ note: Notification) {
        guard let window, let info = note.userInfo else { return }
        var overlap: CGFloat = 0
        let end = (info[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue
        if note.name != UIResponder.keyboardWillHideNotification, let end {
            let board = window.convert(end, from: nil)
            let mine = convert(bounds, to: window)
            overlap = board.minY < window.bounds.maxY ? max(0, mine.maxY - board.minY) : 0
        }
        guard overlap != keyboardOverlap else { return }
        keyboardOverlap = overlap
        let seconds = (info[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? Tok.Motion.keyboardSeconds
        let curve = (info[UIResponder.keyboardAnimationCurveUserInfoKey] as? UInt) ?? 7
        fill()
        let options = UIView.AnimationOptions(rawValue: curve << 16).union([.allowUserInteraction, .beginFromCurrentState])
        // 手指正拖著鍵盤收：位置在手指手上，不准自己捲
        guard !isDragging, seconds > 0 else {
            applyInset()
            return
        }
        UIView.animate(withDuration: seconds, delay: 0, options: options) {
            let spot = self.contentOffset.y
            self.applyInset()
            let target = self.editingOffset() ?? min(max(0, spot), self.maxOffset)
            self.contentOffset.y = target
        }
    }
}

extension LineListView: UITextViewDelegate {
    private func row(of field: UITextView) -> LineRowView? {
        live.values.first { $0.field === field }
    }

    func textViewDidChange(_ field: UITextView) {
        guard let row = row(of: field) else { return }
        PerfMeter.time("setText") { onChange(row.id, field.text ?? "") }
        refresh()
        showEditing(animated: true)
    }

    func textViewDidChangeSelection(_ field: UITextView) {
        guard field.isFirstResponder, let id = editingID, let frame = restFrame(id), frame.height > bounds.height - keyboardOverlap
        else { return }
        // 打字造成的不算，等 textViewDidChange：這時新的一行還沒排好，按 Return 問到的游標在最上面，整張紙會先跳到這一則的頂端再捲回來
        guard let index = spots[id], rows[index].text == field.text else { return }
        showEditing(animated: false)
    }

    func textViewDidEndEditing(_ field: UITextView) {
        guard let row = row(of: field) else { return }
        row.editing = false
        let id = row.id
        // 注音選到一半就換走：系統這時才把字定下來
        if let item = rows.first(where: { $0.id == id }), let words = field.text, words != item.text {
            onChange(id, words)
        }
        if editingID == id {
            editingID = nil
            onEditing(nil)
        }
        onEnd(id)
        refresh()
    }
}

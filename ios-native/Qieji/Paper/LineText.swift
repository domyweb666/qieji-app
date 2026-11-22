import SwiftUI
import UIKit

/// 要某一行拿到游標：token 每次不同才會再對焦一次；point＝點在文字框裡的哪裡；atStart＝游標放最前面；都沒給＝行尾
struct FocusAsk: Equatable {
    let token: Int
    var point: CGPoint?
    var atStart = false
    var caret: Int? // 游標放在第幾個字後面（UTF-16，跟 NSString 的長度同一個算法）
}

/// 紙上一行的字。顯示和打字是同一個原生文字框：點下去字不會跳，游標落在點的位置。
/// 沒在打字時不收觸控（點、滑、拖都交給清單的手勢），打字時才自己收。
struct LineText: UIViewRepresentable {
    let text: String
    let done: Bool
    let editing: Bool
    let focus: FocusAsk?
    let ink: UIColor
    let strikeInk: UIColor
    let actions: LineActions
    var voice: [VoiceAct] = []
    var scale: CGFloat = 1 // 紙上的字級（完整版）：在系統字級上再乘一段

    func makeCoordinator() -> Coordinator {
        Coordinator(actions: actions)
    }

    func makeUIView(context: Context) -> UITextView {
        let view = LineTextView()
        view.backgroundColor = .clear
        view.isScrollEnabled = false
        view.textContainer.lineFragmentPadding = 0
        view.textContainerInset = UIEdgeInsets(top: Tok.Space.md, left: 0, bottom: Tok.Space.md, right: 0)
        view.adjustsFontForContentSizeCategory = true
        view.delegate = context.coordinator
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.setContentHuggingPriority(.required, for: .vertical)
        return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
        let coord = context.coordinator
        coord.actions = actions
        (view as? LineTextView)?.onDeleteAtStart = { [weak view] in actions.joinUp(view?.text ?? "") }
        let attrs = LineText.attributes(done: done, ink: ink, strikeInk: strikeInk, scale: scale)
        // 正在打字的那一行以文字框為準：外面塞字進來會打斷注音選字
        let typing = view.isFirstResponder
        if !typing, view.text != text || coord.shownDone != done || coord.shownInk != ink || coord.shownScale != scale {
            view.attributedText = NSAttributedString(string: text, attributes: attrs)
            view.invalidateIntrinsicContentSize()
        } else if typing, view.markedTextRange == nil, view.text != text {
            // 程式改了這行的字（併行、同步換了字）
            view.attributedText = NSAttributedString(string: text, attributes: attrs)
            view.invalidateIntrinsicContentSize()
        }
        coord.shownDone = done
        coord.shownInk = ink
        coord.shownScale = scale
        coord.voice = voice
        view.accessibilityCustomActions = voice.enumerated().map { idx, act in
            UIAccessibilityCustomAction(name: act.name) { [weak coord] _ in
                guard let list = coord?.voice, idx < list.count else { return false }
                list[idx].run()
                return true
            }
        }
        view.accessibilityHint = done ? Words.struck : nil
        view.typingAttributes = attrs
        view.isUserInteractionEnabled = editing
        if editing, let focus, focus.token != coord.lastFocus {
            coord.lastFocus = focus.token
            DispatchQueue.main.async { LineText.place(view, focus) }
        }
        if !editing, view.isFirstResponder {
            view.resignFirstResponder()
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context _: Context) -> CGSize? {
        guard let width = proposal.width, width > 0, width.isFinite else { return nil }
        let fit = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: max(fit.height, Tok.Shape.rowMin))
    }

    private static func place(_ view: UITextView, _ focus: FocusAsk) {
        view.becomeFirstResponder()
        var spot = view.endOfDocument
        if focus.atStart {
            spot = view.beginningOfDocument
        } else if let caret = focus.caret, let seam = view.position(from: view.beginningOfDocument, offset: caret) {
            spot = seam
        } else if let point = focus.point, let near = view.closestPosition(to: point) {
            spot = near
        }
        view.selectedTextRange = view.textRange(from: spot, to: spot)
    }

    /// 內文 17 點、行高 26（跟著系統字級一起放大）；劃掉的行加刪除線、變淡。
    /// 字貼著每一行的底部（不置中）：1.1 的輸入框就是這樣，一般文字也往下移了 2.86 點對齊它，看起來字比格子中線低一點
    static func attributes(done: Bool, ink: UIColor, strikeInk: UIColor, scale: CGFloat = 1) -> [NSAttributedString.Key: Any] {
        let base = Tok.Font.lineUI
        let font = base.withSize(base.pointSize * scale)
        let lineHeight = (font.pointSize * Tok.Font.lineHeightRatio).rounded()
        let para = NSMutableParagraphStyle()
        para.minimumLineHeight = lineHeight
        para.maximumLineHeight = lineHeight
        var attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .paragraphStyle: para,
            .foregroundColor: done ? strikeInk : ink,
        ]
        if done {
            attrs[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
        }
        return attrs
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var actions: LineActions
        var lastFocus = -1
        var shownDone = false
        var shownInk: UIColor?
        var shownScale: CGFloat = 1
        var voice: [VoiceAct] = []

        init(actions: LineActions) {
            self.actions = actions
        }

        func textViewDidChange(_ view: UITextView) {
            view.invalidateIntrinsicContentSize()
            actions.change(view.text ?? "")
        }

        func textViewDidEndEditing(_ view: UITextView) {
            actions.end(view.text ?? "")
        }

        // Return 在這一則裡換行（1.1.1 起，多米 2026-11-03：一則要能分好幾段；要新的一則按右下 ＋）。
        // 貼上帶換行的字、口述「換行」也一樣整段留在這一則，所以不攔 Return，交給系統
    }
}

/// 一行的字在打字時會發生的事。全部由清單接走，文字框自己不改資料。
struct LineActions {
    var change: (String) -> Void = { _ in }
    var end: (String) -> Void = { _ in }
    /// 回傳有沒有接手（接手的話文字框不用自己刪字）
    var joinUp: (String) -> Bool = { _ in false }
}

/// 游標在最前面按 Backspace 時系統不會通知代理（沒有字可以刪），所以自己攔：跟上一行併在一起
final class LineTextView: UITextView {
    var onDeleteAtStart: (() -> Bool)?

    override func deleteBackward() {
        if selectedRange.location == 0, selectedRange.length == 0, markedTextRange == nil, onDeleteAtStart?() == true {
            return
        }
        super.deleteBackward()
    }
}

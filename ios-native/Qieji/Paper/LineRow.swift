import SwiftUI
import UIKit

/// 一行要畫的東西
struct LineItem: Equatable {
    var id: String
    var text: String
    var done: Bool
}

/// VoiceOver 動作選單裡的一項
struct VoiceAct {
    let name: String
    let run: () -> Void
}

/// 紙上的一行：底下是滑動時露出來的「劃掉／刪除」，上面一張卡（字、把手、格線）。
/// 顯示和打字是同一個文字框：點下去字不會跳，游標落在點的位置。沒在打字時不收觸控，全部交給清單的手勢
final class LineRowView: UIView {
    private(set) var id = ""
    let card = UIView()
    let field = LineTextView(usingTextLayoutManager: false) // TextKit 1：行高照設定的 26，跟量高的同一套
    private let pitch = LinePitch()
    private let under = UIView()
    private let underLabel = UILabel()
    private let grip = GripDotsView()
    private let rule = UIView()
    private let fill = UIView() // 打字中整行提亮
    private let glow = UIView() // 剛記下的那行亮一下
    private var shown: LineItem?
    private var look: LineLook?
    private(set) var slide: CGFloat = 0
    /// 放手後滑回、滑出的動畫（手指再碰要接得住）
    var runner: UIViewPropertyAnimator?
    /// 已經在刪（滑出或淡出中）：不再收手勢
    var leaving = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        build()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    private func build() {
        under.isHidden = true
        under.isAccessibilityElement = false
        underLabel.textColor = UIColor(Tok.Col.textOnSwipe)
        underLabel.isAccessibilityElement = false
        addSubview(under)
        under.addSubview(underLabel)
        addSubview(card)
        fill.backgroundColor = UIColor(Tok.Col.rowEditingFill)
        fill.alpha = 0
        glow.backgroundColor = UIColor(Tok.Col.rowEditingFill)
        glow.alpha = 0
        for part in [fill, glow, rule, grip] {
            part.isUserInteractionEnabled = false
            part.isAccessibilityElement = false
        }
        field.backgroundColor = .clear
        field.isScrollEnabled = false
        field.layoutManager.delegate = pitch
        field.scrollsToTop = false
        field.textContainer.lineFragmentPadding = 0
        field.textContainerInset = UIEdgeInsets(top: Tok.Space.md, left: 0, bottom: Tok.Space.md, right: 0)
        field.isUserInteractionEnabled = false
        field.tintColor = UIColor(Tok.Col.accent)
        for part in [fill, glow, field, grip, rule] {
            card.addSubview(part)
        }
        card.layer.shadowColor = UIColor(Tok.Col.shadow).cgColor
        card.layer.shadowRadius = Tok.Shape.shadowRadius
        card.layer.shadowOffset = CGSize(width: 0, height: Tok.Shape.shadowY)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let size = bounds.size
        under.frame = CGRect(x: 0, y: 0, width: size.width, height: max(0, size.height - Tok.Shape.borderCard))
        // 卡片可能正被滑動（transform），位置改 bounds／center，不改 frame
        card.bounds = CGRect(origin: .zero, size: size)
        card.center = CGPoint(x: size.width / 2, y: size.height / 2)
        fill.frame = card.bounds
        glow.frame = card.bounds
        let textHeight = max(0, size.height - Tok.Shape.borderCard)
        field.frame = CGRect(x: Tok.Space.gutter, y: 0, width: LineMeasure.textWidth(size.width), height: textHeight)
        grip.frame = CGRect(x: size.width - Tok.Shape.hitMin, y: 0, width: Tok.Shape.hitMin, height: Tok.Shape.rowMin)
        rule.frame = CGRect(x: 0, y: textHeight, width: size.width, height: Tok.Shape.borderCard)
        placeLabel()
    }

    // MARK: 內容

    func show(_ item: LineItem, look: LineLook) {
        id = item.id
        let restyle = self.look != look
        self.look = look
        if restyle {
            card.backgroundColor = look.paper
            rule.backgroundColor = look.rule
        }
        pitch.look = look
        let attrs = look.attributes(done: item.done)
        // 正在打字的那一行以文字框為準：外面塞字進來會打斷注音選字
        let typing = field.isFirstResponder
        let wordsMoved = field.text != item.text
        let styleMoved = restyle || shown?.done != item.done
        if wordsMoved ? (!typing || field.markedTextRange == nil) : (styleMoved && field.markedTextRange == nil) {
            let spot = typing ? field.selectedRange : nil
            field.attributedText = NSAttributedString(string: item.text, attributes: attrs)
            if let spot, spot.location + spot.length <= (item.text as NSString).length {
                field.selectedRange = spot
            }
        }
        field.typingAttributes = attrs
        field.accessibilityHint = item.done ? Words.struck : nil
        shown = item
    }

    var editing = false {
        didSet {
            guard editing != oldValue else { return }
            field.isUserInteractionEnabled = editing
            fill.alpha = editing ? 1 : 0
        }
    }

    /// 剛記下的那行亮一下：捲回頂端那段時間亮著，之後慢慢淡掉
    func flash(wait: Double) {
        glow.layer.removeAllAnimations()
        glow.alpha = 1
        UIView.animate(withDuration: Tok.Motion.freshGlowSeconds, delay: wait, options: [.curveEaseOut, .allowUserInteraction]) {
            self.glow.alpha = 0
        }
    }

    // MARK: 左右滑

    /// 開始滑：底下露出來的那一塊照現在劃掉了沒決定寫什麼（滑回去的途中不換字）
    func beginSlide() {
        under.alpha = 1
        underLabel.font = UIFont.preferredFont(forTextStyle: .subheadline).bold
        underLabel.transform = .identity
    }

    /// 移到哪（正的往右）。glow＝底下那個字多亮
    func move(to spot: CGFloat, glow: Double) {
        slide = spot
        card.transform = spot == 0 ? .identity : CGAffineTransform(translationX: spot, y: 0)
        guard spot != 0 else { return }
        let right = spot > 0
        labelLeading = right
        under.isHidden = false
        under.backgroundColor = UIColor(right ? Tok.Col.swipeStrikeBg : Tok.Col.swipeDeleteBg)
        let word = right ? (struckAtStart ? Words.unstrike : Words.strike) : Words.delete
        if underLabel.text != word {
            underLabel.text = word
        }
        underLabel.alpha = CGFloat(glow)
        placeLabel()
    }

    private var labelLeading = true
    /// 滑動開始時這一行劃掉了沒
    var struckAtStart = false

    /// 越線那一刻字放大，再彈回原本大小（跟震動同一刻）
    func popLabel() {
        let scale = Tok.Motion.swipeLabelArm
        underLabel.transform = CGAffineTransform(scaleX: scale, y: scale)
        UIView.animate(
            withDuration: Tok.Motion.swipeLabelSeconds, delay: 0, usingSpringWithDamping: Tok.Motion.swipeLabelDamping,
            initialSpringVelocity: 0, options: [.allowUserInteraction, .beginFromCurrentState]
        ) { self.underLabel.transform = .identity }
    }

    /// 滑回原位了：底下那塊收起來
    func settle() {
        slide = 0
        card.transform = .identity
        under.isHidden = true
    }

    /// 現在畫面上看到的位移（動畫途中讀得到）
    var seenSlide: CGFloat {
        card.layer.presentation()?.affineTransform().tx ?? slide
    }

    private func placeLabel() {
        let size = underLabel.sizeThatFits(under.bounds.size)
        let edge = Tok.Space.gutter
        let x = labelLeading ? edge + size.width / 2 : under.bounds.width - edge - size.width / 2
        underLabel.bounds = CGRect(origin: .zero, size: size)
        underLabel.center = CGPoint(x: x, y: under.bounds.midY)
    }

    // MARK: 拿起

    func lift(_ held: Bool, calm: Bool) {
        layer.zPosition = held ? 1 : 0
        let scale = Tok.Motion.dragLiftScale
        card.layer.shadowPath = UIBezierPath(rect: card.bounds).cgPath
        UIView.animate(
            withDuration: Tok.Motion.dragLiftSeconds, delay: 0, options: [.allowUserInteraction, .beginFromCurrentState, .curveEaseOut]
        ) {
            self.card.transform = held && !calm ? CGAffineTransform(scaleX: scale, y: scale) : .identity
            self.card.layer.shadowOpacity = held ? Float(Tok.Shape.shadowSoft) : 0
        }
    }

    // MARK: 回收

    /// 還回去之前清乾淨
    func clear() {
        runner?.stopAnimation(true)
        runner = nil
        layer.removeAllAnimations()
        card.layer.removeAllAnimations()
        leaving = false
        editing = false
        alpha = 1
        card.alpha = 1
        glow.layer.removeAllAnimations()
        glow.alpha = 0
        layer.zPosition = 0
        card.layer.shadowOpacity = 0
        settle()
        field.delegate = nil
        field.onDeleteAtStart = nil
        field.accessibilityCustomActions = nil
    }
}

/// 每一行字的高釘死：系統排中文會自己把行撐高（26 變 28），行高就跟量的不一樣、三行的最後一行被切掉
final class LinePitch: NSObject, NSLayoutManagerDelegate {
    var look: LineLook?

    func layoutManager(
        _: NSLayoutManager, shouldSetLineFragmentRect rect: UnsafeMutablePointer<CGRect>,
        lineFragmentUsedRect used: UnsafeMutablePointer<CGRect>, baselineOffset: UnsafeMutablePointer<CGFloat>,
        in _: NSTextContainer, forGlyphRange _: NSRange
    ) -> Bool {
        guard let look else { return false }
        rect.pointee.size.height = look.lineHeight
        used.pointee.size.height = look.lineHeight
        // 字貼著每一行的底部（1.1 的輸入框就是這樣）
        baselineOffset.pointee = look.lineHeight + look.font.descender
        return true
    }
}

/// 把手：2 欄 × 3 列六個淺點
final class GripDotsView: UIView {
    override init(frame: CGRect) {
        super.init(frame: frame)
        isOpaque = false
        backgroundColor = .clear
        contentMode = .redraw
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    override func draw(_: CGRect) {
        let dot = Tok.Shape.gripDot, gap = Tok.Shape.gripDotGap
        let size = CGSize(width: dot * 2 + gap, height: dot * 3 + gap * 2)
        let left = (bounds.width - size.width) / 2, top = (bounds.height - size.height) / 2
        UIColor(Tok.Col.textSecondary).withAlphaComponent(CGFloat(Tok.Shape.gripDotOpacity)).setFill()
        for col in 0 ..< 2 {
            for row in 0 ..< 3 {
                let x = left + CGFloat(col) * (dot + gap), y = top + CGFloat(row) * (dot + gap)
                UIBezierPath(ovalIn: CGRect(x: x, y: y, width: dot, height: dot)).fill()
            }
        }
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        setNeedsDisplay()
    }
}

extension UIFont {
    var bold: UIFont {
        guard let heavier = fontDescriptor.withSymbolicTraits(.traitBold) else { return self }
        return UIFont(descriptor: heavier, size: pointSize)
    }
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

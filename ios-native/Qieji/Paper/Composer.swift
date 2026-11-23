import SwiftUI
import UIKit

/// 輸入框（照 1.1 Composer）：按右下 ＋ 從底下升起、貼在鍵盤上面，跟著字長高（長到清單頂端，再多在框裡捲）。
/// Return＝在框裡換行；✓＝記下來、收起；點紙上一行或空白處、切到別的 app 一樣記下來再收起，字不會丟。
/// 卡片是不透明的奶油白（後面是變暗的紙，玻璃會照著變深、字看不清）。
/// 2026-11-23 改成原生：框用系統的「鍵盤線」釘在鍵盤上緣，鍵盤升降、手指把鍵盤往下拖，框都黏著它走
struct ComposerHost: UIViewRepresentable {
    let open: Bool
    /// 打之前、打之後的字
    let onText: (String, String) -> Void
    let tip: Bool
    /// 清單頂端在螢幕上的高度：框最高長到這裡
    let topLimit: CGFloat
    let onBlur: () -> Void
    let onDone: (Bool) -> Void
    let onTipTap: () -> Void

    func makeUIView(context _: Context) -> ComposerView {
        PerfMeter.time("composer") { ComposerView(frame: .zero) }
    }

    func updateUIView(_ view: ComposerView, context _: Context) {
        view.onText = onText
        view.onBlur = onBlur
        view.onDone = onDone
        view.onTip = onTipTap
        view.topLimit = topLimit
        view.showTip(tip)
        view.setOpen(open)
    }

    /// 這次改字是不是「按了一下 Return」：剛好多一個字，而且多的是換行（貼上一大段、刪字、選字確認都不算）
    static func typedReturn(prev: String, next: String) -> Bool {
        let breaks = { (text: String) in text.filter { $0 == "\n" }.count }
        return (next as NSString).length == (prev as NSString).length + 1 && breaks(next) == breaks(prev) + 1
    }
}

final class ComposerView: UIView, UITextViewDelegate {
    var onText: (String, String) -> Void = { _, _ in }
    private var was = "" // 上一次的字
    var onBlur: () -> Void = {}
    /// 有沒有選字選到一半
    var onDone: (Bool) -> Void = { _ in }
    var onTip: () -> Void = {}
    var topLimit: CGFloat = 0

    private let card = UIView()
    private let field = UITextView()
    private let hint = UILabel()
    private let done = UIButton(type: .custom)
    private let tipCard = UIButton(type: .custom)
    private var tall: NSLayoutConstraint?
    private var opened = false
    private var rising = false // 框還在往上升，等鍵盤那段動畫一起走
    private var leaving = false // 要收了，等鍵盤一起走
    private var hiding = false // 已經跟著鍵盤在往下走
    private var tokens: [NSObjectProtocol] = []

    override init(frame: CGRect) {
        super.init(frame: frame)
        let center = NotificationCenter.default
        for name in [UIResponder.keyboardWillShowNotification, UIResponder.keyboardWillHideNotification] {
            tokens.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                self?.keyboardMoved(note)
            })
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    deinit {
        for token in tokens {
            NotificationCenter.default.removeObserver(token)
        }
    }

    /// 只有卡片收觸控：其他地方照樣點得到紙上的行
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit
    }

    // MARK: 開、收

    func setOpen(_ next: Bool) {
        guard next != opened else { return }
        opened = next
        if next {
            buildOnce()
            rise()
        } else {
            fall()
        }
    }

    private var calm: Bool {
        UIAccessibility.isReduceMotionEnabled
    }

    private func rise() {
        leaving = false
        hiding = false
        field.text = ""
        was = ""
        hint.isHidden = false
        card.layer.removeAllAnimations()
        card.isHidden = false
        card.alpha = calm ? 0 : 1
        card.transform = .identity
        refit()
        layoutIfNeeded()
        card.transform = calm ? .identity : below
        rising = true
        PerfMeter.time("become") { _ = field.becomeFirstResponder() }
        // 接實體鍵盤時系統不升鍵盤、也不通知：自己升
        if rising {
            move(seconds: Tok.Motion.keyboardSeconds, curve: ComposerView.keyboardCurve)
        }
    }

    private static let keyboardCurve: UInt = 7

    /// 躲到螢幕底下要移多少
    private var below: CGAffineTransform {
        CGAffineTransform(translationX: 0, y: max(0, bounds.height - card.center.y + card.bounds.height / 2) + Tok.Space.xl)
    }

    /// 收的時候框釘著鍵盤線一起往下，自己再多沉「自己的高」就看不到了。
    /// 沉太多會比鍵盤快一大截：一按 ✓ 框馬上鑽到鍵盤後面，像整個不見（2026-11-23）
    private var sunk: CGAffineTransform {
        CGAffineTransform(translationX: 0, y: card.bounds.height + safeAreaInsets.bottom + Tok.Space.xl)
    }

    private func move(seconds: Double, curve: UInt) {
        rising = false
        let options = UIView.AnimationOptions(rawValue: curve << 16).union([.allowUserInteraction, .beginFromCurrentState])
        UIView.lively {
            UIView.animate(withDuration: calm ? Tok.Motion.fadeSeconds : seconds, delay: 0, options: options) {
                self.card.transform = .identity
                self.card.alpha = 1
            }
        }
    }

    private func fall() {
        rising = false
        guard !hiding else { return }
        leaving = true
        field.resignFirstResponder()
        // 鍵盤跟著收：框跟它一起下去（keyboardMoved）。鍵盤留著（換到紙上一行打字）：框直接淡掉
        DispatchQueue.main.async { [weak self] in
            guard let self, leaving, !opened else { return }
            hide(seconds: Tok.Motion.fadeSeconds, curve: 0, slide: false)
        }
    }

    private func hide(seconds: Double, curve: UInt, slide: Bool) {
        leaving = false
        hiding = true
        let options = UIView.AnimationOptions(rawValue: curve << 16).union([.allowUserInteraction, .beginFromCurrentState])
        UIView.lively {
            UIView.animate(withDuration: seconds, delay: 0, options: options) {
                if slide, !self.calm {
                    self.card.transform = self.sunk
                } else {
                    self.card.alpha = 0
                }
            } completion: { _ in
                guard !self.opened else { return }
                self.hiding = false
                self.card.isHidden = true
                self.card.transform = .identity
            }
        }
    }

    private func keyboardMoved(_ note: Notification) {
        let info = note.userInfo
        let seconds = (info?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? Tok.Motion.keyboardSeconds
        let curve = (info?[UIResponder.keyboardAnimationCurveUserInfoKey] as? UInt) ?? ComposerView.keyboardCurve
        if note.name == UIResponder.keyboardWillShowNotification {
            if rising {
                move(seconds: seconds, curve: curve)
            }
        } else if leaving || (opened && !rising) {
            hide(seconds: max(seconds, Tok.Motion.fadeSeconds), curve: curve, slide: true)
        }
    }

    // MARK: 打字

    /// 選字選到一半（注音、拼音、日文、韓文）。英文的自動訂正預覽也會有標記的字，那不算：要記他打的
    private var choosing: Bool {
        guard field.markedTextRange != nil else { return false }
        let lang = field.textInputMode?.primaryLanguage ?? ""
        return ["zh", "ja", "ko"].contains { lang.hasPrefix($0) }
    }

    func textViewDidChange(_: UITextView) {
        hint.isHidden = !field.text.isEmpty
        let now = field.text ?? ""
        onText(was, now)
        was = now
        refit()
    }

    func textViewDidEndEditing(_ view: UITextView) {
        // 注音選到一半就收：系統這時才把字定下來
        if view.text != was {
            textViewDidChange(view)
        }
        if opened {
            onBlur()
        }
    }

    /// 跟著字長高；長到清單頂端為止，再多在框裡捲
    private func refit() {
        let side = Tok.Space.sm * 2 + Tok.Space.lg + Tok.Space.xs + Tok.Shape.hitMin
        let width = field.bounds.width > 0 ? field.bounds.width : bounds.width - side
        let fit = field.sizeThatFits(CGSize(width: max(1, width), height: .greatestFiniteMagnitude)).height
        let room = max(Tok.Shape.hitMin, keyboardLayoutGuide.layoutFrame.minY - topLimit - Tok.Space.sm * 4)
        let next = max(Tok.Shape.hitMin, min(fit, room))
        field.isScrollEnabled = fit > room
        if tall?.constant != next {
            tall?.constant = next
            layoutIfNeeded()
        }
    }

    // MARK: 提示卡

    func showTip(_ on: Bool) {
        guard built, tipCard.isHidden == on else { return }
        if on {
            tipCard.isHidden = false
            tipCard.alpha = 0
        }
        UIView.animate(withDuration: Tok.Motion.fadeSeconds) {
            self.tipCard.alpha = on ? 1 : 0
        } completion: { _ in
            self.tipCard.isHidden = !on
        }
    }

    // MARK: 排版

    private var built = false

    /// 第一次升起才做裡面的東西：每換一張紙都先做好一個，換紙那一刻多卡幾毫秒
    private func buildOnce() {
        guard !built else { return }
        built = true
        build()
    }

    private func build() {
        card.isHidden = true
        card.backgroundColor = UIColor(Tok.Col.surface)
        card.layer.cornerRadius = Tok.Shape.radiusLg
        card.layer.cornerCurve = .continuous
        card.layer.shadowColor = UIColor(Tok.Col.shadow).cgColor
        card.layer.shadowOpacity = Float(Tok.Shape.shadowSoft)
        card.layer.shadowRadius = Tok.Shape.shadowRadius
        card.layer.shadowOffset = CGSize(width: 0, height: Tok.Shape.shadowY)
        field.backgroundColor = .clear
        field.font = Tok.Font.lineUI
        field.adjustsFontForContentSizeCategory = true
        field.textColor = UIColor(Tok.Col.textPrimary)
        field.tintColor = UIColor(Tok.Col.accent)
        field.textContainer.lineFragmentPadding = 0
        field.scrollsToTop = false
        field.delegate = self
        if #available(iOS 17.0, *) {
            // 系統的灰字預測會算進框裡的字：打 he 按 ✓ 會記成 hello
            field.inlinePredictionType = .no
        }
        field.accessibilityLabel = Words.composerField
        let pad = max(0, (Tok.Shape.hitMin - Tok.Font.lineUI.lineHeight) / 2)
        field.textContainerInset = UIEdgeInsets(top: pad, left: 0, bottom: pad, right: 0)
        hint.text = Words.composerHint
        hint.font = Tok.Font.lineUI
        hint.adjustsFontForContentSizeCategory = true
        hint.textColor = UIColor(Tok.Col.textMuted)
        hint.isAccessibilityElement = false
        let symbol = UIImage.SymbolConfiguration(pointSize: Tok.Font.barCheckSize, weight: .semibold)
        done.setImage(UIImage(systemName: "checkmark", withConfiguration: symbol), for: .normal)
        done.tintColor = UIColor(Tok.Col.textPrimary)
        done.accessibilityLabel = Words.commit
        done.addAction(UIAction { [weak self] _ in self.map { $0.onDone($0.choosing) } }, for: .touchUpInside)
        buildTip()
        for part in [card, tipCard, field, hint, done] as [UIView] {
            part.translatesAutoresizingMaskIntoConstraints = false
        }
        addSubview(card)
        for part in [field, hint, done, tipCard] as [UIView] {
            card.addSubview(part)
        }
        pin()
    }

    private func pin() {
        let height = field.heightAnchor.constraint(equalToConstant: Tok.Shape.hitMin)
        tall = height
        NSLayoutConstraint.activate([
            height,
            card.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Tok.Space.sm),
            card.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Tok.Space.sm),
            card.bottomAnchor.constraint(equalTo: keyboardLayoutGuide.topAnchor, constant: -Tok.Space.sm),
            field.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: Tok.Space.lg),
            field.topAnchor.constraint(equalTo: card.topAnchor, constant: Tok.Space.sm),
            field.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -Tok.Space.sm),
            field.trailingAnchor.constraint(equalTo: done.leadingAnchor),
            hint.leadingAnchor.constraint(equalTo: field.leadingAnchor),
            hint.topAnchor.constraint(equalTo: field.topAnchor, constant: field.textContainerInset.top),
            done.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -Tok.Space.xs),
            done.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -Tok.Space.sm),
            done.widthAnchor.constraint(equalToConstant: Tok.Shape.hitMin),
            done.heightAnchor.constraint(equalToConstant: Tok.Shape.hitMin),
            tipCard.trailingAnchor.constraint(equalTo: card.trailingAnchor),
            tipCard.bottomAnchor.constraint(equalTo: card.topAnchor, constant: -Tok.Space.md),
        ])
    }

    /// ✓ 的單點提示（1.1 tip）：從 1.0 更新上來的人第一次在輸入框按 Return 時，✓ 上面冒一張小卡，一輩子一次。點它、按 ✓、框收起就不見
    private func buildTip() {
        var look = UIButton.Configuration.filled()
        look.baseBackgroundColor = UIColor(Tok.Col.textPrimary)
        look.baseForegroundColor = UIColor(Tok.Col.surface)
        look.background.cornerRadius = Tok.Shape.radiusSm
        look.contentInsets = NSDirectionalEdgeInsets(
            top: Tok.Space.sm, leading: Tok.Space.md, bottom: Tok.Space.sm, trailing: Tok.Space.md
        )
        var words = AttributedString(Words.returnTip)
        words.font = UIFont.preferredFont(forTextStyle: .footnote)
        look.attributedTitle = words
        tipCard.configuration = look
        tipCard.isHidden = true
        tipCard.accessibilityHint = Words.tipHint
        tipCard.addAction(UIAction { [weak self] _ in self?.onTip() }, for: .touchUpInside)
    }
}

/// 右下角的茄紫 ＋（1.1 PageBar）：畫在根畫面、紙的外面，換紙時一直停在原地；鍵盤、輸入框、選單開著時淡出，跟鍵盤同一個時鐘
struct PlusButton: View {
    @ObservedObject var fab: Store.Fab
    @ObservedObject var switcher: SwitchModel
    let action: () -> Void

    var body: some View {
        let shown = fab.shown && !switcher.isOpen
        ZStack {
            if shown {
                Button(action: action) {
                    Image(systemName: "plus")
                        .font(Tok.Font.fabSymbol)
                        .foregroundColor(Tok.Col.fabIcon)
                        .frame(width: Tok.Shape.fab, height: Tok.Shape.fab)
                        .frost(Circle(), tint: Tok.Col.accent, interactive: true)
                }
                .buttonStyle(PressDim())
                .accessibilityLabel(Words.addLine)
                .transition(.opacity)
            }
        }
        .animation(Tok.Motion.keyboard, value: shown)
        .padding(.trailing, Tok.Space.lg)
        .padding(.bottom, Tok.Space.sm)
    }
}

import UIKit

/// 面板裡面：字在上（整塊可點、可捲），下面一排 ✕、放進 X、✓，釘在鍵盤上緣。樣子照 Paper/Composer.swift 的輸入框
final class SharePanel: UIView, UITextViewDelegate {
    var onText: (String) -> Void = { _ in }
    var onCancel: () -> Void = {}
    var onCommit: () -> Void = {}
    var onSplit: () -> Void = {}
    var onPick: (Int) -> Void = { _ in }
    /// VoiceOver 的兩指搓。回傳有沒有吃掉
    var onEscape: () -> Bool = { false }

    private let field = UITextView()
    private let blank = UILabel() // 還沒讀到、或沒有字可以記
    private let chip = UIButton(type: .custom)
    private let foot = UIStackView()
    private let edge = UIView()
    private let grab = UIView()
    private let note = UILabel()
    private let row = UIStackView()
    private let cancel = SharePress(type: .custom)
    private let target = ShareTargetButton(type: .custom)
    private let gap = UIView()
    private let done = SharePress(type: .custom)

    private var targets: [ShareTarget] = []
    private var picked = 0
    private var splitCount = 0 // 現在拆得出幾行；0＝不給拆
    private var fieldHeight: CGFloat = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        build()
        pin()
        arrange()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    // MARK: 給什麼看什麼

    /// 還在讀：字的位置寫一句
    func showBlank(_ words: String) {
        blank.text = words
        blank.isHidden = false
    }

    func showText(_ text: String) {
        blank.isHidden = true
        field.text = text
        field.isHidden = false
        field.isEditable = true
    }

    /// 沒有字可以記：只留 ✕
    func showNothing(_ words: String) {
        showBlank(words)
        done.isHidden = true
        target.isHidden = true
        refreshTarget()
        UIAccessibility.post(notification: .announcement, argument: words)
    }

    /// 那排上面的一句話；alert＝沒記成、不能記。nil＝收起
    func showNote(_ words: String?, alert: Bool = false) {
        note.isHidden = words == nil
        guard let words else { return }
        note.text = words
        note.textColor = UIColor(alert ? Tok.Col.danger : Tok.Col.textSecondary)
        UIAccessibility.post(notification: .announcement, argument: words)
    }

    /// 紙單到了才叫：在那之前「放進 X」不出現
    func showTargets(_ list: [ShareTarget], picked: Int) {
        targets = list
        self.picked = picked
        target.isHidden = done.isHidden // 沒有字可以記：只留 ✕
        refreshTarget()
    }

    func setCommit(_ on: Bool) {
        done.isEnabled = on
    }

    /// 拆得出幾行；0＝收起膠囊
    func showSplit(_ count: Int, animated: Bool) {
        guard count != splitCount else { return }
        let before = splitCount
        splitCount = count
        if count > 0 {
            UIView.performWithoutAnimation {
                chip.configuration?.attributedTitle = SharePanel.splitTitle(count)
                chip.layoutIfNeeded()
            }
        }
        refreshInset()
        let shown = count > 0
        guard (before > 0) != shown else { return }
        guard animated else {
            chip.isHidden = !shown
            chip.alpha = shown ? 1 : 0
            return
        }
        if shown {
            chip.isHidden = false
            chip.alpha = 0
            UIAccessibility.post(notification: .announcement, argument: ShareWords.split(count))
        }
        UIView.animate(withDuration: Tok.Motion.fadeSeconds, delay: 0, options: [.allowUserInteraction, .beginFromCurrentState]) {
            self.chip.alpha = shown ? 1 : 0
        } completion: { _ in
            self.chip.isHidden = self.splitCount == 0
        }
    }

    /// 要收了：系統一收到 completeRequest，這一頁當格就不見，剩分享表那張白（深色是灰）的整頁往下滑，這邊管不到。
    /// 先淡成同一個底色，才不會一格之間從奶油色跳成白的（2026-11-25 錄影逐格看到）
    func clear(animated: Bool, then done: @escaping () -> Void) {
        guard animated else {
            done()
            return
        }
        endEditing(true) // 鍵盤跟著一起下去，不然也是一格之間不見
        UIView.animate(withDuration: Tok.Motion.shareOutSeconds, delay: 0, options: [.beginFromCurrentState]) {
            for part in self.subviews {
                part.alpha = 0
            }
            self.backgroundColor = .systemBackground
        } completion: { _ in done() }
    }

    /// 選字選到一半就先定下來：記的是看到的字
    func settle() {
        guard field.markedTextRange != nil else { return }
        field.unmarkText()
        onText(field.text ?? "")
    }

    // MARK: 打字

    func textViewDidChange(_ view: UITextView) {
        onText(view.text ?? "")
    }

    override func accessibilityPerformEscape() -> Bool {
        onEscape()
    }

    // MARK: 排版

    override func layoutSubviews() {
        super.layoutSubviews()
        refreshInset()
        // 鍵盤升起、那排跟著上去：游標不准被蓋住
        let height = field.bounds.height
        if height < fieldHeight, field.isFirstResponder {
            field.scrollRangeToVisible(field.selectedRange)
        }
        fieldHeight = height
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        if previous?.preferredContentSizeCategory != traitCollection.preferredContentSizeCategory {
            arrange()
        }
        refreshTarget()
    }

    private var big: Bool {
        traitCollection.preferredContentSizeCategory.isAccessibilityCategory
    }

    /// 字級放到最大那幾級：「放進 X」自己一行，下面才是 ✕ ✓
    private func arrange() {
        if big {
            foot.insertArrangedSubview(target, at: 1)
        } else {
            row.insertArrangedSubview(target, at: 1)
        }
        refreshTarget()
    }

    private func refreshTarget() {
        let now = targets.indices.contains(picked) ? targets[picked] : nil
        target.show(now, many: targets.count > 1, big: big, traits: traitCollection)
        gap.isHidden = !big && !target.isHidden
        guard targets.count > 1 else {
            target.menu = nil
            return
        }
        target.menu = UIMenu(options: .singleSelection, children: targets.enumerated().map { index, one in
            UIAction(
                title: one.title, image: ShareTile.image(one, traitCollection), state: index == picked ? .on : .off
            ) { [weak self] _ in self?.onPick(index) }
        })
    }

    /// 最後一行要捲得到膠囊上面
    private func refreshInset() {
        let room = splitCount > 0 ? chip.bounds.height + Tok.Space.sm * 2 : 0
        guard field.contentInset.bottom != room else { return }
        field.contentInset.bottom = room
        field.verticalScrollIndicatorInsets.bottom = room
    }

    private func build() {
        backgroundColor = UIColor(Tok.Col.surface)
        accessibilityViewIsModal = true
        buildField()
        buildSplit()
        blank.font = Tok.Font.lineUI
        blank.adjustsFontForContentSizeCategory = true
        blank.textColor = UIColor(Tok.Col.textSecondary)
        blank.numberOfLines = 0
        blank.isHidden = true
        note.font = Tok.Font.styleUI(.footnote)
        note.adjustsFontForContentSizeCategory = true
        note.numberOfLines = 0
        note.isHidden = true
        edge.backgroundColor = UIColor(Tok.Col.separator)
        cancel.show(symbol: "xmark", weight: .regular, color: UIColor(Tok.Col.textSecondary))
        cancel.accessibilityLabel = ShareWords.cancel
        cancel.addAction(UIAction { [weak self] _ in self?.onCancel() }, for: .touchUpInside)
        done.show(symbol: "checkmark", weight: .semibold, color: UIColor(Tok.Col.textPrimary))
        done.accessibilityLabel = ShareWords.commit
        done.addAction(UIAction { [weak self] _ in self?.onCommit() }, for: .touchUpInside)
        done.isEnabled = false
        target.isHidden = true
        row.spacing = Tok.Space.sm
        row.alignment = .center
        for part in [cancel, gap, done] {
            row.addArrangedSubview(part)
        }
        // 「放進 X」不在那排的時候，空位把 ✓ 推到右邊
        gap.setContentHuggingPriority(.fittingSizeLevel, for: .horizontal)
        foot.axis = .vertical
        foot.spacing = Tok.Space.xs
        foot.addArrangedSubview(note)
        foot.addArrangedSubview(row)
        grab.backgroundColor = UIColor(Tok.Col.textMuted).withAlphaComponent(Tok.Shape.handleOff)
        grab.layer.cornerRadius = Tok.Shape.dirGrab / 2
        for part in [field, blank, edge, foot, chip, grab] as [UIView] {
            part.translatesAutoresizingMaskIntoConstraints = false
            addSubview(part)
        }
    }

    private func buildField() {
        field.backgroundColor = .clear
        field.font = Tok.Font.lineUI
        field.adjustsFontForContentSizeCategory = true
        field.textColor = UIColor(Tok.Col.textPrimary)
        field.tintColor = UIColor(Tok.Col.accent)
        field.textContainer.lineFragmentPadding = 0
        field.textContainerInset = UIEdgeInsets(
            top: Tok.Shape.shareTop - Tok.Space.xl, left: Tok.Space.xl, bottom: Tok.Space.lg, right: Tok.Space.xl
        )
        field.keyboardDismissMode = .interactive
        field.isEditable = false
        field.isHidden = true
        field.delegate = self
        if #available(iOS 17.0, *) {
            // 系統的灰字預測會算進框裡的字：打 he 按 ✓ 會記成 hello
            field.inlinePredictionType = .no
        }
        field.accessibilityLabel = ShareWords.field
    }

    /// 「拆成 N 行」：跟輸入框左上方那顆同一個樣子
    private func buildSplit() {
        var look = UIButton.Configuration.filled()
        look.baseBackgroundColor = UIColor(Tok.Col.accent)
        look.baseForegroundColor = UIColor(Tok.Col.fabIcon)
        look.cornerStyle = .capsule
        look.contentInsets = NSDirectionalEdgeInsets(
            top: Tok.Space.sm, leading: Tok.Space.lg, bottom: Tok.Space.sm, trailing: Tok.Space.lg
        )
        chip.configuration = look
        chip.isHidden = true
        chip.addAction(UIAction { [weak self] _ in self?.onSplit() }, for: .touchUpInside)
    }

    private static func splitTitle(_ count: Int) -> AttributedString {
        var words = AttributedString(ShareWords.split(count))
        words.font = UIFont.preferredFont(forTextStyle: .headline)
        return words
    }

    private func pin() {
        let safe = safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            grab.topAnchor.constraint(equalTo: topAnchor, constant: Tok.Space.sm),
            grab.centerXAnchor.constraint(equalTo: centerXAnchor),
            grab.widthAnchor.constraint(equalToConstant: Tok.Shape.handleSolo),
            grab.heightAnchor.constraint(equalToConstant: Tok.Shape.dirGrab),
            field.topAnchor.constraint(equalTo: topAnchor, constant: Tok.Space.xl),
            field.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            field.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            field.bottomAnchor.constraint(equalTo: edge.topAnchor),
            blank.topAnchor.constraint(equalTo: topAnchor, constant: Tok.Shape.shareTop),
            blank.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: Tok.Space.xl),
            blank.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -Tok.Space.xl),
            edge.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: Tok.Space.lg),
            edge.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -Tok.Space.lg),
            edge.heightAnchor.constraint(equalToConstant: Tok.Shape.hairline),
            edge.bottomAnchor.constraint(equalTo: foot.topAnchor, constant: -Tok.Space.sm),
            foot.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: Tok.Space.lg),
            foot.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -Tok.Space.lg),
            foot.bottomAnchor.constraint(equalTo: keyboardLayoutGuide.topAnchor, constant: -Tok.Space.sm),
            chip.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: Tok.Space.xl),
            chip.trailingAnchor.constraint(lessThanOrEqualTo: safe.trailingAnchor, constant: -Tok.Space.xl),
            chip.bottomAnchor.constraint(equalTo: edge.topAnchor, constant: -Tok.Space.sm),
            chip.heightAnchor.constraint(greaterThanOrEqualToConstant: Tok.Shape.hitMin),
            cancel.widthAnchor.constraint(equalToConstant: Tok.Shape.menuRow),
            cancel.heightAnchor.constraint(equalToConstant: Tok.Shape.menuRow),
            done.widthAnchor.constraint(equalToConstant: Tok.Shape.menuRow),
            done.heightAnchor.constraint(equalToConstant: Tok.Shape.menuRow),
        ])
    }
}

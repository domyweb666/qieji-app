import SwiftUI
import UIKit

/// 切換清單開著沒有。只有右下 ＋ 看著它：開、收的時候紙不用跟著重畫
final class SwitchModel: ObservableObject {
    @Published var isOpen = false
    let panel = SwitchPanelView(frame: .zero)

    func close() {
        panel.hide()
    }
}

/// 切換清單一直掛在最上面（收著時是空的、不收觸控）：按下去只要做面板本身，不用等 SwiftUI 重建一整棵
struct SwitchLayer: View {
    @ObservedObject var model: SwitchModel

    var body: some View {
        SwitchHost(model: model)
            .ignoresSafeArea()
            // 開著時 VoiceOver 鎖在面板裡（不會滑到後面的紙）
            .accessibilityElement(children: .contain)
            .accessibilityAddTraits(model.isOpen ? .isModal : [])
            .accessibilityHidden(!model.isOpen)
    }
}

private struct SwitchHost: UIViewRepresentable {
    let model: SwitchModel

    func makeUIView(context _: Context) -> SwitchPanelView {
        model.panel
    }

    func updateUIView(_: SwitchPanelView, context _: Context) {}
}

/// 切換清單（照 1.1 SwitchPanel，2026-11-04 多米換掉系統的半高面板）：點紙左上的清單名，從螢幕下面升起、貼齊底部（下面不是圓角）。
/// 跟 ⋯ 選單同一種玻璃，排法照系統選單：左邊小方磚、右邊名字，組跟組之間一條線，小字標組名。
/// 內容：新的一張、新的記事本（買了才有）；釘選的、這台手機最近開過的，正在看的打勾；最下面「管理所有清單」＝收的同時打開目錄。
/// 收起：點上面露出的紙、往下撥上緣那條、點一張。點一張時面板馬上讓開、紙同時換（2026-11-04 多米真機：要延遲一下才切換）。減少動態：自動的升起、收起換成淡入淡出；手指往下撥照樣跟手。
/// 2026-11-23 從 SwiftUI 換成原生：以前每次開都要重建整個面板，主執行緒一次卡 40–90 毫秒
final class SwitchPanelView: UIView {
    /// 開一次要的東西
    struct Content {
        var pinned: [Note]
        var recent: [Note]
        var currentID: String?
        var full: Bool
    }

    struct Actions {
        var newNote: () -> Void = {}
        var newPad: () -> Void = {}
        var open: (String) -> Void = { _ in }
        var manage: () -> Void = {}
        var gone: () -> Void = {} // 收完了
    }

    private let scrim = UIView()
    private let sheet = UIView()
    private let glass = SwitchGlass()
    private let grab = UIView()
    private let scroll = SwitchScroll()
    private let grabArea = UIView()
    /// 排在面板裡的一塊：多高、左右縮多少、上下各留多少
    private struct Part {
        let view: UIView
        let height: CGFloat
        let inset: CGFloat
        let gap: CGFloat
    }

    private var parts: [Part] = []
    private var rows: [String: SwitchRow] = [:]
    // 上次用過的列留著：下次開只換字和顏色，不用重做
    private var spareRows: [SwitchRow] = []
    private var spareLines: [UIView] = []
    private var spareHeads: [UILabel] = []
    private var actions = Actions()
    private var motion: UIViewPropertyAnimator?
    private var closing = false
    private var turn = 0 // 第幾次開：上一次的「收完了」晚到，不准收掉這一次
    private var pullFrom: CGFloat = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        build()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    private var calm: Bool {
        UIAccessibility.isReduceMotionEnabled
    }

    private func build() {
        isHidden = true
        scrim.backgroundColor = UIColor(Tok.Col.scrim)
        scrim.isAccessibilityElement = true
        scrim.accessibilityLabel = Words.closeSwitch
        scrim.accessibilityTraits = .button
        scrim.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(onOutside)))
        addSubview(scrim)
        addSubview(sheet)
        sheet.addSubview(glass)
        grab.backgroundColor = UIColor(Tok.Col.textSecondary).withAlphaComponent(CGFloat(Tok.Shape.handleOff))
        grab.layer.cornerRadius = Tok.Shape.dirGrab / 2
        sheet.addSubview(grab)
        scroll.showsVerticalScrollIndicator = true
        scroll.contentInsetAdjustmentBehavior = .never
        scroll.delaysContentTouches = false
        sheet.addSubview(scroll)
        grabArea.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(onGrabTap(_:))))
        grabArea.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(onPull(_:))))
        addSubview(grabArea)
    }

    override func accessibilityPerformEscape() -> Bool {
        dismiss()
        return true
    }

    // MARK: 開、收

    func show(_ content: Content, _ next: Actions) {
        if closing {
            hide() // 還在收又點了一次：馬上收掉，重新升起
        }
        guard isHidden else { return }
        actions = next
        closing = false
        isUserInteractionEnabled = true
        turn += 1
        isHidden = false
        fill(content)
        layout()
        motion?.stopAnimation(true)
        sheet.alpha = calm ? 0 : 1
        sheet.transform = calm ? .identity : away
        grabArea.transform = sheet.transform
        scrim.alpha = 0
        run(Tok.Motion.spring(Tok.Motion.dirPanelSeconds, velocity: 0)) { [self] in
            sheet.alpha = 1
            sheet.transform = .identity
            grabArea.transform = .identity
            scrim.alpha = 1
        }
        tell(scroll)
    }

    /// 先把列做好（打開 app 之後閒著的時候）：第一次開就跟之後一樣快
    func prepare(_ content: Content) {
        guard isHidden, parts.isEmpty else { return }
        fill(content)
    }

    /// 換了一層，跟 VoiceOver 說（沒開就不用：整個畫面會重掃一次）
    private func tell(_ spot: UIView?) {
        if UIAccessibility.isVoiceOverRunning {
            UIAccessibility.post(notification: .screenChanged, argument: spot)
        }
    }

    /// 收起：面板馬上開始讓開，then（換紙、開目錄）下一格就做，不等面板收完；收完才拿掉。收到一半又叫一次照第一次的收。
    /// speed＝往下撥放手時手指每秒幾點，接著那個速度收
    private func dismiss(speed: CGFloat = 0, then: (() -> Void)? = nil) {
        guard !closing, !isHidden else { return }
        closing = true
        isUserInteractionEnabled = false // 已經在讓開了：手指碰到的就是後面那張紙
        let left = away.ty - sheet.transform.ty
        run(Tok.Motion.spring(Tok.Motion.switchCloseSeconds, velocity: Motions.speed(speed, over: left))) { [self] in
            if calm {
                sheet.alpha = 0
            } else {
                sheet.transform = away
                grabArea.transform = away
            }
            scrim.alpha = 0
        }
        if let then {
            DispatchQueue.main.async(execute: then)
        }
        let mine = turn
        DispatchQueue.main.asyncAfter(deadline: .now() + (calm ? Tok.Motion.dirFadeSeconds : Tok.Motion.dirPanelSeconds)) { [weak self] in
            if self?.turn == mine {
                self?.hide()
            }
        }
    }

    /// 直接拿掉（收完了、或網址要開別的畫面）
    func hide() {
        guard !isHidden else { return }
        motion?.stopAnimation(true)
        motion = nil
        isHidden = true
        closing = false
        tell(nil)
        actions.gone()
    }

    private var away: CGAffineTransform {
        CGAffineTransform(translationX: 0, y: sheet.bounds.height)
    }

    /// 減少動態一律用淡的；不然照彈簧
    private func run(_ spring: UISpringTimingParameters, _ body: @escaping () -> Void) {
        let next = calm
            ? UIViewPropertyAnimator(duration: Tok.Motion.dirFadeSeconds, curve: .easeInOut)
            : UIViewPropertyAnimator(duration: .zero, timingParameters: spring)
        next.addAnimations(body)
        next.startAnimation()
        motion = next
    }

    // MARK: 手勢

    @objc private func onOutside() {
        dismiss()
    }

    /// 點上緣那條上面那半：跟點露出的紙一樣是收起
    @objc private func onGrabTap(_ gesture: UITapGestureRecognizer) {
        if gesture.location(in: grabArea).y < Tok.Shape.hitMin / 2 {
            dismiss()
        }
    }

    /// 往下撥：跟著手指；放手看 Motions.pullCloses，收起、彈回都接著手指的速度
    @objc private func onPull(_ gesture: UIPanGestureRecognizer) {
        guard !closing else { return }
        let moved = gesture.translation(in: self).y
        switch gesture.state {
        case .began:
            motion?.stopAnimation(true)
            pullFrom = sheet.transform.ty - moved
            // 升到一半就被拉住：還沒亮完的照樣亮完
            UIView.animate(withDuration: Tok.Motion.fadeSeconds, delay: 0, options: [
                .allowUserInteraction,
                .beginFromCurrentState,
            ]) { [self] in
                sheet.alpha = 1
                scrim.alpha = 1
            }
        case .changed:
            let spot = CGAffineTransform(translationX: 0, y: max(0, pullFrom + moved))
            sheet.transform = spot
            grabArea.transform = spot
        case .ended, .cancelled, .failed:
            let speed = gesture.state == .ended ? gesture.velocity(in: self).y : 0
            if gesture.state == .ended, Motions.pullCloses(moved, speed: speed, over: sheet.bounds.height) {
                dismiss(speed: max(0, speed))
            } else {
                let pace = Motions.speed(-speed, over: sheet.transform.ty)
                run(Tok.Motion.spring(Tok.Motion.dirPanelSeconds, velocity: pace)) { [self] in
                    sheet.transform = .identity
                    grabArea.transform = .identity
                }
            }
        default: break
        }
    }

    // MARK: 內容

    private func fill(_ content: Content) {
        recycle()
        addAction(Words.newNote, "plus") { [weak self] in self?.dismiss(then: self?.actions.newNote) }
        if content.full {
            addAction(Words.newPad, "doc.text") { [weak self] in self?.dismiss(then: self?.actions.newPad) }
        }
        addGroup(Words.pinGroup, content.pinned, content.currentID)
        addGroup(Words.recentGroup, content.recent, content.currentID)
        addLine()
        addAction(Words.manageAll, "square.grid.2x2", more: true) { [weak self] in self?.dismiss(then: self?.actions.manage) }
        // 這次用不到的先藏著
        for extra in spareRows as [UIView] + spareLines + spareHeads {
            extra.isHidden = true
        }
    }

    /// 上次的列全部還回去，照順序再拿來用（同一個位置多半是同一種列）
    private func recycle() {
        for part in parts.reversed() {
            if let row = part.view as? SwitchRow {
                spareRows.append(row)
            } else if let head = part.view as? UILabel {
                spareHeads.append(head)
            } else {
                spareLines.append(part.view)
            }
        }
        parts = []
        rows = [:]
    }

    private func take<V: UIView>(_ spare: inout [V], _ make: () -> V) -> V {
        guard let old = spare.popLast() else {
            let made = make()
            scroll.addSubview(made)
            return made
        }
        old.isHidden = false
        return old
    }

    private func add(_ view: UIView, height: CGFloat, inset: CGFloat = 0, gap: CGFloat = 0) {
        parts.append(Part(view: view, height: height, inset: inset, gap: gap))
    }

    private func addAction(_ title: String, _ symbol: String, more: Bool = false, run: @escaping () -> Void) {
        let row = take(&spareRows) { SwitchRow() }
        row.showAction(title, symbol, more: more)
        row.run = run
        add(row, height: row.wantedHeight)
    }

    private func addGroup(_ title: String, _ notes: [Note], _ currentID: String?) {
        guard !notes.isEmpty else { return }
        addLine()
        let head = take(&spareHeads) { UILabel() }
        head.text = title
        head.font = Tok.Font.styleUI(.footnote, weight: .semibold)
        head.textColor = UIColor(Tok.Col.textSecondary)
        head.accessibilityTraits = .header
        add(head, height: head.font.lineHeight.rounded(.up) + Tok.Space.xs * 2, inset: Tok.Space.gutter)
        for note in notes {
            let row = take(&spareRows) { SwitchRow() }
            row.showNote(note, current: note.id == currentID)
            row.run = { [weak self] in self?.pick(note.id) }
            rows[note.id] = row
            add(row, height: row.wantedHeight)
        }
    }

    private func addLine() {
        let line = take(&spareLines) { UIView() }
        line.backgroundColor = UIColor(Tok.Col.menuSep)
        add(line, height: 1 / max(1, traitCollection.displayScale), inset: Tok.Space.gutter, gap: Tok.Space.sm)
    }

    /// 點一張：打勾馬上移過去，面板讓開、下一格換紙
    private func pick(_ id: String) {
        guard !closing else { return }
        let old = rows.first { $0.value.current }?.key
        for (key, row) in rows {
            row.current = key == id
        }
        dismiss(then: old == id ? nil : { [weak self] in self?.actions.open(id) })
    }

    // MARK: 排版

    override func layoutSubviews() {
        super.layoutSubviews()
        if !isHidden, sheet.bounds.width != bounds.width {
            layout()
        }
        scrim.frame = bounds
    }

    private func layout() {
        let width = bounds.width, insets = window?.safeAreaInsets ?? .zero
        var top: CGFloat = 0
        for part in parts {
            top += part.gap
            part.view.frame = CGRect(x: part.inset, y: top, width: width - part.inset * 2, height: part.height)
            top += part.height + part.gap
        }
        let wanted = top + insets.bottom + Tok.Space.sm
        // 照內容長高，最高佔螢幕七成，清單多就在裡面捲
        let grabHeight = Tok.Shape.hitMin / 2
        let room = (bounds.height - insets.top - insets.bottom) * Tok.Shape.switchMaxRatio
        let inner = min(wanted, room - grabHeight + insets.bottom)
        let tall = grabHeight + inner
        scroll.contentSize = CGSize(width: width, height: wanted)
        scroll.contentOffset = .zero
        scroll.frame = CGRect(x: 0, y: grabHeight, width: width, height: inner)
        sheet.bounds = CGRect(x: 0, y: 0, width: width, height: tall)
        sheet.center = CGPoint(x: width / 2, y: bounds.height - tall / 2)
        glass.frame = sheet.bounds
        grab.frame = CGRect(
            x: (width - Tok.Shape.handleSolo) / 2, y: (grabHeight - Tok.Shape.dirGrab) / 2,
            width: Tok.Shape.handleSolo, height: Tok.Shape.dirGrab
        )
        // 往下撥的熱區：上緣那條加上面 22 點，合起來 44（只有那條的話太矮，手指抓不到）
        grabArea.bounds = CGRect(x: 0, y: 0, width: width, height: Tok.Shape.hitMin)
        grabArea.center = CGPoint(x: width / 2, y: bounds.height - tall)
    }
}

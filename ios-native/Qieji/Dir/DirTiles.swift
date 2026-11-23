import SwiftUI
import UIKit

/// 一塊磚的樣子（照 iPhone 主畫面的 App）：上面置中的方磚、下面一行名字。
/// 紙磚：整塊是紙的主色、正中間一個字，釘選的右上角一個圖釘，上鎖的左上角一個鎖。
/// 資料夾磚：方磚裡 3×3 小方塊，每塊是裡面一張紙的顏色和字。正在看的那張用茄紫框起來。
/// 2026-11-23 從 SwiftUI 換成原生：一塊磚只有兩層（方磚一次畫完、一行名字），目錄一打開不用做幾百個小塊
final class DirFaceView: UIView {
    let square = TileSquare(frame: .zero)
    private let label = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        label.textAlignment = .center
        label.lineBreakMode = .byTruncatingTail
        addSubview(square)
        addSubview(label)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    func show(_ entry: Seats.Entry, current: Bool, font: UIFont) {
        square.face = TileFace(entry, current: current)
        let name = entry.folder?.name ?? entry.note.map { Labels.label($0) } ?? ""
        // 沒取名的用次要色，看得出是「還沒取名」不是名字
        let named = entry.folder != nil || !Labels.trim(entry.note?.title ?? "").isEmpty
        // 系統字調大時最多放大 1.5 倍（1.1 titleMaxScale）；放不下就尾巴變「…」，不縮字
        if label.font != font {
            label.font = font
            setNeedsLayout()
        }
        if label.text != name {
            label.text = name
            setNeedsLayout()
        }
        label.textColor = UIColor(named ? Tok.Col.textPrimary : Tok.Col.textSecondary)
    }

    /// 準備疊上去時名字先收起來
    var nameHidden = false {
        didSet {
            label.alpha = nameHidden ? 0 : 1
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let cell = bounds.width, side = DirMetrics(cell: cell).side
        square.frame = CGRect(x: (cell - side) / 2, y: 0, width: side, height: side)
        // 字變高時往下長進列與列的空隙，格子的位置不跟著動（拖曳的落點照格子算）
        let tall = label.sizeThatFits(CGSize(width: cell, height: .greatestFiniteMagnitude)).height
        label.frame = CGRect(x: Tok.Space.xs, y: side + Tok.Shape.tileLabelGap, width: cell - Tok.Space.xs * 2, height: tall)
    }
}

/// 磚的樣子給 SwiftUI 那幾個地方用：拿起來的那張、長按選單浮著的那塊、搬行模式的搜尋
struct DirTileFace: View {
    let entry: Seats.Entry
    let cell: CGFloat
    var current = false

    var body: some View {
        Face(entry: entry, current: current)
            .frame(width: cell, height: DirMetrics(cell: cell).tileHeight)
            .contentShape(Rectangle())
    }

    private struct Face: UIViewRepresentable {
        let entry: Seats.Entry
        let current: Bool
        /// 系統字級改了要重排
        @Environment(\.dynamicTypeSize) private var typeSize

        func makeUIView(context _: Context) -> DirFaceView {
            let view = DirFaceView(frame: .zero)
            view.accessibilityElementsHidden = true
            return view
        }

        func updateUIView(_ view: DirFaceView, context _: Context) {
            _ = typeSize
            view.show(entry, current: current, font: Tok.Font.labelUI())
        }
    }
}

/// 排在某一格的一塊磚現在的樣子
struct DirSlot {
    var entry: Seats.Entry
    var index: Int
    var spot: CGPoint
    var current = false
    var editing = false
    var hidden = false // 拖走了先藏起來
    var target = false // 被瞄著要疊
    var pop = false // 剛有東西縮進來
    var held = false // 手指按著
    var inFolder = false
}

/// 目錄或資料夾裡的一塊磚，帶各種狀態：抖動、按著變淡／放大、被瞄著要疊、剛有東西縮進來、拖走了先藏起來。
/// 只改真的變了的那一樣；換位、放大、底板都是系統動畫，不經過 SwiftUI
final class DirTileView: UIView {
    private let turner = UIView() // 抖動轉這層
    private let body = UIView() // 按住、彈一下放大這層
    let face = DirFaceView(frame: .zero)
    private var plate: UIView?
    private var minus: UIImageView?
    private var slot: DirSlot?
    weak var model: DirModel?

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        addSubview(turner)
        turner.addSubview(body)
        body.addSubview(face)
        isAccessibilityElement = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        for part in [turner, body, face] {
            // 可能正在轉、正在放大（transform），位置改 bounds／center，不改 frame
            part.bounds = bounds
            part.center = CGPoint(x: bounds.midX, y: bounds.midY)
        }
    }

    /// 位置由外面的格子排
    func show(_ next: DirSlot, font: UIFont, calm: Bool, animated: Bool) {
        let old = slot
        slot = next
        let moves = animated && !calm
        // 每次都看（封面圖晚到時紙本身沒變）：裡面自己比，沒變就不重畫
        face.show(next.entry, current: next.current, font: font)
        if old?.hidden != next.hidden {
            alpha = next.hidden ? 0 : 1
        }
        if old?.target != next.target {
            showTarget(next.target, animated: moves && old != nil)
        }
        if old?.held != next.held || old?.editing != next.editing || old?.pop != next.pop || old?.target != next.target {
            showPress(next, animated: moves && old != nil)
        }
        if old?.editing != next.editing {
            jiggle(next.editing && !calm, odd: next.index % 2 == 1)
        }
        showMinus(next)
        accessibilityTraits = next.current ? [.button, .selected] : .button
    }

    /// 按著：沒抖動＝變淡，抖動中＝放大（等著被拿起來）
    private func showPress(_ now: DirSlot, animated: Bool) {
        let scale = (now.held && now.editing ? Tok.Motion.tileHoldScale : 1) * (now.pop ? Tok.Motion.stackPop : 1)
        let dim = now.target ? Tok.Motion.stackDim : (now.held && !now.editing ? Tok.Motion.pressDim : 1)
        let change = { [self] in
            body.transform = scale == 1 ? .identity : CGAffineTransform(scaleX: scale, y: scale)
            face.alpha = CGFloat(dim)
        }
        guard animated else {
            change()
            return
        }
        UIView.animate(
            withDuration: Tok.Motion.dragLiftSeconds, delay: 0, options: [.allowUserInteraction, .beginFromCurrentState, .curveEaseOut],
            animations: change
        )
    }

    /// 被瞄著要疊的那張：後面長出底板、名字收起
    private func showTarget(_ on: Bool, animated: Bool) {
        face.nameHidden = on
        guard on || plate != nil else { return }
        let board = plate ?? makePlate()
        let grow = Tok.Motion.stackPlate
        let change = {
            board.alpha = on ? 1 : 0
            board.transform = on ? CGAffineTransform(scaleX: grow, y: grow) : .identity
        }
        guard animated else {
            change()
            return
        }
        UIView.animate(
            withDuration: Tok.Motion.stackCueSeconds, delay: 0, options: [.allowUserInteraction, .beginFromCurrentState, .curveEaseInOut],
            animations: change
        )
    }

    private func makePlate() -> UIView {
        let side = DirMetrics(cell: bounds.width).side
        let made = UIView(frame: CGRect(x: (bounds.width - side) / 2, y: 0, width: side, height: side))
        made.backgroundColor = UIColor(Tok.Col.menuSep)
        made.layer.cornerRadius = side * Tok.Shape.tileRadiusRatio
        made.layer.cornerCurve = .continuous
        made.alpha = 0
        body.insertSubview(made, at: 0)
        plate = made
        return made
    }

    /// 抖動中紙磚左上角的「−」（資料夾磚沒有）；按住那塊時收起
    private func showMinus(_ now: DirSlot) {
        let want = now.editing && now.entry.folder == nil && !now.target
        guard want || minus != nil else { return }
        let dot = minus ?? makeMinus()
        dot.isHidden = !want
        dot.alpha = now.held ? 0 : 1
    }

    private func makeMinus() -> UIImageView {
        let side = DirMetrics(cell: bounds.width).side, size = Tok.Shape.minusBadge
        let font = UIFont.systemFont(ofSize: Tok.Font.labelUI().pointSize, weight: .bold)
        let made = UIImageView(image: UIImage(systemName: "minus", withConfiguration: UIImage.SymbolConfiguration(font: font)))
        made.contentMode = .center
        made.tintColor = UIColor(Tok.Col.textPrimary)
        made.backgroundColor = UIColor(Tok.Col.separator)
        made.frame = CGRect(x: (bounds.width - side) / 2 - Tok.Space.sm, y: -Tok.Space.sm, width: size, height: size)
        made.layer.cornerRadius = size / 2
        body.addSubview(made)
        minus = made
        return made
    }

    /// 抖動：相鄰兩塊方向相反，來回轉一點點。停了立刻歸正（1.1）
    private func jiggle(_ on: Bool, odd: Bool) {
        let key = "jiggle"
        turner.layer.removeAnimation(forKey: key)
        guard on else { return }
        let swing = Tok.Motion.jiggleDeg * (odd ? -1 : 1) * .pi / 180
        let wave = CABasicAnimation(keyPath: "transform.rotation.z")
        wave.fromValue = -swing
        wave.toValue = swing
        wave.duration = Tok.Motion.jiggleSeconds
        wave.autoreverses = true
        wave.repeatCount = .infinity
        wave.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        wave.isRemovedOnCompletion = false // 切到別的 app 再回來照樣抖
        turner.layer.add(wave, forKey: key)
    }

    // MARK: VoiceOver（問到才算，平常不花時間）

    override var accessibilityLabel: String? {
        get { slot.flatMap { model?.voiceLabel($0.entry) } }
        set {}
    }

    override var accessibilityCustomActions: [UIAccessibilityCustomAction]? {
        get {
            guard let slot, let model else { return nil }
            return model.voiceActs(slot.entry, inFolder: slot.inFolder).map { act in
                UIAccessibilityCustomAction(name: act.name) { _ in
                    act.run()
                    return true
                }
            }
        }
        set {}
    }

    override func accessibilityActivate() -> Bool {
        guard let slot, let model else { return false }
        model.voiceActivate(slot.entry)
        return true
    }
}

/// 一面磚（目錄的一頁、打開的資料夾）：每塊磚用位置排到第幾格，換位只改位置
final class DirGridView: UIView {
    weak var model: DirModel?
    private var tiles: [String: DirTileView] = [:]
    private var places: [String: (index: Int, spot: CGPoint)] = [:]

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    func show(_ slots: [DirSlot], size: CGSize, calm: Bool, animated: Bool) {
        var gone = Set(tiles.keys)
        let font = Tok.Font.labelUI()
        for slot in slots {
            let id = slot.entry.id
            gone.remove(id)
            let fresh = tiles[id] == nil
            let tile = tiles[id] ?? make(id)
            let frame = CGRect(origin: slot.spot, size: size)
            let center = CGPoint(x: frame.midX, y: frame.midY)
            tile.bounds = CGRect(origin: .zero, size: size)
            let moved = !fresh && places[id]?.index != slot.index
            places[id] = (slot.index, slot.spot)
            if tile.center != center {
                move(tile, to: center, animated: moved && animated && !calm)
            }
            tile.show(slot, font: font, calm: calm, animated: animated)
        }
        for id in gone {
            tiles[id]?.removeFromSuperview()
            tiles[id] = nil
            places[id] = nil
        }
    }

    private func make(_ id: String) -> DirTileView {
        let made = DirTileView(frame: .zero)
        made.model = model
        addSubview(made)
        tiles[id] = made
        return made
    }

    /// 換位：1.1 tileShift 同一個彈簧
    private func move(_ tile: DirTileView, to center: CGPoint, animated: Bool) {
        guard animated else {
            tile.center = center
            return
        }
        let runner = UIViewPropertyAnimator(duration: 0, timingParameters: Tok.Motion.tileSpring)
        runner.addAnimations { tile.center = center }
        runner.startAnimation()
    }
}

/// 一面磚接到 SwiftUI
struct DirGrid: UIViewRepresentable {
    let model: DirModel
    let slots: [DirSlot]
    let cell: CGFloat
    @Environment(\.accessibilityReduceMotion) private var calm
    /// 系統字級改了要重排
    @Environment(\.dynamicTypeSize) private var typeSize

    func makeUIView(context _: Context) -> DirGridView {
        let view = DirGridView(frame: .zero)
        view.model = model
        return view
    }

    func updateUIView(_ view: DirGridView, context: Context) {
        _ = typeSize
        let size = CGSize(width: cell, height: DirMetrics(cell: cell).tileHeight)
        PerfMeter.time("grid") {
            view.show(slots, size: size, calm: calm, animated: !context.transaction.disablesAnimations)
        }
    }
}

/// 目錄的一頁
struct DirPageView: View {
    @ObservedObject var model: DirModel
    let items: [Seats.Entry]
    let currentID: String?
    @ObservedObject private var covers = Covers.shared

    init(model: DirModel, items: [Seats.Entry], currentID: String?) {
        self.model = model
        self.items = items
        self.currentID = currentID
    }

    var body: some View {
        let metrics = model.metrics
        let rows = (items.count + DirMetrics.cols - 1) / DirMetrics.cols
        _ = covers.version // 封面圖到了、換了（紙本身沒變，磚也要重畫）
        return DirGrid(model: model, slots: slots(metrics), cell: metrics.cell)
            .frame(width: metrics.cell * CGFloat(DirMetrics.cols), height: metrics.height(rows: rows), alignment: .topLeading)
    }

    private func slots(_ metrics: DirMetrics) -> [DirSlot] {
        items.enumerated().filter { !$0.element.isHole }.map { index, entry in
            DirSlot(
                entry: entry, index: index, spot: metrics.slot(index), current: isCurrent(entry), editing: model.editing,
                hidden: model.drag?.id == entry.id, target: model.stackOn == entry.id, pop: model.popID == entry.id,
                held: model.heldID == entry.id
            )
        }
    }

    private func isCurrent(_ entry: Seats.Entry) -> Bool {
        entry.folder != nil ? entry.notes.contains { $0.id == currentID } : entry.id == currentID
    }
}

/// 拿起來的那張：畫在目錄最上層，從拿起那格的位置跟著手指，浮起一點
struct DirGhostView: View {
    @ObservedObject var ghost: DirGhost

    var body: some View {
        if let entry = ghost.entry {
            DirTileFace(entry: entry, cell: ghost.width)
                .scaleEffect((ghost.lifted ? Tok.Motion.tileHoldScale : 1) * (ghost.sinking ? Tok.Motion.sinkScale : 1))
                .opacity(ghost.sinking ? 0 : 1)
                .shadow(
                    color: Tok.Col.shadow.opacity(Tok.Shape.shadowSoft),
                    radius: Tok.Shape.shadowRadius, x: 0, y: Tok.Shape.shadowY
                )
                .offset(
                    x: ghost.corner.x + ghost.shift.width + ghost.catchUp.width,
                    y: ghost.corner.y + ghost.shift.height + ghost.catchUp.height
                )
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}

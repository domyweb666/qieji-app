import SwiftUI
import UIKit

/// 紙上的清單（原生捲動區，自己排每一行）。2026-11-23 從 SwiftUI 的 LazyVStack 換過來：
/// 以前手指每滑一格整張紙都要重算一次，鍵盤遮住打字的行、刪掉的字閃一下、捲動位置會跳，也都從那裡來。
/// 這裡每一行的高度都算得出來，只掛畫面附近的行；滑動、拖曳、補位都是系統動畫，不經過 SwiftUI。
/// 排版與更新在這個檔；打字與鍵盤在 LineList+Edit，點、按住、左右滑在 LineList+Touch，排順序在 LineList+Drag。
final class LineListView: UIScrollView {
    // 資料
    var rows: [LineItem] = []
    var look = LineLook(key: "yellow", scale: 1)
    var heights: [CGFloat] = []
    var tops: [CGFloat] = []
    var measured: [Bool] = []
    var spots: [String: Int] = [:]
    private var laidWidth: CGFloat = 0
    /// 清單現在長怎樣（打字、劃掉、刪除之後馬上照它排，不等 SwiftUI 下一格）
    var source: () -> [LineItem] = { [] }

    // 掛在畫面上的行
    var live: [String: LineRowView] = [:]
    var leavers: [LineRowView] = [] // 刪掉了、還在淡出的
    private static var spare: [LineRowView] = []
    private static let spareMax = 36
    let content = PassView()

    // 捲動內容最前面那一塊（封面的方磚與大字、空白說明）
    private var headHost: UIHostingController<AnyView>?
    var headHeight: CGFloat = 0
    /// 一行都沒有時的兩行說明：疊在行的位置上、不佔高，第一行記進來時不會先排在說明下面再跳上去
    private var emptyHost: UIHostingController<AnyView>?
    /// 剛記下、還沒捲到的那行：掛上的時候亮一下
    var freshID: String?

    var spy = ScrollSpy()
    let glider = Glide()

    // 打字
    var editingID: String?
    var keyboardOverlap: CGFloat = 0
    var keyboardTokens: [NSObjectProtocol] = []

    // 手勢
    let swipePan = SwipePan()
    let gripPan = GripPan()
    let tap = UITapGestureRecognizer()
    let hold = UILongPressGestureRecognizer()
    var touchStart: CGPoint = .zero
    var touchStopped = false // 這一下是按停還在捲的紙，不算點
    var swiping: LineRowView?
    var swipeBase: CGFloat = 0
    var swipeArmed = false
    var drag: LineDrag?
    var dragTurn = 0
    var autoLink: CADisplayLink?
    var autoSpeed: CGFloat = 0

    // 交給紙的事
    var onEditing: (String?) -> Void = { _ in }
    var onChange: (String, String) -> Void = { _, _ in }
    var onEnd: (String) -> Void = { _ in }
    var onJoinUp: (String, String) -> (id: String, at: Int)? = { _, _ in nil }
    var onStrike: (String) -> Void = { _ in }
    var onDelete: (String) -> Void = { _ in }
    var onMove: (String, Int) -> Void = { _, _ in }
    var onMenu: (String, CGFloat) -> Void = { _, _ in }
    var onBlank: () -> Void = {}
    var voice: (LineItem, Int, Int) -> [VoiceAct] = { _, _, _ in [] }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        alwaysBounceVertical = true
        contentInsetAdjustmentBehavior = .never
        keyboardDismissMode = .interactive
        delaysContentTouches = false
        addSubview(content)
        delegate = self
        wireTouches()
        watchKeyboard()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    deinit {
        autoLink?.invalidate()
        for token in keyboardTokens {
            NotificationCenter.default.removeObserver(token)
        }
    }

    var calm: Bool {
        UIAccessibility.isReduceMotionEnabled
    }

    // MARK: 位置

    func spot(of id: String) -> Int? {
        spots[id]
    }

    func frame(at index: Int) -> CGRect {
        CGRect(x: 0, y: headHeight + tops[index] + giveWay(index), width: bounds.width, height: heights[index])
    }

    func restFrame(_ id: String) -> CGRect? {
        spots[id].map { CGRect(x: 0, y: headHeight + tops[$0], width: bounds.width, height: heights[$0]) }
    }

    /// 捲動內容裡這個高度是哪一行
    func index(atY spotY: CGFloat) -> Int? {
        let local = spotY - headHeight
        guard local >= 0, let last = tops.last, let tall = heights.last, local < last + tall else { return nil }
        var low = 0, high = tops.count - 1
        while low < high {
            let mid = (low + high + 1) / 2
            if tops[mid] <= local {
                low = mid
            } else {
                high = mid - 1
            }
        }
        return low
    }

    var total: CGFloat {
        (tops.last ?? 0) + (heights.last ?? 0)
    }

    var safeBottom: CGFloat {
        window?.safeAreaInsets.bottom ?? 0
    }

    var wantedSize: CGSize {
        CGSize(width: bounds.width, height: headHeight + total + Tok.Space.belowList)
    }

    var bottomInset: CGFloat {
        max(keyboardOverlap, safeBottom)
    }

    var maxOffset: CGFloat {
        max(0, wantedSize.height + bottomInset - bounds.height)
    }

    func stack() {
        var top: CGFloat = 0
        tops = heights.map { tall in
            defer { top += tall }
            return top
        }
    }

    /// 全部重算高度。行很多時先量前面一段，其餘先估，之後再慢慢量準（都在畫面下面，看不出來）
    func remeasureAll() {
        laidWidth = bounds.width
        let sharp = LineListView.sharpRows
        measured = rows.indices.map { $0 < sharp }
        heights = PerfMeter.time("measure") { rows.enumerated().map { tall($1, exact: $0 < sharp) } }
        stack()
        sharpenSoon()
    }

    static let sharpRows = 80

    func tall(_ row: LineItem, exact: Bool) -> CGFloat {
        exact
            ? LineMeasure.height(row.text, width: bounds.width, look: look)
            : LineMeasure.guess(row.text, width: bounds.width, look: look)
    }

    func sharpenSoon() {
        guard measured.contains(false) else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self, drag == nil else { return }
            PerfMeter.time("sharpen") { self.sharpenSome() }
            keepingSight { self.stack() }
            sharpenSoon()
        }
    }

    private func sharpenSome() {
        var left = LineListView.sharpRows
        for index in measured.indices where !measured[index] && left > 0 {
            sharpen(index)
            left -= 1
        }
    }

    func sharpen(_ index: Int) {
        guard !measured[index] else { return }
        measured[index] = true
        heights[index] = tall(rows[index], exact: true)
    }

    /// 高度變了但看到的東西不准動：記住最上面那行，變完把捲動位置補回來
    private func keepingSight(_ change: () -> Void) {
        let anchor = index(atY: contentOffset.y).map { (rows[$0].id, tops[$0]) }
        change()
        contentSize = wantedSize
        if let anchor, let now = spots[anchor.0], tops[now] != anchor.1 {
            contentOffset.y += tops[now] - anchor.1
        }
        placeAll()
    }

    // MARK: 掛行、收行

    /// 這個捲動位置要掛哪幾行（上下多留一點）
    func window(from offset: CGFloat, spare: CGFloat = LineListView.mountSpare) -> Range<Int> {
        guard !rows.isEmpty, bounds.height > 0 else { return 0 ..< 0 }
        let extra = bounds.height * spare
        let low = index(atY: max(headHeight, offset - extra)) ?? 0
        let high = index(atY: offset + bounds.height + extra) ?? rows.count - 1
        guard offset - extra < headHeight + total else { return 0 ..< 0 }
        return low ..< max(low, high) + 1
    }

    static let mountSpare: CGFloat = 0.35
    private static let keepSpare: CGFloat = 1
    private static let firstSpare: CGFloat = 0.05

    /// 掛上該掛的、收回太遠的
    func fill(spare: CGFloat = LineListView.mountSpare) {
        let range = window(from: contentOffset.y, spare: spare)
        var resized = false
        for index in range where !measured[index] {
            sharpen(index)
            resized = true
        }
        if resized {
            keepingSight { self.stack() }
        }
        PerfMeter.time("mount") {
            UIView.performWithoutAnimation {
                for index in range where live[rows[index].id] == nil {
                    let row = mount(index)
                    row.frame = frame(at: index)
                    row.layoutIfNeeded()
                }
            }
        }
        let keep = window(from: contentOffset.y, spare: LineListView.keepSpare)
        for (id, row) in live {
            guard let index = spots[id], !keep.contains(index), id != editingID, id != drag?.id, row !== swiping, row.runner == nil,
                  !row.leaving
            else { continue }
            live[id] = nil
            recycle(row)
        }
    }

    @discardableResult
    func mount(_ index: Int) -> LineRowView {
        let item = rows[index]
        let row = LineListView.spare.popLast() ?? LineRowView(frame: .zero)
        row.bounds.size = CGSize(width: bounds.width, height: heights[index])
        row.show(item, look: look)
        row.field.delegate = self
        row.field.onDeleteAtStart = { [weak self, weak row] in
            guard let self, let row else { return }
            joinUp(row)
        }
        dress(row, index)
        live[item.id] = row
        content.addSubview(row)
        if item.id == freshID {
            // 掛行是在「不准動畫」裡做的，晚一格才亮
            DispatchQueue.main.async { [weak self] in
                if self?.freshID == item.id {
                    self?.flash(item.id)
                }
            }
        }
        return row
    }

    /// VoiceOver 的動作選單（劃掉、刪除、往上移、往下移）：照現在的位置給
    func dress(_ row: LineRowView, _ index: Int) {
        row.field.accessibilityCustomActions = voice(rows[index], index, rows.count).map { act in
            UIAccessibilityCustomAction(name: act.name) { [weak self] _ in
                act.run()
                self?.refresh()
                return true
            }
        }
    }

    func recycle(_ row: LineRowView) {
        row.clear()
        row.removeFromSuperview()
        if LineListView.spare.count < LineListView.spareMax {
            LineListView.spare.append(row)
        }
    }

    /// 這張紙收起來：行全部還回去，下一張直接拿來用（換紙不用重新做一批文字框）
    func dismantle() {
        settleLanding()
        stopAutoScroll()
        glider.stop()
        for row in Array(live.values) + leavers {
            row.field.delegate = nil
            row.field.resignFirstResponder()
            recycle(row)
        }
        live = [:]
        leavers = []
    }

    func placeAll() {
        for (id, row) in live {
            guard let index = spots[id], id != drag?.id else { continue }
            let next = frame(at: index)
            if row.frame != next {
                row.frame = next
                row.layoutIfNeeded()
            }
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0 else { return }
        if laidWidth != bounds.width {
            PerfMeter.time("firstLayout") {
                remeasureAll()
                layoutHead()
                layoutEmpty()
            }
            contentSize = wantedSize
            placeAll()
        }
        // 內容塊只是個容器：不裁切，尺寸給 VoiceOver 和觸控用
        if content.frame.size != contentSize {
            content.frame = CGRect(origin: .zero, size: contentSize)
        }
        if contentInset.bottom != bottomInset {
            applyInset()
        }
        let first = live.isEmpty && !rows.isEmpty
        // 第一格只掛看得到的，紙先出來；下一格再補前後多留的
        fill(spare: first ? LineListView.firstSpare : LineListView.mountSpare)
        if first {
            DispatchQueue.main.async { [weak self] in self?.fill() }
        }
        let spot = contentOffset.y
        if spy.y != spot {
            spy.y = spot
        }
    }

    func applyInset() {
        contentInset.bottom = bottomInset
        verticalScrollIndicatorInsets.bottom = bottomInset
    }

    // MARK: 最前面那一塊

    func setHead(_ head: AnyView?) {
        guard let head else {
            guard headHost != nil else { return }
            headHost?.view.removeFromSuperview()
            headHost = nil
            headHeight = 0
            layoutEmpty()
            contentSize = wantedSize
            placeAll()
            return
        }
        if let headHost {
            headHost.rootView = head
        } else {
            let host = UIHostingController(rootView: head)
            host.view.backgroundColor = .clear
            host.safeAreaRegions = []
            insertSubview(host.view, at: 0)
            headHost = host
        }
        layoutHead()
    }

    private func layoutHead() {
        guard let host = headHost, bounds.width > 0 else { return }
        let size = host.sizeThatFits(in: CGSize(width: bounds.width, height: .greatestFiniteMagnitude))
        host.view.frame = CGRect(x: 0, y: 0, width: bounds.width, height: size.height)
        guard headHeight != size.height else { return }
        headHeight = size.height
        layoutEmpty()
        contentSize = wantedSize
        placeAll()
    }

    // MARK: 一行都沒有的說明

    func setEmpty(_ view: AnyView) {
        let host = UIHostingController(rootView: view)
        host.view.backgroundColor = .clear
        host.safeAreaRegions = []
        host.view.isUserInteractionEnabled = false // 點說明＝點空白處
        host.view.alpha = 0
        insertSubview(host.view, at: 0)
        emptyHost = host
        layoutEmpty()
    }

    private func layoutEmpty() {
        guard let host = emptyHost, bounds.width > 0 else { return }
        let size = host.sizeThatFits(in: CGSize(width: bounds.width, height: .greatestFiniteMagnitude))
        host.view.frame = CGRect(x: 0, y: headHeight, width: bounds.width, height: size.height)
    }

    /// 刪到一行都不剩：最後那行淡完說明才淡進來（疊在一起看不清楚）；記下第一行：馬上拿掉
    func showEmpty(animated: Bool) {
        guard let view = emptyHost?.view else { return }
        let want: CGFloat = rows.isEmpty ? 1 : 0
        view.accessibilityElementsHidden = want == 0
        guard view.alpha != want else { return }
        guard animated, want == 1 else {
            view.layer.removeAllAnimations()
            view.alpha = want
            return
        }
        layoutEmpty()
        UIView.animate(withDuration: Tok.Motion.fadeSeconds, delay: Tok.Motion.rowShiftSeconds, options: .allowUserInteraction) {
            view.alpha = self.rows.isEmpty ? 1 : 0
        }
    }

    func inHead(_ view: UIView?) -> Bool {
        guard let view, let host = headHost else { return false }
        return view.isDescendant(of: host.view)
    }
}

/// 空白處不擋觸控的容器（行才收）
final class PassView: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit
    }
}

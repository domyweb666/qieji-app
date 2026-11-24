import UIKit

/// 打開的資料夾要畫的東西
struct FolderLook {
    let entry: Seats.Entry
    let tile: TileFace
    let place: FolderPlace
    let cell: CGFloat
    let pages: Int
    let page: Int
    let slots: [DirSlot]
    let solid: Bool // 減少透明度

    static func pages(_ count: Int) -> Int {
        max(1, (count + DirMetrics.folderPer - 1) / DirMetrics.folderPer)
    }
}

/// 打開的資料夾（照 iPhone 的檔案夾）：名字大字靠左在框上面，框裡一頁三欄三列，滿了往右一頁。
/// 從那塊磚的方磚放大到定位、縮回去都是系統動畫（每一格的位置先算好一次交出去），主執行緒在忙也不會頓。
/// 位置一開始就是終點，所以放大途中手指碰得到的就是定位的那些磚
final class FolderCard: UIView {
    private static let key = "folder"

    let scroll = UIScrollView()
    private let holder = UIView() // 放大縮小
    private let shade = FolderShade(frame: .zero)
    private let clip = UIView() // 圓角
    private let frost = SoftBlurView(amount: Tok.Col.folderBoxBlur)
    private let tint = UIView()
    private let field = UITextField()
    private let grid = DirGridView(frame: .zero)
    private let dots = FolderDots(frame: .zero)
    private let cover = TileSquare(frame: .zero) // 磚原本的樣子
    private var place: FolderPlace?
    private var fit: FolderFit?
    private var page = 0
    private var naming = false
    private var added: CFTimeInterval = 0

    weak var model: DirModel?
    private(set) var folder: Folder?
    private(set) var up = false // 開著（或正在開）
    private(set) var moving = false
    private(set) var grow = FolderFlight.still(0) // 框從磚（0）到定位（1）
    private(set) var show = FolderFlight.still(0) // 改用淡的時候
    private(set) var home: FolderHome? // 從哪塊磚、縮回哪塊磚（停在定位時沒有）

    var id: String? {
        folder?.id
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isHidden = true
        field.placeholder = Words.folderNameLabel
        field.accessibilityLabel = Words.folderNameLabel
        field.returnKeyType = .done
        field.delegate = self
        field.addTarget(self, action: #selector(typed), for: .editingChanged)
        // 淡的時候一層一層各自淡：整塊當一張淡，框後面的霧會不見
        for part in [layer, holder.layer, clip.layer] {
            part.allowsGroupOpacity = false
        }
        clip.clipsToBounds = true
        clip.layer.cornerCurve = .continuous
        tint.isUserInteractionEnabled = false
        scroll.showsHorizontalScrollIndicator = false
        scroll.showsVerticalScrollIndicator = false
        scroll.contentInsetAdjustmentBehavior = .never
        scroll.scrollsToTop = false
        scroll.addSubview(grid)
        for part in [frost, tint, scroll, dots, cover] {
            clip.addSubview(part)
        }
        holder.addSubview(shade)
        holder.addSubview(clip)
        addSubview(holder)
        addSubview(field)
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        paint()
    }

    private func paint() {
        field.textColor = UIColor(Tok.Col.textPrimary)
        clip.layer.borderWidth = 1 / max(1, traitCollection.displayScale)
        clip.layer.borderColor = UIColor(Tok.Col.folderGlassEdge).resolvedColor(with: traitCollection).cgColor
    }

    /// 自己沒有東西可碰：框外的讓給後面「點了就收」的那層
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let found = super.hitTest(point, with: event)
        return found === self ? nil : found
    }

    // MARK: 內容

    /// 換成這個資料夾（還沒開就先備好也是這裡）
    func fill(_ look: FolderLook) {
        guard let next = look.entry.folder else { return }
        grid.model = model
        folder = next
        if !field.isEditing, field.text != next.name {
            field.text = next.name
        }
        let font = FolderPlace.font
        if field.font != font {
            field.font = font
        }
        arrange(look)
        tint.backgroundColor = UIColor(look.solid ? Tok.Col.folderGlass : Tok.Col.folderGlassBlur)
        frost.isHidden = look.solid
        cover.face = look.tile
        dots.show(look.pages, now: look.page)
        page = look.page
        let size = CGSize(width: look.cell, height: DirMetrics(cell: look.cell).tileHeight)
        PerfMeter.time("folder") {
            UIView.lively { grid.show(look.slots, size: size, calm: UIAccessibility.isReduceMotionEnabled, animated: up) }
        }
    }

    private func arrange(_ look: FolderLook) {
        let inner = CGRect(origin: .zero, size: look.place.page)
        let wide = CGSize(width: CGFloat(look.pages) * inner.width, height: inner.height)
        if scroll.contentSize != wide {
            scroll.contentSize = wide
            grid.frame = CGRect(origin: .zero, size: wide)
        }
        guard place != look.place else { return }
        place = look.place
        let box = CGRect(origin: .zero, size: look.place.box.size)
        field.frame = look.place.name
        holder.bounds = box
        for part in [shade, clip, frost, tint] {
            part.frame = box
        }
        // 可能正在縮（transform），位置改 bounds／center，不改 frame
        scroll.bounds.size = inner.size
        scroll.center = CGPoint(x: inner.midX, y: inner.midY)
        fit = FolderFit(metrics: DirMetrics(cell: look.cell), page: inner.size, box: box.size)
        dots.frame = CGRect(x: 0, y: inner.maxY, width: box.width, height: Tok.Shape.folderDotsH)
        let side = DirMetrics(cell: look.cell).side
        // 框縮到方磚大小的時候，這張剛好是原本的大小
        cover.bounds = CGRect(x: 0, y: 0, width: side, height: side)
        cover.center = CGPoint(x: box.midX, y: box.midY)
        cover.transform = CGAffineTransform(scaleX: box.width / side, y: box.height / side)
        stand(at: grow.goal)
    }

    // MARK: 開、收

    /// 打開。rect＝那塊磚的方磚（nil＝不在畫面上，改淡入）
    func open(from rect: CGRect?, calm: Bool, at now: CFTimeInterval) {
        let time = elapsed(now)
        up = true
        isHidden = false
        if let rect, !calm {
            grow = home == nil ? FolderFlight(from: 0, goal: 1) : grow.turned(to: 1, after: time)
            home = home?.moved(to: rect, at: grow.from) ?? FolderHome(rect: rect)
            // 正在淡掉的：一邊淡回來
            let seen = show.value(time)
            show = seen > 0 && seen < 1 ? show.turned(to: 1, after: time, kind: .fade) : .still(1)
        } else {
            grow = home == nil ? .still(1) : grow.turned(to: 1, after: time)
            show = show.turned(to: 1, after: time, kind: .fade)
        }
        fly(now)
    }

    /// 收起。rect＝縮回哪塊磚（nil＝不在畫面上，改淡出；已經在走的照樣走）
    func close(to rect: CGRect?, calm: Bool, at now: CFTimeInterval) {
        let time = elapsed(now)
        up = false
        if field.isFirstResponder {
            field.resignFirstResponder()
        }
        if let rect, !calm {
            grow = grow.turned(to: 0, after: time)
            home = home?.moved(to: rect, at: grow.from) ?? FolderHome(rect: rect)
            show = show.value(time) < 1 ? show.turned(to: 1, after: time, kind: .fade) : .still(1)
        } else {
            grow = grow.turned(to: grow.goal, after: time)
            show = show.turned(to: 0, after: time, kind: .fade)
        }
        fly(now)
    }

    /// 正在縮回去的：那塊磚換了位置就改去新的地方，不在畫面上了就淡掉。回傳還有沒有要縮回哪塊磚
    func rehome(_ rect: CGRect?, at now: CFTimeInterval) -> Bool {
        guard !up, moving, show.goal == 1 else { return false }
        if rect != home?.rect {
            close(to: rect, calm: false, at: now)
        }
        return rect != nil
    }

    /// 直接開著、直接收掉（面板自己在動的時候，不用放大）
    func snap(up next: Bool) {
        up = next
        moving = false
        grow = .still(next ? 1 : 0)
        show = .still(next ? 1 : 0)
        home = nil
        calmDown()
        stand(at: grow.goal)
        isHidden = !next
        if !next, field.isFirstResponder {
            field.resignFirstResponder()
        }
    }

    /// 走完了沒
    func done(_ now: CFTimeInterval) -> Bool {
        elapsed(now) >= max(grow.span, show.span)
    }

    /// 走完的收尾。hold＝拖曳的手勢還掛在框裡的捲動區上：只看不見，先不拿掉
    func rest(hold: Bool) {
        moving = false
        if up {
            snap(up: true)
        } else if hold {
            alpha = 0
        } else {
            snap(up: false)
        }
    }

    /// 打開後直接改名
    func rename(after seconds: Double) {
        naming = true
        let mine = id
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            guard let self, up, id == mine else { return }
            field.becomeFirstResponder()
        }
    }

    // MARK: 動畫

    /// 這一趟走了多久。系統動畫真正開始是畫面送出去那一刻，比叫它的時候晚幾毫秒：照它算，中途反悔才不會跳
    func elapsed(_ now: CFTimeInterval) -> Double {
        let began = [holder.layer, layer].compactMap { $0.animation(forKey: FolderCard.key)?.beginTime }.first { $0 > 0 }
        return max(0, now - (began ?? added))
    }

    /// 停在某個進度的樣子（系統動畫蓋在這上面跑）
    private func stand(at progress: CGFloat) {
        guard let place else { return }
        let spot = home == nil ? 1 : progress
        let pose = FolderPose(home: home?.rect(at: spot) ?? place.box, box: place.box, at: spot)
        holder.center = pose.center
        holder.layer.transform = pose.transform
        shade.alpha = FolderPose.shade(spot)
        clip.layer.cornerRadius = pose.radius
        cover.alpha = FolderPose.cover(spot)
        scroll.layer.transform = inside(spot)
        for name in [field.layer] + grid.names {
            name.opacity = Float(FolderPose.late(spot))
        }
        alpha = show.goal
    }

    /// 框裡的磚對準磚上的小方塊多少（翻到第二頁的對不上，照原樣縮）
    private func inside(_ progress: CGFloat) -> CATransform3D {
        guard page == 0, let fit else { return CATransform3DIdentity }
        return fit.transform(FolderPose.cover(progress))
    }

    private func calmDown() {
        for layer in [layer, holder.layer, shade.layer, clip.layer, cover.layer, scroll.layer, field.layer] + grid.names {
            layer.removeAnimation(forKey: FolderCard.key)
        }
    }

    private func fly(_ now: CFTimeInterval) {
        added = now
        moving = true
        calmDown()
        stand(at: grow.goal)
        guard let place else { return }
        if !show.isStill {
            run(layer, ["opacity": show.frames])
        }
        guard !grow.isStill, let home else { return }
        let steps = grow.frames
        let poses = steps.map { FolderPose(home: home.rect(at: $0), box: place.box, at: $0) }
        run(holder.layer, [
            "position": poses.map { NSValue(cgPoint: $0.center) },
            "transform": poses.map { NSValue(caTransform3D: $0.transform) },
        ])
        run(shade.layer, ["opacity": steps.map { FolderPose.shade($0) }])
        run(clip.layer, ["cornerRadius": poses.map(\.radius)])
        run(cover.layer, ["opacity": steps.map { FolderPose.cover($0) }])
        run(scroll.layer, ["transform": steps.map { NSValue(caTransform3D: inside($0)) }])
        let late = steps.map { FolderPose.late($0) }
        for name in [field.layer] + grid.names {
            run(name, ["opacity": late])
        }
    }

    private func run(_ layer: CALayer, _ tracks: [String: [Any]]) {
        let group = CAAnimationGroup()
        group.preferredFrameRateRange = Tok.Motion.folderRate
        group.animations = tracks.map { path, values in
            let part = CAKeyframeAnimation(keyPath: path)
            part.values = values
            part.duration = Double(values.count - 1) * Tok.Motion.folderStep
            group.duration = part.duration
            return part
        }
        layer.add(group, forKey: FolderCard.key)
    }
}

extension FolderCard: UITextFieldDelegate {
    @objc private func typed() {
        guard let folder, let text = field.text else { return }
        model?.renameFolder(folder.id, text)
    }

    func textFieldShouldReturn(_ field: UITextField) -> Bool {
        field.resignFirstResponder()
        return true
    }

    /// 剛開的資料夾：名字整個選起來，直接打就換掉
    func textFieldDidBeginEditing(_ field: UITextField) {
        guard naming, field.text == folder?.name else { return }
        DispatchQueue.main.async { field.selectAll(nil) }
    }

    /// 打一個字存一次；清空不存，離開時變回原名
    func textFieldDidEndEditing(_ field: UITextField) {
        naming = false
        if Labels.trim(field.text ?? "").isEmpty {
            field.text = folder?.name
        }
    }
}

/// 框的影子：只畫在框外面（框是透的，畫在裡面會讓框變暗）
final class FolderShade: UIView {
    private let hole = CAShapeLayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        layer.shadowColor = UIColor(Tok.Col.shadow).cgColor
        layer.shadowOpacity = Float(Tok.Shape.shadowSoft)
        layer.shadowRadius = Tok.Shape.shadowRadius
        layer.shadowOffset = CGSize(width: 0, height: Tok.Shape.shadowY)
        hole.fillRule = .evenOdd
        layer.mask = hole
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let box = UIBezierPath(roundedRect: bounds, cornerRadius: Tok.Shape.radiusLg)
        layer.shadowPath = box.cgPath
        let reach = Tok.Shape.shadowRadius * 3 + Tok.Shape.shadowY
        let ring = UIBezierPath(rect: bounds.insetBy(dx: -reach, dy: -reach))
        ring.append(box)
        hole.path = ring.cgPath
    }
}

/// 頁點：幾頁幾個，亮的是現在這頁；只有一頁不印
final class FolderDots: UIView {
    private var marks: [UIView] = []

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        isAccessibilityElement = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    func show(_ count: Int, now page: Int) {
        isHidden = count < 2
        while marks.count < count {
            let mark = UIView()
            mark.backgroundColor = UIColor(Tok.Col.textSecondary)
            mark.layer.cornerRadius = Tok.Shape.pageDot / 2
            addSubview(mark)
            marks.append(mark)
            setNeedsLayout()
        }
        while marks.count > count {
            marks.removeLast().removeFromSuperview()
            setNeedsLayout()
        }
        for (index, mark) in marks.enumerated() {
            mark.alpha = index == page ? 1 : Tok.Shape.handleOff
        }
        accessibilityLabel = Words.pageVoice(page + 1, count)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let size = Tok.Shape.pageDot, step = size + Tok.Space.sm
        var left = (bounds.width - CGFloat(marks.count) * step + Tok.Space.sm) / 2
        for mark in marks {
            mark.frame = CGRect(x: left, y: (bounds.height - size) / 2, width: size, height: size)
            left += step
        }
    }
}

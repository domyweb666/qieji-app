import UIKit

// 資料夾開關的純計算：進度怎麼走、框在每個進度長什麼樣、打開的框放哪。
// 這個檔不碰畫面，測試在 QiejiTests/FolderTests.swift。

/// 一段進度（0＝收著、1＝全開）。哪個時間走到哪、多快都算得出來，中途反悔就從那裡、帶著那個速度改去另一頭
struct FolderFlight: Equatable {
    enum Kind {
        case spring, fade
    }

    let from: CGFloat
    let goal: CGFloat
    let speed: CGFloat // 起步的速度（每秒走多少進度）
    let kind: Kind
    /// 走多久。做出來就算好一次（以前每問一次從頭算，開關資料夾一次要算上百次）
    let span: Double

    init(from: CGFloat, goal: CGFloat, speed: CGFloat = 0, kind: Kind = .spring) {
        self.from = from
        self.goal = goal
        self.speed = speed
        self.kind = kind
        span = FolderFlight.span(from: from, goal: goal, speed: speed, kind: kind)
    }

    /// 停著不動
    static func still(_ at: CGFloat) -> FolderFlight {
        FolderFlight(from: at, goal: at)
    }

    var isStill: Bool {
        from == goal && speed == 0
    }

    /// 走了 time 秒之後在哪
    func value(_ time: Double) -> CGFloat {
        if time <= 0 {
            return from
        }
        if time >= span {
            return goal
        }
        switch kind {
        case .spring:
            return goal + (gap + push * CGFloat(time)) * exp(-FolderFlight.rate * CGFloat(time))
        case .fade:
            let part = CGFloat(time / span)
            return from + (goal - from) * part * part * (3 - 2 * part)
        }
    }

    /// 走了 time 秒那一刻多快（淡的不帶速度）
    func pace(_ time: Double) -> CGFloat {
        guard kind == .spring, time < span else { return 0 }
        guard time > 0 else { return speed }
        return (speed - FolderFlight.rate * push * CGFloat(time)) * exp(-FolderFlight.rate * CGFloat(time))
    }

    /// 走多久：離終點和速度都夠小的那一刻
    private static func span(from: CGFloat, goal: CGFloat, speed: CGFloat, kind: Kind) -> Double {
        if from == goal, speed == 0 {
            return 0
        }
        if kind == .fade {
            return Tok.Motion.folderFadeSeconds
        }
        let gap = from - goal, push = speed + rate * gap, near = Tok.Motion.folderNear
        var time: Double = 0
        while time < Tok.Motion.folderMost {
            let left = (gap + push * CGFloat(time)) * exp(-FolderFlight.rate * CGFloat(time))
            let pace = (speed - FolderFlight.rate * push * CGFloat(time)) * exp(-FolderFlight.rate * CGFloat(time))
            if abs(left) <= near, abs(pace) <= near * Tok.Motion.folderCalm {
                return time
            }
            time += Tok.Motion.folderStep
        }
        return Tok.Motion.folderMost
    }

    /// 走了 time 秒的時候改去 goal：從現在的地方、帶著現在的速度
    func turned(to goal: CGFloat, after time: Double, kind: Kind = .spring) -> FolderFlight {
        FolderFlight(from: value(time), goal: goal, speed: kind == .spring ? pace(time) : 0, kind: kind)
    }

    /// 每一格走到哪（系統動畫照這個跑）
    var frames: [CGFloat] {
        let count = max(1, Int((span / Tok.Motion.folderStep).rounded(.up)))
        return (0 ... count).map { value(Double($0) * Tok.Motion.folderStep) }
    }

    /// 不過頭的彈簧：多快、離終點多遠、往終點的推力
    private static let rate = 2 * CGFloat.pi / CGFloat(Tok.Motion.folderResponse)

    private var gap: CGFloat {
        from - goal
    }

    private var push: CGFloat {
        speed + FolderFlight.rate * gap
    }
}

/// 框在某個進度長什麼樣。home＝那塊磚的方磚、box＝定位
struct FolderPose: Equatable {
    let center: CGPoint
    let scale: CGSize
    /// 框自己座標裡的圓角（畫面上＝這個乘 scale）
    let radius: CGFloat

    init(home: CGRect, box: CGRect, at progress: CGFloat) {
        let tiny = CGSize(width: home.width / max(1, box.width), height: home.height / max(1, box.height))
        center = CGPoint(
            x: FolderPose.mix(home.midX, box.midX, progress), y: FolderPose.mix(home.midY, box.midY, progress)
        )
        scale = CGSize(width: FolderPose.mix(tiny.width, 1, progress), height: FolderPose.mix(tiny.height, 1, progress))
        let tile = home.width * Tok.Shape.tileRadiusRatio / max(tiny.width, .ulpOfOne)
        radius = max(0, FolderPose.mix(tile, Tok.Shape.radiusLg, progress))
    }

    var transform: CATransform3D {
        CATransform3DMakeScale(scale.width, scale.height, 1)
    }

    static func mix(_ from: CGFloat, _ goal: CGFloat, _ at: CGFloat) -> CGFloat {
        from + (goal - from) * at
    }

    static func mix(_ from: CGRect, _ goal: CGRect, _ at: CGFloat) -> CGRect {
        CGRect(
            x: mix(from.minX, goal.minX, at), y: mix(from.minY, goal.minY, at),
            width: mix(from.width, goal.width, at), height: mix(from.height, goal.height, at)
        )
    }

    /// 名字、大標題：走過 folderLate 才開始出現
    static func late(_ progress: CGFloat) -> CGFloat {
        min(1, max(0, (progress - Tok.Motion.folderLate) / (1 - Tok.Motion.folderLate)))
    }

    /// 影子、霧：跟著進度
    static func shade(_ progress: CGFloat) -> Double {
        Double(min(1, max(0, progress)))
    }

    /// 磚原本的樣子：貼在框上，剛開始放大就淡掉（收完那一格跟那塊磚一模一樣）
    static func cover(_ progress: CGFloat) -> CGFloat {
        min(1, max(0, 1 - progress / Tok.Motion.folderLate))
    }
}

/// 框縮到磚那麼大的時候，裡面的磚對準磚上的小方塊（正中對正中）：兩份樣子交替淡的那一小段才不會看到雙影
struct FolderFit: Equatable {
    let scale: CGSize
    let shift: CGPoint

    /// page＝框裡放磚的那塊、box＝整個框
    init(metrics: DirMetrics, page: CGSize, box: CGSize) {
        let side = metrics.side, mini = TileSquare.miniSide(side)
        let step = mini + Tok.Shape.folderMiniGap, head = Tok.Shape.folderMiniPad + mini / 2
        func fit(_ first: CGFloat, _ pitch: CGFloat, _ length: CGFloat, _ middle: CGFloat) -> (scale: CGFloat, shift: CGFloat) {
            let big = length / side // 框比方磚大幾倍
            let scale = step * big / pitch
            return (scale, head * big - middle - scale * (first - middle))
        }
        let across = fit(Tok.Space.lg + metrics.cell / 2, metrics.cell, box.width, page.width / 2)
        let down = fit(Tok.Space.lg + side / 2, metrics.pitch, box.height, page.height / 2)
        scale = CGSize(width: across.scale, height: down.scale)
        shift = CGPoint(x: across.shift, y: down.shift)
    }

    /// part：0＝照定位排、1＝對準小方塊
    func transform(_ part: CGFloat) -> CATransform3D {
        var out = CATransform3DMakeTranslation(shift.x * part, shift.y * part, 0)
        out = CATransform3DScale(out, 1 + (scale.width - 1) * part, 1 + (scale.height - 1) * part, 1)
        return out
    }
}

/// 收去哪。轉向的途中那塊磚換了位置：慢慢改去新的地方，不跳
struct FolderHome: Equatable {
    var rect: CGRect
    /// 之前的位置，和換的那一刻進度走到哪
    var old: CGRect?
    var since: CGFloat = 1

    func rect(at progress: CGFloat) -> CGRect {
        guard let old, since > 0 else { return rect }
        return FolderPose.mix(rect, old, min(1, max(0, progress / since)))
    }

    func moved(to next: CGRect, at progress: CGFloat) -> FolderHome {
        next == rect ? self : FolderHome(rect: next, old: rect(at: progress), since: progress)
    }
}

/// 打開的資料夾放哪：名字靠左在框上面，兩個一起在畫面正中。手指算落點也用這個（放大途中不變）
struct FolderPlace: Equatable {
    let name: CGRect
    let box: CGRect
    /// 框裡放磚的那塊（不含頁點）
    let page: CGSize

    init(screen: CGSize, metrics: DirMetrics, width: CGFloat, pages: Int, line: CGFloat) {
        page = CGSize(width: width, height: metrics.height(rows: Tok.Shape.folderRows) + Tok.Space.lg * 2)
        let high = page.height + (pages > 1 ? Tok.Shape.folderDotsH + Tok.Space.sm : Tok.Space.zero)
        let title = line + Tok.Space.md * 2
        let left = (screen.width - width) / 2, scale = max(1, UIScreen.main.scale)
        // 對齊像素：邊才不會糊
        let top = ((screen.height - title - high) / 2 * scale).rounded() / scale
        let ceiling = ((top + title) * scale).rounded() / scale
        // 名字跟框裡第一欄方磚的左邊對齊
        let lead = Tok.Space.lg + (metrics.cell - metrics.side) / 2
        name = CGRect(x: left + lead, y: top, width: max(0, width - lead), height: title)
        box = CGRect(x: left, y: ceiling, width: width, height: high)
    }

    static var font: UIFont {
        Tok.Font.styleUI(.title1, weight: .bold)
    }

    /// 名字那一行多高（系統輸入框的字上下各多 1 點）
    static var line: CGFloat {
        font.lineHeight + Tok.Shape.folderNamePad * 2
    }
}

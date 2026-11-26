import SwiftUI
import UIKit

/// 清單交給紙：按住了哪一行、浮起的那一份、畫面的上下界
struct RowGrab {
    let id: String
    /// 那一行的頂端在螢幕上的高度（視窗座標）
    let top: CGFloat
    let lift: RowLiftView
    let place: RowMenuPlace
    /// 從哪個高度放大：看得到的那段的正中。比畫面還高的一行照整行的正中放大，上緣會跑掉十幾點
    let pivot: CGFloat
}

/// 選單卡放哪（視窗座標）：行的下面放得下就放下面、隔 8 點；放不下放上面；上下都放不下就夾在安全區裡
struct RowMenuPlace: Equatable {
    /// 浮起的那一份在螢幕上的位置
    let row: CGRect
    /// 安全區的上緣、下緣
    let top: CGFloat
    let bottom: CGFloat

    /// card＝卡片實際多高。below＝從上緣那一角放大（接在行的下面）
    func spot(_ card: CGFloat) -> (top: CGFloat, below: Bool) {
        let gap = Tok.Space.sm
        let under = row.maxY + gap, floor = bottom - gap - card
        if under <= floor {
            return (under, true)
        }
        let over = row.minY - gap - card
        if over >= top {
            return (over, false)
        }
        return (max(top, floor), true)
    }
}

/// 浮起的那一份怎麼收
enum RowExit: Equatable {
    /// 縮回原位；那一行這時離原本的地方多遠
    case home(CGFloat)
    /// 留在原地淡掉
    case fade

    /// 那一行現在的頂端在哪（nil＝不在了、沒掛著）
    static func back(from old: CGFloat, to now: CGFloat?) -> RowExit {
        guard let now, abs(now - old) <= Tok.Motion.rowHomeMax else { return .fade }
        return .home(now - old)
    }
}

/// 按住一行浮起來的那一份：字和把手是那一行的快照（不重新排字），左右各裁 8 點、圓角、紙的底色、有影子。
/// 只拍字和把手那兩塊，所以不會帶到按住變暗、左右滑、打字中的底色
final class RowLiftView: UIView {
    private let sheet = UIView()
    private let shade = UIView()
    private let cut: CGFloat
    private var shots: [UIView] = []
    private var runner: UIViewPropertyAnimator?

    /// cut＝那一行上面被清單頂端擋住多少（只浮起看得到的那段）；fresh＝畫面上的樣子還是舊的（游標還在、劃掉的線還沒畫），照排好的字畫一份
    /// grain＝紙張材質（純色＝nil），鋪在底色上，不用跟整張紙對齊
    init?(_ row: LineRowView, paper: UIColor, grain: PaperGrain.Paint? = nil, cut: CGFloat, fresh: Bool) {
        self.cut = cut
        let inset = Tok.Shape.rowLiftInset
        // 不含最下面那條格線：縮回去時格線一直看得到
        let size = CGSize(width: row.bounds.width - inset * 2, height: row.bounds.height - Tok.Shape.borderCard - cut)
        guard size.width > 0, size.height > 0 else { return nil }
        super.init(frame: CGRect(origin: .zero, size: size))
        isUserInteractionEnabled = false
        sheet.frame = bounds
        sheet.backgroundColor = paper
        sheet.clipsToBounds = true
        sheet.layer.cornerRadius = Tok.Shape.radiusMd
        sheet.layer.cornerCurve = .continuous
        addSubview(sheet)
        let skin = GrainSkin(frame: bounds)
        skin.use(grain)
        sheet.addSubview(skin)
        // 按住變暗的那層接著退掉，不會一格就從暗跳回紙的底色
        shade.frame = bounds
        shade.backgroundColor = UIColor(Tok.Col.pressedFill)
        shade.alpha = row.seenShade
        sheet.addSubview(shade)
        layer.shadowColor = UIColor(Tok.Col.shadow).cgColor
        layer.shadowRadius = Tok.Shape.shadowRadius
        layer.shadowOffset = CGSize(width: 0, height: Tok.Shape.shadowY)
        layer.shadowPath = UIBezierPath(roundedRect: bounds, cornerRadius: Tok.Shape.radiusMd).cgPath
        shoot(row, fresh: fresh)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    /// 字變了（劃掉、恢復）：換成新的樣子再收
    func reshoot(_ row: LineRowView) {
        shoot(row, fresh: true)
    }

    private func shoot(_ row: LineRowView, fresh: Bool) {
        for shot in shots {
            shot.removeFromSuperview()
        }
        // 拍不到（還沒真的上畫面）就自己畫，不會因為這樣按住沒反應
        let words = fresh ? nil : row.field.snapshotView(afterScreenUpdates: false)
        let grip = row.grip.snapshotView(afterScreenUpdates: false)
        shots = [(words ?? row.field.drawn, row.field), (grip ?? GripDotsView(frame: row.grip.bounds), row.grip)].map { shot, part in
            shot.frame = part.frame.offsetBy(dx: -Tok.Shape.rowLiftInset, dy: -cut)
            sheet.addSubview(shot)
            return shot
        }
    }

    /// 浮起：微微放大、影子出來（跟目錄的磚同一個彈簧）。減少動態只淡入
    func rise(calm: Bool) {
        let soft = Float(Tok.Shape.shadowSoft)
        guard !calm else {
            layer.shadowOpacity = soft
            alpha = 0
            UIView.animate(withDuration: Tok.Motion.fadeSeconds) {
                self.alpha = 1
                self.shade.alpha = 0
            }
            return
        }
        let next = UIViewPropertyAnimator(
            duration: .zero, timingParameters: Tok.Motion.spring(Tok.Motion.dragLiftSeconds, velocity: 0)
        )
        next.addAnimations {
            let scale = Tok.Motion.rowLiftScale
            self.transform = CGAffineTransform(scaleX: scale, y: scale)
            self.layer.shadowOpacity = soft
            self.shade.alpha = 0
        }
        runner = next
        next.startAnimation()
    }

    /// 收：縮回那一行現在的位置，或留在原地淡掉
    func leave(_ exit: RowExit, calm: Bool) {
        runner?.stopAnimation(true)
        runner = nil
        UIView.animate(
            withDuration: Tok.Motion.menuOutSeconds, delay: 0, options: [.curveEaseIn, .beginFromCurrentState]
        ) {
            self.shade.alpha = 0
            if case let .home(shift) = exit, !calm {
                self.transform = CGAffineTransform(translationX: 0, y: shift)
                self.layer.shadowOpacity = 0
            } else {
                self.alpha = 0
            }
        } completion: { _ in self.isHidden = true }
    }
}

/// 鋪滿畫面的一層，把浮起的那一份擺在那一行原本的地方。位置照視窗算：鍵盤收起、畫面重排都不會動
final class RowLiftStage: UIView {
    private let lift: RowLiftView
    private let hub: CGPoint
    private let calm: Bool
    private var exit: RowExit?

    init(_ grab: RowGrab, calm: Bool) {
        let spot = grab.place.row
        lift = grab.lift
        hub = CGPoint(x: spot.midX, y: grab.pivot)
        self.calm = calm
        super.init(frame: .zero)
        lift.layer.anchorPoint.y = (grab.pivot - spot.minY) / spot.height
        isUserInteractionEnabled = false
        accessibilityElementsHidden = true
        addSubview(lift)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil, exit == nil else { return }
        UIView.lively { lift.rise(calm: calm) }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard window != nil else { return }
        UIView.performWithoutAnimation {
            lift.center = convert(hub, from: nil)
        }
    }

    func leave(_ next: RowExit?) {
        guard let next, exit == nil else { return }
        exit = next
        UIView.lively { lift.leave(next, calm: calm) }
    }
}

struct RowLiftHost: UIViewRepresentable {
    let ask: RowMenuAsk
    let calm: Bool

    func makeUIView(context _: Context) -> RowLiftStage {
        RowLiftStage(ask.grab, calm: calm)
    }

    func updateUIView(_ stage: RowLiftStage, context _: Context) {
        stage.leave(ask.exit)
    }
}

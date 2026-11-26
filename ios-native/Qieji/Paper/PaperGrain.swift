import SwiftUI
import UIKit

/// 紙張材質畫成可以重複鋪的底色（設定「紙張材質」，2026-11-26）。每種材質、淺深色各畫一次（用到才畫），之後全部共用同一份：
/// 紙底、每一行、標題列、浮起的那行都拿這份，不各自解碼圖片；鋪的時候是系統在重複貼，捲動不重畫
enum PaperGrain {
    /// 一種材質：跟著深淺色換的底色（重複的貼圖）、貼圖一格多高
    struct Paint {
        let color: UIColor
        let tile: CGFloat
    }

    private static var paints: [String: Paint] = [:]
    private static var patterns: [String: UIColor] = [:]

    /// 純色（沒有這種材質）＝nil
    static func paint(_ key: String) -> Paint? {
        if let hit = paints[key] {
            return hit
        }
        guard let recipe = Tok.Texture.recipes[key] else { return nil }
        let made = Paint(color: UIColor { trait in pattern(key, recipe, dark: trait.userInterfaceStyle == .dark) }, tile: recipe.tile)
        paints[key] = made
        return made
    }

    private static func pattern(_ key: String, _ recipe: Tok.Texture.Recipe, dark: Bool) -> UIColor {
        let id = dark ? key + ".dark" : key
        if let hit = patterns[id] {
            return hit
        }
        let made = PerfMeter.time("grain") { draw(recipe, dark: dark) }.map { UIColor(patternImage: $0) } ?? .clear
        patterns[id] = made
        return made
    }

    /// 每一層：遮罩的形狀塗上那一層的墨色（含不透明度），疊成一格
    private static func draw(_ recipe: Tok.Texture.Recipe, dark: Bool) -> UIImage? {
        let masks = recipe.coats.compactMap { coat in UIImage(named: coat.mask).map { (coat, $0) } }
        guard masks.count == recipe.coats.count else {
            assertionFailure("紙張材質少了貼圖：\(recipe.coats.map(\.mask))")
            return nil
        }
        let format = UIGraphicsImageRendererFormat()
        format.scale = Tok.Texture.scale
        format.opaque = false
        format.preferredRange = .standard
        let rect = CGRect(x: 0, y: 0, width: recipe.tile, height: recipe.tile)
        return UIGraphicsImageRenderer(size: rect.size, format: format).image { context in
            for (coat, mask) in masks {
                let alpha = dark ? coat.darkAlpha : coat.lightAlpha
                guard alpha > 0 else { continue }
                context.cgContext.beginTransparencyLayer(auxiliaryInfo: nil)
                mask.draw(in: rect)
                Tok.uiColor(dark ? coat.dark : coat.light, alpha).setFill()
                context.fill(rect, blendMode: .sourceIn)
                context.cgContext.endTransparencyLayer()
            }
        }
    }
}

/// 鋪材質的一塊（行的卡片裡、清單底下、紙底）：裡面一張重複鋪的貼圖，起點對齊整張紙的座標，行跟行之間接得起來。
/// 位置變了只挪裡面那張（不重畫）；純色就整塊藏起來
final class GrainSkin: UIView {
    private let tile = UIView()
    private var top: CGFloat = 0
    private(set) var paint: PaperGrain.Paint?

    override init(frame: CGRect) {
        super.init(frame: frame)
        clipsToBounds = true
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        backgroundColor = .clear
        isHidden = true
        tile.isUserInteractionEnabled = false
        addSubview(tile)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    func use(_ next: PaperGrain.Paint?) {
        guard next?.color !== paint?.color else { return }
        paint = next
        tile.backgroundColor = next?.color
        isHidden = next == nil
        layoutTile()
    }

    /// 這一塊的頂端在整張紙（捲動內容）的哪裡
    func place(top next: CGFloat) {
        guard next != top else { return }
        top = next
        layoutTile()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        layoutTile()
    }

    /// 貼圖的起點放在整張紙一格一格的格線上（這一塊的頂端往上退到上一條格線）
    private func layoutTile() {
        guard let paint else { return }
        let phase = top - (top / paint.tile).rounded(.down) * paint.tile
        let next = CGRect(x: 0, y: -phase, width: bounds.width, height: bounds.height + paint.tile)
        guard tile.frame != next else { return }
        UIView.performWithoutAnimation { tile.frame = next }
    }
}

/// 紙底、標題列底的材質（SwiftUI 那邊用）：從螢幕最頂鋪下來，兩塊的起點一樣，疊在一起看不出兩份
struct PaperGrainView: UIViewRepresentable {
    let paint: PaperGrain.Paint

    func makeUIView(context _: Context) -> GrainSkin {
        let view = GrainSkin(frame: .zero)
        view.use(paint)
        return view
    }

    func updateUIView(_ view: GrainSkin, context _: Context) {
        view.use(paint)
    }
}

extension LineListView {
    /// 清單底下那一塊材質（行之間、最後一行下面、往下拉露出來的地方）：跟著捲，只蓋看得到的那段、上下多一格，跨過一格才挪一次。
    /// 有封面那一塊的話從它下面開始（那一段是紙底的材質，封面圖上不鋪）
    func placeGrain() {
        if subviews.first !== grainBox {
            sendSubviewToBack(grainBox) // 最前面那塊、空白說明後來插進來會排到它下面
        }
        grainBox.use(look.grain)
        guard let tile = look.grain?.tile, bounds.height > 0 else { return }
        let low = (contentOffset.y / tile).rounded(.down) * tile - tile
        let top = hasHead ? max(headHeight, low) : low
        let next = CGRect(x: 0, y: top, width: bounds.width, height: max(0, low + bounds.height + tile * 3 - top))
        if grainBox.frame != next {
            UIView.performWithoutAnimation { grainBox.frame = next }
        }
        grainBox.place(top: top)
    }
}

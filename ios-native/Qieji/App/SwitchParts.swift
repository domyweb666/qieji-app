import SwiftUI
import UIKit

// 切換清單的零件：捲動區、面板的底、一列（面板本身在 SwitchPanel）

/// 列上開始捲：按著的那一列放掉
final class SwitchScroll: UIScrollView {
    override func touchesShouldCancel(in _: UIView) -> Bool {
        true
    }
}

/// 面板的底：iOS 26 液態玻璃、以下系統霧面、減少透明度用實的（跟 Frost 同一套）
final class SwitchGlass: UIView {
    private let effect = UIVisualEffectView(effect: nil)
    private var solid = false
    private var styled = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        addSubview(effect)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        refresh()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        effect.frame = bounds
        refresh()
    }

    private func refresh() {
        let want = UIAccessibility.isReduceTransparencyEnabled
        guard !styled || solid != want else { return }
        styled = true
        solid = want
        let radius = Tok.Shape.radiusLg
        effect.isHidden = want
        backgroundColor = want ? UIColor(Tok.Col.surface) : .clear
        layer.cornerRadius = want ? radius : 0
        layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
        layer.shadowColor = UIColor(Tok.Col.shadow).cgColor
        layer.shadowOpacity = want ? Float(Tok.Shape.shadowSoft) : 0
        layer.shadowRadius = Tok.Shape.shadowRadius
        layer.shadowOffset = CGSize(width: 0, height: Tok.Shape.shadowY)
        guard !want else { return }
        if #available(iOS 26.0, *) {
            effect.effect = UIGlassEffect(style: .regular)
            effect.cornerConfiguration = .corners(
                topLeftRadius: .fixed(radius), topRightRadius: .fixed(radius), bottomLeftRadius: .fixed(0), bottomRightRadius: .fixed(0)
            )
        } else {
            effect.effect = UIBlurEffect(style: .systemThickMaterial)
            effect.layer.cornerRadius = radius
            effect.layer.cornerCurve = .continuous
            effect.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
            effect.clipsToBounds = true
        }
    }
}

/// 一列：左邊小方磚（或圖示）、名字，右邊打勾（或箭頭）。按住底色變深
final class SwitchRow: UIControl {
    var run: () -> Void = {}
    private let icon = UIImageView()
    private let label = UILabel()
    private let trail = UIImageView()
    private let tile = TileSquare(frame: CGRect(x: 0, y: 0, width: Tok.Shape.noteIcon, height: Tok.Shape.noteIcon))
    private var isNote = false
    private var drawn = "" // 圖示現在畫的是哪一種：同一種就不用重做

    override init(frame: CGRect) {
        super.init(frame: frame)
        for part in [icon, trail] {
            part.contentMode = .center
        }
        for part in [icon, tile, label, trail] as [UIView] {
            part.isUserInteractionEnabled = false
            addSubview(part)
        }
        addTarget(self, action: #selector(onTap), for: .touchUpInside)
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    var wantedHeight: CGFloat {
        max(Tok.Shape.menuRow, label.font.lineHeight.rounded(.up))
    }

    var current = false {
        didSet {
            trail.isHidden = isNote && !current
            accessibilityTraits = current ? [.button, .selected] : .button
        }
    }

    override var isHighlighted: Bool {
        didSet {
            backgroundColor = isHighlighted ? UIColor(Tok.Col.menuSep) : .clear
        }
    }

    func showNote(_ note: Note, current: Bool) {
        isNote = true
        icon.isHidden = true
        tile.isHidden = false
        tile.face = TileFace(small: note)
        words(Labels.label(note), Labels.trim(note.title).isEmpty ? Tok.Col.textSecondary : Tok.Col.textPrimary)
        mark("checkmark", Tok.Font.styleUI(.headline), Tok.Col.accent)
        self.current = current
        setNeedsLayout()
    }

    /// 新的一張、新的記事本、管理所有清單：同一種樣子（茄紫每個畫面只出現一次，這個面板的勾已經用了）
    func showAction(_ title: String, _ symbol: String, more: Bool) {
        isNote = false
        icon.isHidden = false
        tile.isHidden = true
        icon.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(font: Tok.Font.barIconUI))
        icon.tintColor = UIColor(Tok.Col.textPrimary)
        words(title, Tok.Col.textPrimary)
        if more {
            mark("chevron.right", Tok.Font.chevronUI, Tok.Col.textSecondary)
        }
        current = false
        trail.isHidden = !more
        setNeedsLayout()
    }

    private func words(_ text: String, _ color: Color) {
        label.font = Tok.Font.styleUI(.body) // 每次開都照現在的系統字級
        label.text = text
        label.textColor = UIColor(color)
        accessibilityLabel = text
    }

    private func mark(_ symbol: String, _ font: UIFont, _ color: Color) {
        let key = "\(symbol)\(font.pointSize)"
        guard drawn != key else { return }
        drawn = key
        trail.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(font: font))
        trail.tintColor = UIColor(color)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let side = Tok.Shape.noteIcon, edge = Tok.Space.gutter, middle = bounds.midY
        icon.frame = CGRect(x: edge, y: middle - side / 2, width: side, height: side)
        tile.frame = icon.frame
        let size = trail.image?.size ?? .zero
        trail.frame = CGRect(x: bounds.width - edge - size.width, y: middle - size.height / 2, width: size.width, height: size.height)
        let left = edge + side + Tok.Space.md
        label.frame = CGRect(x: left, y: 0, width: max(0, trail.frame.minX - Tok.Space.sm - left), height: bounds.height)
    }

    @objc private func onTap() {
        run()
    }
}

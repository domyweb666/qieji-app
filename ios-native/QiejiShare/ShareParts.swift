import UIKit

/// 面板上的字（Design/Words.swift 沒有編進擴充）
enum ShareWords {
    static let cancel = "取消"
    static let commit = "記下來"
    static let field = "要記的字"
    static let pickHint = "換一張"
    static let reading = "讀取中…"
    static let nothing = "這裡沒有可以記的字。茄記只收文字和網址。"
    static let cut = "太長了，只拿了前面這些字"
    static let missed = "有一部分沒有讀到，先看一下再記"
    static let failed = "沒記成，字還在這裡，可以先複製"
    static let tooLong = "太長了，最多 \(ShareText.max) 字，刪短一點才能記"

    /// 圖片、影片不收
    static func skipped(image: Bool, movie: Bool) -> String? {
        let what = [image ? "圖片" : nil, movie ? "影片" : nil].compactMap { $0 }
        return what.isEmpty ? nil : what.joined(separator: "和") + "沒有記"
    }

    static func into(_ name: String?) -> String {
        name.map { "放進 \($0)" } ?? "放進茄記"
    }

    static func split(_ count: Int) -> String {
        "拆成 \(count) 行"
    }
}

/// 手指碰到馬上變淡的按鈕
class SharePress: UIButton {
    override var isHighlighted: Bool {
        didSet { fade() }
    }

    override var isEnabled: Bool {
        didSet { fade() }
    }

    private func fade() {
        alpha = isEnabled ? (isHighlighted ? Tok.Motion.pressDim : 1) : Tok.Motion.reducedDimFrom
    }

    /// 只有圖示的（✕、✓）
    func show(symbol: String, weight: UIImage.SymbolWeight, color: UIColor) {
        let size = UIImage.SymbolConfiguration(pointSize: Tok.Font.barCheckSize, weight: weight)
        setImage(UIImage(systemName: symbol, withConfiguration: size), for: .normal)
        tintColor = color
    }
}

/// 「放進 X ▾」：小方磚、名字、箭頭。只有一張可選時沒有箭頭、不能點
final class ShareTargetButton: SharePress {
    private let tile = UIImageView()
    private let name = UILabel()
    private let mark = UIImageView(
        image: UIImage(systemName: "chevron.down", withConfiguration: UIImage.SymbolConfiguration(font: Tok.Font.chevronUI))
    )
    private let line = UIStackView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        showsMenuAsPrimaryAction = true
        preferredMenuElementOrder = .fixed
        name.font = Tok.Font.styleUI(.subheadline)
        name.adjustsFontForContentSizeCategory = true
        name.textColor = UIColor(Tok.Col.textSecondary)
        name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        mark.tintColor = UIColor(Tok.Col.textSecondary)
        for part in [tile, mark] {
            part.setContentHuggingPriority(.required, for: .horizontal)
            part.setContentCompressionResistancePriority(.required, for: .horizontal)
        }
        line.alignment = .center
        line.spacing = Tok.Space.sm
        line.isUserInteractionEnabled = false
        line.translatesAutoresizingMaskIntoConstraints = false
        for part in [tile, name, mark] {
            line.addArrangedSubview(part)
        }
        addSubview(line)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(greaterThanOrEqualToConstant: Tok.Shape.hitMin),
            line.leadingAnchor.constraint(equalTo: leadingAnchor),
            line.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor),
            line.centerYAnchor.constraint(equalTo: centerYAnchor),
            line.topAnchor.constraint(greaterThanOrEqualTo: topAnchor, constant: Tok.Space.xs),
        ])
        isAccessibilityElement = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    /// many＝有別張可以換；big＝字級放到最大那幾級，名字可以換行
    func show(_ target: ShareTarget?, many: Bool, big: Bool, traits: UITraitCollection) {
        tile.image = target.map { ShareTile.image($0, traits) }
        tile.isHidden = target == nil
        name.text = ShareWords.into(target?.title)
        name.numberOfLines = big ? Tok.Shape.shareNameLines : 1
        mark.isHidden = !many
        isUserInteractionEnabled = many
        accessibilityLabel = name.text
        accessibilityTraits = many ? .button : .staticText
        accessibilityHint = many ? ShareWords.pickHint : nil
    }
}

/// 小方磚。樣子照 TileArt.drawPaper；那份要用到紙的內容，編不進擴充
enum ShareTile {
    static func image(_ target: ShareTarget, _ traits: UITraitCollection) -> UIImage {
        let side = Tok.Shape.shareTile, colors = Tok.note(target.color)
        let rect = CGRect(x: 0, y: 0, width: side, height: side)
        let round = side * Tok.Shape.tileRadiusRatio, edge = Tok.Shape.borderCard
        let image = UIGraphicsImageRenderer(bounds: rect, format: UIGraphicsImageRendererFormat(for: traits)).image { context in
            context.cgContext.saveGState()
            UIBezierPath(roundedRect: rect, cornerRadius: round).addClip()
            UIColor(colors.dot).setFill()
            context.fill(rect)
            draw(target.glyph, in: rect, UIColor(colors.ink))
            context.cgContext.restoreGState()
            let frame = UIBezierPath(roundedRect: rect.insetBy(dx: edge / 2, dy: edge / 2), cornerRadius: round - edge / 2)
            frame.lineWidth = edge
            UIColor(colors.rule).resolvedColor(with: traits).setStroke()
            frame.stroke()
        }
        return image.withRenderingMode(.alwaysOriginal)
    }

    private static func draw(_ glyph: String, in rect: CGRect, _ ink: UIColor) {
        guard !glyph.isEmpty else { return }
        func word(_ side: CGFloat) -> NSAttributedString {
            NSAttributedString(string: glyph, attributes: [.font: Tok.Font.glyphUI(side), .foregroundColor: ink])
        }
        var text = word(rect.width)
        let width = text.size().width
        if width > rect.width {
            // 放不下就縮，最多縮一半
            text = word(rect.width * max(Tok.Font.glyphShrink, rect.width / width))
        }
        let box = text.size()
        text.draw(at: CGPoint(x: rect.midX - box.width / 2, y: rect.midY - box.height / 2))
    }
}

import SwiftUI
import UIKit

/// 一張紙上每一行的樣子：顏色、字級。換了就整張重量、重畫
struct LineLook: Equatable {
    let key: String // 紙的顏色代號
    let paper: UIColor
    let rule: UIColor
    var scale: CGFloat // 紙上的字級（完整版）
    var size: CGFloat // 系統字級算出來的內文大小
    let texture: String // 紙張材質（設定，2026-11-26）
    let grain: PaperGrain.Paint? // 純色＝nil

    init(key: String, scale: CGFloat, texture: String = PaperTexture.plain) {
        let colors = Tok.note(key)
        self.key = key
        paper = UIColor(colors.paper)
        rule = UIColor(colors.rule)
        self.scale = scale
        size = Tok.Font.lineUI.pointSize
        self.texture = texture
        grain = PaperGrain.paint(texture)
    }

    /// 顏色物件每次都是新的，比代號就好
    static func == (lhs: LineLook, rhs: LineLook) -> Bool {
        lhs.key == rhs.key && lhs.scale == rhs.scale && lhs.size == rhs.size && lhs.texture == rhs.texture
    }

    var font: UIFont {
        Tok.Font.lineUI.withSize(size * scale)
    }

    /// 行高：內文 17 點、行高 26，跟著字級一起放大
    var lineHeight: CGFloat {
        (size * scale * Tok.Font.lineHeightRatio).rounded()
    }

    /// 一行字的高（上下各留 12）；最少 52
    var rowMin: CGFloat {
        max(Tok.Shape.rowMin, lineHeight + Tok.Space.md * 2)
    }

    /// 字的樣子。劃掉的行加刪除線、變淡
    func attributes(done: Bool) -> [NSAttributedString.Key: Any] {
        let para = NSMutableParagraphStyle()
        para.minimumLineHeight = lineHeight
        para.maximumLineHeight = lineHeight
        var out: [NSAttributedString.Key: Any] = [
            .font: font,
            .paragraphStyle: para,
            .foregroundColor: UIColor(done ? Tok.Col.textStrike : Tok.Col.textPrimary),
        ]
        if done {
            out[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
        }
        return out
    }
}

/// 量一行有多高。跟打字框同一套排版（TextKit 1），量到的就是畫出來的；量過的記著，再打開同一張不用重量
enum LineMeasure {
    private static let cache: NSCache<NSString, NSNumber> = {
        let out = NSCache<NSString, NSNumber>()
        out.countLimit = 4000
        return out
    }()

    private static let storage = NSTextStorage()
    private static let manager = NSLayoutManager()
    private static let container = NSTextContainer(size: .zero)
    private static var wired = false

    /// 字可以用的寬：左 20、離把手 8、把手 44
    static func textWidth(_ width: CGFloat) -> CGFloat {
        max(1, width - Tok.Space.gutter - Tok.Space.sm - Tok.Shape.hitMin)
    }

    /// 一整行的高（含底下 1 點格線）
    static func height(_ text: String, width: CGFloat, look: LineLook) -> CGFloat {
        let room = textWidth(width)
        // 很短、沒換行的一定是一行：大多數的行走這條，不用排版
        if fits(text, room, look) {
            return look.rowMin + Tok.Shape.borderCard
        }
        let key = "\(room)|\(look.size * look.scale)|\(text)" as NSString
        if let hit = cache.object(forKey: key) {
            return CGFloat(hit.doubleValue)
        }
        let tall = max(look.rowMin, CGFloat(lines(text, room, look)) * look.lineHeight + Tok.Space.md * 2) + Tok.Shape.borderCard
        cache.setObject(NSNumber(value: Double(tall)), forKey: key)
        return tall
    }

    /// 還沒量的行先估一個高（捲不到的地方用，捲到之前會量準）
    static func guess(_ text: String, width: CGFloat, look: LineLook) -> CGFloat {
        let room = textWidth(width)
        if fits(text, room, look) {
            return look.rowMin + Tok.Shape.borderCard
        }
        let per = max(1, Int(room / (look.size * look.scale)))
        let count = text.components(separatedBy: "\n").reduce(0) { $0 + max(1, (($1 as NSString).length + per - 1) / per) }
        return max(look.rowMin, CGFloat(count) * look.lineHeight + Tok.Space.md * 2) + Tok.Shape.borderCard
    }

    private static func fits(_ text: String, _ room: CGFloat, _ look: LineLook) -> Bool {
        let count = text.utf16.count
        return CGFloat(count) * look.size * look.scale * 1.1 <= room && !text.contains("\n")
    }

    private static func lines(_ text: String, _ room: CGFloat, _ look: LineLook) -> Int {
        if !wired {
            wired = true
            container.lineFragmentPadding = 0
            manager.addTextContainer(container)
            storage.addLayoutManager(manager)
        }
        container.size = CGSize(width: room, height: .greatestFiniteMagnitude)
        storage.setAttributedString(NSAttributedString(string: text, attributes: look.attributes(done: false)))
        manager.ensureLayout(for: container)
        var count = manager.extraLineFragmentRect.height > 0 ? 1 : 0
        manager.enumerateLineFragments(forGlyphRange: manager.glyphRange(for: container)) { _, _, _, _, _ in count += 1 }
        return max(1, count)
    }
}

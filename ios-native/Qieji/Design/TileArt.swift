import SwiftUI
import UIKit

/// 一塊方磚上有什麼（畫磚只看這個，跟紙的內容無關：一千行的紙也不用拿整張來比）
struct TileFace: Equatable {
    /// 一張紙的樣子：顏色、正中間的字、封面圖的代號（有圖、圖在手機上、沒上鎖才有）
    struct Paper: Equatable {
        var color: String
        var glyph: String
        var photo: String?

        init(_ note: Note) {
            color = note.color
            glyph = Labels.glyph(note)
            photo = Covers.shared.shownCode(note)
        }
    }

    var paper: Paper?
    /// 資料夾：裡面前幾張
    var minis: [Paper]?
    var pinned = false
    var locked = false
    var current = false

    /// 小方磚（切換清單）：只有顏色和字
    init(small note: Note) {
        paper = Paper(note)
    }

    /// 目錄的一格
    init(_ entry: Seats.Entry, current: Bool) {
        self.current = current
        if entry.folder != nil {
            let count = Tok.Shape.folderMinis
            minis = entry.notes.prefix(count * count).map { Paper($0) }
        } else if let note = entry.note {
            paper = Paper(note)
            pinned = note.pinned
            locked = note.locked
        }
    }
}

/// 一塊方磚，一次畫在同一層。以前每塊磚是十幾個 SwiftUI 的小塊，目錄一打開要做幾百個，主執行緒卡一下（2026-11-23）
final class TileSquare: UIView {
    var face: TileFace? {
        didSet {
            if face != oldValue {
                setNeedsDisplay()
            }
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isOpaque = false
        backgroundColor = .clear
        contentMode = .redraw
        isUserInteractionEnabled = false
        isAccessibilityElement = false
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        setNeedsDisplay()
    }

    override func draw(_: CGRect) {
        guard let face else { return }
        if let minis = face.minis {
            drawFolder(minis, current: face.current)
        } else if let paper = face.paper {
            drawPaper(face, paper)
        }
    }

    private func drawPaper(_ face: TileFace, _ paper: TileFace.Paper) {
        let colors = Tok.note(paper.color), side = bounds.width
        TileSquare.drawInside(paper, in: bounds, fontSide: side)
        let ink = UIColor(colors.ink), pad = Tok.Space.xs
        if face.pinned, let pin = TileSquare.symbol("pin.fill", ink) {
            pin.draw(at: CGPoint(x: side - pad - pin.size.width, y: pad))
        }
        if face.locked, let lock = TileSquare.symbol("lock.fill", ink) {
            lock.draw(at: CGPoint(x: pad, y: pad))
        }
        let edge = face.current ? Tok.Shape.borderSelected : Tok.Shape.borderCard
        TileSquare.stroke(bounds, UIColor(face.current ? Tok.Col.accent : colors.rule), edge)
    }

    /// 資料夾磚裡一小塊多大。扣掉選中框的寬（1.1：正在看的紙在裡面時框變粗，小方塊不能被蓋到）
    static func miniSide(_ side: CGFloat) -> CGFloat {
        let count = CGFloat(Tok.Shape.folderMinis)
        let room = side - Tok.Shape.folderMiniPad * 2 - Tok.Shape.folderMiniGap * (count - 1) - Tok.Shape.borderSelected * 2
        return (room / count).rounded(.down)
    }

    /// 資料夾磚：方磚裡 3×3 小方塊，每塊是裡面一張紙的顏色和字
    private func drawFolder(_ minis: [TileFace.Paper], current: Bool) {
        let side = bounds.width, count = Tok.Shape.folderMinis
        UIColor(Tok.Col.page).setFill()
        TileSquare.shape(bounds).fill()
        let gap = Tok.Shape.folderMiniGap, pad = Tok.Shape.folderMiniPad
        let size = TileSquare.miniSide(side)
        for (index, paper) in minis.enumerated() {
            let spot = CGPoint(
                x: pad + CGFloat(index % count) * (size + gap), y: pad + CGFloat(index / count) * (size + gap)
            )
            let rect = CGRect(origin: spot, size: CGSize(width: size, height: size))
            TileSquare.drawInside(paper, in: rect, fontSide: size * Tok.Shape.folderMiniGlyph)
            TileSquare.stroke(rect, UIColor(Tok.note(paper.color).rule), 1 / max(1, traitCollection.displayScale))
        }
        TileSquare.stroke(
            bounds, UIColor(current ? Tok.Col.accent : Tok.Col.separator), current ? Tok.Shape.borderSelected : Tok.Shape.borderCard
        )
    }

    /// 底色和正中間的字；有封面圖的用圖、不放字
    private static func drawInside(_ paper: TileFace.Paper, in rect: CGRect, fontSide: CGFloat) {
        let colors = Tok.note(paper.color)
        let context = UIGraphicsGetCurrentContext()
        context?.saveGState()
        defer { context?.restoreGState() }
        shape(rect).addClip()
        if let photo = paper.photo.flatMap({ Covers.shared.thumb($0) }) {
            let scale = max(rect.width / photo.size.width, rect.height / photo.size.height)
            let size = CGSize(width: photo.size.width * scale, height: photo.size.height * scale)
            photo.draw(in: CGRect(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2, width: size.width, height: size.height))
            return
        }
        UIColor(colors.dot).setFill()
        UIRectFill(rect)
        guard !paper.glyph.isEmpty else { return }
        var text = word(paper.glyph, fontSide, colors.ink)
        let size = text.size()
        if size.width > rect.width {
            // 放不下就縮，最多縮一半
            text = word(paper.glyph, fontSide * max(Tok.Font.glyphShrink, rect.width / size.width), colors.ink)
        }
        let box = text.size()
        text.draw(at: CGPoint(x: rect.midX - box.width / 2, y: rect.midY - box.height / 2))
    }

    private static func word(_ glyph: String, _ side: CGFloat, _ ink: Color) -> NSAttributedString {
        NSAttributedString(string: glyph, attributes: [.font: Tok.Font.glyphUI(side), .foregroundColor: UIColor(ink)])
    }

    private static func shape(_ rect: CGRect) -> UIBezierPath {
        UIBezierPath(roundedRect: rect, cornerRadius: rect.width * Tok.Shape.tileRadiusRatio)
    }

    private static func stroke(_ rect: CGRect, _ color: UIColor, _ width: CGFloat) {
        let inner = rect.insetBy(dx: width / 2, dy: width / 2)
        let path = UIBezierPath(roundedRect: inner, cornerRadius: rect.width * Tok.Shape.tileRadiusRatio - width / 2)
        path.lineWidth = width
        color.setStroke()
        path.stroke()
    }

    private static func symbol(_ name: String, _ color: UIColor) -> UIImage? {
        UIImage(systemName: name, withConfiguration: UIImage.SymbolConfiguration(font: Tok.Font.labelUI()))?
            .withTintColor(color, renderingMode: .alwaysOriginal)
    }
}

import SwiftUI

/// 一塊磚的樣子（照 iPhone 主畫面的 App）：上面置中的方磚、下面一行名字。
/// 紙磚：整塊是紙的主色、正中間一個字，釘選的右上角一個圖釘，上鎖的左上角一個鎖。
/// 資料夾磚：方磚裡 3×3 小方塊，每塊是裡面一張紙的顏色和字。正在看的那張用茄紫框起來。
struct DirTileFace: View {
    let entry: Seats.Entry
    let cell: CGFloat
    var current = false
    var hideName = false

    var body: some View {
        let side = DirMetrics(cell: cell).side
        VStack(spacing: Tok.Shape.tileLabelGap) {
            square(side)
            Text(name)
                .font(Tok.Font.label)
                .foregroundColor(named ? Tok.Col.textPrimary : Tok.Col.textSecondary)
                .lineLimit(1)
                .dynamicTypeSize(...Tok.Font.titleMaxScale)
                .minimumScaleFactor(0.7)
                .frame(height: Tok.Shape.tileLabelH)
                .padding(.horizontal, Tok.Space.xs)
                .opacity(hideName ? 0 : 1)
        }
        .frame(width: cell, alignment: .top)
    }

    private var name: String {
        if let folder = entry.folder {
            return folder.name
        }
        return entry.note.map { Labels.label($0) } ?? ""
    }

    /// 沒取名的用次要色，看得出是「還沒取名」不是名字
    private var named: Bool {
        entry.folder != nil || !Labels.trim(entry.note?.title ?? "").isEmpty
    }

    @ViewBuilder
    private func square(_ side: CGFloat) -> some View {
        let shape = RoundedRectangle(cornerRadius: side * Tok.Shape.tileRadiusRatio, style: .continuous)
        if entry.folder != nil {
            shape.fill(Tok.Col.page)
                .overlay(alignment: .topLeading) { minis(side) }
                .overlay(shape.strokeBorder(current ? Tok.Col.accent : Tok.Col.separator, lineWidth: border))
                .frame(width: side, height: side)
        } else if let note = entry.note {
            let colors = Tok.note(note.color)
            shape.fill(colors.dot)
                .overlay(
                    Text(Labels.glyph(note))
                        .font(Tok.Font.glyph(side))
                        .foregroundColor(colors.ink)
                        .minimumScaleFactor(0.5)
                )
                .overlay(alignment: .topTrailing) { badge("pin.fill", show: note.pinned, color: colors.ink) }
                .overlay(alignment: .topLeading) { badge("lock.fill", show: note.locked, color: colors.ink) }
                .overlay(shape.strokeBorder(current ? Tok.Col.accent : colors.rule, lineWidth: border))
                .frame(width: side, height: side)
        }
    }

    private var border: CGFloat {
        current ? Tok.Shape.borderSelected : Tok.Shape.borderCard
    }

    @ViewBuilder
    private func badge(_ symbol: String, show: Bool, color: Color) -> some View {
        if show {
            Image(systemName: symbol)
                .font(Tok.Font.label)
                .foregroundColor(color)
                .padding(Tok.Space.xs)
        }
    }

    private func minis(_ side: CGFloat) -> some View {
        let count = Tok.Shape.folderMinis
        let gap = Tok.Shape.folderMiniGap, pad = Tok.Shape.folderMiniPad
        let size = ((side - pad * 2 - gap * CGFloat(count - 1)) / CGFloat(count)).rounded(.down)
        let notes = Array(entry.notes.prefix(count * count))
        return VStack(alignment: .leading, spacing: gap) {
            ForEach(0 ..< count, id: \.self) { row in
                HStack(spacing: gap) {
                    ForEach(0 ..< count, id: \.self) { col in
                        let index = row * count + col
                        if index < notes.count {
                            mini(notes[index], size)
                        }
                    }
                }
            }
        }
        .padding(pad)
    }

    private func mini(_ note: Note, _ size: CGFloat) -> some View {
        let colors = Tok.note(note.color)
        return RoundedRectangle(cornerRadius: size * Tok.Shape.tileRadiusRatio, style: .continuous)
            .fill(colors.dot)
            .overlay(
                Text(Labels.glyph(note))
                    .font(Tok.Font.glyph(size * Tok.Shape.folderMiniGlyph))
                    .foregroundColor(colors.ink)
                    .minimumScaleFactor(0.5)
            )
            .frame(width: size, height: size)
    }
}

/// 抖動：相鄰兩塊方向相反，來回轉一點點
struct Jiggle: ViewModifier {
    let active: Bool
    let odd: Bool
    @State private var angle: Double = 0

    func body(content: Content) -> some View {
        content
            .rotationEffect(.degrees(angle))
            .onAppear {
                if active {
                    start()
                }
            }
            .onChange(of: active) { now in
                if now {
                    start()
                } else {
                    // 明講「轉回 0」：新的動畫會蓋掉來回轉的那個，不然它會一直轉下去
                    withAnimation(Tok.Motion.fade) { angle = 0 }
                }
            }
    }

    private func start() {
        let swing = Tok.Motion.jiggleDeg * (odd ? -1 : 1)
        angle = -swing
        withAnimation(Tok.Motion.jiggle.repeatForever(autoreverses: true)) { angle = swing }
    }
}

/// 目錄或資料夾裡的一塊磚，帶各種狀態：抖動、按住放大、被瞄著要疊、剛有東西縮進來、拖走了先藏起來
struct DirTile: View {
    let entry: Seats.Entry
    let cell: CGFloat
    let index: Int
    var current = false
    var editing = false
    var hidden = false
    var target = false
    var pop = false
    var held = false
    @Environment(\.accessibilityReduceMotion) private var calm

    var body: some View {
        let side = DirMetrics(cell: cell).side
        DirTileFace(entry: entry, cell: cell, current: current, hideName: target)
            .opacity(target ? Tok.Motion.stackDim : 1)
            .background(alignment: .top) { plate(side) }
            .overlay(alignment: .topLeading) { minus(side) }
            .scaleEffect((held ? Tok.Motion.tileHoldScale : 1) * (pop ? Tok.Motion.stackPop : 1))
            .animation(calm ? nil : Tok.Motion.dragLift, value: held)
            .animation(calm ? nil : Tok.Motion.dragLift, value: pop)
            .animation(calm ? nil : Tok.Motion.stackCue, value: target)
            .modifier(Jiggle(active: editing && !calm, odd: index % 2 == 1))
            .opacity(hidden ? 0 : 1)
    }

    /// 被瞄著要疊的那張：後面長出底板
    private func plate(_ side: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: side * Tok.Shape.tileRadiusRatio, style: .continuous)
            .fill(Tok.Col.menuSep)
            .frame(width: side, height: side)
            .scaleEffect(target ? Tok.Motion.stackPlate : 1)
            .opacity(target ? 1 : 0)
    }

    /// 抖動中紙磚左上角的「−」（資料夾磚沒有）；按住那塊時收起
    @ViewBuilder
    private func minus(_ side: CGFloat) -> some View {
        if editing, entry.folder == nil, !target {
            Image(systemName: "minus")
                .font(Tok.Font.label.weight(.bold))
                .foregroundColor(Tok.Col.textPrimary)
                .frame(width: Tok.Shape.minusBadge, height: Tok.Shape.minusBadge)
                .background(Circle().fill(Tok.Col.separator))
                .offset(x: (cell - side) / 2 - Tok.Space.sm, y: -Tok.Space.sm)
                .opacity(held ? 0 : 1)
                .accessibilityHidden(true)
        }
    }
}

/// 目錄的一頁：每塊磚用位置排到第幾格，換位只改位置
struct DirPageView: View {
    @ObservedObject var model: DirModel
    let items: [Seats.Entry]
    let currentID: String?
    @Environment(\.accessibilityReduceMotion) private var calm

    var body: some View {
        let metrics = model.metrics
        let rows = (items.count + DirMetrics.cols - 1) / DirMetrics.cols
        ZStack(alignment: .topLeading) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, entry in
                if !entry.isHole {
                    let spot = metrics.slot(index)
                    DirTile(
                        entry: entry, cell: metrics.cell, index: index,
                        current: isCurrent(entry), editing: model.editing, hidden: model.drag?.id == entry.id,
                        target: model.stackOn == entry.id, pop: model.popID == entry.id, held: model.heldID == entry.id
                    )
                    .offset(x: spot.x, y: spot.y)
                    .animation(calm ? nil : Tok.Motion.tileShift, value: index)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(model.voiceLabel(entry))
                    .accessibilityAddTraits(isCurrent(entry) ? [.isButton, .isSelected] : .isButton)
                    .accessibilityAction { model.voiceActivate(entry) }
                    .accessibilityActions {
                        ForEach(model.voiceActs(entry), id: \.name) { act in
                            Button(act.name, action: act.run)
                        }
                    }
                }
            }
        }
        .frame(width: metrics.cell * CGFloat(DirMetrics.cols), height: metrics.height(rows: rows), alignment: .topLeading)
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
                .offset(x: ghost.corner.x + ghost.shift.width, y: ghost.corner.y + ghost.shift.height)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}

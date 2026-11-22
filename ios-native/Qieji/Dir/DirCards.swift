import SwiftUI
import UIKit

/// 長按一塊磚（照 1.1 PopMenu＋Swatches）：那塊浮在原位，選單卡接在它下面（放不下就上面），從靠磚那一角放大彈出。
/// 卡是玻璃、最上面一排色塊（每塊一圈細框、選中的茄紫外圈）、下面一條粗縫，項目之間髮絲線、按住變灰底。後面輕輕霧掉
struct DirMenuView: View {
    @ObservedObject var model: DirModel
    let menu: DirModel.Menu
    let note: Note
    let current: Bool
    @State private var lifted = false
    @State private var popped = false
    @Environment(\.accessibilityReduceMotion) private var calm
    @Environment(\.displayScale) private var scale

    var body: some View {
        let width = min(Tok.Shape.menuWide, model.screen.width - Tok.Space.lg * 2)
        ZStack(alignment: .topLeading) {
            MenuVeil()
                .contentShape(Rectangle())
                .onTapGesture { model.menu = nil }
                .accessibilityLabel(Words.closeMenu)
                .accessibilityAddTraits(.isButton)
            DirTileFace(entry: Seats.Entry(id: note.id, note: note, notes: [note]), cell: menu.width, current: current)
                .scaleEffect(lifted ? Tok.Motion.menuLiftScale : 1)
                .shadow(
                    color: Tok.Col.shadow.opacity(Tok.Shape.shadowSoft),
                    radius: Tok.Shape.shadowRadius, x: 0, y: Tok.Shape.shadowY
                )
                .offset(x: menu.corner.x, y: menu.corner.y)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            card
                .frame(width: width)
                // 減少動態：不放大，只淡入
                .scaleEffect(popped || calm ? 1 : Tok.Motion.menuPopFrom, anchor: anchor)
                .opacity(popped || !calm ? 1 : 0)
                .offset(x: menu.leading ? Tok.Space.lg : model.screen.width - Tok.Space.lg - width, y: menu.top)
        }
        .frame(width: model.screen.width, height: model.screen.height, alignment: .topLeading)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape) { model.menu = nil }
        .onAppear {
            withAnimation(calm ? nil : Tok.Motion.dragLift) { lifted = true }
            withAnimation(calm ? Tok.Motion.fade : Tok.Motion.menuPopIn) { popped = true }
        }
    }

    /// 卡片從靠磚的那一角長出來：卡在磚下面就是上緣那一角，在上面就是下緣
    private var anchor: UnitPoint {
        let below = menu.top > menu.corner.y
        switch (below, menu.leading) {
        case (true, true): return .topLeading
        case (true, false): return .topTrailing
        case (false, true): return .bottomLeading
        case (false, false): return .bottomTrailing
        }
    }

    private var card: some View {
        VStack(spacing: Tok.Space.zero) {
            HStack(spacing: Tok.Space.zero) {
                ForEach(NoteColor.keys, id: \.self) { key in
                    Button { model.recolor(note.id, key) } label: { swatch(key) }
                        .buttonStyle(PressDim())
                        .accessibilityLabel(ColorName.voice(key))
                        .accessibilityAddTraits(note.color == key ? .isSelected : [])
                }
            }
            .padding(.vertical, Tok.Space.md)
            .padding(.horizontal, Tok.Space.lg)
            Tok.Col.menuSep.frame(height: Tok.Shape.menuGap)
            item(Words.glyphEdit, "character") {
                model.menu = nil
                model.glyphFor = note.id
            }
            line
            item(note.pinned ? Words.unpin : Words.pin, note.pinned ? "pin.slash" : "pin") { model.togglePin(note.id) }
            line
            item(Words.delete, "trash", danger: true) { model.delete(note.id) }
        }
        .frost(RoundedRectangle(cornerRadius: Tok.Shape.radiusLg), thick: true)
    }

    private var line: some View {
        Tok.Col.menuSep
            .frame(height: 1 / scale)
            .padding(.leading, Tok.Space.lg)
    }

    /// 一個色塊：裡面是紙的深色、一圈細框（白蘿蔔在玻璃上才看得出邊）；選中的外面再一圈茄紫
    private func swatch(_ key: String) -> some View {
        let ring = Tok.Shape.borderSelected - Tok.Shape.borderCard
        return Circle()
            .fill(Tok.note(key).dot)
            .overlay(Circle().strokeBorder(Tok.Col.dotOutline, lineWidth: Tok.Shape.borderCard))
            .padding(ring)
            .overlay(Circle().strokeBorder(note.color == key ? Tok.Col.accent : Color.clear, lineWidth: ring))
            .frame(width: Tok.Shape.swatchDot, height: Tok.Shape.swatchDot)
            .frame(maxWidth: .infinity)
    }

    private func item(_ title: String, _ symbol: String, danger: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: Tok.Space.md) {
                Text(title)
                    .font(Tok.Font.body)
                Spacer(minLength: Tok.Space.sm)
                Image(systemName: symbol)
                    .font(Tok.Font.menuIcon)
            }
            .foregroundColor(danger ? Tok.Col.danger : Tok.Col.textPrimary)
            .padding(.horizontal, Tok.Space.lg)
            .frame(minHeight: Tok.Shape.menuRow)
            .contentShape(Rectangle())
        }
        .buttonStyle(MenuRowPress())
    }
}

/// 點一張打開（照 iOS 開 App）：那張紙的底色從方磚的位置放大到鋪滿，卡上有清單名、邊放大邊淡掉；鋪滿了面板淡出，露出後面已經換好的那張紙
struct DirLaunchView: View {
    let launch: DirModel.Launch
    let size: CGSize
    let done: () -> Void
    @State private var grown = false

    var body: some View {
        let from = launch.frame
        let colors = Tok.note(launch.color)
        let shape = RoundedRectangle(cornerRadius: grown ? Tok.Space.zero : from.width * Tok.Shape.tileRadiusRatio, style: .continuous)
        shape
            .fill(colors.paper)
            .overlay(shape.strokeBorder(colors.rule, lineWidth: Tok.Shape.borderCard))
            .overlay(alignment: .topLeading) {
                Text(launch.title)
                    .font(Tok.Font.headline)
                    .foregroundColor(Tok.Col.textPrimary)
                    .lineLimit(2)
                    .padding(Tok.Space.md)
                    .opacity(grown ? 0 : 1)
            }
            .clipShape(shape)
            .frame(width: grown ? size.width : from.width, height: grown ? size.height : from.height)
            .offset(x: grown ? 0 : from.minX, y: grown ? 0 : from.minY)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onAppear {
                withAnimation(Tok.Motion.launch) { grown = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Motion.launchSeconds) { done() }
            }
    }
}

/// 改磚上的字（1.1 PromptCard，多米 2026-11-04 定）：自己畫的卡片，停在鍵盤上方那段的正中。
/// 打超過一個字按「好」：留在這一頁，輸入框紅框、下面紅字、卡片晃一下、震一下，字都還在；合格才收起來存
struct DirGlyphCard: View {
    let note: Note
    let save: (String) -> Void
    let close: () -> Void
    @State private var text: String
    @State private var problem: String?
    @State private var nudge: CGFloat = 0
    @FocusState private var focused: Bool
    @Environment(\.accessibilityReduceMotion) private var calm
    @Environment(\.displayScale) private var scale

    init(note: Note, save: @escaping (String) -> Void, close: @escaping () -> Void) {
        self.note = note
        self.save = save
        self.close = close
        _text = State(initialValue: note.glyph ?? "")
    }

    var body: some View {
        ZStack {
            Tok.Col.scrim
                .ignoresSafeArea()
                .accessibilityHidden(true)
            card
                .frame(maxWidth: Tok.Shape.promptMaxW)
                .offset(x: nudge)
                .padding(.horizontal, Tok.Space.xxl)
        }
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape, leave)
        .onAppear { focused = true }
        // 打開時整個字選起來：直接打就換掉（1.1 selectTextOnFocus）
        .onReceive(NotificationCenter.default.publisher(for: UITextField.textDidBeginEditingNotification)) { event in
            guard let field = event.object as? UITextField else { return }
            DispatchQueue.main.async { field.selectAll(nil) }
        }
    }

    private var card: some View {
        let field = RoundedRectangle(cornerRadius: Tok.Shape.radiusSm, style: .continuous)
        return VStack(spacing: Tok.Space.zero) {
            Text(Words.glyphTitle)
                .font(Tok.Font.headline)
                .foregroundColor(Tok.Col.textPrimary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Tok.Space.lg)
                .padding(.bottom, Tok.Space.lg)
            Text(Words.glyphBody)
                .font(Tok.Font.callout)
                .foregroundColor(Tok.Col.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Tok.Space.lg)
                .padding(.bottom, Tok.Space.lg)
            TextField(text: $text, prompt: Text(Labels.glyph(note)).foregroundColor(Tok.Col.textMuted)) {
                Text(Words.glyphTitle)
            }
            .font(Tok.Font.body)
            .foregroundColor(Tok.Col.textPrimary)
            .multilineTextAlignment(.center)
            .submitLabel(.done)
            .focused($focused)
            .onSubmit(submit)
            .padding(.horizontal, Tok.Space.md)
            .frame(minHeight: Tok.Shape.hitMin)
            .background(field.fill(Tok.Col.searchFill))
            .overlay(field.strokeBorder(problem == nil ? Color.clear : Tok.Col.danger, lineWidth: Tok.Shape.borderCard))
            .padding(.horizontal, Tok.Space.lg)
            .onChange(of: text) { now in
                if problem != nil {
                    problem = Labels.glyphProblem(now)
                }
            }
            // 永遠佔一行高：紅字出現時卡片不會變高、不會跳
            Text(problem ?? " ")
                .font(Tok.Font.footnote)
                .foregroundColor(Tok.Col.danger)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Tok.Space.lg)
                .padding(.top, Tok.Space.xs)
                .padding(.bottom, Tok.Space.sm)
                .accessibilityHidden(problem == nil)
            Tok.Col.separator.frame(height: 1 / scale)
            HStack(spacing: Tok.Space.zero) {
                action(Words.cancel, strong: false, run: leave)
                action(Words.ok, strong: true, run: submit)
            }
        }
        .padding(.top, Tok.Space.lg)
        .background(RoundedRectangle(cornerRadius: Tok.Shape.radiusLg, style: .continuous).fill(Tok.Col.surface))
        .clipShape(RoundedRectangle(cornerRadius: Tok.Shape.radiusLg, style: .continuous))
    }

    private func action(_ title: String, strong: Bool, run: @escaping () -> Void) -> some View {
        Button(action: run) {
            Text(title)
                .font(strong ? Tok.Font.headline : Tok.Font.body)
                .foregroundColor(Tok.Col.accent)
                .frame(maxWidth: .infinity, minHeight: Tok.Shape.hitMin)
                .contentShape(Rectangle())
        }
        .buttonStyle(MenuRowPress())
    }

    private func leave() {
        focused = false
        close()
    }

    private func submit() {
        if let bad = Labels.glyphProblem(text) {
            problem = bad
            Haptic.reject()
            UIAccessibility.post(notification: .announcement, argument: bad)
            shake()
            return
        }
        leave()
        save(text)
    }

    /// 左右晃一下：-8、8、-4、0，每段 0.05 秒（1.1 reject）
    private func shake() {
        guard !calm else { return }
        let dist = Tok.Motion.rejectDist
        for (index, spot) in [-dist, dist, -dist / 2, 0].enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Motion.rejectStepSeconds * Double(index)) {
                withAnimation(Tok.Motion.rejectStep) { nudge = spot }
            }
        }
    }
}

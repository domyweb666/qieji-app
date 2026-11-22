import SwiftUI

/// 選單卡裡的一項
struct MenuItem: Identifiable {
    let id = UUID()
    let label: String
    let icon: String
    var destructive = false
    let run: () -> Void
}

/// 按住一行跳的選單（照 1.1 PopMenu）：卡片接在那一行正下方、靠右，放不下就往上收；後面輕輕霧掉、點外面收起。
/// 卡片從右上角放大彈出（0.17 秒）、收起縮回去（0.12 秒）；減少動態改成淡入淡出
struct RowMenu: View {
    let items: [MenuItem]
    /// 那一行在螢幕上的底邊（視窗座標）
    let rowBottom: CGFloat
    let close: () -> Void
    @Environment(\.accessibilityReduceMotion) private var calm
    @Environment(\.displayScale) private var scale

    var body: some View {
        GeometryReader { geo in
            let frame = geo.frame(in: .global)
            let height = RowMenu.height(items.count)
            let top = max(Tok.Space.zero, min(rowBottom - frame.minY, frame.height - height))
            ZStack(alignment: .topTrailing) {
                MenuVeil()
                    .contentShape(Rectangle())
                    .onTapGesture(perform: close)
                    .accessibilityLabel(Words.closeMenu)
                    .accessibilityAddTraits(.isButton)
                    .transition(.opacity.animation(Tok.Motion.menuBackdrop))
                card
                    .frame(width: Tok.Shape.menuW)
                    .padding(.top, top)
                    .padding(.trailing, Tok.Space.md)
                    .transition(cardMotion)
            }
        }
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape, close)
    }

    private var cardMotion: AnyTransition {
        if calm {
            return .opacity.animation(Tok.Motion.fade)
        }
        return .asymmetric(
            insertion: .scale(scale: Tok.Motion.menuPopFrom, anchor: .topTrailing).animation(Tok.Motion.menuPopIn),
            removal: .scale(scale: Tok.Motion.menuPopFrom, anchor: .topTrailing).combined(with: .opacity).animation(Tok.Motion.menuPopOut)
        )
    }

    private var card: some View {
        VStack(spacing: Tok.Space.zero) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 {
                    Tok.Col.menuSep
                        .frame(height: 1 / scale)
                        .padding(.leading, Tok.Space.lg)
                }
                Button {
                    close()
                    item.run()
                } label: {
                    HStack(spacing: Tok.Space.md) {
                        Text(item.label)
                            .font(Tok.Font.body)
                        Spacer(minLength: Tok.Space.sm)
                        Image(systemName: item.icon)
                            .font(Tok.Font.menuIcon)
                    }
                    .foregroundColor(item.destructive ? Tok.Col.danger : Tok.Col.textPrimary)
                    .padding(.horizontal, Tok.Space.lg)
                    .frame(minHeight: Tok.Shape.menuRow)
                    .contentShape(Rectangle())
                }
                .buttonStyle(MenuRowPress())
            }
        }
        .frost(RoundedRectangle(cornerRadius: Tok.Shape.radiusLg), thick: true)
    }

    /// 估卡片多高（放不下就往上收用）：照 1.1 的算法，幾個項目、項目之間的縫、上下內距
    static func height(_ count: Int) -> CGFloat {
        CGFloat(count) * Tok.Shape.menuRow + CGFloat(max(0, count - 1)) * Tok.Space.xs + Tok.Space.sm * 2
    }
}

/// 選單項目按住：底色變成分隔線那個淡色（1.1 PopMenu pressed）
struct MenuRowPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.background(configuration.isPressed ? Tok.Col.menuSep : Color.clear)
    }
}

/// 選單後面那一層：輕輕霧掉再壓一點點黑（iOS 的長按選單是霧掉、不是變暗）；開了「減少透明度」改用暗幕
struct MenuVeil: View {
    @Environment(\.accessibilityReduceTransparency) private var solid

    var body: some View {
        ZStack {
            if solid {
                Tok.Col.scrim
            } else {
                Rectangle().fill(.ultraThinMaterial)
                Tok.Col.menuVeil
            }
        }
        .ignoresSafeArea()
    }
}

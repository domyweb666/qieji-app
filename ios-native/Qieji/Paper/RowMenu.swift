import SwiftUI

/// 選單卡裡的一項
struct MenuItem: Identifiable {
    /// 選了之後浮起的那一行怎麼收：縮回去、拍一張新的樣子再縮回去（字變了）、留在原地淡掉（要刪了）
    enum After {
        case home, redraw, fade
    }

    let id = UUID()
    let label: String
    let icon: String
    var destructive = false
    var after = After.home
    let run: () -> Void
}

/// 按住了哪一行。exit 有值＝正在收（收的途中碰不到）
struct RowMenuAsk {
    let grab: RowGrab
    /// 打開那一刻的項目
    let items: [MenuItem]
    /// 最下面那行小字：什麼時候記的（多米 2026-11-25 選 1A）。讀不出來、空行就沒有
    let born: String?
    /// 選好一項了：卡片上的字不再跟著資料換（不然收的途中「劃掉」會變成「恢復」）
    var picked = false
    var exit: RowExit?
    let token = UUID()
}

/// 按住一行跳的選單：那一行浮在霧上面（RowLift），卡片接在下面、放不下就上面，靠右；點外面收起。
/// 卡片從靠近那一行的角放大彈出（0.17 秒）、收起縮回去（0.12 秒）；減少動態改成淡入淡出
struct RowMenu: View {
    let ask: RowMenuAsk
    let items: [MenuItem]
    let pick: (MenuItem) -> Void
    let close: () -> Void
    @State private var popped = false
    @Environment(\.accessibilityReduceMotion) private var calm
    @Environment(\.displayScale) private var scale

    var body: some View {
        let closing = ask.exit != nil
        let shown = popped && !closing
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                MenuVeil()
                    .contentShape(Rectangle())
                    .onTapGesture(perform: close)
                    .accessibilityLabel(Words.closeMenu)
                    .accessibilityAddTraits(.isButton)
                    .opacity(shown ? 1 : 0)
                    .animation(closing ? Tok.Motion.menuPopOut : Tok.Motion.menuBackdrop, value: shown)
                RowLiftHost(ask: ask, calm: calm)
                    .accessibilityHidden(true)
                RowMenuLayout(place: ask.grab.place, origin: geo.frame(in: .global).origin) {
                    card
                        .opacity(closing || (calm && !popped) ? 0 : 1)
                        .modifier(PopCorner(grow: shown || calm ? 1 : Tok.Motion.menuPopFrom, place: ask.grab.place))
                        .animation(cardMotion(closing), value: shown)
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(!closing)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape, close)
        .onAppear { popped = true }
    }

    private func cardMotion(_ closing: Bool) -> Animation {
        if calm {
            return Tok.Motion.fade
        }
        return closing ? Tok.Motion.menuPopOut : Tok.Motion.menuPopIn
    }

    private var card: some View {
        VStack(spacing: Tok.Space.zero) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                if index > 0 {
                    Tok.Col.menuSep
                        .frame(height: 1 / scale)
                        .padding(.leading, Tok.Space.lg)
                }
                Button { pick(item) } label: {
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
            if let born = ask.born {
                Tok.Col.menuSep.frame(height: 1 / scale)
                Text(born)
                    .font(Tok.Font.footnote)
                    .foregroundColor(Tok.Col.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, Tok.Space.lg)
                    .padding(.vertical, Tok.Space.sm)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                    .gesture(TapGesture()) // 只是字：點到不做事，也不穿過去把選單關掉
            }
        }
        // 按住最上、最下那一項的灰底照圓角裁（玻璃自己不裁）
        .clipShape(RoundedRectangle(cornerRadius: Tok.Shape.radiusLg))
        .frost(RoundedRectangle(cornerRadius: Tok.Shape.radiusLg), thick: true)
    }
}

/// 卡片照實際的高擺（系統字放大時一列會比 48 高）：同一趟排版就量好、擺好，不會先出現再跳
struct RowMenuLayout: Layout {
    let place: RowMenuPlace
    /// 這一層的左上角在螢幕上的位置
    let origin: CGPoint

    func sizeThatFits(proposal: ProposedViewSize, subviews _: Subviews, cache _: inout ()) -> CGSize {
        proposal.replacingUnspecifiedDimensions()
    }

    func placeSubviews(in bounds: CGRect, proposal _: ProposedViewSize, subviews: Subviews, cache _: inout ()) {
        for card in subviews {
            let want = ProposedViewSize(width: Tok.Shape.menuW, height: nil)
            let tall = card.sizeThatFits(want).height
            let corner = CGPoint(
                x: bounds.maxX - Tok.Space.md - Tok.Shape.menuW,
                y: bounds.minY + place.spot(tall).top - origin.y
            )
            card.place(at: corner, anchor: .topLeading, proposal: want)
        }
    }
}

/// 從靠近那一行、靠右的角放大（卡在行下面＝上緣那角，在上面＝下緣那角）
struct PopCorner: GeometryEffect {
    var grow: CGFloat
    let place: RowMenuPlace

    var animatableData: CGFloat {
        get { grow }
        set { grow = newValue }
    }

    func effectValue(size: CGSize) -> ProjectionTransform {
        let y = place.spot(size.height).below ? 0 : size.height
        return ProjectionTransform(
            CGAffineTransform(translationX: size.width, y: y).scaledBy(x: grow, y: grow).translatedBy(x: -size.width, y: -y)
        )
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
                SoftBlur(amount: Tok.Col.menuBlur)
                Tok.Col.menuVeil
            }
        }
        .ignoresSafeArea()
    }
}

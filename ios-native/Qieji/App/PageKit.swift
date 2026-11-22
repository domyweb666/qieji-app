import SwiftUI

/// 推進來的一頁（最近刪除、設定、新功能、蔬菜家族；照 1.1）：奶油底，頁名用 28 點大字畫在內容裡、跟內容一起捲。
/// 不用系統大標題：推進來時標題列邊進場邊長高，標題往下掉（1.1 2026-11-04 多米真機「抖」）。返回鍵只有箭頭
struct PageScaffold<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tok.Space.zero) {
                Text(title)
                    .font(Tok.Font.title)
                    .foregroundColor(Tok.Col.textPrimary)
                    .padding(.top, Tok.Space.sm)
                    .padding(.leading, Tok.Space.lg)
                    .accessibilityAddTraits(.isHeader)
                content()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Tok.Space.gutter)
            .padding(.bottom, Tok.Space.pageBottom)
        }
        .background(Tok.Col.page.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbarRole(.editor)
    }
}

/// 一組（照 iOS 設定 app 的分組清單）：上面一行小字組名、下面一塊圓角底
struct PageGroup<Content: View>: View {
    var title: String?
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: Tok.Space.sm) {
            if let title {
                Text(title)
                    .font(Tok.Font.footnote.weight(.semibold))
                    .foregroundColor(Tok.Col.textSecondary)
                    .padding(.leading, Tok.Space.lg)
                    .accessibilityAddTraits(.isHeader)
            }
            VStack(spacing: Tok.Space.zero) { content() }
                .background(Tok.Col.surface)
                .clipShape(RoundedRectangle(cornerRadius: Tok.Shape.radiusMd))
        }
        .padding(.top, Tok.Space.xl)
    }
}

/// 組裡的一列：上面一條髮絲線（第一列不畫），線從字起算、不切到前面的圖示或色點
struct PageRow<Lead: View, Trail: View>: View {
    var first = false
    var inset: CGFloat = Tok.Space.lg
    let action: (() -> Void)?
    @ViewBuilder let lead: () -> Lead
    @ViewBuilder let trail: () -> Trail
    @Environment(\.displayScale) private var scale

    var body: some View {
        VStack(spacing: Tok.Space.zero) {
            if !first {
                Tok.Col.separator
                    .frame(height: 1 / scale)
                    .padding(.leading, inset)
            }
            if let action {
                Button(action: action) { line }
                    .buttonStyle(RowPress())
            } else {
                line
            }
        }
    }

    private var line: some View {
        HStack(spacing: Tok.Space.md) {
            lead()
            Spacer(minLength: Tok.Space.sm)
            trail()
        }
        .padding(.vertical, Tok.Space.md)
        .padding(.horizontal, Tok.Space.lg)
        .frame(minHeight: Tok.Shape.hitMin)
        .contentShape(Rectangle())
    }
}

/// 列按住：淡淡的茄紫底（1.1 pressedFill）
struct RowPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.background(configuration.isPressed ? Tok.Col.pressedFill : Color.clear)
    }
}

/// 色點：顏色本身的對比不夠，靠描邊；名字永遠在旁邊，色點只是裝飾
struct ColorDot: View {
    let key: String

    var body: some View {
        Circle()
            .fill(Tok.note(key).dot)
            .overlay(Circle().strokeBorder(Tok.Col.dotOutline, lineWidth: Tok.Shape.borderCard))
            .frame(width: Tok.Shape.dot, height: Tok.Shape.dot)
            .accessibilityHidden(true)
    }
}

import SwiftUI
import UIKit

/// 推進來的一頁（最近刪除、設定、新功能、蔬菜家族；照 1.1）：奶油底，頁名用 28 點大字畫在內容裡、跟內容一起捲。
/// 不用系統大標題：推進來時標題列邊進場邊長高，標題往下掉（1.1 2026-11-04 多米真機「抖」）。返回鍵只有箭頭
///
/// 不用系統標題列，返回鍵、⋯ 自己畫在頁面上（跟紙右上的 ⋯ 同一種玻璃圓鈕）：
/// 紙沒有標題列，系統的返回鍵在推頁時比頁面慢半拍才對齊；按返回時那顆玻璃先鼓成空心圈、留在原地不跟頁面走，
/// 回到紙之後還在左上角飄約 10 格才淡掉（2026-11-26 多米真機「左上角按鈕會跳動一下」，limrun 錄影逐格看到）。
/// 畫在頁面上就跟頁面一起滑，只剩一套機制在動
struct PageScaffold<Content: View, Trailing: View>: View {
    let title: String
    @ViewBuilder let trailing: () -> Trailing
    @ViewBuilder let content: () -> Content
    @Environment(\.dismiss) private var dismiss

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
        .safeAreaInset(edge: .top, spacing: Tok.Space.zero) { bar }
        .toolbar(.hidden, for: .navigationBar)
        .background(SwipeBack().frame(width: Tok.Space.zero, height: Tok.Space.zero))
        .accessibilityAction(.escape) { dismiss() }
    }

    /// 頂端一排：左返回、右邊這頁自己的鈕；位置照紙的頂端那排（左 16、右 20、上 8）
    private var bar: some View {
        HStack(spacing: Tok.Space.sm) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(Tok.Font.barIcon)
                    .foregroundColor(Tok.Col.textPrimary)
                    .frame(width: Tok.Shape.hitMin, height: Tok.Shape.hitMin)
                    .frost(Circle(), interactive: true)
            }
            .buttonStyle(FrostPress())
            .accessibilityLabel(Words.back)
            Spacer(minLength: Tok.Space.sm)
            trailing()
        }
        .padding(.leading, Tok.Space.lg)
        .padding(.trailing, Tok.Space.gutter)
        .padding(.vertical, Tok.Space.sm)
        .background(Tok.Col.page.ignoresSafeArea(edges: .top))
    }
}

extension PageScaffold where Trailing == EmptyView {
    init(title: String, @ViewBuilder content: @escaping () -> Content) {
        self.init(title: title, trailing: { EmptyView() }, content: content)
    }
}

/// 右上的圓鈕（最近刪除的 ⋯）：跟紙右上的 ⋯ 長一樣
struct PageBarIcon: View {
    let symbol: String

    var body: some View {
        Image(systemName: symbol)
            .font(Tok.Font.barIcon)
            .foregroundColor(Tok.Col.textPrimary)
            .frame(width: Tok.Shape.hitMin, height: Tok.Shape.hitMin)
            .frost(Circle(), interactive: true)
    }
}

/// 標題列藏起來之後，系統把「從左邊緣往右滑回上一頁」關掉了，這裡接回來。
/// 只在堆疊裡有兩頁以上才准開始：紙（最底下那頁）往右滑是劃掉一行，不能被它搶走
struct SwipeBack: UIViewControllerRepresentable {
    func makeUIViewController(context _: Context) -> Probe {
        Probe()
    }

    func updateUIViewController(_: Probe, context _: Context) {}

    final class Probe: UIViewController {
        override func viewWillAppear(_ animated: Bool) {
            super.viewWillAppear(animated)
            hook()
        }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            hook()
        }

        private func hook() {
            guard let nav = navigationController, let pop = nav.interactivePopGestureRecognizer else { return }
            PopGate.shared.nav = nav
            pop.delegate = PopGate.shared
            pop.isEnabled = true
        }
    }
}

/// 邊緣滑回上一頁的守門：手勢的 delegate 是 weak，所以放一個一直活著的
final class PopGate: NSObject, UIGestureRecognizerDelegate {
    static let shared = PopGate()
    weak var nav: UINavigationController?

    func gestureRecognizerShouldBegin(_: UIGestureRecognizer) -> Bool {
        guard let nav else { return false }
        return nav.viewControllers.count > 1 && nav.transitionCoordinator == nil
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

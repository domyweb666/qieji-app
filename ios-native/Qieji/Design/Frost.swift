import SwiftUI

/// 浮在紙上面那一層的材質（照 1.1 Glass.tsx）：右上圓鈕、右下 ＋、✓、提示條、選單卡都用這個。
/// - iOS 26 以上：液態玻璃（系統按鈕、工具列用的同一個）
/// - iOS 26 以下：系統霧面（按鈕列用 bar＝systemChromeMaterial，選單卡用 thick），tint 墊在霧面底下
/// - 開了「減少透明度」：不透明的底加軟陰影
struct Frost<S: Shape>: ViewModifier {
    let shape: S
    var tint: Color?
    var interactive = false
    var thick = false
    @Environment(\.accessibilityReduceTransparency) private var solid

    func body(content: Content) -> some View {
        if solid {
            content
                .background(shape.fill(tint ?? Tok.Col.surface))
                .shadow(
                    color: Tok.Col.shadow.opacity(Tok.Shape.shadowSoft),
                    radius: Tok.Shape.shadowRadius, x: 0, y: Tok.Shape.shadowY
                )
        } else if #available(iOS 26.0, *) {
            // 玻璃自己不收觸控：不補這個形狀的話，圓鈕只有中間那個圖示點得到，點在圈裡別的地方會穿到後面那一行
            content
                .glassEffect(glass, in: shape)
                .contentShape(shape)
        } else {
            content
                .background(ZStack {
                    if let tint {
                        shape.fill(tint)
                    }
                    shape.fill(thick ? Material.thick : Material.bar)
                })
                .clipShape(shape)
        }
    }

    @available(iOS 26.0, *)
    private var glass: Glass {
        let base = tint.map { Glass.regular.tint($0) } ?? Glass.regular
        return interactive ? base.interactive() : base
    }
}

extension View {
    /// 套上浮層材質（見 Frost）
    func frost(_ shape: some Shape, tint: Color? = nil, interactive: Bool = false, thick: Bool = false) -> some View {
        modifier(Frost(shape: shape, tint: tint, interactive: interactive, thick: thick))
    }
}

/// 會反應的玻璃鈕（＋、✓、×）：iOS 26 的玻璃按下去自己會鼓起、亮一下，不再變淡；沒有玻璃的時候（iOS 26 以下、減少透明度）照舊變淡
struct FrostPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        Press(configuration: configuration)
    }

    private struct Press: View {
        let configuration: ButtonStyleConfiguration
        @Environment(\.accessibilityReduceTransparency) private var solid

        var body: some View {
            configuration.label.opacity(configuration.isPressed && dims ? Tok.Motion.pressDim : 1)
        }

        private var dims: Bool {
            if #available(iOS 26.0, *) {
                return solid
            }
            return true
        }
    }
}

/// 按住效果統一：變淡到 pressDim（1.1 tokens motion.pressDim）
struct PressDim: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? Tok.Motion.pressDim : 1)
    }
}

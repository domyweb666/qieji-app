import SwiftUI
import UIKit

/// 輸入框（照 1.1 Composer）：按右下 ＋ 從底下升起、貼在鍵盤上面，跟著字長高（長到清單頂端，再多在框裡捲）。
/// Return＝在框裡換行；✓＝記下來、收起；點紙上一行或空白處、切到別的 app 一樣記下來再收起，字不會丟。
/// 卡片是不透明的奶油白（後面是變暗的紙，玻璃會照著變深、字看不清）。
struct ComposerBar: View {
    @Binding var text: String
    var focused: FocusState<Bool>.Binding
    let maxLines: Int
    let tip: Bool
    let onDone: () -> Void
    let onTipTap: () -> Void

    var body: some View {
        HStack(alignment: .bottom, spacing: Tok.Space.zero) {
            TextField("", text: $text, prompt: Text(Words.composerHint).foregroundColor(Tok.Col.textMuted), axis: .vertical)
                .font(Tok.Font.body)
                .foregroundColor(Tok.Col.textPrimary)
                .lineLimit(1 ... max(1, maxLines))
                .focused(focused)
                .frame(minHeight: Tok.Shape.hitMin)
                .accessibilityLabel(Words.composerField)
            Button(action: onDone) {
                Image(systemName: "checkmark")
                    .font(Tok.Font.barCheck)
                    .foregroundColor(Tok.Col.textPrimary)
                    .frame(width: Tok.Shape.hitMin, height: Tok.Shape.hitMin)
            }
            .buttonStyle(PressDim())
            .accessibilityLabel(Words.commit)
        }
        .padding(.leading, Tok.Space.lg)
        .padding(.trailing, Tok.Space.xs)
        .padding(.vertical, Tok.Space.sm)
        .background(RoundedRectangle(cornerRadius: Tok.Shape.radiusLg).fill(Tok.Col.surface))
        .shadow(color: Tok.Col.shadow.opacity(Tok.Shape.shadowSoft), radius: Tok.Shape.shadowRadius, x: 0, y: Tok.Shape.shadowY)
        .overlay(alignment: .topTrailing) {
            if tip {
                ReturnTip(onTap: onTipTap)
                    .alignmentGuide(.top) { $0[.bottom] + Tok.Space.md }
            }
        }
        .padding(.horizontal, Tok.Space.sm)
        .padding(.bottom, Tok.Space.sm)
    }

    /// 這次改字是不是「按了一下 Return」：剛好多一個字，而且多的是換行（貼上一大段、刪字、選字確認都不算）
    static func typedReturn(prev: String, next: String) -> Bool {
        let breaks = { (text: String) in text.filter { $0 == "\n" }.count }
        return (next as NSString).length == (prev as NSString).length + 1 && breaks(next) == breaks(prev) + 1
    }
}

/// ✓ 的單點提示（1.1 tip）：從 1.0 更新上來的人第一次在輸入框按 Return（現在是換行）時，✓ 上面冒一張小卡，一輩子一次。
/// 不變暗、不擋觸控；點它、按 ✓、框收起就不見。底色用字的顏色、字用卡片的顏色（深淺色自己反過來）
struct ReturnTip: View {
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .trailing, spacing: Tok.Space.zero) {
                Text(Words.returnTip)
                    .font(Tok.Font.footnote)
                    .foregroundColor(Tok.Col.surface)
                    .padding(.horizontal, Tok.Space.md)
                    .padding(.vertical, Tok.Space.sm)
                    .background(RoundedRectangle(cornerRadius: Tok.Shape.radiusSm).fill(Tok.Col.textPrimary))
                // 小尾巴：轉 45 度的方塊，中心對著 ✓ 的中心
                Rectangle()
                    .fill(Tok.Col.textPrimary)
                    .frame(width: Tok.Space.md, height: Tok.Space.md)
                    .rotationEffect(.degrees(Tok.Shape.tipTailTurn))
                    .offset(y: -Tok.Space.md / 2)
                    .padding(.trailing, Tok.Space.xs + Tok.Shape.hitMin / 2 - Tok.Space.md / 2)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Words.returnTip)
        .accessibilityHint(Words.tipHint)
        .transition(.opacity.animation(Tok.Motion.fade))
    }
}

/// 剛記下的那一行亮一下：捲回頂端那段時間亮著，之後慢慢淡掉，回答「我剛剛記的去哪了」（1.1 FreshGlow）
struct FreshGlow: View {
    let done: () -> Void
    @State private var shown = 1.0
    @Environment(\.accessibilityReduceMotion) private var calm

    var body: some View {
        Tok.Col.rowEditingFill
            .opacity(shown)
            .allowsHitTesting(false)
            .onAppear {
                let wait = calm ? 0 : Tok.Motion.freshGlowDelay
                withAnimation(Tok.Motion.freshGlowFade.delay(wait)) { shown = 0 }
                DispatchQueue.main.asyncAfter(deadline: .now() + wait + Tok.Motion.freshGlowSeconds, execute: done)
            }
    }
}

/// 右下角的茄紫 ＋（1.1 PageBar）：畫在根畫面、紙的外面，換紙時一直停在原地；鍵盤、輸入框、選單開著時淡出，跟鍵盤同一個時鐘
struct PlusButton: View {
    let shown: Bool
    let action: () -> Void

    var body: some View {
        ZStack {
            if shown {
                Button(action: action) {
                    Image(systemName: "plus")
                        .font(Tok.Font.fabSymbol)
                        .foregroundColor(Tok.Col.fabIcon)
                        .frame(width: Tok.Shape.fab, height: Tok.Shape.fab)
                        .frost(Circle(), tint: Tok.Col.accent, interactive: true)
                }
                .buttonStyle(PressDim())
                .accessibilityLabel(Words.addLine)
                .transition(.opacity)
            }
        }
        .animation(Tok.Motion.keyboard, value: shown)
        .padding(.trailing, Tok.Space.lg)
        .padding(.bottom, Tok.Space.sm)
    }
}

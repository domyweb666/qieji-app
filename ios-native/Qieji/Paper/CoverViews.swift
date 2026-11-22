import SwiftUI
import UIKit

/// 紙捲到哪（封面圖跟著捲、標題列的底與小膠囊淡進來用）。只有封面那幾塊看著它：捲動時紙不用整張重畫
final class ScrollSpy: ObservableObject {
    @Published var y: CGFloat = 0 // 捲動位置，最上面＝0、往下拉是負的
    @Published var nameEnd: CGFloat = 1000 // 大字名字的底邊在捲動內容裡的位置
}

/// 隨捲動淡進來：y 從 start 走到 start＋24 時從 0 變 1
struct SpyFade<Content: View>: View {
    @ObservedObject var spy: ScrollSpy
    let start: (ScrollSpy) -> CGFloat
    @ViewBuilder let content: () -> Content

    var body: some View {
        content().opacity(Double(min(1, max(0, (spy.y - start(spy)) / Tok.Space.xl))))
    }
}

/// 清單的封面圖（1.1 丁，2026-11-14 多米定）：矮橫幅從螢幕最頂鋪下來、畫在標題列後面、往下超出一小截，
/// 跟著紙往上捲，捲到整張收進標題列後面為止；在最上面再往下拉時圖撐大補滿。最上面一截化進紙色，時間和訊號才看得清楚
struct CoverBanner: View {
    let photo: UIImage
    let paper: Color
    @ObservedObject var spy: ScrollSpy

    var body: some View {
        GeometryReader { geo in
            let top = Screen.topInset
            let pull = max(0, -spy.y)
            Image(uiImage: photo)
                .resizable()
                .scaledToFill()
                .frame(width: geo.size.width, height: top + Tok.Shape.coverLow + pull)
                .clipped()
                .overlay(alignment: .top) {
                    LinearGradient(colors: [paper, paper.opacity(0)], startPoint: .top, endPoint: .bottom)
                        .frame(height: top + Tok.Space.xl)
                }
                .offset(y: -min(max(spy.y, 0), Tok.Shape.coverBelowBar))
                .accessibilityLabel(Words.coverImage)
        }
        .ignoresSafeArea(edges: .top)
    }
}

/// 記事本的封面圖：照舊固定在上面，清單名和 ⋯ 疊在圖上
struct CoverFixed: View {
    let photo: UIImage

    var body: some View {
        // 佔 150 高，圖往上鋪到螢幕最頂（瀏海那段也是圖）
        Color.clear
            .frame(height: Tok.Shape.coverHigh)
            .frame(maxWidth: .infinity)
            .background {
                Image(uiImage: photo)
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipped()
                    .ignoresSafeArea(edges: .top)
                    .accessibilityLabel(Words.coverImage)
            }
    }
}

/// 有封面圖的清單，捲動內容最前面那一塊：方磚壓在橫幅下緣，下面大字名字（點了切換清單），再下面時間列
struct CoverHead: View {
    let note: Note
    let colors: Tok.NoteColors
    @ObservedObject var spy: ScrollSpy
    let onTitle: () -> Void

    var body: some View {
        let named = !Labels.trim(note.title).isEmpty
        VStack(alignment: .leading, spacing: Tok.Space.zero) {
            Button(action: onTitle) {
                VStack(alignment: .leading, spacing: Tok.Space.sm) {
                    NoteTile(note: note, side: Tok.Shape.coverTile)
                        .padding(Tok.Shape.borderSelected)
                        .background(
                            RoundedRectangle(cornerRadius: Tok.Shape.coverTile * Tok.Shape.tileRadiusRatio + Tok.Shape.borderSelected)
                                .fill(colors.paper)
                        )
                    HStack(spacing: Tok.Space.sm) {
                        Text(Labels.label(note))
                            .font(Tok.Font.title)
                            .foregroundColor(named ? Tok.Col.textPrimary : Tok.Col.textSecondary)
                            .lineLimit(2)
                        Image(systemName: "chevron.down")
                            .font(Tok.Font.chevron)
                            .foregroundColor(Tok.Col.textSecondary)
                    }
                    .frame(minHeight: Tok.Shape.hitMin)
                    .background(GeometryReader { geo in
                        Color.clear
                            .onAppear { spy.nameEnd = geo.frame(in: .named(PaperList.space)).maxY }
                            .onChange(of: geo.frame(in: .named(PaperList.space)).maxY) { spy.nameEnd = $0 }
                    })
                }
                .padding(.horizontal, Tok.Space.gutter)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressDim())
            .dynamicTypeSize(...Tok.Font.titleMaxScale)
            .accessibilityLabel("\(Labels.label(note))，\(Words.switchTitle)")
            TimeRow(note: note, colors: colors)
        }
        .padding(.top, Tok.Shape.coverBelowBar - Tok.Shape.coverTileLap)
    }
}

/// 標題列下面那一列：左邊多久前改的、右邊完整時間（多米 2026-10-31 要留），底下一條格線
struct TimeRow: View {
    let note: Note
    let colors: Tok.NoteColors

    var body: some View {
        HStack(spacing: Tok.Space.sm) {
            Text(Dates.ago(note.updated))
            Spacer(minLength: Tok.Space.sm)
            Text(Dates.full(note.updated))
        }
        .font(Tok.Font.footnote)
        .foregroundColor(Tok.Col.textSecondary)
        .padding(.horizontal, Tok.Space.gutter)
        .padding(.top, Tok.Space.xs)
        .padding(.bottom, Tok.Space.xl)
        .overlay(alignment: .bottom) { colors.rule.frame(height: Tok.Shape.borderCard) }
    }
}

/// 瀏海（狀態列）有多高：鋪到螢幕最頂的那一層讀不到自己的安全區，直接問視窗
enum Screen {
    static var topInset: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }
            .first?.safeAreaInsets.top ?? 0
    }
}

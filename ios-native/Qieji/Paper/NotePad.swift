import SwiftUI

/// 記事本（1.1 完整版的一種紙）：一整頁文字，不分行。網頁版留下來的文字筆記也是這種。
/// 打開舊的記事本不看買了沒（退款之後照樣打得開、改得了），只有「開新的記事本」要完整版。
/// 鍵盤升起時底下讓出鍵盤的高度，游標不會被蓋住；收鍵盤按右上 ✓
struct NotePad: View {
    @ObservedObject var store: Store
    let note: Note
    var focused: FocusState<Bool>.Binding
    var scale: CGFloat = 1 // 紙上的字級（完整版）

    var body: some View {
        ZStack(alignment: .topLeading) {
            TextEditor(text: Binding(get: { store.book.note(note.id)?.body ?? note.body }, set: { store.setBody(note.id, $0) }))
                .font(Tok.Font.line(scale))
                .lineSpacing(Tok.Font.padLineGap * scale)
                .foregroundColor(Tok.Col.textPrimary)
                .scrollContentBackground(.hidden)
                .focused(focused)
                .accessibilityLabel(Words.padField)
            if note.body.isEmpty {
                // 系統的多行輸入框沒有提示字：自己畫一行、不擋觸控
                Text(Words.padHint)
                    .font(Tok.Font.line(scale))
                    .foregroundColor(Tok.Col.textMuted)
                    .padding(.top, Tok.Space.sm)
                    .padding(.leading, Tok.Space.xs)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, Tok.Space.lg)
        .padding(.top, Tok.Space.xs)
        .padding(.bottom, Tok.Space.xl)
    }
}

import SwiftUI
import UIKit

/// 浮層後面那一層：霧面（毛玻璃）再疊一層很淡的暗；開了「減少透明度」改用實的暗幕
struct Veil: View {
    let solidColor: Color
    @Environment(\.accessibilityReduceTransparency) private var solid

    var body: some View {
        ZStack {
            if !solid {
                Rectangle().fill(.ultraThinMaterial)
            }
            solid ? solidColor : Tok.Col.folderVeilBlur
        }
    }
}

/// 空白畫面：置中的灰色說明，一行講現況、一行講怎麼辦（照 Expo 版 Empty；插圖 2026-11-01 拿掉）
struct EmptyNote: View {
    let lines: [String]

    var body: some View {
        VStack(spacing: Tok.Space.xs) {
            ForEach(lines, id: \.self) { line in
                Text(line)
                    .font(Tok.Font.callout)
                    .foregroundColor(Tok.Col.textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Tok.Space.xxl)
        .padding(.horizontal, Tok.Space.gutter)
        .accessibilityElement(children: .combine)
    }
}

extension Store {
    /// 開新的一張（玉米黃）放進目錄指定的位置；不換紙、不開輸入框。回傳新紙的 id
    func makeNote(hole: String?, after: String?) -> String {
        let now = Clock.now()
        let note = Note.blank(color: "yellow", now: now)
        edit { book in
            book.notes.append(note)
            if hole != nil || after != nil {
                Seats.seatNew(&book, noteID: note.id, now: now, hole: hole, after: after)
            }
        }
        return note.id
    }

    /// 把現在這張紙的一行搬到另一張的最上面。那張滿了回 false（提示已經跳了）；其他情況回 true
    func moveLine(_ itemID: String, to target: String) -> Bool {
        guard let from = current, from.id != target, let dest = book.note(target),
              let item = from.items.first(where: { $0.id == itemID }) else { return true }
        guard Lines.room(dest) > 0 else {
            toast = Toast(text: Words.full(Lines.max))
            return false
        }
        let now = Clock.now()
        let fromID = from.id
        edit { book in
            guard let source = book.index(fromID), let goal = book.index(target) else { return }
            book.notes[source].items.removeAll { $0.id == itemID }
            book.notes[source].updated = now
            book.notes[goal].items.insert(item, at: 0)
            book.notes[goal].updated = now
        }
        toast = Toast(text: Words.movedTo(Labels.label(dest)))
        return true
    }
}

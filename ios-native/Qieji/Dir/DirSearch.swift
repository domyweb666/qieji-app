import SwiftUI
import UIKit

/// 搜尋：直接列出符合的那幾行，上面標是哪一張。點一行或清單名＝打開那張
struct DirSearchList: View {
    @ObservedObject var store: Store
    @ObservedObject var model: DirModel
    @Environment(\.displayScale) private var scale

    var body: some View {
        let needle = Labels.trim(model.query)
        let hits = Seats.searchLines(store.book, query: model.query)
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Tok.Space.zero) {
                ForEach(hits, id: \.note.id) { hit in
                    VStack(alignment: .leading, spacing: Tok.Space.zero) {
                        Button { model.pick(hit.note.id) } label: { head(hit, needle) }
                            .buttonStyle(PressDim())
                            .accessibilityLabel(Words.openNoteVoice(Labels.label(hit.note)))
                        ForEach(Array(hit.lines.enumerated()), id: \.offset) { _, line in
                            Button { model.pick(hit.note.id, line: line.id) } label: { lineRow(line, needle) }
                                .buttonStyle(SearchPress())
                                .accessibilityLabel(Words.searchHitVoice(line.text, Labels.label(hit.note)))
                        }
                    }
                    .padding(.vertical, Tok.Space.sm)
                    Tok.Col.separator.frame(height: 1 / scale)
                }
                if hits.isEmpty {
                    EmptyNote(lines: [Words.searchNone(needle)])
                }
            }
            .padding(.horizontal, Tok.Space.lg)
            .padding(.bottom, Tok.Space.lg)
        }
        .scrollDismissesKeyboard(.immediately)
    }

    private func head(_ hit: Seats.LineHit, _ needle: String) -> some View {
        HStack(spacing: Tok.Space.sm) {
            Circle()
                .fill(Tok.note(hit.note.color).dot)
                .frame(width: Tok.Shape.pageDot, height: Tok.Shape.pageDot)
            DirSearchList.marked(Labels.label(hit.note), hit.title ? needle : "")
                .font(Tok.Font.callout.weight(.semibold))
                .foregroundColor(Tok.Col.textSecondary)
                .lineLimit(1)
            Spacer(minLength: Tok.Space.zero)
        }
        .frame(minHeight: Tok.Shape.hitMin)
        .contentShape(Rectangle())
    }

    private func lineRow(_ line: Item, _ needle: String) -> some View {
        DirSearchList.marked(line.text, needle)
            .font(Tok.Font.body)
            .foregroundColor(line.done ? Tok.Col.textStrike : Tok.Col.textPrimary)
            .strikethrough(line.done)
            .lineLimit(2)
            .multilineTextAlignment(.leading)
            .padding(.vertical, Tok.Space.sm)
            .frame(maxWidth: .infinity, minHeight: Tok.Shape.hitMin, alignment: .leading)
            .padding(.horizontal, Tok.Space.md)
            .contentShape(Rectangle())
    }

    /// 按住一行：底色變淡紫（1.1 搜尋結果的 pressed）
    private struct SearchPress: ButtonStyle {
        func makeBody(configuration: Configuration) -> some View {
            configuration.label.background(
                RoundedRectangle(cornerRadius: Tok.Shape.radiusMd, style: .continuous)
                    .fill(configuration.isPressed ? Tok.Col.pressedFill : Color.clear)
            )
        }
    }

    /// 打中的字用茄紫粗體；行很長、打中的字在後面時，從它前面幾個字開始顯示（前面補 …）
    static func marked(_ text: String, _ needle: String) -> Text {
        let flat = text.replacingOccurrences(of: "\n", with: " ")
        guard !needle.isEmpty, let range = flat.range(of: needle, options: .caseInsensitive) else { return Text(flat) }
        let lead = 12
        let before = flat[..<range.lowerBound]
        let head = before.count > lead ? "…" + String(before.suffix(lead)) : String(before)
        return Text(head) + Text(String(flat[range])).foregroundColor(Tok.Col.accent).fontWeight(.semibold)
            + Text(String(flat[range.upperBound...]))
    }
}

/// 搬行模式的搜尋：找要搬到哪一張，照舊列磚，所有頁的紙一起找、上下捲，不分頁、不能拖
struct DirPickGrid: View {
    @ObservedObject var store: Store
    @ObservedObject var model: DirModel

    var body: some View {
        let notes = Seats.seatedNotes(store.book, query: model.query)
        let columns = Array(repeating: GridItem(.fixed(model.cellWidth), spacing: Tok.Space.zero), count: DirMetrics.cols)
        ScrollView {
            LazyVGrid(columns: columns, spacing: Tok.Shape.tileRowGap) {
                ForEach(notes) { note in
                    Button { model.pick(note.id) } label: {
                        DirTileFace(
                            entry: Seats.Entry(id: note.id, note: note, notes: [note]),
                            cell: model.cellWidth, current: note.id == store.currentID
                        )
                    }
                    .accessibilityLabel(Labels.label(note))
                }
            }
            .padding(.top, Tok.Space.sm + Tok.Space.md)
            if notes.isEmpty {
                EmptyNote(lines: [Words.searchNoneNote(Labels.trim(model.query))])
            }
        }
        .scrollDismissesKeyboard(.immediately)
    }
}

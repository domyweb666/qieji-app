import SwiftUI

/// 照自己的寬，最多這麼寬（系統的 frame(maxWidth:) 會把空著的地方也佔走，刪掉的行只剩半排字）
private struct AtMost: Layout {
    let width: CGFloat

    private func room(_ proposal: ProposedViewSize) -> ProposedViewSize {
        ProposedViewSize(width: min(proposal.width ?? width, width), height: proposal.height)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache _: inout ()) -> CGSize {
        subviews.first?.sizeThatFits(room(proposal)) ?? .zero
    }

    func placeSubviews(in bounds: CGRect, proposal _: ProposedViewSize, subviews: Subviews, cache _: inout ()) {
        subviews.first?.place(at: bounds.origin, proposal: ProposedViewSize(bounds.size))
    }
}

/// 「最近刪除」（照 1.1 trash.tsx）：從目錄最下面那列推進來。上面是刪掉的清單（一張一張），下面是各張紙刪掉的行（帶那張紙的名字）。
/// 點一則跳系統的動作表單：還原／永久刪除。右上 ⋯ 裡「清空最近刪除」。放滿 30 天自動清，講規則、不在每則上顯示剩幾天（那是壓力來源）。
/// 上鎖的紙刪掉的行不列（沒驗過不露內容）
struct TrashPage: View {
    @ObservedObject var store: Store
    @State private var askNote: Note?
    @State private var askLine: LineAsk?
    @State private var askEmpty = false

    struct LineAsk: Identifiable {
        let note: Note
        let line: Item
        var id: String {
            line.id
        }
    }

    var body: some View {
        let dead = store.book.notes.filter(\.deleted).sorted { ($0.deletedAt ?? 0) > ($1.deletedAt ?? 0) }
        let lines = store.book.notes.filter { !$0.deleted && !$0.locked }
            .flatMap { note in note.bin.map { LineAsk(note: note, line: $0) } }
            .sorted { ($0.line.binnedAt ?? 0) > ($1.line.binnedAt ?? 0) }
        let total = dead.count + lines.count
        PageScaffold(title: Words.trash, trailing: {
            if total > 0 {
                Menu {
                    Button(role: .destructive) { askEmpty = true } label: {
                        Label(Words.emptyTrash(total), systemImage: "trash")
                    }
                } label: {
                    PageBarIcon(symbol: "ellipsis")
                }
                .accessibilityLabel(Words.menu)
            }
        }, content: {
            if total > 0 {
                Text(Words.trashRule)
                    .font(Tok.Font.footnote)
                    .foregroundColor(Tok.Col.textSecondary)
                    .padding(.top, Tok.Space.sm)
                    .padding(.leading, Tok.Space.lg)
            }
            if !dead.isEmpty {
                PageGroup(title: Words.trashNotes) {
                    ForEach(Array(dead.enumerated()), id: \.element.id) { index, note in
                        PageRow(first: index == 0, inset: rowInset, action: { askNote = note }, lead: {
                            ColorDot(key: note.color)
                            Text(Labels.label(note)).font(Tok.Font.body).foregroundColor(Tok.Col.textPrimary).lineLimit(1)
                        }, trail: { EmptyView() })
                    }
                }
            }
            if !lines.isEmpty {
                PageGroup(title: Words.trashLines) {
                    ForEach(Array(lines.enumerated()), id: \.element.id) { index, ask in
                        PageRow(first: index == 0, inset: rowInset, action: { askLine = ask }, lead: {
                            ColorDot(key: ask.note.color)
                            Text(ask.line.text).font(Tok.Font.body).foregroundColor(Tok.Col.textPrimary).lineLimit(2)
                        }, trail: {
                            AtMost(width: Tok.Shape.trashDetailMax) {
                                Text(Labels.label(ask.note))
                                    .font(Tok.Font.footnote)
                                    .foregroundColor(Tok.Col.textSecondary)
                                    .lineLimit(1)
                            }
                        })
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(Words.lineFrom(ask.line.text, Labels.label(ask.note)))
                    }
                }
            }
            if total == 0 {
                EmptyNote(lines: [Words.trashEmpty, Words.trashEmptyTip])
            }
        })
        .confirmationDialog(askNote.map { Labels.label($0) } ?? "", isPresented: noteAsking, titleVisibility: .visible) {
            if let note = askNote {
                Button(Words.restore) {
                    store.restoreNote(note.id) // 目錄裡它刪掉時留下的空位還在，就站回那格
                    store.toast = Store.Toast(text: Words.restored)
                }
                Button(Words.deleteForever, role: .destructive) { store.deleteForever(note.id) }
            }
            Button(Words.cancel, role: .cancel) {}
        }
        .confirmationDialog(askLine?.line.text ?? "", isPresented: lineAsking, titleVisibility: .visible) {
            if let ask = askLine {
                Button(Words.restoreTo(Labels.label(ask.note))) { restore(ask) }
                Button(Words.deleteForever, role: .destructive) {
                    store.deleteLineForever(noteID: ask.note.id, itemID: ask.line.id)
                }
            }
            Button(Words.cancel, role: .cancel) {}
        }
        .alert(Words.emptyTrashAsk, isPresented: $askEmpty) {
            Button(Words.cancel, role: .cancel) {}
            Button(Words.deleteForever, role: .destructive) { store.emptyTrash() }
        }
    }

    /// 線從字起算：色點寬＋間距
    private var rowInset: CGFloat {
        Tok.Space.lg + Tok.Shape.dot + Tok.Space.md
    }

    private var noteAsking: Binding<Bool> {
        Binding(get: { askNote != nil }, set: {
            if !$0 {
                askNote = nil
            }
        })
    }

    private var lineAsking: Binding<Bool> {
        Binding(get: { askLine != nil }, set: {
            if !$0 {
                askLine = nil
            }
        })
    }

    /// 還原一行到它那張紙的最上面；那張滿了就說一聲、不還原
    private func restore(_ ask: LineAsk) {
        guard let note = store.book.note(ask.note.id), Lines.room(note) > 0 else {
            store.toast = Store.Toast(text: Words.full(Lines.max))
            return
        }
        store.restoreLine(noteID: ask.note.id, itemID: ask.line.id)
        store.toast = Store.Toast(text: Words.restored)
    }
}

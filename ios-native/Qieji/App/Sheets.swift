import SwiftUI

/// 切換清單：點左上清單名升起。新的一張、釘選的、最近開過的；最下面「管理所有清單」打開目錄（搜尋、排磚、資料夾都在那裡）。
struct SwitchSheet: View {
    @ObservedObject var store: Store
    let close: () -> Void
    var manage: () -> Void = {}

    var body: some View {
        NavigationStack {
            List {
                let lists = Seats.switchList(store.book, recent: store.disk?.recent ?? [])
                Button {
                    store.newNote()
                    close()
                } label: {
                    Label(Words.newNote, systemImage: "plus")
                        .font(Tok.Font.body)
                        .foregroundColor(Tok.Col.accent)
                }
                if !lists.pinned.isEmpty {
                    Section(Words.pinnedGroup) { ForEach(lists.pinned) { row($0) } }
                }
                if !lists.recent.isEmpty {
                    Section(Words.recentGroup) { ForEach(lists.recent) { row($0) } }
                }
                Section {
                    Button(action: manage) {
                        HStack {
                            Label(Words.manageAll, systemImage: "square.grid.2x2")
                            Spacer()
                            Image(systemName: "chevron.right").font(Tok.Font.footnote)
                        }
                        .font(Tok.Font.body)
                        .foregroundColor(Tok.Col.textPrimary)
                        .frame(minHeight: Tok.Shape.hitMin)
                    }
                }
            }
            .navigationTitle(Words.switchTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(Words.done, action: close) } }
        }
        .tint(Tok.Col.accent)
    }

    private func row(_ note: Note) -> some View {
        Button {
            store.open(note.id)
            close()
        } label: {
            HStack(spacing: Tok.Space.md) {
                NoteTile(note: note, side: Tok.Shape.noteIcon)
                Text(Labels.pickLabel(note))
                    .font(Tok.Font.body)
                    .foregroundColor(Tok.Col.textPrimary)
                    .lineLimit(1)
                Spacer()
                if note.pinned {
                    Image(systemName: "pin.fill").font(Tok.Font.footnote).foregroundColor(Tok.Col.textSecondary)
                }
                if note.id == store.currentID {
                    Image(systemName: "checkmark").font(Tok.Font.headline).foregroundColor(Tok.Col.accent)
                }
            }
            .frame(minHeight: Tok.Shape.hitMin)
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { store.trashNote(note.id) } label: { Label(Words.delete, systemImage: "trash") }
        }
        .swipeActions(edge: .leading) {
            Button { store.togglePin(note.id) } label: {
                Label(note.pinned ? Words.unpin : Words.pin, systemImage: note.pinned ? "pin.slash" : "pin")
            }
            .tint(Tok.Col.accent)
        }
    }
}

/// 最近刪除：刪掉的清單、刪掉的行。放滿 30 天自動清掉。
struct TrashView: View {
    @ObservedObject var store: Store
    let close: () -> Void
    @State private var confirmEmpty = false

    var body: some View {
        let dead = store.book.notes.filter(\.deleted).sorted { ($0.deletedAt ?? 0) > ($1.deletedAt ?? 0) }
        let withBin = store.book.notes.filter { !$0.deleted && !$0.bin.isEmpty && !$0.locked }
        NavigationStack {
            List {
                if dead.isEmpty, withBin.isEmpty {
                    // 不是一列資料：拿掉格子的底和線，置中擺在清單裡
                    EmptyNote(lines: [Words.trashEmpty, Words.trashEmptyTip])
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
                if !dead.isEmpty {
                    Section(Words.trashNotes) { ForEach(dead) { noteRow($0) } }
                }
                ForEach(withBin) { note in
                    Section("\(Words.trashLines)・\(Labels.pickLabel(note))") {
                        ForEach(note.bin) { lineRow(note, $0) }
                    }
                }
                if !dead.isEmpty || !withBin.isEmpty {
                    Section {} footer: { Text(Words.trashNote).font(Tok.Font.footnote) }
                }
            }
            .navigationTitle(Words.trash)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button(Words.done, action: close) }
                ToolbarItem(placement: .cancellationAction) {
                    if !dead.isEmpty || !withBin.isEmpty {
                        Button(Words.deleteForever, role: .destructive) { confirmEmpty = true }
                    }
                }
            }
            .confirmationDialog(Words.deleteForever, isPresented: $confirmEmpty, titleVisibility: .visible) {
                Button(Words.deleteForever, role: .destructive) { store.emptyTrash() }
                Button(Words.cancel, role: .cancel) {}
            }
        }
        .tint(Tok.Col.accent)
    }

    private func noteRow(_ note: Note) -> some View {
        HStack(spacing: Tok.Space.md) {
            NoteTile(note: note, side: Tok.Shape.noteIcon)
            Text(Labels.pickLabel(note)).font(Tok.Font.body).foregroundColor(Tok.Col.textPrimary).lineLimit(1)
            Spacer()
            Button(Words.restore) { store.restoreNote(note.id) }
                .font(Tok.Font.callout.weight(.semibold))
                .buttonStyle(.borderless)
        }
        .frame(minHeight: Tok.Shape.hitMin)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { store.deleteForever(note.id) } label: {
                Label(Words.deleteForever, systemImage: "trash")
            }
        }
    }

    private func lineRow(_ note: Note, _ line: Item) -> some View {
        HStack(spacing: Tok.Space.md) {
            Text(line.text).font(Tok.Font.body).foregroundColor(Tok.Col.textPrimary).lineLimit(2)
            Spacer()
            Button(Words.restore) { store.restoreLine(noteID: note.id, itemID: line.id) }
                .font(Tok.Font.callout.weight(.semibold))
                .buttonStyle(.borderless)
        }
        .frame(minHeight: Tok.Shape.hitMin)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { store.deleteLineForever(noteID: note.id, itemID: line.id) } label: {
                Label(Words.deleteForever, systemImage: "trash")
            }
        }
    }
}

/// 設定：這一版只有版本資訊。完整版、iCloud 同步、外觀、字級等功能搬過來之後再接。
struct SettingsView: View {
    let close: () -> Void

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Text(Words.version).font(Tok.Font.body)
                        Spacer()
                        Text(SettingsView.versionText).font(Tok.Font.body).foregroundColor(Tok.Col.textSecondary)
                    }
                }
            }
            .navigationTitle(Words.settings)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(Words.done, action: close) } }
        }
        .tint(Tok.Col.accent)
    }

    static var versionText: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? ""
        let build = info?["CFBundleVersion"] as? String ?? ""
        return "\(short) (\(build))"
    }
}

/// 上鎖的紙：Face ID 解鎖還沒搬到這一版，內容先不顯示（名字看得到，可以換到別張）
struct LockedPaper: View {
    let note: Note
    let onTitle: () -> Void

    var body: some View {
        VStack(spacing: Tok.Space.lg) {
            Button(action: onTitle) {
                HStack(spacing: Tok.Space.sm) {
                    NoteTile(note: note, side: Tok.Shape.titleIcon)
                    Text(Labels.label(note))
                        .font(Tok.Font.title)
                        .foregroundColor(Tok.Col.textPrimary)
                        .lineLimit(1)
                    Image(systemName: "chevron.down")
                        .font(Tok.Font.footnote.weight(.semibold))
                        .foregroundColor(Tok.Col.textSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Spacer()
            Image(systemName: "lock.fill")
                .font(Tok.Font.title)
                .foregroundColor(Tok.Col.textSecondary)
            Text(Words.lockedNote)
                .font(Tok.Font.callout)
                .foregroundColor(Tok.Col.textMuted)
                .multilineTextAlignment(.center)
            Spacer()
            Spacer()
        }
        .padding(Tok.Space.lg)
        .background(Tok.note(note.color).paper.ignoresSafeArea())
    }
}

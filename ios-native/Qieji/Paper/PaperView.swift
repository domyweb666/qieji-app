import SwiftUI
import UIKit

/// 一張紙：最上面名字和 ⋯，下面一行一行，右下 ＋ 記一行。
struct PaperView: View {
    @ObservedObject var store: Store
    let note: Note
    var onTitle: () -> Void = {}
    var onRoute: (Route) -> Void = { _ in }
    var onMoveLine: (String) -> Void = { _ in }

    @StateObject private var touch = ListTouch()
    @State private var editingID: String?
    @State private var focus: FocusAsk?
    @State private var menuID: String?
    @State private var composing = false
    @State private var draft = ""
    @State private var renaming = false
    @State private var newName = ""
    @State private var glyphing = false
    @State private var newGlyph = ""
    @FocusState private var composerFocused: Bool

    var body: some View {
        let colors = Tok.note(note.color)
        VStack(spacing: Tok.Space.zero) {
            PaperHeader(
                store: store, note: note, colors: colors, onTitle: onTitle, onRoute: onRoute,
                onRename: {
                    newName = note.title
                    renaming = true
                },
                onGlyph: {
                    newGlyph = note.glyph ?? ""
                    glyphing = true
                }
            )
            PaperList(
                store: store, touch: touch, note: note,
                editingID: $editingID, focus: $focus, menuID: $menuID, colors: colors
            )
        }
        .background(colors.paper.ignoresSafeArea())
        .overlay(alignment: .bottomTrailing) { addButton }
        .overlay(alignment: .bottom) { composer }
        .confirmationDialog("", isPresented: menuShown, titleVisibility: .hidden) { lineMenu }
        .alert(Words.rename, isPresented: $renaming) {
            TextField(Words.renameHint, text: $newName)
            Button(Words.done) { store.rename(note.id, newName) }
            Button(Words.cancel, role: .cancel) {}
        }
        .alert(Words.glyphEdit, isPresented: $glyphing) {
            TextField(Words.glyphHint, text: $newGlyph)
            Button(Words.done) {
                if let problem = Labels.glyphProblem(newGlyph) {
                    Haptic.reject()
                    store.toast = Store.Toast(text: problem)
                } else {
                    store.setGlyph(note.id, newGlyph)
                }
            }
            Button(Words.cancel, role: .cancel) {}
        }
        .onAppear { openIfAsked() }
        .onChange(of: store.composeAsk) { _ in openIfAsked() }
        .onChange(of: composerFocused) { focused in
            if !focused, composing {
                commit()
            }
        }
        .onChange(of: note.id) { _ in
            editingID = nil
            composing = false
        }
    }

    // MARK: 右下 ＋ 與輸入框

    /// 開了新的一張、或控制中心按了「記一行」：輸入框直接升起
    private func openIfAsked() {
        guard store.takeCompose() else {
            return
        }
        editingID = nil
        composing = true
        // 紙剛出現的那一格還對不到焦，等它掛好
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Motion.composerFocusDelay) {
            composerFocused = true
        }
    }

    @ViewBuilder private var addButton: some View {
        if !composing, editingID == nil, touch.dragID == nil {
            Button {
                Haptic.add()
                composing = true
                composerFocused = true
            } label: {
                Image(systemName: "plus")
                    .font(Tok.Font.fabSymbol)
                    .foregroundColor(Tok.Col.fabIcon)
                    .frame(width: Tok.Shape.fab, height: Tok.Shape.fab)
                    .background(Circle().fill(Tok.Col.accent))
                    .shadow(
                        color: Tok.Col.shadow.opacity(Tok.Shape.shadowStrong),
                        radius: Tok.Shape.shadowRadius, x: 0, y: Tok.Shape.shadowY
                    )
            }
            .accessibilityLabel(Words.addLine)
            .padding(.trailing, Tok.Space.lg)
            .padding(.bottom, Tok.Space.sm)
            .transition(.opacity)
        }
    }

    /// 輸入框：貼在鍵盤上面。Return＝換行；✓＝記下來、收起；點別的地方也一樣記下來，字不會丟
    @ViewBuilder private var composer: some View {
        if composing {
            HStack(alignment: .bottom, spacing: Tok.Space.xs) {
                TextField(Words.composerHint, text: $draft, axis: .vertical)
                    .font(Tok.Font.body)
                    .foregroundColor(Tok.Col.textPrimary)
                    .lineLimit(1 ... 8)
                    .focused($composerFocused)
                    .padding(.vertical, Tok.Space.md)
                    .padding(.leading, Tok.Space.lg)
                Button(action: commit) {
                    Image(systemName: "checkmark")
                        .font(Tok.Font.headline)
                        .foregroundColor(Tok.Col.accent)
                        .frame(width: Tok.Shape.hitMin, height: Tok.Shape.hitMin)
                }
                .accessibilityLabel(Words.commit)
                .padding(.trailing, Tok.Space.xs)
            }
            .background(RoundedRectangle(cornerRadius: Tok.Shape.radiusLg, style: .continuous).fill(Tok.Col.surface))
            .shadow(
                color: Tok.Col.shadow.opacity(Tok.Shape.shadowSoft),
                radius: Tok.Shape.shadowRadius, x: 0, y: Tok.Shape.shadowY
            )
            .padding(.horizontal, Tok.Space.md)
            .padding(.bottom, Tok.Space.sm)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private func commit() {
        let text = draft
        draft = ""
        composing = false
        composerFocused = false
        if store.addTop(text) != nil {
            touch.scrollToTop()
        }
    }

    // MARK: 按住一行的選單

    private var menuShown: Binding<Bool> {
        Binding(get: { menuID != nil }, set: {
            if !$0 {
                menuID = nil
            }
        })
    }

    @ViewBuilder private var lineMenu: some View {
        if let id = menuID, let item = note.items.first(where: { $0.id == id }) {
            Button(item.done ? Words.unstrike : Words.strike) { store.toggle(id) }
            Button(Words.copy) { UIPasteboard.general.string = item.text }
            if !Labels.trim(item.text).isEmpty {
                Button(Words.moveTo) { onMoveLine(id) }
            }
            Button(Words.deleteLine, role: .destructive) { store.binLine(id) }
            Button(Words.cancel, role: .cancel) {}
        }
    }
}

/// 紙最上面：清單名（點了換一張）、⋯、修改時間
struct PaperHeader: View {
    @ObservedObject var store: Store
    let note: Note
    let colors: Tok.NoteColors
    let onTitle: () -> Void
    let onRoute: (Route) -> Void
    let onRename: () -> Void
    let onGlyph: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Tok.Space.xs) {
            HStack(alignment: .center, spacing: Tok.Space.sm) {
                Button(action: onTitle) {
                    HStack(spacing: Tok.Space.sm) {
                        NoteTile(note: note, side: Tok.Shape.titleIcon)
                        Text(Labels.label(note))
                            .font(Tok.Font.title)
                            .foregroundColor(Tok.Col.textPrimary)
                            .lineLimit(1)
                            .dynamicTypeSize(...Tok.Font.titleMaxScale)
                        Image(systemName: "chevron.down")
                            .font(Tok.Font.footnote.weight(.semibold))
                            .foregroundColor(Tok.Col.textSecondary)
                    }
                }
                .accessibilityHint(Words.switchTitle)
                Spacer(minLength: Tok.Space.sm)
                Menu { PaperMenu(store: store, note: note, onRoute: onRoute, onRename: onRename, onGlyph: onGlyph) } label: {
                    Image(systemName: "ellipsis")
                        .font(Tok.Font.headline)
                        .foregroundColor(Tok.Col.textPrimary)
                        .frame(width: Tok.Shape.hitMin, height: Tok.Shape.hitMin)
                }
                .accessibilityLabel(Words.more)
            }
            Text(Dates.row(note.updated))
                .font(Tok.Font.footnote)
                .foregroundColor(Tok.Col.textSecondary)
        }
        .padding(.leading, Tok.Space.lg)
        .padding(.trailing, Tok.Space.xs)
        .padding(.top, Tok.Space.sm)
        .padding(.bottom, Tok.Space.sm)
        .overlay(alignment: .bottom) { colors.rule.frame(height: Tok.Shape.hairline) }
    }
}

/// ⋯ 選單：顏色、改名字、釘選、清掉劃掉的行、刪除這張、最近刪除、設定
struct PaperMenu: View {
    @ObservedObject var store: Store
    let note: Note
    let onRoute: (Route) -> Void
    let onRename: () -> Void
    let onGlyph: () -> Void

    var body: some View {
        Picker(Words.colorTitle, selection: Binding(get: { note.color }, set: { store.setColor(note.id, $0) })) {
            ForEach(NoteColor.keys, id: \.self) { key in
                Text(NoteColor.names[key].map { "\($0.name)（\($0.hue)）" } ?? key).tag(key)
            }
        }
        .pickerStyle(.menu)
        Button(action: onRename) { Label(Words.rename, systemImage: "pencil") }
        Button(action: onGlyph) { Label(Words.glyphEdit, systemImage: "character") }
        Button { store.togglePin(note.id) } label: {
            Label(note.pinned ? Words.unpin : Words.pin, systemImage: note.pinned ? "pin.slash" : "pin")
        }
        if note.items.contains(where: \.done) {
            Button { store.clearDone(note.id) } label: { Label(Words.clearDone, systemImage: "checkmark.circle") }
        }
        Divider()
        Button { onRoute(.trash) } label: { Label(Words.trash, systemImage: "trash") }
        Button { onRoute(.settings) } label: { Label(Words.settings, systemImage: "gearshape") }
        Divider()
        Button(role: .destructive) { store.trashNote(note.id) } label: { Label(Words.deleteNote, systemImage: "trash") }
    }
}

/// 小方磚：紙的顏色＋正中間一個字（目錄、切換清單、清單名旁邊共用）
struct NoteTile: View {
    let note: Note
    let side: CGFloat

    var body: some View {
        let colors = Tok.note(note.color)
        RoundedRectangle(cornerRadius: side * Tok.Shape.tileRadiusRatio, style: .continuous)
            .fill(colors.dot)
            .frame(width: side, height: side)
            .overlay(
                Text(Labels.glyph(note))
                    .font(Tok.Font.glyph(side))
                    .foregroundColor(colors.ink)
                    .minimumScaleFactor(0.5)
            )
            .accessibilityHidden(true)
    }
}

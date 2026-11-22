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
    @StateObject private var keyboard = KeyboardWatch()
    @State private var editingID: String?
    @State private var focus: FocusAsk?
    @State private var rowMenu: RowMenuAsk?
    @State private var composing = false
    @State private var draft = ""
    @State private var renaming = false
    @State private var pinChoices: [Note] = [] // 釘滿時問要換掉哪一張（有值＝問著）
    @FocusState private var composerFocused: Bool

    var body: some View {
        let colors = Tok.note(note.color)
        VStack(spacing: Tok.Space.zero) {
            PaperHeader(
                store: store, note: note, colors: colors, renaming: $renaming,
                showDone: keyboard.up && (editingID != nil || renaming),
                onTitle: onTitle, onDone: doneTyping, onRoute: onRoute,
                onRename: {
                    editingID = nil
                    composing = false
                    renaming = true
                },
                onPinFull: { pinChoices = $0 }
            )
            PaperList(
                store: store, touch: touch, note: note,
                editingID: $editingID, focus: $focus, colors: colors,
                onMenu: { openRowMenu($0, bottom: $1) }
            )
            // 釘滿 5 張再釘：一步問要換掉哪一張（1.1 pin.ts），換完提示條可以復原
            .confirmationDialog(Words.pinFullTitle(Seats.pinMax), isPresented: pinAsking, titleVisibility: .visible) {
                ForEach(pinChoices) { other in
                    Button(Labels.pickLabel(other)) { store.swapPin(note.id, out: other.id) }
                }
                Button(Words.cancel, role: .cancel) {}
            } message: {
                Text(Words.pinSwapAsk)
            }
        }
        .background(colors.paper.ignoresSafeArea())
        .overlay(alignment: .bottomTrailing) { addButton }
        .overlay(alignment: .bottom) { composer }
        .overlay {
            if let ask = rowMenu {
                RowMenu(items: rowItems(ask.id), rowBottom: ask.bottom, close: closeRowMenu)
            }
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
            renaming = false
        }
    }

    private var pinAsking: Binding<Bool> {
        Binding(get: { !pinChoices.isEmpty }, set: {
            if !$0 {
                pinChoices = []
            }
        })
    }

    /// 右上 ✓：誰在打字都收起來
    private func doneTyping() {
        editingID = nil
        renaming = false
        KeyboardWatch.dismiss()
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
        if !composing, editingID == nil, touch.dragID == nil, rowMenu == nil {
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

    /// 按住一行：先收鍵盤，選單卡接在那一行下面（1.1 openRowMenu）
    private func openRowMenu(_ id: String, bottom: CGFloat) {
        editingID = nil
        KeyboardWatch.dismiss()
        withAnimation(Tok.Motion.menuPopIn) { rowMenu = RowMenuAsk(id: id, bottom: bottom) }
    }

    private func closeRowMenu() {
        withAnimation(Tok.Motion.menuPopOut) { rowMenu = nil }
    }

    /// 項目照 1.1 rowActs：劃掉／恢復、搬到…、複製、刪除；空行只剩刪除
    private func rowItems(_ id: String) -> [MenuItem] {
        guard let item = note.items.first(where: { $0.id == id }) else { return [] }
        let remove = MenuItem(label: Words.delete, icon: "trash", destructive: true) { fadeThenBin(id) }
        guard !Labels.trim(item.text).isEmpty else { return [remove] }
        return [
            MenuItem(label: item.done ? Words.unstrike : Words.strike, icon: item.done ? "arrow.uturn.backward" : "strikethrough") {
                store.toggle(id)
                Haptic.tick()
            },
            MenuItem(label: Words.moveTo, icon: "arrow.turn.up.right") { onMoveLine(id) },
            MenuItem(label: Words.copy, icon: "doc.on.doc") {
                UIPasteboard.general.string = item.text
                store.toast = Store.Toast(text: Words.copied)
            },
            remove,
        ]
    }

    /// 從選單刪一行：先淡出（0.15 秒），淡完才拿掉
    private func fadeThenBin(_ id: String) {
        withAnimation(Tok.Motion.fade) { _ = touch.fading.insert(id) }
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Motion.fadeSeconds) {
            store.binLine(id)
            touch.fading.remove(id)
        }
    }
}

/// 按住了哪一行、那一行在螢幕上的底邊
struct RowMenuAsk: Equatable {
    let id: String
    let bottom: CGFloat
}

/// 紙最上面（照 1.1.1）：左邊清單名的小膠囊（點了切換清單）、右邊 ⋯；
/// 下面一列左邊「多久前」、右邊完整時間，底下一條格線。名字離左邊 20，跟時間、每一行的字對齊
struct PaperHeader: View {
    @ObservedObject var store: Store
    let note: Note
    let colors: Tok.NoteColors
    @Binding var renaming: Bool
    var showDone = false
    let onTitle: () -> Void
    let onDone: () -> Void
    let onRoute: (Route) -> Void
    let onRename: () -> Void
    let onPinFull: ([Note]) -> Void
    @FocusState private var titleFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Tok.Space.zero) {
            HStack(spacing: Tok.Space.sm) {
                if renaming {
                    titleField
                } else {
                    titlePill
                }
                Spacer(minLength: Tok.Space.sm)
                Menu { PaperMenu(store: store, note: note, onRoute: onRoute, onRename: onRename, onPinFull: onPinFull) } label: {
                    Image(systemName: "ellipsis")
                        .font(Tok.Font.barIcon)
                        .foregroundColor(Tok.Col.textPrimary)
                        .frame(width: Tok.Shape.hitMin, height: Tok.Shape.hitMin)
                        .frost(Circle(), interactive: true)
                }
                .accessibilityLabel(Words.more)
                // 打字時 ⋯ 右邊多一顆茄紫 ✓（照 iOS 提醒事項），⋯ 用鍵盤的時鐘滑過去讓位
                if showDone {
                    DoneButton(action: onDone).transition(.opacity)
                }
            }
            .animation(Tok.Motion.keyboard, value: showDone)
            .padding(.leading, Tok.Space.lg)
            .padding(.trailing, Tok.Space.gutter)
            .padding(.top, Tok.Space.sm)
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

    /// ⋯「改名字」：名字原地變成可以打字（1.1：多行輸入框才不會切到 28 點中文的字頂；Return＝改好收起，貼上的換行換成空格）
    private var titleField: some View {
        TextField("", text: titleText, prompt: Text(Words.renameHint).foregroundColor(Tok.Col.textMuted), axis: .vertical)
            .font(Tok.Font.title)
            .foregroundColor(Tok.Col.textPrimary)
            .submitLabel(.done)
            .focused($titleFocused)
            .frame(minHeight: Tok.Shape.hitMin)
            .padding(.horizontal, Tok.Space.xs)
            .dynamicTypeSize(...Tok.Font.titleMaxScale)
            .accessibilityLabel(Words.titleField)
            .onAppear { DispatchQueue.main.async { titleFocused = true } }
            .onChange(of: titleFocused) { focused in
                if !focused {
                    renaming = false
                }
            }
    }

    private var titleText: Binding<String> {
        Binding(get: { note.title }, set: { value in
            guard value.contains("\n") else {
                store.setTitle(note.id, value)
                return
            }
            let typedReturn = value.hasSuffix("\n") && (value as NSString).length == (note.title as NSString).length + 1
            store.setTitle(note.id, typedReturn ? String(value.dropLast()) : value)
            if typedReturn {
                titleFocused = false
            }
        })
    }

    /// 清單名的小膠囊（2026-11-04 多米定案，大字那種拿掉）：茄紫細框、小方磚＋名字＋▾，寬度照內容、太長就截。沒取名用灰字
    private var titlePill: some View {
        let named = !Labels.trim(note.title).isEmpty
        return Button(action: onTitle) {
            HStack(spacing: Tok.Space.sm) {
                NoteTile(note: note, side: Tok.Shape.titleIcon)
                Text(Labels.label(note))
                    .font(Tok.Font.headline)
                    .foregroundColor(named ? Tok.Col.textPrimary : Tok.Col.textSecondary)
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(Tok.Font.chevron)
                    .foregroundColor(Tok.Col.textSecondary)
            }
            .padding(.leading, Tok.Space.sm)
            .padding(.trailing, Tok.Space.md)
            .frame(minHeight: Tok.Shape.hitMin)
            .overlay(Capsule().strokeBorder(Tok.Col.accent, lineWidth: Tok.Shape.pillBorder))
            .contentShape(Capsule())
        }
        .buttonStyle(PressDim())
        .dynamicTypeSize(...Tok.Font.titleMaxScale)
        .padding(.horizontal, Tok.Space.xs)
        .accessibilityLabel("\(Labels.label(note))，\(Words.switchTitle)")
    }
}

/// ⋯ 選單（照 1.1.1）：最上面一排九色（iOS 17 起是色點，16 是子選單）；改名字、釘選、分享、複製全文、
/// 「清單」那組（上下順序反轉、全部恢復、清掉劃掉的行）、設定、刪除這張
struct PaperMenu: View {
    @ObservedObject var store: Store
    let note: Note
    let onRoute: (Route) -> Void
    let onRename: () -> Void
    let onPinFull: ([Note]) -> Void

    var body: some View {
        colors
        Button(action: onRename) { Label(Words.rename, systemImage: "pencil") }
        Button {
            if let pins = store.pinOrAsk(note.id) {
                onPinFull(pins)
            }
        } label: {
            Label(note.pinned ? Words.unpin : Words.pin, systemImage: note.pinned ? "pin.slash" : "pin")
        }
        ShareLink(item: shareText) { Label(Words.share, systemImage: "square.and.arrow.up") }
        Button {
            UIPasteboard.general.string = shareText
            store.toast = Store.Toast(text: Words.copied)
        } label: { Label(Words.copyAll, systemImage: "doc.on.doc") }
        if listGroup {
            Section {
                if note.items.count >= 2 {
                    Button { store.reverseLines(note.id) } label: { Label(Words.reverse, systemImage: "arrow.up.arrow.down") }
                }
                if anyDone {
                    Button { store.unstrikeAll(note.id) } label: { Label(Words.unstrikeAll, systemImage: "arrow.uturn.backward") }
                    Button { store.clearDone(note.id) } label: { Label(Words.clearDone, systemImage: "eraser") }
                }
            }
        }
        Button { onRoute(.settings) } label: { Label(Words.settings, systemImage: "gearshape") }
        Button(role: .destructive) { store.trashNote(note.id, reopen: true) } label: { Label(Words.deleteNote, systemImage: "trash") }
    }

    private var anyDone: Bool {
        note.items.contains(where: \.done)
    }

    private var listGroup: Bool {
        !note.isText && (note.items.count >= 2 || anyDone)
    }

    /// 分享、複製全文：名字空一行，再來每行編號
    private var shareText: String {
        (note.title.isEmpty ? "" : note.title + "\n\n") + Labels.plain(note)
    }

    private var colorBinding: Binding<String> {
        Binding(get: { note.color }, set: { key in
            guard key != note.color else { return }
            store.setColor(note.id, key)
            Haptic.tick() // 選單不關，震一下才知道有換到
        })
    }

    @ViewBuilder private var colors: some View {
        if #available(iOS 17.0, *) {
            Picker(Words.colorTitle, selection: colorBinding) {
                ForEach(NoteColor.keys, id: \.self) { key in
                    Label(ColorName.voice(key), systemImage: "circle.fill")
                        .tint(Tok.note(key).dot)
                        .tag(key)
                }
            }
            .pickerStyle(.palette)
        } else {
            Picker(Words.colorTitle, selection: colorBinding) {
                ForEach(NoteColor.keys, id: \.self) { key in
                    Text(ColorName.voice(key)).tag(key)
                }
            }
            .pickerStyle(.menu)
        }
    }
}

/// 顏色的名字（VoiceOver、選單用）：「紫色（茄子）」，跟 1.1 Swatches 一樣
enum ColorName {
    static func voice(_ key: String) -> String {
        NoteColor.names[key].map { "\($0.hue)（\($0.name)）" } ?? key
    }
}

/// 小方磚：紙的顏色＋正中間一個字（切換清單、清單名旁邊共用）。外面一圈 1 點紙的格線色（1.1 NoteIcon），白蘿蔔才看得出邊
struct NoteTile: View {
    let note: Note
    let side: CGFloat

    var body: some View {
        let colors = Tok.note(note.color)
        let shape = RoundedRectangle(cornerRadius: side * Tok.Shape.tileRadiusRatio)
        shape
            .fill(colors.dot)
            .frame(width: side, height: side)
            .overlay(
                Text(Labels.glyph(note))
                    .font(Tok.Font.glyph(side))
                    .foregroundColor(colors.ink)
                    .minimumScaleFactor(0.5)
            )
            .overlay(shape.strokeBorder(colors.rule, lineWidth: Tok.Shape.borderCard))
            .accessibilityHidden(true)
    }
}

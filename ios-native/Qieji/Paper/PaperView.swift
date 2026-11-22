import SwiftUI
import UIKit

/// 一張紙：最上面名字和 ⋯，下面一行一行。右下 ＋（畫在根畫面，換紙時不跟著閃）按了從底下升起輸入框。
struct PaperView: View {
    @ObservedObject var store: Store
    let note: Note
    var onTitle: () -> Void = {}
    var onRoute: (Route) -> Void = { _ in }
    var onMoveLine: (String) -> Void = { _ in }

    @StateObject private var touch = ListTouch()
    @StateObject private var keyboard = KeyboardWatch()
    @Environment(\.scenePhase) private var phase
    @Environment(\.accessibilityReduceMotion) private var calm
    @State private var editingID: String?
    @State private var focus: FocusAsk?
    @State private var rowMenu: RowMenuAsk?
    @State private var composing = false
    @State private var draft = ""
    @State private var tip = false // ✓ 的單點提示開著
    @State private var listHeight: CGFloat = 0
    @State private var renaming = false
    @State private var pinChoices: [Note] = [] // 釘滿時問要換掉哪一張（有值＝問著）
    @FocusState private var composerFocused: Bool
    @FocusState private var padFocused: Bool

    var body: some View {
        let colors = Tok.note(note.color)
        VStack(spacing: Tok.Space.zero) {
            PaperHeader(
                store: store, note: note, colors: colors, renaming: $renaming,
                showDone: keyboard.up && (editingID != nil || renaming || padFocused),
                onTitle: onTitle, onDone: doneTyping, onRoute: onRoute,
                onRename: {
                    editingID = nil
                    closeComposer(stay: true)
                    renaming = true
                },
                onPinFull: { pinChoices = $0 }
            )
            Group {
                if note.isText {
                    NotePad(store: store, note: note, focused: $padFocused)
                } else {
                    PaperList(
                        store: store, touch: touch, note: note,
                        editingID: $editingID, focus: $focus, colors: colors,
                        onMenu: { openRowMenu($0, bottom: $1) }
                    )
                }
            }
            .background(GeometryReader { geo in
                Color.clear
                    .onAppear { listHeight = geo.size.height }
                    .onChange(of: geo.size.height) { listHeight = $0 }
            })
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
        // 輸入框開著時整張紙變暗（不擋觸控：點一行＝字先記下、焦點進那一行），跟鍵盤同一個時鐘
        .overlay {
            Tok.Col.scrim
                .opacity(composing ? 1 : 0)
                .ignoresSafeArea()
                .allowsHitTesting(false)
                .animation(Tok.Motion.keyboard, value: composing)
                .accessibilityHidden(true)
        }
        .overlay(alignment: .bottom) { composerBar }
        .overlay {
            if let ask = rowMenu {
                RowMenu(items: rowItems(ask.id), rowBottom: ask.bottom, close: closeRowMenu)
            }
        }
        .onAppear {
            openIfAsked()
            updateFab()
        }
        .onChange(of: store.composeAsk) { _ in openIfAsked() }
        .onChange(of: store.plusAsk) { _ in addLine() }
        .onChange(of: fabWanted) { _ in updateFab() }
        .onChange(of: composerFocused) { focused in
            if !focused, composing {
                closeComposer()
            }
        }
        .onChange(of: draft) { [draft] text in
            store.draft = text
            noticeReturn(prev: draft, next: text)
        }
        // 切到別的 app、鎖螢幕：輸入框裡打到一半的字先記成一行、框收起、馬上存（1.1 多米 2026-11-01 定）
        .onChange(of: phase) { now in
            if now != .active, composing {
                closeComposer(stay: true)
                store.flush()
            }
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
        padFocused = false
        KeyboardWatch.dismiss()
    }

    // MARK: 右下 ＋ 與輸入框

    /// ＋ 要不要畫：鍵盤升起、輸入框開著、長按選單開著、記事本都不畫
    private var fabWanted: Bool {
        !keyboard.up && !composing && rowMenu == nil && !note.isText
    }

    private func updateFab() {
        if store.fabShown != fabWanted {
            store.fabShown = fabWanted
        }
    }

    /// 按了右下 ＋：滿 1000 行先擋下（字還沒打，不會丟）；不然震一下、升起輸入框
    private func addLine() {
        guard !composing else { return }
        guard Lines.room(note) > 0 else {
            store.toast = Store.Toast(text: Words.full(Lines.max))
            return
        }
        Haptic.add()
        openComposer()
    }

    private func openComposer() {
        guard !composing, !note.isText else { return }
        editingID = nil
        draft = ""
        store.draft = ""
        withAnimation(calm ? Tok.Motion.fade : Tok.Motion.keyboard) { composing = true }
        DispatchQueue.main.async { composerFocused = true }
    }

    /// 開了新的一張、或控制中心按了「記一行」：輸入框直接升起（紙剛出現、面板還在收，等一下再叫鍵盤）
    private func openIfAsked() {
        guard store.takeCompose() else {
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Motion.composerFocusDelay) {
            if note.isText {
                padFocused = true // 剛開的新記事本：一打開游標就在裡面
            } else if Lines.room(note) > 0 {
                openComposer()
            }
        }
    }

    /// 收起輸入框：有字就記成最上面一行（字不能丟，滿了也照記）。
    /// 記下之後捲回最上面、那行亮一下；stay＝原地不動（點了紙上一行、切到別的 app、拖曳中）
    private func closeComposer(stay: Bool = false) {
        guard composing else { return }
        let text = Labels.trim(store.takeDraft())
        draft = ""
        tip = false
        withAnimation(calm ? Tok.Motion.fade : Tok.Motion.keyboard) { composing = false }
        composerFocused = false
        guard !text.isEmpty else { return }
        if stay || editingID != nil || touch.dragID != nil {
            touch.keepStill { _ = store.addTop(text) }
            return
        }
        var added: String?
        withAnimation(calm ? nil : Tok.Motion.rowShift) { added = store.addTop(text) }
        touch.fresh = added
        touch.glideTop()
    }

    /// 輸入框的 ✓：記下來、收起，鍵盤一起收
    private func doneComposer() {
        closeComposer()
        KeyboardWatch.dismiss()
    }

    private var composerLines: Int {
        let line = max(1, Tok.Font.lineUI.lineHeight)
        return max(1, Int((listHeight - Tok.Space.sm * 4) / line))
    }

    @ViewBuilder private var composerBar: some View {
        if composing {
            ComposerBar(
                text: $draft, focused: $composerFocused, maxLines: composerLines, tip: tip,
                onDone: doneComposer, onTipTap: { tip = false }
            )
            .transition(calm ? .opacity : .move(edge: .bottom).combined(with: .opacity))
        }
    }

    /// 從 1.0 更新上來的人第一次在輸入框按 Return：✓ 上面冒一張小卡（一輩子一次）
    private func noticeReturn(prev: String, next: String) {
        guard !tip, !Prefs.shared.returnTipSeen, ComposerBar.typedReturn(prev: prev, next: next) else { return }
        Prefs.shared.markReturnTip()
        tip = true
        UIAccessibility.post(notification: .announcement, argument: Words.returnTip)
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

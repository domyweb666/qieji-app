import PhotosUI
import SwiftUI
import UIKit

/// 一張紙：最上面名字和 ⋯，下面一行一行。右下 ＋（畫在根畫面，換紙時不跟著閃）按了從底下升起輸入框。
struct PaperView: View {
    @ObservedObject var store: Store
    /// 根畫面交下來的那張。一律看 store 現在的那張（note），不看它：字改了、換了紙之後這個畫面可能比根畫面先重畫，
    /// 照舊的排會把剛打的字蓋回去（快打的字會掉、游標會跳，2026-11-23 模擬器抓到）；換紙那一刻跑的程式也還拿著上一張
    let given: Note
    var note: Note {
        store.current ?? store.book.note(given.id) ?? given
    }

    var onTitle: () -> Void = {}
    var onRoute: (Route) -> Void = { _ in }
    var onMoveLine: (String) -> Void = { _ in }
    var onTrash: (String) -> Void

    @State var remote = ListRemote()
    @StateObject private var keyboard = KeyboardWatch()
    @ObservedObject private var size = TextSize.shared
    @ObservedObject private var covers = Covers.shared
    @ObservedObject private var locks = Locks.shared
    @State private var lockAsk = false
    @State private var cantLock = false
    @State private var deleting: Note? // 按了「刪除這張」，問著要不要刪（有值＝問著）
    @State private var pickingCover = false
    @State private var coverPick: PhotosPickerItem?
    @Environment(\.scenePhase) private var phase
    @Environment(\.accessibilityReduceMotion) private var calm
    @State private var editingID: String?
    @State var rowMenu: RowMenuAsk?
    @State private var composing = false
    @State private var tip = false // ✓ 的單點提示開著
    @State private var listTop: CGFloat = 0
    @State private var renaming = false
    @State private var pinChoices: [Note] = [] // 釘滿時問要換掉哪一張（有值＝問著）
    @FocusState private var padFocused: Bool

    var body: some View {
        let colors = Tok.note(note.color)
        let photo = covers.image(note, evenLocked: !lockedNow)
        let float = photo != nil && !note.isText
        VStack(spacing: Tok.Space.zero) {
            if let photo, note.isText {
                // 記事本的封面圖：固定在上面，清單名和 ⋯ 疊在圖上
                ZStack(alignment: .top) {
                    CoverFixed(photo: photo).modifier(FreshPaper(id: note.id))
                    header(colors, cover: .fixed)
                }
                TimeRow(note: note, colors: colors).modifier(FreshPaper(id: note.id))
            } else {
                header(colors, cover: float ? .floating(remote.spy) : .none)
            }
            ZStack {
                if lockedNow {
                    LockedBody { Task { await locks.unlock(note.id, reason: Words.unlockReason) } }
                        .modifier(FreshPaper(id: note.id))
                } else if note.isText {
                    NotePad(store: store, note: note, focused: $padFocused, scale: size.scale)
                        .modifier(FreshPaper(id: note.id))
                } else {
                    PaperList(
                        store: store, remote: remote, note: note, onEditing: { editingID = $0 },
                        onMenu: { openRowMenu($0) }, scale: size.scale,
                        head: float ? AnyView(CoverHead(note: note, colors: colors, spy: remote.spy, onTitle: onTitle)) : nil
                    )
                    // 清單換清單：同一個清單自己換內容、自己淡（LineListView.swap）
                    .transition(.opacity)
                }
            }
            .background(GeometryReader { geo in
                Color.clear
                    .onAppear { listTop = geo.frame(in: .global).minY }
                    .onChange(of: geo.frame(in: .global).minY) { listTop = $0 }
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
        // 清單鋪到螢幕最底（Home 條、鍵盤後面都有行）；鍵盤擋住的部分清單自己讓，不讓系統把整頁推來推去。
        // 記事本照系統的：底下讓出鍵盤；沒有鍵盤時字一樣鋪到螢幕最底，不在 Home 條上方硬切一刀
        .ignoresSafeArea(note.isText ? .container : .all, edges: .bottom)
        .background(alignment: .top) {
            ZStack(alignment: .top) {
                colors.paper.ignoresSafeArea()
                if float, let photo {
                    CoverBanner(photo: photo, paper: colors.paper, spy: remote.spy).modifier(FreshPaper(id: note.id))
                }
            }
            .animation(Tok.Motion.fade, value: note.id)
        }
        // 封面圖（完整版）：系統的照片選取畫面，不用跟使用者要相簿權限
        .photosPicker(isPresented: $pickingCover, selection: $coverPick, matching: .images)
        .onChange(of: coverPick) { item in loadCover(item) }
        // 輸入框開著時整張紙變暗（不擋觸控：點一行＝字先記下、焦點進那一行），跟鍵盤同一個時鐘
        .overlay {
            Tok.Col.scrim
                .opacity(composing ? 1 : 0)
                .ignoresSafeArea()
                .allowsHitTesting(false)
                .animation(Tok.Motion.keyboard, value: composing)
                .accessibilityHidden(true)
        }
        .overlay {
            ComposerHost(
                open: composing, onText: typed, tip: tip, topLimit: listTop,
                onBlur: { remote.recording ? () : closeComposer() }, onDone: doneComposer, onTipTap: { tip = false },
                onSplit: splitComposer
            )
            .ignoresSafeArea()
            .allowsHitTesting(composing)
        }
        .overlay {
            if let ask = rowMenu {
                RowMenu(
                    ask: ask, items: ask.picked || ask.exit != nil ? ask.items : rowItems(ask.grab.id),
                    pick: pickRowMenu, close: { closeRowMenu() }
                )
                .id(ask.token)
                .transition(.opacity)
            }
        }
        .onChange(of: rowMenuLost) { lost in
            if lost {
                closeRowMenu(.fade)
            }
        }
        // 換一張紙：新的內容淡入、舊的淡出，底色一起變過去，⋯ 停在原地（1.1 S2）
        .animation(Tok.Motion.fade, value: note.id)
        .onAppear(perform: arrive)
        .onChange(of: note.id) { _ in
            leave()
            arrive()
        }
        .alert(Words.lockAskTitle, isPresented: $lockAsk) {
            Button(Words.cancel, role: .cancel) {}
            Button(Words.lockOn) { Task { await lockNow() } }
        } message: {
            Text(Words.lockAskBody)
        }
        .alert(Words.cantLockTitle, isPresented: $cantLock) {
            Button(Words.gotIt, role: .cancel) {}
        } message: {
            Text(Words.cantLockBody)
        }
        // 刪除這張：先問一次，跟目錄的「−」同一個框（2026-11-24 芹查 #1）
        .alert(Words.deleteTitle(deleting.map { Labels.label($0) } ?? ""), isPresented: deleteAsking, presenting: deleting) { gone in
            Button(Words.delete, role: .destructive) { onTrash(gone.id) }
            Button(Words.cancel, role: .cancel) {}
        }
        .onChange(of: store.composeAsk) { _ in openIfAsked() }
        .onChange(of: store.plusAsk) { _ in addLine() }
        .onChange(of: store.renameAsk) { _ in renameIfAsked() }
        .onChange(of: fabWanted) { _ in updateFab() }
        // 切到別的 app、鎖螢幕：輸入框裡打到一半的字先記成一行、框收起、馬上存（1.1 多米 2026-11-01 定）
        .onChange(of: phase) { now in
            if now != .active, composing {
                closeComposer(stay: true)
                store.flush()
            }
        }
    }

    /// 這張紙剛出現（打開 app、換紙）
    private func arrive() {
        openIfAsked()
        renameIfAsked()
        updateFab()
        // 上鎖的紙一打開就問一次 Face ID；取消的話停在鎖住的畫面，上面有「打開」可以再試
        if lockedNow {
            let id = note.id
            Task { await locks.unlock(id, reason: Words.unlockReason) }
        }
    }

    /// 上一張紙收尾：跟哪一張有關的狀態全部歸零（輸入框裡打到一半的字 store.open 已經記到原本那張了）
    private func leave() {
        // 先當成收好了再收鍵盤：收的時候系統會訂正、把選到一半的字定下來，那些不准再記一次、更不准記到新的這張
        composing = false
        KeyboardWatch.dismiss()
        store.draft = ""
        remote.spy.y = 0
        remote.spy.nameEnd = ScrollSpy.far
        editingID = nil
        rowMenu = nil
        tip = false
        renaming = false
        padFocused = false
        pinChoices = []
    }

    /// 清單名變成可以打字（⋯「改名字」、目錄 VoiceOver 的「改名字」）
    private func startRename() {
        remote.list?.endEditingLine()
        closeComposer(stay: true)
        renaming = true
    }

    /// 目錄 VoiceOver 的「改名字」要的是這張：拿一次就清掉
    private func renameIfAsked() {
        guard store.renameID == note.id else { return }
        store.renameID = nil
        startRename()
    }

    private func header(_ colors: Tok.NoteColors, cover: PaperHeader.CoverMode) -> some View {
        PaperHeader(
            store: store, note: note, colors: colors, renaming: $renaming,
            showDone: keyboard.up && (editingID != nil || renaming || padFocused),
            onTitle: onTitle, onDone: doneTyping, onRoute: onRoute,
            onRename: startRename,
            onPinFull: { pinChoices = $0 },
            onCover: {
                closeComposer(stay: true)
                pickingCover = true
            },
            onLock: toggleLock,
            onDelete: askDelete,
            lockedNow: lockedNow,
            cover: cover
        )
    }

    /// 上鎖、還沒驗過（這次打開 app 驗過就不算）
    private var lockedNow: Bool {
        note.locked && !locks.isOpen(note.id)
    }

    /// ⋯「刪除這張」
    private func askDelete() {
        closeComposer(stay: true)
        deleting = note
    }

    private var deleteAsking: Binding<Bool> {
        Binding(get: { deleting != nil }, set: {
            if !$0 {
                deleting = nil
            }
        })
    }

    /// ⋯「上鎖／解除上鎖」：解除要先驗、不看買了沒；上鎖要完整版、手機要能驗，先問一次
    private func toggleLock() {
        closeComposer(stay: true)
        remote.list?.endEditingLine()
        let id = note.id
        if note.locked {
            Task {
                if await locks.unlock(id, reason: Words.lockOff) {
                    store.setLocked(id, false)
                    store.toast = Store.Toast(text: Words.unlockedOff)
                }
            }
            return
        }
        guard store.isFull else { return }
        if locks.canLock() {
            lockAsk = true
        } else {
            cantLock = true
        }
    }

    /// 確定上鎖：先驗一次（確定之後打得開），再鎖
    private func lockNow() async {
        let id = note.id
        guard await locks.unlock(id, reason: Words.confirmReason) else { return }
        store.setLocked(id, true)
        store.pushTarget(now: true) // 分享卡上那張的名字馬上換掉，不等存檔
        // 上鎖的紙只存在這支手機：拿掉 iCloud 上那份；拿不掉要跟使用者講
        CloudLink.shared.dropNote(id) { gone in
            store.toast = Store.Toast(text: gone ? Words.lockedToast : Words.lockedKeptCloud)
        }
    }

    /// 選好一張照片：縮圖存起來、放上這張紙（舊的圖檔刪掉）
    private func loadCover(_ item: PhotosPickerItem?) {
        guard let item else { return }
        coverPick = nil
        let id = note.id
        Task {
            let data = try? await item.loadTransferable(type: Data.self)
            let jpeg = await Task.detached(priority: .userInitiated) { data.flatMap(Covers.small) }.value
            await MainActor.run {
                if let jpeg, let code = Covers.shared.keep(jpeg) {
                    store.setCover(id, code)
                } else {
                    store.toast = Store.Toast(text: Words.coverFailTitle)
                }
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
        renaming = false
        padFocused = false
        KeyboardWatch.dismiss()
    }

    // MARK: 右下 ＋ 與輸入框

    /// ＋ 要不要畫：鍵盤升起、輸入框開著、長按選單開著、記事本都不畫
    private var fabWanted: Bool {
        !keyboard.up && !composing && !rowMenuOpen && !note.isText && !lockedNow
    }

    private func updateFab() {
        if store.fab.shown != fabWanted {
            store.fab.shown = fabWanted
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
        guard !composing, !note.isText, !lockedNow else { return }
        store.draft = ""
        composing = true
    }

    /// 開了新的一張、或控制中心按了「記一行」：輸入框直接升起（紙剛出現、面板還在收，等一下再叫鍵盤）
    private func openIfAsked() {
        // 要的是現在這張：換紙那一刻上一張還沒拆掉，也會收到「升起輸入框」，被它拿走新的那張就不升了
        guard note.id == store.currentID, store.takeCompose() else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Motion.composerFocusDelay) {
            if note.isText {
                padFocused = true // 剛開的新記事本：一打開游標就在裡面
            } else if Lines.room(note) > 0 {
                openComposer()
            } else {
                store.toast = Store.Toast(text: Words.full(Lines.max)) // 跟按 ＋ 一樣講一聲，不准按了沒反應
            }
        }
    }

    /// 收起輸入框：有字就記成最上面一行（字不能丟，滿了也照記）。
    /// 記下之後捲回最上面、那行亮一下；stay＝原地不動（點了紙上一行、切到別的 app、拖曳中）
    private func closeComposer(stay: Bool = false) {
        guard composing else { return }
        let text = Labels.trim(store.takeDraft())
        tip = false
        composing = false
        guard !text.isEmpty else { return }
        let added = store.addTop(text)
        guard let list = remote.list else { return }
        if stay || remote.editingID != nil || remote.dragging {
            // 已經捲下去：畫面原地不動；在最上面：新的一行淡入、其他行讓開（1.1 anchorNext）
            let scrolled = list.contentOffset.y > Tok.Shape.rowMin
            list.refresh(animated: !scrolled, stay: scrolled)
            return
        }
        list.toTop(added)
    }

    /// 輸入框的 ✓：記下來、收起，鍵盤一起收。
    /// 先收鍵盤，框才會跟它同一段動畫往下走（等畫面更新時才收，框會直接跳到底、看起來整個不見）。
    /// 字先拿在手上：收鍵盤的時候系統會自動訂正，那不是他打的。marked＝注音選到一半：照系統定下來的字（跟行裡打字一樣）
    private func doneComposer(marked: Bool) {
        guard composing else { return }
        let text = store.takeDraft()
        remote.recording = true
        KeyboardWatch.dismiss()
        remote.recording = false
        let settled = store.takeDraft()
        store.draft = marked && !settled.isEmpty ? settled : text
        closeComposer()
    }

    /// 貼上好幾行之後按「拆成 N 行」：拆好放最上面，框和鍵盤一起收。放不下就不拆，字留在框裡
    private func splitComposer() {
        guard composing, let ids = store.addSplit(store.draft) else { return }
        // 字已經記好了：收鍵盤時系統的訂正不准再記一次
        store.draft = ""
        remote.recording = true
        KeyboardWatch.dismiss()
        remote.recording = false
        store.draft = ""
        closeComposer()
        remote.list?.toTop(ids.first)
    }

    /// 輸入框裡打了字。字記在 store，不放在這個畫面的狀態裡：每打一個字整張紙重畫一次會卡
    private func typed(prev: String, next: String) {
        // 框已經收了（字記好了）才來的訂正：留著會在下次換紙時多記一行
        guard composing else { return }
        store.draft = next
        if !remote.recording {
            noticeReturn(prev: prev, next: next)
        }
    }

    /// 從 1.0 更新上來的人第一次在輸入框按 Return：✓ 上面冒一張小卡（一輩子一次）
    private func noticeReturn(prev: String, next: String) {
        guard !tip, !Prefs.shared.returnTipSeen, ComposerHost.typedReturn(prev: prev, next: next) else { return }
        Prefs.shared.markReturnTip()
        tip = true
        UIAccessibility.post(notification: .announcement, argument: Words.returnTip)
    }
}

/// 換紙時這一塊換一份：新的淡進來、舊的同時淡出（底色是同一片，先拿掉會空白一格）
struct FreshPaper: ViewModifier {
    let id: String

    func body(content: Content) -> some View {
        content
            .id(id)
            .transition(.opacity)
    }
}

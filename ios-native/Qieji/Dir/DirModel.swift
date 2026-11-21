import SwiftUI
import UIKit

/// 拿起來的那張：浮在目錄最上層跟著手指。自己一份，手指每動一格只重畫它，不重畫整個目錄
final class DirGhost: ObservableObject {
    @Published var entry: Seats.Entry?
    @Published var corner: CGPoint = .zero // 拿起時那塊的左上角（螢幕座標）
    @Published var shift: CGSize = .zero // 手指移了多少
    @Published var width: CGFloat = 0
    @Published var lifted = false
    @Published var sinking = false // 疊上去放手：邊滑邊縮小淡掉
}

/// 目錄面板的狀態與動作。規則從 Expo 版 src/components/DirPanel.tsx 搬過來（2026-11-21）：
/// 面板開關在這個檔，拖曳在 DirModel+Drag，點、按住、選單在 DirModel+Touch。
final class DirModel: ObservableObject {
    enum Zone {
        case grid, folder
    }

    struct OpenFolder: Equatable {
        var id: String
        var naming: Bool
    }

    /// 長按選單：哪一張、那塊磚在哪、選單放多高、靠哪一邊
    struct Menu: Equatable {
        var id: String
        var corner: CGPoint
        var width: CGFloat
        var top: CGFloat
        var leading: Bool
    }

    /// 點一張打開：那塊方磚放大鋪滿面板
    struct Launch: Equatable {
        var id: String
        var color: String
        var frame: CGRect
    }

    struct Hit {
        var id: String
        var isFolder: Bool
        var slot: Int // 目錄：這頁第幾格；資料夾：裡面第幾張
        var corner: CGPoint
    }

    let store: Store
    let ghost = DirGhost()
    let gridTouch = DirTouch(zone: .grid)
    let folderTouch = DirTouch(zone: .folder)

    // 面板
    @Published var shown = false
    @Published var progress: CGFloat = 0 // 0＝收起、1＝全開
    @Published var fading = false // 這次用淡的不用滑的
    @Published var isOpen = false // 停在全開
    @Published var moveLine: String? // 搬行模式：要搬的那一行

    // 目錄
    @Published var query = ""
    @Published var page = 0
    @Published var editing = false // 抖動中
    @Published var drag: DirDrag?
    @Published var openFolder: OpenFolder?
    @Published var folderPage = 0
    @Published var menu: Menu?
    @Published var stackOn: String? // 準備疊上去的那一格是誰
    @Published var popID: String? // 剛有東西縮進來的那格：彈一下
    @Published var launch: Launch?
    @Published var heldID: String? // 抖動中手指按著的那塊
    @Published var askDelete: String?
    @Published var glyphFor: String?
    @Published var putInFor: String?
    @Published var gridFrame: CGRect = .zero // 格子區在螢幕上的位置
    var folderBox: CGRect = .zero // 打開的資料夾那個框
    var screen: CGSize = .zero
    var safeBottom: CGFloat = 0

    // 拖曳中的現況（不用重畫的放這裡）
    var geo = DirGeo()
    var aim = DirAim.none
    var stackSlot = -1
    var ready = false
    var edge = 0
    var folderEdge = 0
    var entered = false // 打開的資料夾手指進去過了沒
    var landing = false // 放手了、還在滑進落點
    var touchStart: CGPoint = .zero
    var aimWork: DispatchWorkItem?
    var leaveWork: DispatchWorkItem?
    var edgeWork: DispatchWorkItem?
    var folderEdgeWork: DispatchWorkItem?
    var stillFrom: CGSize = .zero
    var stills = 0

    init(store: Store) {
        self.store = store
        gridTouch.model = self
        folderTouch.model = self
    }

    var calm: Bool {
        UIAccessibility.isReduceMotionEnabled
    }

    // MARK: 算出來的

    var searching: Bool {
        !Labels.trim(query).isEmpty
    }

    var cellWidth: CGFloat {
        ((screen.width - Tok.Space.lg * 2) / CGFloat(DirMetrics.cols)).rounded(.down)
    }

    var metrics: DirMetrics {
        DirMetrics(cell: cellWidth)
    }

    var perPage: Int {
        metrics.rows(in: gridFrame.height) * DirMetrics.cols
    }

    var entries: [Seats.Entry] {
        Seats.seatedLayout(store.book)
    }

    /// 這頁格子左上角（螢幕座標）
    var gridOrigin: CGPoint {
        CGPoint(x: gridFrame.minX + Tok.Space.lg, y: gridFrame.minY + Tok.Space.sm + Tok.Space.md)
    }

    var boxWidth: CGFloat {
        CGFloat(DirMetrics.folderCols) * cellWidth + Tok.Space.lg * 2
    }

    func flat(_ drag: DirDrag) -> [DirCell] {
        DirCells.flat(drag, list: entries, book: store.book)
    }

    var board: DirBoard {
        DirBoard(list: entries, book: store.book, perPage: perPage)
    }

    func pageIndex(_ list: [Seats.Entry]) -> [[Int]] {
        DirCells.paginate(list, perPage: perPage)
    }

    /// 畫面上每一頁（拖的時候照格子表排）
    var pages: [[Seats.Entry]] {
        var list = entries
        if let drag {
            list = flat(drag).map(\.entry)
        }
        return pageIndex(list).map { page in page.map { list[$0] } }
    }

    var openEntry: Seats.Entry? {
        guard let openFolder else { return nil }
        return Seats.seatedEntries(store.book).first { $0.id == openFolder.id && $0.folder != nil }
    }

    var folderList: [Note] {
        guard let entry = openEntry else { return [] }
        return DirCells.folderNotes(entry, drag: drag, book: store.book)
    }

    /// 從這個資料夾拿起、已經拖出去：資料夾先藏起來（看不到、點不到）但留著
    var folderHidden: Bool {
        guard let drag, let source = drag.source else { return false }
        return source == openFolder?.id && drag.inFolder == nil
    }

    /// 最近刪除裡有幾項：刪掉的清單＋還在的紙刪掉的行
    var trashed: Int {
        store.book.notes.reduce(0) { $0 + ($1.deleted ? 1 : $1.bin.count) }
    }

    /// 搬行模式要搬的那一行（行已經不在了就當普通目錄用）
    var movingItem: Item? {
        guard let moveLine, let note = store.current else { return nil }
        return note.items.first { $0.id == moveLine }
    }

    // MARK: 面板開關

    private static func window() -> UIWindow? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }
    }

    func endKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    /// 打開目錄。move＝搬行模式要搬的那一行
    func open(move: String? = nil) {
        guard !shown else { return }
        endKeyboard()
        let window = DirModel.window()
        screen = window?.bounds.size ?? UIScreen.main.bounds.size
        safeBottom = window?.safeAreaInsets.bottom ?? 0
        moveLine = move
        query = ""
        page = 0
        editing = false
        openFolder = nil
        menu = nil
        launch = nil
        fading = calm
        progress = 0
        shown = true
        // 先掛上去（還在螢幕外），下一格才開始滑：一起改的話面板會直接出現在定位
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            withAnimation(calm ? Tok.Motion.dirFade : Tok.Motion.dirPanel) { self.progress = 1 }
            isOpen = true
        }
    }

    /// 收起。fade＝用淡出（點一張從磚放大打開之後）；then＝收完才做的事
    func close(fade: Bool = false, then: (() -> Void)? = nil) {
        guard shown else {
            then?()
            return
        }
        isOpen = false
        endKeyboard()
        let soft = fade || calm
        if soft {
            fading = true
        }
        withAnimation(soft ? Tok.Motion.dirFade : Tok.Motion.dirPanel) { progress = 0 }
        _ = after(soft ? Tok.Motion.dirFadeSeconds : Tok.Motion.dirPanelSeconds) { [weak self] in
            guard let self, progress == 0 else { return }
            shown = false
            moveLine = nil
            editing = false
            launch = nil
            menu = nil
            openFolder = nil
            then?()
        }
    }

    /// 點露出的紙、點頂端把手：選單開著只收選單；抖動中只結束抖動；不然收起
    func tapOut() {
        if menu != nil {
            menu = nil
        } else if editing {
            editing = false
        } else {
            close()
        }
    }

    /// 把手往下拉：面板跟著手指
    func pull(_ distance: CGFloat) {
        guard !editing, menu == nil, drag == nil else { return }
        let height = max(1, screen.height - Tok.Shape.dirPeek)
        progress = min(1, max(0, 1 - distance / height))
    }

    func pullEnd(_ distance: CGFloat, ahead: CGFloat) {
        guard !editing, menu == nil, drag == nil else { return }
        let height = max(1, screen.height - Tok.Shape.dirPeek)
        if distance > height * Tok.Gesture.pushCloseRatio || ahead > Tok.Gesture.flickAhead {
            close()
        } else {
            withAnimation(Tok.Motion.dirPanel) { progress = 1 }
        }
    }

    /// 資料變了（同步、刪除、復原）：打開的資料夾不見了就收起
    func bookChanged() {
        if openFolder != nil, openEntry == nil {
            openFolder = nil
        }
    }

    func after(_ seconds: Double, _ work: @escaping () -> Void) -> DispatchWorkItem {
        let item = DispatchWorkItem(block: work)
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: item)
        return item
    }

    // MARK: 一張紙

    /// 點一張：換過去。frame＝那塊方磚在螢幕上的位置（從這裡放大打開）；搬行模式＝搬進這張
    func pick(_ id: String, from frame: CGRect? = nil) {
        guard let note = store.book.note(id), !note.deleted else { return }
        if let line = moveLine, movingItem != nil {
            // 那張滿了：不搬，目錄留著讓你挑別張
            if store.moveLine(line, to: id) {
                close()
            }
            return
        }
        let leaving = store.currentID
        store.open(id)
        if let leaving, leaving != id {
            store.dropIfBlank(leaving)
        }
        guard !calm, let frame else {
            close()
            return
        }
        menu = nil
        launch = Launch(id: id, color: note.color, frame: frame)
    }

    /// 第一個空格換成資料規則要的「放哪」：空位＝那個空位；最後一張後面（這頁還放得下）＝排在最後那格後面
    func emptySpot(_ list: [Seats.Entry], page: [Int]) -> (hole: String?, after: String?) {
        let slot = DirCells.firstEmpty(list, page: page, perPage: perPage)
        if slot < 0 {
            return (nil, nil)
        }
        if slot < page.count {
            return (list[page[slot]].id, nil)
        }
        return (nil, page.last.map { list[$0].id })
    }

    /// 新的一張：放進第一個空格（從第一頁找起），都滿了才排最後。搬行時就是搬進新的一張（紙不換）
    func add() {
        let list = entries
        var spot: (hole: String?, after: String?) = (nil, nil)
        for page in pageIndex(list) {
            spot = emptySpot(list, page: page)
            if spot.hole != nil || spot.after != nil {
                break
            }
        }
        let id = store.makeNote(hole: spot.hole, after: spot.after)
        if moveLine != nil, movingItem != nil {
            pick(id)
            return
        }
        store.open(id)
        store.requestCompose()
        close()
    }

    func recolor(_ id: String, _ key: String) {
        guard let note = store.book.note(id), note.color != key else { return }
        store.setColor(id, key)
        Haptic.tick() // 選單不關，震一下才知道有換到
    }

    /// 釘選最多 pinMax 張。Expo 版釘滿會問要換掉哪一張，這裡先只提醒
    func togglePin(_ id: String) {
        guard let note = store.book.note(id) else { return }
        menu = nil
        if !note.pinned, Seats.pinned(store.book).count >= Seats.pinMax {
            store.toast = Store.Toast(text: Words.pinFull(Seats.pinMax))
            return
        }
        store.togglePin(id)
        store.toast = Store.Toast(text: note.pinned ? Words.unpinned : Words.pinned)
    }

    func delete(_ id: String) {
        menu = nil
        store.trashNote(id)
    }

    // MARK: 資料夾

    func showFolder(_ id: String, naming: Bool = false) {
        folderPage = 0
        openFolder = OpenFolder(id: id, naming: naming)
    }

    func closeFolder() {
        endKeyboard()
        openFolder = nil
    }

    func renameFolder(_ id: String, _ name: String) {
        guard store.book.folders?.first(where: { $0.id == id })?.name != name, !Labels.trim(name).isEmpty else { return }
        store.edit { book in _ = Seats.renameFolder(&book, folderID: id, name: name, now: Clock.now()) }
    }

    /// 移出資料夾（VoiceOver 動作、在框外放手）：放到資料夾那頁第一個空格，那頁滿了才排在資料夾後面一格
    func takeOut(_ id: String) {
        guard let folder = Seats.folderOf(store.book, id) else { return }
        let list = entries
        let index = pageIndex(list)
        var spot: (hole: String?, after: String?) = (nil, nil)
        if let page = index.first(where: { $0.contains { list[$0].id == folder.id } }) {
            spot = emptySpot(list, page: page)
        }
        store.edit { book in _ = Seats.outOfFolder(&book, noteID: id, now: Clock.now(), hole: spot.hole, after: spot.after) }
    }

    /// 放進資料夾（只剩 VoiceOver 動作）：還沒有資料夾就在這張的位置開一個新的、打開讓你取名；有就問放進哪一個
    func putIn(_ id: String) {
        if Seats.seatedEntries(store.book).contains(where: { $0.folder != nil }) {
            putInFor = id
        } else {
            makeFolder(for: id)
        }
    }

    func makeFolder(for id: String) {
        var made: String?
        store.edit { book in made = Seats.newFolder(&book, noteID: id, now: Clock.now()).id }
        if let made {
            showFolder(made, naming: true)
        }
    }

    func moveInto(_ id: String, folder: String) {
        store.edit { book in _ = Seats.intoFolder(&book, noteID: id, folderID: folder, now: Clock.now()) }
    }

    /// VoiceOver 的「往前移／往後移」：照整排格子換（含空位），換頁標記跳過
    func moveBy(_ id: String, _ step: Int) {
        var ids = entries.map(\.id)
        guard let from = ids.firstIndex(of: id) else { return }
        var target = from + step
        while target >= 0, target < ids.count, Seats.isBreak(ids[target]) {
            target += step
        }
        guard target >= 0, target < ids.count else { return }
        ids.swapAt(from, target)
        store.edit { book in Seats.reseat(&book, visible: ids, now: Clock.now()) }
    }
}

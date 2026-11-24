import SwiftUI
import UIKit

/// 拿起來的那張：浮在目錄最上層跟著手指。自己一份，手指每動一格只重畫它，不重畫整個目錄
final class DirGhost: ObservableObject {
    @Published var entry: Seats.Entry?
    @Published var corner: CGPoint = .zero // 拿起時那塊的左上角（螢幕座標）
    @Published var shift: CGSize = .zero // 手指移了多少
    @Published var catchUp: CGSize = .zero // 拿起那一刻還沒補上的那段（很快補到 0）
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
        var title: String
        var frame: CGRect
    }

    /// 現在這張是從目錄哪裡點進來的：哪一張、目錄第幾頁、打開著哪個資料夾
    struct Origin: Equatable {
        var id: String
        var page: Int
        var folder: String?
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

    /// 面板
    @Published var shown = false
    /// 掛到第幾步：0＝還沒、1＝後面的霧、2＝面板和底下兩列、3＝搜尋列、4＝全部（方磚）
    @Published var stage = 0
    @Published var progress: CGFloat = 0 // 0＝收起、1＝全開
    @Published var fading = false // 這次用淡的不用滑的
    var grabbing = false // 手指正在拉把手（不是點）
    @Published var pulled: CGFloat = 0 // 用淡的那次，把手把面板往下拉了多少（收起時留在那裡淡掉）
    @Published var isOpen = false // 停在全開
    @Published var moveLine: String? // 搬行模式：要搬的那一行

    // 目錄
    @Published var query = ""
    @Published var page = 0
    @Published var editing = false // 抖動中
    /// 目錄現在畫的樣子：排列和拖曳綁成一份，一次換。分兩次換的話中間會多畫一格「資料已經改了、拖曳還沒結束」，
    /// 疊成資料夾放手那一刻整頁的磚會亂飛（2026-11-23）
    struct Scene {
        var entries: [Seats.Entry] = []
        var drag: DirDrag?
    }

    @Published var scene = Scene() {
        didSet { pagesSeen = nil }
    }

    var origin: Origin?

    private var pagesSeen: [[Seats.Entry]]?
    private var pagesSize = 0
    private var moveHeld: Item?
    private var holding = false // 正在改資料，等一起換

    var drag: DirDrag? {
        get { scene.drag }
        set { scene.drag = newValue }
    }

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
    @Published var pinSwapFor: String? // 釘滿 5 張再釘：問要換掉哪一張
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
    var landWork: DispatchWorkItem? // 放手後「滑完才改資料」那一步
    var landTurn = 0 // 第幾次放手：上一次的「滑完了」晚到，不准替這一次落定
    var stillFrom: CGSize = .zero
    var stills = 0

    init(store: Store) {
        self.store = store
        gridTouch.model = self
        folderTouch.model = self
        store.onBook = { [weak self] in self?.bookChanged() }
        store.onCurrent = { [weak self] in
            guard let self else { return }
            forgetOrigin()
            if shown {
                objectWillChange.send()
            }
        }
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
        scene.entries
    }

    /// 全開到收起要滑多遠：面板整個出螢幕，再多一小截。時間到就拿掉，彈簧那時還差一點點，不多走這截會看到一條面板被切掉；
    /// 打開的資料夾連露出的那截都霧著，所以再加那一截
    var travel: CGFloat {
        let peek = openFolder == nil ? Tok.Shape.dirPeek : Tok.Space.zero
        return max(1, screen.height - peek + Tok.Shape.dirTail)
    }

    /// 改資料，改完跟拖曳一起換（中間不多畫一格）
    func change(_ body: () -> Void) {
        holding = true
        body()
        holding = false
    }

    /// 改完了：新的排列、沒有拖曳，一次換上
    func settle() {
        scene = Scene(entries: Seats.seatedLayout(store.book), drag: nil)
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
        // 一次重畫會問好幾次、手指每點一下也會問：排列沒變就用上次算好的
        if let pagesSeen, pagesSize == perPage {
            return pagesSeen
        }
        var list = entries
        if let drag {
            list = flat(drag).map(\.entry)
        }
        let out = pageIndex(list).map { page in page.map { list[$0] } }
        pagesSeen = out
        pagesSize = perPage
        return out
    }

    var openEntry: Seats.Entry? {
        guard let openFolder else { return nil }
        return entries.first { $0.id == openFolder.id && $0.folder != nil }
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
        // 搬完面板往下滑的途中照樣拿著它：不然那行說明先不見，底下的磚往上跳一下
        return note.items.first { $0.id == moveLine } ?? (isOpen ? nil : moveHeld)
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

    /// 打開目錄。move＝搬行模式要搬的那一行；spot＝回到原本那一頁、那個資料夾（沒講就是第一頁）
    func open(move: String? = nil, at spot: Origin? = nil) {
        guard !shown else { return }
        endKeyboard()
        // 刪完一張回來的（spot）：同一刻剛改過資料，那次重畫沒帶動畫，晚一格才滑，不然面板直接出現在定位
        let ready = stage == DirModel.stages && spot == nil
        measure()
        moveLine = move
        moveHeld = movingItem
        query = ""
        page = 0
        editing = false
        openFolder = nil
        menu = nil
        launch = nil
        fading = calm
        pulled = 0
        progress = 0
        scene = Scene(entries: Seats.seatedLayout(store.book), drag: nil)
        if let spot {
            stand(at: spot)
        }
        gridTouch.scroll(toPage: page, animated: false)
        stage = DirModel.stages
        shown = true
        guard !ready else {
            rise()
            return
        }
        // 剛打開 app 就按、還沒先做好：先掛上去（還在螢幕外），下一格才開始滑。一起改的話面板會直接出現在定位
        DispatchQueue.main.async { [weak self] in self?.rise() }
    }

    private func rise() {
        withAnimation(calm ? Tok.Motion.dirFade : Tok.Motion.dirPanel) { progress = 1 }
        isOpen = true
    }

    static let stages = 4

    private func measure() {
        let window = DirModel.window()
        screen = window?.bounds.size ?? UIScreen.main.bounds.size
        safeBottom = window?.safeAreaInsets.bottom ?? 0
    }

    /// 先掛一步（藏在螢幕外面）
    func warm() {
        guard stage < DirModel.stages else { return }
        if stage == 0 {
            measure()
            scene = Scene(entries: Seats.seatedLayout(store.book), drag: nil)
        }
        stage += 1
    }

    /// 收起。fade＝用淡出（點一張從磚放大打開之後）；velocity＝往下拉放手時手指每秒幾點（接著那個速度收）；then＝收完才做的事
    func close(fade: Bool = false, velocity: CGFloat = 0, then: (() -> Void)? = nil) {
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
        guard velocity == 0, !soft else {
            sink(soft: soft, velocity: velocity, then: then)
            return
        }
        // 晚一格才滑：同一刻剛改過資料（搬一行、開新的一張）的話，那次重畫沒帶動畫，面板會整個直接不見
        DispatchQueue.main.async { [weak self] in
            guard let self, !isOpen else { return }
            sink(soft: false, velocity: 0, then: then)
        }
    }

    private func sink(soft: Bool, velocity: CGFloat, then: (() -> Void)?) {
        let slide = velocity == 0 ? Tok.Motion.dirPanel : Tok.Motion.dirPanelSpring(velocity: Motions.speed(
            velocity,
            over: travel * progress
        ))
        withAnimation(soft ? Tok.Motion.dirFade : slide) { progress = 0 }
        _ = after(soft ? Tok.Motion.dirFadeSeconds : Tok.Motion.dirPanelSeconds) { [weak self] in
            guard let self, progress == 0 else { return }
            shown = false
            moveLine = nil
            editing = false
            launch = nil
            menu = nil
            openFolder = nil
            query = "" // 收起來就換回一面磚，下次打開不用那一刻才做
            then?()
        }
    }

    /// 資料變了（同步、刪除、復原）：打開的資料夾不見了就收起
    func bookChanged() {
        guard shown, !holding else { return }
        let next = Seats.seatedLayout(store.book)
        if next != scene.entries {
            scene.entries = next
        } else {
            objectWillChange.send() // 最近刪除的數字、選單裡的釘選
        }
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

    /// 點一張：換過去。frame＝那塊方磚在螢幕上的位置（從這裡放大打開）；line＝搜尋點的那一行（紙捲到那行、亮一下）；搬行模式＝搬進這張
    func pick(_ id: String, from frame: CGRect? = nil, line: String? = nil) {
        guard let note = store.book.note(id), !note.deleted else { return }
        if let line = moveLine, movingItem != nil {
            // 那張滿了：不搬，目錄留著讓你挑別張
            if store.moveLine(line, to: id) {
                close()
            }
            return
        }
        markOrigin(id)
        // 離開的那張由 open 收尾（空行拿掉、空白的紙不留）
        guard !calm, let frame, line == nil else {
            if let line {
                store.openAt(id, line: line)
            } else {
                store.open(id)
            }
            close()
            return
        }
        menu = nil
        // 放大那一小段時間面板不再收觸控，手指碰到的是後面那張紙（不會有一段碰了沒反應）
        isOpen = false
        launch = Launch(id: id, color: note.color, title: Labels.label(note), frame: frame)
        // 先讓磚開始放大，下一格就換紙：換紙那一下不擋第一格
        DispatchQueue.main.async { [store] in store.open(id) }
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
        markOrigin(id)
        store.open(id)
        store.requestCompose()
        close()
    }

    func recolor(_ id: String, _ key: String) {
        guard let note = store.book.note(id), note.color != key else { return }
        store.setColor(id, key)
        Haptic.tick() // 選單不關，震一下才知道有換到
    }

    /// 釘選跟紙的 ⋯ 同一套：釘滿 5 張再釘，問要換掉哪一張（1.1 pin.ts），換完提示條可以復原
    func togglePin(_ id: String) {
        menu = nil
        if store.pinOrAsk(id) != nil {
            pinSwapFor = id
            return
        }
        Haptic.tick()
    }

    /// VoiceOver 的「改名字」（1.1）：目錄收起、換到那張，清單名變成可以打字
    func renameNote(_ id: String) {
        markOrigin(id)
        close { [weak self] in
            guard let self else { return }
            if store.currentID != id {
                store.open(id)
            }
            store.requestRename(id)
        }
    }

    /// 長按選單、VoiceOver 的「刪除」：跟「−」一樣先問一次（2026-11-24 芹查 #1）
    func confirmDelete(_ id: String) {
        menu = nil
        askDelete = id
    }

    func delete(_ id: String) {
        menu = nil
        store.trashNote(id)
        Haptic.land()
    }
}

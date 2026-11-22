import SwiftUI
import UIKit

@main
struct QiejiApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

/// 紙以外的畫面（紙上、目錄裡要去哪）
enum Route: String, Identifiable {
    case switcher // 切換清單（點左上清單名）
    case trash // 最近刪除
    case settings
    case full // 付費頁

    var id: String {
        rawValue
    }
}

/// 從右邊推進來的一整頁
enum Page: Hashable {
    case trash
    case settings
    case news
    case family
}

/// 根畫面：紙是家。打開就是上次那張紙，其他畫面都從紙上面升起來。
struct RootView: View {
    @StateObject private var store: Store
    /// 目錄面板的狀態。不讓根畫面看著它（看著的只有 DirHost）：目錄裡每動一格，紙不用跟著重畫
    @State private var dir: DirModel
    @State private var sheet: Route? // 從下面升起的表單：只有付費頁
    @State private var path: [Page] = [] // 推進來的頁
    @State private var switching = false // 切換清單開著
    @State private var newsCard: News.Entry? // 更新後第一次打開跳一次的新功能卡片
    @State private var fullNotice = false // 1.0 開過同步的人：iCloud 同步改成完整版功能
    @State private var underKey = "yellow" // 紙底下墊的顏色（換紙時是上一張的）
    @State private var shownID: String?
    @State private var booted = false // 第一張紙已經出來了：之後換紙才淡入
    @ObservedObject private var shop = Purchases.shared
    @ObservedObject private var look = Look.shared
    @ObservedObject private var cloud = CloudLink.shared

    /// 假資料模式、跑單元測試：不碰 App Store
    private static var offline: Bool {
        let info = ProcessInfo.processInfo
        return info.arguments.contains("-demo") || info.environment["QIEJI_DEMO"] == "1"
            || info.environment["XCTestConfigurationFilePath"] != nil
    }

    init() {
        let made = RootView.makeStore()
        _store = StateObject(wrappedValue: made)
        _dir = State(initialValue: DirModel(store: made))
    }

    @Environment(\.scenePhase) private var phase

    /// 啟動參數帶 -demo、或環境變數 QIEJI_DEMO=1：用假資料、不讀不寫（模擬器截圖與手勢測試用）
    private static func makeStore() -> Store {
        let info = ProcessInfo.processInfo
        if info.arguments.contains("-demo") || info.environment["QIEJI_DEMO"] == "1" {
            let demo = Store(book: Demo.book())
            demo.isFull = true
            return demo
        }
        // 跑單元測試時 app 也會被啟動：不讀不寫，免得測試在機器上留下一份存檔
        if info.environment["XCTestConfigurationFilePath"] != nil {
            return Store()
        }
        return Store(disk: Disk.standard())
    }

    var body: some View {
        // 最近刪除、設定從右邊推進一整頁（1.1 Stack）；紙是最底下那頁、沒有標題列
        NavigationStack(path: $path) {
            paperRoot
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: Page.self) { page in
                    switch page {
                    case .trash: TrashPage(store: store)
                    case .settings:
                        SettingsPage(
                            store: store, shop: shop, cloud: cloud, look: look, size: TextSize.shared,
                            onFull: { sheet = .full }, onPage: { path.append($0) }
                        )
                    case .news: NewsPage()
                    case .family: FamilyPage()
                    }
                }
        }
        .tint(Tok.Col.accent)
        .overlay(alignment: .bottom) { ToastBar(store: store).animation(Tok.Motion.fade, value: store.toast?.id) }
        .sheet(item: $sheet) { _ in
            // 付費頁：系統表單，從下面升起、一次展開到全高（2026-11-14 多米真機：半高要再滑一次才看得到購買鍵）、往下拉可以關
            FullView(shop: shop, store: store) { sheet = nil }
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(Tok.Shape.radiusLg)
        }
        // 外觀（跟隨系統／淺色／深色）：整個 app 連系統提示框、選單一起換
        .preferredColorScheme(look.scheme)
        .onAppear {
            store.boot()
            TextSize.shared.load()
            look.load()
            if !RootView.offline {
                shop.start() // 讀紙之後才問：先用手機上次記的結果，不等網路
                store.isFull = shop.full
                store.fullKnown = true // 知道買了沒才推小工具
                cloud.store = store
                cloud.setAllowed(shop.full && cloud.syncOn) // iCloud 同步是完整版功能：買了而且開著才同步
                ReviewAsk.opened() // 評分提示要數「在幾個不同的日子打開過」
            }
        }
        .onChange(of: shop.asked) { asked in
            // 問過 Apple 買了沒才決定：1.0 同步過、確定沒買的人跳「iCloud 同步改成完整版功能」。
            // 新功能卡片（更新後第一次打開跳一次）照樣記成看過，但上面那個這次有跳就不跳，一次只跳一個（1.1 _layout）
            guard asked, !RootView.offline else { return }
            let entry = News.take(firstRun: Prefs.shared.firstRun)
            if FullNotice.check(book: store.book, full: shop.full) {
                fullNotice = true
            } else {
                newsCard = entry
            }
        }
        .alert(Words.fullNoticeTitle, isPresented: $fullNotice) {
            Button(Words.gotIt, role: .cancel) {}
            Button(Words.seeFull) { sheet = .full }
        } message: {
            Text(Words.fullNoticeBody)
        }
        .alert(store.notice?.title ?? "", isPresented: Binding(get: { store.notice != nil }, set: {
            if !$0 {
                store.notice = nil
            }
        })) {
            Button(Words.gotIt) { store.notice = nil }
        } message: {
            Text(store.notice?.body ?? "")
        }
        .alert(newsCard.map { Words.newsTitle($0.version) } ?? "", isPresented: Binding(get: { newsCard != nil }, set: {
            if !$0 {
                newsCard = nil
            }
        })) {
            Button(Words.ok) { newsCard = nil }
        } message: {
            Text(newsCard.map { $0.points.map { "・\($0)" }.joined(separator: "\n") } ?? "")
        }
        .onChange(of: phase) { now in
            if now == .active {
                store.purgeTrash()
                if !RootView.offline {
                    Task { await shop.refresh() } // 回到前景重問一次買了沒（退款、家人共享收回）
                    ReviewAsk.opened()
                    cloud.pull() // 回到前景去 iCloud 拉一次
                }
            } else {
                store.flush()
                cloud.pushSoon(now: true) // 進背景時不等，馬上傳
                Locks.shared.forgetAll() // 上鎖的紙：離開前景就忘掉這次驗過的，回來要再驗
            }
        }
        // 完整版買了沒：只聽 StoreKit（假資料模式固定當買了，見 makeStore）
        .onReceive(shop.$full) { full in
            if !RootView.offline {
                store.isFull = full
                if cloud.store != nil {
                    cloud.setAllowed(full && cloud.syncOn)
                }
            }
        }
        // iCloud S5：這個 iCloud 裡一張這台同步過的紙都沒有（換了 Apple ID、資料夾被刪）：先停下來問。第一句先答「有沒有損失」
        .alert(Words.newCloudTitle, isPresented: Binding(get: { cloud.asking }, set: { _ in })) {
            Button(Words.notNowCloud, role: .cancel) { cloud.decline() }
            Button(Words.adoptCloud) { cloud.adopt() }
        } message: {
            Text(Words.newCloudBody)
        }
        .onOpenURL { url in
            // 網址只准打開畫面、升起輸入框，不帶資料、解鎖不了任何東西（.vibe/安全標準.md 平台互動、授權段）。
            // 控制中心「記一行」：qieji://new → 回到紙、升起輸入框；完整版功能（1.1 片 B4），沒買的打開付費頁。
            // 鎖住的小工具：qieji://full → 付費頁
            switch url.host {
            case "new":
                dir.close()
                switching = false
                if store.isFull {
                    path.removeAll()
                    sheet = nil
                    store.requestCompose()
                } else {
                    sheet = .full
                }
            case "full":
                dir.close()
                sheet = .full
            default:
                break
            }
        }
    }

    /// 紙、右下 ＋、目錄、切換清單疊在一起：紙是家，其他都從紙上面升起來
    private var paperRoot: some View {
        ZStack {
            // 換紙時底下墊的是上一張的顏色（1.1 2026-11-04）：新的那張淡入時不會先露出奶油底、看起來閃一下
            Tok.note(underKey).paper.ignoresSafeArea()
            if let note = store.current {
                PaperView(
                    store: store, note: note, onTitle: { go(.switcher) }, onRoute: go,
                    onMoveLine: { dir.open(move: $0) }
                )
                .id(note.id)
                .transition(.asymmetric(insertion: .opacity, removal: .identity))
            }
        }
        // 換一張紙：只有新的那張淡入（1.1 S2）。第一次打開 app 那張不淡，交給啟動畫面
        .animation(booted ? Tok.Motion.fade : nil, value: store.currentID)
        .onChange(of: store.currentID) { id in
            DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Motion.fadeSeconds) {
                shownID = id
                underKey = store.current?.color ?? underKey
                booted = true
            }
        }
        .onChange(of: store.current?.color) { key in
            // 同一張換了顏色：底色跟著換（換紙時由上面那段等新的淡入完才換）
            if store.currentID == shownID, let key {
                underKey = key
            }
        }
        // 右下 ＋ 畫在紙外面：換紙時一直停在原地（1.1 PageBarHost）；目錄升起時蓋過它
        .overlay(alignment: .bottomTrailing) {
            PlusButton(shown: store.fabShown && !switching) { store.plusAsk += 1 }
        }
        // 目錄蓋滿整個螢幕：放在 overlay，不然它會把後面的紙一起撐到狀態列底下
        .overlay { DirHost(store: store, model: dir, onRoute: go) }
        // 切換清單（點左上清單名）：自己做的底部面板，蓋在最上面
        .overlay {
            if switching {
                SwitchPanel(
                    store: store, gone: { switching = false }, onManage: { dir.open() }, onFull: { sheet = .full }
                )
            }
        }
    }

    /// 紙上、目錄裡要去別的畫面
    private func go(_ next: Route) {
        switch next {
        case .switcher:
            KeyboardWatch.dismiss()
            switching = true
        case .trash:
            path.append(.trash)
        case .settings:
            KeyboardWatch.dismiss()
            path.append(.settings)
        case .full:
            sheet = .full
        }
    }
}

/// 畫面底下的一條提示（刪掉一行、清掉劃掉的行…），幾秒後自己收，可以按復原。
/// 照 1.1：系統材質的膠囊（iOS 26 液態玻璃）、長的字會換行、出現時 VoiceOver 唸出來
struct ToastBar: View {
    @ObservedObject var store: Store

    var body: some View {
        if let toast = store.toast {
            HStack(spacing: Tok.Space.lg) {
                Text(toast.text)
                    .font(Tok.Font.callout)
                    .foregroundColor(Tok.Col.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if let undo = toast.undo {
                    Button(Words.undo) {
                        undo()
                        store.toast = nil
                    }
                    .font(Tok.Font.callout.weight(.semibold))
                    .foregroundColor(Tok.Col.accent)
                }
            }
            .padding(.horizontal, Tok.Space.lg)
            .padding(.vertical, Tok.Space.md)
            .frost(Capsule())
            .padding(.horizontal, Tok.Space.gutter)
            .padding(.bottom, Tok.Shape.fab + Tok.Space.xl)
            .transition(.opacity)
            .onAppear { UIAccessibility.post(notification: .announcement, argument: toast.text) }
            .task(id: toast.id) {
                try? await Task.sleep(nanoseconds: UInt64(Tok.Timing.toastStay * 1_000_000_000))
                if store.toast?.id == toast.id {
                    store.toast = nil
                }
            }
        }
    }
}

/// 假資料：模擬器看畫面、測手勢用
enum Demo {
    /// 一張漸層圖存成封面檔，回傳代號
    static func cover() -> String? {
        let size = CGSize(width: Covers.width / 2, height: Covers.width / 4)
        let top = UIColor(Tok.note("purple").dot).cgColor, bottom = UIColor(Tok.note("green").dot).cgColor
        let picture = UIGraphicsImageRenderer(size: size).image { ctx in
            let fade = CGGradient(colorsSpace: nil, colors: [top, bottom] as CFArray, locations: nil)
            if let fade {
                ctx.cgContext.drawLinearGradient(fade, start: .zero, end: CGPoint(x: size.width, y: size.height), options: [])
            }
        }
        guard let data = picture.jpegData(compressionQuality: Covers.quality) else { return nil }
        return Covers.shared.save(data)
    }

    static func book() -> Notebook {
        let now = Clock.now()
        var book = Notebook()
        var first = Note.blank(color: "purple", now: now)
        first.title = "今天想到的"
        first.items = [
            Item(text: "茄記改成 SwiftUI，先看紙面順不順"),
            Item(text: "這一行比較長，用來看換行之後行高對不對、字會不會貼到右邊的把手，還有長的行拖起來的樣子"),
            Item(text: "買牛奶"),
            Item(text: "已經想完的事", done: true),
            Item(text: "Mixed 中英 text with English words to check wrapping"),
            Item(text: "回信給出版社"),
        ] + (1 ... 30).map { Item(text: "第 \($0) 行") }
        var second = Tutorial.note(now: now - 1000)
        second.pinned = true
        var third = Note.blank(color: "green", now: now - 2000)
        third.title = "買菜"
        third.items = [Item(text: "青蔥"), Item(text: "豆腐")]
        var pad = Note.blank(color: "blue", now: now - 1500)
        pad.kind = "text"
        pad.title = "記事本"
        pad.body = "這是一張記事本。\n不分行，一整頁照你的意思寫。\n\n第二段在這裡。"
        // 封面圖：畫一張漸層當假照片（看清單的矮橫幅、磚上的照片）
        if let code = Demo.cover() {
            third.cover = code
        }
        book.notes = [first, second, third, pad]
        // 目錄要看得出翻頁、資料夾：再放二十幾張各種顏色的，其中四張收在一個資料夾裡
        let names = [
            "想讀的書", "影片點子", "這週要交", "睡前", "京都行程", "課程大綱", "會議", "講稿", "要催的", "報帳",
            "食譜", "禮物", "健身", "電影", "播客", "靈感", "待買", "修東西", "繳費", "植物", "貓", "旅費", "讀書會", "年度",
        ]
        for (index, name) in names.enumerated() {
            var note = Note.blank(color: NoteColor.keys[index % NoteColor.keys.count], now: now - Double(3000 + index))
            note.title = name
            note.items = [Item(text: name + "的第一行")]
            book.notes.append(note)
        }
        Seats.fixOrder(&book)
        if let order = book.order, order.count > 9 {
            let inside = Array(order[6 ... 9])
            book.folders = [Folder(id: "fdemo", name: "工作", ids: inside)]
            book.order = order.filter { !inside.contains($0) }
            book.order?.insert("fdemo", at: 6)
            Seats.fixOrder(&book)
        }
        return book
    }
}

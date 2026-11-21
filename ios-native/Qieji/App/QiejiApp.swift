import SwiftUI

@main
struct QiejiApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

/// 紙以外的畫面
enum Route: String, Identifiable {
    case switcher // 切換清單（點左上清單名）
    case trash // 最近刪除
    case settings

    var id: String {
        rawValue
    }
}

/// 根畫面：紙是家。打開就是上次那張紙，其他畫面都從紙上面升起來。
struct RootView: View {
    @StateObject private var store = RootView.makeStore()
    @State private var route: Route?
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
        ZStack {
            Tok.Col.page.ignoresSafeArea()
            if let note = store.current {
                if note.locked {
                    LockedPaper(note: note) { route = .switcher }
                } else {
                    PaperView(store: store, note: note, onTitle: { route = .switcher }, onRoute: { route = $0 })
                        .id(note.id)
                        .transition(.opacity)
                }
            }
        }
        .overlay(alignment: .bottom) { ToastBar(store: store) }
        .sheet(item: $route) { sheet($0) }
        .onAppear { store.boot() }
        .onChange(of: phase) { now in
            if now == .active {
                store.purgeTrash()
            } else {
                store.flush()
            }
        }
        .onOpenURL { url in
            // 控制中心「記一行」：qieji://new → 回到紙、升起輸入框。
            // 完整版功能（1.1 片 B4）：沒買的不開輸入框。1.1 是打開付費頁，付費頁還沒搬，先用一句提示
            if url.host == "new" {
                route = nil
                if store.isFull {
                    store.requestCompose()
                } else {
                    store.toast = Store.Toast(text: Words.fullOnlyControl)
                }
            }
        }
    }

    @ViewBuilder
    private func sheet(_ route: Route) -> some View {
        switch route {
        case .switcher: SwitchSheet(store: store) { self.route = nil }
        case .trash: TrashView(store: store) { self.route = nil }
        case .settings: SettingsView { self.route = nil }
        }
    }
}

/// 畫面底下的一條提示（刪掉一行、清掉劃掉的行…），幾秒後自己收，可以按復原
struct ToastBar: View {
    @ObservedObject var store: Store

    var body: some View {
        if let toast = store.toast {
            HStack(spacing: Tok.Space.md) {
                Text(toast.text)
                    .font(Tok.Font.callout)
                    .foregroundColor(Tok.Col.textPrimary)
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
            .frame(minHeight: Tok.Shape.hitMin)
            .background(Capsule().fill(Tok.Col.surface))
            .shadow(
                color: Tok.Col.shadow.opacity(Tok.Shape.shadowSoft),
                radius: Tok.Shape.shadowRadius, x: 0, y: Tok.Shape.shadowY
            )
            .padding(.bottom, Tok.Space.xxl + Tok.Shape.fab)
            .transition(.opacity)
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
        book.notes = [first, second, third]
        Seats.fixOrder(&book)
        return book
    }
}

import SwiftUI

/// 目錄面板掛在紙的上面。只有這一層看著目錄的狀態，紙不會跟著目錄每一格重畫
struct DirHost: View {
    @ObservedObject var store: Store
    @ObservedObject var model: DirModel
    let onRoute: (Route) -> Void

    var body: some View {
        if model.shown {
            DirPanel(store: store, model: model, onRoute: onRoute)
        }
    }
}

/// 目錄面板（清單總覽）：自己做的面板，從螢幕下面升上來，上面留一截看得到後面的紙。
/// 開：切換清單的「管理所有清單」、行的「搬到…」。收：點上面露出的那截紙、把頂端把手往下拉、點一塊磚。
/// 裡面：搜尋、新的一張、方磚（一排四塊、放不下往右一頁）、資料夾、最近刪除、設定。
/// 整層蓋滿螢幕（不避開瀏海和底部），所以裡面量到的位置就是螢幕座標，拖曳不用換算。
struct DirPanel: View {
    @ObservedObject var store: Store
    @ObservedObject var model: DirModel
    let onRoute: (Route) -> Void
    @State private var glyphText = ""

    static let space = "dirPanel"

    var body: some View {
        pinned
            .ignoresSafeArea()
            .allowsHitTesting(model.isOpen)
            .onChange(of: store.book) { _ in model.bookChanged() }
            .onChange(of: model.query) { _ in model.page = 0 }
            .onChange(of: model.glyphFor) { id in
                glyphText = id.flatMap { store.book.note($0)?.glyph } ?? ""
            }
            .alert(deleteTitle, isPresented: flag(\.askDelete)) {
                Button(Words.delete, role: .destructive) {
                    if let id = model.askDelete {
                        model.delete(id)
                    }
                }
                Button(Words.cancel, role: .cancel) {}
            }
            .alert(Words.glyphEdit, isPresented: flag(\.glyphFor)) {
                TextField(Words.glyphHint, text: $glyphText)
                Button(Words.done) { saveGlyph() }
                Button(Words.cancel, role: .cancel) {}
            }
            .confirmationDialog(Words.putIn, isPresented: flag(\.putInFor), titleVisibility: .visible) { folderChoices }
    }

    /// 整層釘在螢幕左上角：量自己現在被放在螢幕的哪裡，再扣回去。
    /// 鍵盤升起時外面那層會變矮、被往上推，目錄不能跟著動（搜尋列會跑到狀態列底下）
    private var pinned: some View {
        GeometryReader { proxy in
            let origin = proxy.frame(in: .global).origin
            layers
                .frame(width: model.screen.width, height: model.screen.height, alignment: .topLeading)
                .offset(x: -origin.x, y: -origin.y)
        }
    }

    private var layers: some View {
        ZStack(alignment: .topLeading) {
            Tok.Col.scrim
                .opacity(Double(model.progress))
                .contentShape(Rectangle())
                .onTapGesture { model.tapOut() }
                .accessibilityLabel(model.editing ? Words.doneEditing : Words.closeDir)
                .accessibilityAddTraits(.isButton)
            sheet
                .coordinateSpace(name: DirPanel.space)
                .offset(y: model.fading ? 0 : (model.screen.height - Tok.Shape.dirPeek) * (1 - model.progress))
                .opacity(model.fading ? Double(model.progress) : 1)
        }
    }

    /// 「有值＝開著」的那種狀態，換成提示框要的開關
    private func flag(_ path: ReferenceWritableKeyPath<DirModel, String?>) -> Binding<Bool> {
        Binding(get: { model[keyPath: path] != nil }, set: { open in
            if !open {
                model[keyPath: path] = nil
            }
        })
    }

    private var deleteTitle: String {
        Words.deleteTitle(model.askDelete.flatMap { store.book.note($0) }.map { Labels.label($0) } ?? "")
    }

    private func saveGlyph() {
        guard let id = model.glyphFor else { return }
        if let problem = Labels.glyphProblem(glyphText) {
            store.toast = Store.Toast(text: problem)
        } else {
            store.setGlyph(id, glyphText)
        }
    }

    @ViewBuilder private var folderChoices: some View {
        if let id = model.putInFor {
            ForEach(Seats.seatedEntries(store.book).compactMap(\.folder)) { folder in
                Button(folder.name) { model.moveInto(id, folder: folder.id) }
            }
            Button(Words.newFolder) { model.makeFolder(for: id) }
        }
        Button(Words.cancel, role: .cancel) {}
    }

    // MARK: 面板

    private var sheet: some View {
        ZStack(alignment: .topLeading) {
            // 面板的底：上緣圓角，從 dirPeek 往下鋪到底（點到面板空白處不會穿過去收起）
            RoundedRectangle(cornerRadius: Tok.Shape.radiusLg, style: .continuous)
                .fill(Tok.Col.surface)
                .shadow(
                    color: Tok.Col.shadow.opacity(Tok.Shape.shadowSoft),
                    radius: Tok.Shape.shadowRadius, x: 0, y: -Tok.Shape.shadowY
                )
                .padding(.top, Tok.Shape.dirPeek)
                .padding(.bottom, -Tok.Shape.radiusLg)
                .onTapGesture {}
                .accessibilityHidden(true)
            VStack(spacing: Tok.Space.zero) {
                grabber
                topBar
                moveHead
                content
                dots
                rows
            }
            .padding(.top, Tok.Shape.dirPeek)
            .padding(.bottom, model.safeBottom)
            if let entry = model.openEntry {
                DirFolderView(model: model, entry: entry, currentID: store.currentID)
            }
            DirGhostView(ghost: model.ghost)
            if let menu = model.menu, let note = store.book.note(menu.id), !note.deleted {
                DirMenuView(model: model, menu: menu, note: note, current: note.id == store.currentID)
            }
            if let launch = model.launch {
                DirLaunchView(launch: launch, size: model.screen) { model.close(fade: true) }
            }
        }
        .frame(width: model.screen.width, height: model.screen.height, alignment: .topLeading)
    }

    /// 頂端把手：點一下收起、往下拉跟著手指收下去。抖動中、選單開著時不能拉
    private var grabber: some View {
        Capsule()
            .fill(Tok.Col.textSecondary)
            .opacity(Tok.Shape.handleOff)
            .frame(width: Tok.Shape.handleSolo, height: Tok.Shape.dirGrab)
            .frame(maxWidth: .infinity)
            .frame(height: Tok.Shape.hitMin)
            .contentShape(Rectangle())
            .onTapGesture { model.tapOut() }
            .gesture(
                DragGesture(minimumDistance: Tok.Gesture.pullActivate, coordinateSpace: .global)
                    .onChanged { model.pull($0.translation.height) }
                    .onEnded { model.pullEnd($0.translation.height, ahead: $0.predictedEndTranslation.height - $0.translation.height) }
            )
            .accessibilityLabel(model.editing ? Words.doneEditing : Words.closeDir)
            .accessibilityAddTraits(.isButton)
    }

    /// 搜尋列＋新的一張；抖動中右邊那顆換成「完成」
    private var topBar: some View {
        let hint = model.movingItem == nil ? Words.searchAll : Words.search
        return HStack(spacing: Tok.Space.md) {
            HStack(spacing: Tok.Space.sm) {
                Image(systemName: "magnifyingglass")
                    .font(Tok.Font.body)
                    .foregroundColor(Tok.Col.textSecondary)
                TextField(hint, text: $model.query)
                    .font(Tok.Font.body)
                    .foregroundColor(Tok.Col.textPrimary)
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                    .disabled(model.editing)
                if !model.query.isEmpty {
                    Button { model.query = "" } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(Tok.Font.body)
                            .foregroundColor(Tok.Col.textSecondary)
                    }
                    .accessibilityLabel(Words.clearSearch)
                }
            }
            .padding(.horizontal, Tok.Space.md)
            .frame(height: Tok.Shape.hitMin)
            .background(RoundedRectangle(cornerRadius: Tok.Shape.radiusSm, style: .continuous).fill(Tok.Col.searchFill))
            .opacity(model.editing ? Tok.Motion.pressDim : 1)
            if model.editing {
                Button { model.editing = false } label: {
                    Text(Words.done)
                        .font(Tok.Font.headline)
                        .foregroundColor(Tok.Col.textPrimary)
                        .padding(.horizontal, Tok.Space.lg)
                        .frame(height: Tok.Shape.hitMin)
                        .background(Capsule().fill(Tok.Col.page))
                }
            } else {
                Button { model.add() } label: {
                    Image(systemName: "plus")
                        .font(Tok.Font.headline)
                        .foregroundColor(Tok.Col.textPrimary)
                        .frame(width: Tok.Shape.hitMin, height: Tok.Shape.hitMin)
                        .background(Circle().fill(Tok.Col.page))
                }
                .accessibilityLabel(model.movingItem == nil ? Words.newNote : Words.moveToNew)
            }
        }
        .padding(.horizontal, Tok.Space.gutter)
        .padding(.bottom, Tok.Space.sm)
    }

    @ViewBuilder private var moveHead: some View {
        if let item = model.movingItem {
            Text(Words.moveHead(Labels.trim(item.text)))
                .font(Tok.Font.callout)
                .foregroundColor(Tok.Col.textSecondary)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Tok.Space.gutter)
                .padding(.bottom, Tok.Space.sm)
        }
    }

    @ViewBuilder private var content: some View {
        if model.searching, model.movingItem == nil {
            DirSearchList(store: store, model: model)
        } else if model.searching {
            DirPickGrid(store: store, model: model)
        } else {
            grid
        }
    }

    /// 多頁：一頁放幾列照格子區的高度算，放不下往右一頁；整頁翻是系統的分頁捲動（DirHook 掛上去的）
    private var grid: some View {
        GeometryReader { proxy in
            let frame = proxy.frame(in: .named(DirPanel.space))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: Tok.Space.zero) {
                    ForEach(Array(model.pages.enumerated()), id: \.offset) { number, items in
                        DirPageView(model: model, items: items, currentID: store.currentID)
                            .padding(.horizontal, Tok.Space.lg)
                            .padding(.top, Tok.Space.sm + Tok.Space.md)
                            .frame(width: model.screen.width, height: proxy.size.height, alignment: .topLeading)
                            .accessibilityElement(children: .contain)
                            .accessibilityLabel(model.pages.count > 1 ? Words.pageVoice(number + 1, model.pages.count) : "")
                    }
                }
                .background(DirHook(touch: model.gridTouch))
            }
            .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
            .onAppear { model.gridFrame = frame }
            .onChange(of: frame) { model.gridFrame = $0 }
        }
    }

    /// 頁點：幾頁幾個，亮的是現在這頁；只有一頁不印
    @ViewBuilder private var dots: some View {
        let count = model.pages.count
        if !model.searching, count > 1 {
            let now = min(model.page, count - 1)
            HStack(spacing: Tok.Space.sm) {
                ForEach(0 ..< count, id: \.self) { index in
                    Circle()
                        .fill(Tok.Col.textSecondary)
                        .opacity(index == now ? 1 : Tok.Shape.handleOff)
                        .frame(width: Tok.Shape.pageDot, height: Tok.Shape.pageDot)
                }
            }
            .padding(.vertical, Tok.Space.sm)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Words.pageVoice(now + 1, count))
        }
    }

    /// 最近刪除、設定：固定在格子下面，每一頁都看得到；等面板收完再推進去
    private var rows: some View {
        VStack(spacing: Tok.Space.zero) {
            if model.trashed > 0 {
                row("trash", Words.trash, count: model.trashed) { model.close { onRoute(.trash) } }
                    .accessibilityLabel(Words.trashVoice(model.trashed))
            }
            row("gearshape", Words.settings, count: nil) { model.close { onRoute(.settings) } }
        }
        .padding(.horizontal, Tok.Space.lg)
        .disabled(model.editing)
    }

    private func row(_ symbol: String, _ title: String, count: Int?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: Tok.Space.sm) {
                Image(systemName: symbol)
                Text(title)
                Spacer()
                if let count {
                    Text(String(count))
                }
                Image(systemName: "chevron.right").font(Tok.Font.label)
            }
            .font(Tok.Font.body)
            .foregroundColor(Tok.Col.textSecondary)
            .padding(.vertical, Tok.Space.md)
            .frame(minHeight: Tok.Shape.hitMin)
            .overlay(alignment: .top) { Tok.Col.separator.frame(height: Tok.Shape.hairline) }
            .contentShape(Rectangle())
        }
    }
}

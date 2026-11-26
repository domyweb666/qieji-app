import SwiftUI
import UIKit

/// 紙最上面（照 1.1.1）：左邊清單名的小膠囊（點了切換清單）、右邊 ⋯；
/// 下面一列左邊「多久前」、右邊完整時間，底下一條格線。名字離左邊 20，跟時間、每一行的字對齊
struct PaperHeader: View {
    @ObservedObject var store: Store
    let note: Note
    let colors: Tok.NoteColors
    @Binding var renaming: Bool
    /// 鍵盤升降只叫標題列重畫（✓ 跟鍵盤同一刻進出），不叫整張紙
    @ObservedObject var keyboard: KeyboardWatch
    /// 在行裡、清單名、記事本打字：鍵盤也開著才畫 ✓
    var typing = false
    let onTitle: () -> Void
    let onDone: () -> Void
    let onRoute: (Route) -> Void
    let onRename: () -> Void
    let onPinFull: ([Note]) -> Void
    var onCover: () -> Void = {}
    var onLock: () -> Void = {}
    var onDelete: () -> Void = {}
    /// 上鎖、還沒驗過：⋯ 裡拿不到內容的項目都不列
    var lockedNow = false
    /// 封面圖：沒有／清單的矮橫幅（標題列的底與小膠囊隨捲動淡進來，時間列在捲動內容裡）／記事本的固定大圖（標題列疊在圖上）
    var cover: CoverMode = .none
    /// 紙張材質（純色＝nil）：有封面圖時淡進來的那塊底也要有
    var grain: PaperGrain.Paint?
    @FocusState private var titleFocused: Bool

    private var showDone: Bool {
        keyboard.up && typing
    }

    enum CoverMode {
        case none
        case floating(ScrollSpy)
        case fixed
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Tok.Space.zero) {
            HStack(spacing: Tok.Space.sm) {
                if renaming {
                    titleField
                } else if case let .floating(spy) = cover {
                    // 在最上面時不畫（名字已經用大字寫在圖下面），大字捲進標題列後面時淡進來接手
                    SpyFade(spy: spy, start: { $0.nameEnd - Tok.Space.xl }, content: { titlePill }).modifier(FreshPaper(id: note.id))
                } else {
                    titlePill.modifier(FreshPaper(id: note.id))
                }
                Spacer(minLength: Tok.Space.sm)
                Menu {
                    PaperMenu(
                        store: store, note: note, onRoute: onRoute, onRename: onRename, onPinFull: onPinFull,
                        onCover: onCover, onLock: onLock, onDelete: onDelete, lockedNow: lockedNow
                    )
                } label: {
                    Image(systemName: "ellipsis")
                        .font(Tok.Font.barIcon)
                        .foregroundColor(Tok.Col.textPrimary)
                        .frame(width: Tok.Shape.hitMin, height: Tok.Shape.hitMin)
                        .frost(Circle(), interactive: true)
                }
                .accessibilityLabel(Words.menu)
                // 打字時 ⋯ 右邊多一顆茄紫 ✓（照 iOS 提醒事項），⋯ 用鍵盤的時鐘滑過去讓位
                if showDone {
                    DoneButton(action: onDone).transition(.opacity)
                }
            }
            .animation(Tok.Motion.keyboard, value: showDone)
            .padding(.leading, Tok.Space.lg)
            .padding(.trailing, Tok.Space.gutter)
            .padding(.top, Tok.Space.sm)
            .padding(.bottom, floating == nil ? Tok.Space.zero : Tok.Space.sm)
            .background {
                // 有封面圖的清單：圖收到剩一小截時，標題列的底（紙色＋格線）淡進來，之後行從它後面捲過去
                if let spy = floating {
                    SpyFade(spy: spy, start: { _ in Tok.Shape.coverBelowBar - Tok.Space.xl }, content: {
                        colors.paper
                            .overlay {
                                if let grain {
                                    PaperGrainView(paint: grain).accessibilityHidden(true)
                                }
                            }
                            .overlay(alignment: .bottom) { colors.rule.frame(height: Tok.Shape.borderCard) }
                            .ignoresSafeArea(edges: .top)
                    })
                }
            }
            if case .none = cover {
                TimeRow(note: note, colors: colors).modifier(FreshPaper(id: note.id))
            }
        }
    }

    private var floating: ScrollSpy? {
        if case let .floating(spy) = cover {
            return spy
        }
        return nil
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
        // 看現在的資料：交下來的 note 可能慢一拍，照它畫會把剛打的字蓋回去
        Binding(get: { store.book.note(note.id)?.title ?? note.title }, set: { value in
            let before = store.book.note(note.id)?.title ?? note.title
            guard value.contains("\n") else {
                store.setTitle(note.id, value)
                return
            }
            let typedReturn = value.hasSuffix("\n") && (value as NSString).length == (before as NSString).length + 1
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
            .background {
                // 記事本疊在封面圖上：膠囊補白底（多米選白底，不用玻璃）
                if case .fixed = cover {
                    Capsule().fill(Tok.Col.surface)
                }
            }
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
    var onCover: () -> Void = {}
    var onLock: () -> Void = {}
    var onDelete: () -> Void = {}
    var lockedNow = false

    var body: some View {
        colors
        Button(action: onRename) { Label(Words.rename, systemImage: "pencil") }
        // 完整版功能沒買就不列（2026-11-14 多米：列出來點了才說要買，看了煩）；已經放好的封面、上了的鎖照樣拿得掉
        if store.isFull, !lockedNow {
            Button(action: onCover) {
                Label(note.cover == nil ? Words.coverPut : Words.coverSwap, systemImage: "photo")
            }
        }
        if note.cover != nil, !lockedNow {
            Button { store.clearCover(note.id) } label: { Label(Words.coverRemove, systemImage: "rectangle.slash") }
        }
        if note.locked || store.isFull {
            Button(action: onLock) {
                Label(note.locked ? Words.lockOff : Words.lockOn, systemImage: note.locked ? "lock.open" : "lock")
            }
        }
        Button {
            if let pins = store.pinOrAsk(note.id) {
                onPinFull(pins)
            }
        } label: {
            Label(note.pinned ? Words.unpin : Words.pin, systemImage: note.pinned ? "pin.slash" : "pin")
        }
        if !lockedNow {
            ShareLink(item: shareText) { Label(Words.share, systemImage: "square.and.arrow.up") }
            Button {
                UIPasteboard.general.string = shareText
                store.toast = Store.Toast(text: Words.copied)
            } label: { Label(Words.copyAll, systemImage: "doc.on.doc") }
        }
        if listGroup, !lockedNow {
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
        Button(role: .destructive, action: onDelete) { Label(Words.deleteNote, systemImage: "trash") }
    }

    private var anyDone: Bool {
        note.items.contains(where: \.done)
    }

    private var listGroup: Bool {
        !note.isText && (note.items.count >= 2 || anyDone)
    }

    /// 分享、複製全文：名字空一行，再來每行編號
    private var shareText: String {
        let note = store.book.note(note.id) ?? note // 打到一半的字也要在（打字不會每個字都重畫這裡）
        return (note.title.isEmpty ? "" : note.title + "\n\n") + PerfMeter.time("plain") { Labels.plain(note) }
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
        // 有封面圖的用圖（1.1 完整版）；上鎖的紙不露圖
        Group {
            if let photo = Covers.shared.image(note) {
                Image(uiImage: photo).resizable().scaledToFill()
            } else {
                shape.fill(colors.dot)
                    .overlay(
                        Text(Labels.glyph(note))
                            .font(Tok.Font.glyph(side))
                            .foregroundColor(colors.ink)
                            .minimumScaleFactor(0.5)
                    )
            }
        }
        .frame(width: side, height: side)
        .clipShape(shape)
        .overlay(shape.strokeBorder(colors.rule, lineWidth: Tok.Shape.borderCard))
        .accessibilityHidden(true)
    }
}

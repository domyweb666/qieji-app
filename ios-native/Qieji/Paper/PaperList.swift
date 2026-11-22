import SwiftUI
import UIKit

struct RowFramesKey: PreferenceKey {
    static var defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue()) { _, new in new }
    }
}

/// 紙上的清單：一行一行、可以捲。手勢在 ListTouch，資料在 Store。
struct PaperList: View {
    @ObservedObject var store: Store
    @ObservedObject var touch: ListTouch
    let note: Note
    @Binding var editingID: String?
    @Binding var focus: FocusAsk?
    let colors: Tok.NoteColors
    /// 按住一行：id 和那一行在螢幕上的底邊
    var onMenu: (String, CGFloat) -> Void = { _, _ in }
    /// 紙上的字級（完整版）
    var scale: CGFloat = 1
    @Environment(\.accessibilityReduceMotion) private var calm

    static let space = "paperList"

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: Tok.Space.zero) {
                    ForEach(Array(note.items.enumerated()), id: \.element.id) { index, item in
                        row(item, index: index)
                    }
                    if note.items.isEmpty {
                        EmptyNote(lines: [Words.emptyPaper, Words.emptyPaperTip])
                    }
                }
                .coordinateSpace(name: PaperList.space)
                .background(ScrollHook(touch: touch))
                .padding(.bottom, Tok.Space.belowList)
                .onPreferenceChange(RowFramesKey.self) { touch.frames = $0 }
            }
            .scrollDismissesKeyboard(.interactively)
            .overlay(alignment: .top) { floating }
            .clipped()
            .onAppear { wire(proxy) }
            .onChange(of: note.items.map(\.id)) { touch.order = $0 }
            .onChange(of: note.id) { _ in wire(proxy) }
        }
    }

    private func row(_ item: Item, index: Int) -> some View {
        let held = touch.dragID == item.id
        let sliding = touch.swipeID == item.id
        let slide = touch.slides[item.id] ?? 0
        let armed = sliding && touch.swipeArmed
        return PaperRow(
            item: item,
            editing: editingID == item.id,
            focus: editingID == item.id ? focus : nil,
            colors: colors,
            slide: slide,
            armed: armed,
            glow: touch.glow(slide, armed: armed),
            labelScale: sliding ? touch.labelScale : 1,
            fresh: touch.fresh == item.id,
            onFreshDone: {
                if touch.fresh == item.id {
                    touch.fresh = nil
                }
            },
            held: held,
            scale: scale,
            actions: actions(for: item.id),
            voice: voiceActions(item, index: index)
        )
        // 拖著的那一行另外畫一份浮在上面（floating）；清單裡這份先藏起來、位子留著。從選單刪的行先淡出；
        // 減少動態時劃掉整行暗一下再亮回、刪除淡出
        .opacity(held || touch.fading.contains(item.id) ? 0 : touch.dims[item.id] ?? 1)
        .offset(y: held ? 0 : touch.giveWay(index: index))
        .animation(held || calm ? nil : Tok.Motion.dragShift, value: touch.dragTo)
        .background(GeometryReader { geo in
            Color.clear.preference(key: RowFramesKey.self, value: [item.id: geo.frame(in: .named(PaperList.space))])
        })
        .id(item.id)
    }

    /// 拖著排順序的那一行：浮在清單上面跟著手指。不放在清單裡，紙自己捲得再遠它都在
    @ViewBuilder private var floating: some View {
        if let id = touch.dragID, let item = note.items.first(where: { $0.id == id }) {
            // 拿起那一刻 0.15 秒浮起來（放大一點＋陰影，1.1 dragLift），不是一出現就是浮著的
            Lifting { up in
                PaperRow(
                    item: item, editing: false, focus: nil, colors: colors, slide: 0, armed: false, held: up,
                    scale: scale, actions: LineActions(), voice: []
                )
            }
            .id(id)
            .offset(y: touch.floatY)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    /// VoiceOver 用不了滑動和拖曳：從動作選單（上下滑）劃掉、刪除、移動
    private func voiceActions(_ item: Item, index: Int) -> [VoiceAct] {
        // 空行沒有「劃掉」（1.1 一樣）；從這裡劃掉也震一下
        var out: [VoiceAct] = []
        if !Labels.trim(item.text).isEmpty {
            out.append(VoiceAct(name: item.done ? Words.unstrike : Words.strike) {
                store.toggle(item.id)
                Haptic.tick()
            })
        }
        out.append(VoiceAct(name: Words.deleteLine) { store.binLine(item.id) })
        if index > 0 {
            out.append(VoiceAct(name: Words.moveUp) { store.move(item.id, to: index - 1) })
        }
        if index < note.items.count - 1 {
            out.append(VoiceAct(name: Words.moveDown) { store.move(item.id, to: index + 1) })
        }
        return out
    }

    /// 清單的手勢接到資料上
    private func wire(_: ScrollViewProxy) {
        touch.order = note.items.map(\.id)
        touch.onStrike = { store.toggle($0) }
        touch.onDelete = { id in
            if editingID == id {
                editingID = nil
            }
            store.binLine(id)
        }
        touch.onMove = { store.move($0, to: $1) }
        touch.onTap = { id, point in
            editingID = id
            focus = FocusAsk(token: Tick.next(), point: point)
        }
        // 點空白處：收鍵盤（打字中的行收起；輸入框開著就記下來再收）
        touch.onTapBlank = {
            editingID = nil
            KeyboardWatch.dismiss()
        }
        touch.onLongPress = { onMenu($0, $1) }
        // 拿起一行排順序：收鍵盤（1.1）
        touch.onDragBegan = {
            editingID = nil
            KeyboardWatch.dismiss()
        }
    }

    private func actions(for id: String) -> LineActions {
        LineActions(
            change: { store.setText(id, $0) },
            end: { _ in
                if editingID == id {
                    editingID = nil
                }
                store.dropIfEmpty(id)
            },
            joinUp: { text in
                guard let joined = store.joinUp(id, text: text) else { return false }
                editingID = joined.id
                focus = FocusAsk(token: Tick.next(), caret: joined.at)
                return true
            }
        )
    }
}

/// 出現那一刻把 up 從 false 動畫到 true（拿起的行浮起來用）
struct Lifting<Content: View>: View {
    @ViewBuilder let content: (Bool) -> Content
    @State private var up = false

    var body: some View {
        content(up).onAppear { withAnimation(Tok.Motion.dragLift) { up = true } }
    }
}

/// VoiceOver 動作選單裡的一項
struct VoiceAct {
    let name: String
    let run: () -> Void
}

/// 每次要對焦都拿一個新號碼
enum Tick {
    private static var count = 0
    static func next() -> Int {
        count += 1
        return count
    }
}

/// 一行：底下是滑動時露出來的「劃掉／刪除」，上面是字和把手
struct PaperRow: View {
    let item: Item
    let editing: Bool
    let focus: FocusAsk?
    let colors: Tok.NoteColors
    let slide: CGFloat
    let armed: Bool
    var glow: Double = 1
    var labelScale: CGFloat = 1
    var fresh = false
    var onFreshDone: () -> Void = {}
    let held: Bool
    var scale: CGFloat = 1
    let actions: LineActions
    let voice: [VoiceAct]
    @Environment(\.accessibilityReduceMotion) private var calm

    var body: some View {
        ZStack {
            if slide != 0 {
                SwipeUnder(slide: slide, glow: glow, scale: labelScale, done: item.done)
            }
            // 照 1.1：字從左 20 起、離把手 8；把手 44 寬、貼右邊，六個點對齊第一行字（不是整則的正中間）；
            // 底下一條 1 點格線，一行字的高是 52＋1
            VStack(spacing: Tok.Space.zero) {
                HStack(alignment: .top, spacing: Tok.Space.zero) {
                    LineText(
                        text: item.text, done: item.done, editing: editing, focus: focus,
                        ink: UIColor(Tok.Col.textPrimary), strikeInk: UIColor(Tok.Col.textStrike), actions: actions, voice: voice,
                        scale: scale
                    )
                    .padding(.leading, Tok.Space.gutter)
                    .padding(.trailing, Tok.Space.sm)
                    GripDots()
                        .frame(width: Tok.Shape.hitMin, height: Tok.Shape.rowMin)
                        .accessibilityHidden(true)
                }
                .frame(minHeight: Tok.Shape.rowMin, alignment: .top)
                colors.rule.frame(height: Tok.Shape.borderCard)
            }
            .background(ZStack {
                colors.paper
                if editing {
                    Tok.Col.rowEditingFill
                }
                if fresh {
                    FreshGlow(done: onFreshDone)
                }
            })
            .offset(x: slide)
            .scaleEffect(held && !calm ? Tok.Motion.dragLiftScale : 1)
            .shadow(
                color: Tok.Col.shadow.opacity(held ? Tok.Shape.shadowSoft : 0),
                radius: Tok.Shape.shadowRadius, x: 0, y: Tok.Shape.shadowY
            )
            .animation(calm ? nil : Tok.Motion.dragLift, value: held)
        }
    }
}

/// 把手：2 欄 × 3 列六個淺點
struct GripDots: View {
    var body: some View {
        HStack(spacing: Tok.Shape.gripDotGap) {
            ForEach(0 ..< 2, id: \.self) { _ in
                VStack(spacing: Tok.Shape.gripDotGap) {
                    ForEach(0 ..< 3, id: \.self) { _ in
                        Circle().frame(width: Tok.Shape.gripDot, height: Tok.Shape.gripDot)
                    }
                }
            }
        }
        .foregroundColor(Tok.Col.textSecondary.opacity(Tok.Shape.gripDotOpacity))
    }
}

/// 滑動時行底下露出來的那一層：往右是暖灰＋「劃掉」，往左是紅＋「刪除」。越線那一刻字放大彈一下
struct SwipeUnder: View {
    let slide: CGFloat
    let glow: Double // 越接近門檻越亮，越線全亮
    let scale: CGFloat // 越線那一刻放大再彈回
    let done: Bool

    var body: some View {
        let right = slide > 0
        ZStack(alignment: right ? .leading : .trailing) {
            right ? Tok.Col.swipeStrikeBg : Tok.Col.swipeDeleteBg
            Text(right ? (done ? Words.unstrike : Words.strike) : Words.delete)
                .font(Tok.Font.callout.weight(.semibold))
                .foregroundColor(Tok.Col.textOnSwipe)
                .opacity(glow)
                .scaleEffect(scale)
                .padding(.horizontal, Tok.Space.gutter)
        }
        .accessibilityHidden(true)
    }
}

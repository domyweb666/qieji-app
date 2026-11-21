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
    @Binding var menuID: String?
    let colors: Tok.NoteColors
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
                        Text(Words.emptyPaper)
                            .font(Tok.Font.callout)
                            .foregroundColor(Tok.Col.textMuted)
                            .padding(Tok.Space.xl)
                    }
                }
                .coordinateSpace(name: PaperList.space)
                .background(ScrollHook(touch: touch))
                .padding(.bottom, Tok.Space.belowList)
                .onPreferenceChange(RowFramesKey.self) { touch.frames = $0 }
            }
            .scrollDismissesKeyboard(.interactively)
            .onAppear { wire(proxy) }
            .onChange(of: note.items.map(\.id)) { touch.order = $0 }
            .onChange(of: note.id) { _ in wire(proxy) }
        }
    }

    private func row(_ item: Item, index: Int) -> some View {
        let held = touch.dragID == item.id
        let sliding = touch.swipeID == item.id
        return PaperRow(
            item: item,
            editing: editingID == item.id,
            focus: editingID == item.id ? focus : nil,
            colors: colors,
            slide: sliding ? touch.swipeTx : 0,
            armed: sliding && touch.swipeArmed,
            held: held,
            actions: actions(for: item.id),
            voice: voiceActions(item, index: index)
        )
        .offset(y: held ? touch.dragDy : touch.giveWay(index: index))
        .animation(held || calm ? nil : Tok.Motion.dragShift, value: touch.dragTo)
        .zIndex(held ? 1 : 0)
        .background(GeometryReader { geo in
            Color.clear.preference(key: RowFramesKey.self, value: [item.id: geo.frame(in: .named(PaperList.space))])
        })
        .id(item.id)
    }

    /// VoiceOver 用不了滑動和拖曳：從動作選單（上下滑）劃掉、刪除、移動
    private func voiceActions(_ item: Item, index: Int) -> [VoiceAct] {
        var out = [
            VoiceAct(name: item.done ? Words.unstrike : Words.strike) { store.toggle(item.id) },
            VoiceAct(name: Words.deleteLine) { store.binLine(item.id) },
        ]
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
        touch.onTapBlank = { editingID = nil }
        touch.onLongPress = { menuID = $0 }
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
            split: { before, after in
                guard let next = store.split(id, before: before, after: after) else { return }
                editingID = next
                focus = FocusAsk(token: Tick.next(), atStart: true)
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
    let held: Bool
    let actions: LineActions
    let voice: [VoiceAct]
    @Environment(\.accessibilityReduceMotion) private var calm

    var body: some View {
        ZStack {
            if slide != 0 {
                SwipeUnder(slide: slide, armed: armed, done: item.done)
            }
            HStack(spacing: Tok.Space.zero) {
                LineText(
                    text: item.text, done: item.done, editing: editing, focus: focus,
                    ink: UIColor(Tok.Col.textPrimary), strikeInk: UIColor(Tok.Col.textStrike), actions: actions, voice: voice
                )
                .padding(.leading, Tok.Space.lg)
                GripDots()
                    .frame(width: Tok.Shape.hitMin)
                    .padding(.horizontal, Tok.Space.xs)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: Tok.Shape.rowMin)
            .background(ZStack {
                colors.paper
                if editing {
                    Tok.Col.rowEditingFill
                }
            })
            .overlay(alignment: .bottom) { colors.rule.frame(height: Tok.Shape.hairline) }
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
    let armed: Bool
    let done: Bool

    var body: some View {
        let right = slide > 0
        ZStack(alignment: right ? .leading : .trailing) {
            right ? Tok.Col.swipeStrikeBg : Tok.Col.swipeDeleteBg
            Text(right ? (done ? Words.unstrike : Words.strike) : Words.delete)
                .font(Tok.Font.headline)
                .foregroundColor(Tok.Col.textOnSwipe)
                .opacity(armed ? 1 : Tok.Motion.swipeLabelFrom)
                .scaleEffect(armed ? Tok.Motion.swipeLabelArm : 1)
                .animation(Tok.Motion.swipeLabel, value: armed)
                .padding(.horizontal, Tok.Space.gutter)
        }
    }
}

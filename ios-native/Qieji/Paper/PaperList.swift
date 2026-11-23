import SwiftUI
import UIKit

/// 紙上的清單：畫面在 LineListView（原生捲動區），這裡只負責把資料和動作接過去
struct PaperList: UIViewRepresentable {
    let store: Store
    let remote: ListRemote
    let note: Note
    /// 進到哪一行打字（nil＝沒有）
    let onEditing: (String?) -> Void
    /// 按住一行：id 和那一行在螢幕上的底邊
    var onMenu: (String, CGFloat) -> Void = { _, _ in }
    /// 紙上的字級（完整版）
    var scale: CGFloat = 1
    /// 捲動內容最前面那一塊（有封面圖的清單：方磚、大字名字、時間列）
    var head: AnyView?

    static let space = "paperList"

    func makeUIView(context _: Context) -> LineListView {
        let list = LineListView(frame: .zero)
        list.spy = remote.spy
        remote.list = list
        wire(list)
        list.restyle(LineLook(key: note.color, scale: scale))
        list.setHead(front)
        list.apply(LineListView.items(note), animated: false)
        seek(list)
        return list
    }

    func updateUIView(_ list: LineListView, context _: Context) {
        remote.list = list
        wire(list)
        list.restyle(LineLook(key: note.color, scale: scale))
        list.setHead(front)
        list.apply(LineListView.items(note), animated: true)
        seek(list)
    }

    static func dismantleUIView(_ list: LineListView, coordinator _: ()) {
        list.dismantle()
    }

    /// 封面那一塊；一行都沒有時再加兩行說明
    private var front: AnyView? {
        let empty = note.items.isEmpty
        guard head != nil || empty else { return nil }
        return AnyView(
            VStack(spacing: Tok.Space.zero) {
                if let head {
                    head
                }
                if empty {
                    EmptyNote(lines: [Words.emptyPaper, Words.emptyPaperTip])
                }
            }
            .coordinateSpace(name: PaperList.space)
        )
    }

    /// 從搜尋點一行過來（1.1 Paper seekRow）：換紙那一下清單還沒排好，晚一格再捲
    private func seek(_ list: LineListView) {
        guard let line = store.takeSeek(in: note) else { return }
        DispatchQueue.main.async { [weak list] in list?.seek(line) }
    }

    /// 清單的手勢接到資料上
    private func wire(_ list: LineListView) {
        let id = note.id, store = store
        list.source = { [weak store] in store?.book.note(id).map(LineListView.items) ?? [] }
        list.onEditing = onEditing
        list.onChange = { store.setText($0, $1) }
        list.onEnd = { store.dropIfEmpty($0) }
        list.onJoinUp = { store.joinUp($0, text: $1) }
        list.onStrike = { store.toggle($0) }
        list.onDelete = { store.binLine($0) }
        list.onMove = { store.move($0, to: $1) }
        list.onMenu = onMenu
        // 點空白處：收鍵盤（打字中的行收起；輸入框開著就記下來再收）
        list.onBlank = { KeyboardWatch.dismiss() }
        list.voice = { item, index, count in voice(item, index, count) }
    }

    /// VoiceOver 用不了滑動和拖曳：從動作選單（上下滑）劃掉、刪除、移動。空行沒有「劃掉」（1.1 一樣）
    private func voice(_ item: LineItem, _ index: Int, _ count: Int) -> [VoiceAct] {
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
        if index < count - 1 {
            out.append(VoiceAct(name: Words.moveDown) { store.move(item.id, to: index + 1) })
        }
        return out
    }
}

extension LineListView {
    static func items(_ note: Note) -> [LineItem] {
        note.items.map { LineItem(id: $0.id, text: $0.text, done: $0.done) }
    }
}

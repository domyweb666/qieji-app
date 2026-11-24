import SwiftUI
import UIKit

/// 紙上的清單：畫面在 LineListView（原生捲動區），這裡只負責把資料和動作接過去
struct PaperList: UIViewRepresentable {
    let store: Store
    let remote: ListRemote
    let note: Note
    /// 進到哪一行打字（nil＝沒有）
    let onEditing: (String?) -> Void
    /// 按住一行：浮起的那一份和它在螢幕上的位置
    var onMenu: (RowGrab) -> Void = { _ in }
    /// 紙上的字級（完整版）
    var scale: CGFloat = 1
    /// 捲動內容最前面那一塊（有封面圖的清單：方磚、大字名字、時間列）
    var head: AnyView?
    /// 系統字級在 app 開著時改了：讀著它，這裡才會跟著重量、重畫
    @Environment(\.dynamicTypeSize) private var typeSize

    static let space = "paperList"

    func makeUIView(context _: Context) -> LineListView {
        PerfMeter.time("makeList") { make() }
    }

    private func make() -> LineListView {
        let list = LineListView(frame: .zero)
        list.paperID = note.id
        list.spy = remote.spy
        remote.list = list
        wire(list)
        list.restyle(LineLook(key: note.color, scale: scale))
        list.setHead(front)
        list.setEmpty(AnyView(EmptyNote(lines: [Words.emptyPaper, Words.emptyPaperTip])))
        list.apply(LineListView.items(note), animated: false)
        list.showEmpty(animated: false)
        seek(list)
        return list
    }

    func updateUIView(_ list: LineListView, context _: Context) {
        remote.list = list
        _ = typeSize
        guard list.paperID == note.id else {
            PerfMeter.time("swap") {
                UIView.lively {
                    list.swap(to: note.id, look: LineLook(key: note.color, scale: scale), wire: { wire(list) }, front: front)
                }
            }
            seek(list)
            return
        }
        wire(list)
        list.restyle(LineLook(key: note.color, scale: scale))
        list.setHead(front)
        // 看現在的資料，不看交下來的那份（那份可能慢一拍，會把剛打的字蓋回去）
        UIView.lively { list.refresh() }
        seek(list)
    }

    static func dismantleUIView(_ list: LineListView, coordinator _: ()) {
        PerfMeter.time("dismantle") { list.dismantle() }
    }

    /// 封面那一塊
    private var front: AnyView? {
        head.map { AnyView($0.coordinateSpace(name: PaperList.space)) }
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
        list.onChange = { store.setText($0, $1, in: id) }
        list.onEnd = { store.dropIfEmpty($0, in: id) }
        list.onJoinUp = { store.joinUp($0, text: $1, in: id) }
        list.onStrike = { store.toggle($0, in: id) }
        list.onDelete = { store.binLine($0, in: id) }
        list.onMove = { store.move($0, to: $1, in: id) }
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

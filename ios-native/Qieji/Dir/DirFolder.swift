import SwiftUI
import UIKit

/// 打開的資料夾（照 iPhone 的檔案夾）：後面霧掉、名字大字靠左在框上面、框裡一頁三欄三列，滿了往右一頁。
/// 所有張畫在同一層、用位置排到各頁。點框外收起；點名字改名。
/// 從這個資料夾拿起、拖到外面時整層先藏起來但留著（手勢掛在框裡的捲動區上，拆掉拖曳就斷了）。
struct DirFolderView: View {
    @ObservedObject var model: DirModel
    let entry: Seats.Entry
    let currentID: String?
    @Environment(\.accessibilityReduceTransparency) private var solid
    @Environment(\.accessibilityReduceMotion) private var calm
    @Environment(\.displayScale) private var scale

    var body: some View {
        let metrics = model.metrics
        ZStack {
            veil
            VStack(alignment: .leading, spacing: Tok.Space.zero) {
                if let folder = entry.folder {
                    DirFolderName(folder: folder, focus: model.openFolder?.naming ?? false) { model.renameFolder(folder.id, $0) }
                        // 名字跟框裡第一欄方磚的左邊對齊
                        .padding(.leading, Tok.Space.lg + (metrics.cell - metrics.side) / 2)
                        .id(folder.id)
                }
                box
            }
            .frame(width: model.boxWidth)
        }
        .frame(width: model.screen.width, height: model.screen.height)
        .opacity(model.folderHidden ? 0 : 1)
        .allowsHitTesting(!model.folderHidden)
        // VoiceOver 鎖在打開的資料夾裡；兩指 Z 字收起（1.1 accessibilityViewIsModal、onAccessibilityEscape）
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape) { model.closeFolder() }
    }

    private var veil: some View {
        Veil(solidColor: Tok.Col.folderVeil, soft: Tok.Col.folderBlur)
            .contentShape(Rectangle())
            .onTapGesture { model.closeFolder() }
            .accessibilityLabel(Words.closeFolder)
            .accessibilityAddTraits(.isButton)
    }

    private var box: some View {
        let metrics = model.metrics, per = DirMetrics.folderPer
        let list = model.folderList
        let pageCount = max(1, (list.count + per - 1) / per)
        let width = model.boxWidth
        let height = metrics.height(rows: Tok.Shape.folderRows) + Tok.Space.lg * 2
        let shape = RoundedRectangle(cornerRadius: Tok.Shape.radiusLg, style: .continuous)
        return VStack(spacing: Tok.Space.zero) {
            ScrollView(.horizontal, showsIndicators: false) {
                ZStack(alignment: .topLeading) {
                    ForEach(Array(list.enumerated()), id: \.element.id) { index, note in
                        tile(note, index: index, width: width)
                    }
                }
                .frame(width: CGFloat(pageCount) * width, height: height, alignment: .topLeading)
                .background(DirHook(touch: model.folderTouch))
            }
            .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
            .frame(width: width, height: height)
            .id(entry.id)
            if pageCount > 1 {
                dots(pageCount)
            }
        }
        .background {
            // 框是霧面再疊一層淡淡的紙色；減少透明度時用實的
            if solid {
                shape.fill(Tok.Col.folderGlass)
            } else {
                SoftBlur(amount: Tok.Col.folderBoxBlur).clipShape(shape)
                shape.fill(Tok.Col.folderGlassBlur)
            }
        }
        .overlay(shape.strokeBorder(Tok.Col.folderGlassEdge, lineWidth: 1 / scale))
        .clipShape(shape)
        .background(GeometryReader { proxy in
            let frame = proxy.frame(in: .named(DirPanel.space))
            Color.clear
                .onAppear { model.folderBox = frame }
                .onChange(of: frame) { model.folderBox = $0 }
        })
        .shadow(
            color: Tok.Col.shadow.opacity(Tok.Shape.shadowSoft),
            radius: Tok.Shape.shadowRadius, x: 0, y: Tok.Shape.shadowY
        )
    }

    private func tile(_ note: Note, index: Int, width: CGFloat) -> some View {
        let metrics = model.metrics, per = DirMetrics.folderPer
        let spot = metrics.slot(index % per, cols: DirMetrics.folderCols)
        let item = Seats.Entry(id: note.id, note: note, notes: [note])
        return DirTile(
            entry: item, cell: metrics.cell, index: index,
            current: note.id == currentID, editing: model.editing, hidden: model.drag?.id == note.id,
            held: model.heldID == note.id
        )
        .offset(x: CGFloat(index / per) * width + Tok.Space.lg + spot.x, y: Tok.Space.lg + spot.y)
        .animation(calm ? nil : Tok.Motion.tileShift, value: index)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.voiceLabel(item))
        .accessibilityAddTraits(note.id == currentID ? [.isButton, .isSelected] : .isButton)
        .accessibilityAction { model.voiceActivate(item) }
        .accessibilityActions {
            ForEach(model.voiceActs(item, inFolder: true), id: \.name) { act in
                Button(act.name, action: act.run)
            }
        }
    }

    private func dots(_ count: Int) -> some View {
        HStack(spacing: Tok.Space.sm) {
            ForEach(0 ..< count, id: \.self) { index in
                Circle()
                    .fill(Tok.Col.textSecondary)
                    .opacity(index == model.folderPage ? 1 : Tok.Shape.handleOff)
                    .frame(width: Tok.Shape.pageDot, height: Tok.Shape.pageDot)
            }
        }
        .frame(height: Tok.Shape.folderDotsH)
        .padding(.bottom, Tok.Space.sm)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Words.pageVoice(model.folderPage + 1, count))
    }
}

/// 打開的資料夾上面的名字：點了就能打，打一個字存一次；清空不存，離開時變回原名
struct DirFolderName: View {
    let folder: Folder
    let focus: Bool
    let onChange: (String) -> Void
    @State private var draft: String
    @FocusState private var focused: Bool

    init(folder: Folder, focus: Bool, onChange: @escaping (String) -> Void) {
        self.folder = folder
        self.focus = focus
        self.onChange = onChange
        _draft = State(initialValue: folder.name)
    }

    var body: some View {
        TextField(Words.folderNameLabel, text: $draft)
            .font(Tok.Font.title)
            .foregroundColor(Tok.Col.textPrimary)
            .submitLabel(.done)
            .focused($focused)
            .padding(.vertical, Tok.Space.md)
            .onChange(of: draft) { onChange($0) }
            .onChange(of: focused) { now in
                if !now, Labels.trim(draft).isEmpty {
                    draft = folder.name
                }
            }
            .onAppear {
                guard focus else { return }
                DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Motion.composerFocusDelay) { focused = true }
            }
            .onReceive(NotificationCenter.default.publisher(for: UITextField.textDidBeginEditingNotification)) { event in
                guard focus, let field = event.object as? UITextField, field.text == folder.name else { return }
                DispatchQueue.main.async { field.selectAll(nil) }
            }
    }
}

/// 搜尋：直接列出符合的那幾行，上面標是哪一張。點一行或清單名＝打開那張
struct DirSearchList: View {
    @ObservedObject var store: Store
    @ObservedObject var model: DirModel
    @Environment(\.displayScale) private var scale

    var body: some View {
        let needle = Labels.trim(model.query)
        let hits = Seats.searchLines(store.book, query: model.query)
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Tok.Space.zero) {
                ForEach(hits, id: \.note.id) { hit in
                    VStack(alignment: .leading, spacing: Tok.Space.zero) {
                        Button { model.pick(hit.note.id) } label: { head(hit, needle) }
                            .buttonStyle(PressDim())
                            .accessibilityLabel(Words.openNoteVoice(Labels.label(hit.note)))
                        ForEach(Array(hit.lines.enumerated()), id: \.offset) { _, line in
                            Button { model.pick(hit.note.id, line: line.id) } label: { lineRow(line, needle) }
                                .buttonStyle(SearchPress())
                                .accessibilityLabel(Words.searchHitVoice(line.text, Labels.label(hit.note)))
                        }
                    }
                    .padding(.vertical, Tok.Space.sm)
                    Tok.Col.separator.frame(height: 1 / scale)
                }
                if hits.isEmpty {
                    EmptyNote(lines: [Words.searchNone(needle)])
                }
            }
            .padding(.horizontal, Tok.Space.lg)
            .padding(.bottom, Tok.Space.lg)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func head(_ hit: Seats.LineHit, _ needle: String) -> some View {
        HStack(spacing: Tok.Space.sm) {
            Circle()
                .fill(Tok.note(hit.note.color).dot)
                .frame(width: Tok.Shape.pageDot, height: Tok.Shape.pageDot)
            DirSearchList.marked(Labels.label(hit.note), hit.title ? needle : "")
                .font(Tok.Font.callout.weight(.semibold))
                .foregroundColor(Tok.Col.textSecondary)
                .lineLimit(1)
            Spacer(minLength: Tok.Space.zero)
        }
        .frame(minHeight: Tok.Shape.hitMin)
        .contentShape(Rectangle())
    }

    private func lineRow(_ line: Item, _ needle: String) -> some View {
        DirSearchList.marked(line.text, needle)
            .font(Tok.Font.body)
            .foregroundColor(line.done ? Tok.Col.textStrike : Tok.Col.textPrimary)
            .strikethrough(line.done)
            .lineLimit(2)
            .multilineTextAlignment(.leading)
            .padding(.vertical, Tok.Space.sm)
            .frame(maxWidth: .infinity, minHeight: Tok.Shape.hitMin, alignment: .leading)
            .padding(.horizontal, Tok.Space.md)
            .contentShape(Rectangle())
    }

    /// 按住一行：底色變淡紫（1.1 搜尋結果的 pressed）
    private struct SearchPress: ButtonStyle {
        func makeBody(configuration: Configuration) -> some View {
            configuration.label.background(
                RoundedRectangle(cornerRadius: Tok.Shape.radiusMd, style: .continuous)
                    .fill(configuration.isPressed ? Tok.Col.pressedFill : Color.clear)
            )
        }
    }

    /// 打中的字用茄紫粗體；行很長、打中的字在後面時，從它前面幾個字開始顯示（前面補 …）
    static func marked(_ text: String, _ needle: String) -> Text {
        let flat = text.replacingOccurrences(of: "\n", with: " ")
        guard !needle.isEmpty, let range = flat.range(of: needle, options: .caseInsensitive) else { return Text(flat) }
        let lead = 12
        let before = flat[..<range.lowerBound]
        let head = before.count > lead ? "…" + String(before.suffix(lead)) : String(before)
        return Text(head) + Text(String(flat[range])).foregroundColor(Tok.Col.accent).fontWeight(.semibold)
            + Text(String(flat[range.upperBound...]))
    }
}

/// 搬行模式的搜尋：找要搬到哪一張，照舊列磚，所有頁的紙一起找、上下捲，不分頁、不能拖
struct DirPickGrid: View {
    @ObservedObject var store: Store
    @ObservedObject var model: DirModel

    var body: some View {
        let notes = Seats.seatedNotes(store.book, query: model.query)
        let columns = Array(repeating: GridItem(.fixed(model.cellWidth), spacing: Tok.Space.zero), count: DirMetrics.cols)
        ScrollView {
            LazyVGrid(columns: columns, spacing: Tok.Shape.tileRowGap) {
                ForEach(notes) { note in
                    Button { model.pick(note.id) } label: {
                        DirTileFace(
                            entry: Seats.Entry(id: note.id, note: note, notes: [note]),
                            cell: model.cellWidth, current: note.id == store.currentID
                        )
                    }
                    .accessibilityLabel(Labels.label(note))
                }
            }
            .padding(.top, Tok.Space.sm + Tok.Space.md)
            if notes.isEmpty {
                EmptyNote(lines: [Words.searchNoneNote(Labels.trim(model.query))])
            }
        }
        .scrollDismissesKeyboard(.interactively)
    }
}

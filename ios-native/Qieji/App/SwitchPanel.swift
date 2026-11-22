import SwiftUI

/// 切換清單（照 1.1 SwitchPanel，2026-11-04 多米換掉系統的半高面板）：點紙左上的清單名，從螢幕下面升起、貼齊底部（下面不是圓角）。
/// 跟 ⋯ 選單同一種玻璃，排法照系統選單：左邊小方磚、右邊名字，組跟組之間一條線，小字標組名。
/// 內容：新的一張、新的記事本（買了才有）；釘選的、這台手機最近開過的，正在看的打勾；最下面「管理所有清單」＝收的同時打開目錄。
/// 收起：點上面露出的紙、往下撥上緣那條、點一張。點一張時面板馬上讓開、紙同時換（2026-11-04 多米真機：要延遲一下才切換）。減少動態：淡入淡出不滑
struct SwitchPanel: View {
    @ObservedObject var store: Store
    let gone: () -> Void // 收完了，可以拿掉
    let onManage: () -> Void
    let onFull: () -> Void
    @State private var shown = false
    @State private var drag: CGFloat = 0
    @State private var height: CGFloat = 0
    @State private var contentHeight: CGFloat = 0
    @State private var closing = false
    @State private var lists: (pinned: [Note], recent: [Note]) = ([], [])
    @Environment(\.accessibilityReduceMotion) private var calm

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottom) {
                Tok.Col.scrim
                    .opacity(shown ? 1 : 0)
                    .ignoresSafeArea()
                    .onTapGesture { dismiss() }
                    .accessibilityLabel(Words.closeSwitch)
                    .accessibilityAddTraits(.isButton)
                sheet(maxHeight: geo.size.height * Tok.Shape.switchMaxRatio, bottom: geo.safeAreaInsets.bottom)
                    .offset(y: calm ? 0 : (shown ? drag : max(height, geo.size.height)))
                    .opacity(calm && !shown ? 0 : 1)
            }
        }
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape) { dismiss() }
        .onAppear {
            lists = Seats.switchList(store.book, recent: store.disk?.recent ?? [])
            withAnimation(calm ? Tok.Motion.dirFade : Tok.Motion.dirPanel) { shown = true }
        }
    }

    private func sheet(maxHeight: CGFloat, bottom: CGFloat) -> some View {
        VStack(spacing: Tok.Space.zero) {
            grab
            ScrollView {
                VStack(alignment: .leading, spacing: Tok.Space.zero) {
                    action(Words.newNote, icon: "plus") { store.newNote() }
                    if store.isFull {
                        action(Words.newPad, icon: "doc.text") { store.newPad() }
                    }
                    group(Words.pinGroup, lists.pinned)
                    group(Words.recentGroup, lists.recent)
                    separator
                    Button {
                        dismiss(then: onManage)
                    } label: {
                        HStack(spacing: Tok.Space.md) {
                            Image(systemName: "square.grid.2x2")
                                .font(Tok.Font.barIcon)
                                .frame(width: Tok.Shape.noteIcon)
                            Text(Words.manageAll).font(Tok.Font.body)
                            Spacer(minLength: Tok.Space.sm)
                            Image(systemName: "chevron.right")
                                .font(Tok.Font.chevron)
                                .foregroundColor(Tok.Col.textSecondary)
                        }
                        .foregroundColor(Tok.Col.textPrimary)
                        .padding(.horizontal, Tok.Space.gutter)
                        .frame(minHeight: Tok.Shape.menuRow)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(MenuRowPress())
                }
                .padding(.bottom, bottom + Tok.Space.sm)
                .background(GeometryReader { geo in
                    Color.clear
                        .onAppear { contentHeight = geo.size.height }
                        .onChange(of: geo.size.height) { contentHeight = $0 }
                })
            }
            .scrollBounceBehavior(.basedOnSize)
            // 照內容長高，最高佔螢幕七成，清單多就在裡面捲
            .frame(height: min(contentHeight, maxHeight - Tok.Shape.hitMin / 2 + bottom))
        }
        .frost(UnevenRoundedRectangle(topLeadingRadius: Tok.Shape.radiusLg, topTrailingRadius: Tok.Shape.radiusLg), thick: true)
        .background(GeometryReader { geo in
            Color.clear
                .onAppear { height = geo.size.height }
                .onChange(of: geo.size.height) { height = $0 }
        })
        .ignoresSafeArea(edges: .bottom)
    }

    /// 上緣那條：往下撥，跟著手指；撥過面板高的一成五或往下甩就收起，不然彈回
    private var grab: some View {
        Capsule()
            .fill(Tok.Col.textSecondary.opacity(Tok.Shape.handleOff))
            .frame(width: Tok.Shape.handleSolo, height: Tok.Shape.dirGrab)
            .frame(maxWidth: .infinity, minHeight: Tok.Shape.hitMin / 2)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: Tok.Gesture.pullActivate)
                    .onChanged { drag = max(0, $0.translation.height) }
                    .onEnded { value in
                        let flick = value.predictedEndTranslation.height - value.translation.height > Tok.Gesture.flickAhead
                        if value.translation.height > height * Tok.Gesture.pushCloseRatio || flick {
                            dismiss()
                        } else {
                            withAnimation(Tok.Motion.dirPanel) { drag = 0 }
                        }
                    }
            )
            .accessibilityHidden(true)
    }

    private var separator: some View {
        Tok.Col.menuSep
            .frame(height: Tok.Shape.hairline)
            .padding(.horizontal, Tok.Space.gutter)
            .padding(.vertical, Tok.Space.sm)
    }

    @ViewBuilder
    private func group(_ head: String, _ notes: [Note]) -> some View {
        if !notes.isEmpty {
            separator
            Text(head)
                .font(Tok.Font.footnote.weight(.semibold))
                .foregroundColor(Tok.Col.textSecondary)
                .padding(.horizontal, Tok.Space.gutter)
                .padding(.vertical, Tok.Space.xs)
                .accessibilityAddTraits(.isHeader)
            ForEach(notes) { row($0) }
        }
    }

    private func row(_ note: Note) -> some View {
        let current = note.id == store.currentID
        let named = !Labels.trim(note.title).isEmpty
        return Button {
            dismiss(then: current ? nil : { store.open(note.id) })
        } label: {
            HStack(spacing: Tok.Space.md) {
                NoteTile(note: note, side: Tok.Shape.noteIcon)
                Text(Labels.label(note))
                    .font(Tok.Font.body)
                    .foregroundColor(named ? Tok.Col.textPrimary : Tok.Col.textSecondary)
                    .lineLimit(1)
                Spacer(minLength: Tok.Space.sm)
                if current {
                    Image(systemName: "checkmark")
                        .font(Tok.Font.headline)
                        .foregroundColor(Tok.Col.accent)
                }
            }
            .padding(.horizontal, Tok.Space.gutter)
            .frame(minHeight: Tok.Shape.menuRow)
            .contentShape(Rectangle())
        }
        .buttonStyle(MenuRowPress())
        .accessibilityLabel(Labels.label(note))
        .accessibilityAddTraits(current ? .isSelected : [])
    }

    /// 新的一張、新的記事本：樣子跟「管理所有清單」同一種（茄紫每個畫面只出現一次，這個面板的勾已經用了）
    private func action(_ label: String, icon: String, run: @escaping () -> Void) -> some View {
        Button {
            dismiss(then: run)
        } label: {
            HStack(spacing: Tok.Space.md) {
                Image(systemName: icon)
                    .font(Tok.Font.barIcon)
                    .frame(width: Tok.Shape.noteIcon)
                Text(label).font(Tok.Font.body)
                Spacer(minLength: Tok.Space.sm)
            }
            .foregroundColor(Tok.Col.textPrimary)
            .padding(.horizontal, Tok.Space.gutter)
            .frame(minHeight: Tok.Shape.menuRow)
            .contentShape(Rectangle())
        }
        .buttonStyle(MenuRowPress())
    }

    /// 收起：面板馬上開始讓開，then（換紙、開目錄）下一格就做，不等面板收完；收完才拿掉。收到一半又叫一次照第一次的收
    private func dismiss(then: (() -> Void)? = nil) {
        guard !closing else { return }
        closing = true
        withAnimation(calm ? Tok.Motion.dirFade : Tok.Motion.switchClose) { shown = false }
        if let then {
            DispatchQueue.main.async(execute: then)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + (calm ? Tok.Motion.dirFadeSeconds : Tok.Motion.dirPanelSeconds), execute: gone)
    }
}

import Foundation
import WidgetKit

/// 把「上次那張紙」推給桌面小工具（1.1 widget.ts）：存檔成功、換了一張紙時叫。
/// 內容一樣就不推：每推一次 iOS 就叫醒小工具重畫一次（1.1 2026-11-03 多米：用一下手機就發熱）
extension WidgetSnap {
    static let lockedText = "小工具是完整版功能"
    static let lockedNote = "這張上鎖了"

    /// note＝上次開著的那張；full＝買了完整版沒
    static func make(note: Note?, full: Bool) -> WidgetSnap {
        guard full else {
            return WidgetSnap(title: Words.appName, lines: [], color: "yellow", locked: lockedText)
        }
        guard let note else {
            return WidgetSnap(title: Words.appName, lines: [], color: "yellow", locked: nil)
        }
        if note.locked {
            return WidgetSnap(title: Words.appName, lines: [Line(text: lockedNote, done: false)], color: note.color, locked: nil)
        }
        let lines: [Line] = if note.isText {
            note.body.components(separatedBy: "\n").map(Labels.trim).filter { !$0.isEmpty }
                .prefix(WidgetShare.largeLines).map { Line(text: $0, done: false) }
        } else {
            note.items.filter { !Labels.trim($0.text).isEmpty }
                .prefix(WidgetShare.largeLines).map { Line(text: $0.text, done: $0.done) }
        }
        return WidgetSnap(title: Labels.label(note), lines: lines, color: note.color, locked: nil)
    }
}

extension Store {
    /// 推給小工具。還不知道買了沒就先不推：打開 app 那一下不要把買了的人的小工具閃成鎖住
    func pushWidget() {
        pushTarget() // 分享卡上的「放進 X」是免費的：不看買了沒
        guard fullKnown, disk != nil else { return }
        let snap = WidgetSnap.make(note: current, full: isFull)
        guard let data = try? JSONEncoder().encode(snap), data != widgetSent else { return }
        widgetSent = data
        WidgetShare.write(data)
        WidgetCenter.shared.reloadTimelines(ofKind: WidgetShare.kind)
    }

    /// 換了一張紙：等畫面換完、停一下才推（1.1 2026-11-04 手感第 5 條：推一次要叫醒小工具，不准疊在換紙那一刻；連續換好幾張只推最後一張）
    func pushWidgetSoon() {
        widgetWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.pushWidget() }
        widgetWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Timing.widgetPushDelay, execute: work)
    }
}

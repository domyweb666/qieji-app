import os
import UIKit

/// 分享表裡的「茄記」：系統給的整頁面板（3D），字在上、✕／放進 X／✓ 在下。
/// 只做三件事：讀附件、把字寫進收件匣、收起。紙的內容拿不到也不碰；不連網
final class ShareController: UIViewController {
    static let log = Logger(subsystem: "org.domyweb.qieji", category: "share")

    private let panel = SharePanel(frame: .zero)
    private let born = Date()
    private var targets: [ShareTarget] = []
    private var picked = 0
    private var read = false // 附件讀完了
    private var draft: ShareDraft? // 讀到字才有
    private var failed = false // 按過 ✓ 但沒寫成
    private var closed = false

    override func loadView() {
        view = panel
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        wire()
        targets = ShareInbox.app.targets()
        panel.showTargets(targets, picked: picked)
        // 第一次跟系統拿共用容器會慢：先在背景叫一次
        DispatchQueue.global(qos: .userInitiated).async {
            _ = ShareInbox.app.folder()
        }
        Task { [weak self] in
            let haul = await ShareReader.read(self?.extensionContext?.inputItems ?? [])
            self?.arrived(haul)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Timing.shareReadWait) { [weak self] in
            guard let self, !read, !closed else { return }
            panel.showBlank(ShareWords.reading)
        }
        Haptic.prepare()
    }

    /// 往下拉走了：字沒改過才拉得動（改過的 isModalInPresentation 擋著）。系統不會替我們收掉擴充，要自己講
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        close("pull")
    }

    private func wire() {
        panel.onText = { [weak self] in self?.changed($0) }
        panel.onCancel = { [weak self] in self?.close("cancel") }
        panel.onCommit = { [weak self] in self?.commit() }
        panel.onSplit = { [weak self] in self?.split() }
        panel.onPick = { [weak self] in self?.pick($0) }
        panel.onEscape = { [weak self] in
            // 跟往下拉同一條：字改過就不收
            guard let self, !isModalInPresentation else { return false }
            close("escape")
            return true
        }
    }

    // MARK: 字

    private func arrived(_ haul: ShareHaul) {
        read = true
        guard !closed else { return }
        guard let found = haul.compose() else {
            panel.showNothing(ShareWords.nothing)
            return
        }
        draft = ShareDraft(found.text, link: haul.link)
        panel.showText(found.text)
        if found.cut {
            panel.showNote(ShareWords.cut)
        } else if haul.missed > 0 {
            panel.showNote(ShareWords.missed)
        }
        refresh(animated: false)
        let took = Int(-born.timeIntervalSinceNow * 1000)
        ShareController.log.info("ready \(took) ms")
    }

    private func changed(_ text: String) {
        draft?.text = text
        refresh(animated: true)
    }

    private func refresh(animated: Bool) {
        guard let draft else { return }
        panel.setCommit(!draft.isBlank)
        panel.showSplit(draft.rows.count, animated: animated)
        // 改過的字不准被一拉就不見
        isModalInPresentation = draft.edited || failed
    }

    private func pick(_ index: Int) {
        guard targets.indices.contains(index) else { return }
        picked = index
        panel.showTargets(targets, picked: index)
    }

    // MARK: 記

    private func commit() {
        panel.settle()
        guard let draft, !draft.isBlank else { return }
        send([draft.text])
    }

    private func split() {
        panel.settle()
        guard let draft, !draft.rows.isEmpty else { return }
        send(draft.rows)
    }

    /// 先寫進收件匣，寫成了才收。整段在主執行緒一次做完：連按第二下時已經收了
    private func send(_ texts: [String]) {
        guard !closed else { return }
        let note = targets.indices.contains(picked) ? targets[picked].id : nil
        guard let entry = draft?.entry(texts, note: note), ShareInbox.app.write(entry) else {
            failed = true
            Haptic.reject()
            panel.showNote(ShareWords.failed, alert: true)
            refresh(animated: false)
            return
        }
        Haptic.add()
        close("sent")
    }

    // MARK: 收起

    /// 一律 completeRequest：直接回原本的 app（cancelRequest 會回到系統的分享表）
    private func close(_ how: String) {
        guard !closed else { return }
        closed = true
        ShareController.log.info("closed: \(how, privacy: .public)")
        // 已經拉下去的不用再淡
        let context = extensionContext
        panel.clear(animated: how != "pull") {
            context?.completeRequest(returningItems: nil)
        }
    }
}

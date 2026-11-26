import os
import UIKit

/// 分享表裡的「茄記」：系統給的整頁面板（3D），字在上、✕／放進 X／✓ 在下。
/// 只做三件事：讀附件、把字寫進收件匣、收起。紙的內容拿不到也不碰；不連網
final class ShareController: UIViewController {
    static let log = Logger(subsystem: "org.domyweb.qieji", category: "share")

    private let panel = SharePanel(frame: .zero)
    private let born = Date()
    private var targets: [ShareTarget]? // 紙單讀到才有；一張都沒有是空的
    private var picked = 0
    private var chose = false // 自己從選單挑過
    private var listTurn = 0 // 第幾次讀紙單：晚到的舊結果不算
    private var ears: [NSObjectProtocol] = []
    private var read = false // 附件讀完了
    private var draft: ShareDraft? // 讀到字才有
    private var failed = false // 按過 ✓ 但沒寫成
    private var said: String? // 讀進來時要講的、沒記成要講的
    private var tooLong = false // 正在講「太長了」
    private var closed = false

    override func loadView() {
        view = panel
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        wire()
        loadTargets()
        watchTargets()
        Task { [weak self] in
            let found = await ShareReader.read(self?.extensionContext?.inputItems ?? [])
            self?.arrived(found)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Timing.shareReadWait) { [weak self] in
            guard let self, !read, !closed else { return }
            panel.showBlank(ShareWords.reading)
        }
        Haptic.prepare()
    }

    /// 往下拉走了：字沒改過才拉得動（改過的 isModalInPresentation 擋著）。系統不會替我們收掉擴充，要自己講。
    /// 上面蓋了別的整頁（查詢、翻譯…）也會走到這裡：那是還要回來的，不准收
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if let over = presentedViewController, !over.isBeingDismissed {
            return
        }
        close("pull")
    }

    private func wire() {
        panel.onText = { [weak self] in self?.changed($0) }
        panel.onCancel = { [weak self] in self?.close("cancel") }
        panel.onCommit = { [weak self] in self?.commit() }
        panel.onSplit = { [weak self] in self?.split() }
        panel.onPick = { [weak self] in self?.pick($0) }
        panel.onEscape = { [weak self] in
            // 跟往下拉同一條：字改過就不收。也要算吃掉了：往外傳的話系統會去收整張面板
            guard let self, !isModalInPresentation else { return true }
            close("escape")
            return true
        }
    }

    // MARK: 紙單

    /// 第一次跟系統拿共用容器會慢：不准在主執行緒。送出時是第二次，✓ 等紙單到了才能按
    private func loadTargets() {
        listTurn += 1
        let turn = listTurn
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let list = ShareInbox.app.targets()
            DispatchQueue.main.async { self?.listed(list, turn: turn) }
        }
    }

    /// 面板開著切去茄記上鎖、刪紙、改名再切回來：重讀紙單，上鎖的那張名字不准還留在選單上。
    /// 回到前景（擴充的主人回來）讀一次；app 寫完紙單也會講一聲（同時開著兩邊、或回來時 app 還沒寫完）
    private func watchTargets() {
        ShareInbox.listen()
        let center = NotificationCenter.default
        for name in [ShareInbox.changed, .NSExtensionHostWillEnterForeground, .NSExtensionHostDidBecomeActive] {
            ears.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.loadTargets()
            })
        }
    }

    deinit {
        for ear in ears {
            NotificationCenter.default.removeObserver(ear)
        }
    }

    private func listed(_ list: [ShareTarget], turn: Int) {
        guard !closed, turn == listTurn else { return }
        guard let old = targets else {
            targets = list
            panel.showTargets(list, picked: picked)
            refresh(animated: false)
            logReady()
            return
        }
        guard old != list else { return }
        // 挑的那張不在了（上鎖、刪掉、滿了）就回到預設那張；記的時候 app 也會再擋一次（不准放進上鎖的）
        let kept = chose ? ShareTarget.follow(picked, from: old, in: list) : nil
        picked = kept ?? 0
        chose = kept != nil
        targets = list
        panel.showTargets(list, picked: picked)
        refresh(animated: false)
    }

    private func pick(_ index: Int) {
        guard let targets, targets.indices.contains(index) else { return }
        picked = index
        chose = true
        panel.showTargets(targets, picked: index)
    }

    // MARK: 字

    private func arrived(_ found: ShareFound) {
        read = true
        guard !closed else { return }
        guard let text = found.text else {
            panel.showNothing(ShareWords.nothing)
            return
        }
        draft = ShareDraft(text, link: found.link)
        panel.showText(text)
        let short = found.cut ? ShareWords.cut : (found.missed > 0 ? ShareWords.missed : nil)
        let notes = [short, ShareWords.skipped(image: found.image, movie: found.movie)].compactMap { $0 }
        said = notes.isEmpty ? nil : notes.joined(separator: "\n")
        panel.showNote(said)
        refresh(animated: false)
        logReady()
    }

    /// 字和紙單都到了：可以按 ✓
    private func logReady() {
        guard draft != nil, targets != nil else { return }
        let took = Int(-born.timeIntervalSinceNow * 1000)
        ShareController.log.info("ready \(took) ms")
    }

    private func changed(_ text: String) {
        draft?.text = text
        refresh(animated: true)
    }

    private func refresh(animated: Bool) {
        guard let draft else { return }
        // 太長：講一聲、不給記；刪回來就換回原本那句
        if tooLong != draft.tooLong {
            tooLong = draft.tooLong
            panel.showNote(tooLong ? ShareWords.tooLong : said, alert: tooLong || failed)
        }
        // 還不知道放進哪張：✓、拆行都先等
        panel.setCommit(targets != nil && !draft.isBlank && !tooLong)
        panel.showSplit(targets == nil ? 0 : draft.rows.count, animated: animated)
        // 改過的字不准被一拉就不見
        isModalInPresentation = draft.edited || failed
    }

    // MARK: 記

    private func commit() {
        panel.settle()
        guard let draft, !draft.isBlank, !draft.tooLong else { return }
        send([draft.text])
    }

    private func split() {
        panel.settle()
        guard let draft, !draft.rows.isEmpty else { return }
        send(draft.rows)
    }

    /// 先寫進收件匣，寫成了才收。整段在主執行緒一次做完：連按第二下時已經收了
    private func send(_ texts: [String]) {
        guard !closed, let targets else { return }
        let note = targets.indices.contains(picked) ? targets[picked].id : nil
        guard let entry = draft?.entry(texts, note: note), ShareInbox.app.write(entry) else {
            failed = true
            Haptic.reject()
            said = ShareWords.failed
            panel.showNote(said, alert: true)
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

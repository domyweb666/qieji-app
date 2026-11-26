import SwiftUI
import UIKit

/// 打開的資料夾那一層接到 SwiftUI：一直掛在目錄裡，沒開的時候整個藏著、不收觸控
struct DirFolderLayer: UIViewRepresentable {
    @ObservedObject var model: DirModel
    @ObservedObject private var covers = Covers.shared
    @Environment(\.accessibilityReduceTransparency) private var solid
    /// 系統字級改了要重排
    @Environment(\.dynamicTypeSize) private var typeSize

    init(model: DirModel) {
        self.model = model
    }

    func makeUIView(context _: Context) -> FolderStage {
        let view = FolderStage(model)
        model.folderStage = view
        return view
    }

    func updateUIView(_ view: FolderStage, context _: Context) {
        _ = (covers.version, solid, typeSize) // 封面圖到了、換了（紙本身沒變，磚也要重畫）
        view.prepare(cards: model.stage > DirModel.folderStep ? FolderStage.cardMax : 1)
        view.sync()
    }
}

/// 打開的資料夾：後面的霧＋框。框有兩份，收到一半點另一個資料夾時，舊的自己縮回去、新的照樣放大。
/// 開、收、拖走先藏起來，全部由 sync() 照 DirModel 現在的樣子決定
final class FolderStage: UIView {
    static let cardMax = 2
    private static let key = "fog"

    private weak var model: DirModel?
    private let veil = UIView()
    private let mist = SoftBlurView(amount: 0)
    private let tint = UIView()
    private(set) var cards: [FolderCard] = []
    private var fog = FolderFlight.still(0)
    private var added: CFTimeInterval = 0
    private var link: CADisplayLink?
    private var fresh = true
    private var taking = false // 收不收觸控

    init(_ model: DirModel) {
        self.model = model
        super.init(frame: .zero)
        hideVeil(true)
        veil.isAccessibilityElement = true
        veil.accessibilityLabel = Words.closeFolder
        veil.accessibilityTraits = .button
        veil.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapVeil)))
        tint.isUserInteractionEnabled = false
        veil.addSubview(mist)
        veil.addSubview(tint)
        addSubview(veil)
        accessibilityElementsHidden = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        for part in [veil, mist, tint] + cards {
            part.frame = bounds
        }
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil {
            stop()
        }
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard taking else { return nil }
        for card in cards.reversed() where card.up {
            if let found = card.hitTest(convert(point, to: card), with: event) {
                return found
            }
        }
        return veil
    }

    override func accessibilityPerformEscape() -> Bool {
        guard taking else { return false }
        model?.closeFolder()
        return true
    }

    @objc private func tapVeil() {
        model?.closeFolder()
    }

    /// 先做好藏著：第一份框連同第一個資料夾的內容、第二份空的框
    func prepare(cards count: Int) {
        while cards.count < count {
            let card = FolderCard(frame: bounds)
            card.model = model
            cards.append(card)
            addSubview(card)
            // 第一份連第一個資料夾的內容一起備好：打開 app 第一次點它跟之後一樣快
            if cards.count == 1, let first = model?.entries.first(where: { $0.folder != nil }) {
                warm(first.id)
            }
        }
    }

    /// 手指按在一個資料夾磚上：先讓磚變淡那一格出去，再備好框裡的磚，放手那一刻只剩放大
    func pressed(_ id: String) {
        DispatchQueue.main.async { [weak self] in self?.warm(id) }
    }

    private func warm(_ id: String) {
        guard let model, let entry = model.entries.first(where: { $0.id == id && $0.folder != nil }),
              !cards.contains(where: { $0.id == id && !$0.isHidden }) else { return }
        spare(id)?.fill(model.folderLook(entry))
    }

    /// 正在收的（重新打開時留在同一頁）
    func closing(_ id: String) -> Bool {
        cards.contains { $0.id == id && !$0.isHidden && !$0.up && $0.moving }
    }

    // MARK: 照現況開、收

    func sync() {
        guard let model else { return }
        let now = CACurrentMediaTime()
        let entry = model.openEntry
        let want = entry != nil && !model.folderHidden
        let jump = fresh || !model.isOpen
        fresh = false
        taking = want
        accessibilityElementsHidden = !want
        dress()
        if let entry {
            let card = take(entry.id)
            card.fill(model.folderLook(entry))
            if want, !card.up {
                raise(card, entry.id, jump: jump, now)
            }
        }
        for card in cards where card.up && (!want || card.id != entry?.id) {
            lower(card, jump: jump, now)
        }
        for card in cards where !card.up && !card.isHidden {
            settle(card, now)
        }
        blow(to: want ? 1 : 0, jump: jump, now)
        run()
    }

    /// 手指開始翻頁、拿起磚：還在縮回去的不等它，磚馬上出來，框原地淡掉
    func giveWay() {
        let now = CACurrentMediaTime()
        for card in cards where !card.up && card.moving && card.show.goal == 1 {
            uncover(card)
            card.close(to: nil, calm: false, at: now)
        }
        run()
    }

    private func raise(_ card: FolderCard, _ id: String, jump: Bool, _ now: CFTimeInterval) {
        guard let model else { return }
        let calm = model.calm
        bringSubviewToFront(card)
        if !closing(id) {
            card.scroll.contentOffset = .zero
        }
        model.folderTouch.attach(card.scroll)
        if jump {
            card.snap(up: true)
        } else {
            card.open(from: model.folderHome(id), calm: calm, at: now)
        }
        if !calm {
            model.setCover(id, true)
        }
        if model.openFolder?.naming == true {
            card.rename(after: Tok.Motion.composerFocusDelay)
        }
        UIAccessibility.post(notification: .screenChanged, argument: nil)
    }

    private func lower(_ card: FolderCard, jump: Bool, _ now: CFTimeInterval) {
        guard let model else { return }
        if jump {
            card.snap(up: false)
            uncover(card)
            return
        }
        let home = card.id.flatMap { model.folderHome($0) }
        card.close(to: home, calm: model.calm, at: now)
        if home == nil {
            uncover(card)
        }
        UIAccessibility.post(notification: .screenChanged, argument: nil)
    }

    /// 正在收的：那塊磚換了位置、不見了；拖曳放手了，看不見的那份才真的拿掉
    private func settle(_ card: FolderCard, _ now: CFTimeInterval) {
        guard let model else { return }
        if card.moving {
            if card.home != nil, !card.rehome(card.id.flatMap { model.folderHome($0) }, at: now) {
                uncover(card)
            }
        } else if model.drag == nil {
            card.snap(up: false)
        }
    }

    private func uncover(_ card: FolderCard) {
        if let id = card.id {
            model?.setCover(id, false)
        }
    }

    /// 這個資料夾用哪一份框：開著的、正在收的同一個；不然拿一份閒的，都在忙就拿最底下那份
    private func take(_ id: String) -> FolderCard {
        if let same = cards.first(where: { $0.id == id && !$0.isHidden }) ?? spare(id) {
            return same
        }
        prepare(cards: 1)
        let card = subviews.compactMap { $0 as? FolderCard }.first ?? cards[0]
        uncover(card)
        card.snap(up: false)
        return card
    }

    /// 閒著的：備好這個資料夾的那份優先
    private func spare(_ id: String) -> FolderCard? {
        let free = cards.filter(\.isHidden)
        return free.first { $0.id == id } ?? free.first { $0.id == nil } ?? free.first
    }

    // MARK: 後面的霧

    private func dress() {
        let solid = UIAccessibility.isReduceTransparencyEnabled
        mist.isHidden = solid
        tint.backgroundColor = UIColor(solid ? Tok.Col.folderVeil : Tok.Col.folderVeilBlur)
    }

    private func blow(to goal: CGFloat, jump: Bool, _ now: CFTimeInterval) {
        guard fog.goal != goal || jump && !fog.isStill else { return }
        if jump {
            fog = .still(goal)
            tint.layer.removeAnimation(forKey: FolderStage.key)
            settleFog()
            return
        }
        // 放大、縮回用彈簧，改用淡的時候跟著淡
        let spring = cards.contains { $0.moving && !$0.grow.isStill && $0.show.goal == 1 }
        fog = fog.turned(to: goal, after: fogTime(now), kind: spring ? .spring : .fade)
        added = now
        hideVeil(false)
        tint.alpha = goal
        let part = CAKeyframeAnimation(keyPath: "opacity")
        part.values = fog.frames.map { FolderPose.shade($0) }
        part.duration = Double(fog.frames.count - 1) * Tok.Motion.folderStep
        tint.layer.add(part, forKey: FolderStage.key)
    }

    private func settleFog() {
        mist.amount = Tok.Col.folderBlur * fog.goal
        tint.alpha = fog.goal
        hideVeil(fog.goal == 0)
    }

    /// 霧沒了整層藏起來，霧面的動畫跟著停（見 SoftBlurView）
    private func hideVeil(_ hidden: Bool) {
        veil.isHidden = hidden
        mist.asleep = hidden
    }

    private func fogTime(_ now: CFTimeInterval) -> Double {
        let began = tint.layer.animation(forKey: FolderStage.key)?.beginTime ?? 0
        return max(0, now - (began > 0 ? began : added))
    }

    // MARK: 每一格

    /// 系統動畫管不到的只有霧幾成；順便看走完了沒
    private func run() {
        guard link == nil, !fog.isStill || cards.contains(where: \.moving) else { return }
        let next = CADisplayLink(target: self, selector: #selector(tick(_:)))
        next.preferredFrameRateRange = Tok.Motion.folderRate
        next.add(to: .main, forMode: .common)
        link = next
    }

    private func stop() {
        link?.invalidate()
        link = nil
    }

    @objc private func tick(_ link: CADisplayLink) {
        step(at: link.targetTimestamp)
    }

    /// 走到這個時間的樣子
    func step(at now: CFTimeInterval) {
        for card in cards where card.moving && card.done(now) {
            card.rest(hold: model?.drag != nil)
            if !card.up {
                uncover(card)
            }
        }
        let time = fogTime(now)
        if !fog.isStill, time >= fog.span {
            fog = .still(fog.goal)
            settleFog()
        } else if !fog.isStill {
            mist.amount = Tok.Col.folderBlur * CGFloat(FolderPose.shade(fog.value(time)))
        }
        if fog.isStill, !cards.contains(where: \.moving) {
            stop()
        }
    }
}

import StoreKit
import UIKit

/// 評分提示接手機的那一半（1.1 reviewAsk.ts）：記打開的日子、記劃掉幾行、條件到了叫系統評分框。規則在 Review
enum ReviewAsk {
    private static var wait: DispatchWorkItem?

    private static var version: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
    }

    /// 打開 app、回到前景時叫：記今天打開過（第一次叫時記下「從今天起算」）
    static func opened(now: Double = Clock.now()) {
        let raw = Prefs.shared.string(Prefs.reviewKey)
        var stats = Review.read(raw, now: now)
        if Review.markOpen(&stats, now: now) || raw == nil {
            Prefs.shared.set(Prefs.reviewKey, Review.write(stats))
        }
    }

    /// 劃掉一行（不是恢復）時叫。動畫跑完、手指離開大約一秒後才看條件；這一秒內又劃一行就重新等
    static func struck() {
        var stats = Review.read(Prefs.shared.string(Prefs.reviewKey), now: Clock.now())
        stats.strikes += 1
        Prefs.shared.set(Prefs.reviewKey, Review.write(stats))
        wait?.cancel()
        let work = DispatchWorkItem { Task { @MainActor in ask() } } // 系統評分框只准在主執行緒叫
        wait = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Timing.reviewDelay, execute: work)
    }

    @MainActor
    private static func ask() {
        // 已經切走就不跳
        guard UIApplication.shared.applicationState == .active,
              let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
        else { return }
        let now = Clock.now()
        var stats = Review.read(Prefs.shared.string(Prefs.reviewKey), now: now)
        let noticeAt = Prefs.shared.string(Prefs.noticeKey).flatMap(Double.init).flatMap { $0 > 0 ? $0 : nil }
        guard Review.shouldAsk(stats, now: now, version: version, noticeAt: noticeAt) else { return }
        stats.asked = version // 先記再叫：這一版只叫一次，系統跳不跳都算
        Prefs.shared.set(Prefs.reviewKey, Review.write(stats))
        AppStore.requestReview(in: scene)
    }
}

/// 1.0 開過同步的人（1.1 access.ts B5）：iCloud 同步改成完整版功能，更新後第一次打開、確定沒買，跳一次
enum FullNotice {
    /// 回傳這次要不要跳。這台的紙有傳過 iCloud 的記號（sh）或傳過排列＝1.0 時開著同步
    static func check(book: Notebook, full: Bool) -> Bool {
        if Prefs.shared.string(Prefs.noticeKey) != nil {
            return false
        }
        if full {
            Prefs.shared.set(Prefs.noticeKey, "0") // 買了的人直接記，以後不用跳
            return false
        }
        guard book.notes.contains(where: { $0.syncedHash != nil }) || book.orderSent != nil else { return false }
        Prefs.shared.set(Prefs.noticeKey, String(Int64(Clock.now()))) // 記跳的時間：評分提示要避開之後的 14 天
        return true
    }
}

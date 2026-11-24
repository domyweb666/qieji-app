import os
import StoreKit
import SwiftUI

/// 購買的結果（付費頁照這個講一句話；取消不是錯誤）
enum BuyResult: Equatable {
    case ok, busy, cancel, pending, unconfirmed, unverified, offline, blocked, fail
}

enum RestoreResult: Equatable {
    case ok, busy, cancel, none, unverified, offline
}

/// 茄記完整版的購買（1.1 iap.ts，換成 StoreKit 2）：問 Apple 買了沒、讀價格、買、恢復購買。規則在 FullRule。
/// 🔍 送審前要給會寫 iOS 的人看過的檔（.vibe/安全標準.md「授權」段）。
/// - 「買了沒」只看 Transaction.currentEntitlements：只交出驗過簽章、沒被撤銷的交易；退款、家人共享被收回都會從這裡消失
/// - 手機上記的那個記號（1.1 同一個鍵 qieji.full.v1）只是快取：打開 app、回到前景、買完、恢復完都重問一次，以 Apple 為準
/// - 不存憑證、不印交易內容、不連任何自己的伺服器；錯誤只印代碼
/// - 沒有假解鎖：開發版也要用沙盒帳號或 StoreKit 測試設定檔真的買
@MainActor
final class Purchases: ObservableObject {
    static let shared = Purchases(prefs: .shared)
    private static let log = Logger(subsystem: "org.domyweb.qieji", category: "purchase")

    @Published private(set) var full = false
    @Published private(set) var price: String? // App Store 傳回的在地價格，不寫死
    @Published private(set) var priceFailed = false
    @Published private(set) var busy = false // 正在買或正在恢復：那兩顆先不能再點
    /// 打開之後第一次問過 StoreKit 了（問不到也算問過）：1.0 同步過的人那個提示框要等這個，才知道是不是「確定沒買」（1.1 iap.ts whenAsked）
    @Published private(set) var asked = false

    private let prefs: Prefs
    private var started = false
    private var pricing = false
    private var updates: Task<Void, Never>?
    private var lastUnverified = false

    init(prefs: Prefs) {
        self.prefs = prefs
    }

    /// 打開 app 時叫一次：先用手機上次記的結果（不等網路），再問 StoreKit；之後聽著別處完成的交易（家長核准、退款）
    func start() {
        guard !started else { return }
        started = true
        full = prefs.string(LegacyStore.fullKey) == "1"
        updates = Task { [weak self] in
            for await result in StoreKit.Transaction.updates {
                await self?.settle(result)
            }
        }
        Task {
            for await result in StoreKit.Transaction.unfinished {
                if case let .verified(deal) = result {
                    await deal.finish()
                }
            }
            await refresh()
            asked = true
        }
    }

    /// 重新問一次買了沒
    func refresh() async {
        var owned = false, unverified = false
        for await result in StoreKit.Transaction.currentEntitlements {
            switch result {
            case let .verified(deal) where deal.productID == FullRule.productID:
                if deal.revocationDate == nil {
                    owned = true
                }
            case let .unverified(deal, _) where deal.productID == FullRule.productID:
                unverified = true
            default:
                break
            }
        }
        lastUnverified = unverified && !owned
        let check: FullRule.Check = owned ? .owned : unverified ? .unverified : .notOwned
        let value = FullRule.next(cached: full, check: check)
        if FullRule.confirmed(check) {
            prefs.set(LegacyStore.fullKey, value ? "1" : nil)
        }
        if value != full {
            full = value
        }
    }

    private func settle(_ result: VerificationResult<StoreKit.Transaction>) async {
        if case let .verified(deal) = result {
            await deal.finish()
        }
        await refresh()
    }

    /// 讀價格（付費頁、設定頁打開時）。讀不到就照實說，不寫死
    func loadPrice() {
        guard !pricing, !full else { return }
        pricing = true
        priceFailed = false
        Task {
            defer { pricing = false }
            do {
                let found = try await Timeout.run(Tok.Timing.priceLimit) {
                    try await Product.products(for: [FullRule.productID])
                }
                if let product = found.first {
                    price = product.displayPrice
                } else if price == nil {
                    priceFailed = true
                }
            } catch {
                Purchases.log.error("price failed: \(String(describing: type(of: error)), privacy: .public)")
                if price == nil {
                    priceFailed = true
                }
            }
        }
    }

    func buy() async -> BuyResult {
        guard !busy else { return .busy }
        busy = true
        defer { busy = false }
        do {
            // 付款框跳出來之後不設時限（使用者在按），只有跟 Apple 要商品這一步設
            let found = try await Timeout.run(Tok.Timing.priceLimit) {
                try await Product.products(for: [FullRule.productID])
            }
            guard let product = found.first else { return .fail }
            switch try await product.purchase() {
            case let .success(.verified(deal)):
                await deal.finish()
                await refresh()
                return full ? .ok : .unconfirmed
            case .success(.unverified):
                await refresh()
                return .unverified
            case .userCancelled:
                return .cancel
            case .pending:
                return .pending
            @unknown default:
                return .fail
            }
        } catch {
            Purchases.log.error("buy failed: \(String(describing: type(of: error)), privacy: .public)")
            return error is Timeout.Expired ? .offline : Purchases.failure(error)
        }
    }

    func restore() async -> RestoreResult {
        guard !busy else { return .busy }
        busy = true
        defer { busy = false }
        do {
            try await AppStore.sync()
        } catch {
            if let kit = error as? StoreKitError, case .userCancelled = kit {
                return .cancel
            }
            Purchases.log.error("restore failed: \(String(describing: type(of: error)), privacy: .public)")
            return .offline
        }
        await refresh()
        if full {
            return .ok
        }
        return lastUnverified ? .unverified : .none
    }

    /// StoreKit 丟出來的錯 → 畫面要分的幾種情況；認不得的一律當一般失敗
    static func failure(_ error: Error) -> BuyResult {
        if let kit = error as? StoreKitError {
            switch kit {
            case .userCancelled: return .cancel
            case .networkError: return .offline
            case .notAvailableInStorefront, .notEntitled: return .blocked
            default: return .fail
            }
        }
        if let purchase = error as? Product.PurchaseError, case .purchaseNotAllowed = purchase {
            return .blocked
        }
        return .fail
    }
}

/// 等一件事最多幾秒，超過就當失敗。StoreKit 不理會取消，不能用 task group（group 結束前會等它跑完，等於沒設時限，
/// 豆鍵 2026-11-11 在審查的 iPad 上就是這樣一直轉圈被退）；改成兩個各自跑的工作搶著回覆，先到的算數，晚到的丟掉
enum Timeout {
    struct Expired: Error {}

    static func run<T: Sendable>(_ seconds: Double, _ work: @escaping @Sendable () async throws -> T) async throws -> T {
        try await withCheckedThrowingContinuation { continuation in
            let reply = ReplyOnce(continuation)
            Task {
                do {
                    try await reply.send(.success(work()))
                } catch {
                    reply.send(.failure(error))
                }
            }
            Task {
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                reply.send(.failure(Expired()))
            }
        }
    }
}

/// 只讓第一個回覆送出去，第二個直接丟掉（continuation 回覆兩次會閃退）
private final class ReplyOnce<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<T, Error>?

    init(_ continuation: CheckedContinuation<T, Error>) {
        self.continuation = continuation
    }

    func send(_ result: Result<T, Error>) {
        lock.lock()
        let pending = continuation
        continuation = nil
        lock.unlock()
        pending?.resume(with: result)
    }
}

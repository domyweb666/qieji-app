@testable import Qieji
import StoreKitTest
import XCTest

/// 完整版買了沒：規則（FullRule）照 1.1 full.ts；購買、退款用 StoreKit 的測試商店真的跑一次（不連 App Store、不花錢）
@MainActor
final class PurchaseTests: XCTestCase {
    private let suite = "qieji.tests.purchase"

    override func tearDown() {
        UserDefaults().removePersistentDomain(forName: suite)
        super.tearDown()
    }

    func testRules() {
        XCTAssertTrue(FullRule.next(cached: false, check: .owned))
        XCTAssertFalse(FullRule.next(cached: true, check: .notOwned))
        XCTAssertFalse(FullRule.next(cached: true, check: .unverified)) // 驗不過：寧可鎖住
        XCTAssertTrue(FullRule.next(cached: true, check: .unreachable)) // 問不到：沿用上次
        XCTAssertFalse(FullRule.next(cached: false, check: .unreachable)) // 從來沒記過＝沒買
        XCTAssertTrue(FullRule.confirmed(.notOwned))
        XCTAssertFalse(FullRule.confirmed(.unreachable))
    }

    func testBuyThenRefundLocksAgain() async throws {
        let url = try XCTUnwrap(Bundle(for: PurchaseTests.self).url(forResource: "Full", withExtension: "storekit"))
        let session = try SKTestSession(contentsOf: url)
        session.resetToDefaultState()
        session.disableDialogs = true
        session.clearTransactions()

        let prefs = Prefs(defaults: UserDefaults(suiteName: suite) ?? .standard)
        let shop = Purchases(prefs: prefs)
        await shop.refresh()
        XCTAssertFalse(shop.full)

        let result = await shop.buy()
        XCTAssertEqual(result, .ok)
        XCTAssertTrue(shop.full)
        XCTAssertEqual(prefs.string(LegacyStore.fullKey), "1") // 記在手機上（1.1 同一個鍵）

        // 退款：Apple 撤銷那筆交易，下次重算要鎖回去，記號也清掉
        let deal = try XCTUnwrap(session.allTransactions().first)
        try session.refundTransaction(identifier: deal.identifier)
        await shop.refresh()
        XCTAssertFalse(shop.full)
        XCTAssertNil(prefs.string(LegacyStore.fullKey))
    }

    func testRestoreFindsNothingWhenNeverBought() async throws {
        let url = try XCTUnwrap(Bundle(for: PurchaseTests.self).url(forResource: "Full", withExtension: "storekit"))
        let session = try SKTestSession(contentsOf: url)
        session.resetToDefaultState()
        session.disableDialogs = true
        session.clearTransactions()
        let shop = Purchases(prefs: Prefs(defaults: UserDefaults(suiteName: suite) ?? .standard))
        await shop.refresh()
        XCTAssertFalse(shop.full)
    }
}

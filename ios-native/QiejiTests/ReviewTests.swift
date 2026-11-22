@testable import Qieji
import XCTest

/// 評分提示的規則（1.1 review.ts、tools/tests/c2-review.test.ts）：三個條件都到了才問、這一版只問一次、
/// 剛看過「iCloud 同步改成完整版功能」的 14 天內不問；手機裡存的格式跟 1.1 一樣，壞掉的欄位用安全的值
final class ReviewTests: XCTestCase {
    private let now: Double = 1_800_000_000_000
    private let day = Review.day

    private func ready() -> Review.Stats {
        Review.Stats(first: now - 8 * day, days: ["2026-11-01", "2026-11-03", "2026-11-05", "2026-11-07"], strikes: 10, asked: nil)
    }

    func testNothingStoredStartsToday() {
        let stats = Review.read(nil, now: now)
        XCTAssertEqual(stats, Review.Stats(first: now, days: [], strikes: 0, asked: nil))
    }

    func testReadsWhat11Wrote() {
        let raw = #"{"first":1700000000000,"days":["2026-11-01","2026-11-02","2026-11-02"],"strikes":3.7,"asked":null}"#
        let stats = Review.read(raw, now: now)
        XCTAssertEqual(stats.first, 1_700_000_000_000)
        XCTAssertEqual(stats.days, ["2026-11-01", "2026-11-02"]) // 重複的日子只算一次
        XCTAssertEqual(stats.strikes, 3)
        XCTAssertNil(stats.asked)
    }

    func testBrokenFieldsFallBackSafely() {
        // first 在未來、strikes 是負的、days 不是陣列、整份不是 JSON：一律當沒記過（寧可晚問）
        let future = Review.read(#"{"first":9999999999999999,"days":"x","strikes":-4,"asked":3}"#, now: now)
        XCTAssertEqual(future, Review.Stats(first: now, days: [], strikes: 0, asked: nil))
        XCTAssertEqual(Review.read("不是 JSON", now: now), Review.Stats(first: now, days: [], strikes: 0, asked: nil))
    }

    func testWriteThenReadKeepsEverything() {
        var stats = ready()
        stats.asked = "2.0.0"
        XCTAssertEqual(Review.read(Review.write(stats), now: now), stats)
        XCTAssertEqual(Review.read(Review.write(ready()), now: now), ready()) // asked 是 null 也讀得回來
    }

    func testOpenDaysCountOncePerDayAndKeepTheLatestFour() {
        var stats = Review.Stats(first: now, days: [], strikes: 0, asked: nil)
        XCTAssertTrue(Review.markOpen(&stats, now: now))
        XCTAssertFalse(Review.markOpen(&stats, now: now + 60_000)) // 同一天再打開不算
        for offset in 1 ... 5 {
            XCTAssertTrue(Review.markOpen(&stats, now: now + Double(offset) * day))
        }
        XCTAssertEqual(stats.days.count, Review.openDays)
        XCTAssertEqual(stats.days.last, Review.dayOf(now + 5 * day))
    }

    func testAsksOnlyWhenAllThreeAreMet() {
        XCTAssertTrue(Review.shouldAsk(ready(), now: now, version: "2.0.0", noticeAt: nil))
        var young = ready()
        young.first = now - 6 * day
        XCTAssertFalse(Review.shouldAsk(young, now: now, version: "2.0.0", noticeAt: nil))
        var fewDays = ready()
        fewDays.days.removeLast()
        XCTAssertFalse(Review.shouldAsk(fewDays, now: now, version: "2.0.0", noticeAt: nil))
        var fewStrikes = ready()
        fewStrikes.strikes = 9
        XCTAssertFalse(Review.shouldAsk(fewStrikes, now: now, version: "2.0.0", noticeAt: nil))
    }

    func testOncePerVersion() {
        var stats = ready()
        stats.asked = "2.0.0"
        XCTAssertFalse(Review.shouldAsk(stats, now: now, version: "2.0.0", noticeAt: nil))
        XCTAssertTrue(Review.shouldAsk(stats, now: now, version: "2.0.1", noticeAt: nil)) // 下一版可以再問
        XCTAssertFalse(Review.shouldAsk(ready(), now: now, version: "", noticeAt: nil)) // 讀不到版本號不問
    }

    func testQuietAfterThePaidSyncNotice() {
        XCTAssertFalse(Review.shouldAsk(ready(), now: now, version: "2.0.0", noticeAt: now - 13 * day))
        XCTAssertTrue(Review.shouldAsk(ready(), now: now, version: "2.0.0", noticeAt: now - 15 * day))
    }
}

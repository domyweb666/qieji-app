import Foundation

/// 「茄記完整版買了沒」的判斷規則（1.1 full.ts；.vibe/安全標準.md「授權：誰算買了」）。純函式，測試直接跑。
/// 1. 只信 Apple 驗過的交易；StoreKit 交出驗不過簽章的交易＝當沒買（寧可鎖住）
/// 2. 問得到：照 Apple 說的，蓋掉手機上記的
/// 3. 問不到：沿用手機上次記的；從來沒記過就是沒買
/// 這裡只回「買了沒」，不刪、不改任何紙（鎖住只停功能）。
enum FullRule {
    static let productID = "org.domyweb.qieji.full"

    enum Check: Equatable {
        case owned // 有一筆驗過、沒被撤銷的完整版交易（自己買的或家人共享的）
        case notOwned // 問到了，沒有
        case unverified // 有完整版的交易但簽章驗不過
        case unreachable // 問不到
    }

    /// cached＝手機上次記的。回這次之後算不算買了
    static func next(cached: Bool, check: Check) -> Bool {
        switch check {
        case .owned: true
        case .notOwned, .unverified: false
        case .unreachable: cached
        }
    }

    /// 這次的結果要不要寫回手機：問到了、或確定驗不過才寫；問不到就不動上次記的
    static func confirmed(_ check: Check) -> Bool {
        check != .unreachable
    }
}

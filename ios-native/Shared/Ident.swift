import Foundation

// 行的 id 與時間。app 與分享擴充都要：分享進來的行在擴充那邊就定好 id（2.1 從 Core/Model.swift 搬過來，內容沒改）

enum Ident {
    /// 跟 Expo 版同一個樣子：時間（36 進位）＋五個隨機字
    static func make(now: Double = Date().timeIntervalSince1970 * 1000) -> String {
        let alphabet = Array("0123456789abcdefghijklmnopqrstuvwxyz")
        let tail = String((0 ..< 5).map { _ in alphabet[Int.random(in: 0 ..< alphabet.count)] })
        return String(Int64(now), radix: 36) + tail
    }

    /// 從 id 讀出是什麼時候記的（前八碼就是時間；1.1、網頁版同一個寫法，尾巴可能不到五個字）。
    /// 不另外存時間：多一個欄位會動到同步指紋，舊版讀到會丟掉。
    /// 不像我們的 id、時間不合理（太早、比現在晚）就回 nil，寧可不顯示
    static func born(_ id: String, now: Double = Clock.now()) -> Double? {
        let ours = id.unicodeScalars.allSatisfy { (0x30 ... 0x39).contains($0.value) || (0x61 ... 0x7A).contains($0.value) }
        guard ours, (9 ... 13).contains(id.count), let stamp = Int64(id.prefix(8), radix: 36) else { return nil }
        let time = Double(stamp)
        return time >= earliest && time <= now ? time : nil
    }

    /// 2024-01-01：比網頁版還早，更早的一定不是我們的 id
    private static let earliest: Double = 1_704_067_200_000
}

enum Clock {
    /// 毫秒（跟 JavaScript 的 Date.now() 同一個單位，存檔裡的時間都是這個）
    static func now() -> Double {
        (Date().timeIntervalSince1970 * 1000).rounded()
    }

    static func validTime(_ val: Double?) -> Bool {
        guard let val else { return false }
        return val.isFinite && val > 0
    }
}

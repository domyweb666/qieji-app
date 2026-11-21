import CryptoKit
import Foundation

/// 讀 Expo 版（1.x）留在手機裡的存檔。只讀，絕對不改、不刪：出事時舊資料原封不動還在。
///
/// Expo 版用 AsyncStorage（@react-native-async-storage 2.2.0），原生那邊的存法（對過 ios/RNCAsyncStorage.mm）：
/// - 資料夾：Application Support/<bundle id>/RCTAsyncLocalStorage_V1/
/// - manifest.json 是一個 { 鍵: 值 } 的物件；值超過 1024 個字（UTF-16）的，manifest 裡記 null，
///   真正的內容另外放在同資料夾、檔名是「鍵的 MD5（小寫十六進位）」的檔案裡
/// - 更早的版本放在 Documents 底下同名的資料夾，套件第一次打開時會自己搬；這裡兩個地方都找
enum LegacyStore {
    static let folder = "RCTAsyncLocalStorage_V1"
    static let manifest = "manifest.json"
    static let bookKey = "colornotes.v1"
    static let lastKey = "cn.last"
    static let recentKey = "cn.recent"
    static let hintKey = "cn.hint"
    static let syncOffKey = "qieji.syncOff.v1"
    static let fullKey = "qieji.full.v1"
    static let lookKey = "qieji.look.v1"
    static let textSizeKey = "qieji.textSize.v1"

    static func md5(_ text: String) -> String {
        Insecure.MD5.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// 這支 app 的舊存檔可能在哪幾個資料夾（新的位置在前）
    static func candidates(bundleID: String, files: FileManager = .default) -> [URL] {
        var out: [URL] = []
        if let support = files.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            out.append(support.appendingPathComponent(bundleID).appendingPathComponent(folder))
        }
        if let docs = files.urls(for: .documentDirectory, in: .userDomainMask).first {
            out.append(docs.appendingPathComponent(folder))
        }
        return out
    }

    /// 讀出整個資料夾的鍵值。沒有 manifest（沒裝過舊版）回 nil
    static func read(dir: URL) -> [String: String]? {
        guard let data = try? Data(contentsOf: dir.appendingPathComponent(manifest)),
              let dict = JSONValue.parse(data)?.objectValue else { return nil }
        var out: [String: String] = [:]
        for (key, val) in dict {
            if let text = val.stringValue {
                out[key] = text
            } else if let big = try? String(contentsOf: dir.appendingPathComponent(md5(key)), encoding: .utf8) {
                out[key] = big
            }
        }
        return out
    }

    /// 找第一個讀得到東西的位置
    static func readFirst(bundleID: String) -> [String: String]? {
        for dir in candidates(bundleID: bundleID) {
            if let found = read(dir: dir) {
                return found
            }
        }
        return nil
    }
}

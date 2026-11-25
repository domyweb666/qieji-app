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

    struct Old {
        var values: [String: String]
        var book: Data? // 紙那一份的原文，一個位元都沒動過
    }

    enum Found {
        case none // 沒裝過舊版
        case got(Old)
        case blocked // 檔在，現在讀不到、或 manifest 壞了看不懂。不准當成沒有
    }

    /// 讀出整個資料夾的鍵值。只有系統明講「沒有這個檔」才算沒裝過舊版。
    /// needBook＝要紙：紙那一份讀不到就整個算讀不到。不要紙的（只搬設定）不受那個大檔影響。其他值讀不到就跳過
    static func read(dir: URL, needBook: Bool) -> Found {
        let data: Data
        do {
            data = try Data(contentsOf: dir.appendingPathComponent(manifest))
        } catch CocoaError.fileReadNoSuchFile {
            return .none
        } catch {
            Disk.log.error("legacy manifest not read: \((error as NSError).code, privacy: .public)")
            return .blocked
        }
        guard let dict = JSONValue.parse(data)?.objectValue else {
            Disk.log.error("legacy manifest broken")
            return .blocked
        }
        var out = Old(values: [:], book: nil)
        for (key, val) in dict {
            if let text = val.stringValue {
                out.values[key] = text
                if key == bookKey {
                    out.book = Data(text.utf8)
                }
                continue
            }
            guard key != bookKey else { continue }
            out.values[key] = try? String(contentsOf: dir.appendingPathComponent(md5(key)), encoding: .utf8)
        }
        guard needBook, out.book == nil, dict[bookKey] != nil else { return .got(out) }
        do {
            out.book = try Data(contentsOf: dir.appendingPathComponent(md5(bookKey)))
        } catch CocoaError.fileReadNoSuchFile {
            return .got(out)
        } catch {
            Disk.log.error("legacy book not read: \((error as NSError).code, privacy: .public)")
            return .blocked
        }
        return .got(out)
    }

    /// 找第一個有的位置（要紙的，沒有紙的位置跳過）。前面的讀不到就停，不退去讀更舊的
    static func find(_ dirs: [URL], needBook: Bool) -> Found {
        for dir in dirs {
            switch read(dir: dir, needBook: needBook) {
            case .none: continue
            case .blocked: return .blocked
            case let .got(old):
                if !needBook || old.book != nil {
                    return .got(old)
                }
            }
        }
        return .none
    }
}

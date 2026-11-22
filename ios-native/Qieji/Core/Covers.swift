import os
import UIKit

/// 封面圖（1.1 covers.ts，完整版功能）：紙頂部放一張圖，目錄的磚、小方磚也用它。
/// 圖檔放在手機的「文件／covers／<代號>.jpg」（跟 1.1 同一個地方：更新到 2.0 之後，1.1 放好的圖照樣在），紙上只記代號（Note.cover）。
/// 選的照片先縮到寬 1200 再存（幾百 KB）。選照片用系統的選取畫面，不用跟使用者要相簿權限。
/// 代號只准小寫英數（外面進來的檔不能指到別的路徑）。上鎖的紙不露圖。
final class Covers: ObservableObject {
    static let shared = Covers(dir: Covers.standardDir)
    private static let log = Logger(subsystem: "org.domyweb.qieji", category: "covers")
    static let width: CGFloat = 1200
    static let quality: CGFloat = 0.8

    /// 圖到了、換了、拿掉了就加一，畫面跟著重畫
    @Published private(set) var version = 0
    let dir: URL
    private let cache = NSCache<NSString, UIImage>()
    private var have: [String: Bool] = [:]

    init(dir: URL) {
        self.dir = dir
    }

    static var standardDir: URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        return docs.appendingPathComponent("covers")
    }

    static func safe(_ code: String) -> Bool {
        NoteCoding.isCoverName(code)
    }

    private func file(_ code: String) -> URL {
        dir.appendingPathComponent("\(code).jpg")
    }

    func has(_ code: String?) -> Bool {
        guard let code, Covers.safe(code) else { return false }
        if let known = have[code] {
            return known
        }
        let found = FileManager.default.fileExists(atPath: file(code).path)
        have[code] = found
        return found
    }

    /// 畫得出來的封面圖；沒有封面、檔案不在這支手機上（還沒從 iCloud 下來）、上鎖的紙都回 nil，畫面就照沒有封面畫
    func image(_ note: Note) -> UIImage? {
        guard !note.locked, let code = note.cover, has(code) else { return nil }
        if let hit = cache.object(forKey: code as NSString) {
            return hit
        }
        guard let loaded = UIImage(contentsOfFile: file(code).path) else { return nil }
        cache.setObject(loaded, forKey: code as NSString)
        return loaded
    }

    /// 選好的照片：縮到寬 1200、存成 JPEG。回傳新的代號；失敗回 nil
    func save(_ data: Data) -> String? {
        guard let picked = UIImage(data: data) else { return nil }
        let shrink = picked.size.width > Covers.width ? Covers.width / picked.size.width : 1
        let size = CGSize(width: (picked.size.width * shrink).rounded(), height: (picked.size.height * shrink).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let small = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            picked.draw(in: CGRect(origin: .zero, size: size))
        }
        guard let jpeg = small.jpegData(compressionQuality: Covers.quality) else { return nil }
        let code = Ident.make().filter { $0.isLetter || $0.isNumber }.lowercased()
        return write(code, jpeg) ? code : nil
    }

    @discardableResult
    func write(_ code: String, _ data: Data) -> Bool {
        guard Covers.safe(code), !data.isEmpty else { return false }
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try data.write(to: file(code), options: .atomic)
            have[code] = true
            cache.removeObject(forKey: code as NSString)
            version += 1
            return true
        } catch {
            Covers.log.error("cover write failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    /// 讀出圖檔（上傳 iCloud 用）；沒有檔回 nil
    func data(_ code: String) -> Data? {
        guard Covers.safe(code) else { return nil }
        return try? Data(contentsOf: file(code))
    }

    func remove(_ code: String) {
        guard Covers.safe(code) else { return }
        do {
            if FileManager.default.fileExists(atPath: file(code).path) {
                try FileManager.default.removeItem(at: file(code))
            }
        } catch {
            Covers.log.error("old cover not removed: \(error.localizedDescription, privacy: .public)")
        }
        have[code] = false
        cache.removeObject(forKey: code as NSString)
        version += 1
    }
}

extension Store {
    /// 放上／換掉封面圖（舊的那張圖檔刪掉）
    func setCover(_ id: String, _ code: String) {
        let old = book.note(id)?.cover
        editNote(id) { $0.cover = code }
        if let old, old != code {
            Covers.shared.remove(old)
        }
    }

    /// 拿掉封面圖（退款之後照樣拿得掉：鎖住只停功能，不扣住使用者的東西）
    func clearCover(_ id: String) {
        guard let old = book.note(id)?.cover else { return }
        editNote(id) { $0.cover = nil }
        Covers.shared.remove(old)
    }
}

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
    private let thumbs = NSCache<NSString, UIImage>()
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
    func image(_ note: Note, evenLocked: Bool = false) -> UIImage? {
        guard !note.locked || evenLocked, let code = note.cover, has(code) else { return nil }
        if let hit = cache.object(forKey: code as NSString) {
            return hit
        }
        guard let loaded = UIImage(contentsOfFile: file(code).path) else { return nil }
        cache.setObject(loaded, forKey: code as NSString)
        return loaded
    }

    /// 這張紙的磚要畫哪張圖（代號）；沒有封面、圖還沒到、上鎖都回 nil
    func shownCode(_ note: Note) -> String? {
        guard !note.locked, let code = note.cover, has(code) else { return nil }
        return code
    }

    /// 磚上用的小圖（解好、縮好的）：原圖寬 1200，每塊磚各自解一次、縮一次會卡
    func thumb(_ code: String) -> UIImage? {
        if let hit = thumbs.object(forKey: code as NSString) {
            return hit
        }
        guard Covers.safe(code), let made = Covers.shrink(file(code)) else { return nil }
        thumbs.setObject(made, forKey: code as NSString)
        return made
    }

    /// 先在背景把圖準備好（打開 app 的時候）：磚上的小圖全部，紙頂的大圖只準備最近改過的幾張（佔記憶體）
    func warm(_ notes: [Note]) {
        let newest = notes.filter { !$0.deleted }.sorted { $0.updated > $1.updated }
        let codes = newest.compactMap(shownCode)
        for (index, code) in codes.enumerated() {
            let key = code as NSString, url = file(code), thumbs = thumbs, cache = cache
            let big = index < Covers.warmBig && cache.object(forKey: key) == nil
            guard big || thumbs.object(forKey: key) == nil else { continue }
            DispatchQueue.global(qos: .utility).async {
                if let made = Covers.shrink(url) {
                    thumbs.setObject(made, forKey: key)
                }
                if big, let ready = UIImage(contentsOfFile: url.path)?.preparingForDisplay() {
                    cache.setObject(ready, forKey: key)
                }
            }
        }
    }

    private static let warmBig = 6

    private static func shrink(_ url: URL) -> UIImage? {
        guard let full = UIImage(contentsOfFile: url.path), full.size.width > 0, full.size.height > 0 else { return nil }
        let scale = min(1, thumbSide / min(full.size.width, full.size.height))
        let size = CGSize(width: (full.size.width * scale).rounded(), height: (full.size.height * scale).rounded())
        return full.preparingThumbnail(of: size)
    }

    /// 小圖的短邊幾個像素：最大的磚 64 點、螢幕三倍
    private static let thumbSide: CGFloat = Tok.Shape.tileMax * 3

    /// 選好的照片：縮到寬 1200、存成 JPEG。回傳新的代號；失敗回 nil
    func save(_ data: Data) -> String? {
        Covers.small(data).flatMap(keep)
    }

    /// 縮好的圖存起來，回傳新的代號
    func keep(_ jpeg: Data) -> String? {
        let code = Ident.make().filter { $0.isLetter || $0.isNumber }.lowercased()
        return write(code, jpeg) ? code : nil
    }

    /// 縮圖、壓成 JPEG。一張照片要一兩百毫秒，在背景做
    static func small(_ data: Data) -> Data? {
        guard let picked = UIImage(data: data) else { return nil }
        let shrink = picked.size.width > Covers.width ? Covers.width / picked.size.width : 1
        let size = CGSize(width: (picked.size.width * shrink).rounded(), height: (picked.size.height * shrink).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            picked.draw(in: CGRect(origin: .zero, size: size))
        }
        .jpegData(compressionQuality: Covers.quality)
    }

    @discardableResult
    func write(_ code: String, _ data: Data) -> Bool {
        guard Covers.safe(code), !data.isEmpty else { return false }
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try data.write(to: file(code), options: .atomic)
            have[code] = true
            cache.removeObject(forKey: code as NSString)
            thumbs.removeObject(forKey: code as NSString)
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
        thumbs.removeObject(forKey: code as NSString)
        version += 1
    }
}

extension Store {
    /// 上鎖／解除上鎖（只算這支手機的事，不上傳）。上鎖時當成沒傳過：解除上鎖之後會重新傳上去
    func setLocked(_ id: String, _ on: Bool) {
        editNote(id) { note in
            note.locked = on
            if on {
                note.syncedHash = nil
            }
        }
    }

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

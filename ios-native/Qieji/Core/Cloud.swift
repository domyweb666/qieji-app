import Foundation
import os

// iCloud 同步的傳輸層：只搬檔案。規則（合併、墓碑、指紋）全在 Sync 與 Seats。對應 Expo 版 src/lib/cloud.ts。
// 「檔案 › iCloud 雲碟 › 茄記」裡一張紙一個 <id>.json，墓碑在 gone.json，目錄排列在 layout.json。
//
// 2026-11-21：這一層寫好、用本機資料夾假扮 iCloud 測過，但還沒接上 app（Store 沒有呼叫它、專案也沒開 iCloud 權限）。
// 接上之前要先有：完整版的購買狀態（同步是完整版功能）、多米點頭（會寫到真的 iCloud，不可逆）。

enum CloudError: Error {
    case notFound // 沒有這個檔
    case notReady // 有這個檔，但還沒下載到這台（已經請 iCloud 下載，下次再讀）
}

/// 放檔案的地方。真的 iCloud 資料夾與測試用的本機資料夾都實作這個
protocol CloudDrive {
    /// iCloud 有沒有登入、雲碟有沒有開
    func available() -> Bool
    /// 資料夾裡所有檔名（含還沒下載到這台的）
    func names() throws -> [String]
    func read(_ name: String) throws -> String
    func write(_ name: String, _ text: String) throws
    func remove(_ name: String) throws
}

/// 一個普通的資料夾當雲碟（測試用；真的 iCloud 資料夾也是在這上面多處理「還沒下載」）
struct FolderDrive: CloudDrive {
    let dir: URL
    var online = true

    func available() -> Bool {
        online
    }

    func names() throws -> [String] {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return try FileManager.default.contentsOfDirectory(atPath: dir.path)
    }

    func read(_ name: String) throws -> String {
        let file = dir.appendingPathComponent(name)
        guard FileManager.default.fileExists(atPath: file.path) else {
            throw CloudError.notFound
        }
        return try String(contentsOf: file, encoding: .utf8)
    }

    func write(_ name: String, _ text: String) throws {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try text.write(to: dir.appendingPathComponent(name), atomically: true, encoding: .utf8)
    }

    func remove(_ name: String) throws {
        try FileManager.default.removeItem(at: dir.appendingPathComponent(name))
    }
}

/// 真的 iCloud 雲碟（容器的 Documents 資料夾）。還沒下載到這台的檔，系統用「.檔名.icloud」佔位：
/// 列檔名時換回原名，讀的時候請系統下載、這次先當成讀不到
struct ICloudDrive: CloudDrive {
    static let container = "iCloud.org.domyweb.qieji"

    private var dir: URL? {
        FileManager.default.url(forUbiquityContainerIdentifier: ICloudDrive.container)?.appendingPathComponent("Documents")
    }

    func available() -> Bool {
        FileManager.default.ubiquityIdentityToken != nil && dir != nil
    }

    func names() throws -> [String] {
        guard let dir else {
            throw CloudError.notFound
        }
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return try FileManager.default.contentsOfDirectory(atPath: dir.path).map { name in
            guard name.hasPrefix("."), name.hasSuffix(".icloud") else {
                return name
            }
            return String(name.dropFirst().dropLast(".icloud".count))
        }
    }

    func read(_ name: String) throws -> String {
        guard let dir else {
            throw CloudError.notFound
        }
        let file = dir.appendingPathComponent(name)
        if FileManager.default.fileExists(atPath: file.path) {
            return try String(contentsOf: file, encoding: .utf8)
        }
        let holder = dir.appendingPathComponent(".\(name).icloud")
        guard FileManager.default.fileExists(atPath: holder.path) else {
            throw CloudError.notFound
        }
        try? FileManager.default.startDownloadingUbiquitousItem(at: file)
        throw CloudError.notReady
    }

    func write(_ name: String, _ text: String) throws {
        guard let dir else {
            throw CloudError.notFound
        }
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try text.write(to: dir.appendingPathComponent(name), atomically: true, encoding: .utf8)
    }

    func remove(_ name: String) throws {
        guard let dir else {
            throw CloudError.notFound
        }
        try FileManager.default.removeItem(at: dir.appendingPathComponent(name))
    }
}

/// 上傳、下載各一趟。不記狀態（誰先誰後、准不准同步由呼叫的人管），所以可以拿兩份資料、同一個資料夾模擬兩台手機
struct CloudSync {
    static let goneFile = "gone.json"
    static let layoutFile = "layout.json"
    static let log = Logger(subsystem: "org.domyweb.qieji", category: "cloud")

    let drive: CloudDrive

    enum Fetched {
        case off // iCloud 沒登入或雲碟關掉
        case failed // 這次拿不到（列不出資料夾）
        case got(notes: [JSONValue], gone: JSONValue?, layout: Seats.LayoutFetch, names: [String])
    }

    struct Pushed: Equatable {
        var synced = 0 // 傳上去幾個檔（紙＋排列）
        var conflict = false // iCloud 上有別台改過、這台還沒拉下來的：要先拉再傳
        var goneWritten = false
    }

    // MARK: 下載

    /// 把 iCloud 上所有紙、墓碑、排列讀回來（原樣）。某一張讀不到就跳過：本機那張留著，上傳前也會因為讀不到而先不傳
    func fetch() -> Fetched {
        guard drive.available() else {
            return .off
        }
        guard let names = try? drive.names() else {
            return .failed
        }
        var notes: [JSONValue] = []
        var gone: JSONValue? = .object([:])
        var layout: Seats.LayoutFetch = names.contains(CloudSync.layoutFile) ? .unreadable : .missing
        for name in names where name.hasSuffix(".json") && !name.hasPrefix(".") {
            guard let text = try? drive.read(name) else {
                continue
            }
            guard let data = JSONValue.parse(text) else {
                // 壞掉的檔案不理；壞掉的排列當成沒有，會被這台的蓋掉
                if name == CloudSync.layoutFile {
                    layout = .missing
                }
                continue
            }
            switch name {
            case CloudSync.goneFile: gone = data
            case CloudSync.layoutFile: layout = .found(data)
            default: notes.append(data)
            }
        }
        return .got(notes: notes, gone: gone, layout: layout, names: names)
    }

    // MARK: 上傳

    /// 讀 iCloud 上的一個檔。回傳：.some(字)＝讀到了；.some(nil)＝沒有這個檔；nil＝有但這次讀不到
    private func peek(_ name: String) -> String?? {
        do {
            return try .some(drive.read(name))
        } catch CloudError.notFound {
            return .some(nil)
        } catch {
            return nil
        }
    }

    /// 把要傳的紙、排列、墓碑傳上去。會改 book：傳成功的紙記下 sh、排列記下 orderSent。
    /// goneSent＝上次寫進 gone.json 的本機墓碑（照鍵名排好的 JSON），一樣就不重寫
    func push(_ book: inout Notebook, goneSent: inout String) -> Pushed {
        var out = Pushed()
        let pending = Sync.pendingUploads(book)
        let goneNow = JSONValue.object(book.gone.mapValues { .number($0) }).stringify()
        let goneDirty = goneNow != goneSent && !book.gone.isEmpty
        let layout = Seats.layoutToSend(book)
        if pending.isEmpty, !goneDirty, layout == nil {
            return out
        }
        guard drive.available() else {
            return out
        }
        for note in pending {
            pushNote(note, into: &book, out: &out)
        }
        if let layout {
            pushLayout(layout, into: &book, out: &out)
        }
        if goneDirty, pushGone(book.gone) {
            goneSent = goneNow
            out.goneWritten = true
        }
        return out
    }

    /// 蓋之前先看 iCloud 上那份：不是上次傳的（sh）也不是現在這份（h）＝別台改過、還沒拉下來，不能蓋
    private func pushNote(_ note: Note, into book: inout Notebook, out: inout Pushed) {
        let name = "\(note.id).json"
        guard let there = peek(name) else {
            return // 讀不到（還沒下載下來）：這張這輪先不傳
        }
        let theirs = there.flatMap { JSONValue.parse($0) }.flatMap(Sync.remotePrint)
        if let theirs, theirs != note.syncedHash, theirs != note.hash {
            out.conflict = true
            return
        }
        // sh 是這台自己的記號，不傳上去
        var paper = note
        paper.syncedHash = nil
        do {
            try drive.write(name, NoteCoding.json(paper).stringify())
        } catch {
            CloudSync.log.error("write note failed: \(error.localizedDescription, privacy: .public)")
            return
        }
        if let idx = book.index(note.id) {
            book.notes[idx].syncedHash = note.hash
        }
        out.synced += 1
    }

    /// 排列：iCloud 上那份比這台新＝別台後來排過、還沒拉下來，不蓋。讀不到這輪先不傳；不存在或壞掉才直接寫
    private func pushLayout(_ layout: Seats.Layout, into book: inout Notebook, out: inout Pushed) {
        guard let there = peek(CloudSync.layoutFile) else {
            return
        }
        if let text = there, let theirs = Seats.readLayout(JSONValue.parse(text)), theirs.mod > layout.mod {
            out.conflict = true
            return
        }
        do {
            try drive.write(CloudSync.layoutFile, layout.json.stringify())
        } catch {
            CloudSync.log.error("write layout failed: \(error.localizedDescription, privacy: .public)")
            return
        }
        book.orderSent = layout.mod
        out.synced += 1
    }

    /// 墓碑：先讀 iCloud 上原本那份合起來再寫（別台立的墓碑不能被蓋掉）；寫成功之後才把被擋住的紙的檔案拿掉
    private func pushGone(_ mine: [String: Double]) -> Bool {
        guard let there = peek(CloudSync.goneFile) else {
            return false
        }
        var merged = mine
        if let text = there, let theirs = JSONValue.parse(text)?.objectValue {
            for (id, stamp) in theirs {
                if let at = stamp.numberValue, at.isFinite {
                    merged[id] = max(merged[id] ?? 0, at)
                }
            }
        }
        do {
            try drive.write(CloudSync.goneFile, JSONValue.object(merged.mapValues { .number($0) }).stringify())
        } catch {
            CloudSync.log.error("write gone failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
        sweep(merged)
        return true
    }

    /// 墓碑之後別台又改過（離線那台還在記）的檔留著；其他被墓碑擋住的拿掉。某一張失敗不影響其他張
    private func sweep(_ gone: [String: Double]) {
        guard let names = try? drive.names() else {
            return
        }
        for name in names where name.hasSuffix(".json") {
            let id = String(name.dropLast(".json".count))
            if id.isEmpty || name == CloudSync.goneFile || name == CloudSync.layoutFile || gone[id] == nil {
                continue
            }
            guard let text = try? drive.read(name), let raw = JSONValue.parse(text) else {
                continue
            }
            if Sync.cloudFileBuried(gone, raw: raw) {
                try? drive.remove(name)
            }
        }
    }
}

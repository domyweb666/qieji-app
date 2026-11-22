import os
import UIKit

/// iCloud 同步接上 app（1.1 cloud.ts＋store 的 pullCloud／pushCloud）。規則在 Sync、Seats，搬檔案在 CloudSync，這裡只管「什麼時候拉、什麼時候傳」。
/// - 完整版功能：買了、而且使用者沒在設定頁關掉才准（allowed）。不准時只是停，不刪任何東西，手機上的紙和 iCloud 雲碟裡的檔都不動
/// - 打開 app 第一次拉完（或確定拉不了）才准上傳：先傳會拿舊的蓋掉別台剛改的
/// - 存檔成功後等 2 秒才傳（打字中每 0.25 秒存一次）；進背景時馬上傳
/// - iCloud 看起來換了一個（換 Apple ID、資料夾被刪）：先停下來問，不合也不傳
/// - iCloud 雲碟沒開：過 10 秒再確認還是沒開，提示一次，之後永遠不再提示
/// - 上鎖的紙不傳；上鎖那一刻拿掉 iCloud 上那份（不立墓碑）
/// 讀寫檔案在背景佇列，合併與改資料回到主執行緒
final class CloudLink: ObservableObject {
    static let shared = CloudLink(drive: ICloudDrive())
    private static let log = Logger(subsystem: "org.domyweb.qieji", category: "cloud")
    /// 封面圖在 iCloud 上的檔名：cover-<代號>.b64（1.1 同一個格式），上限 5 MB
    static let coverPrefix = "cover-"
    static let coverMax = 5_000_000

    @Published private(set) var asking = false // 「這個 iCloud 裡沒有你的紙」正在問
    @Published private(set) var lastSync: Date?

    weak var store: Store?
    private let drive: CloudDrive
    private let queue = DispatchQueue(label: "org.domyweb.qieji.cloud", qos: .utility)
    private(set) var allowed = false
    private var paused = false
    private var ready = false
    private var busy = false
    private var again = false
    private var goneSent = ""
    private var pushWork: DispatchWorkItem?
    private var offWork: DispatchWorkItem?

    init(drive: CloudDrive) {
        self.drive = drive
    }

    /// 使用者要不要同步（設定頁的開關；1.1 同一個鍵：'1'＝關掉）
    var syncOn: Bool {
        Prefs.shared.string(LegacyStore.syncOffKey) != "1"
    }

    func setSyncOn(_ on: Bool, full: Bool) {
        Prefs.shared.set(LegacyStore.syncOffKey, on ? nil : "1")
        objectWillChange.send()
        setAllowed(full && on)
    }

    /// 買了而且開著同步才准
    func setAllowed(_ on: Bool) {
        guard on != allowed else { return }
        allowed = on
        if on {
            pull()
        } else {
            pushWork?.cancel()
        }
    }

    /// iCloud 雲碟有沒有開（設定頁的說明用）
    func driveOn() -> Bool {
        drive.available()
    }

    // MARK: 拉

    /// 拉下來合進本機：打開 app 讀完、回到前景、重新打開同步、上傳時發現別台改過
    func pull() {
        guard allowed, !paused, !busy, let store, store.loaded, !store.frozen else { return }
        busy = true
        let drive = drive
        queue.async { [weak self] in
            let fetched = CloudSync(drive: drive).fetch()
            DispatchQueue.main.async { self?.merge(fetched) }
        }
    }

    private func merge(_ fetched: CloudSync.Fetched) {
        busy = false
        ready = true
        guard let store, allowed else { return }
        switch fetched {
        case .off:
            offOnce()
            return
        case .failed:
            return
        case let .got(notes, gone, layout, names):
            if Sync.seemsNewCloud(store.book, names: names, gone: gone) {
                paused = true
                asking = true
                return
            }
            store.mergeCloud(notes: notes, gone: gone, layout: layout)
            lastSync = Date()
            syncCovers(names: names)
        }
        pushSoon()
    }

    /// 「放進去」：這台的紙全部當成沒傳過，跟現在這個 iCloud 合起來、全部傳上去
    func adopt() {
        asking = false
        store?.forgetSync()
        paused = false
        pull()
    }

    /// 「先不要」：這次打開只存在手機上，下次打開再問
    func decline() {
        asking = false
    }

    private func offOnce() {
        offWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, Prefs.shared.string(Prefs.cloudOffKey) == nil, !drive.available() else { return }
            Prefs.shared.set(Prefs.cloudOffKey, "1")
            store?.toast = Store.Toast(text: Words.cloudOff)
        }
        offWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Timing.cloudOffGrace, execute: work)
    }

    // MARK: 傳

    /// 存檔成功之後叫：等一下才傳；now＝進背景，馬上傳
    func pushSoon(now: Bool = false) {
        guard allowed, !paused, ready, store != nil else { return }
        pushWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.push() }
        pushWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + (now ? 0 : Tok.Timing.cloudPushWait), execute: work)
    }

    private func push() {
        guard allowed, !paused, ready, let store else { return }
        if busy {
            again = true
            return
        }
        busy = true
        var copy = store.book
        var sent = goneSent
        let drive = drive
        queue.async { [weak self] in
            let result = CloudSync(drive: drive).push(&copy, goneSent: &sent)
            DispatchQueue.main.async {
                guard let self else { return }
                busy = false
                goneSent = sent
                store.adoptSync(from: copy)
                if result.synced > 0 || result.goneWritten {
                    lastSync = Date()
                }
                if result.conflict {
                    pull()
                } else if again {
                    again = false
                    pushSoon()
                }
            }
        }
    }

    /// 上鎖那一刻：拿掉 iCloud 上那份（不立墓碑，解除上鎖之後會重新傳上去）。done(true)＝拿掉了或本來就沒有
    func dropNote(_ id: String, done: @escaping (Bool) -> Void) {
        guard allowed else {
            done(true)
            return
        }
        let drive = drive
        queue.async {
            var gone = true
            if drive.available(), let names = try? drive.names(), names.contains("\(id).json") {
                gone = (try? drive.remove("\(id).json")) != nil
            }
            DispatchQueue.main.async { done(gone) }
        }
    }

    // MARK: 封面圖

    /// 紙合完再對封面圖（1.1 syncCovers）：這台有、iCloud 沒有的傳上去；iCloud 有、這台沒有的抓下來（先驗格式與大小）
    private func syncCovers(names: [String]) {
        guard let store else { return }
        let codes = Set(store.book.notes.filter { !$0.locked && !$0.deleted }.compactMap(\.cover).filter(Covers.safe))
        let there = Set(names)
        var upload: [(String, Data)] = []
        var download: [String] = []
        for code in codes {
            let file = "\(CloudLink.coverPrefix)\(code).b64"
            if Covers.shared.has(code) {
                if !there.contains(file), let data = Covers.shared.data(code) {
                    upload.append((file, data))
                }
            } else if there.contains(file) {
                download.append(code)
            }
        }
        guard !upload.isEmpty || !download.isEmpty else { return }
        let drive = drive
        queue.async {
            for (file, data) in upload {
                try? drive.write(file, data.base64EncodedString())
            }
            var got: [(String, Data)] = []
            for code in download {
                guard let text = try? drive.read("\(CloudLink.coverPrefix)\(code).b64"),
                      let data = Data(base64Encoded: text), data.count <= CloudLink.coverMax, UIImage(data: data) != nil
                else { continue }
                got.append((code, data))
            }
            DispatchQueue.main.async {
                for (code, data) in got {
                    Covers.shared.write(code, data)
                }
            }
        }
    }
}

extension Store {
    /// 把 iCloud 拉下來的紙、墓碑、排列合進本機（規則全在 Sync.mergeCloud、Seats.mergeLayout），一律存一次
    func mergeCloud(notes: [JSONValue], gone: JSONValue?, layout: Seats.LayoutFetch) {
        var copy = book
        let result = Sync.mergeCloud(&copy, notes: notes, gone: gone, now: Clock.now())
        let moved = frozen ? false : Seats.mergeLayout(&copy, layout)
        replaceBook(copy)
        if result.changed || moved {
            ensureCurrent()
        }
        flush()
    }

    /// 上傳成功的紙記下 sh、排列記下 orderSent。傳的這段時間又改過的那張不記（下次照樣傳）
    func adoptSync(from sent: Notebook) {
        var copy = book
        var changed = false
        for note in sent.notes {
            guard let synced = note.syncedHash, let idx = copy.index(note.id),
                  copy.notes[idx].hash == note.hash, copy.notes[idx].syncedHash != synced else { continue }
            copy.notes[idx].syncedHash = synced
            changed = true
        }
        if let mod = sent.orderSent, copy.orderMod == mod, copy.orderSent != mod {
            copy.orderSent = mod
            changed = true
        }
        if changed {
            replaceBook(copy)
            flush()
        }
    }

    /// 「放進去」：忘掉跟舊 iCloud 對過的記號，全部當成沒傳過
    func forgetSync() {
        var copy = book
        Sync.forgetSync(&copy)
        replaceBook(copy)
        flush()
    }
}

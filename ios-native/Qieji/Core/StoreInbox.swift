import Foundation

/// 分享進來（2.1）：擴充把字放進收件匣，app 打開、回到前景時併進紙。
/// 丟字和記兩次是最嚴重的錯：存檔成功才刪收件匣的檔；行的 id 在分享當下定好，已經在紙上（含最近刪除）的不再加。
extension Store {
    /// 收件匣的讀、刪、寫名字都排這一條。共用容器第一次拿很慢，不准在主執行緒等
    private static let inboxQueue = DispatchQueue(label: "org.domyweb.qieji.inbox", qos: .userInitiated)

    // MARK: 併進紙

    /// 打開 app 讀完紙、回到前景各叫一次。沒東西就不叫醒主執行緒；已經有一趟在收就等它收完再看一次
    func takeInbox() {
        guard canTakeInbox, inboxGate.enter() else { return }
        readInbox()
    }

    /// 紙還沒讀好、這次不准寫檔、假資料：不併、不刪
    private var canTakeInbox: Bool {
        loaded && !frozen && disk != nil
    }

    private func readInbox() {
        let inbox = inbox, gate = inboxGate, turn = inboxTurn
        Store.inboxQueue.async { [weak self] in
            var mail = inbox.read()
            while mail.isEmpty {
                guard gate.leave() else { return }
                mail = inbox.read()
            }
            DispatchQueue.main.async { self?.mergeInbox(mail, turn: turn) }
        }
    }

    /// turn 不一樣＝讀的時候按了「清除所有資料」：那些字不准再回來
    private func mergeInbox(_ mail: [ShareInbox.Mail], turn: Int) {
        guard turn == inboxTurn, canTakeInbox else {
            settleInbox(mail, saved: false)
            return
        }
        // 正在拖一行、拖磚：最上面多幾行，放手的位置會算錯。等放手
        guard !inboxHold() else {
            DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Timing.inboxRetry) { [weak self] in
                self?.mergeInbox(mail, turn: turn)
            }
            return
        }
        var next = book
        let tops = InboxMerge.run(
            &next, mail.map(\.entry), current: currentID, recent: disk?.recent ?? [], now: Clock.now()
        )
        if !tops.isEmpty {
            landed = currentID.flatMap { id in tops[id].map { (note: id, line: $0) } }
            edit { $0 = next }
            tellInbox(tops.keys.filter { $0 != currentID })
        }
        // 千行的紙算指紋要十幾毫秒：先在背景算好，存的時候才不卡
        let changed = tops.keys.compactMap { next.note($0) }
        Store.inboxQueue.async { [weak self] in
            for note in changed {
                _ = PrintCache.shared.print(of: note)
            }
            DispatchQueue.main.async {
                self?.saveSoon { saved in self?.settleInbox(mail, saved: saved) }
            }
        }
    }

    /// 放進正在看的這張不用講（看得到，會亮一下）；放進別張講一聲
    private func tellInbox(_ others: [String]) {
        guard let one = others.first.flatMap({ book.note($0) }) else { return }
        toast = Toast(text: others.count == 1 ? Words.landedIn(Labels.label(one)) : Words.landedMany(others.count))
    }

    /// 存成功才刪那幾個檔；沒存成就留著，下次再來（認得出已經在紙上，不會記兩次）
    private func settleInbox(_ mail: [ShareInbox.Mail], saved: Bool) {
        let inbox = inbox, gate = inboxGate
        Store.inboxQueue.async { [weak self] in
            if saved {
                inbox.remove(mail)
            }
            guard gate.leave() else { return }
            DispatchQueue.main.async { self?.readInbox() }
        }
    }

    /// 紙要剛併進這張的那一行（亮一下）。拿一次就清掉；已經換到別張就算了
    func takeLanded(in note: Note) -> String? {
        guard let found = landed else { return nil }
        landed = nil
        return found.note == note.id ? found.line : nil
    }

    // MARK: 那一張的名字

    /// 分享卡上寫的「放進 X」：跟小工具同樣的時候推，不看買了沒。內容一樣不寫。
    /// now＝上鎖那一刻：寫完才回來
    func pushTarget(now: Bool = false) {
        guard loaded, disk != nil else { return }
        let target = shareTarget()
        guard now || targetSent != .some(target) else { return }
        targetSent = .some(target)
        let inbox = inbox
        if now {
            Store.inboxQueue.sync { inbox.setTarget(target) }
        } else {
            Store.inboxQueue.async { inbox.setTarget(target) }
        }
    }

    private func shareTarget() -> ShareTarget? {
        let spot = InboxMerge.place(book, wanted: nil, current: currentID, recent: disk?.recent ?? [], need: 1)
        return spot.map { book.notes[$0] }.map {
            ShareTarget(id: $0.id, title: Labels.label($0), glyph: Labels.glyph($0), color: $0.color)
        }
    }

    // MARK: 清除

    /// 清除所有資料：收件匣和名字一起清；讀到一半還沒併的不算數。回傳有沒有清乾淨
    func wipeInbox() -> Bool {
        inboxTurn += 1
        landed = nil
        targetSent = nil
        let inbox = inbox
        return Store.inboxQueue.sync { inbox.wipe() }
    }
}

/// 收件匣的字放進哪一張、怎麼放。純計算
enum InboxMerge {
    /// entries 舊的在前。每則插到最上面（新的在最上），拆的行照原本順序。
    /// 回傳放了字的紙 id → 那張最上面的新行 id；一行都沒加就是空的
    static func run(_ book: inout Notebook, _ entries: [ShareEntry], current: String?, recent: [String], now: Double) -> [String: String] {
        var known = Set<String>()
        for note in book.notes {
            known.formUnion(note.items.map(\.id))
            known.formUnion(note.bin.map(\.id))
        }
        var tops: [String: String] = [:]
        for entry in entries {
            let fresh = entry.lines.filter { known.insert($0.id).inserted }.map { Item(id: $0.id, text: $0.text) }
            guard let first = fresh.first else { continue }
            let id = place(book, wanted: entry.note, current: current, recent: recent, need: fresh.count)
                .map { book.notes[$0].id } ?? openNew(&book, now: now)
            guard let spot = book.index(id) else { continue }
            book.notes[spot].items.insert(contentsOf: fresh, at: 0)
            book.notes[spot].updated = now
            tops[id] = first.id
        }
        return tops
    }

    /// 放哪張：分享時寫的那張 → 正在看的 → 最近開過的 → 其他（改過的新到舊）。都不能放回 nil
    static func place(_ book: Notebook, wanted: String?, current: String?, recent: [String], need: Int) -> Int? {
        for id in [wanted, current].compactMap({ $0 }) + recent {
            if let spot = book.index(id), fits(book.notes[spot], need) {
                return spot
            }
        }
        return book.notes.indices.filter { fits(book.notes[$0], need) }.max { book.notes[$0].updated < book.notes[$1].updated }
    }

    /// 能記的：沒刪、是清單、沒上鎖、放得下
    static func fits(_ note: Note, _ need: Int) -> Bool {
        !note.deleted && !note.isText && !note.locked && Lines.room(note) >= need
    }

    /// 開一張新的空白紙：放進目錄第一個空位，不換過去
    private static func openNew(_ book: inout Notebook, now: Double) -> String {
        let note = Note.blank(now: now)
        book.notes.append(note)
        Seats.seatFirstHole(&book, noteID: note.id, now: now)
        return note.id
    }
}

/// 同一時間只有一趟在收。打開 app 和回到前景幾乎同時叫：後到的記著，前一趟收完再看一次
final class InboxGate {
    private let lock = NSLock()
    private var busy = false
    private var again = false

    /// 輪得到就 true
    func enter() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if busy {
            again = true
            return false
        }
        busy = true
        return true
    }

    /// 這一趟收完了。true＝中間有人要過，還是我的，再收一次
    func leave() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if again {
            again = false
            return true
        }
        busy = false
        return false
    }
}

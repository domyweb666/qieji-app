import Foundation

/// 分享進來（2.1）：擴充把字放進收件匣，app 打開、回到前景時併進紙。
/// 丟字和記兩次是最嚴重的錯：存檔成功才刪收件匣的檔；行的 id 在分享當下定好，已經在紙上（含最近刪除）的不再加。
extension Store {
    /// 收件匣的讀、刪都排這一條。共用容器第一次拿很慢，不准在主執行緒等
    private static let inboxQueue = DispatchQueue(label: "org.domyweb.qieji.inbox", qos: .userInitiated)
    /// 紙單自己一條：上鎖那一刻要等它寫完，不准排在讀檔、算指紋後面
    private static let nameQueue = DispatchQueue(label: "org.domyweb.qieji.inbox.name", qos: .userInitiated)

    // MARK: 併進紙

    /// 打開 app、回到前景用這個：同步開著時先等這一輪 iCloud 有結果。
    /// 先併的話，別台改過、這台還沒拉的那張會變成「兩邊都改」，以這台的舊字為主，別台改的字就沒了
    func takeInbox(after cloud: CloudLink) {
        cloud.whenPulled { [weak self] in self?.takeInbox() }
    }

    /// 沒東西就不叫醒主執行緒；已經有一趟在收就等它收完再看一次
    func takeInbox() {
        guard canTakeInbox, inboxGate.enter() else { return }
        readInbox()
    }

    /// 紙還沒讀好、這次不准寫檔、假資料：不併、不刪
    private var canTakeInbox: Bool {
        loaded && !frozen && disk != nil
    }

    /// 這一趟讀到的一批。seen＝這一趟看過的檔（含前面幾批）：沒收掉的同一趟不再看，等下次
    private struct Pass {
        var mail: [ShareInbox.Mail]
        var seen: Set<String>
        var more: Bool
        let turn: Int
    }

    private func readInbox(seen: Set<String> = []) {
        let inbox = inbox, gate = inboxGate, bad = inboxBad, turn = inboxTurn
        Store.inboxQueue.async { [weak self] in
            var seen = seen
            var batch = inbox.read(skip: seen.union(bad.names))
            while batch.mail.isEmpty {
                bad.names.formUnion(batch.bad)
                seen.formUnion(batch.names)
                if !batch.more {
                    guard gate.leave() else { return }
                    seen = []
                }
                batch = inbox.read(skip: seen.union(bad.names))
            }
            bad.names.formUnion(batch.bad)
            let pass = Pass(mail: batch.mail, seen: seen.union(batch.names), more: batch.more, turn: turn)
            DispatchQueue.main.async { self?.mergeInbox(pass) }
        }
    }

    /// turn 不一樣＝讀的時候按了「清除所有資料」：那些字不准再回來
    private func mergeInbox(_ pass: Pass) {
        guard pass.turn == inboxTurn, canTakeInbox else {
            settleInbox(pass, saved: nil)
            return
        }
        // 正在拖一行、拖磚：最上面多幾行，放手的位置會算錯。等放手
        guard !inboxHold() else {
            DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Timing.inboxRetry) { [weak self] in
                self?.mergeInbox(pass)
            }
            return
        }
        let entries = pass.mail.map(\.entry)
        let skip = dealtWith(InboxMerge.ids(entries), in: book)
        var next = book
        let out = InboxMerge.run(
            &next, entries, skip: skip, current: currentID, recent: disk?.recent ?? [], now: Clock.now()
        )
        inboxPut.merge(out.put) { _, new in new }
        if !out.tops.isEmpty {
            landed = currentID.flatMap { id in out.tops[id].map { (note: id, line: $0) } }
            edit { $0 = next }
            tellInbox(out.tops.keys.filter { $0 != currentID })
        }
        // 千行的紙算指紋要十幾毫秒：先在背景算好，存的時候才不卡
        let changed = out.tops.keys.compactMap { next.note($0) }
        Store.inboxQueue.async { [weak self] in
            for note in changed {
                _ = PrintCache.shared.print(of: note)
            }
            DispatchQueue.main.async {
                self?.saveSoon { saved in self?.settleInbox(pass, saved: saved) }
            }
        }
    }

    /// 這次打開已經處理過的行，不准再加：存進去過的；併進去過、那張紙還在的（行不在＝使用者永久刪掉、拆掉了）。
    /// 併進去過、整張紙卻不見了的不算：存檔前被別台的墓碑拿掉，那些字還沒存過，要重併到別張
    private func dealtWith(_ ids: Set<String>, in book: Notebook) -> Set<String> {
        let papers = Set(book.notes.map(\.id)), put = inboxPut, kept = inboxKept
        return ids.filter { id in kept.contains(id) || put[id].map(papers.contains) == true }
    }

    /// 放進正在看的這張不用講（看得到，會亮一下）；放進別張講一聲。
    /// 當下那條還可以按「復原」就不講：蓋掉就復原不了
    private func tellInbox(_ others: [String]) {
        guard toast?.undo == nil, let one = others.first.flatMap({ book.note($0) }) else { return }
        toast = Toast(text: others.count == 1 ? Words.landedIn(Labels.label(one)) : Words.landedMany(others.count))
    }

    /// saved＝寫進檔案的那一份（沒存成是 nil）。一個檔的每一行都有著落（在那一份裡、或使用者自己刪掉了）才刪；
    /// 其餘留著，下次再來（認得出已經在紙上的，不會記兩次）
    private func settleInbox(_ pass: Pass, saved: Notebook?) {
        guard let saved, pass.turn == inboxTurn else {
            nextInbox(pass, stop: true)
            return
        }
        let inbox = inbox
        let ids = InboxMerge.ids(pass.mail.map(\.entry))
        let dealt = dealtWith(ids, in: saved)
        Store.inboxQueue.async { [weak self] in
            let done = dealt.union(InboxMerge.found(ids, in: saved))
            inbox.remove(pass.mail.filter { mail in mail.entry.lines.allSatisfy { done.contains($0.id) } })
            DispatchQueue.main.async {
                guard let self else { return }
                if pass.turn == self.inboxTurn {
                    self.inboxKept.formUnion(done)
                    self.inboxPut = self.inboxPut.filter { !ids.contains($0.key) }
                }
                self.nextInbox(pass, stop: false)
            }
        }
    }

    /// 還有下一批就接著收；收完了、中間有人要過就再看一次
    private func nextInbox(_ pass: Pass, stop: Bool) {
        if !stop, pass.more {
            readInbox(seen: pass.seen)
        } else if inboxGate.leave() {
            readInbox()
        }
    }

    /// 紙要剛併進這張的那一行（亮一下）。拿一次就清掉；已經換到別張就算了
    func takeLanded(in note: Note) -> String? {
        guard let found = landed else { return nil }
        landed = nil
        return found.note == note.id ? found.line : nil
    }

    // MARK: 可選的紙單

    /// 分享卡上「放進 X ▾」的紙單：跟小工具同樣的時候推，不看買了沒。內容一樣不寫。
    /// now＝上鎖那一刻：寫完才回來（在主執行緒做；共用容器打開 app 時就在背景拿過了）。沒寫成就忘掉上次推的：下一次一定再推
    func pushTarget(now: Bool = false) {
        guard loaded, !frozen, disk != nil else { return }
        let targets = shareTargets()
        guard now || targetsSent != targets else { return }
        targetsSent = targets
        let inbox = inbox
        if now {
            if !Store.nameQueue.sync(execute: { inbox.setTargets(targets) }) {
                targetsSent = nil
            }
        } else {
            Store.nameQueue.async { [weak self] in
                guard !inbox.setTargets(targets) else { return }
                DispatchQueue.main.async { self?.targetsSent = nil }
            }
        }
    }

    private func shareTargets() -> [ShareTarget] {
        let notes = InboxMerge.choices(book, current: currentID, recent: disk?.recent ?? [])
        return zip(notes, InboxMerge.names(notes)).map {
            ShareTarget(id: $0.id, title: $1, glyph: Labels.glyph($0), color: $0.color)
        }
    }

    // MARK: 清除

    /// 清除所有資料：收件匣和紙單一起清；讀到一半還沒併的不算數。回傳有沒有清乾淨
    func wipeInbox() -> Bool {
        inboxTurn += 1
        landed = nil
        targetsSent = nil
        inboxPut = [:]
        inboxKept = []
        let inbox = inbox
        Store.nameQueue.sync {} // 還在排隊的紙單先寫完，才不會清掉之後又寫回去
        return Store.inboxQueue.sync { inbox.wipe() }
    }
}

/// 收件匣的字放進哪一張、怎麼放。純計算
enum InboxMerge {
    struct Landed: Equatable {
        var tops: [String: String] = [:] // 放了字的紙 id → 那張最上面的新行 id
        var put: [String: String] = [:] // 放進去的每一行 id → 放進哪一張
    }

    static func ids(_ entries: [ShareEntry]) -> Set<String> {
        Set(entries.flatMap { $0.lines.map(\.id) })
    }

    /// 這幾個 id 哪些已經在紙上（行、最近刪除）。只掃一趟、只比這幾個：不為了一行把全部的行做成一份表
    static func found(_ ids: Set<String>, in book: Notebook) -> Set<String> {
        var here = Set<String>()
        for note in book.notes {
            for item in note.items where ids.contains(item.id) {
                here.insert(item.id)
            }
            for item in note.bin where ids.contains(item.id) {
                here.insert(item.id)
            }
        }
        return here
    }

    /// entries 舊的在前，skip＝不准再加的。每則插到最上面（新的在最上），拆的行照原本順序。
    static func run(
        _ book: inout Notebook, _ entries: [ShareEntry], skip: Set<String> = [], current: String?, recent: [String], now: Double
    ) -> Landed {
        var known = found(ids(entries), in: book).union(skip)
        var out = Landed()
        for entry in entries {
            let fresh = entry.lines.filter { known.insert($0.id).inserted }.map { Item(id: $0.id, text: $0.text) }
            guard let first = fresh.first else { continue }
            let id = place(book, wanted: entry.note, current: current, recent: recent, need: fresh.count)
                .map { book.notes[$0].id } ?? openNew(&book, now: now)
            guard let spot = book.index(id) else { continue }
            book.notes[spot].items.insert(contentsOf: fresh, at: 0)
            book.notes[spot].updated = now
            out.tops[id] = first.id
            for item in fresh {
                out.put[item.id] = id
            }
        }
        return out
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

    /// 分享卡上可以選的紙。第一張＝沒選時會放的那張；後面照切換清單：釘選的 → 最近開過的 → 最近改過的補，張數也一樣。
    /// 先濾掉不能記的再算：上鎖的、滿了的不佔名額
    static func choices(_ book: Notebook, current: String?, recent: [String]) -> [Note] {
        guard let first = place(book, wanted: nil, current: current, recent: recent, need: 1).map({ book.notes[$0] }) else { return [] }
        var usable = book
        usable.notes = book.notes.filter { fits($0, 1) }
        let lists = Seats.switchList(usable, recent: [first.id] + recent)
        return [first] + (lists.pinned + lists.recent).filter { $0.id != first.id }
    }

    /// 紙單上的名字。同名的加上開的日期，還是一樣（同一天開的）再加幾點幾分。
    /// 只用開的時間：紙的內容（第一行）不准放進共用區
    static func names(_ notes: [Note], calendar: Calendar = .current) -> [String] {
        let labels = notes.map(Labels.label)
        func same(_ list: [String], _ name: String) -> Bool {
            list.filter { $0 == name }.count > 1
        }
        let days = zip(notes, labels).map { note, label in
            same(labels, label) ? "\(label)・\(Dates.day(note.created, calendar: calendar))" : label
        }
        return zip(notes, zip(labels, days)).map { note, name in
            same(labels, name.0) && same(days, name.1) ? "\(name.1) \(Dates.time(note.created, calendar: calendar))" : name.1
        }
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

/// 這次打開看過、讀不懂的檔名：回前景不再重讀。只在收件匣那條佇列上碰
final class InboxBad {
    var names: Set<String> = []
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

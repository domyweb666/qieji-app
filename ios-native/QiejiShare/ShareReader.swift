import UIKit
import UniformTypeIdentifiers

/// 把系統交過來的附件讀成字：只收文字和 http/https 網址，不開網頁、不跑網頁的程式。不在主執行緒做
enum ShareReader {
    static func read(_ inputs: [Any]) async -> ShareFound {
        let items = inputs.compactMap { $0 as? NSExtensionItem }
        // 一個項目一組，全部一起讀；總共只等這麼久
        let groups = items.map { ($0.attachments ?? []).filter(isOurs) }
        let bits = await ShareGather.run(
            groups.flatMap { $0 }.map { provider in { await bit(provider) } }, limit: Tok.Timing.shareReadLimit
        )
        let late = bits.filter { $0 == nil }.count
        if late > 0 {
            ShareController.log.error("not read in time: \(late)")
        }
        var haul = ShareHaul(), from = 0
        for (item, group) in zip(items, groups) {
            haul.add(
                Array(bits[from ..< from + group.count]),
                title: item.attributedTitle?.string, content: item.attributedContentText?.string
            )
            from += group.count
        }
        return haul.found()
    }

    /// 要讀的、不收但要講一聲的
    private static func isOurs(_ provider: NSItemProvider) -> Bool {
        [UTType.url, .plainText, .image, .movie].contains { has(provider, $0) }
    }

    private static func bit(_ provider: NSItemProvider) async -> ShareBit {
        if has(provider, .url), let link = await ShareHaul.link(load(provider, .url)) {
            return .link(link)
        }
        if has(provider, .plainText), let words = await ShareHaul.words(load(provider, .plainText)) {
            return .text(words.text, cut: words.cut)
        }
        // 圖片常常是一個檔案網址：上面那條不收，這裡才認出來
        if has(provider, .image) {
            return .image
        }
        return has(provider, .movie) ? .movie : .missed
    }

    private static func has(_ provider: NSItemProvider, _ type: UTType) -> Bool {
        provider.hasItemConformingToTypeIdentifier(type.identifier)
    }

    private static func load(_ provider: NSItemProvider, _ type: UTType) async -> Any? {
        do {
            return try await provider.loadItem(forTypeIdentifier: type.identifier)
        } catch {
            let plain = error as NSError
            ShareController.log.error("load failed: \(plain.domain, privacy: .public) \(plain.code)")
            return nil
        }
    }
}

import UIKit
import UniformTypeIdentifiers

/// 把系統交過來的附件讀成字：只收文字和 http/https 網址，不開網頁、不跑網頁的程式
enum ShareReader {
    static func read(_ items: [Any]) async -> ShareHaul {
        var haul = ShareHaul()
        for case let item as NSExtensionItem in items {
            if haul.title == nil {
                haul.title = [item.attributedTitle, item.attributedContentText]
                    .compactMap { $0?.string }.first { !ShareText.trim($0).isEmpty }
            }
            for provider in item.attachments ?? [] {
                await read(provider, into: &haul)
            }
        }
        return haul
    }

    private static func read(_ provider: NSItemProvider, into haul: inout ShareHaul) async {
        let isLink = provider.hasItemConformingToTypeIdentifier(UTType.url.identifier)
        let isText = provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
        guard isLink || isText else { return }
        if isLink, let link = await ShareHaul.link(load(provider, .url)) {
            haul.add(link: link)
        } else if isText, let text = await ShareHaul.words(load(provider, .plainText)) {
            haul.add(text: text)
        } else {
            haul.miss()
        }
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

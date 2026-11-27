import SwiftUI

/// 紙上的字級（1.1 textSize.ts，完整版功能）：在系統字級上再乘一段，小／標準／大／特大。
/// 只影響紙上的行和記事本的內文；標題、選單、設定照系統字級。記在這支手機（1.1 同一個鍵），不同步。
/// 退款之後已經調好的字級留著，只是不能再改（鎖住只停功能）。
final class TextSize: ObservableObject {
    static let shared = TextSize()
    static let choices: [(scale: CGFloat, label: String)] = [(0.88, "小"), (1, "標準"), (1.15, "大"), (1.3, "特大")]

    @Published private(set) var scale: CGFloat = 1

    /// 打開 app 時讀一次（Prefs 已經從 1.1 照抄過）
    func load() {
        guard let raw = Prefs.shared.string(LegacyStore.textSizeKey), let value = Double(raw),
              let hit = TextSize.choices.first(where: { abs($0.scale - CGFloat(value)) < 0.001 }) else { return }
        scale = hit.scale
    }

    func set(_ value: CGFloat) {
        guard value != scale, TextSize.choices.contains(where: { $0.scale == value }) else { return }
        scale = value
        Prefs.shared.set(LegacyStore.textSizeKey, value == 1 ? nil : "\(Double(value))")
    }

    static func label(_ value: CGFloat) -> String {
        choices.first { $0.scale == value }?.label ?? "標準"
    }
}

/// 外觀：跟隨系統／淺色／深色（1.1 look.ts，免費）。整個 app 連系統提示框、選單一起換；小工具照舊跟系統走。
/// 記在這支手機（1.1 同一個鍵）；打開 app 時在紙畫出來之前先套
final class Look: ObservableObject {
    static let shared = Look()
    static let choices: [(key: String, label: String)] = [("system", "跟隨系統"), ("light", "淺色"), ("dark", "深色")]

    @Published private(set) var key = "system"

    func load() {
        if let raw = Prefs.shared.string(LegacyStore.lookKey), raw == "light" || raw == "dark" {
            key = raw
        }
    }

    func set(_ value: String) {
        guard value != key, Look.choices.contains(where: { $0.key == value }) else { return }
        key = value
        Prefs.shared.set(LegacyStore.lookKey, value == "system" ? nil : value)
    }

    /// 給 SwiftUI 的 preferredColorScheme：跟隨系統＝nil
    var scheme: ColorScheme? {
        switch key {
        case "light": .light
        case "dark": .dark
        default: nil
        }
    }

    static func label(_ key: String) -> String {
        choices.first { $0.key == key }?.label ?? "跟隨系統"
    }
}

/// 紙張材質（2026-11-26 多米：「紙張材質都放進去，再設定裡加個材質設定，可自行做切換」）：純色和四種紙紋，免費。
/// 水彩紙壓紋 11/27 拿掉（多米真機：很難看），選過的人 load 時當成純色。2026-11-27 起在紙的 ⋯ 選單切換，不在設定頁
/// 只鋪在紙上（紙底、每一行、標題列、浮起的那行），目錄、小工具、設定頁照舊。記在這支手機，不同步；打開 app 時跟外觀同一處讀
final class PaperTexture: ObservableObject {
    static let shared = PaperTexture(prefs: .shared)
    static let plain = "plain"
    static let choices: [(key: String, label: String)] = [
        (plain, Words.texturePlain), ("fine", Words.textureFine), ("washi", Words.textureWashi),
        ("recycled", Words.textureRecycled), ("laid", Words.textureLaid),
    ]

    @Published private(set) var key = plain
    private let prefs: Prefs

    init(prefs: Prefs) {
        self.prefs = prefs
    }

    /// 不認得的值（以後拿掉的材質、壞掉的設定）當成純色
    func load() {
        let raw = prefs.string(Prefs.paperTextureKey) ?? PaperTexture.plain
        let next = PaperTexture.choices.contains { $0.key == raw } ? raw : PaperTexture.plain
        if next != key {
            key = next // 沒變不發通知：紙不用多重畫一次
        }
    }

    func set(_ value: String) {
        guard value != key, PaperTexture.choices.contains(where: { $0.key == value }) else { return }
        key = value
        prefs.set(Prefs.paperTextureKey, value == PaperTexture.plain ? nil : value)
    }

    static func label(_ key: String) -> String {
        choices.first { $0.key == key }?.label ?? Words.texturePlain
    }
}

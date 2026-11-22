import Foundation

/// 桌面小工具與 app 之間交的資料（1.1 widget.ts）：app 把「上次那張紙」的名字和前幾行放進共用的地方，小工具只讀這一份。
/// 小工具與 app 是兩個程式，只能經過 App Group（group.org.domyweb.qieji，1.1 同一個）。
/// 小工具只拿得到它要顯示的那一點點：紙名、前幾行；上鎖的紙只說上鎖了；沒買完整版只放一句話，紙的名字和內容都不放。
struct WidgetSnap: Codable, Equatable {
    struct Line: Codable, Equatable {
        var text: String
        var done: Bool
    }

    var title: String
    var lines: [Line]
    var color: String // 紙的顏色 key（淺色深色由小工具自己照系統配）
    var locked: String? // 沒買完整版：小工具只顯示這句，點了開付費頁
}

enum WidgetShare {
    static let kind = "PaperWidget" // 1.1 expo-widgets 的 kind：手機上放好的那塊更新後照樣在
    static let group = "group.org.domyweb.qieji"
    static let key = "paperWidget.v1"
    /// 各種大小最多放幾行（1.1 tokens widget.lines）
    static let smallLines = 3
    static let mediumLines = 4
    static let largeLines = 10
    static let lockLines = 2

    static func write(_ data: Data) {
        UserDefaults(suiteName: group)?.set(data, forKey: key)
    }

    static func read() -> WidgetSnap? {
        guard let data = UserDefaults(suiteName: group)?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(WidgetSnap.self, from: data)
    }
}

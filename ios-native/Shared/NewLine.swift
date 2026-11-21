import AppIntents
import SwiftUI
import WidgetKit

// 控制中心（也能放鎖定畫面底下、動作按鈕）的「記一行」：按下去打開茄記、回到上次那張紙、輸入框開好、鍵盤升起。
// 從 Expo 版 targets/controls/_shared/NewLine.swift 搬過來（2026-11-21），kind 與網址不變：使用者已經放在控制中心的那顆更新後照樣能用。
// 做法甲（2026-11-01 多米選）：動作叫系統打開 qieji://new，app 那邊由 RootView 的 onOpenURL 接住。
// 這個檔放 Shared：openAppWhenRun 的動作要同時編進 app 與擴充才會正常（Apple 論壇 763851）。
// 網址只准「打開畫面、升起輸入框」，不帶資料、解鎖不了任何東西（.vibe/安全標準.md 平台互動、授權段）。

@available(iOS 18.0, *)
struct NewLineControl: ControlWidget {
    static let kind = "org.domyweb.qieji.newline"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: NewLineIntent()) {
                Label("記一行", systemImage: "square.and.pencil")
            }
        }
        .displayName("記一行")
        .description("完整版功能。打開茄記，直接記下一行")
    }
}

@available(iOS 18.0, *)
struct NewLineIntent: ControlConfigurationIntent {
    static let title: LocalizedStringResource = "記一行"
    static let description = IntentDescription(stringLiteral: "完整版功能。打開茄記，直接記下一行")
    static let isDiscoverable = true
    static let openAppWhenRun: Bool = true

    /// 寫死的網址一定組得出來；組不出來就退成只打開 app（openAppWhenRun 已經會開）
    private static let target = URL(string: "qieji://new") ?? URL(fileURLWithPath: "/")

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(Self.target))
    }
}

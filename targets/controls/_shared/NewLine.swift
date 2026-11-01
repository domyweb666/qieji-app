// 控制中心（也能放鎖定畫面底下、動作按鈕）的「記一行」：按下去打開茄記、回到上次那張紙、輸入框開好、鍵盤升起。
// 做法甲（2026-11-01 多米選）：動作叫系統打開 qieji://new，app 那邊由 src/app/+native-intent.tsx 接住。
// 這個檔放 _shared：openAppWhenRun 的動作要同時編進 app 與擴充才會正常（apple-targets 說明、Apple 論壇 763851）。
// 真機打不開的話換做法乙（共用儲存放記號），見 .vibe/待審-控制中心按鈕.md
import AppIntents
import SwiftUI
import WidgetKit

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
    .description("打開茄記，直接記下一行")
  }
}

@available(iOS 18.0, *)
struct NewLineIntent: ControlConfigurationIntent {
  static let title: LocalizedStringResource = "記一行"
  static let description = IntentDescription(stringLiteral: "打開茄記，直接記下一行")
  static let isDiscoverable = true
  static let openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(URL(string: "qieji://new")!))
  }
}

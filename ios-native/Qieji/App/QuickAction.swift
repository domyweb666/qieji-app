import SwiftUI
import UIKit

/// 主畫面長按茄記圖示的「記一行」（靜態捷徑，寫在 project.yml 的 UIApplicationShortcutItems）。
/// 免費（多米 2026-11-25），不走 qieji://new：那條是控制中心的，沒買的人會看到付費頁。
/// 捷徑只有「打開畫面、升起輸入框」，不帶資料（.vibe/安全標準.md 平台互動）
final class QuickAction: ObservableObject {
    static let shared = QuickAction()
    static let newLine = "org.domyweb.qieji.newline"

    @Published private(set) var asks = 0
    private var pending = false

    /// 認得的捷徑才收。回傳收了沒
    @discardableResult
    func receive(_ type: String) -> Bool {
        guard type == QuickAction.newLine else { return false }
        pending = true
        asks += 1
        return true
    }

    /// 拿一次就清掉：從沒開過的狀態打開時，畫面出現和收到通知都會來拿
    func take() -> Bool {
        let had = pending
        pending = false
        return had
    }
}

final class QiejiDelegate: NSObject, UIApplicationDelegate {
    func application(
        _: UIApplication, configurationForConnecting session: UISceneSession, options _: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: nil, sessionRole: session.role)
        config.delegateClass = QiejiScene.self
        return config
    }
}

/// 只接捷徑，視窗照舊是 SwiftUI 的
final class QiejiScene: NSObject, UIWindowSceneDelegate {
    /// app 沒開著
    func scene(_: UIScene, willConnectTo _: UISceneSession, options: UIScene.ConnectionOptions) {
        if let item = options.shortcutItem {
            QuickAction.shared.receive(item.type)
        }
    }

    /// app 在背景
    func windowScene(
        _: UIWindowScene, performActionFor item: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(QuickAction.shared.receive(item.type))
    }
}

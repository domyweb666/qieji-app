import UIKit

/// 震動回饋：一種事件一種震法，紙面和目錄共用這一份（對照 Expo 版 tokens.ts 的 HAPTIC）。
///
/// | 情境 | 叫哪個 | 震法 |
/// |---|---|---|
/// | 滑動越過劃掉／刪除那條線 | arm | 最輕的「嗒」 |
/// | 拿起一行、拿起一塊磚、準備疊成資料夾 | lift | 嗒 |
/// | 拖著經過另一行、另一格、翻頁 | pass | 嗒 |
/// | 按住跳出選單、進抖動 | menu | 嗒 |
/// | 選單裡換顏色、釘選／取消釘選（選單不關或馬上收，震一下才知道有換到） | tick | 嗒 |
/// | 右下 ＋ 記一行 | add | 輕碰一下 |
/// | 拖曳放手、刪掉一張紙（放下一個東西） | land | 輕碰一下 |
/// | 被擋下來：釘滿了、磚上的字不合格 | reject | 錯誤的連震 |
///
/// 系統元件自己會震的（選單、開關、清單的滑動按鈕）不再加，加了會重複。
enum Haptic {
    private static let selection = UISelectionFeedbackGenerator()
    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let notice = UINotificationFeedbackGenerator()

    /// 手勢一開始先叫醒震動馬達，第一下才不會慢半拍
    static func prepare() {
        selection.prepare()
        light.prepare()
    }

    static func arm() {
        selection.selectionChanged()
    }

    static func lift() {
        selection.selectionChanged()
    }

    static func pass() {
        selection.selectionChanged()
    }

    static func menu() {
        selection.selectionChanged()
    }

    static func tick() {
        selection.selectionChanged()
    }

    static func add() {
        light.impactOccurred()
    }

    static func land() {
        light.impactOccurred()
    }

    static func reject() {
        notice.notificationOccurred(.error)
    }
}

import SwiftUI
import UIKit

/// 鍵盤正在升起或開著（willShow 起、willHide 止）：右上 ✓、右下 ＋ 跟鍵盤同一刻進出（1.1 kbUp）
final class KeyboardWatch: ObservableObject {
    @Published private(set) var up = false
    private var tokens: [NSObjectProtocol] = []

    init() {
        let center = NotificationCenter.default
        tokens.append(center.addObserver(forName: UIResponder.keyboardWillShowNotification, object: nil, queue: .main) { [weak self] _ in
            self?.up = true
        })
        tokens.append(center.addObserver(forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main) { [weak self] _ in
            self?.up = false
        })
    }

    deinit {
        for token in tokens {
            NotificationCenter.default.removeObserver(token)
        }
    }

    /// 收鍵盤：誰在打字都放掉
    static func dismiss() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

/// 標題列右上的茄紫 ✓（1.1 DoneBtn）：在行裡、清單名、記事本打字時才有，點了收鍵盤
struct DoneButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "checkmark")
                .font(Tok.Font.barCheck)
                .foregroundColor(Tok.Col.fabIcon)
                .frame(width: Tok.Shape.hitMin, height: Tok.Shape.hitMin)
                .frost(Circle(), tint: Tok.Col.accent, interactive: true)
        }
        .buttonStyle(PressDim())
        .accessibilityLabel(Words.doneKeyboard)
    }
}

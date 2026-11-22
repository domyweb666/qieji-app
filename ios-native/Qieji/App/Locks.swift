import LocalAuthentication
import SwiftUI

/// 個別上鎖（1.1 lock.ts，完整版功能）：上鎖的紙打開前要過 Face ID（沒有 Face ID 的手機用手機密碼）。
/// 這是「在茄記裡擋著不給看」，不是加密：手機裡的存檔是一般文字。驗證只用系統的，茄記不存任何密碼、不碰臉部資料。
/// 這次打開 app 驗過的紙記在記憶體裡，離開前景就全部忘掉，回來要再驗一次。
/// 開鎖不看買了沒：完整版退款之後，鎖著的紙照樣打得開（鎖住只停功能，不把人關在外面）；要「新上鎖」才需要完整版。
final class Locks: ObservableObject {
    static let shared = Locks()
    @Published private(set) var open: Set<String> = []

    func isOpen(_ id: String) -> Bool {
        open.contains(id)
    }

    /// 這支手機能不能上鎖：要有 Face ID／Touch ID 或手機密碼
    func canLock() -> Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    /// 驗一次，回傳過了沒。reason＝系統框上那句話。
    /// 手機後來把密碼整個關掉（連手機本身都沒鎖）：驗不了，直接放行——不然那張紙永遠打不開
    @MainActor
    func unlock(_ id: String, reason: String) async -> Bool {
        if open.contains(id) {
            return true
        }
        let context = LAContext()
        context.localizedCancelTitle = Words.cancel
        if context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) {
            guard (try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)) == true else {
                return false
            }
        }
        open.insert(id)
        return true
    }

    /// 離開前景：驗過的全部忘掉
    func forgetAll() {
        if !open.isEmpty {
            open = []
        }
    }
}

/// 上鎖、還沒驗過：不畫任何內容，只有鎖、一句話和「打開」（1.1 Paper locked）
struct LockedBody: View {
    let onOpen: () -> Void

    var body: some View {
        VStack(spacing: Tok.Space.md) {
            Image(systemName: "lock.fill")
                .font(Tok.Font.lockIcon)
                .foregroundColor(Tok.Col.textSecondary)
                .accessibilityHidden(true)
            Text(Words.lockedHere)
                .font(Tok.Font.callout)
                .foregroundColor(Tok.Col.textSecondary)
            Button(action: onOpen) {
                Text(Words.openLocked)
                    .font(Tok.Font.headline)
                    .foregroundColor(Tok.Col.textPrimary)
                    .frame(minWidth: Tok.Shape.hitMin * 2, minHeight: Tok.Shape.hitMin)
                    .padding(.horizontal, Tok.Space.xl)
                    .background(Capsule().fill(Tok.Col.surface))
            }
            .buttonStyle(PressDim())
            .padding(.top, Tok.Space.sm)
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Tok.Space.xxl * 2)
    }
}

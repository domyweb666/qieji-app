import SwiftUI

/// 打開時的提示（存檔讀不到、存不進去）。連續好幾次讀不到才多一個「從空的開始」，按了還要再確認一次
struct UnreadAlerts: ViewModifier {
    @ObservedObject var store: Store
    /// 真的從空的開始了：要去收件匣、iCloud 拿東西
    let onStarted: () -> Void

    func body(content: Content) -> some View {
        content
            .alert(store.notice?.title ?? "", isPresented: Binding(get: { store.notice != nil }, set: {
                if !$0 {
                    store.notice = nil
                }
            })) {
                if store.notice?.offer == true {
                    Button(Words.startOver) {
                        DispatchQueue.main.async { store.startOverAsk = true } // 等這個框收掉，下一個才跳得出來
                    }
                    Button(Words.notNowCloud, role: .cancel) { store.notice = nil }
                } else {
                    Button(Words.gotIt) { store.notice = nil }
                }
            } message: {
                Text(store.notice?.body ?? "")
            }
            .alert(Words.startOverTitle, isPresented: $store.startOverAsk) {
                Button(Words.startOverDo, role: .destructive) {
                    // 等框收掉再做：沒移成要再跳一個提示
                    DispatchQueue.main.async {
                        KeyboardWatch.dismiss() // 打到一半的字要落在現在這張
                        if store.startOver() {
                            onStarted()
                        }
                    }
                }
                Button(Words.cancel, role: .cancel) {}
            } message: {
                Text(Words.startOverBody)
            }
    }
}

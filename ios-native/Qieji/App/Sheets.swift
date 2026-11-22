import SwiftUI

/// 設定：這一版只有版本資訊。完整版、iCloud 同步、外觀、字級等功能搬過來之後再接。
struct SettingsView: View {
    let close: () -> Void

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Text(Words.version).font(Tok.Font.body)
                        Spacer()
                        Text(SettingsView.versionText).font(Tok.Font.body).foregroundColor(Tok.Col.textSecondary)
                    }
                }
            }
            .navigationTitle(Words.settings)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(Words.done, action: close) } }
        }
        .tint(Tok.Col.accent)
    }

    static var versionText: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? ""
        let build = info?["CFBundleVersion"] as? String ?? ""
        return "\(short) (\(build))"
    }
}

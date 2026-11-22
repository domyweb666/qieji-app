import SwiftUI

/// 新功能（蔬菜家族共用規格，1.1 news.ts）：每個版本最多三點。更新後第一次打開跳一次，設定頁「新功能」可以重看。
/// 小修正（例如 2.0.0 → 2.0.1）不跳：只有前兩段變了才算。新的放最前面，送審前照這一版真的有的功能改。
/// 2.0.0 的說明還沒寫（新功能說明要多米逐條確認），所以這一版更新上來不會跳卡片
enum News {
    struct Entry {
        let version: String
        let points: [String]
    }

    static let all = [
        Entry(version: "1.1.0", points: [
            "多了「設定」，在目錄最下面，可以選淺色或深色",
            "新增茄記完整版：iCloud 同步、小工具、控制中心、封面圖、上鎖、記事本、字級",
            "記一行時按 Return 是換行，按右邊的勾才記下來",
        ]),
    ]

    private static func minor(_ version: String) -> String {
        version.split(separator: ".").prefix(2).joined(separator: ".")
    }

    /// 該不該跳卡片：seen＝上次看過的版本；firstRun＝剛裝好第一次打開（剛裝的人不用知道「新」功能）
    static func toShow(seen: String?, version: String, firstRun: Bool) -> Entry? {
        if version.isEmpty || firstRun {
            return nil
        }
        if let seen, minor(seen) == minor(version) {
            return nil
        }
        return all.first { minor($0.version) == minor(version) }
    }

    /// 打開 app 時叫一次：回傳要跳的那一版，同時記下「這一版看過了」
    static func take(firstRun: Bool) -> Entry? {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
        guard !version.isEmpty else { return nil }
        let seen = Prefs.shared.string(Prefs.newsKey)
        let entry = toShow(seen: seen, version: version, firstRun: firstRun)
        if seen != version {
            Prefs.shared.set(Prefs.newsKey, version)
        }
        return entry
    }
}

/// 「新功能」頁：重看每一版的新功能，新的在上面
struct NewsPage: View {
    var body: some View {
        PageScaffold(title: Words.news) {
            ForEach(News.all, id: \.version) { entry in
                VStack(alignment: .leading, spacing: Tok.Space.sm) {
                    Text(entry.version)
                        .font(Tok.Font.footnote.weight(.semibold))
                        .foregroundColor(Tok.Col.textSecondary)
                        .padding(.leading, Tok.Space.lg)
                        .accessibilityAddTraits(.isHeader)
                    VStack(alignment: .leading, spacing: Tok.Space.sm) {
                        ForEach(entry.points, id: \.self) { point in
                            Text("・\(point)").font(Tok.Font.callout).foregroundColor(Tok.Col.textPrimary)
                        }
                    }
                    .padding(.vertical, Tok.Space.md)
                    .padding(.horizontal, Tok.Space.lg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: Tok.Shape.radiusMd).fill(Tok.Col.surface))
                }
                .padding(.top, Tok.Space.xl)
            }
        }
    }
}

/// 「蔬菜家族的其他 app」（共用規格；2026-11-15 多米照豆鍵那一頁）：一列一個 app，名字、一句話、右邊「取得」，點了開 App Store。
/// 清單內建在 app 裡、不連網路（茄記對外說「除了 iCloud 和 App Store 不連網路」）；上新 app 時在這裡加一筆
struct FamilyPage: View {
    struct App {
        let name: String
        let tagline: String
        let storeID: String
    }

    static let apps = [App(name: "豆鍵", tagline: "大字注音鍵盤", storeID: "6829152938")]

    var body: some View {
        PageScaffold(title: Words.family) {
            PageGroup {
                ForEach(Array(FamilyPage.apps.enumerated()), id: \.element.storeID) { index, app in
                    PageRow(first: index == 0, action: { open(app) }, lead: {
                        VStack(alignment: .leading, spacing: Tok.Space.xs) {
                            Text(app.name).font(Tok.Font.headline).foregroundColor(Tok.Col.textPrimary)
                            Text(app.tagline).font(Tok.Font.footnote).foregroundColor(Tok.Col.textSecondary)
                        }
                    }, trail: {
                        Text(Words.getApp).font(Tok.Font.headline).foregroundColor(Tok.Col.textPrimary)
                    })
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(app.name)，\(app.tagline)，到 App Store 取得")
                }
            }
        }
    }

    private func open(_ app: App) {
        if let url = URL(string: "https://apps.apple.com/app/id\(app.storeID)") {
            UIApplication.shared.open(url)
        }
    }
}

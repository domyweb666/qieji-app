import SwiftUI
import UIKit

/// 茄記對外的地址（1.1 links.ts）：設定頁「關於」「支援」與頁尾用
enum Links {
    static let mail = "charlie@domyweb.org"
    static let appStoreID = "6829151838"
    static let review = URL(string: "https://apps.apple.com/app/id\(appStoreID)?action=write-review")
    static let app = "https://apps.apple.com/app/id\(appStoreID)"
    static let privacy = URL(string: "https://domyweb.org/tools/qieji/privacy/")
    static let site = URL(string: "https://domyweb.org/")
    static let facebook = URL(string: "https://www.facebook.com/profile.php?id=61556891560581")
    static let instagram = URL(string: "https://www.instagram.com/domyweb_fc/")
    static let tagline = "想到就記，沒有到期日，也不會催你"
}

/// 「設定」（照 1.1 settings.tsx，蔬菜家族共用規格）：一般 → 資料 → 購買 → 支援 → 關於 → 頁尾。用不到的列不顯示。
/// › 是 app 裡的下一頁，↗ 是跳出 app。價格用 App Store 傳回來的字，不寫死。
/// 茄記的例外（多米定）：匯出／匯入不做；蔬菜家族清單內建不連網；語言、通知用不到。開源授權：2.0 沒用任何外面的套件，這頁不放
struct SettingsPage: View {
    @ObservedObject var store: Store
    @ObservedObject var shop: Purchases
    @ObservedObject var cloud: CloudLink
    @ObservedObject var look: Look
    @ObservedObject var size: TextSize
    let onFull: () -> Void
    let onPage: (Page) -> Void
    @State private var picking: Picking?
    @State private var wipeAsk = false
    @State private var wipeSure = false
    @State private var alert: Notice?
    @State private var driveOn = true

    enum Picking: Identifiable {
        case look, size
        var id: Self {
            self
        }
    }

    struct Notice: Identifiable {
        let id = UUID()
        let title: String
        let body: String
        var copyMail = false
    }

    var body: some View {
        PageScaffold(title: Words.settings) {
            general
            data
            buying
            support
            about
            footer
        }
        .onAppear {
            shop.loadPrice()
            if shop.full, cloud.syncOn {
                driveOn = cloud.driveOn()
            }
        }
        .confirmationDialog(picking == .size ? Words.textSize : Words.look, isPresented: pickingShown, titleVisibility: .visible) {
            if picking == .size {
                ForEach(TextSize.choices, id: \.scale) { choice in
                    Button(choice.scale == size.scale ? "✓ \(choice.label)" : choice.label) { size.set(choice.scale) }
                }
            } else {
                ForEach(Look.choices, id: \.key) { choice in
                    Button(choice.key == look.key ? "✓ \(choice.label)" : choice.label) { look.set(choice.key) }
                }
            }
            Button(Words.cancel, role: .cancel) {}
        }
        .alert(Words.wipeAskTitle, isPresented: $wipeAsk) {
            Button(Words.cancel, role: .cancel) {}
            Button(Words.goOn) { wipeSure = true }
        } message: {
            Text(Words.wipeAskBody(cloudPart))
        }
        .alert(Words.wipeSureTitle, isPresented: $wipeSure) {
            Button(Words.cancel, role: .cancel) {}
            Button(Words.wipeAll, role: .destructive) { wipe() }
        }
        .alert(item: $alert) { notice in
            if notice.copyMail {
                return Alert(
                    title: Text(notice.title), message: Text(notice.body),
                    primaryButton: .default(Text(Words.copyMail)) {
                        UIPasteboard.general.string = Links.mail
                        store.toast = Store.Toast(text: Words.mailCopied)
                    },
                    secondaryButton: .cancel(Text(Words.close))
                )
            }
            return Alert(title: Text(notice.title), message: Text(notice.body), dismissButton: .default(Text(Words.gotIt)))
        }
    }

    // MARK: 各組

    private var general: some View {
        PageGroup(title: Words.groupGeneral) {
            row(first: true, icon: "circle.lefthalf.filled", Words.look, state: Look.label(look.key), next: true) { picking = .look }
            if shop.full {
                // 字級（完整版）：沒買的人看不到這一列（2026-11-14 多米：沒買還列出來，看了煩）
                row(icon: "textformat.size", Words.textSize, state: TextSize.label(size.scale), next: true) { picking = .size }
            }
        }
    }

    private var data: some View {
        VStack(alignment: .leading, spacing: Tok.Space.zero) {
            PageGroup(title: Words.groupData) {
                if shop.full {
                    PageRow(first: true, action: nil, lead: {
                        icon("icloud")
                        Text(Words.cloudSync).font(Tok.Font.body).foregroundColor(Tok.Col.textPrimary)
                    }, trail: {
                        Toggle(Words.cloudSync, isOn: Binding(get: { cloud.syncOn }, set: { cloud.setSyncOn($0, full: shop.full) }))
                            .labelsHidden()
                            .tint(Tok.Col.accent)
                    })
                } else {
                    PageRow(first: true, action: onFull, lead: {
                        icon("icloud")
                        Text(Words.cloudSync).font(Tok.Font.body).foregroundColor(Tok.Col.textPrimary)
                    }, trail: {
                        Image(systemName: "lock.fill").font(Tok.Font.headline).foregroundColor(Tok.Col.textSecondary)
                    })
                    .accessibilityLabel(Words.cloudSyncLocked)
                }
            }
            Text(syncFoot)
                .font(Tok.Font.footnote)
                .foregroundColor(Tok.Col.textSecondary)
                .padding(.top, Tok.Space.sm)
                .padding(.horizontal, Tok.Space.lg)
            // 清除所有資料自己一塊、紅字，跟上面的開關隔開，免得手滑
            PageGroup {
                row(first: true, icon: "trash", Words.wipeRow, danger: true) { wipeAsk = true }
            }
        }
    }

    private var buying: some View {
        PageGroup(title: Words.groupBuy) {
            PageRow(first: true, action: shop.full ? nil : onFull, lead: {
                icon("sparkles")
                VStack(alignment: .leading, spacing: Tok.Space.xs) {
                    Text(Words.fullName).font(Tok.Font.body).foregroundColor(Tok.Col.textPrimary)
                    if noPrice {
                        Text(Words.noPrice).font(Tok.Font.footnote).foregroundColor(Tok.Col.textSecondary)
                    }
                }
            }, trail: {
                if shop.busy {
                    ProgressView()
                } else if shop.full {
                    stateText(Words.unlocked)
                } else {
                    HStack(spacing: Tok.Space.sm) {
                        if let price = shop.price {
                            stateText(price)
                        }
                        chevron
                    }
                }
            })
            .disabled(shop.busy)
            row(icon: "arrow.clockwise", Words.restorePurchase) { Task { await restore() } }
                .disabled(shop.busy)
        }
    }

    private var support: some View {
        PageGroup(title: Words.groupSupport) {
            row(first: true, icon: "envelope", Words.feedback, next: true) { feedback() }
            row(icon: "star", Words.rateUs, out: true) { open(Links.review) }
            PageRow(action: nil, lead: {
                ShareLink(item: "我在用\(Words.appName)：\(Links.tagline) \(Links.app)") {
                    HStack(spacing: Tok.Space.md) {
                        icon("square.and.arrow.up")
                        Text(Words.shareApp).font(Tok.Font.body).foregroundColor(Tok.Col.textPrimary)
                    }
                }
            }, trail: { outArrow })
            row(icon: "gift", Words.news, next: true) { onPage(.news) }
        }
    }

    private var about: some View {
        PageGroup(title: Words.groupAbout) {
            row(first: true, icon: "leaf", Words.family, next: true) { onPage(.family) }
            row(icon: "hand.raised", Words.privacy, out: true) { open(Links.privacy) }
        }
    }

    /// 頁尾（2026-11-15 多米照 minical 的設定頁）：茄記圖示、版本、Made by DOMYWEB，下面一排網站／Facebook／Instagram。長按上面那一塊複製版本資訊
    private var footer: some View {
        VStack(spacing: Tok.Space.xs) {
            Image("AboutLogo")
                .resizable()
                .frame(width: Tok.Shape.aboutLogo, height: Tok.Shape.aboutLogo)
                .clipShape(RoundedRectangle(cornerRadius: Tok.Shape.aboutLogo * Tok.Shape.tileRadiusRatio))
                .padding(.bottom, Tok.Space.sm)
                .accessibilityHidden(true)
            Text(Diag.versionLine).font(Tok.Font.footnote).foregroundColor(Tok.Col.textSecondary)
            Text(Words.madeBy).font(Tok.Font.footnote).foregroundColor(Tok.Col.textSecondary)
            HStack(spacing: Tok.Space.sm) {
                social(Image(systemName: "globe"), label: Words.site) { open(Links.site) }
                social(Image("SocialFB").resizable(), label: "Facebook") { open(Links.facebook) }
                social(Image("SocialIG").resizable(), label: "Instagram") { open(Links.instagram) }
            }
            .padding(.top, Tok.Space.md)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Tok.Space.xxl)
        .contentShape(Rectangle())
        .onLongPressGesture {
            UIPasteboard.general.string = Diag.text
            store.toast = Store.Toast(text: Words.diagCopied)
        }
        .accessibilityElement(children: .contain)
        .accessibilityHint(Words.diagHint)
    }

    // MARK: 小零件

    private func row(
        first: Bool = false, icon name: String, _ label: String, state: String? = nil, next: Bool = false, out: Bool = false,
        danger: Bool = false, action: @escaping () -> Void
    ) -> some View {
        PageRow(first: first, action: action, lead: {
            Image(systemName: name)
                .font(Tok.Font.barIcon)
                .foregroundColor(danger ? Tok.Col.danger : Tok.Col.textSecondary)
                .frame(width: Tok.Space.xl)
            Text(label).font(Tok.Font.body).foregroundColor(danger ? Tok.Col.danger : Tok.Col.textPrimary)
        }, trail: {
            HStack(spacing: Tok.Space.sm) {
                if let state {
                    stateText(state)
                }
                if next {
                    chevron
                }
                if out {
                    outArrow
                }
            }
        })
        .accessibilityLabel(state.map { "\(label)，\($0)" } ?? label)
    }

    private func icon(_ name: String) -> some View {
        Image(systemName: name)
            .font(Tok.Font.barIcon)
            .foregroundColor(Tok.Col.textSecondary)
            .frame(width: Tok.Space.xl)
    }

    private func stateText(_ text: String) -> some View {
        Text(text).font(Tok.Font.body).foregroundColor(Tok.Col.textSecondary)
    }

    private var chevron: some View {
        Image(systemName: "chevron.right").font(Tok.Font.chevron).foregroundColor(Tok.Col.textSecondary)
    }

    private var outArrow: some View {
        Image(systemName: "arrow.up.right").font(Tok.Font.chevron).foregroundColor(Tok.Col.textSecondary)
    }

    private func social(_ image: Image, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            image
                .scaledToFit()
                .font(Tok.Font.featIcon)
                .frame(width: Tok.Shape.socialIcon, height: Tok.Shape.socialIcon)
                .foregroundColor(Tok.Col.textSecondary)
                .frame(width: Tok.Shape.hitMin, height: Tok.Shape.hitMin)
        }
        .buttonStyle(PressDim())
        .accessibilityLabel(label)
        .accessibilityAddTraits(.isLink)
    }

    private var pickingShown: Binding<Bool> {
        Binding(get: { picking != nil }, set: {
            if !$0 {
                picking = nil
            }
        })
    }

    private var noPrice: Bool {
        !shop.full && shop.price == nil && shop.priceFailed
    }

    /// iCloud 同步那行下面的說明
    private var syncFoot: String {
        if !shop.full {
            return Words.syncFootLocked
        }
        if !cloud.syncOn {
            return Words.syncFootOff
        }
        if !driveOn {
            return Words.syncFootNoDrive
        }
        if let last = cloud.lastSync {
            return "已同步・\(Dates.ago(last.timeIntervalSince1970 * 1000))"
        }
        return Words.syncFootOn
    }

    private var cloudPart: String {
        if shop.full, cloud.syncOn {
            return Words.wipeCloudOn
        }
        return shop.full ? Words.wipeCloudOff : Words.wipeNoCloud
    }

    // MARK: 動作

    private func open(_ url: URL?) {
        guard let url else { return }
        UIApplication.shared.open(url) { ok in
            if !ok {
                alert = Notice(title: Words.cantOpen, body: Words.tryLater)
            }
        }
    }

    /// 意見回饋：開郵件 app，主旨一眼看得出是哪個 app，版本資訊放最下面（使用者看得到、可以刪）。開不了就給信箱和「複製」
    private func feedback() {
        var parts = URLComponents()
        parts.scheme = "mailto"
        parts.path = Links.mail
        parts.queryItems = [
            URLQueryItem(name: "subject", value: "[\(Words.appName)] 意見回饋"),
            URLQueryItem(name: "body", value: "（請在這裡寫下你的想法）\n\n\n\n——\n\(Diag.text)"),
        ]
        guard let url = parts.url else { return }
        UIApplication.shared.open(url) { ok in
            if !ok {
                alert = Notice(title: Words.cantMail, body: Words.mailTo(Links.mail), copyMail: true)
            }
        }
    }

    private func restore() async {
        switch await shop.restore() {
        case .ok: store.toast = Store.Toast(text: Words.restoredPurchase)
        case .cancel, .busy: break
        case .none: alert = Notice(title: Words.noPurchaseTitle, body: Words.noPurchaseBody)
        case .unverified: alert = Notice(title: Words.unverifiedTitle, body: Words.unverifiedBody)
        case .offline: alert = Notice(title: Words.offlineTitle, body: Words.tryLater)
        }
    }

    /// 清除所有資料（1.1 片 F2，只清這支手機）：先關同步（不然下一次拉取又全部回來），清完回到剛裝好的樣子
    private func wipe() {
        if shop.full, cloud.syncOn {
            cloud.setSyncOn(false, full: shop.full)
        }
        if store.wipe() {
            store.toast = Store.Toast(text: Words.wiped)
        } else {
            alert = Notice(title: Words.wipeFailTitle, body: Words.wipeFailBody)
        }
    }
}

/// 回報問題用的版本資訊：意見回饋信最下面帶著、長按頁尾可以複製
enum Diag {
    static var versionLine: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? ""
        let build = info?["CFBundleVersion"] as? String ?? ""
        return "\(Words.appName) \(short)\(build.isEmpty ? "" : " (\(build))")"
    }

    static var model: String {
        var system = utsname()
        uname(&system)
        return withUnsafeBytes(of: &system.machine) { raw in
            String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
        }
    }

    static var text: String {
        "App：\(versionLine)\niOS：\(UIDevice.current.systemVersion)\n機型：\(model)\n語言：\(Locale.current.identifier)"
    }
}

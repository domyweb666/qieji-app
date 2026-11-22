import SwiftUI

/// 「茄記完整版」付費頁（照 1.1 full.tsx）：從下面升起、一次展開到全高、往下拉可以關。
/// 從哪裡來：設定那列、沒買時的 iCloud 開關、鎖住的小工具與控制中心「記一行」（qieji://full）。付完或關掉都回原本的地方。
/// 七種狀態：平常／讀不到價格／購買中／買好了／付款失敗／使用者取消（安靜）／恢復找不到。訊息寫在按鈕上面那一行，不另外跳框。
/// 不做：倒數、限時、晚出現的關閉鍵、預先選好、羞辱式拒絕。價格用 App Store 傳回來的字，不寫死。
struct FullView: View {
    @ObservedObject var shop: Purchases
    @ObservedObject var store: Store
    let close: () -> Void
    @State private var message = ""

    private static let feats: [(icon: String, name: String, sub: String)] = [
        ("icloud", "iCloud 同步", "換手機、刪掉重裝，紙都會回來"),
        ("square.grid.2x2", "主畫面和鎖定畫面小工具", "不用打開 app，也看得到上次那張紙"),
        ("square.and.pencil", "控制中心「記一行」", "在任何畫面按一下，就能開始記"),
        ("photo", "封面圖", "紙的頂部放一張圖，目錄的磚也換成它"),
        ("lock", "個別上鎖", "挑幾張鎖起來，打開要 Face ID"),
        ("doc.text", "記事本", "不分行，一整頁照你的意思寫"),
        ("textformat.size", "紙上的字級", "小、標準、大、特大"),
        ("plus.circle", "之後新增的完整版功能", "也都包含，不用再付"),
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: Tok.Space.zero) {
                HStack {
                    Button(action: close) {
                        Image(systemName: "xmark")
                            .font(Tok.Font.barIcon)
                            .foregroundColor(Tok.Col.textPrimary)
                            .frame(width: Tok.Shape.hitMin, height: Tok.Shape.hitMin)
                            .frost(Circle(), interactive: true)
                    }
                    .buttonStyle(PressDim())
                    .accessibilityLabel(Words.close)
                    Spacer()
                    Text(Words.fullName)
                        .font(Tok.Font.headline)
                        .foregroundColor(Tok.Col.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    Color.clear.frame(width: Tok.Shape.hitMin, height: Tok.Shape.hitMin)
                }
                Text(priceLine)
                    .font(Tok.Font.callout)
                    .foregroundColor(Tok.Col.textSecondary)
                    .padding(.top, Tok.Space.xs)
                VStack(alignment: .leading, spacing: Tok.Space.md) {
                    ForEach(FullView.feats, id: \.name) { feat in
                        HStack(spacing: Tok.Space.md) {
                            Image(systemName: feat.icon)
                                .font(Tok.Font.featIcon)
                                .foregroundColor(Tok.Col.textSecondary)
                                .frame(width: Tok.Shape.hitMin)
                            VStack(alignment: .leading, spacing: Tok.Space.xxs) {
                                Text(feat.name).font(Tok.Font.headline).foregroundColor(Tok.Col.textPrimary)
                                Text(feat.sub).font(Tok.Font.callout).foregroundColor(Tok.Col.textSecondary)
                            }
                        }
                        .frame(minHeight: Tok.Shape.hitMin)
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(.top, Tok.Space.lg)
                Text(Words.familyShare)
                    .font(Tok.Font.footnote)
                    .foregroundColor(Tok.Col.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.top, Tok.Space.lg)
                if !message.isEmpty {
                    Text(message)
                        .font(Tok.Font.callout)
                        .foregroundColor(Tok.Col.textPrimary)
                        .multilineTextAlignment(.center)
                        .padding(.top, Tok.Space.lg)
                        .accessibilityAddTraits(.updatesFrequently)
                }
                actions
            }
            .padding(.horizontal, Tok.Space.gutter)
            .padding(.top, Tok.Space.lg)
            .padding(.bottom, Tok.Space.lg)
        }
        .background(Tok.Col.surface.ignoresSafeArea())
        .onAppear { shop.loadPrice() }
    }

    @ViewBuilder private var actions: some View {
        if shop.full {
            bigButton(Words.done, action: close)
        } else {
            bigButton(buyLabel) { Task { await buy() } }
                .disabled(shop.busy)
                .opacity(shop.busy ? Tok.Motion.pressDim : 1)
            HStack(spacing: Tok.Space.zero) {
                plainButton(Words.restorePurchase) { Task { await restore() } }
                    .disabled(shop.busy)
                plainButton(Words.notNow, action: close)
            }
            .padding(.top, Tok.Space.sm)
        }
    }

    private func bigButton(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(Tok.Font.headline)
                .foregroundColor(Tok.Col.fabIcon)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: Tok.Shape.hitMin + Tok.Space.md)
                .padding(.horizontal, Tok.Space.lg)
                .background(RoundedRectangle(cornerRadius: Tok.Shape.radiusMd).fill(Tok.Col.accent))
        }
        .buttonStyle(PressDim())
        .padding(.top, Tok.Space.lg)
    }

    private func plainButton(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(Tok.Font.body)
                .foregroundColor(Tok.Col.textPrimary)
                .frame(maxWidth: .infinity, minHeight: Tok.Shape.hitMin)
        }
        .buttonStyle(PressDim())
    }

    private var priceLine: String {
        if shop.full {
            return Words.unlocked
        }
        if let price = shop.price {
            return Words.priceOnce(price)
        }
        return shop.priceFailed ? Words.noPrice : " "
    }

    private var buyLabel: String {
        if shop.busy {
            return Words.connecting
        }
        if let price = shop.price {
            return Words.unlockWith(price)
        }
        return shop.priceFailed ? Words.tryAgain : Words.readingPrice
    }

    private func buy() async {
        message = ""
        // 沒看到價格不准付錢：點了是再讀一次
        guard shop.price != nil else {
            shop.loadPrice()
            return
        }
        switch await shop.buy() {
        case .ok:
            close()
            store.toast = Store.Toast(text: Words.unlockedToast)
        case .cancel, .busy:
            break // 取消不是錯誤
        case .pending:
            message = "這筆購買在等核准。核准之後，茄記會自己解鎖"
        case .unconfirmed:
            message = "付款完成了，但還沒收到 Apple 的確認。等一下按「恢復購買」"
        case .unverified:
            message = "Apple 傳回的購買記錄驗不過，先當作沒買。有被扣款的話，等一下按「恢復購買」"
        case .offline:
            message = "沒有扣款。連不上 App Store，等一下再試一次"
        case .blocked:
            message = "沒有扣款。這台手機的「螢幕使用時間」關掉了 App 內購買"
        case .fail:
            message = "沒有扣款。等一下再試一次"
        }
    }

    private func restore() async {
        message = ""
        switch await shop.restore() {
        case .ok:
            close()
            store.toast = Store.Toast(text: Words.unlockedToast)
        case .cancel, .busy:
            break
        case .none:
            message = "這個 Apple 帳號沒有買過\(Words.fullName)"
        case .unverified:
            message = "Apple 傳回的購買記錄驗不過，先當作沒買"
        case .offline:
            message = "連不上 App Store，等一下再試一次"
        }
    }
}

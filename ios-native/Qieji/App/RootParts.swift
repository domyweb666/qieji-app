import SwiftUI

// 根畫面的小零件：讓根畫面不必看著同步、價格、外觀這些物件，它們一變紙也不跟著重算（效能審查第 2 條）

/// 只看一個物件的一個值，變了叫 action（根畫面不必整個看著那個物件）
struct Watch<Object: ObservableObject, Value: Equatable>: ViewModifier {
    @ObservedObject var object: Object
    let value: (Object) -> Value
    let action: (Value) -> Void

    func body(content: Content) -> some View {
        content.onChange(of: value(object)) { action($0) }
    }
}

/// 外觀（跟隨系統／淺色／深色）：整個 app 連系統提示框、選單一起換
struct LookScheme: ViewModifier {
    @ObservedObject var look: Look

    func body(content: Content) -> some View {
        content.preferredColorScheme(look.scheme)
    }
}

/// iCloud S5：這個 iCloud 裡一張這台同步過的紙都沒有（換了 Apple ID、資料夾被刪）：先停下來問。第一句先答「有沒有損失」
struct CloudAsk: ViewModifier {
    @ObservedObject var cloud: CloudLink

    func body(content: Content) -> some View {
        content.alert(Words.newCloudTitle, isPresented: Binding(get: { cloud.asking }, set: { _ in })) {
            Button(Words.notNowCloud, role: .cancel) { cloud.decline() }
            Button(Words.adoptCloud) { cloud.adopt() }
        } message: {
            Text(Words.newCloudBody)
        }
    }
}

/// 紙包一層（同目錄的 DirHost）：根畫面為了同步時間、價格、外觀、推頁重畫時，紙不跟著重算。
/// 紙自己看著 store、字級、封面、上鎖，資料一變照樣重畫；換了一張才從這裡換。
/// 交下來的 closure 都是轉給根畫面的 @State（推頁、表單、目錄），舊的那份照樣叫得到現在的
struct PaperHost: View, Equatable {
    let store: Store
    let given: Note
    let onTitle: () -> Void
    let onRoute: (Route) -> Void
    let onMoveLine: (String) -> Void
    let onTrash: (String) -> Void

    static func == (lhs: PaperHost, rhs: PaperHost) -> Bool {
        lhs.store === rhs.store && lhs.given.id == rhs.given.id
    }

    var body: some View {
        PaperView(store: store, given: given, onTitle: onTitle, onRoute: onRoute, onMoveLine: onMoveLine, onTrash: onTrash)
    }
}

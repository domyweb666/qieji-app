import SwiftUI
import UIKit

/// 面板滑到哪。拉把手時每一格都改：自己一份，只有面板的位置、後面的霧跟著動，裡面的磚和整個目錄不重算（2026-11-26 效能審查第 3 條）
final class DirSlide: ObservableObject {
    @Published var progress: CGFloat = 0 // 0＝收起、1＝全開
    @Published var fading = false // 這次用淡的不用滑的
    @Published var pulled: CGFloat = 0 // 用淡的那次，把手把面板往下拉了多少（收起時留在那裡淡掉）
}

/// 面板滑到哪：放在 slide（拉把手每一格只重畫面板的位置）
extension DirModel {
    var progress: CGFloat {
        get { slide.progress }
        set { slide.progress = newValue }
    }

    var fading: Bool {
        get { slide.fading }
        set { slide.fading = newValue }
    }

    var pulled: CGFloat {
        get { slide.pulled }
        set { slide.pulled = newValue }
    }
}

/// 面板跟著 DirSlide 移、淡（只有這層看著它）
struct DirSlideMove: ViewModifier {
    @ObservedObject var slide: DirSlide
    let travel: CGFloat

    func body(content: Content) -> some View {
        content
            .offset(y: slide.fading ? slide.pulled : travel * (1 - slide.progress))
            // 整塊當成一張淡出：不這樣的話裡面每一層各自變透明，點磚打開時底下那一面磚會透出來閃一下
            .compositingGroup()
            .opacity(slide.fading ? Double(slide.progress) : 1)
    }
}

/// 下一格畫面才做：這一刻改的東西先畫出去，再開始動畫。
/// 主佇列（DispatchQueue.main.async）不行：從觸控、提示框按鈕叫的話，主佇列在同一輪就跑，比畫面還早。
/// 刪除這張回目錄時就是這樣：升起那一下逼 SwiftUI 當場先畫，面板那層讀到還沒改的位置、之後不再更新，
/// 面板卡在螢幕外、只剩霧升起來（2026-11-26 整晚第 9 項量到）
final class NextFrame: NSObject {
    private let work: () -> Void

    private init(_ work: @escaping () -> Void) {
        self.work = work
    }

    static func run(_ work: @escaping () -> Void) {
        // 畫面計時器抓著自己，跑完放掉
        let link = CADisplayLink(target: NextFrame(work), selector: #selector(tick(_:)))
        link.add(to: .main, forMode: .common)
    }

    @objc private func tick(_ link: CADisplayLink) {
        link.invalidate()
        work()
    }
}

/// 後面的霧跟著面板開多少
struct DirSlideFade: ViewModifier {
    @ObservedObject var slide: DirSlide

    func body(content: Content) -> some View {
        content.opacity(Double(slide.progress))
    }
}

import SwiftUI

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

/// 後面的霧跟著面板開多少
struct DirSlideFade: ViewModifier {
    @ObservedObject var slide: DirSlide

    func body(content: Content) -> some View {
        content.opacity(Double(slide.progress))
    }
}

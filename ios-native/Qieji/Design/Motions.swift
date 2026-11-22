import SwiftUI

enum Motions {
    /// 帶速度的彈簧要的速度：手指每秒幾點 ÷ 還要走幾點（每秒走幾個「全程」），夾在不會衝過頭的範圍裡
    static func speed(_ points: CGFloat, over distance: CGFloat) -> CGFloat {
        guard distance > 1 else { return 0 }
        return min(Tok.Motion.springSpeedMax, max(-Tok.Motion.springSpeedMax, points / distance))
    }

    /// 跑一段動畫，跑完叫 done。iOS 17 起用系統的「動畫做完了」；更舊的照 fallback 秒數計時
    static func run(_ animation: Animation, fallback: Double, _ body: () -> Void, done: @escaping () -> Void) {
        if #available(iOS 17.0, *) {
            withAnimation(animation, completionCriteria: .logicallyComplete, body, completion: done)
        } else {
            withAnimation(animation, body)
            DispatchQueue.main.asyncAfter(deadline: .now() + fallback, execute: done)
        }
    }
}

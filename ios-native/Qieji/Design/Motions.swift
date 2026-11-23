import SwiftUI
import UIKit

enum Motions {
    /// 帶速度的彈簧要的速度：手指每秒幾點 ÷ 還要走幾點（每秒走幾個「全程」），夾在不會衝過頭的範圍裡
    static func speed(_ points: CGFloat, over distance: CGFloat) -> CGFloat {
        guard distance > 1 else { return 0 }
        return min(Tok.Motion.springSpeedMax, max(-Tok.Motion.springSpeedMax, points / distance))
    }

    /// 彈簧（Tok.Motion.spring 那種，不過頭）多久之後只剩看不見的尾巴：距離剩 near 點以內就算到了。
    /// 動畫自己停下來要再多等 0.3 秒，那段什麼都沒在動，不拿它當「做完了」
    static func arrival(
        _ response: Double, velocity: CGFloat, over distance: CGFloat, near points: CGFloat = Tok.Motion.springNear
    ) -> Double {
        let pace = 2 * Double.pi / response, near = Double(points / max(1, abs(distance)))
        let last = response + Tok.Motion.springTail
        var time: Double = 0
        while time < last {
            if (1 + (pace - Double(velocity)) * time) * exp(-pace * time) <= near {
                return time
            }
            time += Tok.Motion.springStep
        }
        return last
    }

    /// 放手時手指往下每秒幾點；iOS 16 量不到，拿「放手後還會走多遠」估
    static func downSpeed(_ value: DragGesture.Value) -> CGFloat {
        if #available(iOS 17.0, *) {
            return value.velocity.height
        }
        return (value.predictedEndTranslation.height - value.translation.height) * Tok.Gesture.flickPredict
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

extension UIView {
    /// 在裡面開的動畫一定會跑。SwiftUI 更新原生畫面的那一刻會把動畫關掉：那時候叫的動畫直接跳到結尾
    /// （輸入框按 ✓ 整個不見、霧面變十成，2026-11-23 抓到）
    static func lively(_ body: () -> Void) {
        let allowed = areAnimationsEnabled
        setAnimationsEnabled(true)
        body()
        setAnimationsEnabled(allowed)
    }
}

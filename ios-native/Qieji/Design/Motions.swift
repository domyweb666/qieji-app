import SwiftUI

enum Motions {
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

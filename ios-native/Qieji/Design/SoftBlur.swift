import SwiftUI
import UIKit

/// 輕輕霧掉：系統的霧面只用幾成（1.1 expo-blur 的 intensity）。SwiftUI 內建的材質最淡也是整片蓋住，看不出後面是哪張紙
struct SoftBlur: UIViewRepresentable {
    /// 0 到 1：霧幾成
    let amount: CGFloat

    func makeUIView(context _: Context) -> SoftBlurView {
        SoftBlurView(amount: amount)
    }

    func updateUIView(_ view: SoftBlurView, context _: Context) {
        view.amount = amount
    }

    static func dismantleUIView(_ view: SoftBlurView, coordinator _: ()) {
        view.stop()
    }
}

/// 做法跟 expo-blur 一樣：一段「沒有霧→有霧」的動畫，停在中間
final class SoftBlurView: UIVisualEffectView {
    var amount: CGFloat {
        didSet {
            runner?.fractionComplete = amount
        }
    }

    private var runner: UIViewPropertyAnimator?
    private var token: NSObjectProtocol?

    init(amount: CGFloat) {
        self.amount = amount
        super.init(effect: nil)
        isUserInteractionEnabled = false
        // 切到背景再回來，系統會把停在中間的動畫收掉：重新停一次
        token = NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.start() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        nil
    }

    deinit {
        runner?.stopAnimation(true)
        if let token {
            NotificationCenter.default.removeObserver(token)
        }
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            start()
        }
    }

    private func start() {
        runner?.stopAnimation(true)
        effect = nil
        UIView.lively {
            let next = UIViewPropertyAnimator(duration: Tok.Motion.blurSpan, curve: .linear) { [weak self] in
                self?.effect = UIBlurEffect(style: .regular)
            }
            next.pausesOnCompletion = true
            next.fractionComplete = amount
            runner = next
        }
    }

    func stop() {
        runner?.stopAnimation(true)
        runner = nil
    }
}

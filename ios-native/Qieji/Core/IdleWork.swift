import UIKit.UIGestureRecognizerSubclass

/// 打開 app 之後趁閒著一步一步做的事（先把目錄、切換清單做好）。手指正碰著螢幕、剛放開、正在捲、鍵盤開著的時候都不做：
/// 每一步最多卡主執行緒幾十毫秒，畫面沒在動的時候看不出來
final class IdleWork {
    static let shared = IdleWork()
    private var steps: [() -> Void] = []
    private let watch = TouchWatch(target: nil, action: nil)
    private var running = false
    private var typing = false
    private var tokens: [NSObjectProtocol] = []

    func add(_ step: @escaping () -> Void) {
        steps.append(step)
    }

    func start() {
        guard !running else { return }
        running = true
        let center = NotificationCenter.default
        for (name, up) in [(UIResponder.keyboardWillShowNotification, true), (UIResponder.keyboardDidHideNotification, false)] {
            tokens.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in self?.typing = up })
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Timing.warmWait) { [self] in
            watch.cancelsTouchesInView = false
            watch.delaysTouchesEnded = false
            UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first?.addGestureRecognizer(watch)
            next()
        }
    }

    private func next() {
        guard !steps.isEmpty else {
            watch.view?.removeGestureRecognizer(watch)
            tokens.forEach(NotificationCenter.default.removeObserver)
            tokens = []
            running = false
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + Tok.Timing.warmStep) { [self] in
            // 正在捲的時候主執行緒在另一種模式，這一步會等捲完才輪到
            RunLoop.main.perform(inModes: [.default]) { [self] in
                if watch.quiet, !typing {
                    steps.removeFirst()()
                }
                next()
            }
        }
    }
}

/// 只看手指有沒有碰著，自己從來不成立、也不擋別人
private final class TouchWatch: UIGestureRecognizer {
    private var last: TimeInterval = 0
    private var down = 0

    var quiet: Bool {
        down <= 0 && ProcessInfo.processInfo.systemUptime - last > Tok.Timing.warmQuiet
    }

    override func touchesBegan(_ touches: Set<UITouch>, with _: UIEvent) {
        down += touches.count
        last = ProcessInfo.processInfo.systemUptime
    }

    override func touchesEnded(_ touches: Set<UITouch>, with _: UIEvent) {
        lift(touches.count)
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with _: UIEvent) {
        lift(touches.count)
    }

    private func lift(_ count: Int) {
        down -= count
        last = ProcessInfo.processInfo.systemUptime
        if down <= 0 {
            down = 0
            state = .failed
        }
    }

    /// 別的手勢成立了也照樣看到手指離開為止
    override func canBePrevented(by _: UIGestureRecognizer) -> Bool {
        false
    }

    override func canPrevent(_: UIGestureRecognizer) -> Bool {
        false
    }

    override func reset() {
        super.reset()
        down = 0
    }
}

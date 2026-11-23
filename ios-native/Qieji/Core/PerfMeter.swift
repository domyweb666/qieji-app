import os
import QuartzCore
import UIKit

/// 流暢度量測：只有帶環境變數 QIEJI_PERF=1 才開（模擬器、開發用；上架版使用者開不了）。
/// 每 2 秒印一次：掉了幾格、最長一格隔多久、主執行緒一口氣忙超過 16 毫秒幾次與最長多久；每一次卡住另外印一行。
final class PerfMeter: NSObject {
    static let on = ProcessInfo.processInfo.environment["QIEJI_PERF"] == "1"
    static let shared = PerfMeter()
    private static let log = Logger(subsystem: "org.domyweb.qieji", category: "perf")
    private static let stallMs = ProcessInfo.processInfo.environment["QIEJI_PERF_MS"].flatMap(Double.init) ?? 16
    private static let partMs: Double = 0.5
    private static let reportSeconds: Double = 2
    private static let thousand: Double = 1000

    private var link: CADisplayLink?
    private var lastFrame: CFTimeInterval = 0
    private var woke: CFTimeInterval = 0
    private var since: CFTimeInterval = 0
    private var dropped = 0, stalls = 0
    private var worstGap: Double = 0, worstStall: Double = 0
    private var parts: [String] = [] // 這一輪主迴圈裡花得多的幾段

    func start() {
        guard PerfMeter.on, link == nil else { return }
        let link = CADisplayLink(target: self, selector: #selector(tick(_:)))
        link.add(to: .main, forMode: .common)
        self.link = link
        since = CACurrentMediaTime()
        let wake = CFRunLoopObserverCreateWithHandler(nil, CFRunLoopActivity.afterWaiting.rawValue, true, CFIndex.min) { [weak self] _, _ in
            self?.woke = CACurrentMediaTime()
            self?.parts = []
        }
        let sleep = CFRunLoopObserverCreateWithHandler(nil, CFRunLoopActivity.beforeWaiting.rawValue, true, CFIndex.max) { [weak self] _, _ in
            self?.fellAsleep()
        }
        CFRunLoopAddObserver(CFRunLoopGetMain(), wake, .commonModes)
        CFRunLoopAddObserver(CFRunLoopGetMain(), sleep, .commonModes)
    }

    /// 量一段花多久（沒開量測時直接做，不多花什麼）
    static func time<T>(_ name: String, _ body: () -> T) -> T {
        guard on, Thread.isMainThread else { return body() }
        let start = CACurrentMediaTime()
        let out = body()
        let spent = (CACurrentMediaTime() - start) * thousand
        if spent >= partMs {
            shared.parts.append("\(name)=\(String(format: "%.1f", spent))")
        }
        return out
    }

    static func note(_ words: String) {
        if on {
            log.notice("\(words, privacy: .public)")
        }
    }

    private func fellAsleep() {
        guard woke > 0 else { return }
        let busy = (CACurrentMediaTime() - woke) * PerfMeter.thousand
        woke = 0
        guard busy > PerfMeter.stallMs else { return }
        stalls += 1
        worstStall = max(worstStall, busy)
        let detail = parts.joined(separator: " ")
        PerfMeter.log.notice("stall \(busy, format: .fixed(precision: 1), privacy: .public)ms \(detail, privacy: .public)")
    }

    @objc private func tick(_ link: CADisplayLink) {
        let now = link.timestamp
        if lastFrame > 0 {
            let gap = now - lastFrame
            let missed = Int((gap / max(link.duration, .ulpOfOne)).rounded()) - 1
            if missed > 0 {
                dropped += missed
                worstGap = max(worstGap, gap * PerfMeter.thousand)
            }
        }
        lastFrame = now
        let wall = CACurrentMediaTime()
        guard wall - since >= PerfMeter.reportSeconds else { return }
        if dropped > 0 || stalls > 0 {
            PerfMeter.log.notice("""
            2s dropped=\(self.dropped, privacy: .public) gap=\(self.worstGap, format: .fixed(precision: 0), privacy: .public)ms \
            stalls=\(self.stalls, privacy: .public) worst=\(self.worstStall, format: .fixed(precision: 1), privacy: .public)ms
            """)
        }
        since = wall
        dropped = 0
        stalls = 0
        worstGap = 0
        worstStall = 0
    }
}

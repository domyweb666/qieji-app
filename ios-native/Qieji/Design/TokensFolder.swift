import QuartzCore
import SwiftUI

// 資料夾從磚放大（2026-11-25 多米選定「A 從磚放大」）：數值照 .uiux/03-線框/2.0-按住一行與資料夾比較.html 的 draw(p, 'A')。
// Tokens.swift 快滿 500 行，這一組放這裡。

extension Tok.Motion {
    /// 框的放大、縮回：跟 dirPanel 同一個彈簧（感知 0.34 秒、不過頭）
    static let folderResponse = dirPanelSeconds
    /// 框裡的名字、上面的大標題：進度走到這裡才開始出現；磚的樣子也在這之前淡完
    static let folderLate: CGFloat = 0.35
    /// 進度剩這麼一點就算到了（框離那塊磚不到 1 個像素）
    static let folderNear: CGFloat = 0.001
    static let folderCalm: CGFloat = 20 // 這時每秒也只剩這麼多倍的「一點」
    /// 算好的進度多細（一秒幾格）、最長走多久
    static let folderStep: Double = 1 / 120
    static let folderMost: Double = 0.8
    /// 120Hz 的手機照 120 跑
    static let folderRate = CAFrameRateRange(minimum: 80, maximum: 120, preferred: 120)
    /// 改用淡的時候（減少動態、那塊磚不在畫面上）
    static let folderFadeSeconds: Double = 0.18
    /// 那塊磚的名字：打開時淡掉、收完淡回來
    static let folderNameSeconds: Double = 0.12
}

extension Tok.Shape {
    /// 打開的資料夾上面的名字：輸入框的字上下各多這麼多（跟原本的位置一樣）
    static let folderNamePad: CGFloat = 1
}

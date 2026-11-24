import SwiftUI

// 按住一行（2026-11-25 多米選定「浮起、慢慢變暗」）：數值照 .uiux/03-線框/2.0-按住一行與資料夾比較.html。
// Tokens.swift 快滿 500 行，這一組放這裡。

extension Tok.Motion {
    /// 按住變暗：第 0.2 秒開始，到選單跳出來（longPress）剛好走完；放手、捲動、滑、手指移走就退掉
    static let rowPressWait: Double = 0.2
    static let rowPressInSeconds: Double = Tok.Gesture.longPress - rowPressWait
    static let rowPressOutSeconds: Double = 0.12
    static let rowLiftScale: CGFloat = 1.02
    /// 選單收起（＝menuPopOut 的秒數，原生畫的那一份用）
    static let menuOutSeconds: Double = 0.12
    /// 收起的動畫都走完了才把整層拿掉（這時已經碰不到它）
    static let menuGoneSeconds: Double = 0.2
    /// 收起時那一行的位置差在這以內就縮回那裡，更遠直接淡掉
    static let rowHomeMax: CGFloat = 52
}

extension Tok.Shape {
    /// 浮起的那一行左右各縮這麼多
    static let rowLiftInset: CGFloat = 8
}

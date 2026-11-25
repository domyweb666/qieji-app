import UIKit

// 分享進來的面板（2026-11-25 多米選 3D＋5B）：數值照 .uiux/2.1-比較頁-分享面板3D.html。
// Tokens.swift 快滿 500 行，這一組放這裡。

extension Tok.Shape {
    static let shareTop: CGFloat = 44 // 字離面板頂端多遠
    static let shareTile: CGFloat = 26 // 「放進 X」前面的小方磚
    static let shareNameLines = 2 // 字級放到最大那幾級時，「放進 X」最多佔幾行
}

extension Tok.Motion {
    static let shareOutSeconds: Double = 0.12 // 收起前整頁淡成系統的底色
}

extension Tok.Timing {
    static let shareReadWait: Double = 0.3 // 過這麼久還沒讀到字，才寫「讀取中」
    static let shareReadLimit: Double = 5 // 附件總共最多讀這麼久，到了就用已經讀到的
}

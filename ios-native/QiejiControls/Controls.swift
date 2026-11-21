import SwiftUI
import WidgetKit

/// 控制中心擴充的入口。按鈕與動作寫在 Shared/NewLine.swift（要同時編進 app，原因在那個檔）。
/// 控制項目是 iOS 18 才有的，整個擴充設 18.0：更舊的 iOS 不載這個擴充，app 本身照常。
@main
struct QiejiControls: WidgetBundle {
    var body: some Widget {
        NewLineControl()
    }
}

// 控制中心「記一行」按鈕的擴充入口（2026-11-01）。按鈕與動作寫在 _shared/NewLine.swift（要同時編進 app，原因在那個檔案）
import SwiftUI
import WidgetKit

@main
struct QiejiControls: WidgetBundle {
  var body: some Widget {
    NewLineControl()
  }
}

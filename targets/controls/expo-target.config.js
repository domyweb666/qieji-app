// 控制中心「記一行」按鈕（2026-11-01，待審-控制中心按鈕.md 甲）。@bacons/apple-targets 在 prebuild 時把這個資料夾變成一個 widget 擴充。
// 控制項目是 iOS 18 才有的，整個擴充就設 18.0：更舊的 iOS 不載這個擴充，app 本身照常
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'QiejiControls',
  displayName: '茄記',
  bundleIdentifier: '.controls',
  deploymentTarget: '18.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents'],
};

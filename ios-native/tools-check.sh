#!/bin/sh
# 在 limrun 的 Xcode 沙盒裡跑：用 CI 釘死的同一版工具排版、檢查格式與規矩，再把排好的 Swift 檔包成 formatted.tgz 給本機拉回去。
# 用法（在 ios-native/ 底下）：lim xcode run . --id <沙盒 id> -- sh tools-check.sh
set -e
T="$PWD/.limbuild-sandbox/tools"
mkdir -p "$T"
if [ ! -x "$T/swiftformat" ]; then
  curl -fsSL -o "$T/sf.zip" https://github.com/nicklockwood/SwiftFormat/releases/download/0.64.0/swiftformat.zip
  echo "95ea62625d0b898a7af870293311ae6f09e4a3147ecd900593687e4b9ab2fd98  $T/sf.zip" | shasum -a 256 -c - >/dev/null
  unzip -oq "$T/sf.zip" -d "$T"
  chmod +x "$T/swiftformat"
fi
if [ ! -x "$T/swiftlint" ]; then
  curl -fsSL -o "$T/sl.zip" https://github.com/realm/SwiftLint/releases/download/0.65.1/portable_swiftlint.zip
  echo "c1e429b0599cf1b516f369a2d9ec04eaf0e436f3c12b637df8851fa52ff694d0  $T/sl.zip" | shasum -a 256 -c - >/dev/null
  unzip -oq "$T/sl.zip" -d "$T"
fi
"$T/swiftformat" . 2>&1 | tail -1
"$T/swiftformat" --lint . 2>&1 | tail -1
# COPYFILE_DISABLE：不要把 macOS 的附屬檔（._檔名）一起包進去
find Qieji QiejiTests QiejiControls QiejiShare Shared -name "*.swift" | COPYFILE_DISABLE=1 tar czf formatted.tgz -T -
echo "---LINT"
"$T/swiftlint" lint --strict --quiet 2>&1 | sed "s/.*ios-native\///" | cut -c1-220 | head -30
echo "LINT-DONE"

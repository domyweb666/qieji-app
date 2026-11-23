import SwiftUI
import UIKit

// 茄記設計代號（Swift 版）。數值從 Expo 版 src/lib/tokens.ts 逐項搬過來（2026-11-21），畫面程式只准用這裡的名字。
// 改值要跟 .uiux/05-設計代號/ 一起改。增加對比（hcLight／hcDark）的值照搬但還沒接：沒人在真機看過。

/// 四種模式各一個色碼（0xRRGGBB）
struct Four {
    let light: UInt32
    let dark: UInt32
    let hcLight: UInt32
    let hcDark: UInt32

    init(_ light: UInt32, _ dark: UInt32, _ hcLight: UInt32, _ hcDark: UInt32) {
        self.light = light
        self.dark = dark
        self.hcLight = hcLight
        self.hcDark = hcDark
    }

    /// 跟著系統深淺色換的顏色；alpha＝淺色、深色各自的透明度
    func color(_ alphaLight: Double = 1, _ alphaDark: Double? = nil) -> Color {
        let lightValue = light, darkValue = dark
        let darkAlpha = alphaDark ?? alphaLight
        return Color(UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? Tok.uiColor(darkValue, darkAlpha)
                : Tok.uiColor(lightValue, alphaLight)
        })
    }
}

enum Tok {
    static func uiColor(_ hex: UInt32, _ alpha: Double = 1) -> UIColor {
        UIColor(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: CGFloat(alpha)
        )
    }

    static func solid(_ hex: UInt32, _ alpha: Double = 1) -> Color {
        Color(uiColor(hex, alpha))
    }

    // MARK: 第一層：原始值（名字是顏色不是用途，畫面不准用）

    private enum Raw {
        static let cream50 = Four(0xFFFCF6, 0x2B2231, 0xFFFCF6, 0x241C2A)
        static let cream100 = Four(0xFBF3E7, 0x211A27, 0xFBF3E7, 0x1A1420)
        static let cream200 = Four(0xEADFCF, 0x41364A, 0xEADFCF, 0x4A3E54)
        static let plum900 = Four(0x2E2233, 0xF2EAF1, 0x1B1220, 0xFFFFFF)
        static let plum500 = Four(0x75677A, 0xB5A6BB, 0x5B4C61, 0xD8CCDC)
        static let eggplant = Four(0x7D467F, 0xCDA3D0, 0x5E2E60, 0xE3BFE6)
        static let tomato = Four(0xC83C32, 0xE9837A, 0xA82F27, 0xF39B93)
        static let tomatoBg = Four(0xC83C32, 0xB5392F, 0xA82F27, 0xA33128)
        static let clay = Four(0x7E6F5F, 0x5A4E45, 0x6B5D4E, 0x4A3F37)
        static let paper = Four(0xFFFCF6, 0xFFFCF6, 0xFFFFFF, 0xFFFFFF)
        static let white = Four(0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF)
        static let black = Four(0x000000, 0x000000, 0x000000, 0x000000)
        static let fabIcon = Four(0xFFFFFF, 0x2E2233, 0xFFFFFF, 0x1B1220)
        static let shadowInk: UInt32 = 0x3B2050
    }

    // MARK: 第二層：語意色

    enum Col {
        static let page = Raw.cream100.color()
        static let surface = Raw.cream50.color()
        static let separator = Raw.cream200.color()
        static let textPrimary = Raw.plum900.color()
        static let textSecondary = Raw.plum500.color()
        static let textMuted = Raw.plum900.color(0.7, 0.8)
        static let textStrike = Raw.plum900.color(0.38, 0.45)
        static let textAddRow = Raw.plum900.color(0.72, 0.8)
        static let textOnSwipe = Raw.paper.color()
        static let accent = Raw.eggplant.color()
        static let danger = Raw.tomato.color()
        static let swipeStrikeBg = Raw.clay.color()
        static let swipeDeleteBg = Raw.tomatoBg.color()
        static let pressedFill = Raw.eggplant.color(0.08)
        static let scrim = Raw.black.color(0.2)
        static let dotOutline = Raw.plum900.color(0.55, 0.6)
        static let fabIcon = Raw.fabIcon.color()
        static let rowEditingFill = Raw.white.color(0.45, 0.08)
        static let searchFill = Raw.plum900.color(0.07, 0.14)
        static let menuSep = Raw.plum900.color(0.12, 0.18)
        // 打開的資料夾：後面的暗幕（疊在霧上）、框的底、框邊的亮線；減少透明度時用比較實的那組
        static let folderVeilBlur = Raw.black.color(0.12, 0.25)
        static let folderVeil = Raw.black.color(0.4, 0.5)
        static let folderGlassBlur = Raw.cream50.color(0.55, 0.5)
        static let folderGlass = Raw.cream50.color(0.92, 0.9)
        static let folderGlassEdge = Raw.white.color(0.7, 0.12)
        // 霧幾成（1.1 expo-blur 的 intensity）：長按選單後面、打開的資料夾後面、資料夾框
        static let menuBlur: CGFloat = 0.3
        static let folderBlur: CGFloat = 0.55
        static let folderBoxBlur: CGFloat = 0.6
        static let menuScrim = Raw.black.color(0.28, 0.4)
        static let menuVeil = Raw.black.color(0.06, 0.18) // 長按選單後面：霧掉之後只壓一點點黑（1.1 ALPHA.menuVeil）
        static let shadow = Tok.solid(Raw.shadowInk)
    }

    // MARK: 筆記色票（內容色。key 不能改：存檔格式）

    struct NoteColors {
        let paper: Color // bg：整頁底與標題列底
        let dot: Color // hd：色點、色塊、目錄的磚
        let rule: Color // 行與行之間的線
        let ink: Color // 寫在 dot 上面的字
    }

    private struct NoteRaw {
        let paper: Four
        let dot: UInt32
        let rule: Four
    }

    private static let notes: [String: NoteRaw] = [
        "purple": NoteRaw(
            paper: Four(0xF4EEF2, 0x3F3245, 0xF4EEF2, 0x392D3F), dot: 0xA985AE,
            rule: Four(0xE4D7E3, 0x4F3E55, 0xDDCEDE, 0x4B3A50)
        ),
        "yellow": NoteRaw(
            paper: Four(0xFAF5E4, 0x4D3F35, 0xFAF5E4, 0x473B30), dot: 0xE8C468,
            rule: Four(0xF5E6BF, 0x65543D, 0xF2E0B0, 0x605038)
        ),
        "orange": NoteRaw(
            paper: Four(0xFBF0E6, 0x4D3533, 0xFBF0E6, 0x47302D), dot: 0xE8945C,
            rule: Four(0xF6D7C1, 0x654339, 0xF4CFB4, 0x604034)
        ),
        "red": NoteRaw(
            paper: Four(0xF9ECE8, 0x493036, 0xF9ECE8, 0x442B31), dot: 0xD97C6C,
            rule: Four(0xF1CFC8, 0x603B3E, 0xEEC5BD, 0x5B373A)
        ),
        "blue": NoteRaw(
            paper: Four(0xEEF0F5, 0x39364A, 0xEEF0F5, 0x343245), dot: 0x8E9BC6,
            rule: Four(0xD5DAE9, 0x46465D, 0xCCD2E5, 0x414258)
        ),
        "green": NoteRaw(
            paper: Four(0xEFF2E6, 0x3C3B36, 0xEFF2E6, 0x373630), dot: 0x9DAF6A,
            rule: Four(0xDAE1C7, 0x4B4D3E, 0xD3DBBC, 0x474939)
        ),
        "gray": NoteRaw(
            paper: Four(0xF3EEE7, 0x44393E, 0xF3EEE7, 0x3E3538), dot: 0xBFA88E,
            rule: Four(0xE3D9CC, 0x574A4A, 0xDED2C3, 0x524645)
        ),
        "black": NoteRaw(
            paper: Four(0xE6E2E1, 0x2B222F, 0xE6E2E1, 0x251D2A), dot: 0x4E3F4C,
            rule: Four(0xD4CECF, 0x302734, 0xCCC6C8, 0x2C232F)
        ),
        "white": NoteRaw(
            paper: Four(0xFFFDF9, 0x4E464D, 0xFFFDF9, 0x484247), dot: 0xEDE3D2,
            rule: Four(0xF4EDE0, 0x665E61, 0xEFE6D7, 0x625A5D)
        ),
    ]

    /// 亮度（0 黑～1 白，sRGB 粗算）：太暗的色點上面用白字
    private static func lightness(_ hex: UInt32) -> Double {
        let red = Double((hex >> 16) & 0xFF), green = Double((hex >> 8) & 0xFF), blue = Double(hex & 0xFF)
        return (0.299 * red + 0.587 * green + 0.114 * blue) / 255
    }

    /// 不認得的 key 用玉米（跟資料規則的預設同一個）
    static func note(_ key: String) -> NoteColors {
        guard let raw = notes[key] ?? notes["yellow"] else {
            return NoteColors(paper: Col.page, dot: Col.accent, rule: Col.separator, ink: Col.textPrimary)
        }
        return NoteColors(
            paper: raw.paper.color(),
            dot: solid(raw.dot),
            rule: raw.rule.color(),
            ink: solid(lightness(raw.dot) < 0.5 ? 0xFFFFFF : 0x2B2230)
        )
    }

    // MARK: 文字：六種，對應系統文字樣式，跟著系統字級走

    enum Font {
        static let title = SwiftUI.Font.system(.title, design: .default).weight(.bold) // 28
        static let headline = SwiftUI.Font.headline // 17 半粗
        static let body = SwiftUI.Font.body // 17
        static let callout = SwiftUI.Font.subheadline // 15
        static let footnote = SwiftUI.Font.footnote // 13
        static let label = SwiftUI.Font.caption.weight(.medium) // 12
        static let fabSymbol = SwiftUI.Font.system(size: 24, weight: .semibold)
        static let barIcon = SwiftUI.Font.system(size: 20) // 右上 ⋯ 的圖示（1.1 Sym size 20）
        static let barCheckSize: CGFloat = 20
        static let barCheck = SwiftUI.Font.system(size: 20, weight: .semibold) // 右上 ✓、輸入框的 ✓
        static let chevron = SwiftUI.Font.system(size: 12, weight: .semibold) // 清單名膠囊裡的 ▾
        static let menuIcon = SwiftUI.Font.system(size: 18) // 選單卡每一項右邊的圖示
        static let featIcon = SwiftUI.Font.system(size: 24) // 付費頁每一項功能前面的圖示
        static let lockIcon = SwiftUI.Font.system(size: 28) // 上鎖的紙中間那個鎖
        static let glyphRatio: CGFloat = 0.44 // 磚上的字＝邊長 × 這個比例
        static func glyph(_ side: CGFloat) -> SwiftUI.Font {
            .system(size: side * glyphRatio, weight: .semibold)
        }

        /// 紙上每一行（UIKit 那邊量高度、畫輸入框用同一個字）
        static var lineUI: UIFont {
            UIFont.preferredFont(forTextStyle: .body)
        }

        static let lineHeightRatio: CGFloat = 26.0 / 17.0 // 內文 17 點、行高 26
        /// 紙上的內文再乘字級（完整版：小 0.88、標準 1、大 1.15、特大 1.3）；跟著系統字級走
        static func line(_ scale: CGFloat) -> SwiftUI.Font {
            SwiftUI.Font(lineUI.withSize(lineUI.pointSize * scale) as CTFont)
        }

        static let padLineGap: CGFloat = 5.7 // 記事本：17 點字的行距補到行高 26（26 − 17 × 1.1934）
        static let titleMaxScale: DynamicTypeSize = .xxxLarge
    }

    // MARK: 間距（4 的倍數）

    enum Space {
        static let zero: CGFloat = 0
        static let xxs: CGFloat = 2
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let gutter: CGFloat = 20
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
        static let keyboardGap: CGFloat = 16 // 打字的那行離鍵盤多遠
        static let belowList: CGFloat = 200 // 清單最下面留白，最後一行才捲得上來
        static let pageBottom: CGFloat = 120 // 推進來的頁最下面留白，最後一組才捲得上來
    }

    // MARK: 形狀與尺寸

    enum Shape {
        static let radiusSm: CGFloat = 10
        static let radiusMd: CGFloat = 14
        static let radiusLg: CGFloat = 24
        static let hairline: CGFloat = 1
        static let borderSelected: CGFloat = 3
        static let pillBorder: CGFloat = 1.5 // 清單名小膠囊的茄紫細框（borderSelected 的一半）
        static let tipTailTurn: Double = 45 // 提示卡小尾巴（方塊轉幾度）
        // 封面圖（1.1 丁）：清單的矮橫幅高（不含瀏海）、壓在下緣的方磚邊長、方磚壓進圖裡多少；記事本頂部的圖高
        static let coverLow: CGFloat = 96
        static let coverTile: CGFloat = 56
        static let coverTileLap: CGFloat = 28
        static let coverHigh: CGFloat = 150
        /// 橫幅在標題列（上 8＋按鈕 44＋下 8）下面露出多少
        static let coverBelowBar: CGFloat = max(coverTileLap, coverLow - hitMin - 16)
        static let hitMin: CGFloat = 44
        static let rowMin: CGFloat = 52
        static let menuRow: CGFloat = 48
        static let menuW: CGFloat = 260 // 長按一行的選單卡寬
        static let switchMaxRatio: CGFloat = 0.7 // 切換清單最高佔螢幕幾成（清單多就在裡面捲）
        static let fab: CGFloat = 52 // barH：右下 ＋ 的直徑
        static let gripDot: CGFloat = 3
        static let gripDotGap: CGFloat = 4
        static let gripDotOpacity: Double = 0.55
        static let gridCols = 4
        static let tileMax: CGFloat = 64
        static let tileGapMin: CGFloat = 24
        static let tileLabelGap: CGFloat = 6
        static let tileRowGap: CGFloat = 20
        static let tileRadiusRatio: CGFloat = 14.0 / 64.0
        static let noteIcon: CGFloat = 32
        static let titleIcon: CGFloat = 22
        static let swatchDot: CGFloat = 28
        static let dot: CGFloat = 10 // 最近刪除每一列前面的色點
        static let trashDetailMax: CGFloat = 130 // 刪掉的行右邊那張紙的名字最寬多少
        static let shadowRadius: CGFloat = 12
        static let shadowY: CGFloat = 8
        static let shadowSoft: Double = 0.14
        static let shadowStrong: Double = 0.24
        static let aboutLogo: CGFloat = 64
        static let socialIcon: CGFloat = 26 // 設定頁最下面網站／FB／IG 小圖示
        // 目錄面板（數值照 Expo 版 tokens.ts 的 shape）
        static let borderCard: CGFloat = 1
        static let tileLabelH: CGFloat = 16
        static let dirPeek: CGFloat = 92 // 面板上面留一截看得到後面的紙
        static let dirGrab: CGFloat = 5
        static let handleSolo: CGFloat = 38
        static let handleOff: Double = 0.3
        static let pageDot: CGFloat = 7
        static let folderCols = 3
        static let folderRows = 3
        static let folderDotsH: CGFloat = 14
        static let folderMinis = 3
        static let folderMiniGap: CGFloat = 3
        static let folderMiniPad: CGFloat = 7
        static let folderMiniGlyph: CGFloat = 1.5
        static let minusBadge: CGFloat = 22
        static let menuWide: CGFloat = 320
        static let swatchRing: CGFloat = 2
        static let menuGap: CGFloat = 8 // 選單卡裡組跟組之間那條粗縫（1.1 menuGap）
        static let promptMaxW: CGFloat = 300 // 自己畫的輸入卡（改磚上的字）最寬
        static let seekAnchor = UnitPoint(x: 0.5, y: 1.0 / 3) // 搜尋點一行：那行停在畫面三分之一高
    }

    // MARK: 動態

    enum Motion {
        /// Reanimated 的 duration＝感知時長、dampingRatio 1＝不過頭：對應 SwiftUI 的 spring(response:dampingFraction:)
        static let strikeReturn = Animation.spring(response: 0.25, dampingFraction: 1)
        static let deleteSlide = Animation.spring(response: 0.22, dampingFraction: 1)
        static let snapBack = Animation.spring(response: 0.25, dampingFraction: 1)
        static let dragShift = Animation.spring(response: 0.2, dampingFraction: 1)
        static let dragLand = Animation.spring(response: 0.25, dampingFraction: 1)
        /// 放手滑進落點：跟 dragLand 同一個彈簧（感知 0.25 秒、不過頭），換成勁度與阻尼才帶得進手指的速度。
        /// velocity＝手指速度 ÷ 還要走的距離（每秒走幾個「全程」）
        static func landSpring(velocity: CGFloat) -> Animation {
            .interpolatingSpring(stiffness: 631.65, damping: 50.27, initialVelocity: velocity)
        }

        /// 劃掉後滑回、沒滑夠彈回（1.1 strikeReturn／snapBack：感知 0.25 秒、不過頭），帶手指速度
        static func returnSpring(velocity: CGFloat) -> Animation {
            .interpolatingSpring(stiffness: 631.65, damping: 50.27, initialVelocity: velocity)
        }

        /// 刪除時滑出畫面（1.1 deleteSlide：感知 0.22 秒、不過頭），帶手指速度
        static func deleteSpring(velocity: CGFloat) -> Animation {
            .interpolatingSpring(stiffness: 815.6, damping: 57.12, initialVelocity: velocity)
        }

        /// 目錄面板收起或彈回（1.1 dirPanel：感知 0.34 秒、不過頭），帶手指放手的速度
        static func dirPanelSpring(velocity: CGFloat) -> Animation {
            .interpolatingSpring(stiffness: 341.51, damping: 36.96, initialVelocity: velocity)
        }

        /// 帶速度的彈簧最多帶這麼快（每秒走幾個「全程」）：再快不過頭的彈簧也會衝過頭（1.1 的彈簧都不准過頭）
        static let springSpeedMax: CGFloat = 16
        /// 停止抖動：立刻歸正（1.1）。用一段零秒的動畫蓋掉來回轉的那個
        static let jiggleStop = Animation.linear(duration: 0)
        /// 搜尋點一行：紙捲到那一行（1.1 用系統的捲動動畫）
        static let seek = Animation.easeInOut(duration: 0.3)
        /// 輸入框打錯被擋下：卡片左右晃（1.1 reject：8 點、每段 0.05 秒，四段）
        static let rejectStep = Animation.linear(duration: 0.05)
        static let rejectStepSeconds: Double = 0.05
        static let rejectDist: CGFloat = 8

        static let dragLift = Animation.spring(response: 0.15, dampingFraction: 1)
        static let swipeLabel = Animation.spring(response: 0.25, dampingFraction: 0.6)
        static let rowShift = Animation.easeInOut(duration: 0.18)
        static let fade = Animation.easeInOut(duration: 0.15)
        // 選單卡（1.1 menuPop 170／120、menuBackdrop 160／140）：從靠錨點那一角放大彈出、縮回去
        static let menuPopIn = Animation.easeOut(duration: 0.17)
        static let menuPopOut = Animation.easeIn(duration: 0.12)
        static let menuPopFrom: CGFloat = 0.01
        static let menuBackdrop = Animation.easeInOut(duration: 0.15)
        static let sheet = Animation.spring(response: 0.34, dampingFraction: 1)
        static let keyboard = Animation.timingCurve(0.17, 0.59, 0.4, 0.77, duration: 0.25)
        static let freshGlowFade = Animation.easeOut(duration: 0.6)
        static let freshGlowDelay: Double = 0.3
        static let freshGlowSeconds: Double = 0.6
        static let toTopSeconds: Double = 0.3 // 記下新的一則捲回最上面（1.1 toTop，跟 freshGlowDelay 對齊）
        static let dragLiftScale: CGFloat = 1.02
        static let dragLiftSeconds: Double = 0.15
        static let dragShiftSeconds: Double = 0.2
        static let swipeLabelSeconds: Double = 0.25
        static let swipeLabelDamping: CGFloat = 0.6
        static let rowShiftSeconds: Double = 0.18 // 補位（1.1 rowShift）
        static let seekSeconds: Double = 0.3
        static let keyboardSeconds: Double = 0.25
        /// 紙面的彈簧（原生那份）：感知時長 response 秒、不過頭，接手指的速度（每秒走幾個「全程」）
        static func spring(_ response: Double, velocity: CGFloat) -> UISpringTimingParameters {
            let pace = 2 * Double.pi / response
            return UISpringTimingParameters(
                mass: 1, stiffness: CGFloat(pace * pace), damping: CGFloat(2 * pace), initialVelocity: CGVector(dx: velocity, dy: velocity)
            )
        }

        static let blurSpan: Double = 1 // 霧面停在中間用的那段動畫多長（不會真的跑）
        static let slideBack: Double = 0.25 // 劃掉後滑回、沒滑夠彈回、放手滑進落點
        static let slideOut: Double = 0.22 // 刪除滑出畫面
        static let swipeLabelFrom: Double = 0.35
        static let swipeLabelArm: CGFloat = 1.15
        static let pressDim: Double = 0.6
        static let reducedDimFrom: Double = 0.4
        static let deleteSlideSeconds: Double = 0.22
        static let fadeSeconds: Double = 0.15
        static let composerFocusDelay: Double = 0.3
        // 目錄面板（數值照 Expo 版 tokens.ts 的 motion）
        static let tileShift = Animation.interpolatingSpring(mass: 1, stiffness: 484, damping: 37)
        static let dirPanel = Animation.spring(response: 0.34, dampingFraction: 1)
        /// 切換清單收起：點了一張紙馬上換，面板只是讓開，比升起快（1.1 switchClose 240）
        static let switchClose = Animation.spring(response: 0.24, dampingFraction: 1)
        static let dirPanelSeconds: Double = 0.34
        static let dirFade = Animation.easeInOut(duration: 0.2)
        static let dirFadeSeconds: Double = 0.2
        static let jiggle = Animation.easeInOut(duration: 0.12)
        static let jiggleDeg: Double = 1.2
        static let tileHoldScale: CGFloat = 1.08
        static let menuLiftScale: CGFloat = 1.04
        static let stackPlate: CGFloat = 1.25
        static let stackDim: Double = 0.6
        static let stackCue = Animation.easeInOut(duration: 0.12)
        static let stackPop: CGFloat = 1.1
        static let stackPopSeconds: Double = 0.13
        static let sink = Animation.easeOut(duration: 0.26)
        static let sinkScale: CGFloat = 0.3
        static let launch = Animation.easeOut(duration: 0.26)
        static let launchSeconds: Double = 0.26
        static let dragLandSeconds: Double = 0.25
        /// 拿起時磚補上手指已經走的那段（手勢要走一段才啟動），補完磚的位置就是手指的位置
        static let dragCatch = Animation.easeInOut(duration: 0.12)
    }

    // MARK: 手勢門檻

    enum Gesture {
        static let swipeActivate: CGFloat = 14
        static let swipeFailY: CGFloat = 12 // 左右滑成立之前先上下動這麼多，就交給捲動
        static let strikeMax: CGFloat = 90
        static let strikeRatio: CGFloat = 0.25
        static let deleteMax: CGFloat = 110
        static let deleteRatio: CGFloat = 0.3
        static let dragActivate: CGFloat = 1
        static let dragFailX: CGFloat = 10 // 把手上先左右動這麼多就不算拿起，讓給整行的滑動（比 swipeActivate 小）
        static let dragAutoEdge: CGFloat = 64
        static let dragAutoSpeed: CGFloat = 900
        static let longPress: Double = 0.5
        static let longPressMove: CGFloat = 10
        // 目錄面板（數值照 Expo 版 tokens.ts 的 gesture）
        static let tileDragHeld: CGFloat = 18 // 長按後（選單已跳出）再拖這麼遠才拿起
        static let edgeZone: CGFloat = 36
        static let stackY: CGFloat = 0.375
        static let stackYHold: CGFloat = 0.5
        static let stackFar: CGFloat = 0.25
        static let stackFarHold: CGFloat = 0.36
        static let swapStill: CGFloat = 3
        static let pullActivate: CGFloat = 10
        static let pushCloseRatio: CGFloat = 0.15
        static let flickAhead: CGFloat = 140 // 放手後照慣性還會再走這麼遠就算「甩」
        static let flick: CGFloat = 550 // 目錄往下拉：放手時往下每秒這麼多點就算甩（1.1 flick）
        static let flickPredict: CGFloat = 4 // iOS 16 量不到手指速度：拿「放手後還會走多遠」乘這個估
        static let editLift: CGFloat = 12 // 抖動中手指在磚上移超過這麼多才拿起（1.1）
        static let speedWindow: Double = 0.1 // 算放手速度只看最後這麼多秒
        static let seekNear: CGFloat = 3 // 搜尋點過來的那行在幾個螢幕內才用捲的，更遠直接跳過去（1.1 SEEK_NEAR）
    }

    // MARK: 時間

    enum Timing {
        static let toastStay: Double = 3.5
        static let saveDebounce: Double = 0.25
        static let cloudOffGrace: Double = 10
        static let cloudPushWait: Double = 2
        static let priceLimit: Double = 15 // 讀價格最多等這麼久，超過就照實說讀不到
        static let widgetPushDelay: Double = 0.8 // 換紙之後停這麼久才通知桌面小工具
        static let reviewDelay: Double = 1 // 劃掉一行之後停這麼久才看要不要跳系統評分框
        // 目錄拖曳（數值照 Expo 版 tokens.ts 的 timing，換成秒）
        static let edgeFlip: Double = 0.6
        static let swapDwell: Double = 0.1
        static let swapPoll: Double = 0.125
        static let swapPast: Double = 0.05
        static let stackHover: Double = 0.12
        static let folderLeave: Double = 0.35
    }
}

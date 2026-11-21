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
        static let glyphRatio: CGFloat = 0.44 // 磚上的字＝邊長 × 這個比例
        static func glyph(_ side: CGFloat) -> SwiftUI.Font {
            .system(size: side * glyphRatio, weight: .semibold)
        }

        /// 紙上每一行（UIKit 那邊量高度、畫輸入框用同一個字）
        static var lineUI: UIFont {
            UIFont.preferredFont(forTextStyle: .body)
        }

        static let lineHeightRatio: CGFloat = 26.0 / 17.0 // 內文 17 點、行高 26
        static let titleMaxScale: DynamicTypeSize = .xxxLarge
    }

    // MARK: 間距（4 的倍數）

    enum Space {
        static let zero: CGFloat = 0
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let gutter: CGFloat = 20
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
        static let belowList: CGFloat = 200 // 清單最下面留白，最後一行才捲得上來
    }

    // MARK: 形狀與尺寸

    enum Shape {
        static let radiusSm: CGFloat = 10
        static let radiusMd: CGFloat = 14
        static let radiusLg: CGFloat = 24
        static let hairline: CGFloat = 1
        static let borderSelected: CGFloat = 3
        static let hitMin: CGFloat = 44
        static let rowMin: CGFloat = 52
        static let menuRow: CGFloat = 48
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
        static let shadowRadius: CGFloat = 12
        static let shadowY: CGFloat = 8
        static let shadowSoft: Double = 0.14
        static let shadowStrong: Double = 0.24
        static let aboutLogo: CGFloat = 64
    }

    // MARK: 動態

    enum Motion {
        /// Reanimated 的 duration＝感知時長、dampingRatio 1＝不過頭：對應 SwiftUI 的 spring(response:dampingFraction:)
        static let strikeReturn = Animation.spring(response: 0.25, dampingFraction: 1)
        static let deleteSlide = Animation.spring(response: 0.22, dampingFraction: 1)
        static let snapBack = Animation.spring(response: 0.25, dampingFraction: 1)
        static let dragShift = Animation.spring(response: 0.2, dampingFraction: 1)
        static let dragLand = Animation.spring(response: 0.25, dampingFraction: 1)
        static let dragLift = Animation.spring(response: 0.15, dampingFraction: 1)
        static let swipeLabel = Animation.spring(response: 0.25, dampingFraction: 0.6)
        static let rowShift = Animation.easeInOut(duration: 0.18)
        static let fade = Animation.easeInOut(duration: 0.15)
        static let sheet = Animation.spring(response: 0.34, dampingFraction: 1)
        static let keyboard = Animation.timingCurve(0.17, 0.59, 0.4, 0.77, duration: 0.25)
        static let freshGlowFade = Animation.easeOut(duration: 0.6)
        static let freshGlowDelay: Double = 0.3
        static let dragLiftScale: CGFloat = 1.02
        static let swipeLabelFrom: Double = 0.35
        static let swipeLabelArm: CGFloat = 1.15
        static let pressDim: Double = 0.6
        static let reducedDimFrom: Double = 0.4
        static let deleteSlideSeconds: Double = 0.22
        static let composerFocusDelay: Double = 0.3
    }

    // MARK: 手勢門檻

    enum Gesture {
        static let swipeActivate: CGFloat = 14
        static let strikeMax: CGFloat = 90
        static let strikeRatio: CGFloat = 0.25
        static let deleteMax: CGFloat = 110
        static let deleteRatio: CGFloat = 0.3
        static let dragActivate: CGFloat = 1
        static let dragAutoEdge: CGFloat = 64
        static let dragAutoSpeed: CGFloat = 900
        static let longPress: Double = 0.5
        static let longPressMove: CGFloat = 10
    }

    // MARK: 時間

    enum Timing {
        static let toastStay: Double = 3.5
        static let saveDebounce: Double = 0.25
        static let cloudOffGrace: Double = 10
        static let cloudPushWait: Double = 2
    }
}

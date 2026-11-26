import UIKit

// 紙張材質（2026-11-26 多米：「紙張材質都放進去，再設定裡加個材質設定，可自行做切換」）。
// 數值照設計稿（SVG feTurbulence）。Tokens.swift 快滿 500 行，這一組放這裡。

extension Tok {
    /// 貼圖是白色＋透明度的遮罩（tools/make-paper-grain.py 產生，@3x），這裡給每一層的墨色和不透明度，淺色、深色各一組；
    /// 近看才看得出來、不影響讀字。key 不能改：記在手機的設定
    enum Texture {
        /// 一層：哪張遮罩、淺色／深色的墨色與不透明度
        struct Coat {
            let mask: String
            let light: UInt32
            let dark: UInt32
            let lightAlpha: Double
            let darkAlpha: Double
        }

        /// 一種材質：貼圖一格多大（pt）、疊哪幾層
        struct Recipe {
            let tile: CGFloat
            let coats: [Coat]
        }

        static let scale: CGFloat = 3 // 貼圖的 1 像素＝@3x 的 1 個裝置像素
        static let tile: CGFloat = 512 / scale // 512 像素
        static let laidTile: CGFloat = 144 // 簾紋紙：432 像素＝48 條橫紋（每 3pt）＝2 條鏈紋（每 72pt）
        private static let dustLight: UInt32 = 0x5A4632 // 細顆粒：淺色用暖褐墨
        private static let dustDark: UInt32 = 0xFFF6E8 // 深色用米白

        static let recipes: [String: Recipe] = [
            // 細紙紋：很細的顆粒
            "fine": Recipe(tile: tile, coats: [
                Coat(mask: "GrainFine", light: dustLight, dark: dustDark, lightAlpha: 0.22, darkAlpha: 0.1),
            ]),
            // 棉紙纖維：細顆粒＋淡淡的長纖維絲
            "washi": Recipe(tile: tile, coats: [
                Coat(mask: "GrainWashiDust", light: dustLight, dark: dustDark, lightAlpha: 0.32, darkAlpha: 0.14),
                Coat(mask: "GrainWashiFiber", light: 0xB49A74, dark: 0xE9D9BE, lightAlpha: 0.32, darkAlpha: 0.14),
            ]),
            // 再生紙：細顆粒＋稀疏的小深色斑點
            "recycled": Recipe(tile: tile, coats: [
                Coat(mask: "GrainRecycledDust", light: dustLight, dark: dustDark, lightAlpha: 0.28, darkAlpha: 0.16),
                Coat(mask: "GrainRecycledSpeck", light: 0x4A3A2C, dark: 0x1E1712, lightAlpha: 0.28, darkAlpha: 0.16),
            ]),
            // 水彩紙壓紋：左上打光的低頻凹凸。設計稿淺色 multiply 28%、深色 soft-light 50%，
            // 換成陰影壓黑、亮面提白（淺色只有陰影；整片的平均亮度不動，紙色照舊）
            "watercolor": Recipe(tile: tile, coats: [
                Coat(mask: "GrainWaterShade", light: 0x000000, dark: 0x000000, lightAlpha: 0.08, darkAlpha: 0.12),
                Coat(mask: "GrainWaterLight", light: 0xFFFFFF, dark: 0xFFFFFF, lightAlpha: 0, darkAlpha: 0.05),
            ]),
            // 簾紋紙：每 3pt 一條很淡的橫細紋＋每 72pt 一條直鏈紋＋細顆粒（三樣在同一張遮罩）
            "laid": Recipe(tile: laidTile, coats: [
                Coat(mask: "GrainLaid", light: 0x7A6248, dark: 0xFFF6E8, lightAlpha: 0.22, darkAlpha: 0.09),
            ]),
        ]
    }
}

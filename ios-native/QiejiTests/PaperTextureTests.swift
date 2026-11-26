@testable import Qieji
import XCTest

/// 紙張材質的設定（2026-11-26）：記在這支手機、預設純色、不認得的值當純色；每種材質的貼圖都在、畫得出來
final class PaperTextureTests: XCTestCase {
    private var defaults = UserDefaults.standard
    private let suite = "qieji.tests.papertexture"

    override func setUp() {
        super.setUp()
        UserDefaults().removePersistentDomain(forName: suite)
        defaults = UserDefaults(suiteName: suite) ?? .standard
    }

    override func tearDown() {
        UserDefaults().removePersistentDomain(forName: suite)
        super.tearDown()
    }

    /// 沒設定過：純色
    func testDefaultIsPlain() {
        let texture = PaperTexture(prefs: Prefs(defaults: defaults))
        texture.load()
        XCTAssertEqual(texture.key, PaperTexture.plain)
        XCTAssertEqual(PaperTexture.label(texture.key), Words.texturePlain)
    }

    /// 選了之後關掉 app 再打開：還是那一種；改回純色就把鍵拿掉
    func testChoiceSurvivesRelaunch() {
        let before = PaperTexture(prefs: Prefs(defaults: defaults))
        before.set("laid")
        XCTAssertEqual(before.key, "laid")
        let after = PaperTexture(prefs: Prefs(defaults: defaults))
        after.load()
        XCTAssertEqual(after.key, "laid")
        after.set(PaperTexture.plain)
        XCTAssertNil(Prefs(defaults: defaults).string(Prefs.paperTextureKey))
    }

    /// 存的值不認得（壞掉、以後拿掉的材質）：當純色；set 不認得的值不動
    func testUnknownFallsBackToPlain() {
        let prefs = Prefs(defaults: defaults)
        prefs.set(Prefs.paperTextureKey, "velvet")
        let texture = PaperTexture(prefs: prefs)
        texture.load()
        XCTAssertEqual(texture.key, PaperTexture.plain)
        texture.set("velvet")
        XCTAssertEqual(texture.key, PaperTexture.plain)
        XCTAssertEqual(prefs.string(Prefs.paperTextureKey), "velvet")
    }

    /// 六個選項：純色沒有貼圖，其他五種都有配方、遮罩都在、淺深色都畫得出來
    func testEveryTextureDraws() throws {
        XCTAssertEqual(PaperTexture.choices.count, 6)
        XCTAssertNil(PaperGrain.paint(PaperTexture.plain))
        for choice in PaperTexture.choices where choice.key != PaperTexture.plain {
            let recipe = try XCTUnwrap(Tok.Texture.recipes[choice.key], choice.key)
            for coat in recipe.coats {
                XCTAssertNotNil(UIImage(named: coat.mask), coat.mask)
            }
            let paint = try XCTUnwrap(PaperGrain.paint(choice.key), choice.key)
            XCTAssertEqual(paint.tile, recipe.tile)
            for style in [UIUserInterfaceStyle.light, .dark] {
                let seen = paint.color.resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
                XCTAssertNotEqual(seen, UIColor.clear, "\(choice.key) \(style.rawValue)")
            }
        }
    }

    /// 行的材質跟整張紙對齊：同一張紙上相鄰兩行，貼圖的起點都落在整張紙的同一組格線上
    func testRowGrainAlignsWithPaper() throws {
        let paint = try XCTUnwrap(PaperGrain.paint("laid"))
        for top in [CGFloat(0), 52, 170.5, 1234.25, -40] {
            let skin = GrainSkin(frame: CGRect(x: 0, y: 0, width: 400, height: 60))
            skin.use(paint)
            skin.place(top: top)
            skin.layoutIfNeeded()
            let tile = try XCTUnwrap(skin.subviews.first)
            let start = top + tile.frame.minY // 貼圖的起點在整張紙上的位置
            let steps = start / paint.tile
            XCTAssertEqual(steps, steps.rounded(), accuracy: 0.0001, "top \(top)")
            XCTAssertLessThanOrEqual(tile.frame.minY, 0)
            XCTAssertGreaterThanOrEqual(tile.frame.maxY, skin.bounds.height)
        }
    }
}

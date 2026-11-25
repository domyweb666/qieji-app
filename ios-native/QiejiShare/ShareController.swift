import UIKit

/// 分享表裡的「茄記」：原畫面變暗、底部一張奶油白小卡。
/// 系統給的面板只有整頁高（Apple 論壇 694643）：面板的底清成透明，半高的卡自己畫在底部。
/// S0 空殼（2026-11-25）：系統的分享表還留在卡後面、暗幕只蓋得到面板那一塊，要不要這樣做還沒定
final class ShareController: UIViewController {
    private let scrim = UIView()
    private let card = UIView()
    private let cancel = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        build()
        pin()
    }

    /// 系統把這一頁放在一張整頁高的面板上，底是白的：把上面每一層的底清掉，才看得到後面的 app。
    /// Info 的 NSExtensionActionWantsFullScreenPresentation（放 NSExtensionAttributes 或 NSExtension）、
    /// init 設 modalPresentationStyle 在 iOS 26 都沒有用（2026-11-25 試過）
    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        var up = view.superview
        while let layer = up {
            layer.backgroundColor = .clear
            up = layer.superview
        }
    }

    private func build() {
        view.backgroundColor = .clear
        view.accessibilityViewIsModal = true
        scrim.backgroundColor = UIColor(Tok.Col.scrim)
        card.backgroundColor = UIColor(Tok.Col.surface)
        card.layer.cornerRadius = Tok.Shape.radiusLg
        card.layer.cornerCurve = .continuous
        card.layer.shadowColor = UIColor(Tok.Col.shadow).cgColor
        card.layer.shadowOpacity = Float(Tok.Shape.shadowSoft)
        card.layer.shadowRadius = Tok.Shape.shadowRadius
        card.layer.shadowOffset = CGSize(width: 0, height: Tok.Shape.shadowY)
        cancel.setTitle(ShareWords.cancel, for: .normal)
        cancel.setTitleColor(UIColor(Tok.Col.accent), for: .normal)
        cancel.titleLabel?.font = Tok.Font.styleUI(.headline)
        cancel.titleLabel?.adjustsFontForContentSizeCategory = true
        cancel.addAction(UIAction { [weak self] _ in self?.quit() }, for: .touchUpInside)
        view.addSubview(scrim)
        view.addSubview(card)
        card.addSubview(cancel)
    }

    private func pin() {
        for piece in [scrim, card, cancel] {
            piece.translatesAutoresizingMaskIntoConstraints = false
        }
        NSLayoutConstraint.activate([
            scrim.topAnchor.constraint(equalTo: view.topAnchor),
            scrim.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            scrim.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrim.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            card.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Tok.Space.sm),
            card.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Tok.Space.sm),
            card.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -Tok.Space.sm),
            cancel.topAnchor.constraint(equalTo: card.topAnchor, constant: Tok.Space.sm),
            cancel.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -Tok.Space.sm),
            cancel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: Tok.Space.lg),
            cancel.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -Tok.Space.lg),
            cancel.heightAnchor.constraint(greaterThanOrEqualToConstant: Tok.Shape.hitMin),
        ])
    }

    /// 取消：什麼都不留，回到系統的分享表（completeRequest 才會連分享表一起收掉）
    private func quit() {
        extensionContext?.cancelRequest(withError: CocoaError(.userCancelled))
    }
}

/// 擴充畫面上的字（Design/Words.swift 沒有編進擴充）
enum ShareWords {
    static let cancel = "取消"
}

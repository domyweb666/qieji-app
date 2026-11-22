import SwiftUI
import WidgetKit

/// 桌面／鎖定畫面小工具（1.1 PaperWidget）：上次那張紙的名字和前幾行，點了開 app（app 的根就是上次那張紙）。
/// 多米 2026-10-31 定：只讀不寫；行照紙上順序列，劃掉的用刪除線加淡色。沒買完整版：名字「茄記」＋一句說明，點了開付費頁。
/// kind 與擴充的 Bundle ID 跟 1.1 一樣（PaperWidget／org.domyweb.qieji.ExpoWidgetsTarget）：手機上放好的那塊更新後照樣在
@main
struct QiejiWidgets: WidgetBundle {
    var body: some Widget {
        PaperWidget()
    }
}

struct PaperWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetShare.kind, provider: PaperProvider()) { entry in
            PaperWidgetView(snap: entry.snap)
        }
        .configurationDisplayName("茄記")
        .description("上次那張紙的名字和前幾行")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
    }
}

struct PaperEntry: TimelineEntry {
    let date: Date
    let snap: WidgetSnap?
}

/// 只畫 app 推過來的那一份；不自己排時間更新（內容只有 app 改得動）
struct PaperProvider: TimelineProvider {
    func placeholder(in _: Context) -> PaperEntry {
        PaperEntry(date: Date(), snap: nil)
    }

    func getSnapshot(in _: Context, completion: @escaping (PaperEntry) -> Void) {
        completion(PaperEntry(date: Date(), snap: WidgetShare.read()))
    }

    func getTimeline(in _: Context, completion: @escaping (Timeline<PaperEntry>) -> Void) {
        completion(Timeline(entries: [PaperEntry(date: Date(), snap: WidgetShare.read())], policy: .never))
    }
}

struct PaperWidgetView: View {
    let snap: WidgetSnap?
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let lock = family == .accessoryRectangular
        let paper = Tok.note(snap?.color ?? "yellow").paper
        VStack(alignment: .leading, spacing: Tok.Space.xs) {
            Text(snap?.title ?? "茄記")
                .font(Tok.Font.callout.weight(.bold))
                .foregroundColor(lock ? nil : Tok.Col.textPrimary)
                .lineLimit(1)
            if let locked = snap?.locked {
                // 鎖住的樣子：不放任何紙的內容
                Text(locked)
                    .font(Tok.Font.callout)
                    .foregroundColor(lock ? nil : Tok.Col.textSecondary)
                    .lineLimit(lock ? 2 : 3)
            } else {
                ForEach(Array((snap?.lines ?? []).prefix(maxLines).enumerated()), id: \.offset) { _, line in
                    Text(line.text)
                        .font(Tok.Font.callout)
                        .foregroundColor(lock ? nil : line.done ? Tok.Col.textStrike : Tok.Col.textPrimary)
                        .strikethrough(line.done)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: Tok.Space.zero)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        // 鎖定畫面那幾種由系統決定顏色，不上底色也不指定文字色
        .widgetPaper(lock ? nil : paper)
        .widgetURL(snap?.locked == nil ? nil : URL(string: "qieji://full"))
    }

    private var maxLines: Int {
        switch family {
        case .accessoryRectangular: WidgetShare.lockLines
        case .systemSmall: WidgetShare.smallLines
        case .systemLarge: WidgetShare.largeLines
        default: WidgetShare.mediumLines
        }
    }
}

private extension View {
    /// 小工具的底色：iOS 17 起交給系統的 containerBackground（系統替小工具留一圈內邊距，不自己加），更早的直接鋪底
    @ViewBuilder
    func widgetPaper(_ color: Color?) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(color ?? Color.clear, for: .widget)
        } else {
            padding(Tok.Space.lg).background(color ?? Color.clear)
        }
    }
}

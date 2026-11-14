// 茄記設計代號。畫面程式只准用這裡的名字（T、useColors、useNoteColors、haptic），
// 不准直接寫色碼、rgba、字級、行高、動畫毫秒、圓角、間距數字（tools/check-tokens.mjs 會在提交前擋）。
// 設計依據、對比檢查表、使用規則、詞彙表在 .uiux/05-設計代號/。改值要兩邊一起改，並重跑對比檢查。
// 淺色、深色＝多米 2026-10-31 定案（深色在 iPhone 上看過）；增加對比（hcLight／hcDark）對比算過但沒有 API 接，還沒人看過。
import * as Haptics from 'expo-haptics';
import { useColorScheme } from 'react-native';

export type Mode = 'light' | 'dark' | 'hcLight' | 'hcDark';
type Four = Record<Mode, string>;
type FourAlpha = Record<Mode, number>;
const four = (light: string, dark: string, hcLight: string, hcDark: string): Four => ({ light, dark, hcLight, hcDark });
const alpha = (light: number, dark: number, hcLight: number, hcDark: number): FourAlpha => ({ light, dark, hcLight, hcDark });

/* ---------- 第一層：原始值。只寫在這裡，名字是顏色不是用途，畫面不准用 ---------- */
const P = {
  cream50:  four('#FFFCF6', '#2B2231', '#FFFCF6', '#241C2A'), // 奶油白（卡片、面板）
  cream100: four('#FBF3E7', '#211A27', '#FBF3E7', '#1A1420'), // 奶油底（首頁）
  cream200: four('#EADFCF', '#41364A', '#EADFCF', '#4A3E54'), // 奶油分隔線
  plum900:  four('#2E2233', '#F2EAF1', '#1B1220', '#FFFFFF'), // 帶茄紫的深色字
  plum500:  four('#75677A', '#B5A6BB', '#5B4C61', '#D8CCDC'), // 次要字
  eggplant: four('#7D467F', '#CDA3D0', '#5E2E60', '#E3BFE6'), // 茄子紫（整個 app 唯一的主角色）
  tomato:   four('#C83C32', '#E9837A', '#A82F27', '#F39B93'), // 危險紅，當字
  tomatoBg: four('#C83C32', '#B5392F', '#A82F27', '#A33128'), // 危險紅，當底（深色的字色太淺，淺字壓不上去）
  clay:     four('#7E6F5F', '#5A4E45', '#6B5D4E', '#4A3F37'), // 往右滑露出的暖灰
  paper:    four('#FFFCF6', '#FFFCF6', '#FFFFFF', '#FFFFFF'), // 壓在深底上的淺字，四種模式都淺
  white:    '#FFFFFF',
  black:    '#000000',
  shadowInk: '#3B2050', // 只拿來當 shadowColor
};

/* ---------- 第二層：語意色（四種模式）。透明度字色記透明度，用時跟底合成 ---------- */
const COLOR = {
  page:      P.cream100, // 首頁、最近刪除的整頁底
  surface:   P.cream50,  // 卡片、圓鈕、膠囊、⋯ 選單、顏色面板、動作表單、確認框
  separator: P.cream200, // 首頁卡片框線、選單分隔線
  textPrimary:   P.plum900,
  textSecondary: P.plum500, // 分組標題、說明、空狀態、面板小字、拖曳把手圖示
  textOnSwipe:   P.paper,   // 滑動露出的「劃掉／恢復／刪除」
  accent: P.eggplant, // 每個畫面只出現一次：右下 ＋、選中狀態、返回鍵
  danger: P.tomato,   // 「刪除」「永久刪除」字
  swipeStrikeBg: P.clay,
  swipeDeleteBg: P.tomatoBg,
  // 打開的資料夾（2026-11-02 照 iOS）：後面的目錄霧化（expo-blur）＋一層淡淡的暗幕，框是霧面玻璃、框邊一圈亮線。
  // 系統開了「減少透明度」就不霧化，改用深一點的暗幕和比較不透明的框（folderVeil、folderGlass）
  folderGlass: P.cream50,
  // 壓在 accent 上：淺色是白字；深色的 accent 是淡紫，白字看不清（約 2:1），改用深字（UI 範本 v2，2026-11-04）
  fabIcon: four(P.white, '#2E2233', P.white, '#1B1220'),
};
const ALPHA = {
  textMuted:  alpha(0.7, 0.8, 0.85, 0.9),    // 提示字、底部提示（textPrimary 壓在底上）
  textStrike: alpha(0.38, 0.45, 0.6, 0.7),   // 劃掉的行：多米 2026-10-31 要「黯淡不起眼」，淺色約 2.3:1，低於 4.5 是刻意的（增加對比模式拉回 4.5 以上）
  textAddRow: alpha(0.72, 0.8, 0.9, 0.95),   // 「＋ 新增一行」
  dotOutline: alpha(0.55, 0.6, 0.7, 0.75),   // 色點描邊（textPrimary）
  rowEditing: alpha(0.45, 0.08, 0.45, 0.1),  // 正在編輯的那一行：白色壓在紙色上提亮（網頁版是 55% 紙色＋45% 白；深色只提一點）
  pressedFill: 0.08, // 按住卡片／選單項目（accent）
  scrim: 0.2,        // 所有浮層後面的暗幕（黑）：選單、面板、確認框、輸入框（UI 範本 v2：0.3 → 0.2，全部同一個）
  folderVeil: alpha(0.4, 0.5, 0.5, 0.6),     // 打開資料夾時後面的暗幕（黑）
  folderGlass: alpha(0.92, 0.9, 0.97, 0.95),  // 資料夾框（folderGlass 色）
  folderGlassEdge: alpha(0.7, 0.12, 0.8, 0.2), // 資料夾框邊的亮線（白）
  folderVeilBlur: alpha(0.12, 0.25, 0.4, 0.5),  // 有霧化時疊在霧上面的暗幕（黑），淡很多
  folderGlassBlur: alpha(0.55, 0.5, 0.9, 0.9),  // 有霧化時的資料夾框（底下還有一層霧，所以可以更透）
  // 2026-11-02 系統元件化（多米：外觀全換、互動保留）
  searchFill: alpha(0.07, 0.14, 0.12, 0.2),     // 搜尋框的底（textPrimary 壓在面板上，iOS 搜尋列那種淡灰）
  menuVeil: alpha(0.06, 0.18, 0.3, 0.4),        // 長按選單後面：有霧化時只壓一點點黑（iOS 的長按選單是霧掉、不是變暗）
  menuSep: alpha(0.12, 0.18, 0.3, 0.35),        // 選單裡項目之間的線、組與組之間的粗縫（textPrimary）
};

function rgba(hex: string, a: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export type Colors = {
  page: string; surface: string; separator: string;
  textPrimary: string; textSecondary: string; textMuted: string; textStrike: string; textAddRow: string; textOnSwipe: string;
  accent: string; danger: string;
  swipeStrikeBg: string; swipeDeleteBg: string; pressedFill: string; scrim: string;
  dotOutline: string; fabIcon: string;
  rowEditingFill: string;
  folderVeil: string; folderGlass: string; folderGlassEdge: string; folderVeilBlur: string; folderGlassBlur: string;
  searchFill: string; menuVeil: string; menuSep: string;
  mode: Mode;
};
const cache: Partial<Record<Mode, Colors>> = {};
export function colors(mode: Mode): Colors {
  return cache[mode] ??= {
    page: COLOR.page[mode], surface: COLOR.surface[mode], separator: COLOR.separator[mode],
    textPrimary: COLOR.textPrimary[mode], textSecondary: COLOR.textSecondary[mode],
    textMuted: rgba(COLOR.textPrimary[mode], ALPHA.textMuted[mode]),
    textStrike: rgba(COLOR.textPrimary[mode], ALPHA.textStrike[mode]),
    textAddRow: rgba(COLOR.textPrimary[mode], ALPHA.textAddRow[mode]),
    textOnSwipe: COLOR.textOnSwipe[mode],
    accent: COLOR.accent[mode], danger: COLOR.danger[mode],
    swipeStrikeBg: COLOR.swipeStrikeBg[mode], swipeDeleteBg: COLOR.swipeDeleteBg[mode],
    pressedFill: rgba(COLOR.accent[mode], ALPHA.pressedFill),
    scrim: rgba(P.black, ALPHA.scrim),
    dotOutline: rgba(COLOR.textPrimary[mode], ALPHA.dotOutline[mode]),
    fabIcon: COLOR.fabIcon[mode],
    rowEditingFill: rgba(P.white, ALPHA.rowEditing[mode]),
    folderVeil: rgba(P.black, ALPHA.folderVeil[mode]),
    folderGlass: rgba(COLOR.folderGlass[mode], ALPHA.folderGlass[mode]),
    folderGlassEdge: rgba(P.white, ALPHA.folderGlassEdge[mode]),
    folderVeilBlur: rgba(P.black, ALPHA.folderVeilBlur[mode]),
    folderGlassBlur: rgba(COLOR.folderGlass[mode], ALPHA.folderGlassBlur[mode]),
    searchFill: rgba(COLOR.textPrimary[mode], ALPHA.searchFill[mode]),
    menuVeil: rgba(P.black, ALPHA.menuVeil[mode]),
    menuSep: rgba(COLOR.textPrimary[mode], ALPHA.menuSep[mode]),
    mode,
  };
}
// 讀系統外觀。iOS 的「增加對比」在 React Native 的 AccessibilityInfo 沒有對應方法（2026-10-31 查），所以先只分淺／深，
// hcLight／hcDark 的值留在表裡，之後有 API 再接
export function useMode(): Mode {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}
export function useColors(): Colors {
  return colors(useMode());
}

/* ---------- 文字：UI 範本 v2（2026-11-04 多米定）只有 6 種字，對應系統文字樣式，靠 allowFontScaling 跟動態字級 ---------- */
// 大標題 28／標題 17 半粗／內文 17／次要 15／註記 13／標籤 12。line、input 是「內文」在紙上與輸入框的兩種行高，不是新的字級。
// 單行的字（大標題、標題、內文）不寫行高：iOS 的單行輸入框寫了行高字會偏下（搜尋框、清單名輸入框都用）
export const font = {
  title:    { fontSize: 28, fontWeight: '700' as const },                 // 大標題：紙的名字、最近刪除的頁名
  headline: { fontSize: 17, fontWeight: '600' as const },                 // 標題：面板標題、確認框、資料夾名
  body:     { fontSize: 17, fontWeight: '400' as const },                 // 內文：選單項目、清單名、搜尋框
  line:     { fontSize: 17, lineHeight: 26 },                             // 內文（紙上每一行，多行）。舊的 17/27 收成 26，跟範本同一套
  // 輸入框的字（iOS）：行高貼著字型自己的行距（17 點的中文約 21～22），iOS 輸入框把字放在每行底部，行高拉大字就偏下；
  // 而且要明寫，不寫的話隱形量高度的文字和輸入框各用各的預設行距（真機量到一行 23 對 28），框永遠比字矮（2026-11-01 第六版）
  input:    { fontSize: 17, lineHeight: 22 },
  // 紙上一行沒在打字時是一般文字、點下去才換成輸入框（2026-11-04 手感引擎）。iOS 的一般文字會把字往上抬（行高 − 字型行距）÷ 2 置中，輸入框不抬，
  // 兩邊差這麼多點（(26 − 17 × 1.1934) ÷ 2）。一般文字往下移這麼多，點下去字才不會跳（會跟著系統字級放大）
  lineInputDrop: 2.86,
  callout:  { fontSize: 15, lineHeight: 20, fontWeight: '400' as const }, // 次要：提示條、空狀態、說明句
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const }, // 註記：修改時間、分組名（分組名加 semibold）
  label:    { fontSize: 12, lineHeight: 16, fontWeight: '500' as const }, // 標籤：目錄磚下面的名字
  semibold: '600' as const, // 要加粗時只准用這一個粗細（分組名、提示條按鈕、文字按鈕、磚上的字）
  titleMaxScale: 1.5,       // 清單名最多放大 1.5 倍（多米定），不然會把 ⋯ 擠出去
};

/* ---------- 間距：UI 範本 v2 七格，都是 4 的倍數。裡面的距離比外面小：字跟圖示 s、一行裡 m、浮層裡 l、整個畫面左右 gutter、區塊之間 xl 以上 ---------- */
export const space = { xs: 4, s: 8, m: 12, l: 16, gutter: 20, xl: 24, xxl: 32 };

/* ---------- 形狀與尺寸 ---------- */
export const shape = {
  // 圓角只有三種＋全圓（pill）（UI 範本 v2）：小＝搜尋框、色塊；中＝目錄的磚、清單小方磚的群組；大＝所有浮層（選單、面板、輸入框、資料夾、確認框）
  radiusSm: 10,
  radiusMd: 14,
  radiusLg: 24,
  pill: (height: number) => height / 2,
  borderCard: 1,
  borderSelected: 3,
  hitMin: 44,  // 點擊範圍最小值
  rowMin: 52,  // 每一行的最小高度
  cardMin: 56, // 首頁卡片
  menuRow: 48, // 選單項目、切換清單的項目
  fab: 56,
  swatchPad: 5,
  // 重新設計分支（紙是家）新增
  // 標題區下面的分段把手（B2，多米原型 2026-11-01；11-02 改頁點）：現在這頁一條、其他小圓點，只有一段時是一條長的；點擊範圍另外撐到 hitMin
  handleSeg: 20,  // 現在這頁那條（其他頁是 handleH 大的小圓點）
  handleSolo: 38,
  handleH: 4,
  handleGap: 5,
  handleOff: 0.3, // 沒亮的那幾段（亮的那段不透明）
  // 把手點擊範圍往外撐：往上蓋過時間那行（不能點）、往下只到分隔線（＝時間區下緣內距 space.s），不吃到第一行
  handleSlop: { top: 30, bottom: 8, left: 16, right: 16 },
  // 目錄的磚（2026-11-03 多米：改成 1×1，跟 iPhone 主畫面的 App 一樣，規格見 .uiux/iOS主畫面編輯-官方規範對照.md 第十一節）：
  // 一排 gridCols 個，每欄寬＝格子區寬 ÷ gridCols；方磚邊長＝欄寬扣 tileGapMin、最大 tileMax（iPhone 量到約 63）；
  // 名字在方磚下面 tileLabelGap、一行高 tileLabelH；列跟列之間再空 tileRowGap；圓角＝邊長 × tileRadiusRatio（iOS 約 22%）
  gridCols: 4, tileMax: 64, tileGapMin: 24, tileLabelGap: 6, tileLabelH: 16, tileRowGap: 20, tileRadiusRatio: 14 / 64, // 圓角＝radiusMd（磚最大時剛好 14）
  // 方磚正中間名字的第一個字（2026-11-03 多米：只有顏色很難認）：字的大小＝邊長 × tileGlyphRatio
  tileGlyphRatio: 0.44,
  // 切換清單（2026-11-04 改版）：每一項前面的小方磚、右邊打勾那格的寬；左上清單名小膠囊裡的小方磚
  noteIcon: 32, checkSlot: 17, titleIcon: 22,
  switchMaxRatio: 0.7, // 切換清單最高佔螢幕幾成（清單多就在裡面捲）
  dirPeek: 92,   // 目錄面板垂下來時，螢幕底下留一截看得到後面的紙（點那截收起；多米原型）
  dirGrab: 5,    // 目錄面板底部把手那條的粗細（寬度用 handleSolo）
  pageDot: 7,    // 目錄頁點（C3）：幾頁幾個，亮的是現在這頁（沒亮的用 handleOff）
  // 資料夾磚（2026-11-03 改 1×1，照 iOS）：方磚裡 3×3 小方塊，每塊是裡面一張紙的顏色；小方塊之間的縫、離框的內距
  folderMinis: 3, folderMiniGap: 3, folderMiniPad: 7,
  folderMiniGlyph: 1.5, // 小方塊裡的字比照大磚的比例再放大一點（小方塊才十幾點，照 tileGlyphRatio 太小看不清）
  // 行右邊排順序的把手（2026-11-03 多米：三條線換成 2 欄 × 3 列六個淺點）：點的大小、點跟點的縫、透明度（照次要字色再淡一點）
  gripDot: 3, gripDotGap: 4, gripDotOpacity: 0.55,
  minusBadge: 22, // 目錄抖動時紙磚左上角的「−」（照 iOS 主畫面移除鈕；熱區另外用 hitSlop 補到 44 以上）
  // 打開的資料夾（2026-11-02 照 iOS；2026-11-03 改 1×1 後一頁 folderCols 欄 × folderRows 列，跟 iOS 一樣 3×3）：框的圓角、滿了往右一頁；框下面頁點那排的高
  folderCols: 3, folderRows: 3, folderDotsH: 14,
  // 霧化強度（expo-blur 的 intensity，1～100）：後面的目錄霧一點就好、看得出輪廓；框本身霧重一點，像 iOS 的檔案夾
  // 2026-11-03 照 iPhone 打開的檔案夾（多米截圖）：後面霧很重、幾乎看不出形狀
  folderBlur: 55, folderBoxBlur: 60,
  // 系統材質（2026-11-02）：舊 iOS 的霧面按鈕、選單卡霧多重；長按選單照 iOS 的樣子（寬 250、大圓角、組與組之間一條粗縫）
  materialBlur: 80, menuBlur: 30,
  barH: 52, // 紙最下面那條（PageBar，2026-11-02 Safari 式底部列）：膠囊與右邊 ＋ 的高
  menuW: 260, menuWide: 320, menuGap: 8, // menuWide：最上面有一排九個色塊時（9 × 28 ＋ 兩邊內距放得下）
  swatchDot: 28, // ⋯ 選單裡一排九個色塊
  // 陰影只有兩層（UI 範本 v2）：浮層（圓鈕、選單、面板、提示條、拿起來的行）／右下 ＋
  shadowSoft:   { shadowColor: P.shadowInk, shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  shadowStrong: { shadowColor: P.shadowInk, shadowOpacity: 0.24, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
};

/* ---------- 動態：事件命名，毫秒。reduced＝減少動態時的替代（淡入淡出或不移動），不是關掉 ---------- */
// spring＝Reanimated 的彈簧設定：duration 是「感知時長」（實際跑完約 1.5 倍）、dampingRatio 1＝剛好不過頭、<1 會晃一下、
// overshootClamping＝不准衝過終點。放手類的動畫由畫面程式再加上手指放開的速度（velocity）當起始速度（2-4 做法 3）。
// 2026-11-01 手感第一輪：滑回、彈回、滑出、讓位由固定時長改成彈簧，初值待多米真機調
export const motion = {
  strikeReturn:  { spring: { duration: 250, dampingRatio: 1 }, reducedFade: 150 }, // 劃掉後滑回原位。減少動態：不滑回，整行 150ms 淡回
  deleteSlide:   { spring: { duration: 220, dampingRatio: 1, overshootClamping: true }, reducedFade: 150 }, // 刪除時滑出畫面。減少動態：不滑出，整行 150ms 淡出
  snapBack:      { spring: { duration: 250, dampingRatio: 1 } }, // 沒滑夠放手彈回。減少動態：直接回位
  dragShift:     { spring: { duration: 200, dampingRatio: 1 } }, // 排順序時其他行讓位。減少動態：直接讓位
  dragLand:      { spring: { duration: 250, dampingRatio: 1 } }, // 放下時被拖的行滑進落點。減少動態：直接到位
  launch:        { duration: 260 }, // 2026-11-02 照 iOS 開 App：目錄點一張，那塊磚放大鋪滿面板這麼久，然後面板淡出（dirPanel.reducedFade）。減少動態：不放大
  menuLift:      { scale: 1.04 }, // 2026-11-02 照虛擬手機原型：目錄長按跳選單時，那塊磚在原位浮起來放大這麼多（彈簧用 dragLift 那組）。減少動態：直接到位
  stackTarget:   { scale: 1.1, plate: 1.25, dim: 0.6, cue: 120 }, // plate、dim、cue（2026-11-04 照 iPhone）：準備疊時底下那張後面長出多大的底板、磚變多淡、多快；scale 是東西縮進來時彈一下； // D2：準備疊，底下那張放大一點＝放手就縮進去（2026-11-02 照原型 1.08→1.1；彈簧用 dragLift 那組）。減少動態：直接變大
  dragCatch:     { duration: 120 }, // 拿起時磚補上手指已經走的那段（iOS 手勢要走一段才啟動），之後磚的位置就是手指的位置
  sink:          { duration: 260, scale: 0.3 }, // 2026-11-02 照 iOS：疊上去放手，浮著那張滑到底下那張上、縮小淡掉。減少動態：直接消失
  dragLift:      { scale: 1.02, spring: { duration: 150, dampingRatio: 1 } }, // 拿起來浮起：放大一點＋陰影（shape.shadowSoft）。減少動態：不放大，只有陰影
  tileHold:      { scale: 1.08 }, // 2026-11-03 多米真機：抖動中手指一按住目錄的磚就放大這麼多（看得出按到了），拖著也一樣大，放手才縮回（彈簧用 dragLift 那組，1.02 太小看不出來）。減少動態：直接變大、不彈
  swipeLabel:    { fromOpacity: 0.35, armScale: 1.15, spring: { duration: 250, dampingRatio: 0.6 } }, // 滑動露出的「劃掉／刪除」：越線前從 0.35 亮到 1，越線那一刻放大再彈回（跟震動同一刻）。減少動態：只有透明度
  freshGlow:     { delay: 300, duration: 600 }, // 輸入框送出的那行捲回頂端後亮一下再淡掉：delay≈iOS 捲動動畫的時間（亮著等它到），duration＝淡掉（2026-11-01 第八批）
  rowShift:      { duration: 180 }, // 行長出來、拿掉時其他行滑到新位置（2026-11-01 第二輪）；行本身淡入淡出用 fade。減少動態：直接到位、淡入淡出照舊
  keyboardFollow: { duration: 250, easing: [0.17, 0.59, 0.4, 0.77] as const }, // 系統鍵盤的時長與曲線。輸入框與它的暗幕進出用這組（2026-11-01 第三版：跟鍵盤同一個時鐘）。膠囊與輸入框的「位置」從第四輪 K7 起不再用它推，改由 react-native-keyboard-controller 逐格給鍵盤高度（含手指拖曳收鍵盤）
  fade:          150, // toast、確認框、減少動態時所有滑入／放大的替代
  splashFade:    300, // 啟動畫面收起時淡出（expo-splash-screen setOptions，只有 iOS 有；系統預設 400）：奶油底融進紙，不是硬切（2026-11-01 第四輪 S1，收 06 的 ❓12；初值待多米真機調）
  sheetSlide:    { in: 220, out: 180 },
  // 目錄面板（B3）從上面垂下來／收上去：放手後帶著手指速度彈到底，不過頭（原型 340ms）。減少動態：不滑，淡入淡出
  dirPanel:      { spring: { duration: 340, dampingRatio: 1, overshootClamping: true }, reducedFade: 200 },
  // 切換清單收起（2026-11-04）：點了一張紙馬上換，面板只是讓開，比升起快。減少動態同 dirPanel.reducedFade
  switchClose:   { spring: { duration: 240, dampingRatio: 1, overshootClamping: true } },
  // 輸入框裡的內容不合格按下確定：卡片左右晃一下（像填密碼不達標），每段這麼久、晃這麼遠。減少動態：不晃，只有紅字
  reject:        { dist: 8, step: 50 },
  // 標題區左右撥換張（B4；多米 2026-11-02 改成整頁一起換，照 iOS 分頁捲動）：放手後整頁帶著手指的速度滑到下一張，不過頭（跟目錄面板同一組，原型 340ms）。
  // 沒撥夠放手彈回用 snapBack。減少動態：撥的當下照樣跟手，放手不滑過去，交給換紙本來就有的整張淡入
  pageTurn:      { spring: { duration: 340, dampingRatio: 1, overshootClamping: true } },
  // 目錄編輯（C4，抖動）：每塊磚左右轉 deg 度來回（單程 half 毫秒），相鄰兩塊方向相反才像 iOS 主畫面。減少動態：不抖
  jiggle:        { deg: 1.2, half: 120 },
  // 目錄拖磚時其他磚讓位滑過去（C4）。減少動態：直接到位
  tileShift:     { stiffness: 484, damping: 37, mass: 1 }, // 磚互換、讓位的滑動（2026-11-04 照多米錄的真機主畫面逐格量：約 0.1 秒走七成、0.18 秒走九成、0.27 秒到位，尾端多衝約 1 點）
  sheetBackdrop: { in: 180, out: 180 },
  menuPop:       { in: 170, out: 120 },
  menuBackdrop:  { in: 160, out: 140 },
  pressDim:      0.6, // 所有按住效果統一：透明度
  reducedDimFrom: 0.4, // 減少動態：劃掉時整行先降到這個透明度再淡回 1
};

/* ---------- 觸覺：一種事件一種觸覺 ---------- */
// selection＝最輕的「嗒」（選到、經過）；impact Light＝輕碰撞（生出一個東西、放下）。多米 2026-10-31 第一輪加 add／color／dragPass，
// 2026-11-01 手感第一輪加 dragDrop
const light = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
const HAPTIC = {
  strike: Haptics.selectionAsync, dragStart: Haptics.selectionAsync, menu: Haptics.selectionAsync,
  add: light,                       // 右下 ＋、膠囊 ＋ 新增一行
  dragDrop: light,                  // 排順序放手那一刻（放下一個東西）
  color: Haptics.selectionAsync,    // ⋯ 選單換紙的顏色
  dragPass: Haptics.selectionAsync, // 排順序時拖過另一行
  swipeArm: Haptics.selectionAsync, // 滑動時手指越過劃掉／刪除門檻那一刻（放手不再震）；第三輪加
  reject: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error), // 輸入框內容不合格、按確定被擋下（2026-11-04）
};
export function haptic(event: keyof typeof HAPTIC) { HAPTIC[event]().catch(() => {}); }

/* ---------- 非動畫的門檻與時間 ---------- */
// 只放純數字：滑動手勢在 UI 執行緒（worklet）裡算，從那裡呼叫一般 JS 函式會讓 app 直接崩潰（真機才會，網頁預覽看不出來）
export const gesture = {
  swipeActivate: 14, swipeFailY: 12,
  // 標題區往下拉開目錄（B3）：往下動超過 pullActivate 才算拉；先左右動超過 pullFailX 就不算（留給 B4 左右滑換張）。
  // 拉過面板高度的 pullOpenRatio、或往下甩超過 flick（點／秒）放手就打開；面板底部把手往上推超過 pushCloseRatio 或往上甩就收起（多米原型）
  pullActivate: 10, pullFailX: 14, pullOpenRatio: 0.2, pushCloseRatio: 0.15, flick: 550,
  // 標題區左右撥換張（B4）：左右動超過 pullFailX 才算撥（跟上面往下拉同一個門檻，先動哪個方向就是哪個）；先上下動超過 swapFailY 就不算。
  // 整頁跟著手指走（多米 2026-11-02）：撥過半頁（pageTurnRatio × 螢幕寬）或往同一邊甩超過 swapFlick（點／秒）放手就換，跟 iOS 分頁一樣；
  // 到頭（沒有下一張）整頁只跟手指的 swapEdge 倍（多米原型）
  // 底部列（PageBar）：手指動超過 barActivate 才算滑，先動的方向定案——橫的多＝換張、往上＝開目錄（看角度，不再兩個門檻比快）
  barActivate: 10,
  swapFailY: 12, pageTurnRatio: 0.5, swapFlick: 500, swapEdge: 0.3,
  // 目錄的磚什麼時候算拿起來拖（2026-11-03 多米真機：長按清單選單一跳出來就變成拖、抖動中點資料夾打不開）：
  // 長按後（選單已跳出）要拖超過 tileDragHeld 才拿起——比長按容許的晃動（longPressMove 10）大，手指按著晃一下不會一跳選單就變拖
  // （DirPanel useDragPan 自己在 onUpdate 算：iOS 長按時間一到拖曳就啟動、不看 minDistance，2026-11-03）；
  // 抖動中拖超過 tileDragEdit 才拿起，點一下的容許也用同一個數，手指點下去晃幾點不會被當成拖
  tileDragHeld: 18, tileDragEdit: 12,
  edgeZone: 36, // 拖著磚、磚的中心離螢幕左右邊不到這麼多＝在邊緣（C5），停 timing.edgeFlip 就翻頁
  // 2026-11-02（多米：磚是寬的，左右上下都難換；原型對過）：看拖著那張跟底下那張「重疊多少」（面積比），不看中心落在哪。
  // 疊還是換（2026-11-04 照多米錄的真機主畫面，見 .uiux/iOS主畫面編輯-官方規範對照.md 第十二節）：看前進方向（從磚現在那格往別張那格）。
  // 偏離前進方向不到 stackY × 邊長、還沒推過對方中心 stackFar × 邊長＝準備疊（停 timing.stackHover）；推過去＝馬上互換（timing.swapPast）；偏太多＝手慢下來才互換。
  // 準備疊之後放寬到 stackYHold、stackFarHold（真機約三分之一塊磚才換）。打開的資料夾裡不能疊，中心落在哪格就跟哪格互換
  stackY: 0.375, stackYHold: 0.5, stackFar: 0.25, stackFarHold: 0.36,
  swapStill: 3, // timing.swapPoll 毫秒內手指移動不超過這麼多點算停著；連續兩次才互換（高度錯開經過時才用這條）
  strikeMax: 90, strikeRatio: 0.25,  // 往右滑超過 min(90, 寬 × 25%) 放手算劃掉
  deleteMax: 110, deleteRatio: 0.3,  // 往左滑超過 min(110, 寬 × 30%) 放手算刪除
  dragActivate: 1,    // 把手上「上下」動超過這麼多＝拿起
  dragFailX: 10,      // 把手上「左右」動超過這麼多就不算拿起，讓給整行的滑動（把手常駐之後要分工，2026-11-01；比 swipeActivate 14 小，兩個手勢才不會同一點打架）
  dragAutoEdge: 64,  // 排順序拖到清單上緣、下緣這麼近：紙自己往那邊捲（2026-11-03 多米選照提醒事項）
  dragAutoSpeed: 900, // 自動捲最快幾點／秒（手指貼到最邊上時）；離邊越遠越慢
  longPressMs: 500,   // 長按一行多久跳選單
  longPressMove: 10,  // 長按途中手指移超過這麼多就不算長按（交給滑動）
};
export const timing = { toastStay: 3500, saveDebounce: 250, blurCleanup: 120, freshFocusFallback: 700,
  cloudOffGrace: 10000,
  widgetPushDelay: 800, // 換紙之後停這麼久才通知桌面小工具（2026-11-04）
  reviewDelay: 1000, // 劃掉一行之後停這麼久才看要不要跳系統評分框（1.1 片 C2：動畫跑完、手指離開約 1 秒）
  pageScroll: 16, // 目錄翻頁時多久回報一次捲到哪（毫秒，約一格畫面）：頁點跟著手指亮（C3）
  edgeFlip: 600,
  swapDwell: 100,  // 放進空格、資料夾裡換位：進去待這麼久就做
  swapPoll: 125,   // 高度錯開經過的互換：每隔這麼久看一次手停了沒，連續兩次（約 0.25 秒）才換（2026-11-04 多米：速度改回來）
  swapPast: 50,    // 推過對方中心之後多快互換（2026-11-04 真機錄影：手還在動就換，不用停）
  stackHover: 120, // 準備疊的回饋多快出現（iPhone 量到 0.1～0.2 秒）。拖到資料夾上不再自己打開（多米：顯示合併就好）
  folderLeave: 350 }; // D4：資料夾開著時手指離開框這麼久，資料夾收起、回到目錄繼續拖 // D2：拖著停在別張磚正中間這麼久，底下那張放大＝放手就疊成資料夾（疊在資料夾上＝放進去） // 拖著磚停在左右邊緣多久翻頁（C5，iOS 主畫面差不多這麼久）；一直停著就每隔這麼久再翻一頁 // cloudOffGrace：iCloud 不能用要持續這麼久才提示（剛打開 app 時 iCloud 常常晚一點才準備好，S5）

/* ---------- 桌面小工具（expo-widgets，多米 2026-10-31 第一版只讀不寫）：各尺寸最多放幾行 ---------- */
// 小工具跑在隔離環境、不能 import 這個檔；這裡的值由 src/lib/widget.ts 算好用 props 傳過去
export const widget = {
  lines: { small: 3, medium: 4, large: 10, lock: 2 }, // lock＝鎖定畫面長方形那塊
};

export const T = { font, space, shape, motion, gesture, timing, widget };

/* ---------- 筆記色票：內容色，不是介面色。不當文字色、不當按鈕色。key 不能改（存檔格式） ---------- */
// bg 整頁底與標題列底；hd 色點、色塊；rule 行卡片框線。淺色 bg＝「乙 紙感」（多米 2026-11-01 晚定）；
// rule＝hd 混進 bg，深淺差剩舊格線的七成（增加對比維持舊的深淺差）；深色＝hd 混深底（bg 22%、rule 34%，比舊的 30%／45% 收斂）
export const NOTE_KEYS = ['purple', 'yellow', 'orange', 'red', 'blue', 'green', 'gray', 'black', 'white'] as const;
export type NoteKey = (typeof NOTE_KEYS)[number];
const NOTES: Record<NoteKey, { bg: Four; hd: string; rule: Four }> = {
  purple: { bg: four('#F4EEF2', '#3F3245', '#F4EEF2', '#392D3F'), hd: '#A985AE', rule: four('#E4D7E3', '#4F3E55', '#DDCEDE', '#4B3A50') },
  yellow: { bg: four('#FAF5E4', '#4D3F35', '#FAF5E4', '#473B30'), hd: '#E8C468', rule: four('#F5E6BF', '#65543D', '#F2E0B0', '#605038') },
  orange: { bg: four('#FBF0E6', '#4D3533', '#FBF0E6', '#47302D'), hd: '#E8945C', rule: four('#F6D7C1', '#654339', '#F4CFB4', '#604034') },
  red:    { bg: four('#F9ECE8', '#493036', '#F9ECE8', '#442B31'), hd: '#D97C6C', rule: four('#F1CFC8', '#603B3E', '#EEC5BD', '#5B373A') },
  blue:   { bg: four('#EEF0F5', '#39364A', '#EEF0F5', '#343245'), hd: '#8E9BC6', rule: four('#D5DAE9', '#46465D', '#CCD2E5', '#414258') },
  green:  { bg: four('#EFF2E6', '#3C3B36', '#EFF2E6', '#373630'), hd: '#9DAF6A', rule: four('#DAE1C7', '#4B4D3E', '#D3DBBC', '#474939') },
  gray:   { bg: four('#F3EEE7', '#44393E', '#F3EEE7', '#3E3538'), hd: '#BFA88E', rule: four('#E3D9CC', '#574A4A', '#DED2C3', '#524645') },
  black:  { bg: four('#E6E2E1', '#2B222F', '#E6E2E1', '#251D2A'), hd: '#4E3F4C', rule: four('#D4CECF', '#302734', '#CCC6C8', '#2C232F') },
  white:  { bg: four('#FFFDF9', '#4E464D', '#FFFDF9', '#484247'), hd: '#EDE3D2', rule: four('#F4EDE0', '#665E61', '#EFE6D7', '#625A5D') },
};
// ink＝寫在 hd（卡片顏色、磚上那顆色圓的顏色）上面的字色：大多是深色字，太深的（墨色）用白字（2026-11-03 資料夾磚的小方塊用）
export type NoteColors = { bg: string; hd: string; rule: string; ink: string };
const INK_DARK = '#2B2230', INK_LIGHT = '#FFFFFF';
// 亮度（0 黑～1 白，sRGB 粗算）：太暗就換白字
const lightness = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
};
const INK_SWITCH = 0.5;
// 不認得的 key 用玉米（跟 model.ts 的 col() 同一個預設）
export function noteColors(key: string, mode: Mode): NoteColors {
  const n = NOTES[key as NoteKey] || NOTES.yellow;
  return { bg: n.bg[mode], hd: n.hd, rule: n.rule[mode], ink: lightness(n.hd) < INK_SWITCH ? INK_LIGHT : INK_DARK };
}
export function useNoteColors(key: string): NoteColors {
  return noteColors(key, useMode());
}

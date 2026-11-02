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
  ink:      four('#3A2E42', '#EDE3EC', '#2A1F31', '#F6EEF5'), // toast 底（淺色是深茄紫，深色反過來用淺藥丸）
  lilac:    four('#D7B8F3', '#7D467F', '#E9D7FA', '#5E2E60'), // toast 上的「復原」
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
  toastBg:     P.ink,
  toastText:   four(P.white, '#2E2233', P.white, '#1B1220'),
  toastAction: P.lilac,
  // 打開的資料夾（2026-11-02 照 iOS）：後面的目錄霧化（expo-blur）＋一層淡淡的暗幕，框是霧面玻璃、框邊一圈亮線。
  // 系統開了「減少透明度」就不霧化，改用深一點的暗幕和比較不透明的框（folderVeil、folderGlass）
  folderGlass: P.cream50,
  fabIcon: four(P.white, P.white, P.white, P.white), // 壓在 accent 上
};
const ALPHA = {
  textMuted:  alpha(0.7, 0.8, 0.85, 0.9),    // 提示字、底部提示（textPrimary 壓在底上）
  textStrike: alpha(0.38, 0.45, 0.6, 0.7),   // 劃掉的行：多米 2026-10-31 要「黯淡不起眼」，淺色約 2.3:1，低於 4.5 是刻意的（增加對比模式拉回 4.5 以上）
  textAddRow: alpha(0.72, 0.8, 0.9, 0.95),   // 「＋ 新增一行」
  dotOutline: alpha(0.55, 0.6, 0.7, 0.75),   // 色點描邊（textPrimary）
  rowEditing: alpha(0.45, 0.08, 0.45, 0.1),  // 正在編輯的那一行：白色壓在紙色上提亮（網頁版是 55% 紙色＋45% 白；深色只提一點）
  pressedFill: 0.08, // 按住卡片／選單項目（accent）
  scrim: 0.3,        // 選單、表單後面的暗幕（黑）
  toastBg: 0.94,
  folderVeil: alpha(0.4, 0.5, 0.5, 0.6),     // 打開資料夾時後面的暗幕（黑）
  folderGlass: alpha(0.92, 0.9, 0.97, 0.95),  // 資料夾框（folderGlass 色）
  folderGlassEdge: alpha(0.7, 0.12, 0.8, 0.2), // 資料夾框邊的亮線（白）
  folderVeilBlur: alpha(0.12, 0.25, 0.4, 0.5),  // 有霧化時疊在霧上面的暗幕（黑），淡很多
  folderGlassBlur: alpha(0.55, 0.5, 0.9, 0.9),  // 有霧化時的資料夾框（底下還有一層霧，所以可以更透）
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
  toastBg: string; toastText: string; toastAction: string;
  dotOutline: string; fabIcon: string;
  rowEditingFill: string;
  folderVeil: string; folderGlass: string; folderGlassEdge: string; folderVeilBlur: string; folderGlassBlur: string;
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
    toastBg: rgba(COLOR.toastBg[mode], ALPHA.toastBg), toastText: COLOR.toastText[mode], toastAction: COLOR.toastAction[mode],
    dotOutline: rgba(COLOR.textPrimary[mode], ALPHA.dotOutline[mode]),
    fabIcon: COLOR.fabIcon[mode],
    rowEditingFill: rgba(P.white, ALPHA.rowEditing[mode]),
    folderVeil: rgba(P.black, ALPHA.folderVeil[mode]),
    folderGlass: rgba(COLOR.folderGlass[mode], ALPHA.folderGlass[mode]),
    folderGlassEdge: rgba(P.white, ALPHA.folderGlassEdge[mode]),
    folderVeilBlur: rgba(P.black, ALPHA.folderVeilBlur[mode]),
    folderGlassBlur: rgba(COLOR.folderGlass[mode], ALPHA.folderGlassBlur[mode]),
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

/* ---------- 文字：對應系統文字樣式，字級是系統預設值，靠 allowFontScaling 跟動態字級 ---------- */
export const font = {
  listTitle:    { fontSize: 20, fontWeight: '700' as const }, // Title 3；清單標題，最多放大 1.5 倍（多米定）
  paperTitle:   { fontSize: 28, fontWeight: '700' as const }, // Title 1；紙最上面的清單名（重新設計分支）
  body:         { fontSize: 17, fontWeight: '400' as const }, // Body；每一行、首頁清單名稱、選單項目
  bodyLine:     { fontSize: 17, lineHeight: 27 },
  // 輸入框的字（iOS）：行高貼著字型自己的行距（17 點的中文約 21～22），iOS 輸入框把字放在每行底部，行高拉大字就偏下；
  // 而且要明寫，不寫的話隱形量高度的文字和輸入框各用各的預設行距（真機量到一行 23 對 28），框永遠比字矮（2026-11-01 第六版）
  composerLine: { fontSize: 17, lineHeight: 22 },             // 每一行的字（行高約 1.6）。2026-10-31 A4 曾試 20/30，多米 2026-11-01 真機看了說太大，定回 17/27
  emphasis:     { fontSize: 17, fontWeight: '600' as const }, // Headline；確認框的字
  subhead:      { fontSize: 15, fontWeight: '400' as const }, // chip、空狀態、toast
  subheadBold:  { fontSize: 15, fontWeight: '600' as const }, // 滑動露出的字、面板標題、toast 按鈕
  footnote:     { fontSize: 13, fontWeight: '400' as const }, // 底部提示、說明、動作表單標題
  footnoteBold: { fontSize: 13, fontWeight: '600' as const }, // 面板色名
  sectionHead:  { fontSize: 13, fontWeight: '700' as const, letterSpacing: 1.5 }, // 首頁分組標題
  caption:      { fontSize: 12, fontWeight: '400' as const }, // 面板蔬菜名
  largeTitle:   { fontSize: 34, fontWeight: '700' as const }, // 網頁預覽的大標題（iOS 用系統的）
  listTitleMaxScale: 1.5,
  emptyLineHeight: 24,
  plusGlyph:    { fontSize: 20 }, // 「＋ 新增一行」的 ＋
  sheetOption:  { fontSize: 20 }, // 網頁預覽動作表單項目（只用一次）
};

/* ---------- 間距：六個刻度。靠近文字的（行內距 m、卡片內距 l）乘 fontScale ---------- */
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 40 };

/* ---------- 形狀與尺寸 ---------- */
export const shape = {
  radiusCard: 16,   // 行卡片、首頁卡片、chip、⋯ 選單、動作表單、確認框、面板色塊外框
  radiusSwatch: 11, // 面板色塊（＝外框 16 − 內距 5）
  radiusPanel: 24,  // 顏色面板整張（系統 sheetCornerRadius）
  pill: (height: number) => height / 2,
  borderCard: 1,
  borderSelected: 3,
  hitMin: 44,  // 點擊範圍最小值
  rowMin: 54,  // 「新增一行」與每一行的最小高度
  cardMin: 56, // 首頁卡片
  menuRow: 50,
  fab: 58,
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
  tile: 84,      // 目錄的色磚高度
  dirPeek: 92,   // 目錄面板垂下來時，螢幕底下留一截看得到後面的紙（點那截收起；多米原型）
  dirGrab: 5,    // 目錄面板底部把手那條的粗細（寬度用 handleSolo）
  tileTag: 40,   // 色磚右下角露出的色圓
  pageDot: 7,    // 目錄頁點（C3）：幾頁幾個，亮的是現在這頁（沒亮的用 handleOff）
  // 資料夾磚（2026-11-02 多米選 A）：名字跟紙磚一樣大，下面一排兩格預覽（那張紙的顏色＋名字），更多的寫 +N
  folderPeek: 28, folderPeekRadius: 7, folderPeeks: 2,
  folderPlusW: 30, // 「+N」那格的寬
  minusBadge: 22, // 目錄抖動時紙磚左上角的「−」（照 iOS 主畫面移除鈕；熱區另外用 hitSlop 補到 44 以上）
  // 打開的資料夾（2026-11-02 照 iOS）：框的圓角、一頁 2 欄 × folderRows 列，滿了往右一頁；框下面頁點那排的高
  radiusFolder: 38, folderRows: 3, folderDotsH: 14,
  // 霧化強度（expo-blur 的 intensity，1～100）：後面的目錄霧一點就好、看得出輪廓；框本身霧重一點，像 iOS 的檔案夾
  folderBlur: 24, folderBoxBlur: 60,
  swatchDot: 26, // ⋯ 選單裡一排九個色塊
  shadowSoft:   { shadowColor: P.shadowInk, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }, // 圓鈕、膠囊、⋯ 選單
  shadowStrong: { shadowColor: P.shadowInk, shadowOpacity: 0.3,  shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }, // 右下 ＋
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
  stackTarget:   { scale: 1.1 }, // D2：準備疊，底下那張放大一點＝放手就縮進去（2026-11-02 照原型 1.08→1.1；彈簧用 dragLift 那組）。減少動態：直接變大
  sink:          { duration: 260, scale: 0.3 }, // 2026-11-02 照 iOS：疊上去放手，浮著那張滑到底下那張上、縮小淡掉。減少動態：直接消失
  dragLift:      { scale: 1.02, spring: { duration: 150, dampingRatio: 1 } }, // 拿起來浮起：放大一點＋陰影（shape.shadowSoft）。減少動態：不放大，只有陰影
  swipeLabel:    { fromOpacity: 0.35, armScale: 1.15, spring: { duration: 250, dampingRatio: 0.6 } }, // 滑動露出的「劃掉／刪除」：越線前從 0.35 亮到 1，越線那一刻放大再彈回（跟震動同一刻）。減少動態：只有透明度
  freshGlow:     { delay: 300, duration: 600 }, // 輸入框送出的那行捲回頂端後亮一下再淡掉：delay≈iOS 捲動動畫的時間（亮著等它到），duration＝淡掉（2026-11-01 第八批）
  rowShift:      { duration: 180 }, // 行長出來、拿掉時其他行滑到新位置（2026-11-01 第二輪）；行本身淡入淡出用 fade。減少動態：直接到位、淡入淡出照舊
  keyboardFollow: { duration: 250, easing: [0.17, 0.59, 0.4, 0.77] as const }, // 系統鍵盤的時長與曲線。輸入框與它的暗幕進出用這組（2026-11-01 第三版：跟鍵盤同一個時鐘）。膠囊與輸入框的「位置」從第四輪 K7 起不再用它推，改由 react-native-keyboard-controller 逐格給鍵盤高度（含手指拖曳收鍵盤）
  fade:          150, // toast、確認框、減少動態時所有滑入／放大的替代
  splashFade:    300, // 啟動畫面收起時淡出（expo-splash-screen setOptions，只有 iOS 有；系統預設 400）：奶油底融進紙，不是硬切（2026-11-01 第四輪 S1，收 06 的 ❓12；初值待多米真機調）
  sheetSlide:    { in: 220, out: 180 },
  // 目錄面板（B3）從上面垂下來／收上去：放手後帶著手指速度彈到底，不過頭（原型 340ms）。減少動態：不滑，淡入淡出
  dirPanel:      { spring: { duration: 340, dampingRatio: 1, overshootClamping: true }, reducedFade: 200 },
  // 標題區左右撥換張（B4；多米 2026-11-02 改成整頁一起換，照 iOS 分頁捲動）：放手後整頁帶著手指的速度滑到下一張，不過頭（跟目錄面板同一組，原型 340ms）。
  // 沒撥夠放手彈回用 snapBack。減少動態：撥的當下照樣跟手，放手不滑過去，交給換紙本來就有的整張淡入
  pageTurn:      { spring: { duration: 340, dampingRatio: 1, overshootClamping: true } },
  // 目錄編輯（C4，抖動）：每塊磚左右轉 deg 度來回（單程 half 毫秒），相鄰兩塊方向相反才像 iOS 主畫面。減少動態：不抖
  jiggle:        { deg: 1.2, half: 120 },
  // 目錄拖磚時其他磚讓位滑過去（C4）。減少動態：直接到位
  tileShift:     { duration: 200 },
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
  swapFailY: 12, pageTurnRatio: 0.5, swapFlick: 500, swapEdge: 0.3,
  tileDrag: 6, // 目錄的磚（C4）：長按之後（抖動中不用等）手指移超過這麼多就拿起來拖
  edgeZone: 36, // 拖著磚、磚的中心離螢幕左右邊不到這麼多＝在邊緣（C5），停 timing.edgeFlip 就翻頁
  // 2026-11-02（多米：磚是寬的，左右上下都難換；原型對過）：看拖著那張跟底下那張「重疊多少」（面積比），不看中心落在哪。
  // 不到 mergeOverlap 不理；mergeOverlap～swapOverlap 停 timing.stackHover＝準備疊；超過 swapOverlap 停 timing.swapDwell＝互換（只有這兩張動）；
  // 準備疊之後要掉到 mergeHold 以下才取消。打開的資料夾裡不能疊，超過 folderSwapOverlap 就互換
  mergeOverlap: 0.2, swapOverlap: 0.5, mergeHold: 0.15, folderSwapOverlap: 0.3,
  strikeMax: 90, strikeRatio: 0.25,  // 往右滑超過 min(90, 寬 × 25%) 放手算劃掉
  deleteMax: 110, deleteRatio: 0.3,  // 往左滑超過 min(110, 寬 × 30%) 放手算刪除
  dragActivate: 1,    // 把手上「上下」動超過這麼多＝拿起
  dragFailX: 10,      // 把手上「左右」動超過這麼多就不算拿起，讓給整行的滑動（把手常駐之後要分工，2026-11-01；比 swipeActivate 14 小，兩個手勢才不會同一點打架）
  longPressMs: 500,   // 長按一行多久跳選單
  longPressMove: 10,  // 長按途中手指移超過這麼多就不算長按（交給滑動）
};
export const timing = { toastStay: 3500, saveDebounce: 250, blurCleanup: 120, freshFocusFallback: 700,
  cloudOffGrace: 10000,
  pageScroll: 16, // 目錄翻頁時多久回報一次捲到哪（毫秒，約一格畫面）：頁點跟著手指亮（C3）
  edgeFlip: 600,
  swapDwell: 100,  // 2026-11-02：重疊超過一半停這麼久就互換（推過去就換，不用刻意停）
  stackHover: 250, // 2026-11-02：重疊兩成到一半停這麼久就準備疊。拖到資料夾上不再自己打開（多米：顯示合併就好）
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
export type NoteColors = { bg: string; hd: string; rule: string };
// 不認得的 key 用玉米（跟 model.ts 的 col() 同一個預設）
export function noteColors(key: string, mode: Mode): NoteColors {
  const n = NOTES[key as NoteKey] || NOTES.yellow;
  return { bg: n.bg[mode], hd: n.hd, rule: n.rule[mode] };
}
export function useNoteColors(key: string): NoteColors {
  return noteColors(key, useMode());
}

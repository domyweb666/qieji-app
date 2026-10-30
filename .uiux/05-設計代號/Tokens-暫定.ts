// 茄記設計代號（暫定 v0，2026-10-31）
// 這是「設計代號檔」的 React Native 版（書 3-5 的 Tokens.swift 對應物）。
// 畫面程式只准用第二層 T.*（依用途命名），不准用第一層 P.*（原始色碼），更不准直接寫色碼、字級、動畫數字。
// 淺色值全部抄自程式現值（theme.ts、model.ts、各畫面）；深色、增加對比是 Agent 算出來的候選，多米還沒看過。
// ❓ 標 ❓ 的要多米決定；標「查證」的是會過時的 API，接進程式前先查（書的查證日期 2026-10）。
//
// 怎麼接進 app（給 VibeRails，不在這支做）：
//   1. 把這個檔案搬到 src/lib/tokens.ts，theme.ts 的 C／F 改成從這裡匯出，model.ts 的 COLORS 色碼改讀 Notes 色票。
//   2. 依外觀（淺／深）與「增加對比」選 Mode。React Native 讀系統外觀用 useColorScheme()；
//      iOS「增加對比」在 React Native 有沒有 API 要查證（AccessibilityInfo 目前沒有對應的方法）。查不到 → 增加對比先只跟淺／深。
//   3. 提交前自動檢查：見 使用規則.md 最後一節。

export type Mode = 'light' | 'dark' | 'hcLight' | 'hcDark';
type Four = Record<Mode, string>;
const four = (light: string, dark: string, hcLight: string, hcDark: string): Four => ({ light, dark, hcLight, hcDark });

/* =========================================================
 * 第一層：原始值。只寫在這裡。顏色名是顏色，不是用途。
 * ========================================================= */
export const P = {
  cream50:  four('#FFFCF6', '#2B2231', '#FFFCF6', '#241C2A'), // 奶油白（卡片、面板）
  cream100: four('#FBF3E7', '#211A27', '#FBF3E7', '#1A1420'), // 奶油底（首頁）
  cream200: four('#EADFCF', '#41364A', '#EADFCF', '#4A3E54'), // 奶油分隔線
  plum900:  four('#2E2233', '#F2EAF1', '#1B1220', '#FFFFFF'), // 帶茄紫的深色字
  plum500:  four('#85778A', '#B5A6BB', '#5B4C61', '#D8CCDC'), // 次要字 ❓ 淺色 3.81:1 不過，改法見對比檢查表
  eggplant: four('#7D467F', '#CDA3D0', '#5E2E60', '#E3BFE6'), // 茄子紫（整個 app 唯一的主角色）
  tomato:   four('#D0443A', '#E9837A', '#A82F27', '#F39B93'), // 危險紅 ❓ 淺色 4.49:1 差一點，改法見對比檢查表
  clay:     four('#9C8C7A', '#6B5F55', '#7E6F5F', '#857768'), // 往右滑露出的暖灰 ❓ 淺色 3.18:1 不過
  shadowInk: '#3B2050', // 陰影用的深茄紫（只拿來當 shadowColor）
  // 過渡期：theme.ts 的 gray #A39383、tintSoft 沒人用，不進代號（一處都沒用到就不升格）
} as const;

/* =========================================================
 * 第二層：語意。畫面只准用這一層。
 * ========================================================= */
export const T = {
  color: {
    // 底
    page:      P.cream100, // 首頁、最近刪除的整頁底
    surface:   P.cream50,  // 卡片、圓鈕、膠囊、⋯ 選單、顏色面板、動作表單、確認框
    separator: P.cream200, // 首頁卡片框線、選單分隔線
    // 字
    textPrimary:   P.plum900,
    textSecondary: P.plum500,
    // 透明度字色：同一個深色字以不同透明度壓在底上。值是透明度，底不同對比就不同（見對比檢查表）
    // ❓ 多米決定要不要把 placeholder／done／hint 三個併成一個「淡字」透明度（都是「不重要但要讀得到」的字）
    textPlaceholderAlpha: { light: 0.35, dark: 0.45, hcLight: 0.55, hcDark: 0.6 }, // 現值 0.35 → 2.08:1 不過；要過要 0.7
    textDoneAlpha:        { light: 0.38, dark: 0.45, hcLight: 0.6,  hcDark: 0.65 }, // 劃掉的行；現值 2.25:1 不過；要過要 0.65
    textHintAlpha:        { light: 0.4,  dark: 0.5,  hcLight: 0.65, hcDark: 0.7 },  // 底部提示；現值 2.29:1 不過；要過要 0.72
    textAddRowAlpha:      { light: 0.72, dark: 0.8,  hcLight: 0.9,  hcDark: 0.95 }, // 「＋ 新增一行」；九種底最低 5.04:1 過
    textOnSwipe: P.cream50,  // 滑動露出的「劃掉／刪除」字（用卡片色）
    // 主角與危險
    accent: P.eggplant, // 每個畫面只出現一次：右下 ＋、選中狀態、返回鍵
    danger: P.tomato,   // 「刪除」「永久刪除」字、往左滑露出的底
    // 回饋底
    swipeStrikeBg: P.clay,
    swipeDeleteBg: P.tomato,
    pressedFill: 'rgba(125,70,127,0.08)', // 按住卡片／選單項目（茄子紫 8%，四種模式先同一值 ❓）
    scrim: 'rgba(0,0,0,0.3)',             // 選單、表單後面的暗幕（現值 0.3 與 0.32 併成一個）
    toastBg:     four('#3A2E42', '#EDE3EC', '#2A1F31', '#F6EEF5'), // 94% 透明度壓在 page 上
    toastBgAlpha: 0.94,
    toastText:   four('#FFFFFF', '#2E2233', '#FFFFFF', '#1B1220'),
    toastAction: four('#D7B8F3', '#7D467F', '#E9D7FA', '#5E2E60'),
    // 非文字元件
    gripAlpha: { light: 0.22, dark: 0.3, hcLight: 0.45, hcDark: 0.5 }, // ⋮⋮；現值 1.55:1 不過（非文字門檻 3:1）；要過要 0.5
    dotOutlineAlpha: 0.15, // 色點描邊；1.34:1，色點本身 7/9 不過 3:1，改法見對比檢查表
    fabIcon: '#FFFFFF',    // 右下 ＋ 的圖示（壓在 accent 上，6.71:1）
  },

  // 文字：每個代號對應一個系統文字樣式，字級是系統預設值，靠 React Native 的 allowFontScaling（預設開）跟著動態字級。
  // 不寫死字級。❓ 字體：目前全部系統預設字；書建議圓體（.rounded），React Native 怎麼拿到 SF Rounded 要查證，多米先決定要不要
  font: {
    listTitle: { size: 20, weight: '700' as const, system: 'Title 3',     maxScale: 1.5 }, // 清單標題（上限 1.5 倍是多米定的）
    body:      { size: 17, weight: '400' as const, system: 'Body',        lineHeight: 27 }, // 每一行、首頁清單名稱、選單項目
    emphasis:  { size: 17, weight: '600' as const, system: 'Headline' },                   // 確認框的字
    subhead:   { size: 15, weight: '400' as const, system: 'Subheadline' },                // chip、空狀態、toast
    subheadBold: { size: 15, weight: '600' as const, system: 'Subheadline' },              // 滑動露出的字、面板標題、toast 按鈕
    footnote:  { size: 13, weight: '400' as const, system: 'Footnote' },                   // 底部提示、說明、動作表單標題
    footnoteBold: { size: 13, weight: '700' as const, system: 'Footnote', letterSpacing: 1.5 }, // 首頁分組標題
    caption:   { size: 12, weight: '400' as const, system: 'Caption 1' },                  // 面板蔬菜名
    // 不進代號：⋮⋮ 的 18pt 字距 −2（它是圖示不是字，改成 SF Symbol 後就不需要）；動作表單項目 20（網頁預覽專用）
  },

  // 間距：六個刻度。靠近文字的（行內距 12、卡片內距 16）要跟著字級放大：React Native 沒有 ScaledMetric，
  // 用 useWindowDimensions().fontScale 乘（清單頁 minHeight 已經這樣做）。
  // 現值對應：2→xs(4)、5/6/7→s(8)、10/11/14→m(12)、18/20→l(16)、26/30/36→xl(24)、40→xxl(40)。❓ 多米看對應表有沒有不能併的
  space: { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 40 },
  // 大留白不進刻度（各用一次）：列表底 120、清單底 200＋鍵盤、toast 離底 76

  shape: {
    radiusCard: 16,   // 行卡片、首頁卡片、chip、⋯ 選單、面板色塊外框
    radiusSheet: 14,  // 動作表單、確認框 ❓ 要不要併進 16
    radiusSwatch: 11, // 面板色塊（＝外框 16 − 內距 5）
    radiusPanel: 24,  // 顏色面板整張（系統 sheetCornerRadius）
    pill: (height: number) => height / 2, // 圓鈕 44→22、膠囊 44→22、＋ 58→29、toast、色點
    borderCard: 1,
    borderSelected: 3,
    hitMin: 44,       // 點擊範圍最小值；把手 36 寬、chip 28 高目前不到（審查 #9）
    rowMin: 54,       // 「新增一行」與每一行的最小高度
    cardMin: 56,      // 首頁卡片
    menuRow: 50,
    fab: 58,
    shadowSoft:   { color: P.shadowInk, opacity: 0.12, radius: 10, offset: { width: 0, height: 3 } }, // 圓鈕、膠囊
    shadowStrong: { color: P.shadowInk, opacity: 0.3,  radius: 10, offset: { width: 0, height: 4 } }, // 右下 ＋
    // ⋯ 選單卡現值 #000 0.2 r20 y8 → ❓ 併進 shadowSoft 還是留第三種
  },

  // 動態：事件命名，數字照抄 04-手感 參數表與程式現值。全部是時長型（毫秒），不是彈簧（2-4 建議放手速度交彈簧，列進之後）。
  // reduced 是「減少動態」時的替代版：換成淡入淡出或幅度收小，不是關掉。❓ 現在程式是關掉（0ms），多米決定要不要照書改
  motion: {
    strikeReturn:  { duration: 150, reduced: { duration: 0, note: '卡片不滑回；刪除線改用 150ms 淡入出現' } },
    deleteSlide:   { duration: 180, reduced: { duration: 0, note: '卡片不滑出；整行 150ms 淡出' } },
    snapBack:      { duration: 180, reduced: { duration: 0, note: '直接回位（沒有結果的動作，可以不播）' } },
    dragShift:     { duration: 150, reduced: { duration: 0, note: '其他行直接讓位' } },
    keyboardFollow: { duration: 'system' as const, easing: [0.17, 0.59, 0.4, 0.77] as const, reduced: { note: '跟系統鍵盤，不另外處理' } },
    toastFade:     { in: 150, out: 150, reduced: { in: 150, out: 150, note: '淡入淡出本來就是溫和的，不改' } },
    sheetSlide:    { in: 220, out: 180, reduced: { note: '改成淡入淡出 150' } },
    sheetBackdrop: { in: 180, out: 180, reduced: { note: '不改' } },
    confirmFade:   { in: 150, out: 150, reduced: { note: '不改' } },
    menuPop:       { in: 170, out: 120, reduced: { note: '放大縮小改成淡入淡出 150' } },
    menuBackdrop:  { in: 160, out: 140, reduced: { note: '不改' } },
    pressDim:      { opacity: 0.6 },   // 圓鈕、膠囊 ✓、「新增一行」、面板格按住
    pressScale:    { scale: 0.94 },    // 右下 ＋ 按住 ❓ 要不要跟 pressDim 併成一種
  },

  // 觸覺：一種事件只對應一種觸覺。系統事件用系統內建。
  haptic: {
    strike:    'selection' as const, // 劃掉／恢復（expo-haptics selectionAsync）
    dragStart: 'selection' as const, // 開始拖曳
    // 刪除、復原、釘選、toast、存檔失敗：無（現值）。❓ 存檔失敗要不要 notification 'error'
  },

  // 非動畫的門檻與時間（放這裡是讓它有家，不是動畫）
  gesture: {
    swipeActivate: 14, swipeFailY: 12,
    strikeThreshold: (w: number) => Math.min(90, w * 0.25),
    deleteThreshold: (w: number) => Math.min(110, w * 0.3),
    dragActivate: 1,
  },
  timing: { toastStay: 3500, saveDebounce: 250, blurCleanup: 120, freshFocusFallback: 700 },
} as const;

/* =========================================================
 * 筆記色票：內容色，不是介面色（書 3-5 第八點的「角色色」）。
 * 規則：不拿來當文字色、不拿來當按鈕色。key 不能改（存檔格式鐵則，見 model.ts）。
 * 淺色抄 model.ts；深色候選＝hd 30% 混深底；色點（hd）在深色下 7/9 過、黑豆不過，改法見對比檢查表
 * ========================================================= */
export const Notes = {
  purple: { name: '茄子',   hue: '紫色',   bg: four('#F2E8EC', '#4A3A50', '#F2E8EC', '#45364B'), hd: '#A985AE', rule: '#DDCAD8' },
  yellow: { name: '玉米',   hue: '黃色',   bg: four('#FAF0D2', '#5D4D3A', '#FAF0D2', '#584936'), hd: '#E8C468', rule: '#EEDDA6' },
  orange: { name: '紅蘿蔔', hue: '橘色',   bg: four('#FBE6D3', '#5D3F37', '#FBE6D3', '#583A32'), hd: '#E8945C', rule: '#F0C7A4' },
  red:    { name: '甜椒',   hue: '紅色',   bg: four('#F8E0D8', '#58373C', '#F8E0D8', '#533337'), hd: '#D97C6C', rule: '#EBBBAE' },
  blue:   { name: '藍莓',   hue: '藍色',   bg: four('#E7E8F0', '#424157', '#E7E8F0', '#3D3C52'), hd: '#8E9BC6', rule: '#C7CBE0' },
  green:  { name: '青蔥',   hue: '綠色',   bg: four('#EBEED9', '#46473B', '#EBEED9', '#414236'), hd: '#9DAF6A', rule: '#CED8AE' },
  gray:   { name: '香菇',   hue: '奶茶色', bg: four('#F2EADF', '#504546', '#F2EADF', '#4C4041'), hd: '#BFA88E', rule: '#DDCFBD' },
  black:  { name: '黑豆',   hue: '深灰',   bg: four('#E0D8D6', '#2E2532', '#E0D8D6', '#2A212D'), hd: '#4E3F4C', rule: '#C8BEBC' },
  white:  { name: '白蘿蔔', hue: '白色',   bg: four('#FFFCF6', '#5E565A', '#FFFCF6', '#595255'), hd: '#EDE3D2', rule: '#EFE6D8' },
} as const;
// rule（行卡片框線）的深色值還沒算：跟 bg 一樣用 hd 混深底，比例待定 ❓

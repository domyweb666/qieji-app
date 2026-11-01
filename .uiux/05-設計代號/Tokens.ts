// 茄記設計代號（v1，2026-10-31 定案）
// 2026-10-31 已接進 app：唯一來源是 src/lib/tokens.ts，這份是設計版（多了說明）。改值兩邊一起改，並重跑 gen_pairs.py 的對比。
// 這是「設計代號檔」的 React Native 版（書 3-5 的 Tokens.swift 對應物）。
// 畫面程式只准用第二層 T.*（依用途命名）與 Notes.*，不准用第一層 P.*（原始色碼），更不准直接寫色碼、字級、動畫數字。
// v1：淺色、深色＝多米 2026-10-31 定案（對比不過的 8 類照推薦改，全表重算通過；深色在 iPhone 上看過）。
//     增加對比（hcLight／hcDark）對比算過，但 React Native 沒 API 接，還沒人看過。
// 標「查證」的是會過時的 API，接進程式前先查（書的查證日期 2026-10）。
//
// 怎麼接進 app（給 VibeRails，不在這支做）：
//   1. 搬到 src/lib/tokens.ts；theme.ts 的 C／F 改成從這裡匯出；model.ts 的 COLORS 色碼改讀 Notes（key 不能動）。
//   2. 依外觀（淺／深）與「增加對比」選 Mode。讀系統外觀用 useColorScheme()；
//      iOS「增加對比」在 React Native 有沒有 API 要查證（AccessibilityInfo 目前沒有對應方法）。查不到 → 增加對比先只跟淺／深。
//   3. 提交前自動檢查：見 使用規則.md 最後一節。

export type Mode = 'light' | 'dark' | 'hcLight' | 'hcDark';
type Four = Record<Mode, string>;
type FourAlpha = Record<Mode, number>;
const four = (light: string, dark: string, hcLight: string, hcDark: string): Four => ({ light, dark, hcLight, hcDark });
const alpha = (light: number, dark: number, hcLight: number, hcDark: number): FourAlpha => ({ light, dark, hcLight, hcDark });

/* =========================================================
 * 第一層：原始值。只寫在這裡。名字是顏色，不是用途。
 * ========================================================= */
export const P = {
  cream50:  four('#FFFCF6', '#2B2231', '#FFFCF6', '#241C2A'), // 奶油白（卡片、面板）
  cream100: four('#FBF3E7', '#211A27', '#FBF3E7', '#1A1420'), // 奶油底（首頁）
  cream200: four('#EADFCF', '#41364A', '#EADFCF', '#4A3E54'), // 奶油分隔線
  plum900:  four('#2E2233', '#F2EAF1', '#1B1220', '#FFFFFF'), // 帶茄紫的深色字
  plum500:  four('#75677A', '#B5A6BB', '#5B4C61', '#D8CCDC'), // 次要字（原 #85778A 3.81:1 不過 → 4.80:1）
  eggplant: four('#7D467F', '#CDA3D0', '#5E2E60', '#E3BFE6'), // 茄子紫（整個 app 唯一的主角色）
  tomato:   four('#C83C32', '#E9837A', '#A82F27', '#F39B93'), // 危險紅，當字用（原 #D0443A 4.49:1 → 4.94:1）
  tomatoBg: four('#C83C32', '#B5392F', '#A82F27', '#A33128'), // 危險紅，當底用（深色的 tomato 是淺字色，淺字壓不上去，所以底另定）
  clay:     four('#7E6F5F', '#5A4E45', '#6B5D4E', '#4A3F37'), // 往右滑露出的暖灰（原 #9C8C7A 3.18:1 → 4.74:1）
  paper:    four('#FFFCF6', '#FFFCF6', '#FFFFFF', '#FFFFFF'), // 壓在深底（滑動露出的底）上的淺字，四種模式都淺
  shadowInk: '#3B2050', // 陰影用的深茄紫（只拿來當 shadowColor）
  // theme.ts 的 gray #A39383、tintSoft 沒人用，不進代號（一處都沒用到就不升格）
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
    textSecondary: P.plum500, // 分組標題、說明、空狀態、面板小字、拖曳把手圖示
    // 淡字：同一個 textPrimary 以透明度壓在底上。提示字、劃掉的行、底部提示三種併成一個（多米定）。
    // 淺色 0.7：卡片 5.60:1，九種筆記底最低 4.76:1（黑豆）
    textMutedAlpha:  alpha(0.7, 0.8, 0.85, 0.9),
    textStrikeAlpha: alpha(0.38, 0.45, 0.6, 0.7), // 劃掉的行：多米 2026-10-31 要「黯淡不起眼」，淺色約 2.3:1，低於 4.5 是刻意的；增加對比模式拉回 4.5 以上
    textAddRowAlpha: alpha(0.72, 0.8, 0.9, 0.95), // 「＋ 新增一行」；九種底最低 5.04:1
    textOnSwipe: P.paper,  // 滑動露出的「劃掉／恢復／刪除」字
    // 主角與危險
    accent: P.eggplant, // 每個畫面只出現一次：右下 ＋、選中狀態、返回鍵
    danger: P.tomato,   // 「刪除」「永久刪除」字
    // 回饋底
    swipeStrikeBg: P.clay,
    swipeDeleteBg: P.tomatoBg,
    pressedFill: 'rgba(125,70,127,0.08)', // 按住卡片／選單項目（茄子紫 8%，四種模式同一值）
    scrim: 'rgba(0,0,0,0.3)',             // 選單、表單後面的暗幕（原 0.3 與 0.32 併成一個）
    toastBg:     four('#3A2E42', '#EDE3EC', '#2A1F31', '#F6EEF5'), // 以 toastBgAlpha 壓在 page 上
    toastBgAlpha: 0.94,
    toastText:   four('#FFFFFF', '#2E2233', '#FFFFFF', '#1B1220'),
    toastAction: four('#D7B8F3', '#7D467F', '#E9D7FA', '#5E2E60'),
    // 非文字元件
    dotOutlineAlpha: alpha(0.55, 0.6, 0.7, 0.75), // 色點描邊：textPrimary 以此透明度壓在底上，卡片 3.54:1、九種筆記底最低 3.27:1
    fabIcon: '#FFFFFF', // 右下 ＋ 的圖示（壓在 accent 上，6.71:1）
  },

  // 圖示：以前用文字畫的圖示改成 SF Symbol（圖示大小不跟字級放大，熱區另外撐）
  icon: {
    grip: { name: 'line.3.horizontal' as const, size: 18, color: 'textSecondary' as const }, // 原 ⋮⋮ 文字 0.22 透明度 1.55:1
  },

  // 文字：每個代號對應一個系統文字樣式，字級是系統預設值，靠 React Native 的 allowFontScaling（預設開）跟著動態字級。
  // 不寫死字級。字體：系統預設字（多米 2026-10-31 定，不用圓體）
  font: {
    listTitle:    { size: 20, weight: '700' as const, system: 'Title 3',     maxScale: 1.5 }, // 清單標題（上限 1.5 倍是多米定的）
    paperTitle:   { size: 28, weight: '700' as const, system: 'Title 1',     maxScale: 1.5 }, // 紙最上面的清單名（重新設計分支）
    body:         { size: 17, weight: '400' as const, system: 'Body' },                       // 首頁清單名稱、選單項目
    bodyLine:     { size: 17, weight: '400' as const, system: 'Body',        lineHeight: 27 }, // 紙上每一行的字。2026-10-31 A4 曾放大到 20/30，多米 2026-11-01 真機看了說太大，定回 17/27
    emphasis:     { size: 17, weight: '600' as const, system: 'Headline' },                   // 確認框的字
    subhead:      { size: 15, weight: '400' as const, system: 'Subheadline' },                // chip、空狀態、toast
    subheadBold:  { size: 15, weight: '600' as const, system: 'Subheadline' },                // 滑動露出的字、面板標題、toast 按鈕
    footnote:     { size: 13, weight: '400' as const, system: 'Footnote' },                   // 底部提示、說明、動作表單標題
    footnoteBold: { size: 13, weight: '700' as const, system: 'Footnote', letterSpacing: 1.5 }, // 首頁分組標題
    caption:      { size: 12, weight: '400' as const, system: 'Caption 1' },                  // 面板蔬菜名
    // 不進代號：動作表單項目 20（網頁預覽專用，只用一次）
  },

  // 間距：六個刻度（多米定）。靠近文字的（行內距 m、卡片內距 l）乘 useWindowDimensions().fontScale（React Native 沒有 ScaledMetric）。
  // 現值對應：2→xs、5/6/7→s、10/11/14→m、18/20→l、26/30/36→xl、40→xxl
  space: { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 40 },
  // 大留白不進刻度（各用一次，程式裡加註解「只用一次」）：列表底 120、清單底 200＋鍵盤、toast 離底 76

  shape: {
    radiusCard: 16,   // 行卡片、首頁卡片、chip、⋯ 選單、動作表單、確認框、面板色塊外框（原 14 併進來，多米定）
    radiusSwatch: 11, // 面板色塊（＝外框 16 − 內距 5）
    radiusPanel: 24,  // 顏色面板整張（系統 sheetCornerRadius）
    pill: (height: number) => height / 2, // 圓鈕 44→22、膠囊 44→22、＋ 58→29、toast、色點
    borderCard: 1,
    borderSelected: 3,
    hitMin: 44,       // 點擊範圍最小值；把手 36 寬、chip 28 高目前不到（審查 #9），接代號時一起補
    rowMin: 54,       // 「新增一行」與每一行的最小高度
    cardMin: 56,      // 首頁卡片
    menuRow: 50,
    fab: 58,
    // 重新設計分支（紙是家）新增
    chev: 22,      // 清單名旁邊的 ⌄ 小圓
    tile: 84,      // 目錄的色磚高度
    tileTag: 40,   // 色磚右下角露出的色圓
    swatchDot: 26, // ⋯ 選單裡一排九個色塊
    emptyFace: 96, // 空紙上的茄子（扁平線條版）
    // composerLines（輸入框最多四行）2026-11-01 拿掉：多米真機說三行就捲不能沉浸，改成長到清單頂（鍵盤頂到標題列下那段，Paper 算）再多才捲；輸入框卡片用 surface／radiusCard／shadowSoft，進出用 keyboardFollow
    // 兩種陰影（多米定；⋯ 選單原本的 #000 0.2 r20 y8 併進 soft）
    shadowSoft:   { color: P.shadowInk, opacity: 0.12, radius: 10, offset: { width: 0, height: 3 } }, // 圓鈕、膠囊、⋯ 選單
    shadowStrong: { color: P.shadowInk, opacity: 0.3,  radius: 10, offset: { width: 0, height: 4 } }, // 右下 ＋
  },

  // 動態：事件命名，數字照抄 04-手感 參數表與程式現值。
  // reduced＝「減少動態」時的替代版（多米定：照書改成替換，不是關掉）。回饋要在，只是不移動。
  // 2026-11-01 手感第一輪：放手類（滑回、彈回、滑出、讓位、落地）由時長型改成彈簧（spring：Reanimated 的感知時長毫秒＋dampingRatio，
  // 1＝剛好不過頭；放手的再加手指速度當起始速度，2-4 做法 3），初值待多米真機調。程式版在 src/lib/tokens.ts
  motion: {
    strikeReturn:  { spring: { duration: 250, dampingRatio: 1 }, reduced: { move: 0, fade: 150 } }, // 劃掉後滑回；刪除線放手那一刻就畫。減少動態：不滑回、整行 150ms 淡回
    deleteSlide:   { spring: { duration: 220, dampingRatio: 1, overshootClamping: true }, reduced: { move: 0, fade: 150 } }, // 滑出畫面。減少動態：整行 150ms 淡出
    snapBack:      { spring: { duration: 250, dampingRatio: 1 }, reduced: { move: 0 } }, // 沒滑夠彈回。減少動態：直接回位
    dragShift:     { spring: { duration: 200, dampingRatio: 1 }, reduced: { move: 0 } }, // 其他行讓位。減少動態：直接讓位
    dragLand:      { spring: { duration: 250, dampingRatio: 1 }, reduced: { move: 0 } }, // 放下時滑進落點。減少動態：直接到位
    dragLift:      { scale: 1.02, spring: { duration: 150, dampingRatio: 1 }, reduced: { scale: 1 } }, // 拿起浮起：放大＋陰影 shadowSoft。減少動態：只有陰影
    swipeLabel:    { fromOpacity: 0.35, armScale: 1.15, spring: { duration: 250, dampingRatio: 0.6 }, reduced: { scale: 1 } }, // 露出的字：越線前 0.35→1，越線放大再彈回。減少動態：只有透明度
    rowShift:      { duration: 180, reduced: { move: 0 } }, // 行長出來、拿掉時其他行滑到新位置（2026-11-01 第二輪）；行本身、右下 ＋、換紙用 fade 淡入淡出。減少動態：直接到位
    keyboardFollow: { duration: 'system' as const, easing: [0.17, 0.59, 0.4, 0.77] as const }, // 系統鍵盤的時長與曲線：輸入框與暗幕進出用它；膠囊與輸入框的「位置」從第四輪 K7（2026-11-01）起由 react-native-keyboard-controller 逐格給鍵盤高度，含手指拖曳收鍵盤，不再自己推。減少動態不另外處理
    splashFade:    300, // 啟動畫面收起時淡出（expo-splash-screen setOptions，只有 iOS；系統預設 400）：奶油底 page 融進第一張紙，不硬切（2026-11-01 第四輪 S1，收 06 ❓12：不改色、加淡出；初值待多米真機調）。減少動態：淡出本來就是替代版，不改
    toastFade:     { in: 150, out: 150 },                              // 本來就是淡入淡出，減少動態不改
    sheetSlide:    { in: 220, out: 180, reduced: { fade: 150 } },      // 滑入滑出改淡入淡出
    sheetBackdrop: { in: 180, out: 180 },
    confirmFade:   { in: 150, out: 150 },
    menuPop:       { in: 170, out: 120, reduced: { fade: 150 } },      // 放大縮小改淡入淡出
    menuBackdrop:  { in: 160, out: 140 },
    pressDim:      { opacity: 0.6 }, // 所有按住效果統一（多米定；右下 ＋ 原本的縮放 0.94 拿掉）
  },

  // 觸覺：一種事件只對應一種觸覺。系統事件用系統內建。
  haptic: {
    strike:    'selection' as const, // 劃掉／恢復（expo-haptics selectionAsync）
    dragStart: 'selection' as const, // 開始拖曳
    menu:      'selection' as const, // 長按一行跳出選單（重新設計分支）
    add:       'impactLight' as const, // 右下 ＋、膠囊 ＋ 新增一行（2026-10-31）
    color:     'selection' as const,   // ⋯ 選單換紙的顏色（2026-10-31）
    dragPass:  'selection' as const,   // 排順序時拖過另一行（2026-10-31）
    swipeArm:  'selection' as const,   // 滑動越過劃掉／刪除門檻那一刻（2026-10-31 第三輪）
    dragDrop:  'impactLight' as const, // 排順序放手那一刻（2026-11-01 手感第一輪）
    // 刪除、復原、釘選、toast、存檔失敗、Return 開新行、進編輯、切行、收鍵盤：無
  },

  // 非動畫的門檻與時間（放這裡是讓它有家，不是動畫）
  // 只放純數字：滑動手勢在 UI 執行緒（worklet）算，呼叫一般 JS 函式會讓 app 崩潰（真機才會）
  gesture: {
    swipeActivate: 14, swipeFailY: 12,
    strikeMax: 90, strikeRatio: 0.25,  // 往右滑超過 min(90, 寬 × 25%) 算劃掉
    deleteMax: 110, deleteRatio: 0.3,  // 往左滑超過 min(110, 寬 × 30%) 算刪除
    dragActivate: 1,    // 把手上「上下」動超過這麼多＝拿起
    dragFailX: 10,      // 把手上「左右」動超過這麼多就不算拿起，讓給整行的滑動（把手常駐，2026-11-01）
    longPressMs: 500,   // 長按一行多久跳選單
    longPressMove: 10,  // 長按途中手指移超過這麼多就不算長按（交給滑動）
  },
  timing: { toastStay: 3500, saveDebounce: 250, blurCleanup: 120, freshFocusFallback: 700 },
} as const;

/* =========================================================
 * 筆記色票：內容色，不是介面色（書 3-5 第八點的「角色色」）。
 * 規則：不拿來當文字色、不拿來當按鈕色。key 不能改（存檔格式鐵則，見 model.ts）。
 * 淺色抄 model.ts；深色候選＝hd 30% 混深底（bg）、hd 45% 混深底（rule），接進程式後真機看過才定。
 * 色點（hd）在卡片上 7/9 不到 3:1，一律加描邊 dotOutlineAlpha，色點本身當裝飾（旁邊永遠有名字）。
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

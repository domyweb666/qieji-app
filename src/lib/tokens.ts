// 茄記設計代號。畫面程式只准用這裡的名字（T、useColors、useNoteColors、haptic），
// 不准直接寫色碼、rgba、字級、行高、動畫毫秒、圓角、間距數字（tools/check-tokens.mjs 會在提交前擋）。
// 設計依據、對比檢查表、使用規則、詞彙表在 .uiux/05-設計代號/。改值要兩邊一起改，並重跑對比檢查。
// 淺色值＝多米 2026-10-31 定案；深色、增加對比＝候選值，對比算過但還沒在真機看過。
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
  fabIcon: four(P.white, P.white, P.white, P.white), // 壓在 accent 上
};
const ALPHA = {
  textMuted:  alpha(0.7, 0.8, 0.85, 0.9),    // 提示字、劃掉的行、底部提示（textPrimary 壓在底上）
  textAddRow: alpha(0.72, 0.8, 0.9, 0.95),   // 「＋ 新增一行」
  dotOutline: alpha(0.55, 0.6, 0.7, 0.75),   // 色點描邊（textPrimary）
  pressedFill: 0.08, // 按住卡片／選單項目（accent）
  scrim: 0.3,        // 選單、表單後面的暗幕（黑）
  toastBg: 0.94,
};

function rgba(hex: string, a: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export type Colors = {
  page: string; surface: string; separator: string;
  textPrimary: string; textSecondary: string; textMuted: string; textAddRow: string; textOnSwipe: string;
  accent: string; danger: string;
  swipeStrikeBg: string; swipeDeleteBg: string; pressedFill: string; scrim: string;
  toastBg: string; toastText: string; toastAction: string;
  dotOutline: string; fabIcon: string;
  mode: Mode;
};
const cache: Partial<Record<Mode, Colors>> = {};
export function colors(mode: Mode): Colors {
  return cache[mode] ??= {
    page: COLOR.page[mode], surface: COLOR.surface[mode], separator: COLOR.separator[mode],
    textPrimary: COLOR.textPrimary[mode], textSecondary: COLOR.textSecondary[mode],
    textMuted: rgba(COLOR.textPrimary[mode], ALPHA.textMuted[mode]),
    textAddRow: rgba(COLOR.textPrimary[mode], ALPHA.textAddRow[mode]),
    textOnSwipe: COLOR.textOnSwipe[mode],
    accent: COLOR.accent[mode], danger: COLOR.danger[mode],
    swipeStrikeBg: COLOR.swipeStrikeBg[mode], swipeDeleteBg: COLOR.swipeDeleteBg[mode],
    pressedFill: rgba(COLOR.accent[mode], ALPHA.pressedFill),
    scrim: rgba(P.black, ALPHA.scrim),
    toastBg: rgba(COLOR.toastBg[mode], ALPHA.toastBg), toastText: COLOR.toastText[mode], toastAction: COLOR.toastAction[mode],
    dotOutline: rgba(COLOR.textPrimary[mode], ALPHA.dotOutline[mode]),
    fabIcon: COLOR.fabIcon[mode],
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
  body:         { fontSize: 17, fontWeight: '400' as const }, // Body；每一行、首頁清單名稱、選單項目
  bodyLine:     { fontSize: 17, lineHeight: 27 },             // 每一行的字（行高 1.6）
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
  shadowSoft:   { shadowColor: P.shadowInk, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }, // 圓鈕、膠囊、⋯ 選單
  shadowStrong: { shadowColor: P.shadowInk, shadowOpacity: 0.3,  shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }, // 右下 ＋
};

/* ---------- 動態：事件命名，毫秒。reduced＝減少動態時的替代（淡入淡出或不移動），不是關掉 ---------- */
export const motion = {
  strikeReturn:  { duration: 150, reducedFade: 150 }, // 減少動態：卡片不滑回，整行 150ms 淡回
  deleteSlide:   { duration: 180, reducedFade: 150 }, // 減少動態：卡片不滑出，整行 150ms 淡出
  snapBack:      { duration: 180 },                   // 減少動態：直接回位
  dragShift:     { duration: 150 },                   // 減少動態：其他行直接讓位
  keyboardFollow: { duration: 250, easing: [0.17, 0.59, 0.4, 0.77] as const }, // 跟系統鍵盤（有給時長就用鍵盤的）
  fade:          150, // toast、確認框、減少動態時所有滑入／放大的替代
  sheetSlide:    { in: 220, out: 180 },
  sheetBackdrop: { in: 180, out: 180 },
  menuPop:       { in: 170, out: 120 },
  menuBackdrop:  { in: 160, out: 140 },
  pressDim:      0.6, // 所有按住效果統一：透明度
  reducedDimFrom: 0.4, // 減少動態：劃掉時整行先降到這個透明度再淡回 1
};

/* ---------- 觸覺：一種事件一種觸覺 ---------- */
const HAPTIC = { strike: Haptics.selectionAsync, dragStart: Haptics.selectionAsync };
export function haptic(event: keyof typeof HAPTIC) { HAPTIC[event]().catch(() => {}); }

/* ---------- 非動畫的門檻與時間 ---------- */
// 只放純數字：滑動手勢在 UI 執行緒（worklet）裡算，從那裡呼叫一般 JS 函式會讓 app 直接崩潰（真機才會，網頁預覽看不出來）
export const gesture = {
  swipeActivate: 14, swipeFailY: 12,
  strikeMax: 90, strikeRatio: 0.25,  // 往右滑超過 min(90, 寬 × 25%) 放手算劃掉
  deleteMax: 110, deleteRatio: 0.3,  // 往左滑超過 min(110, 寬 × 30%) 放手算刪除
  dragActivate: 1,
};
export const timing = { toastStay: 3500, saveDebounce: 250, blurCleanup: 120, freshFocusFallback: 700 };

export const T = { font, space, shape, motion, gesture, timing };

/* ---------- 筆記色票：內容色，不是介面色。不當文字色、不當按鈕色。key 不能改（存檔格式） ---------- */
// bg 整頁底與標題列底；hd 色點、色塊；rule 行卡片框線。深色候選＝hd 混深底（bg 30%、rule 45%）
export const NOTE_KEYS = ['purple', 'yellow', 'orange', 'red', 'blue', 'green', 'gray', 'black', 'white'] as const;
export type NoteKey = (typeof NOTE_KEYS)[number];
const NOTES: Record<NoteKey, { bg: Four; hd: string; rule: Four }> = {
  purple: { bg: four('#F2E8EC', '#4A3A50', '#F2E8EC', '#45364B'), hd: '#A985AE', rule: four('#DDCAD8', '#5E4A64', '#DDCAD8', '#5A4760') },
  yellow: { bg: four('#FAF0D2', '#5D4D3A', '#FAF0D2', '#584936'), hd: '#E8C468', rule: four('#EEDDA6', '#7B6644', '#EEDDA6', '#776340') },
  orange: { bg: four('#FBE6D3', '#5D3F37', '#FBE6D3', '#583A32'), hd: '#E8945C', rule: four('#F0C7A4', '#7B513F', '#F0C7A4', '#774E3B') },
  red:    { bg: four('#F8E0D8', '#58373C', '#F8E0D8', '#533337'), hd: '#D97C6C', rule: four('#EBBBAE', '#744646', '#EBBBAE', '#704342') },
  blue:   { bg: four('#E7E8F0', '#424157', '#E7E8F0', '#3D3C52'), hd: '#8E9BC6', rule: four('#C7CBE0', '#52546F', '#C7CBE0', '#4E516B') },
  green:  { bg: four('#EBEED9', '#46473B', '#EBEED9', '#414236'), hd: '#9DAF6A', rule: four('#CED8AE', '#595D45', '#CED8AE', '#555A41') },
  gray:   { bg: four('#F2EADF', '#504546', '#F2EADF', '#4C4041'), hd: '#BFA88E', rule: four('#DDCFBD', '#685A55', '#DDCFBD', '#645752') },
  black:  { bg: four('#E0D8D6', '#2E2532', '#E0D8D6', '#2A212D'), hd: '#4E3F4C', rule: four('#C8BEBC', '#352B38', '#C8BEBC', '#312734') },
  white:  { bg: four('#FFFCF6', '#5E565A', '#FFFCF6', '#595255'), hd: '#EDE3D2', rule: four('#EFE6D8', '#7D7474', '#EFE6D8', '#797170') },
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

// 目錄面板（B3，多米 2026-11-01 晚（二）定）：自己做的面板，取代系統 formSheet。
// 2026-11-02 晚改（多米選甲「Safari 式底部列」）：從螢幕**下面**升上來（開它的手勢在紙底部的 PageBar 往上滑，方向一致），
// 上面留一截看得到後面的紙。開：底部列往上滑（跟著手指）或點、行的「搬到…」。收：點上面露出的那截紙、把面板頂端把手往下拉、點一塊磚。
// 面板裡的東西畫在一層蓋滿整個螢幕的容器裡（全開時容器的座標＝螢幕座標，拖曳、資料夾框的量法都不用換算），面板的底色另外畫一塊。
// 裡面：搜尋、新的一張、色磚、最近刪除、搬行模式（原本 src/app/directory.tsx 整段搬過來）。
// C1（2026-11-02）：磚照座位表（State.order）排，改字不換位、新的一張排最後；「已釘選／其他」兩段拿掉，釘選的磚右上角一個圖釘。
// C3：放不下往右一頁、頁點。C4：長按一塊磚跳選單（顏色、改名字、刪除、編輯目錄），長按後一拖就進抖動、同一頁裡拖換位置；
// 抖動時面板不收（往上推、點露出的紙只會結束抖動），點磚不換紙、不能搜尋、不能翻頁。
// 面板跟紙在同一個畫面（index）裡，紙那邊的手勢才能逐格推它；開到多開由 dirPanel.p（0＝收起、1＝全開）決定。
// D4（2026-11-02 晚，多米選照 iOS 三件）：拖曳改用螢幕座標，目錄的磚和資料夾裡的磚共用一套（useDragPan）：拖到資料夾磚上停一下會打開、
// 放進裡面指定位置；從資料夾拖出框停一下資料夾收起，紙還在手上，放到目錄任一格；資料夾裡換順序。浮起那塊畫在目錄最上層（DragGhost）。
// 2026-11-02 晚（多米真機回報，照 Apple iPhone 使用手冊，見 .uiux/iOS主畫面編輯-官方規範對照.md）：按住格子空白處＝進抖動、抖動中點空白處＝結束；
// 抖動中點資料夾會打開，裡面的紙跟著抖、直接拖；資料夾裡的紙長按選單不再有「移出資料夾」（只用拖的，VoiceOver 動作留著）。
// D3：打開的資料夾裡長按一張後拖，拖出框外放手＝移出資料夾（排在資料夾後面一格，多米選），在框裡放手滑回原位。
// D2：抖動中拖一張停在別張磚正中間半秒＝疊成資料夾（疊在資料夾上＝放進去）；為了到得了正中間，讓位改成停在邊邊或空隙 0.2 秒才讓（多米選照 iOS）。
// D1（2026-11-02）：資料夾。長按紙磚「放進資料夾…」；資料夾磚（名字＋裡面紙的小色塊）跟紙磚一起排、一起拖；點開在目錄上面打開一個框，
// 點名字改名；資料夾裡的紙長按「移出資料夾」。資料夾裡不能拖（D3）
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  FlatList, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
  type AccessibilityActionEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance,
} from 'react-native';
import { GestureDetector, useExclusiveGestures, useLongPressGesture, usePanGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation, Easing, LinearTransition, makeMutable, scrollTo, useAnimatedRef, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
  type AnimatedRef, type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import {
  col, dropNotes, FULL_MSG, fillHole, folderOf, intoFolder, isBreak, isEmpty, isHole, label, leaveHole, markDeleted, markRestored, moveItem, newBreak, newFolder, newHole, outOfFolder, PIN_MAX, pinnedNotes, placeInFolder,
  placeTop, renameFolder, reseat, roomOf, searchLines, seatNew, setGlyph, glyphOf, glyphProblem, seatedEntries, seatedLayout, seatedNotes, type ColorKey, type Entry, type LineHit, type Folder, type Note,
} from '../lib/model';
import { newNote, store, useStore } from '../lib/store';
import { haptic, T, useColors, useNoteColors } from '../lib/tokens';
import type { Act } from './Acts';
import { Empty } from './Empty';
import { Glass, useCanBlur, useSurface } from './Glass';
import { ui } from './Overlay';
import { togglePin } from './pin';
import { PopMenu } from './PopMenu';
import { Swatches } from './Swatches';
import { Sym } from './Sym';

const M = T.motion, G = T.gesture;
// useAnimatedStyle 的相依陣列只有網頁用得到，iOS 上傳了會一直跳警告（同 Paper）
const WEB_DEPS = Platform.OS === 'web';
// 拖磚時其他磚讓位滑過去（C4）
const TILE_MOVE = LinearTransition.duration(M.tileShift.duration);
// 給手勢（UI 執行緒）呼叫的放模組層級（規矩檔：worklet 裡不准直接叫 tokens 的函式）
const hapticLand = () => haptic('dragDrop');
// 格子裡第 k 格的左上角（兩欄，磚高 TILE、間距 GAP），與拖到哪一格：看被拖那塊的中心落在哪一格
const GAP = T.space.m, EDGE = T.gesture.edgeZone, PRESS_DIM = T.motion.pressDim; // worklet 只抓數字，不抓整個 T（裡面有函式）
// 1×1 的磚（2026-11-03 多米，照 iPhone 主畫面；規格見 .uiux/iOS主畫面編輯-官方規範對照.md 第十一節）：目錄一排 COLS 欄、打開的資料夾 FCOLS 欄。
// 一格＝欄寬 cw：方磚在格子上面置中（邊長 sizeOf(cw)），名字在方磚下面；格子的左上角就是那塊磚（方磚＋名字）的左上角
const COLS = T.shape.gridCols, FCOLS = T.shape.folderCols;
const TILE_MAX = T.shape.tileMax, TILE_GAP = T.shape.tileGapMin, LABEL_GAP = T.shape.tileLabelGap, LABEL_H = T.shape.tileLabelH, ROW_GAP = T.shape.tileRowGap;
const RADIUS = T.shape.tileRadiusRatio;
function sizeOf(cw: number) { 'worklet'; return Math.min(TILE_MAX, cw - TILE_GAP); } // 方磚邊長
function tileHOf(cw: number) { 'worklet'; return sizeOf(cw) + LABEL_GAP + LABEL_H; } // 一塊磚（方磚＋名字）的高
function rowOf(cw: number) { 'worklet'; return tileHOf(cw) + ROW_GAP; } // 列距
const GROW = T.motion.stackTarget.scale;
// 疊還是換（2026-11-04 照量到的 iPhone）：上下對齊就疊，見 tokens 的 gesture.stackY
const STACK_Y = G.stackY, STACK_Y_HOLD = G.stackYHold, STACK_FAR = G.stackFar, STACK_FAR_HOLD = G.stackFarHold, CATCH_MS = M.dragCatch.duration;
const CUE_MS = M.stackTarget.cue, CUE_DIM = M.stackTarget.dim, PLATE = M.stackTarget.plate;
const SINK_MS = M.sink.duration, SINK_SCALE = M.sink.scale;
// 打開的資料夾：一頁 FCOLS 欄 × FROWS 列；框內距 FPAD（磚離框邊）
const FROWS = T.shape.folderRows, FPER = FROWS * FCOLS, FPAD = T.space.l;
// 彈簧設定抄一份自己的：被抓進 worklet 的物件會被鎖住，不讓 tokens 裡的 M、G 被鎖（規矩檔 2026-11-02）
const LIFT_SPRING = { ...M.dragLift.spring }, LAND_SPRING = { ...M.dragLand.spring };
const HOLD_SCALE = M.tileHold.scale; // 抖動中按住、拿著拖的磚放大的比例（2026-11-03 多米：按住要看得出來）
const PULL_CLOSE = G.pushCloseRatio, FLICK = G.flick;
const HELD_SQ = G.tileDragHeld * G.tileDragHeld; // 長按後要拖超過 tileDragHeld 才拿起（比距離的平方，worklet 裡不開根號）
const MENU_LIFT = M.menuLift.scale; // 長按選單時那塊浮起來放大的比例
// 抖動中在空白處撥翻頁（PageBack）：跟清單左右撥換張同一組門檻（撥過半頁或甩一下就翻、到頭只跟三成）
const TURN_RATIO = G.pageTurnRatio, TURN_FLICK = G.swapFlick, EDGE_FOLLOW = G.swapEdge;
// 第 k 格的左上角（相對格子左上角）：cw＝欄寬、cols＝一排幾欄（沒給＝目錄的 COLS）。
// 預設值不能寫在參數上（cols = COLS）：worklet 不會把參數預設值用到的外面變數帶到 UI 執行緒，真機一拖就「Property 'COLS' doesn't exist」閃退（多米 2026-11-03）
function slotX(k: number, cw: number, cols?: number) { 'worklet'; return (k % (cols ?? COLS)) * cw; }
function slotY(k: number, cw: number, cols?: number) { 'worklet'; return Math.floor(k / (cols ?? COLS)) * rowOf(cw); }
// 一個點（相對格子左上角）落在第幾格（D4 起拖曳都用螢幕座標算）；在格子上面、左邊回 −1
function cellAt(lx: number, ly: number, cw: number, cols?: number) {
  'worklet';
  const n = cols ?? COLS;
  if (ly < 0 || lx < 0) return -1;
  return Math.floor(ly / rowOf(cw)) * n + Math.min(n - 1, Math.floor(lx / cw));
}
// 這頁第 k 格是不是空位（holes 是位元表：第 k 格是空位，第 k 位就是 1）。位元運算是 32 位元，只記得前 HOLE_BITS 格，手機一頁不會那麼多格
const HOLE_BITS = 31;
function holeAt(holes: number, k: number) {
  'worklet';
  return k >= 0 && k < HOLE_BITS && ((holes >> k) & 1) === 1;
}

// 拖曳共用的 shared value（D4）。座標都是目錄的座標＝螢幕座標（面板從螢幕頂端開始，全開時沒有位移）：
// x0、y0＝浮起那塊拿起時的左上角；dx、dy＝手指移了多少；sw＝浮起那塊的寬；edge＝在不在左右邊緣；aim＝瞄著哪（見 aimOf）；stackK＝準備疊到這頁第幾格；
// gx、gy＝這頁格子的左上角；gcount＝這頁幾格；glast＝讓出來的那格在這頁第幾格（−1＝不在這頁）；
// fopen＝資料夾開著在對準；bx…bh＝資料夾框；svx、svy＝框裡格子那層的位置；fsy＝框裡捲下去多少；fcount、flast＝資料夾裡幾格、讓出來的是第幾格；
// ready＝這次拿起後 JS 把格子位置、資料夾開沒開寫好了（拿起那一刻手勢先跑、JS 晚一步，寫好之前不算瞄哪）；
// gcap＝這頁最多幾格；fold＝拖的是資料夾（不能疊）；fpg＝打開的資料夾現在在第幾頁；fedge＝在資料夾框的左右邊（停一下翻頁）；
// sink＝疊上去放手時縮小淡掉（0→1）（2026-11-02）；holes＝這頁哪幾格是空位（位元表，見 holeAt；2026-11-03 自由擺放）；
// cx、cy＝拿起時磚補上手指的那段（lift 動到 0，磚畫在 dx＋cx 的位置）；gbase＝拖的那張拿起時在這頁第幾格（−1＝不在這頁）：那格現在站的是被換過去的那張，停回來是復原，不算疊
type DG = Record<'x0' | 'y0' | 'dx' | 'dy' | 'sw' | 'lift' | 'edge' | 'aim' | 'stackK' | 'gx' | 'gy' | 'gcount' | 'glast' | 'gcap' | 'fold'
  | 'fopen' | 'bx' | 'by' | 'bw' | 'bh' | 'fpg' | 'fedge' | 'fcount' | 'flast' | 'ready' | 'sink' | 'holes' | 'gbase' | 'cx' | 'cy', SharedValue<number>>;
function useDG(): DG {
  return {
    cx: useSharedValue(0), cy: useSharedValue(0), gbase: useSharedValue(-1), gcap: useSharedValue(1), fold: useSharedValue(0), fpg: useSharedValue(0), fedge: useSharedValue(0), sink: useSharedValue(0), holes: useSharedValue(0),
    x0: useSharedValue(0), y0: useSharedValue(0), dx: useSharedValue(0), dy: useSharedValue(0), sw: useSharedValue(0), lift: useSharedValue(0),
    edge: useSharedValue(0), aim: useSharedValue(0), stackK: useSharedValue(-1), gx: useSharedValue(0), gy: useSharedValue(0),
    gcount: useSharedValue(1), glast: useSharedValue(-1), fopen: useSharedValue(0), bx: useSharedValue(0), by: useSharedValue(0),
    bw: useSharedValue(0), bh: useSharedValue(0), fcount: useSharedValue(1), flast: useSharedValue(0), ready: useSharedValue(0),
  };
}
// aim 的編碼（2026-11-03 改成看中心落在哪格）：k≥0＝跟這頁第 k 格那張互換（手慢下來才換）；PAST_AIM＋k＝推過第 k 格那張的中心，馬上換；−k−1＝準備疊到第 k 格那張；CELL_AIM−k＝放進這頁第 k 格的空格
// （空位，或最後一張後面、這頁還放得下的格子；2026-11-03 自由擺放，取代原本的「排到最後」）；
// FOLDER_AIM＋i＝跟資料夾裡第 i 張互換；FOLDER_END＝資料夾這頁的空格（排到最後）；AIM_OUT＝資料夾開著、手指在框外（停一下收起）；
// AIM_NONE＝什麼都不做（落在自己那格、格子外面、還沒量好）
const PAST_AIM = 200000, FOLDER_AIM = 100000, AIM_OUT = -100000, AIM_NONE = -200000, FOLDER_END = -400000, CELL_AIM = -500000;
// 打開的資料夾裡第 i 張的左上角（螢幕座標，扣掉翻到第幾頁）
function folderSlot(i: number, dg: DG, fw: number) {
  'worklet';
  const kk = i - dg.fpg.value * FPER;
  return [dg.bx.value + FPAD + slotX(kk, fw, FCOLS), dg.by.value + FPAD + slotY(kk, fw, FCOLS)];
}
// 拖著那塊左上角在 (ax, ay)、手指在 (fx, fy)，瞄著哪：看方磚的中心落在哪一格（2026-11-03 改 1×1，照 iPhone）。
// gw、fw＝目錄、資料夾的欄寬（拖著那塊的寬 dg.sw 就是它拿起那裡的欄寬）
function aimOf(ax: number, ay: number, dg: DG, gw: number, fw: number, fx: number, fy: number) {
  'worklet';
  const cx = ax + dg.sw.value / 2, cy = ay + sizeOf(dg.sw.value) / 2;
  if (dg.fopen.value) {
    if (!dg.bw.value) return AIM_NONE;
    // 出框（停 folderLeave 就收起、拿出資料夾）看手指，跟翻資料夾頁（手指到框的左右邊）同一個基準（2026-11-03 多米真機：跨頁搬被搬到外面去）。
    // 之前出框看磚的中心：抓著磚的右半邊往左拖，手指才到框邊、中心已經出框，出框 350 毫秒比翻頁 600 毫秒先到，資料夾收起、那張被拿出去。
    // 框離螢幕左右各 16、外面再寬 GAP 才算出框：左右翻頁區整個在框內這一側，要拿出來是往框的上面或下面拖（照 iOS 檔案夾）
    const inBox = fx >= dg.bx.value - GAP && fx <= dg.bx.value + dg.bw.value + GAP && fy >= dg.by.value - GAP && fy <= dg.by.value + dg.bh.value + GAP;
    if (!inBox) return AIM_OUT;
    // 資料夾裡不能疊：中心落在哪格就跟那格互換；落在最後一張後面的空格＝排到最後
    const first = dg.fpg.value * FPER;
    const kk = cellAt(cx - dg.bx.value - FPAD, cy - dg.by.value - FPAD, fw, FCOLS);
    if (kk < 0 || kk >= FPER) return AIM_NONE;
    const i = first + kk;
    if (i >= dg.fcount.value) return FOLDER_END;
    return i === dg.flast.value ? AIM_NONE : FOLDER_AIM + i;
  }
  // 看中心離哪一列的方磚最近（2026-11-04）：方磚上下的空隙各半，上面那段也算這一格
  const s = sizeOf(gw), lx = cx - dg.gx.value, row = Math.round((cy - dg.gy.value - s / 2) / rowOf(gw));
  const c = row < 0 || lx < 0 ? -1 : row * COLS + Math.min(COLS - 1, Math.floor(lx / gw));
  if (c < 0 || c === dg.glast.value) return AIM_NONE;
  // 中心落在空格（這頁的空位，或最後一張後面、這頁還放得下的格子）：放進那格（2026-11-03 自由擺放，照 iOS 放哪停哪）
  if (c < dg.gcount.value ? holeAt(dg.holes.value, c) : c < dg.gcap.value) return CELL_AIM - c;
  if (c >= dg.gcount.value) return AIM_NONE;
  // 落在有東西的格子（2026-11-04 照多米錄的真機主畫面）：看「前進的方向」，從磚現在站的那格往這格。還沒推過對方中心太遠、也沒偏太多＝準備疊；
  // 推過中心約三分之一塊磚＝馬上互換，手不用停（PAST_AIM）；偏太多（從旁邊錯開經過）＝手慢下來才互換。上下左右都一樣。已經準備疊了就放寬，手晃一下不會丟掉。
  // 拿起那格站的是被換過去的那張，停回來是復原，不算疊。拖的是資料夾不能疊
  const dx = cx - (dg.gx.value + slotX(c, gw) + gw / 2), dy = cy - (dg.gy.value + slotY(c, gw) + s / 2);
  const on = dg.aim.value === -c - 1, last = dg.glast.value;
  const vx = last >= 0 ? slotX(c, gw) - slotX(last, gw) : 0, vy = last >= 0 ? slotY(c, gw) - slotY(last, gw) : 0, len = Math.hypot(vx, vy);
  const along = len ? (dx * vx + dy * vy) / len : 0, across = len ? Math.abs(dx * vy - dy * vx) / len : Math.max(Math.abs(dx), Math.abs(dy));
  if (c === dg.gbase.value) return c;
  if (across >= (on ? STACK_Y_HOLD : STACK_Y) * s) return c;
  if (along >= (on ? STACK_FAR_HOLD : STACK_FAR) * s) return PAST_AIM + c;
  return dg.fold.value ? c : -c - 1;
}

// 目錄的磚、資料夾裡的磚共用的拖（D4）：長按後一拖（抖動中直接拖）拿起來；手指每動一格算一次瞄著哪，變了才回 JS 計時讓位／疊／開關資料夾；
// 放手滑進要放的那格再回 JS 改資料（資料夾開著但手指在框外就不滑，交給 JS）。減少動態：直接到位
type DragOpts = {
  enabled: boolean; editing: boolean; w: number; screenW: number; gw: number; fw: number; calm: boolean; dg: DG;
  held: SharedValue<number>; // 這塊磚按住了沒（0～1，磚自己畫放大、收起「−」用）
  onStart: () => void; onAim: (a: number) => void; onEdge: (z: number) => void; onDrop: () => void;
};
function useDragPan(o: DragOpts) {
  const { dg, held, w, screenW, gw, fw, calm, editing, onStart, onAim, onEdge, onDrop } = o; // worklet 只抓拆出來的值，不抓整包 o
  // 長按到了、還沒拖夠遠（armed）：選單開著，手指再拖 tileDragHeld 才拿起來（2026-11-03 多米真機：長按選單一跳就變拖，前一版改 minDistance 沒用）。
  // 為什麼不能靠 minDistance：iOS 的 activateAfterLongPress 時間一到拖曳就直接啟動、完全不看移動距離（RNGH apple/Handlers/RNPanHandler.m），
  // 所以「長按後再拖多遠才拿起」只能自己在 onUpdate 算。網頁版長按也是時間到就啟動，兩邊一樣
  const armed = useSharedValue(0);
  // 拿起來：記下磚的左上角（螢幕座標）、歸零這次拖的狀態、浮起，回 JS 寫格子位置（dragStart）
  const bx = useSharedValue(0), by = useSharedValue(0); // 手指按下的位置：磚跟手指，不跟 translation（iOS 的 translation 從手勢啟動才算，磚會一直落後手指）
  const lift = (e: { absoluteX: number; absoluteY: number; x: number; y: number }) => {
    'worklet';
    dg.x0.value = e.absoluteX - e.x; dg.y0.value = e.absoluteY - e.y; dg.sw.value = w;
    // 手指已經走了一段才拿起：磚從原位用很短的動畫補上，不跳一下（減少動態：直接到）
    const fx = e.absoluteX - bx.value, fy = e.absoluteY - by.value;
    dg.dx.value = fx; dg.dy.value = fy;
    dg.cx.value = -fx; dg.cy.value = -fy;
    dg.cx.value = calm ? 0 : withTiming(0, { duration: CATCH_MS }); dg.cy.value = calm ? 0 : withTiming(0, { duration: CATCH_MS });
    dg.edge.value = 0; dg.fedge.value = 0; dg.aim.value = AIM_NONE; dg.stackK.value = -1; dg.ready.value = 0; dg.sink.value = 0;
    // 抖動中手指一按下磚就放大了（held）：拿起來那張從一樣大接著浮，不會先縮回去再長大
    if (!calm) dg.lift.value = held.value;
    dg.lift.value = calm ? 1 : withSpring(1, LIFT_SPRING);
    scheduleOnRN(onStart);
  };
  return usePanGesture({
    enabled: o.enabled,
    // 抖動中不等長按：不給這個值（不是給 0——iOS 上 0＝延遲 0 秒、手指一碰就啟動，抖動中點資料夾永遠變成拖；網頁的 0 才是「不等」）。
    // 沒給值的欄位不會傳到 iOS，iOS 換設定時先全部清回預設，所以從長按模式切進抖動不會留著舊的長按時間
    activateAfterLongPress: editing ? undefined : G.longPressMs,
    // 抖動中手指移超過 tileDragEdit 才拿起（點一下的容許也是這個數，晃幾點還是點）；沒抖動時這個值不起作用（見上面 armed）
    minDistance: G.tileDragEdit,
    // 抖動中手指一按下就放大、左上的「−」收起（2026-11-03 多米真機：按住沒動畫，不知道按到了沒；資料夾裡的磚也是按住那張才變）；
    // 拖著照樣大、沒有「−」（畫的是浮著那張，見 DragGhost），放手才縮回、「−」回來。
    // 沒抖動時長按是跳選單，選單那塊自己會浮起（Lifted），這裡不動
    onBegin: e => {
      'worklet';
      bx.value = e.absoluteX; by.value = e.absoluteY;
      if (editing) held.value = calm ? 1 : withSpring(1, LIFT_SPRING);
    },
    onFinalize: () => {
      'worklet';
      held.value = calm ? 0 : withSpring(0, LIFT_SPRING);
    },
    onActivate: e => {
      'worklet';
      // 長按到了（沒抖動）：先只開選單，等手指拖夠遠；抖動中是拖過 tileDragEdit 才啟動的，直接拿起
      armed.value = editing ? 0 : 1;
      if (!armed.value) lift(e);
    },
    onUpdate: e => {
      'worklet';
      if (armed.value) {
        if (e.translationX * e.translationX + e.translationY * e.translationY < HELD_SQ) return;
        armed.value = 0;
        lift(e);
      }
      const tx = e.absoluteX - bx.value, ty = e.absoluteY - by.value;
      dg.dx.value = tx; dg.dy.value = ty;
      // JS 還沒把這次的格子位置、資料夾開沒開寫好（dragStart → setD）：只跟手，不算邊緣和瞄哪。
      // 不然用的是上一次拖留下的值：資料夾裡拿起時被當成在目錄某一格，稍微一動放手就被拿出資料夾（多米 2026-11-02 真機記錄 aim:0、fopen:1）
      if (!dg.ready.value) return;
      const ax = dg.x0.value + tx, ay = dg.y0.value + ty;
      // 拖到左右邊緣停一下翻頁（C5）：資料夾開著的時候看框的左右邊（翻資料夾的頁，2026-11-02），框外是收起資料夾。
      // 看的是手指，不是磚的中心（2026-11-03 多米真機：拖不到隔壁頁）：磚很寬，抓著右半邊往右拖，手指到螢幕邊了磚的中心還差五十幾點，永遠到不了邊緣
      const fx = e.absoluteX, fy = e.absoluteY;
      const z = dg.fopen.value ? 0 : fx < EDGE ? -1 : fx > screenW - EDGE ? 1 : 0;
      if (z !== dg.edge.value) { dg.edge.value = z; scheduleOnRN(onEdge, z); }
      // 資料夾框的上下也看手指（跟 aimOf 的出框同一個基準）
      const inBoxY = fy >= dg.by.value && fy <= dg.by.value + dg.bh.value;
      const fz = !dg.fopen.value || !dg.bw.value || !inBoxY ? 0
        : fx < dg.bx.value + EDGE && fx >= dg.bx.value - GAP ? -1 : fx > dg.bx.value + dg.bw.value - EDGE && fx <= dg.bx.value + dg.bw.value + GAP ? 1 : 0;
      if (fz !== dg.fedge.value) { dg.fedge.value = fz; scheduleOnRN(onEdge, fz * 2); }
      const a = aimOf(ax, ay, dg, gw, fw, fx, fy);
      if (a === dg.aim.value) return;
      dg.aim.value = a;
      scheduleOnRN(onAim, a);
    },
    onDeactivate: e => {
      'worklet';
      if (armed.value) { armed.value = 0; return; } // 長按了沒拖：只開了選單，磚沒拿起來，什麼都不動
      // 還在補的時候放手：從畫面上的位置接著滑
      dg.dx.value += dg.cx.value; dg.dy.value += dg.cy.value; dg.cx.value = 0; dg.cy.value = 0;
      if (dg.edge.value || dg.fedge.value) { dg.edge.value = 0; dg.fedge.value = 0; scheduleOnRN(onEdge, 0); }
      scheduleOnRN(hapticLand);
      dg.lift.value = calm ? 0 : withSpring(0, LIFT_SPRING);
      // 格子位置還沒寫好就放手（剛拿起馬上放）：不滑，交給 JS 原地放回
      let tx = 0, ty = 0, slide = !!dg.ready.value;
      if (slide && dg.fopen.value) {
        // 資料夾裡：滑到讓出來那格（在現在這頁才滑）
        const kk = dg.flast.value - dg.fpg.value * FPER;
        if (dg.aim.value !== AIM_OUT && kk >= 0 && kk < FPER) { const p = folderSlot(dg.flast.value, dg, fw); tx = p[0]; ty = p[1]; }
        else slide = false;
      } else if (slide) {
        const k = dg.stackK.value >= 0 ? dg.stackK.value : dg.glast.value;
        if (k < 0) slide = false;
        else { tx = dg.gx.value + slotX(k, gw); ty = dg.gy.value + slotY(k, gw); }
      }
      if (!slide || calm) { scheduleOnRN(onDrop); return; }
      // 疊上去（照 iOS）：滑到底下那張上面，同時縮小淡掉
      if (dg.stackK.value >= 0) dg.sink.value = withTiming(1, { duration: SINK_MS });
      dg.dx.value = withSpring(tx - dg.x0.value, { velocity: e.velocityX, ...LAND_SPRING });
      dg.dy.value = withSpring(ty - dg.y0.value, { velocity: e.velocityY, ...LAND_SPRING }, () => scheduleOnRN(onDrop));
    },
  });
}

let host: { begin: (move?: string) => void; settle: (open: boolean, velocity?: number, then?: () => void, fade?: boolean) => void } | null = null;
export const dirPanel = {
  p: makeMutable(0), // 0＝收起、1＝全開。紙的標題區往下拉時在 UI 執行緒逐格寫
  h: makeMutable(1), // 面板高度（螢幕高 − dirPeek），拉的距離除以它就是 p
  calm: makeMutable(false), // 減少動態：面板不滑，改淡入淡出（紙那邊放手時要知道）
  fade: makeMutable(0), // 1＝這次收起用淡出不往上滑（2026-11-02：點一張從磚放大打開，鋪滿之後面板淡出露出那張紙）
  // 準備打開：掛上內容、收鍵盤、告訴 store 面板開著（控制中心「記一行」、新的一張的輸入框都等它收完）
  begin: (move?: string) => host?.begin(move),
  // 放手或點了之後：彈到全開或收起。velocity 是手指放開的速度換成 p 的單位
  settle: (open: boolean, velocity?: number, then?: () => void) => host?.settle(open, velocity, then),
  open: (move?: string) => { host?.begin(move); host?.settle(true); },
  close: (then?: () => void, fade?: boolean) => host?.settle(false, 0, then, fade),
};

export function DirPanelHost() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const calm = useReducedMotion();
  const [shown, setShown] = useState(false);
  const [move, setMove] = useState<string | undefined>();
  const [open, setOpen] = useState(false); // 停在全開（點露出的那截才收得起來；拉到一半不算）
  const [editing, setEditing] = useState(false); // 抖動中（C4）
  const H = height - T.shape.dirPeek;
  const { p } = dirPanel;

  useEffect(() => { dirPanel.h.value = H; }, [H]);
  useEffect(() => { dirPanel.calm.value = calm; }, [calm]);

  useEffect(() => {
    host = {
      begin: m => {
        Keyboard.dismiss();
        dirPanel.fade.value = 0;
        setMove(m);
        setShown(true);
        store.panelOpened();
      },
      settle: (toOpen, velocity = 0, then, fade) => {
        if (!toOpen) { Keyboard.dismiss(); setOpen(false); }
        const done = () => {
          if (toOpen) { setOpen(true); return; }
          setShown(false); setMove(undefined); setEditing(false);
          if (store.panelOpen) store.panelClosed();
          then?.();
        };
        const target = toOpen ? 1 : 0;
        if (fade && !toOpen) dirPanel.fade.value = 1;
        p.value = calm || (fade && !toOpen) ? withTiming(target, { duration: M.dirPanel.reducedFade }, f => { if (f) scheduleOnRN(done); })
          : withSpring(target, { velocity, ...M.dirPanel.spring }, f => { if (f) scheduleOnRN(done); });
      },
    };
    return () => { host = null; };
  }, [calm, p]);

  // 面板頂端把手往下拉：跟著手指收下去，拉過一段或往下甩就收起，不然彈回全開。抖動中關掉（C4，審查紀錄 ❓5）
  const { h } = dirPanel;
  const settle = (toOpen: boolean, v: number) => dirPanel.settle(toOpen, v);
  // 目錄的長按選單開著：把手那截也被暗幕蓋住，點了只收選單、也不能拉（2026-11-02）
  const [closeMenu, setCloseMenu] = useState<(() => void) | null>(null);
  const pull = usePanGesture({
    enabled: !editing && !closeMenu,
    activeOffsetY: [-G.pullActivate, G.pullActivate],
    onUpdate: e => { 'worklet'; p.value = Math.min(1, Math.max(0, 1 - e.translationY / h.value)); },
    onDeactivate: e => {
      'worklet';
      const shut = e.translationY > h.value * PULL_CLOSE || e.velocityY > FLICK;
      scheduleOnRN(settle, !shut, -e.velocityY / h.value);
    },
  });
  // 點露出的紙、點頂端把手：抖動中只結束抖動（跟 iOS 點桌布一樣），不收
  const tapOut = () => (closeMenu ? closeMenu() : editing ? setEditing(false) : dirPanel.close());

  const { fade } = dirPanel;
  const sheet = useAnimatedStyle(() => (calm || fade.value
    ? { opacity: p.value, transform: [{ translateY: 0 }] }
    : { opacity: 1, transform: [{ translateY: H * (1 - p.value) }] }));
  const dim = useAnimatedStyle(() => ({ opacity: p.value }));

  if (!shown) return null;
  return (
    // 停在全開之前（正在拉、正在彈）整層不接觸控：手指還在底部列上拉，不能被蓋上來的暗幕或面板搶走
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'box-none' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, dim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={tapOut}
          accessibilityRole="button" accessibilityLabel={editing ? '完成編輯' : '收起目錄'} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, sheet]} pointerEvents="box-none" accessibilityViewIsModal onAccessibilityEscape={tapOut}>
        {/* 面板的底：上緣圓角，從 dirPeek 往下鋪到底（點到面板空白處不會穿過去收起） */}
        <View style={[st.panel, { top: T.shape.dirPeek, backgroundColor: c.surface }]} />
        {/* 把手排在目錄前面、順序永遠不變：目錄整塊是 box-none，把手那截沒有目錄的東西，點得到；選單的暗幕、打開的資料夾自然蓋在把手上面。
            不准再用 zIndex 切換兩者的先後：關選單時順序一換，Fabric 會把目錄整塊拆下來重裝，裡面的手勢當場被取消（2026-11-04 模擬器：跳出選單後接著拖，磚不跟手） */}
        <GestureDetector gesture={pull}>
          <Pressable style={[st.grabBox, { top: T.shape.dirPeek }]} onPress={tapOut} accessibilityRole="button" accessibilityLabel={editing ? '完成編輯' : '收起目錄'}>
            <View style={[st.grab, { backgroundColor: c.textSecondary }]} />
          </Pressable>
        </GestureDetector>
        <Directory move={move} padTop={T.shape.dirPeek + T.shape.hitMin} padBottom={insets.bottom} editing={editing} setEditing={setEditing}
          onMenuOpen={fn => setCloseMenu(() => fn)} />
      </Animated.View>
    </View>
  );
}

type DirProps = { move?: string; padTop: number; padBottom: number; editing: boolean; setEditing: (on: boolean) => void; onMenuOpen: (close: (() => void) | null) => void };

function Directory({ move, padTop, padBottom, editing, setEditing, onMenuOpen }: DirProps) {
  const s = useStore();
  const c = useColors();
  const calm = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const [q, setQ] = useState('');
  const searching = !!q.trim();

  // 多米 2026-11-01：排序選項與顏色篩選拿掉（太雜）；C1 起照座位表排，搜尋也照座位（審查紀錄 2026-11-01 晚、晚（三））
  const notes = seatedNotes(s, q);
  // D1：不搜尋時目錄最上層一格一格是紙或資料夾；搜尋時直接列紙（資料夾裡的也列）
  // 2026-11-02：不搜尋時用 seatedLayout（換頁標記照座位插進來；釘選的跟一般的一起排）
  const entries: Entry[] = searching ? notes.map(n => ({ id: n.id, note: n, notes: [n] })) : seatedLayout(s);
  // 最近刪除裡有幾項：刪掉的清單＋還在的紙刪掉的行（跟最近刪除頁的總數同一套）。
  // 以前只數清單：只刪過行時這一列不出現，刪掉的行進不去（F1 順手發現，2026-11-04）
  const trashed = s.notes.reduce((k, n) => k + (n.deleted ? 1 : n.bin.length), 0);
  // 兩欄：整頁左右各留 16，中間留 12
  // 欄寬（2026-11-03 改 1×1）：目錄一排 COLS 欄、左右各留 l；打開的資料夾一排 FCOLS 欄（框寬扣左右內距）
  const tileW = Math.floor((width - T.space.l * 2) / COLS); // 取整數：搬行模式的格子是自動換行排的，差一點小數就會被擠成一排三個
  // 打開的資料夾裡兩欄：框左右各留 l、框裡再留 l
  // 打開的資料夾跟目錄同一個欄寬（2026-11-03 照 iPhone：檔案夾裡的 App 跟主畫面一樣大、一樣的間距，框只包住 3 欄＋內距，不撐滿螢幕）
  const innerW = tileW;

  // 拖的那塊（C4、C5、D4）：id＝拖的紙或資料夾；src＝從哪個資料夾拿起（null＝目錄）；page＝現在看的那頁；inF＝現在對準哪個打開的資料夾（null＝對準目錄）；
  // fto＝資料夾裡讓出來那格；k0＝從資料夾拿起時在第幾格；forder＝拖的途中互換過之後，資料夾裡其他格的順序（互換：只有那兩張動，多米 2026-11-02）。
  // cells＝目錄這一排的格子表（2026-11-03 自由擺放，取代原本的 to、from、order、brk）：紙、資料夾、空位、換頁標記的 id 照格子排，拖的那張在 ME 那格。
  // 拖的那張永遠只佔一格：放到空格＝跟那個空位對調（原本那格變空位，別張不往前補，照 iOS）；放到別張上＝兩張對調（11/02 定的互換）；
  // 拖到最後一頁右邊緣＝原本那格變空位、最後面接換頁標記和這張（新的一頁）。從資料夾拿起、手指還在資料夾裡時是 null（目錄不多一格）。
  // home＝從格子拿起時在第幾頁：拖的那塊磚身上有手勢，換到別頁時不能跟著搬（搬了就重掛、手勢斷掉，放手沒反應），所以它一直留在這頁（藏起來、不佔位），
  // 別頁只畫一個空位（2026-11-02 網頁實測抓到：拖到別頁放手沒反應）
  type Drag = { id: string; src: string | null; page: number; cells: string[] | null; inF: string | null; fto: number; k0: number; home?: number; forder?: string[]; base?: string[] };
  // base＝拿起那一刻（或翻到這頁落下那一刻）的格子表。手上那張要放哪格、跟誰換，一律從 base 重算，不從上一次換完的樣子接著算
  // （2026-11-03 多米：每張待在自己的格子，沒跟它交互就不動）：拖著經過 B 再到 C，B 會回自己那格、只有 C 跟拿起那格對調；
  // 以前是接著換，C 被換到 B 原本那格、B 留在拿起那格，經過幾張就亂掉幾張
  // 格子表裡代表「拖的那張」的那格；cell＝這格在格子表裡記成什麼（資料夾拿出來只剩一張、先畫成那張時，格子表裡還是記資料夾）
  const ME = '@';
  type GEntry = Entry & { cell?: string };
  // 照 ids 的先後排 list（ids 裡沒有的排最後、維持原本先後）
  const byOrder = <X extends { id: string }>(list: X[], ids?: string[]) => {
    if (!ids) return list;
    const pos = new Map(ids.map((id, i) => [id, i] as const));
    return [...list].sort((a, b) => (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity));
  };
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef(drag);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const dg = useDG();
  // 拖的那張（從資料夾拿起的是一張紙，目錄裡的可能是紙或資料夾）
  const dragEntryOf = (d: Drag, list = entriesRef.current): Entry | undefined => {
    if (!d.src) return list.find(e => e.id === d.id && !e.brk);
    const n = store.s.notes.find(x => x.id === d.id);
    return n ? { id: n.id, note: n, notes: [n] } : undefined;
  };
  // 拖的時候目錄這一排：照格子表排（拖的那張在 ME 那格）；格子表是 null（從資料夾拿起、手指還在資料夾裡）就照原本的排法、目錄不多一格。
  // 從資料夾拿起的：那格資料夾拿掉這張，拿出來只剩一張就先畫成那張（放手時 model 的 dissolveIfOne 也這樣拆，照 iOS）。
  // 最後面的空位、換頁標記不算（那頁空了就不畫，例如新開的一頁又被拖回去）
  const flatOf = (d: Drag, list = entriesRef.current): GEntry[] => {
    const byId = new Map(list.map(e => [e.id, e] as const));
    const me = dragEntryOf(d, list);
    const out: GEntry[] = [];
    for (const id of d.cells ?? list.map(e => e.id)) {
      if (id === ME) { if (me) out.push(me); continue; }
      const e: Entry | undefined = byId.get(id) ?? (isHole(id) ? { id, notes: [], hole: true } : isBreak(id) ? { id, notes: [], brk: true } : undefined);
      if (!e || e.id === d.id) continue;
      if (e.folder && e.id === d.src) {
        const rest = e.notes.filter(n => n.id !== d.id);
        if (rest.length === 1 && !d.inF) out.push({ id: rest[0].id, note: rest[0], notes: rest, cell: e.id });
        else if (rest.length) out.push({ ...e, notes: rest });
        continue;
      }
      out.push(e);
    }
    while (out.length && (out[out.length - 1].hole || out[out.length - 1].brk)) out.pop();
    return out;
  };
  // 排好的這一排換回格子表（拖的那張記成 ME）
  const cellsOf = (d: Drag, F: GEntry[]) => F.map(e => (e.id === d.id ? ME : e.cell ?? e.id));
  const sameCells = (a: string[], b: string[] | null) => !!b && a.length === b.length && a.every((id, i) => id === b[i]);
  // 打開的資料夾裡排出來的紙：拖進來的放在讓出來那格；從這個資料夾拿起、已經拖到外面的留在原位不顯示（那塊磚身上有手勢，不能拿掉）
  const folderNotes = (e: Entry, d: Drag | null): Note[] => {
    if (!d) return e.notes;
    const rest = byOrder(e.notes.filter(n => n.id !== d.id), d.inF === e.id ? d.forder : undefined);
    const me = store.s.notes.find(x => x.id === d.id);
    if (!me || d.src === null && d.inF !== e.id) return rest;
    const at = d.inF === e.id ? d.fto : d.src === e.id ? d.k0 : -1;
    if (at < 0) return rest;
    rest.splice(Math.min(at, rest.length), 0, me);
    return rest;
  };

  // 分頁（C3）：格子區高 boxH 扣掉上緣留白，放得下幾列整磚就幾列（不切半塊）；第一頁最上面一列是「新的一張」
  const [boxH, setBoxH] = useState(0);
  const pagerY = useRef(0); // 格子區在目錄裡的上緣（D4 算格子的螢幕位置用）
  const [page, setPage] = useState(0);
  // 一頁 R 列＝上緣 s ＋ grid 的 marginTop m ＋ R 塊磚 ＋ (R−1) 個間距 m＝s ＋ R ×（磚＋m）；第一頁的「新的一張」那列也是一塊磚高＋m
  // 一頁 R 列＝上緣 s ＋ grid 的 marginTop m ＋ R 個列距 − 最後一列下面那段縫（2026-11-03 起第一頁跟其他頁一樣大：「新的一張」搬到搜尋框旁邊）
  const rows = Math.max(1, Math.floor((boxH - T.space.s - T.space.m + ROW_GAP) / rowOf(tileW)));
  const gridList = drag && !searching ? flatOf(drag, entries) : entries;
  // 排頁（2026-11-02 起有換頁標記）：一頁放滿就換下一頁，碰到換頁標記也換（那頁還空著就不換）。回傳每頁是 list 裡的第幾個（不含標記）
  function paginate(list: Entry[]): number[][] {
    const out: number[][] = [[]];
    list.forEach((e, i) => {
      if (e.brk) { if (out[out.length - 1].length) out.push([]); return; }
      if (out[out.length - 1].length >= rows * COLS) out.push([]);
      out[out.length - 1].push(i);
    });
    if (out.length > 1 && !out[out.length - 1].length) out.pop();
    return out;
  }
  const pageIdx = paginate(gridList);
  const pages: Entry[][] = pageIdx.map(pg => pg.map(i => gridList[i]));
  const pageCount = useRef(pages.length);
  pageCount.current = pages.length;
  // 第 pg 頁最多幾格（第一頁最上面一列是「新的一張」）
  const capOf = (_pg: number) => rows * COLS; // 每頁一樣大（2026-11-03 起第一頁不再少一列）
  // 拖的那張放進第 pg 頁第 k 格（2026-11-03 自由擺放）：那格是空位＝跟空位對調（原本那格變空位）；那格有別張＝兩張對調（11/02 定的互換）；
  // 那頁最後一張後面、這頁還放得下的格子＝中間補空位再放進去，原本那格變空位。放不進去（同一格、超過這頁、那頁不存在）回 null
  // 從 d.base 算（見 Drag 的 base）：停回拿起那格＝整排回到拿起時的樣子
  function placeAt(d: Drag, pg: number, k: number): string[] | null {
    const b = d.base ? { ...d, cells: d.base } : d;
    const F = flatOf(b), P = paginate(F)[pg] ?? [];
    const cells = cellsOf(b, F), m = cells.indexOf(ME);
    if (m < 0) return null;
    if (k < P.length) {
      const j = P[k];
      if (j !== m) [cells[m], cells[j]] = [cells[j], cells[m]];
      return cells;
    }
    if (!P.length || k >= capOf(pg)) return null;
    const end = P[P.length - 1] + 1;
    cells[m] = newHole();
    cells.splice(end, 0, ...Array.from({ length: k - P.length }, () => newHole()), ME);
    return cells;
  }
  // 第 pg 頁第一個空格：空位，或最後一張後面（這頁還放得下）。沒有回 −1
  function firstEmpty(F: GEntry[], P: number[], pg: number) {
    const i = P.findIndex(j => F[j].hole);
    return i >= 0 ? i : P.length < capOf(pg) ? P.length : -1;
  }
  // 第 i 頁格子左上角的螢幕位置：頁的上緣留白 s、第一頁多一列「新的一張」、格子的 marginTop m
  const gyOf = (_pg: number) => pagerY.current + T.space.s + T.space.m; // 每頁一樣（第一頁不再多一列「新的一張」）

  // 長按選單（C4）：哪一張（或哪個資料夾，D1）、選單放多高。
  // 2026-11-02 照虛擬手機原型（iOS 主畫面長按 App）：那塊磚浮在原位（x、y＝磚的左上角螢幕座標，w＝磚寬），選單接在它正下方、放不下就正上方，跟磚同一邊
  type Menu = { id: string; top: number; x: number; y: number; w: number; side: 'left' | 'right' };
  const [menu, setMenu] = useState<Menu | null>(null);
  const menuNote = menu ? s.notes.find(n => n.id === menu.id && !n.deleted) : undefined;
  useEffect(() => { onMenuOpen(menu ? () => setMenu(null) : null); }, [!!menu]); // eslint-disable-line react-hooks/exhaustive-deps
  // 打開的資料夾（D1）：哪一個、名字是不是正在打（新資料夾、選單的改名字一打開就能打）。裡面一張都看不到了就自己收起
  const [openF, setOpenF] = useState<{ id: string; naming: boolean } | null>(null);
  // 不搜尋時 entries 就是 seatedEntries(s)，不用再算一次
  const openEntry = openF ? (searching ? seatedEntries(s) : entries).find(e => e.id === openF.id && e.folder) : undefined;
  useEffect(() => { if (openF && !openEntry) setOpenF(null); }, [openF, openEntry]);
  // 框裡捲到哪（拖的時候算格子、落點都要扣掉）。換一個資料夾或重新打開，捲動從頂端開始（ScrollView 用資料夾 id 當 key 會重掛）
  const openFolderId = openEntry?.folder?.id;
  // 打開的資料夾翻到第幾頁（2026-11-02：一頁 2×3，滿了往右一頁）。框的寬＝螢幕寬扣左右 l；翻頁時手勢也要知道（dg.fpg）
  const fboxW = FCOLS * innerW + FPAD * 2;
  const [fpage, setFpageState] = useState(0);
  const setFpage = (i: number) => { setFpageState(i); dg.fpg.value = i; };
  useEffect(() => { setFpage(0); }, [openFolderId]); // eslint-disable-line react-hooks/exhaustive-deps
  const fpagerRef = useRef<ScrollViewInstance>(null);
  const onFolderScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => { const i = Math.round(e.nativeEvent.contentOffset.x / fboxW); if (i !== dg.fpg.value) setFpage(i); };
  const folderList = openEntry ? folderNotes(openEntry, drag) : [];
  const solid = !useCanBlur(); // 減少透明度、或舊開發版沒有霧化的原生碼（Glass.tsx）
  const liquid = useSurface() === 'glass'; // iOS 26 以上：資料夾框用系統的液態玻璃（跟 iPhone 檔案夾同一種材質，2026-11-03 多米）
  // 從這個資料夾拿起、已經拖出去：資料夾收起（看不到、點不到），但留著，拿起的那塊磚才不會不見
  const folderHidden = !!(drag && openF && drag.src === openF.id && !drag.inF);

  // 準備疊上去的那一格是誰（放大那塊）；計時器到了才設。ref 給放手時讀最新的
  const [stackOn, setStackOn] = useState<string | null>(null);
  const stackRef = useRef(stackOn);
  stackRef.current = stackOn;
  const aimT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const leaveT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const entered = useRef(false); // 打開的資料夾手指進去過了沒（剛彈開時手指常在框外，進去過一次之後離開才收起）
  const pagerRef = useAnimatedRef<Animated.ScrollView>(); // 抖動中在空白處撥翻頁時，手勢在 UI 執行緒直接捲它（scrollTo）
  const edgeT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fedgeT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // 疊完、放進資料夾之後，那個資料夾（或新開的資料夾）彈一下（照 iOS）
  const [popId, setPopId] = useState<string | null>(null);
  // 換拖曳狀態一律走這裡：同時把手勢要讀的格子位置、格數、讓出來那格寫進 shared value（不等重畫）
  function setD(d: Drag | null) {
    dragRef.current = d;
    setDrag(d);
    if (!d) return;
    const flat = flatOf(d), P = paginate(flat)[d.page] ?? [];
    dg.gy.value = gyOf(d.page);
    dg.gcount.value = Math.max(1, P.length);
    dg.gcap.value = capOf(d.page);
    dg.fold.value = dragEntryOf(d)?.folder ? 1 : 0;
    // 拖的那張在這頁第幾格（不在這頁＝−1）；這頁哪幾格是空位
    dg.glast.value = P.findIndex(i => flat[i].id === d.id);
    const flatBase = d.base ? flatOf({ ...d, cells: d.base }) : flat;
    dg.gbase.value = (paginate(flatBase)[d.page] ?? []).findIndex(i => flatBase[i].id === d.id);
    dg.holes.value = P.reduce((bits, i, k) => (flat[i].hole && k < HOLE_BITS ? bits | (1 << k) : bits), 0);
    const fe = d.inF ? entriesRef.current.find(e => e.id === d.inF) : undefined;
    if (fe) { dg.fcount.value = Math.max(1, folderNotes(fe, d).length); dg.flast.value = d.fto; }
  }

  // 搬行模式：來源是現在這張紙、要搬的那一行。行已經不在了（例如同時被刪）就當普通目錄用
  const from = move ? s.notes.find(n => n.id === store.last && !n.deleted) : undefined;
  const moving = from?.items.find(i => i.id === move);
  // 打開一張（2026-11-02，照 iOS 開 App）：x、y、w＝點的那塊磚在螢幕上的位置和寬。那塊磚放大鋪滿面板，鋪滿了面板淡出、露出後面已經換好的那張紙。
  // 減少動態、搬行模式、不知道磚在哪（VoiceOver）：照舊直接收起
  const [launch, setLaunch] = useState<{ n: Note; x: number; y: number; w: number } | null>(null);
  function pick(n: Note, x?: number, y?: number, w?: number) {
    if (from && moving) {
      const name = label(n);
      if (n !== from && !roomOf(n)) { ui.toast(FULL_MSG); return; } // 那張滿了：不搬，目錄留著讓你挑別張
      if (moveItem(from, n, moving.id)) { n.updated = from.updated = Date.now(); store.change(); ui.toast(`已搬到「${name}」`); }
      dirPanel.close();
      return;
    }
    store.open(n.id);
    if (calm || x === undefined || y === undefined || w === undefined) { dirPanel.close(); return; }
    setMenu(null);
    setLaunch({ n, x, y, w });
  }
  // 新的一張：黃色；開完直接停在紙的輸入列（fresh）。搬行時就是搬進新的一張（紙不換）
  // 2026-11-03 多米：放進第一個空格（從第一頁找起：自己留的空位，或那頁最後一張後面還放得下），都滿了才排最後
  function add() {
    const L = seatedLayout(store.s), P = paginate(L);
    const n = newNote('yellow', 'check');
    for (let pg = 0; pg < P.length; pg++) {
      const to = emptyTo(L, P[pg], pg);
      if (to) { if (seatNew(store.s, n.id, Date.now(), to)) store.change(); break; }
    }
    if (from && moving) { pick(n); return; }
    store.open(n.id, true);
    dirPanel.close();
  }

  /* ---------- 長按選單（C4）：2026-11-02 多米：只留顏色、釘選、刪除（記一行、改名字、編輯目錄拿掉）；資料夾沒有選單，長按直接進抖動 ---------- */
  function openMenu(id: string, x: number, y: number, w: number, swatches = true, rowCount = 4) {
    // 長按跳選單和長按後拖都在按住 longPressMs 時成立，手指按著晃一下兩個會一起來：已經拿起來了就不開選單（iOS 一拖選單就收掉；多米 2026-11-02 錄影）
    if (dragRef.current) return;
    Keyboard.dismiss();
    haptic('menu');
    const h = (swatches ? T.shape.swatchDot + T.space.l * 2 : 0) + T.shape.menuRow * rowCount + T.space.xs * 2 + T.space.s * 2; // 一排色塊＋幾個項目（PopMenu 的藥丸版）
    const below = y + tileHOf(w) + T.space.s;
    const top = below + h <= height - padBottom - T.space.l ? below : Math.max(padTop, y - T.space.s - h);
    setMenu({ id, top, x, y, w, side: x + w / 2 < width / 2 ? 'left' : 'right' });
  }
  function recolor(n: Note, k: ColorKey) {
    if (n.color === k) return;
    n.color = k; n.updated = Date.now(); store.change();
    haptic('color'); // 選單不關，震一下才知道有換到（跟紙的 ⋯ 一樣）
  }
  // 改名字：換到那張紙、目錄收起，清單名變成可以打字（改名只有清單名一個地方）
  function rename(n: Note) {
    dirPanel.close(() => { if (n.id !== store.last) store.open(n.id); store.requestRename(n.id); });
  }
  // 刪除：跟紙的 ⋯「刪除這張」同一套（進最近刪除、30 天、空白的直接拿掉），toast 復原。刪的是現在這張，紙自己換到最近改過的。
  // 2026-11-03 多米：刪掉的那格留空位、別張不往前補；復原時站回那格（leaveHole、fillHole）
  function del(n: Note) {
    const wasPinned = n.pinned; // 復原時釘回去（2026-11-04 程式審查，同紙的 ⋯「刪除這張」）
    markDeleted(n, Date.now()); n.pinned = false;
    leaveHole(store.s, n.id, Date.now());
    n.items = n.items.filter(i => i.t.trim());
    const empty = isEmpty(n);
    if (empty) dropNotes(store.s, x => x === n, Date.now());
    store.change();
    if (!empty) ui.toast('已移到最近刪除', { label: '復原', fn: () => {
      markRestored(n);
      if (wasPinned && pinnedNotes(store.s).length < PIN_MAX) n.pinned = true;
      fillHole(store.s, n.id, Date.now()); store.change();
    } });
  }
  // 抖動中點紙磚左上角的「−」（照 iOS 主畫面移除 App，多米 2026-11-02 選跳確認框）：按「刪除」才刪，刪法跟長按選單的刪除一樣（進最近刪除、toast 復原）
  function askDel(n: Note) {
    ui.confirm(`要刪除「${label(n)}」嗎？`, () => del(n), '刪除');
  }
  // 放進資料夾（D1，2026-11-02 晚起只剩 VoiceOver 動作）：還沒有看得到的資料夾就直接在這張的位置開一個新的、打開讓你取名；有就問放進哪一個
  function putIn(n: Note) {
    const made = () => {
      const f = newFolder(store.s, n.id, Date.now());
      store.change();
      setOpenF({ id: f.id, naming: true });
    };
    const shownFolders = seatedEntries(store.s).flatMap(e => (e.folder ? [e.folder] : []));
    if (!shownFolders.length) { made(); return; }
    ui.sheet([
      ...shownFolders.map(f => ({ label: f.name, fn: () => { if (intoFolder(store.s, n.id, f.id, Date.now())) store.change(); } })),
      { label: '新資料夾', fn: made },
    ], '放進資料夾');
  }
  // 移出資料夾（VoiceOver 動作、在框外放手）：放到資料夾那頁第一個空格（空位，或最後一張後面這頁還放得下；2026-11-03 多米：別張不往後推），
  // 那頁滿了才排在資料夾後面一格；最後一張移出，資料夾不見（打開的框跟著收起）
  function takeOut(n: Note) {
    const f = folderOf(store.s, n.id);
    if (!f) return;
    const L = seatedLayout(store.s), P = paginate(L), pg = P.findIndex(p => p.some(i => L[i].id === f.id));
    if (outOfFolder(store.s, n.id, Date.now(), pg >= 0 ? emptyTo(L, P[pg], pg) : undefined)) store.change();
  }
  // 第 pg 頁第一個空格換成 model 要的「放哪」：空位＝那個空位；最後一張後面（這頁還放得下）＝排在最後那格後面。沒有空格回 undefined
  function emptyTo(L: Entry[], P: number[], pg: number) {
    const k = firstEmpty(L, P, pg);
    return k < 0 ? undefined : k < P.length ? { hole: L[P[k]].id } : P.length ? { after: L[P[P.length - 1]].id } : undefined;
  }
  const tileActs = (n: Note): Act[] => {
    return [
      // 釘選跟紙的 ⋯ 同一套。放進、移出資料夾照 iOS 只用拖的，不放文字選項；VoiceOver 的「改名字」「放進資料夾」「移出資料夾」動作留著，給不能拖的人（HIG）
      { label: '改磚上的字', icon: 'character', fn: () => editGlyph(n) },
      { label: n.pinned ? '取消釘選' : '釘選', icon: n.pinned ? 'pin.slash' : 'pin', fn: () => togglePin(n) },
      { label: '刪除', icon: 'trash', destructive: true, fn: () => del(n) },
    ];
  };
  // 改磚上的字（2026-11-03 多米：改磚正中間那個字，不是改全名）；清空＝回到用名字的第一個字。
  // 只能一個字：打超過一個按「好」就在這一頁提醒、不讓通過（2026-11-04 多米：像填密碼不達標那樣；以前是另外跳一個提示框）
  function editGlyph(n: Note) {
    ui.prompt({
      title: '磚上的字', msg: '打一個字（emoji 也可以）；清空就用名字的第一個字', initial: n.glyph ?? '', okLabel: '好', placeholder: glyphOf(n),
      check: glyphProblem,
      ok: v => { if (setGlyph(n, v)) { n.updated = Date.now(); store.change(); } },
    });
  }
  // 長按資料夾（2026-11-02：資料夾的選單項目都拿掉了）：直接進抖動，手指一動就拖得走；改名字＝打開資料夾點名字
  function holdFolder() {
    if (dragRef.current) return;
    Keyboard.dismiss();
    haptic('menu');
    setEditing(true);
  }
  // VoiceOver 的「往前移／往後移」：拖不了時的替代路徑（行的排順序也這樣做）。D1：資料夾磚也算一格。
  // 2026-11-03 起照整排格子換（含空位）：前後那格是空位就搬進去、原本那格變空位；換頁標記跳過（reseat 要整排，見 model）
  function moveBy(n: { id: string }, d: -1 | 1) {
    const ids = seatedLayout(store.s).map(x => x.id), i = ids.indexOf(n.id);
    let to = i + d;
    while (to >= 0 && to < ids.length && isBreak(ids[to])) to += d;
    if (i < 0 || to < 0 || to >= ids.length) return;
    [ids[i], ids[to]] = [ids[to], ids[i]];
    reseat(store.s, ids); store.change();
  }

  /* ---------- 拖（C4、C5、D2、D4）：長按後一拖就進抖動；抖動中直接拖 ---------- */
  function dragStartGrid(id: string, pg: number, k: number) {
    setMenu(null); setEditing(true);
    entered.current = true;
    dg.gx.value = T.space.l; dg.fopen.value = 0;
    // 格子表照現在的排法，拖的那張那格記成 ME（k、pg 只用來記從哪頁拿起）
    const cells = entries.map(e => (e.id === id ? ME : e.id));
    setD({ id, src: null, page: pg, cells, inF: null, fto: -1, k0: -1, home: pg, base: cells });
    dg.ready.value = 1; // 格子位置寫好了，手勢從下一格開始算瞄哪
    haptic('dragStart');
  }
  // 從打開的資料夾裡拿起（D3、D4）：一開始對準這個資料夾，框外停一下才收起
  function dragStartFolder(n: Note, fid: string, k: number) {
    setMenu(null); Keyboard.dismiss(); setEditing(true);
    entered.current = true;
    dg.gx.value = T.space.l; dg.fopen.value = 1;
    setD({ id: n.id, src: fid, page, cells: null, inF: fid, fto: k, k0: k });
    dg.ready.value = 1; // 資料夾開著、格數寫好了，手勢從下一格開始算瞄哪
    haptic('dragStart');
  }
  function unstack() {
    if (dg.stackK.value >= 0) dg.stackK.value = -1;
    if (stackRef.current) setStackOn(null);
  }
  // 手指離開資料夾框夠久：資料夾收起，回到目錄繼續拖。從資料夾拿起的先放到這頁第一個空格（2026-11-03 自由擺放：空位或最後一張後面），
  // 這頁滿了才排在資料夾後面一格（後面的往後推）
  function springClose() {
    leaveT.current = undefined;
    const d = dragRef.current;
    if (!d || !d.inF) return;
    dg.fopen.value = 0;
    let cells = d.cells;
    if (d.src) {
      const out = { ...d, inF: null, cells: null };
      const F = flatOf(out), P = paginate(F)[d.page] ?? [], k = firstEmpty(F, P, d.page);
      cells = cellsOf(out, F);
      if (k >= 0 && k < P.length) cells[P[k]] = ME;
      else if (k >= 0 && P.length) cells.splice(P[P.length - 1] + 1, 0, ME);
      else { const i = cells.indexOf(d.src); cells.splice(i >= 0 ? i + 1 : cells.length, 0, ME); }
    } else {
      setOpenF(null);
      dg.bw.value = 0;
    }
    setD({ ...d, inF: null, cells, base: cells ?? undefined });
    haptic('dragPass');
    // 手指不動也先對一次目錄的格子
    // 資料夾剛收起（fopen 0），只對目錄的格子，用不到手指的位置；給磚的中心就好
    const ax = dg.x0.value + dg.dx.value, ay = dg.y0.value + dg.dy.value;
    const a = aimOf(ax, ay, dg, tileW, innerW, ax + dg.sw.value / 2, ay + sizeOf(dg.sw.value) / 2);
    dg.aim.value = a;
    onAim(a);
  }
  // 瞄的地方變了（2026-11-02 改成看重疊，原型對過）：先取消還在等的互換／疊、縮回放大的那塊。
  // 目錄：上下對齊停 stackHover＝準備疊（放手就縮進去；資料夾不打開）；上下錯開手停下來＝跟那張互換（見 aimOf）；
  // 中心在空格裡停 swapDwell＝放進那格（2026-11-03 自由擺放：原本那格留空位）。
  // 資料夾裡：重疊過三成停 swapDwell＝互換；框外停 folderLeave＝收起
  function onAim(a: number) {
    clearTimeout(aimT.current);
    unstack();
    const d = dragRef.current;
    if (!d || a === AIM_NONE) return;
    if (a === AIM_OUT) {
      if (entered.current && !leaveT.current) leaveT.current = setTimeout(springClose, T.timing.folderLeave);
      return;
    }
    clearTimeout(leaveT.current);
    leaveT.current = undefined;
    if (a >= PAST_AIM) {
      aimT.current = setTimeout(() => {
        const cur = dragRef.current, cells = cur?.cells ? placeAt(cur, cur.page, a - PAST_AIM) : null;
        if (!cur || !cells || sameCells(cells, cur.cells)) return;
        setD({ ...cur, cells });
        haptic('dragPass');
      }, T.timing.swapPast);
      return;
    }
    if (a === FOLDER_END || a >= FOLDER_AIM) {
      entered.current = true;
      if (!d.inF) return;
      aimT.current = setTimeout(() => {
        const cur = dragRef.current, fe = cur?.inF ? entriesRef.current.find(e => e.id === cur.inF) : undefined;
        if (!cur || !fe) return;
        const fl = folderNotes(fe, cur), m = fl.findIndex(n => n.id === cur.id);
        if (m < 0) return;
        if (a === FOLDER_END) { if (m !== fl.length - 1) { setD({ ...cur, fto: fl.length - 1 }); haptic('dragPass'); } return; }
        const i = a - FOLDER_AIM;
        if (i === m || i >= fl.length) return;
        // 互換：拖的那張跟那一張對調，其他不動
        const sw = fl.slice();
        [sw[m], sw[i]] = [sw[i], sw[m]];
        setD({ ...cur, fto: i, forder: sw.filter(n => n.id !== cur.id).map(n => n.id) });
        haptic('dragPass');
      }, T.timing.swapDwell);
      return;
    }
    if (a <= CELL_AIM || a >= 0) {
      // 放進空格（CELL_AIM−k）或跟第 a 格那張互換（多米 2026-11-02：拖的那張跟底下那張對調，其他都不動）：都是 placeAt
      const k = a >= 0 ? a : CELL_AIM - a;
      const place = () => {
        const cur = dragRef.current;
        const cells = cur?.cells ? placeAt(cur, cur.page, k) : null;
        if (!cur || !cells || sameCells(cells, cur.cells)) return;
        setD({ ...cur, cells });
        haptic('dragPass');
      };
      if (a < 0) { aimT.current = setTimeout(place, T.timing.swapDwell); return; }
      // 高度錯開經過的互換：手還在動就先不換（2026-11-04 多米真機：疊資料夾的功能不見了）。連續兩次沒動才換，約 0.25 秒
      let px = dg.dx.value, py = dg.dy.value, stills = 0;
      const whenStill = () => {
        const x = dg.dx.value, y = dg.dy.value;
        stills = Math.hypot(x - px, y - py) > G.swapStill ? 0 : stills + 1;
        px = x; py = y;
        if (stills === 2) place();
        else aimT.current = setTimeout(whenStill, T.timing.swapPoll);
      };
      aimT.current = setTimeout(whenStill, T.timing.swapPoll);
      return;
    }
    const k = -a - 1, F = flatOf(d), under = F[(paginate(F)[d.page] ?? [])[k] ?? -1];
    if (!under || under.id === d.id) return;
    aimT.current = setTimeout(() => { dg.stackK.value = k; setStackOn(under.id); haptic('dragStart'); }, T.timing.stackHover);
  }
  // 在邊緣停 edgeFlip 就翻一頁；一直停著就再翻。翻過去後格子對到哪格照手指現在的位置重算（手指不動也要算）
  function onEdge(z: number) {
    clearTimeout(edgeT.current); clearTimeout(fedgeT.current);
    if (!z) return;
    if (Math.abs(z) === 2) { fedgeT.current = setTimeout(() => folderFlip(z / 2), T.timing.edgeFlip); return; }
    edgeT.current = setTimeout(function flip() {
      const d = dragRef.current;
      const np = d ? d.page + z : -1;
      if (!d || d.inF || !d.cells || np < 0 || dg.edge.value !== z) return;
      clearTimeout(aimT.current);
      unstack();
      // 離開這頁：在這頁預覽的互換、放格都不算（沒放手），從 base 開始放到新的一頁，放好之後那樣就是新的 base
      const b = d.base ? { ...d, cells: d.base } : d;
      const F = flatOf(b);
      if (np >= pageCount.current) {
        // 最後一頁再往右（2026-11-02，多米選照 iOS）：這頁還有別張才開新的一頁（空位不算），拖的那張是新頁唯一一張；新頁裡已經是自己了就不再開。
        // 原本那格留空位（2026-11-03 自由擺放）
        const here = (paginate(F)[d.page] ?? []).filter(i => F[i].id !== d.id && !F[i].hole);
        const cells = cellsOf(b, F), m = cells.indexOf(ME);
        if (!here.length || m < 0) return;
        cells[m] = newHole();
        cells.push(newBreak(), ME);
        setPage(np);
        setD({ ...d, page: np, cells, base: cells });
        dg.aim.value = AIM_NONE;
        requestAnimationFrame(() => pagerRef.current?.scrollTo({ x: np * width, animated: !calm }));
        haptic('dragPass');
        return;
      }
      pagerRef.current?.scrollTo({ x: np * width, animated: !calm });
      setPage(np);
      // 翻過去（2026-11-03 自由擺放）：拖的那張不在這頁，就放進手指下面那格（空著的話），不然放到這頁第一個空格，放手才會落在這頁；
      // 這頁滿了先不動（手上還拿著，停到空格上才放）。從新開的那頁翻回來：放好之後新頁空了，flatOf 不畫，新頁就收掉
      const at = { ...d, page: np }, P = paginate(F)[np] ?? [];
      let cells: string[] | null = null;
      if (!P.some(i => F[i].id === d.id)) {
        const cx = dg.x0.value + dg.dx.value + dg.sw.value / 2, cy = dg.y0.value + dg.dy.value + sizeOf(dg.sw.value) / 2;
        const u = cellAt(cx - dg.gx.value, cy - gyOf(np), tileW);
        const k = u >= 0 && (u < P.length ? F[P[u]].hole : u < capOf(np)) ? u : firstEmpty(F, P, np);
        if (k >= 0) cells = placeAt(at, np, k);
      }
      setD(cells ? { ...at, cells, base: cells } : { ...at, cells: b.cells }); // 那頁滿了：手上那張還算在拿起那格，這頁預覽的互換收回
      dg.aim.value = AIM_NONE;
      haptic('dragPass');
      edgeT.current = setTimeout(flip, T.timing.edgeFlip);
    }, T.timing.edgeFlip);
  }
  // 打開的資料夾裡拖到框的左右邊停一下：翻資料夾的頁；一直停著就再翻。最後一頁滿了再往右＝拖的那張排到最後、自己落在新的一頁（照 iOS）
  function folderFlip(z: number) {
    const d = dragRef.current, fe = d?.inF ? entriesRef.current.find(e => e.id === d.inF) : undefined;
    if (!d || !fe || dg.fedge.value !== z) return;
    const fl = folderNotes(fe, d), pages = Math.max(1, Math.ceil(fl.length / FPER)), np = dg.fpg.value + z;
    if (np < 0) return;
    if (np >= pages) {
      if ((fl.length - 1) % FPER !== 0 || fl.length < 2) return; // 別張剛好排滿整頁才開新頁
      setD({ ...d, fto: fl.length - 1 });
    } else {
      // 翻到已有的頁：拖的那張跟著過去（往右排那頁第一格、往左排那頁最後一格），不然手指在新頁一停會跟原本那頁的位置互換，把別張換回前一頁
      setD({ ...d, fto: Math.min(fl.length - 1, z > 0 ? np * FPER : np * FPER + FPER - 1) });
    }
    clearTimeout(aimT.current); unstack();
    setFpage(np);
    requestAnimationFrame(() => fpagerRef.current?.scrollTo({ x: np * fboxW, animated: !calm }));
    dg.aim.value = AIM_NONE;
    haptic('dragPass');
    fedgeT.current = setTimeout(() => folderFlip(z), T.timing.edgeFlip);
  }
  useEffect(() => () => { clearTimeout(edgeT.current); clearTimeout(aimT.current); clearTimeout(leaveT.current); clearTimeout(fedgeT.current); }, []);
  // 放手、滑到位之後才改資料：在打開的資料夾框裡＝放進那格（資料夾裡換順序也是這條）；準備疊了＝疊（D2）；
  // 目錄＝放到讓出來那格（從資料夾來的先拿出來）。資料夾開著但在框外放手：從資料夾拿的排在資料夾後面，從目錄拿的回原位。
  // 還沒對準任何地方就放手（剛拿起、框還沒量好）：什麼都不改，從這個資料夾拿的資料夾照樣開著
  function drop() {
    clearTimeout(edgeT.current); clearTimeout(aimT.current); clearTimeout(leaveT.current); clearTimeout(fedgeT.current);
    leaveT.current = undefined;
    const d = dragRef.current, now = Date.now();
    let into: string | null = null;
    // 放手當下的整排（拖的那張排在讓出來那格）：疊的時候找底下那張、放回目錄時的新順序都看這一份
    const flat = d ? flatOf(d) : [];
    const onto = stackRef.current ? flat.find(e => e.id === stackRef.current) : undefined;
    let keepOpen = false;
    if (d && d.inF) {
      const fe = entriesRef.current.find(e => e.id === d.inF);
      if (dg.aim.value !== AIM_OUT && fe) {
        if (placeInFolder(store.s, d.id, d.inF, folderNotes(fe, d).map(n => n.id), now)) store.change();
        keepOpen = true;
      } else if (d.src && dg.aim.value === AIM_OUT) {
        const n = store.s.notes.find(x => x.id === d.id);
        if (n) takeOut(n);
      } else keepOpen = !!d.src;
    } else if (d && onto) {
      // 疊成新資料夾不打開，名字先叫「新資料夾」，要改再點開或長按改（照 iOS，多米 2026-11-02 看錄影選）。
      // 從資料夾拿出來的先拿出來：只剩一張的資料夾先拆掉，底下那張才站在原本那格（疊上去的就是它）
      // 從資料夾拿出來的：拿出來時臨時排在資料夾後面那格，疊進去之後不留空位（leave＝false；不然後面的全被推一格）
      if (d.src) outOfFolder(store.s, d.id, now);
      if (onto.folder) { intoFolder(store.s, d.id, onto.id, now, !d.src); into = onto.id; }
      else { into = newFolder(store.s, onto.id, now).id; intoFolder(store.s, d.id, into, now, !d.src); }
      store.change();
    } else if (d && d.cells) {
      // 整排（含空位、換頁標記）照放手當下的格子存回座位表；從資料夾拿出來的先拿出來（placeTop）
      const ids = flat.map(x => x.id), before = entriesRef.current.map(x => x.id);
      if (d.src) { placeTop(store.s, d.id, ids, now); store.change(); }
      else if (ids.length !== before.length || ids.some((id, i) => id !== before[i])) { reseat(store.s, ids, now); store.change(); }
    }
    setStackOn(null); dg.stackK.value = -1; dg.fopen.value = 0;
    setD(null);
    dg.dx.value = 0; dg.dy.value = 0; dg.sink.value = 0;
    if (into) setPopId(into);
    if (!keepOpen && d && (d.src || d.inF)) setOpenF(null);
  }
  // 拖的那塊一直掛在拿起的那頁（parked，見下面格子那段：換了爸爸手勢就斷）。那頁被拖空了也先畫著（空的），放手才收掉——
  // 不然那頁一不見、磚跟著被拆掉，手勢斷了磚就卡在手指最後的位置（2026-11-03 多米真機：從第二頁拖到第一頁很容易卡住）
  const gridPages: Entry[][] = drag && !drag.src && drag.home !== undefined && drag.home >= pages.length
    ? [...pages, ...Array.from({ length: drag.home + 1 - pages.length }, () => [])] : pages;
  const shown = (i: number) => gridPages[i] ?? [];

  const noteA11y = (n: Note) => (name: string) => {
    if (name === 'activate') pick(n);
    else if (name === 'rename') rename(n);
    else if (name === 'delete') del(n);
    else if (name === 'folder') putIn(n);
    else if (name === 'out') takeOut(n);
    else if (name === 'forward') moveBy(n, -1);
    else if (name === 'backward') moveBy(n, 1);
  };
  const noteLabel = (n: Note) => `${label(n)}，${col(n.color).hue}${n.pinned ? '，已釘選' : ''}`;
  // 磚的樣子：紙磚，或資料夾磚（正在看的紙在裡面就框起來）
  const face = (e: Entry, w: number) => (e.folder
    ? <FolderFace f={e.folder} notes={e.notes} w={w} cur={e.notes.some(n => n.id === store.last)} />
    : <TileFace n={e.note!} w={w} cur={e.id === store.last} />);
  // 磚只在自己的樣子、位置、狀態變了才重畫（2026-11-04 效能，多米：拖磚要順）。以前目錄每重畫一次（換色、拖著停一下換位、翻頁、疊上去），
  // 每一塊磚都跟著重畫、三個手勢全部重新設定一遍，拖的時候特別吃力。磚手上的動作是同一組（tileApi，不會換），
  // 經過 tileAct 轉一手，叫到的永遠是這一次畫的函式（裡面用到的格子表、資料夾、那張紙都是現在的）
  const noteById = (id: string) => store.s.notes.find(x => x.id === id && !x.deleted);
  const tileAct = useRef<TileApi | null>(null);
  tileAct.current = {
    dragStartGrid, onAim, onEdge, drop,
    dragStartFolder: (id, fid, k) => { const n = store.s.notes.find(x => x.id === id); if (n) dragStartFolder(n, fid, k); },
    pickNote: (id, x, y, w) => { const n = noteById(id); if (n) pick(n, x + (w - sizeOf(w)) / 2, y, sizeOf(w)); },
    menuNote: (id, x, y, w) => openMenu(id, x, y, w, true, 3),
    a11yNote: (id, name) => { const n = noteById(id); if (n) noteA11y(n)(name); },
    minusNote: id => { const n = noteById(id); if (n) askDel(n); },
    openFolder: id => setOpenF({ id, naming: false }),
    holdFolder,
    a11yFolder: (id, name) => {
      if (name === 'activate') setOpenF({ id, naming: false });
      else if (name === 'rename') setOpenF({ id, naming: true });
      else if (name === 'forward') moveBy({ id }, -1);
      else if (name === 'backward') moveBy({ id }, 1);
    },
  };
  const [tileApi] = useState<TileApi>(() => ({
    dragStartGrid: (id, pg, k) => tileAct.current!.dragStartGrid(id, pg, k),
    dragStartFolder: (id, fid, k) => tileAct.current!.dragStartFolder(id, fid, k),
    onAim: a => tileAct.current!.onAim(a),
    onEdge: z => tileAct.current!.onEdge(z),
    drop: () => tileAct.current!.drop(),
    pickNote: (id, x, y, w) => tileAct.current!.pickNote(id, x, y, w),
    menuNote: (id, x, y, w) => tileAct.current!.menuNote(id, x, y, w),
    a11yNote: (id, name) => tileAct.current!.a11yNote(id, name),
    minusNote: id => tileAct.current!.minusNote(id),
    openFolder: id => tileAct.current!.openFolder(id),
    holdFolder: () => tileAct.current!.holdFolder(),
    a11yFolder: (id, name) => tileAct.current!.a11yFolder(id, name),
  }));
  const tile = (e: Entry, k: number, pg: number, parked = false, placed = false) => {
    if (e.hole || e.brk) return null; // 空位佔一格但不畫東西（k 照算，後面的磚位置不變）
    const f = e.folder, n = e.note;
    const cur = f ? e.notes.some(x => x.id === store.last) : e.id === store.last;
    return (
      <TileM key={e.id} e={e} cur={cur} face={f ? folderFaceKey(f, e.notes, cur) : noteFaceKey(n!, cur)} api={tileApi} pg={pg} k={k}
        w={tileW} sw={width} fw={innerW} editing={editing} calm={calm} canDrag={!searching} ghost={drag?.id === e.id} dg={dg}
        parked={parked} placed={placed} target={stackOn === e.id} pop={popId === e.id}
        label={f ? `資料夾，${f.name}，${e.notes.length} 張` : noteLabel(n!)} selected={cur}
        acts={f ? FOLDER_A11Y : folderOf(s, n!.id) ? NOTE_IN_A11Y : NOTE_A11Y} />
    );
  };
  // 浮起那塊的樣子：從資料夾拿起的用資料夾裡的寬
  const dragged = drag ? dragEntryOf(drag, entries) : undefined;
  const ghostFace = dragged ? (drag!.src ? <TileFace n={dragged.note!} w={innerW} cur={false} /> : face(dragged, tileW)) : null;
  // 磚上「−」的位置：方磚的左上角（格子比方磚寬，方磚置中）

  return (
    // 整個螢幕那麼大（上面 padTop 那段是露出的紙和把手，box-none 讓觸控穿過去）
    <View style={[StyleSheet.absoluteFill, { paddingBottom: padBottom }]} collapsable={false} pointerEvents="box-none">
      <View style={[st.top, { marginTop: padTop }]}>
        {/* 搜尋列照 iOS 的樣子（2026-11-02 系統元件化）：淡灰膠囊、放大鏡、打字時右邊有系統的清除鈕、鍵盤右下是「搜尋」 */}
        <View style={[st.search, { backgroundColor: c.searchFill }, editing && { opacity: T.motion.pressDim }]}>
          <Sym name="magnifyingglass" size={17} color={c.textSecondary} />
          <TextInput value={q} onChangeText={v => { setQ(v); setPage(0); }} placeholder={moving ? '搜尋清單' : '搜尋'} placeholderTextColor={c.textMuted} clearButtonMode="while-editing"
            returnKeyType="search" enablesReturnKeyAutomatically autoCorrect={false}
            editable={!editing} style={[st.searchInput, { color: c.textPrimary }]} accessibilityLabel={moving ? '搜尋清單' : '搜尋'} />
        </View>
        {/* 新的一張（2026-11-03 多米選：1×1 之後從第一頁第一列搬到這裡，格子全部給清單）；抖動中這個位置換成「完成」 */}
        {!editing && (
          <Glass style={st.newBtn} interactive>
            <Pressable onPress={add} hitSlop={T.space.s} accessibilityRole="button" accessibilityLabel={moving ? '搬到新的一張' : '新的一張'}
              style={({ pressed }) => [st.newHit, pressed && { opacity: T.motion.pressDim }]}>
              <Sym name="plus" size={20} color={c.textPrimary} weight="semibold" />
            </Pressable>
          </Glass>
        )}
        {/* 抖動中才有：結束編輯（跟 iOS 主畫面右上的「完成」一樣） */}
        {editing && (
          // iOS 26 主畫面右上的「完成」是一顆玻璃膠囊
          <Glass style={st.done} interactive>
            <Pressable onPress={() => setEditing(false)} hitSlop={T.space.s} accessibilityRole="button" accessibilityLabel="完成"
              style={({ pressed }) => [st.doneHit, pressed && { opacity: T.motion.pressDim }]}>
              <Text style={[st.doneText, { color: c.textPrimary }]}>完成</Text>
            </Pressable>
          </Glass>
        )}
      </View>

      {moving && (
        <Text style={[st.moveHead, { color: c.textSecondary }]} numberOfLines={2}>把「{moving.t.trim()}」搬到</Text>
      )}

      {searching && !moving ? (
        // 搜尋筆記（多米 2026-11-03）：直接列出符合的那幾行，上面標是哪一張；點一行＝換到那張、捲到那行亮一下，點清單名＝打開那張。
        // 只畫看得到附近的列（2026-11-04 效能，程式審查量過：1000 行的紙搜「測」一次畫出近千列，網頁上每打一個字卡 100～270 毫秒）；結果一列都沒少
        <FlatList style={{ flex: 1 }} data={hitRows(searchLines(s, q))} keyExtractor={r => r.key}
          keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={st.body}
          initialNumToRender={HIT_FIRST} windowSize={HIT_WINDOW}
          renderItem={({ item: r }) => <HitRowView r={r} q={q.trim()}
            onNote={() => pick(r.h.note)} onLine={id => { if (id) store.openAt(r.h.note.id, id); else store.open(r.h.note.id); dirPanel.close(); }} />}
          ListEmptyComponent={<Empty lines={[`找不到含「${q.trim()}」的清單或行`]} />} />
      ) : searching ? (
        // 搬行模式的搜尋：找要搬到哪一張，照舊列磚，所有頁的紙一起找、上下捲，不分頁（不能拖：搜到的只是一部分）
        <ScrollView style={{ flex: 1 }} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={st.body}>
          <View style={st.grid}>{entries.map((e, k) => tile(e, k, 0))}</View>
          {/* 找不到→帶他剛打的字；第一次不會是空的（紙永遠至少一張）。顏色篩選的空狀態跟著篩選一起拿掉（2026-11-01） */}
          {notes.length === 0 && <Empty lines={[`找不到含「${q.trim()}」的清單`]} />}
        </ScrollView>
      ) : (
        // C3 多頁：一頁放幾列照格子區的高度算（螢幕小、字放大就少放），放不下往右一頁；整頁翻（系統分頁捲動），每次打開從第一頁。
        // 抖動中系統捲動關掉（手指在磚上一動就是拿起來），改由空白處的撥動帶著整頁走（PageBack，照 iOS 主畫面晃動中也能翻頁）；拖著磚到邊緣停一下也會翻（C5）
        <View style={{ flex: 1 }} onLayout={e => { setBoxH(e.nativeEvent.layout.height); pagerY.current = e.nativeEvent.layout.y; }}>
          {boxH > 0 && (
            <Animated.ScrollView ref={pagerRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEnabled={pages.length > 1 && !editing}
              keyboardShouldPersistTaps="handled" onScrollBeginDrag={() => Keyboard.dismiss()}
              onScroll={e => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
              scrollEventThrottle={T.timing.pageScroll}>
              {gridPages.map((_, i) => (
                <View key={i} style={[st.page, { width }]} pointerEvents="box-none" accessibilityLabel={pages.length > 1 ? `第 ${i + 1} 頁，共 ${pages.length} 頁` : undefined}>
                  <PageBack editing={editing} calm={calm} pg={i} count={pages.length} width={width} pager={pagerRef}
                    onHold={() => { setMenu(null); haptic('menu'); setEditing(true); }} onTap={() => setEditing(false)} />
                  <View style={[st.grid, { height: Math.max(0, Math.ceil(shown(i).length / COLS) * rowOf(tileW) - ROW_GAP) }]} pointerEvents="box-none">
                    {/* 每塊用位置排到第幾格（placed），陣列順序固定照座位表（拖的時候不變）：互換、讓位、換頁都只改位置，
                        React 不會去搬節點（搬了手勢會斷，2026-11-02 網頁實測互換後拖不動）。浮起那塊畫在目錄最上層（DragGhost）。
                        拖的那塊被排到別頁去了：還是留在拿起的這頁（藏起來、疊在左上角），別頁那格空著 */}
                    {(() => {
                      const list = shown(i), rank = new Map(entries.map((e, r) => [e.id, r]));
                      const items: { e: Entry; k: number; parked: boolean }[] = list.map((e, k) => ({ e, k, parked: false }))
                        .filter(({ e }) => !(drag && e.id === drag.id && !drag.src && drag.home !== i));
                      if (drag && !drag.src && drag.home === i && dragged && !list.some(e => e.id === drag.id)) items.push({ e: dragged, k: 0, parked: true });
                      items.sort((a, b) => (rank.get(a.e.id) ?? entries.length + a.k) - (rank.get(b.e.id) ?? entries.length + b.k));
                      return items.map(({ e, k, parked }) => tile(e, k, i, parked, true));
                    })()}
                  </View>
                </View>
              ))}
            </Animated.ScrollView>
          )}
        </View>
      )}

      {/* 頁點：幾頁幾個，亮的是現在這頁；只有一頁不印 */}
      {!searching && pages.length > 1 && (
        <View style={st.dots} accessible accessibilityLabel={`第 ${Math.min(page, pages.length - 1) + 1} 頁，共 ${pages.length} 頁`}>
          {pages.map((_, i) => (
            <View key={i} style={[st.dot, { backgroundColor: c.textSecondary, opacity: i === Math.min(page, pages.length - 1) ? 1 : T.shape.handleOff }]} />
          ))}
        </View>
      )}

      {/* 最近刪除固定在格子下面，每一頁都看得到 */}
      {trashed > 0 && (
        <Pressable onPress={editing ? undefined : () => dirPanel.close(() => router.push('/trash'))} accessibilityRole="button" accessibilityLabel={`最近刪除，${trashed} 項`}
          style={({ pressed }) => [st.trashRow, { borderTopColor: c.separator }, pressed && !editing && { opacity: T.motion.pressDim }]}>
          <Sym name="trash" size={17} color={c.textSecondary} />
          <Text style={[st.trashText, { color: c.textSecondary }]}>最近刪除</Text>
          <View style={{ flex: 1 }} />
          <Text style={[st.trashText, { color: c.textSecondary }]}>{trashed}</Text>
          <Sym name="chevron.right" size={12} color={c.textSecondary} />
        </Pressable>
      )}

      {/* 打開的資料夾（D1；2026-11-02 照 iOS，多米原型對過）：後面一層暗幕、名字大字靠左在框上面、框是半透明的玻璃。
          一頁 FCOLS 欄 × FROWS 列，滿了往右一頁：不抖時左右撥換頁、框下面有頁點；拖著到框的左右邊停一下也會翻（folderFlip）。
          所有張畫在同一層、用位置排到各頁：拖的那張換頁時不會換到別的容器重掛（重掛手勢就斷了）。
          後面的目錄用 expo-blur 霧化、框本身也是霧面（2026-11-02 多米：直接做）；系統「減少透明度」開著就不霧化（solid）。框的位置用 onLayout 量（外層從螢幕頂端開始，量到的就是螢幕座標） */}
      {openEntry?.folder && (() => {
        const fpages = Math.max(1, Math.ceil(folderList.length / FPER));
        const fr = new Map(openEntry.notes.map((n, r) => [n.id, r]));
        const fRank = (id: string, k: number) => fr.get(id) ?? openEntry.notes.length + k;
        const gridH = FROWS * rowOf(innerW) - ROW_GAP;
        return (
          <View style={[StyleSheet.absoluteFill, st.folderWrap, folderHidden && st.hidden]} pointerEvents={folderHidden ? 'none' : 'auto'}
            accessibilityViewIsModal onAccessibilityEscape={() => setOpenF(null)}>
            {!solid && <BlurView style={StyleSheet.absoluteFill} intensity={T.shape.folderBlur} tint="default" pointerEvents="none" />}
            <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: solid ? c.folderVeil : c.folderVeilBlur }]} onPress={() => { Keyboard.dismiss(); setOpenF(null); }}
              accessibilityRole="button" accessibilityLabel="收起資料夾" />
            {/* 名字照 iPhone：靠左、跟框裡第一欄方磚的左邊對齊 */}
            <FolderName key={openEntry.folder.id} f={openEntry.folder} focus={openF!.naming} inset={(width - fboxW) / 2 + FPAD + (innerW - sizeOf(innerW)) / 2} />
            <View style={[st.folderBox, { width: fboxW, backgroundColor: solid ? c.folderGlass : 'transparent', borderColor: liquid ? 'transparent' : c.folderGlassEdge }]}
              onLayout={e => { const l = e.nativeEvent.layout; dg.bx.value = l.x; dg.by.value = l.y; dg.bw.value = l.width; dg.bh.value = l.height; }}>
              {liquid ? <Glass style={[StyleSheet.absoluteFill, { borderRadius: T.shape.radiusLg }]} />
                : !solid && (
                  <BlurView style={[StyleSheet.absoluteFill, { backgroundColor: c.folderGlassBlur }]} intensity={T.shape.folderBoxBlur} tint="default" pointerEvents="none" />
                )}
              <ScrollView ref={fpagerRef} key={openEntry.folder.id} horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEnabled={!editing && !drag && fpages > 1}
                keyboardShouldPersistTaps="handled" onScroll={onFolderScroll} onMomentumScrollEnd={onFolderScroll} scrollEventThrottle={T.timing.pageScroll}>
                <View style={{ width: fpages * fboxW, height: gridH + FPAD * 2 }}>
                  {/* 陣列順序固定照資料夾原本的順序，換位只改 x、y（跟目錄一樣，節點被搬手勢會斷） */}
                  {folderList.map((n, k) => ({ n, k })).sort((a, b) => fRank(a.n.id, a.k) - fRank(b.n.id, b.k)).map(({ n, k }) => {
                    const pg = Math.floor(k / FPER), kk = k % FPER;
                    return (
                      <FolderTileM key={n.id} n={n} fid={openEntry.id} face={noteFaceKey(n, n.id === store.last)} api={tileApi} k={k} w={innerW}
                        calm={calm} editing={editing} cur={n.id === store.last} ghost={drag?.id === n.id}
                        x={pg * fboxW + FPAD + slotX(kk, innerW, FCOLS)} y={FPAD + slotY(kk, innerW, FCOLS)}
                        dg={dg} screenW={width} gw={tileW} label={noteLabel(n)} />
                    );
                  })}
                </View>
              </ScrollView>
              {fpages > 1 && (
                <View style={st.fdots} accessible accessibilityLabel={`資料夾第 ${fpage + 1} 頁，共 ${fpages} 頁`}>
                  {Array.from({ length: fpages }, (_, i) => (
                    <View key={i} style={[st.dot, { backgroundColor: c.textSecondary, opacity: i === fpage ? 1 : T.shape.handleOff }]} />
                  ))}
                </View>
              )}
            </View>
          </View>
        );
      })()}

      {/* 拿起來的那張：浮在最上層跟著手指（目錄、資料夾都一樣），手勢還在原本那塊磚上 */}
      {drag && ghostFace && <DragGhost dg={dg} calm={calm}>{ghostFace}</DragGhost>}

      {/* 長按選單的暗幕往下多蓋一截，連目錄底部的把手一起蓋住（把手那截點了由面板收掉選單） */}
      {menu && <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {menuNote && (
        <PopMenu acts={tileActs(menuNote)} top={menu.top} side={menu.side} onClose={() => setMenu(null)}
          lifted={<Lifted x={menu.x} y={menu.y} calm={calm}><TileFace n={menuNote} w={menu.w} cur={menuNote.id === store.last} /></Lifted>}
          header={<Swatches current={menuNote.color} onPick={k => recolor(menuNote, k)} />} />
      )}
      </View>}

      {launch && (
        <Launch key={launch.n.id} x={launch.x} y={launch.y} w={launch.w} color={launch.n.color} title={label(launch.n)} W={width} H={height}
          onDone={() => dirPanel.close(undefined, true)} />
      )}
    </View>
  );
}

// 磚手上的動作（2026-11-04）：目錄畫一次給一組、之後不換（見 Directory 的 tileApi）。資料夾磚、紙磚、資料夾裡的磚都用這一組，照 id 找人
type TileApi = {
  dragStartGrid: (id: string, pg: number, k: number) => void; dragStartFolder: (id: string, fid: string, k: number) => void;
  onAim: (a: number) => void; onEdge: (z: number) => void; drop: () => void;
  pickNote: (id: string, x: number, y: number, w: number) => void; menuNote: (id: string, x: number, y: number, w: number) => void;
  a11yNote: (id: string, name: string) => void; minusNote: (id: string) => void;
  openFolder: (id: string) => void; holdFolder: () => void; a11yFolder: (id: string, name: string) => void;
};
// 磚畫出來的樣子用到的全部，串成一串字：一樣就不必重畫（紙是在原物件上改的，比物件看不出換了顏色、改了名字）。
// 紙磚：顏色、磚上的字、名字（沒取名是「未命名」、字是次要色）、釘選、正在看；資料夾：名字、裡面前九張的顏色和字、正在看的在不在裡面
const noteFaceKey = (n: Note, cur: boolean) => `${n.color}|${glyphOf(n)}|${label(n)}|${n.title.trim() ? 1 : 0}|${n.pinned ? 1 : 0}|${cur ? 1 : 0}`;
const folderFaceKey = (f: Folder, notes: Note[], cur: boolean) =>
  `${f.name}|${notes.slice(0, T.shape.folderMinis * T.shape.folderMinis).map(n => n.color + glyphOf(n)).join(',')}|${cur ? 1 : 0}`;

type TileProps = {
  e: Entry; cur: boolean; // 這塊磚畫的是哪一格（紙或資料夾）；cur＝正在看的紙是它（資料夾：在它裡面）
  face: string; // 樣子的摘要（noteFaceKey、folderFaceKey）：重畫看它，不看 e 是不是同一個物件
  api: TileApi; pg: number; // 拿起時回報在第幾頁第幾格（k）
  w: number; sw: number; fw: number; k: number; editing: boolean; calm: boolean; canDrag: boolean; ghost: boolean; dg: DG;
  label: string; selected: boolean; acts: { name: string; label?: string }[];
  placed?: boolean; // 用位置排（第 k 格的座標），不靠排列順序：拖的時候磚在陣列裡的順序不變，手勢才不會因為節點被搬動而斷
  parked?: boolean; // 拖的那塊被排到別頁：留在原本那頁、疊在左上角不佔位（看不見，只為了手勢不斷）
  pop?: boolean; // 剛有東西縮進來（疊成新資料夾、放進資料夾）：彈一下（2026-11-02 照 iOS）
  target: boolean;
};

// VoiceOver 的動作：目錄裡的紙、資料夾裡的紙（不能往前往後移，D3 才有資料夾裡的排序）、資料夾
const NOTE_A11Y = [
  { name: 'activate' }, { name: 'rename', label: '改名字' }, { name: 'folder', label: '放進資料夾' }, { name: 'delete', label: '刪除' },
  { name: 'forward', label: '往前移' }, { name: 'backward', label: '往後移' },
];
const NOTE_IN_A11Y = [{ name: 'activate' }, { name: 'rename', label: '改名字' }, { name: 'out', label: '移出資料夾' }, { name: 'delete', label: '刪除' }];
const FOLDER_A11Y = [{ name: 'activate' }, { name: 'rename', label: '改名字' }, { name: 'forward', label: '往前移' }, { name: 'backward', label: '往後移' }];

// 一塊磚的手勢（C4）：點＝換紙；長按（不動）＝選單；長按後一拖、或抖動中直接拖＝拿起來換位置（拖的部分 D4 起跟資料夾裡共用 useDragPan）。
// 長按與拖同時聽（長按先成立跳選單，手指再動才拖）；點要等它們都不成立。抖動中不能點、不跳選單（資料夾磚除外：抖動中點會打開）
function Tile(p: TileProps) {
  const { e, api, k, w, sw, calm } = p;
  const id = e.id, isFolder = !!e.folder;
  const onPick = (x: number, y: number) => (isFolder ? api.openFolder(id) : api.pickNote(id, x, y, w));
  const onMenu = (x: number, y: number) => (isFolder ? api.holdFolder() : api.menuNote(id, x, y, w));
  const onDragStart = () => api.dragStartGrid(id, p.pg, k);
  const { onAim, onEdge, drop: onDrop } = api;
  const pressed = useSharedValue(0);
  const tap = useTapGesture({
    runOnJS: true,
    enabled: !p.editing || isFolder, // 抖動中點一下也算的只有資料夾磚（iOS 抖動中點檔案夾會打開）
    // 抖動中點資料夾：容許的晃動跟拿起來拖的門檻一樣（tileDragEdit），晃幾點不會被當成拖
    maxDistance: p.editing ? G.tileDragEdit : G.longPressMove,
    onBegin: () => { pressed.value = 1; },
    onFinalize: () => { pressed.value = 0; },
    onActivate: e => onPick(e.absoluteX - e.x, e.absoluteY - e.y), // 磚的左上角（螢幕座標），打開時從這裡放大
  });
  const hold = useLongPressGesture({
    runOnJS: true,
    enabled: !p.editing,
    minDuration: G.longPressMs,
    maxDistance: G.longPressMove,
    onActivate: e => onMenu(e.absoluteX - e.x, e.absoluteY - e.y), // 磚的左上角（螢幕座標）
  });
  const held = useSharedValue(0);
  const pan = useDragPan({
    enabled: p.canDrag, editing: p.editing, w, screenW: sw, gw: w, fw: p.fw, calm, dg: p.dg, held,
    onStart: onDragStart, onAim, onEdge, onDrop,
  });
  const gesture = useExclusiveGestures(useSimultaneousGestures(hold, pan), tap);

  // 抖動：相鄰兩塊方向相反，來回轉一點點。減少動態：不抖
  const rot = useSharedValue(0);
  useEffect(() => {
    if (!p.editing || calm) { cancelAnimation(rot); rot.value = 0; return; }
    const a = k % 2 ? -M.jiggle.deg : M.jiggle.deg;
    rot.value = withRepeat(withSequence(withTiming(a, { duration: M.jiggle.half }), withTiming(-a, { duration: M.jiggle.half })), -1, true);
    return () => cancelAnimation(rot);
  }, [p.editing, calm]); // eslint-disable-line react-hooks/exhaustive-deps
  // 被瞄著要疊的那張（2026-11-04 照 iPhone）：後面長出底板、自己變淡，名字和「−」收起；離開就還原。減少動態：直接變
  const grow = useSharedValue(1), cue = useSharedValue(0);
  useEffect(() => {
    cue.value = calm ? (p.target ? 1 : 0) : withTiming(p.target ? 1 : 0, { duration: CUE_MS });
  }, [p.target, calm]); // eslint-disable-line react-hooks/exhaustive-deps
  // 有東西縮進來：放大一下再彈回（減少動態：不彈）
  useEffect(() => {
    if (!p.pop || calm) return;
    grow.value = withSequence(withTiming(GROW, { duration: SINK_MS / 2 }), withSpring(1, LIFT_SPRING));
  }, [p.pop, calm]); // eslint-disable-line react-hooks/exhaustive-deps
  // 動畫裡只能用拆出來的真假值：寫 p.ghost 會把整包 props（紙、資料夾物件）抓進去，被鎖住之後改資料全部失效（多米 2026-11-02 真機「一團糟」）
  const ghost = p.ghost;
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }, { scale: grow.value * (1 + held.value * (HOLD_SCALE - 1)) }],
    opacity: ghost ? 0 : 1 - pressed.value * (1 - PRESS_DIM),
  }), WEB_DEPS ? [ghost] : undefined);
  const plateStyle = useAnimatedStyle(() => ({ opacity: cue.value, transform: [{ scale: 1 + cue.value * (PLATE - 1) }] }));
  const faceStyle = useAnimatedStyle(() => ({ opacity: 1 - cue.value * (1 - CUE_DIM) }));
  const c = useColors(), size = sizeOf(w);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[style, p.placed && [st.fslot, { left: slotX(p.k, p.w), top: slotY(p.k, p.w) }], p.parked && st.parked]} layout={calm ? undefined : TILE_MOVE}
        accessible accessibilityRole="button" accessibilityLabel={p.label}
        accessibilityState={{ selected: p.selected }} accessibilityActions={p.acts}
        onAccessibilityAction={(ev: AccessibilityActionEvent) => (isFolder ? api.a11yFolder(id, ev.nativeEvent.actionName) : api.a11yNote(id, ev.nativeEvent.actionName))}>
        <Animated.View pointerEvents="none" style={[st.plate, plateStyle, { left: (w - size) / 2, width: size, height: size, borderRadius: size * RADIUS, backgroundColor: c.menuSep }]} />
        <Animated.View style={faceStyle}>
          {isFolder ? <FolderFace f={e.folder!} notes={e.notes} w={w} cur={p.cur} hideName={p.target} /> : <TileFace n={e.note!} w={w} cur={p.cur} hideName={p.target} />}
        </Animated.View>
        {/* 抖動中左上角的「−」只有紙磚有（資料夾磚沒有，照 iOS） */}
        {p.editing && !isFolder && !p.target && <Minus onPress={() => api.minusNote(id)} held={held} inset={(p.w - sizeOf(p.w)) / 2} />}
      </Animated.View>
    </GestureDetector>
  );
}
// 磚只在這些變了才重畫（2026-11-04 效能）：dg 是同一組 shared value（每次畫拿到的是新包的物件，裡面一樣）、api 不會換，都不用看
const TileM = memo(Tile, (a, b) => a.e.id === b.e.id && a.face === b.face && a.cur === b.cur && a.pg === b.pg && a.k === b.k
  && a.w === b.w && a.sw === b.sw && a.fw === b.fw && a.editing === b.editing && a.calm === b.calm && a.canDrag === b.canDrag
  && a.ghost === b.ghost && a.label === b.label && a.selected === b.selected && a.acts === b.acts && a.placed === b.placed
  && a.parked === b.parked && a.pop === b.pop && a.target === b.target);

// 目錄一頁的空白處（多米 2026-11-02 晚，照 iOS 使用手冊「按住主畫面背景直到項目開始晃動」「完成後點一下背景」）：
// 墊在磚的下面，磚、新的一張蓋在上面，點到磚不會到這裡（頁和格子都設 box-none，空白處才點得到它）。按住＝進抖動；抖動中點一下＝結束。
// 抖動中左右撥＝翻頁（多米 2026-11-02：目錄翻頁要像主畫面整頁一起換；iOS 晃動中也能翻）：整頁跟著手指走，撥過半頁或甩一下就翻過去，不夠就回來，到頭只跟三成
type PageBackProps = {
  editing: boolean; calm: boolean; pg: number; count: number; width: number; pager: AnimatedRef<Animated.ScrollView>;
  onHold: () => void; onTap: () => void;
};
function PageBack({ editing, calm, pg, count, width, pager, onHold, onTap }: PageBackProps) {
  const hold = useLongPressGesture({ runOnJS: true, enabled: !editing, minDuration: G.longPressMs, maxDistance: G.longPressMove, onActivate: () => onHold() });
  const tap = useTapGesture({ runOnJS: true, enabled: editing, maxDistance: G.longPressMove, onActivate: () => onTap() });
  const max = (count - 1) * width, base = pg * width;
  const turn = usePanGesture({
    enabled: editing && count > 1,
    activeOffsetX: [-G.pullFailX, G.pullFailX],
    failOffsetY: [-G.swapFailY, G.swapFailY],
    onUpdate: e => {
      'worklet';
      const x = base - e.translationX;
      scrollTo(pager, x < 0 ? x * EDGE_FOLLOW : x > max ? max + (x - max) * EDGE_FOLLOW : x, 0, false);
    },
    onDeactivate: e => {
      'worklet';
      const d = e.translationX < 0 ? 1 : -1;
      const go = !e.canceled && (Math.abs(e.translationX) > width * TURN_RATIO || -d * e.velocityX > TURN_FLICK);
      scrollTo(pager, Math.min(max, Math.max(0, base + (go ? d * width : 0))), 0, !calm);
    },
  });
  const gesture = useExclusiveGestures(turn, hold, tap);
  return (
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill} />
    </GestureDetector>
  );
}

// 抖動中紙磚左上角的「−」（多米 2026-11-02：照 iOS 主畫面晃動時 App 左上角的移除鈕；資料夾磚沒有）。點了由上層跳確認框。
// 圓點小，熱區用 hitSlop 補到 44 以上；VoiceOver 走磚上的「刪除」動作，這顆不另外讀
// 按住那塊磚（held）時收起（照 iOS 拿起的 App 沒有「−」），放手回來
function Minus({ onPress, held, inset }: { onPress: () => void; held: SharedValue<number>; inset: number }) {
  const c = useColors();
  const fade = useAnimatedStyle(() => ({ opacity: 1 - held.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, fade]} pointerEvents="box-none">
      <Pressable onPress={onPress} hitSlop={T.space.m} accessible={false}
        style={({ pressed }) => [st.minus, { left: inset - T.space.s, backgroundColor: c.separator }, pressed && { opacity: T.motion.pressDim }]}>
        <Sym name="minus" size={12} color={c.textPrimary} weight="semibold" />
      </Pressable>
    </Animated.View>
  );
}

// 資料夾裡的一張（D3、D4）：點＝換紙；長按（不動）＝選單；長按後一拖（抖動中直接拖）＝拿起來：框裡換順序，拖出框停一下資料夾收起、放到目錄任一格。
// 跟目錄的磚分開寫是因為長相、點的規則不同；拖跟目錄共用 useDragPan
type FolderTileProps = {
  n: Note; fid: string; face: string; api: TileApi; // fid＝這個資料夾；face＝樣子的摘要（noteFaceKey），重畫看它；動作跟目錄的磚同一組
  k: number; w: number; calm: boolean; editing: boolean; cur: boolean; ghost: boolean; dg: DG; screenW: number; gw: number; label: string;
  x: number; y: number; // 在資料夾那層裡的位置（2026-11-02：所有頁畫在同一層，照位置排到各頁）
};
function FolderTile(p: FolderTileProps) {
  const { calm, api, n: { id } } = p;
  const onPick = (x: number, y: number) => api.pickNote(id, x, y, p.w);
  const onMenu = (x: number, y: number) => api.menuNote(id, x, y, p.w);
  const onDragStart = () => api.dragStartFolder(id, p.fid, p.k);
  const { onAim, onEdge, drop: onDrop } = api;
  const pressed = useSharedValue(0);
  // 抖動中（iOS 晃動中打開的檔案夾）：點不換紙、不跳選單，手指一動就拿起來
  const tap = useTapGesture({
    runOnJS: true,
    enabled: !p.editing,
    maxDistance: G.longPressMove,
    onBegin: () => { pressed.value = 1; },
    onFinalize: () => { pressed.value = 0; },
    onActivate: e => onPick(e.absoluteX - e.x, e.absoluteY - e.y), // 磚的左上角（螢幕座標），打開時從這裡放大
  });
  const hold = useLongPressGesture({
    runOnJS: true,
    enabled: !p.editing,
    minDuration: G.longPressMs,
    maxDistance: G.longPressMove,
    onActivate: e => onMenu(e.absoluteX - e.x, e.absoluteY - e.y), // 磚的左上角（螢幕座標）
  });
  const held = useSharedValue(0);
  const pan = useDragPan({
    enabled: true, editing: p.editing, w: p.w, screenW: p.screenW, gw: p.gw, fw: p.w, calm, dg: p.dg, held,
    onStart: onDragStart, onAim, onEdge, onDrop,
  });
  const gesture = useExclusiveGestures(useSimultaneousGestures(hold, pan), tap);
  // 抖動：跟目錄的磚同一套（相鄰兩塊方向相反）。減少動態：不抖
  const rot = useSharedValue(0);
  useEffect(() => {
    if (!p.editing || calm) { cancelAnimation(rot); rot.value = 0; return; }
    const a = p.k % 2 ? -M.jiggle.deg : M.jiggle.deg;
    rot.value = withRepeat(withSequence(withTiming(a, { duration: M.jiggle.half }), withTiming(-a, { duration: M.jiggle.half })), -1, true);
    return () => cancelAnimation(rot);
  }, [p.editing, calm]); // eslint-disable-line react-hooks/exhaustive-deps
  // 同 Tile：動畫裡不准碰 p（p.n 是紙物件）
  const ghost = p.ghost;
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }, { scale: 1 + held.value * (HOLD_SCALE - 1) }],
    opacity: ghost ? 0 : 1 - pressed.value * (1 - PRESS_DIM),
  }), WEB_DEPS ? [ghost] : undefined);
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[st.fslot, { left: p.x, top: p.y }, style]} layout={calm ? undefined : TILE_MOVE} accessible accessibilityRole="button" accessibilityLabel={p.label}
        accessibilityState={{ selected: p.cur }} accessibilityActions={NOTE_IN_A11Y}
        onAccessibilityAction={(e: AccessibilityActionEvent) => api.a11yNote(id, e.nativeEvent.actionName)}>
        <TileFace n={p.n} w={p.w} cur={p.cur} />
        {p.editing && <Minus onPress={() => api.minusNote(id)} held={held} inset={(p.w - sizeOf(p.w)) / 2} />}
      </Animated.View>
    </GestureDetector>
  );
}
// 同目錄的磚（TileM）：只在樣子、位置、狀態變了才重畫
const FolderTileM = memo(FolderTile, (a, b) => a.n.id === b.n.id && a.fid === b.fid && a.face === b.face && a.k === b.k
  && a.x === b.x && a.y === b.y && a.w === b.w && a.calm === b.calm && a.editing === b.editing && a.cur === b.cur && a.ghost === b.ghost
  && a.screenW === b.screenW && a.gw === b.gw && a.label === b.label);
// 長按選單時浮起來的那塊（2026-11-02 照虛擬手機原型）：畫在暗幕上面、原本那塊的位置，放大一點加陰影。減少動態：不放大
function Lifted({ x, y, calm, children }: { x: number; y: number; calm: boolean; children: ReactNode }) {
  const up = useSharedValue(calm ? MENU_LIFT : 1);
  useEffect(() => { if (!calm) up.value = withSpring(MENU_LIFT, LIFT_SPRING); }, [calm]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ transform: [{ scale: up.value }] }));
  return <Animated.View pointerEvents="none" style={[st.ghost, { left: x, top: y }, style]}>{children}</Animated.View>;
}

// 點一張打開（2026-11-02，照 iOS 開 App）：一塊紙色從那塊磚的位置放大到鋪滿面板（W×H），名字跟著淡掉；鋪滿了 onDone（面板淡出）。
// worklet 裡只用拆出來的數字（規矩檔：不准抓物件）
type LaunchProps = { x: number; y: number; w: number; color: ColorKey; title: string; W: number; H: number; onDone: () => void };
function Launch({ x, y, w, color, title, W, H, onDone }: LaunchProps) {
  const c = useColors();
  const nc = useNoteColors(color);
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: M.launch.duration, easing: Easing.out(Easing.cubic) }, f => { if (f) scheduleOnRN(onDone); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const R = w * RADIUS; // 從方磚的圓角開始（2026-11-03 改 1×1）
  const box = useAnimatedStyle(() => ({
    left: x * (1 - t.value), top: y * (1 - t.value), width: w + (W - w) * t.value, height: w + (H - w) * t.value, borderRadius: R * (1 - t.value),
  }));
  const text = useAnimatedStyle(() => ({ opacity: 1 - t.value }));
  return (
    <Animated.View pointerEvents="none" style={[st.launch, { backgroundColor: nc.bg, borderColor: nc.rule }, box]}>
      <Animated.Text style={[st.tileText, { color: c.textPrimary }, text]} numberOfLines={2}>{title}</Animated.Text>
    </Animated.View>
  );
}

// 拿起來的那張（D4 起目錄、資料夾共用）：畫在目錄最上層，從拿起那格的位置跟著手指平移，浮起一點（放大＋陰影）。不接觸控，手勢還在原本那塊上
// 疊上去放手時（dg.sink 0→1）邊滑到底下那張上、邊縮小淡掉（2026-11-02 照 iOS；減少動態：直接消失）
function DragGhost({ dg, calm, children }: { dg: DG; calm: boolean; children: ReactNode }) {
  const style = useAnimatedStyle(() => ({
    opacity: calm && dg.sink.value > 0 ? 0 : 1 - dg.sink.value,
    transform: [{ translateX: dg.x0.value + dg.dx.value + dg.cx.value }, { translateY: dg.y0.value + dg.dy.value + dg.cy.value },
      { scale: (1 + dg.lift.value * (HOLD_SCALE - 1)) * (1 - dg.sink.value * (1 - SINK_SCALE)) }],
  }));
  return <Animated.View pointerEvents="none" style={[st.ghost, st.ghostAt, style]}>{children}</Animated.View>;
}

// 一塊磚的樣子（2026-11-03 改 1×1，照 iPhone 主畫面的 App）：w＝格子寬。上面是置中的方磚——整塊是紙的主色（hd，UI 範本 v2 拿掉右下角的色圓）、正中間名字的第一個字；
// 下面是名字（一行，太長尾巴變「…」）。正在看的那張方磚用 accent 框起來（面板上唯一的 accent），釘選的右上角一個圖釘（次要字色，C1）
function TileFace({ n, w, cur, hideName }: { n: Note; w: number; cur: boolean; hideName?: boolean }) {
  const c = useColors();
  const nc = useNoteColors(n.color);
  const s = sizeOf(w);
  return (
    <View style={[st.cell, { width: w }]}>
      <View style={[st.tile, { width: s, height: s, borderRadius: s * RADIUS, backgroundColor: nc.hd, borderColor: cur ? c.accent : nc.rule,
        borderWidth: cur ? T.shape.borderSelected : T.shape.borderCard }]}>
        {/* 正中間一個字（2026-11-03 多米：只有顏色很難認）：自己設的，沒設就是名字的第一個字；沒取名（也沒設）是「未」；字色照磚的顏色配（深色磚白字） */}
        <Text style={[st.glyph, { fontSize: Math.round(s * T.shape.tileGlyphRatio), color: nc.ink }]}
          allowFontScaling={false} accessible={false}>{glyphOf(n)}</Text>
        {n.pinned ? <View style={st.pin}><Sym name="pin.fill" size={12} color={nc.ink} /></View> : null}
      </View>
      {/* 沒取名的跟紙的標題列一樣用次要色，看得出是「還沒取名」不是名字 */}
      <TileName t={label(n)} color={n.title.trim() ? c.textPrimary : c.textSecondary} hide={hideName} />
    </View>
  );
}
function TileName({ t, color, hide }: { t: string; color: string; hide?: boolean }) {
  return <Text style={[st.tileName, { color }, hide && st.nameHidden]} numberOfLines={1} maxFontSizeMultiplier={T.font.titleMaxScale}>{t}</Text>;
}

// 資料夾磚（2026-11-03 改 1×1，照 iOS 檔案夾）：跟紙磚一樣大，方磚裡 3×3 小方塊、每塊是裡面一張紙的顏色（最多九張），名字在下面。
// 底用整頁底色、框用分隔線色，跟紙磚的紙色分得開；正在看的紙在裡面就用 accent 框
function FolderFace({ f, notes, w, cur, hideName }: { f: Folder; notes: Note[]; w: number; cur: boolean; hideName?: boolean }) {
  const c = useColors();
  const s = sizeOf(w), N = T.shape.folderMinis, gap = T.shape.folderMiniGap, pad = T.shape.folderMiniPad;
  const mini = Math.floor((s - pad * 2 - gap * (N - 1) - T.shape.borderSelected * 2) / N);
  return (
    <View style={[st.cell, { width: w }]}>
      <View style={[st.tile, st.minis, { width: s, height: s, borderRadius: s * RADIUS, padding: pad, gap, backgroundColor: c.page,
        borderColor: cur ? c.accent : c.separator, borderWidth: cur ? T.shape.borderSelected : T.shape.borderCard }]}>
        {notes.slice(0, N * N).map(n => <Mini key={n.id} n={n} w={mini} />)}
      </View>
      <TileName t={f.name} color={c.textPrimary} hide={hideName} />
    </View>
  );
}
// 資料夾磚裡的小方塊：那張紙的卡片顏色（hd，比紙的底色深，2026-11-03 多米：米色底跟資料夾底分不出來）＋它磚上的字。
// 只有收著的資料夾磚這樣畫；打開的資料夾裡照舊是一般的磚
function Mini({ n, w }: { n: Note; w: number }) {
  const nc = useNoteColors(n.color);
  return (
    <View style={[st.mini, { width: w, height: w, borderRadius: w * RADIUS, backgroundColor: nc.hd, borderColor: nc.rule }]}>
      <Text style={[st.glyph, { fontSize: Math.round(w * T.shape.tileGlyphRatio * T.shape.folderMiniGlyph), color: nc.ink }]}
        allowFontScaling={false} accessible={false}>{glyphOf(n)}</Text>
    </View>
  );
}

// 搜尋筆記的一組（2026-11-03）：上面一條是哪張清單（色點＋名字，名字中了就把那段標出來），下面是符合的每一行，打中的字用 accent 粗體。
// 行很長、打中的字在後面時，從打中的字前面幾個字開始顯示（前面補 …），不然兩行內看不到打中的地方
const LEAD = 12; // 打中的字前面留幾個字
function Marked({ t, q, style, lines }: { t: string; q: string; style: object; lines?: number }) {
  const c = useColors();
  const k = q.toLowerCase(), at = t.toLowerCase().indexOf(k);
  const flat = t.replace(/\n/g, ' ');
  if (at < 0 || !k) return <Text style={style} numberOfLines={lines}>{flat}</Text>;
  const from = at > LEAD ? at - LEAD : 0;
  return (
    <Text style={style} numberOfLines={lines}>
      {from ? '…' : ''}{flat.slice(from, at)}
      <Text style={[st.hitMark, { color: c.accent }]}>{flat.slice(at, at + k.length)}</Text>
      {flat.slice(at + k.length)}
    </Text>
  );
}
// 搜尋結果攤平成一列一列給 FlatList（2026-11-04 效能）：每張一列標題、接著它符合的每一行。
// 以前一張是一整塊（上下內距、底下一條線包著）；攤平之後內距與線分給那張的第一列、最後一列，看起來跟以前一樣
const HIT_FIRST = 20, HIT_WINDOW = 5; // 一開始先畫幾列；畫面上下各多留幾個螢幕高（FlatList 預設 21 個螢幕，上千列時打一個字還是要重畫幾百列）
type HitRow = { key: string; h: LineHit; line?: LineHit['lines'][number]; first: boolean; last: boolean };
function hitRows(hits: LineHit[]): HitRow[] {
  const out: HitRow[] = [];
  for (const h of hits) {
    out.push({ key: h.note.id, h, first: true, last: !h.lines.length });
    h.lines.forEach((l, i) => out.push({ key: `${h.note.id}/${l.id || i}`, h, line: l, first: false, last: i === h.lines.length - 1 }));
  }
  return out;
}
function HitRowView({ r, q, onNote, onLine }: { r: HitRow; q: string; onNote: () => void; onLine: (id: string) => void }) {
  const c = useColors();
  const nc = useNoteColors(r.h.note.color);
  const { h, line: l } = r;
  return (
    <View style={[r.first && st.hitFirst, r.last && [st.hitLast, { borderBottomColor: c.separator }]]}>
      {l ? (
        <Pressable onPress={() => onLine(l.id)} accessibilityRole="button" accessibilityLabel={`${l.t}，在「${label(h.note)}」`}
          style={({ pressed }) => [st.hitLine, pressed && { backgroundColor: c.pressedFill }]}>
          <Marked t={l.t} q={q} lines={2} style={[st.hitText, { color: l.done ? c.textStrike : c.textPrimary }, l.done && st.hitDone]} />
        </Pressable>
      ) : (
        <Pressable onPress={onNote} accessibilityRole="button" accessibilityLabel={`打開「${label(h.note)}」`}
          style={({ pressed }) => [st.hitHead, pressed && { opacity: T.motion.pressDim }]}>
          <View style={[st.dot, { backgroundColor: nc.hd }]} />
          {h.title ? <Marked t={label(h.note)} q={q} style={[st.hitTitle, { color: c.textSecondary }]} lines={1} />
            : <Text style={[st.hitTitle, { color: c.textSecondary }]} numberOfLines={1}>{label(h.note)}</Text>}
        </Pressable>
      )}
    </View>
  );
}

// 打開的資料夾上面的名字：點了就能打，打一個字存一次（框收起時輸入框直接拿掉，等不到 blur）；清空不存，收鍵盤時變回原名。
// 打字只存檔、不重畫（2026-11-04 效能，跟紙上打字同一個做法）：以前每打一個字整個 app 重畫一次，目錄裡每塊磚的手勢都重設一遍。
// 框裡的字自己顯示；後面目錄那塊磚上的名字，框收起時目錄重畫就換成新的
function FolderName({ f, focus, inset }: { f: Folder; focus: boolean; inset: number }) {
  const c = useColors();
  const [draft, setDraft] = useState(f.name);
  return (
    <TextInput value={draft} autoFocus={focus} selectTextOnFocus={focus} returnKeyType="done" accessibilityLabel="資料夾名字"
      onChangeText={v => { setDraft(v); if (renameFolder(store.s, f.id, v, Date.now())) store.save(); }}
      onBlur={() => { if (!draft.trim()) setDraft(f.name); }}
      style={[st.folderName, { color: c.textPrimary, width: '100%', paddingLeft: inset, paddingRight: inset }]} />
  );
}

const st = StyleSheet.create({
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: T.shape.radiusLg, borderTopRightRadius: T.shape.radiusLg, ...T.shape.shadowSoft },
  grabBox: { position: 'absolute', left: 0, right: 0, height: T.shape.hitMin, alignItems: 'center', justifyContent: 'center' },
  grab: { width: T.shape.handleSolo, height: T.shape.dirGrab, borderRadius: T.shape.pill(T.shape.dirGrab), opacity: T.shape.handleOff },
  top: { flexDirection: 'row', alignItems: 'center', gap: T.space.m, paddingHorizontal: T.space.gutter, paddingBottom: T.space.s },
  search: { flex: 1, height: T.shape.hitMin, borderRadius: T.shape.radiusSm, flexDirection: 'row', alignItems: 'center', gap: T.space.s,
    paddingHorizontal: T.space.m },
  // alignSelf stretch：輸入框撐滿 44 高的藥丸，字由 iOS 自己垂直置中。只靠字的本身高度時，中文字的上緣會被切掉（多米 2026-11-01 真機）
  searchInput: { flex: 1, minWidth: 0, alignSelf: 'stretch', ...T.font.body, paddingVertical: 0 },
  done: { height: T.shape.hitMin, borderRadius: T.shape.pill(T.shape.hitMin) },
  doneHit: { flex: 1, justifyContent: 'center', paddingHorizontal: T.space.l },
  doneText: { ...T.font.headline },
  body: { paddingHorizontal: T.space.l, paddingTop: T.space.s, paddingBottom: T.space.l },
  moveHead: { ...T.font.callout, marginBottom: T.space.s, marginHorizontal: T.space.l + T.space.xs },
  page: { paddingHorizontal: T.space.l, paddingTop: T.space.s },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: T.space.s, paddingVertical: T.space.s },
  dot: { width: T.shape.pageDot, height: T.shape.pageDot, borderRadius: T.shape.pill(T.shape.pageDot) },
  // 一張的第一列、最後一列（攤平之前是包住整張的那塊：上下內距 s、底下一條線）
  hitFirst: { paddingTop: T.space.s },
  hitLast: { paddingBottom: T.space.s, borderBottomWidth: StyleSheet.hairlineWidth },
  hitHead: { flexDirection: 'row', alignItems: 'center', gap: T.space.s, minHeight: T.shape.hitMin },
  hitTitle: { ...T.font.callout, fontWeight: T.font.semibold, flex: 1 },
  hitLine: { justifyContent: 'center', minHeight: T.shape.hitMin, paddingVertical: T.space.s, paddingHorizontal: T.space.m, borderRadius: T.shape.radiusMd },
  hitText: { ...T.font.body },
  hitDone: { textDecorationLine: 'line-through' },
  hitMark: { fontWeight: T.font.semibold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: T.shape.tileRowGap, marginTop: T.space.m },
  ghost: { position: 'absolute', ...T.shape.shadowSoft },
  ghostAt: { left: 0, top: 0 },
  plate: { position: 'absolute', top: 0 },
  nameHidden: { opacity: 0 },
  hidden: { opacity: 0 },
  // 一格（方磚＋名字）：方磚置中在上面，名字在下面
  cell: { alignItems: 'center', gap: T.shape.tileLabelGap },
  tile: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  glyph: { fontWeight: T.font.semibold, textAlign: 'center' },
  tileText: { ...T.font.headline }, // 打開時放大那塊上面的名字（Launch）
  tileName: { ...T.font.label, lineHeight: T.shape.tileLabelH, textAlign: 'center', alignSelf: 'stretch', paddingHorizontal: T.space.xs },
  pin: { position: 'absolute', top: T.space.xs, right: T.space.xs },
  // 頂端「新的一張」：跟「完成」同一個位置的玻璃圓鈕
  newBtn: { width: T.shape.hitMin, height: T.shape.hitMin, borderRadius: T.shape.pill(T.shape.hitMin) },
  newHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  trashRow: { flexDirection: 'row', alignItems: 'center', gap: T.space.s, minHeight: T.shape.hitMin, marginHorizontal: T.space.l,
    paddingVertical: T.space.m, borderTopWidth: StyleSheet.hairlineWidth },
  trashText: { ...T.font.body },
  // 資料夾磚裡 3×3 小方塊（2026-11-03 改 1×1）
  minis: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start' },
  mini: { borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  parked: { position: 'absolute', left: 0, top: 0 },
  launch: { position: 'absolute', borderWidth: T.shape.borderCard, padding: T.space.m, overflow: 'hidden' },
  folderWrap: { justifyContent: 'center' },
  // 「−」壓在磚的左上角、一半露在外面（像 iOS）
  minus: { position: 'absolute', top: -T.space.s, left: -T.space.s, width: T.shape.minusBadge, height: T.shape.minusBadge,
    borderRadius: T.shape.pill(T.shape.minusBadge), alignItems: 'center', justifyContent: 'center' },
  // 打開的資料夾（2026-11-02 照 iOS）：毛玻璃般的半透明大圓角盒子，名字大字、靠左、放在盒子上面
  folderBox: { alignSelf: 'center', borderRadius: T.shape.radiusLg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', ...T.shape.shadowSoft },
  // position relative：網頁預覽裡輸入框預設不是 relative，會被前面 absolute 的霧蓋住（iOS 本來就照順序疊）
  folderName: { position: 'relative', ...T.font.title, textAlign: 'left', paddingVertical: T.space.m },
  fdots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: T.space.s, height: T.shape.folderDotsH, marginBottom: T.space.s },
  fslot: { position: 'absolute' },
});

// 紙：app 的根畫面（重新設計分支「紙是家」）。上面是清單名（點一下開目錄）和 ⋯；中間一行一行的字，
// 像筆記本：沒有卡片，只有一條淡格線。標題列下面是時間列；右下角 ＋ 在最上面開一行、鍵盤升起，鍵盤膠囊上也有一顆 ＋。
// （多米 2026-10-31：頂部「＋ 新增一行」試過一輪拿掉，時間列留著）
// 打字中按 Return＝在這行下面長出新的一行（游標後面的字一起搬過去）；空行按 Return＝收鍵盤（多米 2026-10-31 第一輪，跟網頁版一樣）。
// 一行點一下就進編輯（多米 2026-10-31 第二輪試驗：之前是點兩下，因為輸入框自己收觸控時捲動會誤觸；現在輸入框上有蓋板、
// 點擊走手勢系統，手指一移動手勢就作廢，理論上捲動不會再誤觸。真機還會誤觸就改回 numberOfTaps: 2）；往右滑＝劃掉（留在原位，只加刪除線）；
// 往左滑＝刪除（進這張紙的最近刪除）；長按＝劃掉／搬到／複製／刪除的選單；
// 每行右邊常駐一個把手，拖了就排順序（多米 2026-11-01 定；之前要先 ⋯ →「排順序」進模式，推翻重新設計第二輪 #127）。開目錄只有點清單名（紙頂端往下拉 2026-11-01 拿掉）。
// 從 app/note/[id].tsx 搬過來的滑動與拖曳手勢（worklet），2026-11-01 手感第一輪改了放手那段：滑回、彈回、滑出、讓位、落地都是接手指速度的彈簧，
// 越線的字會亮起來、放手那一刻就劃，拿起來的行浮起、放下滑進落點並震一下（細節在 .vibe/待審-手感極致微調清單.md 第一、二節）。
// 顏色、字級、間距、動畫數字全部來自 src/lib/tokens.ts，這裡不寫裸數字。
import * as Clipboard from 'expo-clipboard';
import { memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type RefObject } from 'react';
import {
  AppState, Keyboard, Platform, Pressable, ScrollView as RNScrollView, Share, StyleSheet, Text, TextInput, useWindowDimensions, View,
  type AccessibilityActionEvent, type TextInputInstance, type TextInputKeyPressEvent, type ViewInstance,
} from 'react-native';
import { GestureDetector, ScrollView, useExclusiveGestures, useLongPressGesture, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { KeyboardEvents, useKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, {
  Easing, Extrapolation, FadeIn, interpolate, LayoutAnimationConfig, LinearTransition,
  scrollTo as scrollToUI, useAnimatedReaction, useAnimatedRef, useAnimatedStyle, useDerivedValue, useFrameCallback, useReducedMotion, useScrollOffset, useSharedValue, withDelay, withSpring, withTiming, type AnimatedRef, type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { buildGeo, countBelow, EMPTY_GEO, estimateLines, hitRow, landOffset, maps, midsOf, movedGeo, sameGeo, sameIds, windowOf, type Geo } from '../lib/rows';
import { ago, binDone, binItem, caretAt, convertNote, dropNotes, FULL_MSG, fillHole, fullDate, isEmpty, leaveHole, markDeleted, markRestored, PIN_MAX, pinnedNotes, plain, roomOf, uid, unbinDone, unbinItem, type ColorKey, type Item, type Note, type TextLine } from '../lib/model';
import { togglePin } from './pin';
import { newNote, store, useStore } from '../lib/store';
import { haptic, T, useColors, useNoteColors, type Colors } from '../lib/tokens';
import type { Act } from './Acts';
import { ui } from './Overlay';
import { Composer } from './Composer';
import { dirPanel } from './DirPanel';
import { HAS_NATIVE_MENU, NativeMenu } from './NativeMenu';
import { PopMenu } from './PopMenu';
import { Swatches } from './Swatches';
import { Sym } from './Sym';
import { DoneBtn, GlassBtn } from './WebBars';
import { barSlot } from './PageBar';
import { NoteIcon } from './NoteIcon';
import { switchPanel } from './SwitchPanel';
import { perf } from '../lib/perf';

// 空紙上的茄子：扁平線條版（多米 2026-10-31 生的圖，去背後放 assets；轉成 WebP 品質 85，135 KB → 16 KB，顯示才 96pt 看不出差別）
// 給手勢（UI 執行緒）呼叫的都放模組層級：worklet 抓到的物件會被凍住，抓到筆記或某一行就改不動了
const dismissKb = () => Keyboard.dismiss();
// 把游標放到某一格：iOS 用 setSelection；網頁預覽的輸入框就是 DOM 的 textarea，沒有 setSelection，只有 setSelectionRange
function placeCaret(inp: TextInputInstance, at: number) {
  if (typeof inp.setSelection === 'function') return inp.setSelection(at, at);
  (inp as unknown as { setSelectionRange?: (s: number, e: number) => void }).setSelectionRange?.(at, at);
}
// 手勢在 UI 執行緒上發現「越線了」「跨過一行了」，排回 JS 震一下。一定要是模組層級的函式（規矩檔：worklet 裡不准直接叫 tokens 的函式）
const hapticArm = () => haptic('swipeArm');
const hapticPass = () => haptic('dragPass');
const hapticLand = () => haptic('dragDrop'); // 排順序放手那一刻
// useAnimatedStyle 的相依陣列只有網頁用得到，iOS 上傳了會一直跳警告
const WEB_DEPS = Platform.OS === 'web';
// 行的過場（2026-11-01 第二輪 K4）：長出來淡入、拿掉淡出，其他行滑到新位置。減少動態時不滑（直接到位），淡入淡出照舊；
// 整張紙第一次畫出來時不播（LayoutAnimationConfig skipEntering）。換紙時整張紙淡入（S2），第一次打開 app 那張不淡，交給啟動畫面
const ROW_IN = FadeIn.duration(T.motion.fade);
const ROW_SHIFT_MS = T.motion.rowShift.duration, FADE_MS = T.motion.fade;
// 右上 ⋯ 讓位給 ✓ 時用鍵盤的時鐘滑過去（2-4 連續：之前瞬間跳一格）
const KBF = T.motion.keyboardFollow;
const KB_EASING = Easing.bezier(KBF.easing[0], KBF.easing[1], KBF.easing[2], KBF.easing[3]);
const KB_SLIDE = LinearTransition.duration(KBF.duration).easing(KB_EASING);
const NOOP = () => {};
// 一行字的高度與上下留白（字級與行高看 tokens 的 bodyLine，上下各 12）
const LINE_H = T.font.line.lineHeight;
const PAD_V = T.space.m;
const ROW_MIN = T.shape.rowMin;
// 只掛畫面附近的行（2026-11-04 手感引擎）：捲到的那一段，再往上、往下各多 WIN_BUF 個螢幕；捲過 1/WIN_STEP 個螢幕才重看一次
const WIN_BUF = 1.25, WIN_STEP = 4;
const rowMinH = (fs: number) => Math.max(ROW_MIN, Math.round(LINE_H * fs) + PAD_V * 2);
// 字可以用的寬：扣掉行的左內距、字跟把手的縫、把手、字的左右內距（估還沒量過的行有幾行字用）
const TEXT_INSET = T.space.l + T.space.xs + T.shape.hitMin + T.space.xs * 2;
const TEXT_DROP = Platform.OS === 'ios' ? T.font.lineInputDrop : 0; // 一般文字跟輸入框的字差多少，見 tokens
const FRAME_MS = 16; // 第一格還不知道距離上一格多久，當成 16 毫秒
const SEEK_NEAR = 3; // 搜尋點過來的那行在幾個螢幕內才用捲的，更遠就直接跳過去
// 清單照舊用 RNGH 的 ScrollView（行上的滑動、把手要跟它協調），包成 Animated 才拿得到逐格的捲動位置、在 UI 執行緒捲它
// （RNGH v3 的 ScrollView 是函式元件、ref 照 React 19 當一般 prop 往下交，型別上當成 RN 的 ScrollView）
const ListScroll = Animated.createAnimatedComponent(ScrollView as unknown as typeof RNScrollView);
type ScrollViewInstance = RNScrollView;
// 拖「≡」排順序拖到清單上緣、下緣（autoEdge 點以內）：紙自己往那邊捲，越靠邊越快，最快 autoSpeed 點／秒（2026-11-03 多米選）
const AUTO_EDGE = T.gesture.dragAutoEdge, AUTO_SPEED = T.gesture.dragAutoSpeed;
// 給行的動畫 worklet 用的值，先抄成數字和自己的物件（worklet 抓到的物件會被鎖住，規矩檔）
const SHIFT_SPRING = { ...T.motion.dragShift.spring }, LIFT_SPRING = { ...T.motion.dragLift.spring }, LAND_SPRING = { ...T.motion.dragLand.spring };
const LIFT_SCALE = T.motion.dragLift.scale, LIFT_SHADOW = T.shape.shadowSoft.shadowOpacity;
const SW_ACTIVATE = T.gesture.swipeActivate, SW_FAIL_Y = T.gesture.swipeFailY, LONG_MOVE = T.gesture.longPressMove;
const STRIKE_MAX = T.gesture.strikeMax, STRIKE_RATIO = T.gesture.strikeRatio, DELETE_MAX = T.gesture.deleteMax, DELETE_RATIO = T.gesture.deleteRatio;
const DRAG_ACTIVATE = T.gesture.dragActivate, DRAG_FAIL_X = T.gesture.dragFailX;
const STRIKE_SPRING = { ...T.motion.strikeReturn.spring }, DELETE_SPRING = { ...T.motion.deleteSlide.spring }, SNAP_SPRING = { ...T.motion.snapBack.spring }, LABEL_SPRING = { ...T.motion.swipeLabel.spring };
const STRIKE_FADE = T.motion.strikeReturn.reducedFade, DELETE_FADE = T.motion.deleteSlide.reducedFade, DIM_FROM = T.motion.reducedDimFrom;
const LABEL_FROM = T.motion.swipeLabel.fromOpacity, LABEL_ARM = T.motion.swipeLabel.armScale;

export function Paper({ n }: { n: Note }) {
  useStore();
  // 開發版才有：換到這張到畫出第一格花多久（lib/perf，印在終端機）
  useState(() => perf.start('paper'));
  useEffect(() => { perf.end('paper', `掛上紙「${n.title.trim() || '未命名'}」（${n.items.length} 行）`); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [, force] = useReducer((x: number) => x + 1, 0);
  const insets = useSafeAreaInsets();
  const calm = useReducedMotion();
  const { fontScale: fs, height: winH, width: winW } = useWindowDimensions();
  const c = useColors();
  const nc = useNoteColors(n.color);
  // 整頁撥過來的這張（B4）：不淡入、裡面的東西也不跑進場動畫，接手的那一刻才跟旁邊那張的預覽一模一樣
  const closed = useRef(false);
  const mounted = useRef(true);
  const scrollRef = useAnimatedRef<ScrollViewInstance>();
  const scrollY = useScrollOffset(scrollRef); // 清單捲到哪（UI 執行緒逐格更新；只做看得到的行、拖到邊緣自動捲用）
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [rowMenu, setRowMenu] = useState<{ id: string; top: number } | null>(null); // 長按哪一行、選單放多高
  // 底部輸入框（多米 2026-11-01）：按 ＋ 升起、在裡面打；draft＝框裡現在的字（不受控輸入框，送出或收起時才拿）
  const [composing, setComposing] = useState(false);
  const draft = useRef('');
  // 正在編輯哪一行：只有這一行的輸入框收得到觸控，其他行要經過點一下的手勢才會進來（捲動時手指有移動，手勢不成立）
  const [editing, setEditingState] = useState<string | null>(null);
  const editingRef = useRef<string | null>(null);
  const setEditing = (id: string | null) => { editingRef.current = id; setEditingState(id); };
  const inputs = useRef<Record<string, TextInputInstance | null>>({});
  // 每一行站哪裡（清單引擎算好的，見 LineList）；看不到、沒掛上的行也查得到
  const geoRef = useRef<Geo>(EMPTY_GEO);
  const rowBox = (id: string | null) => {
    const g = geoRef.current, i = id ? g.at.get(id) : undefined;
    return i === undefined ? null : { y: g.ys[i], h: g.hs[i] };
  };
  const listCtl = useRef<ListCtl>({ fade: NOOP, removed: NOOP });
  const anchorNext = useRef(false); // 下一次位置改變時畫面原地不動（輸入框送出、留在原地）
  const renders = useRef(0);
  renders.current++;
  // 輸入框不受控（defaultValue），程式改了某行的字（Return 把游標後面的字切走）要讓那行的輸入框重掛才會更新：每切一次 +1
  const revs = useRef<Record<string, number>>({});
  const pending = useRef<{ id: string; caret?: number } | null>(null);
  const focused = useRef<string | null>(null);

  // 舊的文字筆記打開時轉成清單（一段一行）
  const converted = useRef(false);
  if (!converted.current) {
    converted.current = true;
    if (n.type === 'text') { convertNote(n); store.save(); }
  }

  // quiet＝打字：只存檔不重畫。新增、劃掉、刪除這類改了結構的才重畫。app 正要進背景時立刻寫入
  function touch(quiet?: boolean) {
    n.updated = Date.now();
    if (!quiet) store.change();
    else if (AppState.currentState === 'active') store.save();
    else store.flush();
  }

  /* ---------- 劃掉、刪除、移動 ---------- */
  // 劃掉：留在原位，只加刪除線（多米 2026-10-31：劃掉的還會再看、還會有新想法；真的不要會自己刪）
  // fromSwipe＝從滑動來的：手指越線那一刻已經震過（swipeArm），放手不再震；長按選單、VoiceOver 走到這裡才震
  function strike(id: string, fromSwipe = false) {
    const it = n.items.find(i => i.id === id);
    if (!it || !it.t.trim()) return;
    it.done = !it.done;
    touch();
    if (!fromSwipe) haptic('strike');
  }
  // 刪一行：進這張紙的最近刪除（目錄 → 最近刪除裡找得回來），toast 的「復原」只是快速路徑。空行直接拿掉
  function remove(id: string) {
    const idx = n.items.findIndex(i => i.id === id);
    if (idx < 0) return;
    if (!n.items[idx].t.trim()) { n.items.splice(idx, 1); touch(); listCtl.current.removed(); return; }
    binItem(n, id, Date.now());
    touch();
    listCtl.current.removed();
    ui.toast('已移到最近刪除', { label: '復原', fn: () => {
      if (!mounted.current || closed.current) return;
      if (!roomOf(n)) { ui.toast(FULL_MSG); return; }
      unbinItem(n, id, idx); // 放回原來的位置
      touch();
    } });
  }
  // VoiceOver 的「往上移／往下移」：拖曳把手用不了時的替代路徑
  function move(id: string, d: -1 | 1) {
    const idx = n.items.findIndex(i => i.id === id), to = idx + d;
    if (idx < 0 || to < 0 || to >= n.items.length) return;
    const [m] = n.items.splice(idx, 1);
    n.items.splice(to, 0, m);
    touch();
  }
  // 長按一行：跳出選單（滑動之外看得見的路；VoiceOver 另有動作選單）。
  // bottom＝那一行在螢幕上的底邊（行自己量的，不用算捲到哪）；選單放在正下方，放不下就往上收
  function openRowMenu(id: string, bottom: number) {
    Keyboard.dismiss();
    haptic('menu');
    const h = T.shape.menuRow * 4 + T.space.xs * 3 + T.space.s * 2; // 四個項目、三個縫、卡片上下內距（PopMenu 的藥丸版）
    setRowMenu({ id, top: Math.max(insets.top, Math.min(bottom, winH - insets.bottom - h)) });
  }
  function rowActs(id: string): Act[] {
    const it = n.items.find(i => i.id === id);
    if (!it) return [];
    return [
      { label: it.done ? '恢復' : '劃掉', icon: it.done ? 'arrow.uturn.backward' : 'strikethrough', hidden: !it.t.trim(), fn: () => strike(id) },
      { label: '搬到…', icon: 'arrow.turn.up.right', hidden: !it.t.trim(), fn: () => { Keyboard.dismiss(); dirPanel.open(id); } },
      { label: '複製', icon: 'doc.on.doc', hidden: !it.t.trim(), fn: () => { Clipboard.setStringAsync(it.t).then(() => ui.toast('已複製'), () => ui.toast('沒複製到，再按一次')); } },
      { label: '刪除', icon: 'trash', destructive: true, fn: () => listCtl.current.fade(id) }, // 先淡出，淡完才拿掉
    ];
  }
  // VoiceOver 的動作選單
  function rowAction(id: string, a: string) {
    if (a === 'strike') strike(id);
    else if (a === 'remove') listCtl.current.fade(id);
    else if (a === 'up') move(id, -1);
    else if (a === 'down') move(id, 1);
  }

  /* ---------- focus ---------- */
  // 進某一行編輯：先讓那一行的輸入框收觸控，畫完立刻對焦
  // y＝點下去的位置（從這行頂端算）：長的一行點下去時，畫面要捲到你點的那幾個字，不是這行開頭（多米 2026-11-01 第九批）。
  // 沒給（Return 切行、Backspace 併行這類鍵盤來的）就當游標在這行尾巴
  const focusAt = useRef<{ id: string; y?: number } | null>(null);
  function focusItem(id: string, caret?: number, y?: number) {
    pending.current = { id, caret };
    focusAt.current = { id, y };
    setEditing(id); force();
  }
  // 畫完立刻對焦（不等到畫面顯示後），換格時鍵盤不會先收再開
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    const inp = inputs.current[p.id];
    if (!inp) return;
    pending.current = null;
    inp.focus();
    const at = p.caret ?? n.items.find(i => i.id === p.id)?.t.length ?? 0;
    placeCaret(inp, at);
    // iOS 對焦後會把游標放到最後，下一格再放回去（行首 Backspace 併行要停在接點）。輸入框是剛掛上的（2026-11-04 起只有正在打的行才有），
    // 原生那邊晚一點才準備好，再多放一次保險
    requestAnimationFrame(() => { placeCaret(inp, at); requestAnimationFrame(() => placeCaret(inp, at)); });
  });
  // ＋（右下角那顆、鍵盤膠囊那顆）：底下升起輸入框、在裡面打（多米 2026-11-01；之前是在最上面開一空行、整頁捲回頂端）
  function addLine() { if (composing) return; if (!roomOf(n)) { ui.toast(FULL_MSG); return; } haptic('add'); openComposer(); }
  function openComposer() { if (composing) return; draft.current = ''; setComposing(true); }
  const takeDraft = () => { const t = draft.current.trim(); draft.current = ''; return t; };
  // 輸入框送出的字變成紙最上面的一行，畫面捲回頂端讓你看到它（多米 2026-11-01 第八批改定：捲在下面記完畫面沒動，別人會以為壞了；
  // 推翻同日早上的「留在原地」）。動畫照 2-4：
  //   同一刻——新行出現那一刻就開始捲（不等、不分兩段）；用 iOS 自己的捲動動畫（跟點狀態列回頂端同一種，手指可以中途接住）；
  //   到了怎麼認——新行亮一下（跟正在編輯那行同一種底色）再慢慢淡掉，回答「我剛剛記的去哪了」；不加震動（每記一行都震會被習慣掉）；
  //   減少動態——不捲動畫、直接到頂，只留淡掉。
  // 例外：從輸入框「點一行」離開（第四版乙：草稿送出、焦點進那一行）時不捲，你點的是那一行，跳走就打斷你；這時同一格往下補捲新行那麼高，畫面原地不動。
  // 拖曳開始時（手指已在把手上）也一樣不捲。
  // （不用 ScrollView 的 maintainVisibleContentPosition：它會記住最上面那行，拖曳動到頂端幾行時自己挪捲動又捲回頂端，2026-11-01 第七批拿掉）
  const [freshId, setFreshId] = useState<string | null>(null);
  // 從搜尋筆記點某一行過來（2026-11-03）：捲到那行、亮一下。每次畫都看一次（點的可能就是正在看的這張，紙不會重掛）；
  // 清單還沒量好（剛換過來）就等量好（下面的 effect）。很遠就直接跳過去：一路捲過幾百行只會看到一片閃過去
  const seekRow = useRef<string | null>(null);
  const sk = store.takeSeek(l => n.items.some(i => i.id === l));
  if (sk) seekRow.current = sk;
  // 每次畫完都看（沒有相依陣列是故意的）；拿到一次就清掉 seekRow，不會一直重畫
  useEffect(() => { // eslint-disable-line react-hooks/exhaustive-deps
    const id = seekRow.current, l = rowBox(id);
    if (!id || !l || !view.current.h) return;
    seekRow.current = null;
    const to = Math.max(0, l.y - view.current.h / 3);
    scrollTo(to, !calm && Math.abs(to - view.current.y) < view.current.h * SEEK_NEAR);
    setFreshId(id);
  });
  function addFromDraft(t: string) {
    const id = uid();
    const stay = drag.current || editingRef.current !== null;
    anchorNext.current = stay && view.current.y > T.shape.rowMin;
    n.items.unshift({ id, t, done: false, b: false });
    touch();
    if (stay) return;
    scrollTo(0, !calm); // 已經在頂端時不會動；不看 view.y（它只在手指放開時更新，可能是舊的）
    setFreshId(id);
  }
  // Return：送出一行，框留著繼續記；空的就收起（跟空行按 Return 收鍵盤一樣）。回傳有沒有送出，Composer 據此清空、重新對焦
  function sendDraft() {
    if (!roomOf(n)) { ui.toast(FULL_MSG); return false; } // 滿了：字留在輸入框裡，不送出、不清空
    const t = takeDraft();
    if (!t) { closeComposer(); return false; }
    addFromDraft(t);
    return true;
  }
  // 收起輸入框：有字就先送出（字不能丟，2-8）。這裡不收鍵盤：失焦時焦點可能已經在別行的輸入框上，收了會把它的鍵盤也收掉；
  // 輸入框卸載時，它自己的鍵盤會跟著收。
  // 乙（2026-11-01，暗幕拿掉後）：點紙上的行也會走到這裡——草稿先送出、焦點進那一行，畫面留在原地
  function closeComposer() {
    const t = takeDraft();
    if (t) addFromDraft(t);
    setComposing(false);
  }
  // ✓：送出並收起，這條沒有別的輸入框在等焦點，鍵盤一起收
  function doneComposer() { closeComposer(); Keyboard.dismiss(); }
  function cleanupEmpty() {
    const keep = n.items.filter(i => i.t.trim());
    if (keep.length !== n.items.length) { n.items = keep; store.change(); }
  }
  function onFocus(id: string) {
    focused.current = id;
    if (id !== 'title') requestAnimationFrame(() => ensureVisible(id));
  }
  function onBlur(id: string) {
    if (focused.current === id) focused.current = null;
    if (editingRef.current === id) setEditing(null); // 換到別行時 editing 已經是新的那行，這裡不會清掉它
    else force(); // 換到別行：這行的輸入框留到焦點真的移走才拆（鍵盤才不會收了再開），現在可以換回只畫字
    setTimeout(() => {
      if (focused.current || !mounted.current || closed.current) return;
      cleanupEmpty();
    }, T.timing.blurCleanup);
  }

  /* ---------- 鍵盤：不讓系統自動推畫面 ---------- */
  // 系統的自動推畫面，在鍵盤和上面那條工具列先後出現時會推兩次（新的一行先往上跑再往下掉）。
  // 改成自己記住鍵盤頂在哪：正在打的那一行被擋住才捲，沒被擋住就一動也不動。
  const boxRef = useRef<ViewInstance>(null);
  const view = useRef({ top: 0, h: 0, y: 0, kb: Infinity }); // 清單在螢幕上的頂、高，目前捲到哪，鍵盤頂
  const [kbPad, setKbPad] = useState(0);
  // kbUp＝鍵盤正在升起或開著（willShow 起、willHide 止）：右下 ＋ 用它決定要不要畫，才會跟鍵盤同一刻進出；kbPad 要等鍵盤真的收完才歸零，給留白用
  const [kbUp, setKbUp] = useState(false);
  // K7（2026-11-01 第四輪）：膠囊與輸入框的位置不再靠 keyboardWillShow 事件知道終點、自己跑一段 withTiming 猜中間，
  // 改由 react-native-keyboard-controller 在 UI 執行緒逐格給鍵盤高度（kbH，從螢幕底算起）：升降、手指把鍵盤往下拖
  // （ScrollView 的 keyboardDismissMode='interactive'）、拖一半放手彈回，膠囊都貼著鍵盤上緣走。
  // 寫法照套件自家 KeyboardAvoidingView：onMove（升降每一格）、onInteractive（手指拖的每一格）、onEnd（停下）都寫進同一個 shared value；
  // 四個回呼都是 worklet，裡面只准碰 shared value（規矩檔）。網頁沒有這個原生模組，kbH 永遠是 0，跟之前一樣
  const kbH = useSharedValue(0);
  // 清單底邊到視窗底邊的距離（紙是根畫面，實際上是 0）；鍵盤蓋住清單的高度＝鍵盤高度扣掉它
  const below = useSharedValue(0);
  useKeyboardHandler({
    onMove: e => { 'worklet'; kbH.value = e.height; },
    onInteractive: e => { 'worklet'; kbH.value = e.height; },
    onEnd: e => { 'worklet'; kbH.value = e.height; },
  }, []);
  const kbLift = useDerivedValue(() => Math.max(0, kbH.value - below.value), WEB_DEPS ? [] : undefined);
  // 輸入框的位置：貼在鍵盤上面（跟膠囊同一個位置），鍵盤還沒升起時貼著安全區。鍵盤一定比安全區高，所以兩段接得起來、不會跳一下。
  // 2026-11-01 第二版曾改成「升到鍵盤上方那段的正中」，多米真看之後說體感很糟：框自己的滑入（220）疊在跟著鍵盤的位移（250、另一條曲線）上，
  // 一個東西兩段不連續的動（2-4 物理直覺），而且核心動作被做成畫面正中的對話框（2-5 模態是暫時離開主線，記才是主線）。第三版貼回鍵盤、只剩一個時鐘
  const insetBottom = insets.bottom;
  const composerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -Math.max(kbLift.value, insetBottom) }] }), WEB_DEPS ? [insetBottom] : undefined);
  function ensureVisible(id: string | null) {
    const l = rowBox(id), v = view.current;
    if (!l || !v.h) return;
    // 沒被鍵盤和工具列擋住的高度，底下留一點空
    const shown = Math.min(v.h, v.kb - v.top) - T.space.l;
    if (l.h <= shown) {
      // 整行放得下：整行露出來
      if (l.y < v.y) scrollTo(l.y);
      else if (l.y + l.h > v.y + shown) scrollTo(l.y + l.h - shown);
      return;
    }
    // 這行比看得到的地方還高：露出正在打的那幾個字——點的位置，沒點過就是尾巴。之前一律捲到這行開頭，
    // 點長的一行的後半段時，你點的地方反而被捲到鍵盤底下（多米 2026-11-01 第九批）
    const fa = focusAt.current?.id === id ? focusAt.current.y : undefined;
    const p = l.y + (fa ?? l.h - PAD_V);
    const band = Math.round(LINE_H * fs); // 上下各留一行
    if (p - band < v.y) scrollTo(p - band);
    else if (p + band > v.y + shown) scrollTo(p + band - shown);
  }
  // 捲到哪只在「停下來」和「自己捲」的時候記，捲動途中不回報（每一格畫面都回報一次會拖慢捲動）
  function scrollTo(y: number, animated = true) {
    view.current.y = Math.max(0, y);
    scrollRef.current?.scrollTo({ y: view.current.y, animated });
  }
  const scrolled = (e: { nativeEvent: { contentOffset: { y: number } } }) => { view.current.y = e.nativeEvent.contentOffset.y; };
  // 紙頂端再往下拉放手＝開目錄，2026-11-01 多米定拿掉：會跟拖曳排順序搞混。開目錄只剩點清單名
  // 鍵盤頂在哪、要不要捲（ensureVisible）仍在 JS 這邊算，只是事件改聽套件的（跟系統一樣 will／did 兩對）：
  // 它給的是鍵盤高度（從視窗底算），鍵盤頂＝視窗高 − 高度；位置動畫本身已交給上面的 kbH，這裡不再推
  useEffect(() => {
    const show = (e: { height: number }) => {
      const v = view.current;
      v.kb = winH - e.height;
      setKbPad(Math.max(0, v.top + v.h - v.kb));
      setKbUp(true);
      requestAnimationFrame(() => ensureVisible(focused.current));
    };
    // 收起：膠囊（和輸入框）由 kbH 帶著跟鍵盤一起下去；底部留白與 ＋ 等鍵盤真的收完（didHide）才還原（第二輪 K2；之前是瞬間消失）。
    // 中途鍵盤又升起，willShow 會先把 kb 設回有限值，didHide 就不收留白（套件排 did 事件時會取消前一個，照理不會到這裡，留著當保險）
    const hide = () => { view.current.kb = Infinity; setKbUp(false); };
    const hidden = () => { if (view.current.kb === Infinity) setKbPad(0); };
    const subs = [
      KeyboardEvents.addListener('keyboardWillShow', show), KeyboardEvents.addListener('keyboardDidShow', show),
      KeyboardEvents.addListener('keyboardWillHide', hide), KeyboardEvents.addListener('keyboardDidHide', hidden),
    ];
    return () => subs.forEach(s => s.remove());
  }, [winH]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- 在一行裡打字 ---------- */
  // 2026-11-03 多米：一則可以寫很長、分好幾段——Return 在這一則裡換行（不再開新的一則；要新的一則按右下 ＋），
  // 貼上帶換行的字也整段留在這一則（以前 K5 會拆成好幾則）。口述「換行」一樣是這一則裡換行
  function onChange(id: string, v: string) {
    const it = n.items.find(i => i.id === id);
    if (!it) return;
    it.t = v;
    touch(true);
  }
  // Backspace（多米 2026-10-31 A5，跟網頁版一樣）：
  // 空的一行 → 這行拿掉，回到上一行的最後面；
  // 有字的行、游標在行首、沒選取一段 → 這行的字接到上一行尾端、這行拿掉、游標停在接點（字沒丟，不進最近刪除）。
  // 劃掉的行不參與併行（多米定）：上一行劃掉的、或這行自己是劃掉的，Backspace 在行首就只是沒反應。
  // 其他情況（游標不在行首、有選取）交給系統照常刪字。
  // 我們接手的兩種都要 preventDefault：網頁上 Backspace 的預設刪字在這個 handler 之後才跑，那時焦點已經移到上一行、
  // 游標在接點，會多吃掉接點前一個字（網頁預覽抓到的）。iOS 的刪除是原生先做、JS 後到，沒這個問題，preventDefault 在那邊是空的
  function onKey(id: string, e: TextInputKeyPressEvent, sel: Sel) {
    if (e.nativeEvent.key !== 'Backspace') return;
    const idx = n.items.findIndex(i => i.id === id);
    if (idx <= 0) return;
    const it = n.items[idx], prev = n.items[idx - 1];
    if (!it.t) {
      e.preventDefault();
      n.items.splice(idx, 1);
      touch();
      focusItem(prev.id, prev.t.length);
      return;
    }
    if (sel.start !== 0 || sel.end !== 0) return;
    if (prev.done || it.done) return;
    e.preventDefault();
    const at = prev.t.length;
    prev.t += it.t;
    revs.current[prev.id] = (revs.current[prev.id] ?? 0) + 1; // 上一行被程式改字，輸入框要重掛才會顯示新字
    n.items.splice(idx, 1);
    touch();
    focusItem(prev.id, at);
  }

  /* ---------- 排順序 ---------- */
  // 手勢、位置、動畫都在清單引擎（LineList）；紙這邊只有拿起時關掉捲動、放手時改資料
  const listTop = useSharedValue(0), listBot = useSharedValue(0), listH = useSharedValue(0), contentH = useSharedValue(0);
  const kickRef = useRef<() => void>(NOOP);
  const kickWin = () => kickRef.current();
  const drag = useRef(false);
  const [dragging, setDragging] = useState(false);
  function dragBegan() { drag.current = true; setDragging(true); }
  // 走到這裡時畫面上已經換好順序了（UI 執行緒一格內換完），這裡只是把資料改成一樣的，畫面不會再動
  function dragEnded(from: number, to: number, y: number) {
    drag.current = false;
    view.current.y = y; // 自動捲過：記下現在捲到哪（平常只在手放開時記）
    if (from !== to) { const [m] = n.items.splice(from, 1); n.items.splice(to, 0, m); touch(); }
    setDragging(false);
  }
  // 正在打的那行長高了（字多了一行）：點的位置跟著往下，游標通常就在長出來的地方
  function resized(id: string, oldH: number, h: number) {
    const fa = focusAt.current;
    if (fa?.id === id && fa.y !== undefined && h > oldH) fa.y += h - oldH;
  }
  // 輸入框開著時紙變暗（見 render 的 scrimStyle）：暗幕的濃淡 0～1
  const dim = useSharedValue(0);
  useEffect(() => {
    dim.value = withTiming(composing ? 1 : 0, { duration: KBF.duration, easing: KB_EASING });
  }, [composing]); // eslint-disable-line react-hooks/exhaustive-deps
  const scrimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  // 交給清單引擎的動作：引擎拿到的是不會變的一份（手勢只設定一次），呼叫時才找最新的
  const handlers: ListApi = {
    edit: focusItem, menu: openRowMenu, strike: id => strike(id, true), removed: remove, action: rowAction, dragBegan, dragEnded,
    refInput: (id, r) => { inputs.current[id] = r; }, onChange, onKey, onFocus, onBlur,
    freshDone: id => setFreshId(f => (f === id ? null : f)), resized, ensure: ensureVisible,
  };
  const latest = useRef(handlers);
  latest.current = handlers;
  const [api] = useState<ListApi>(() => ({
    edit: (...a) => latest.current.edit(...a), menu: (...a) => latest.current.menu(...a), strike: (...a) => latest.current.strike(...a),
    removed: (...a) => latest.current.removed(...a), action: (...a) => latest.current.action(...a), dragBegan: () => latest.current.dragBegan(),
    dragEnded: (...a) => latest.current.dragEnded(...a), refInput: (...a) => latest.current.refInput(...a), onChange: (...a) => latest.current.onChange(...a),
    onKey: (...a) => latest.current.onKey(...a), onFocus: (...a) => latest.current.onFocus(...a), onBlur: (...a) => latest.current.onBlur(...a),
    freshDone: (...a) => latest.current.freshDone(...a), resized: (...a) => latest.current.resized(...a), ensure: (...a) => latest.current.ensure(...a),
  }));

  /* ---------- open / close ---------- */
  // 換到別張紙（這個元件卸載）時收尾：空行拿掉，整張是空的就不留
  // 2026-11-04（手感第 5 條）：以前不管有沒有改都 store.change()、馬上整份寫存檔，換一次紙就多重畫一次、多一次整份 JSON，全疊在新紙出來那一刻。
  // 現在真的有改才重畫，存檔照一般的慢一拍（切到背景時會立刻寫，字不會丟）
  function closeNote() {
    if (closed.current) return;
    closed.current = true;
    Keyboard.dismiss();
    const t = takeDraft();
    if (t) n.items.unshift({ id: uid(), t, done: false, b: false }); // 輸入框裡打到一半的字跟著這張紙走，不丟
    const keep = n.items.filter(i => i.t.trim());
    let changed = keep.length !== n.items.length;
    n.items = keep;
    if (isEmpty(n)) { dropNotes(store.s, x => x === n, Date.now()); changed = true; } // 立墓碑（iCloud 同步 S0）
    if (changed) store.change();
    else store.save();
  }
  useEffect(() => {
    mounted.current = true;
    // 萬一 effect 被重跑（開發模式），把剛被當成空白移掉的筆記放回去，不能讓它消失
    if (closed.current && !n.deleted && !store.s.notes.some(x => x.id === n.id)) store.s.notes.push(n);
    closed.current = false;
    let t: ReturnType<typeof setTimeout> | undefined, off: (() => void) | undefined;
    // 剛從目錄開的新的一張：目錄收起來之後直接升起輸入框、鍵盤升起（等面板收完才叫鍵盤，兩個動畫疊在一起會卡）。
    // K6（2026-11-01 第三輪）：面板收完那一刻目錄會通知 store（原生堆疊的 transitionEnd closing），收到就馬上開，不用等到 700；
    // 700 留著當保險（網頁預覽沒有那個事件；原生事件沒來也不會卡死）。只開一次
    if (store.fresh === n.id) {
      store.clearFresh();
      const openOnce = () => { off?.(); off = undefined; clearTimeout(t); if (mounted.current) openComposer(); };
      // 切換清單開的新的一張（F3，2026-11-04）：切換清單收完才開這張，不會有目錄收完的通知，直接升起（不白等 freshFocusFallback）
      if (!store.panelOpen) openOnce();
      else { off = store.onPanelClosed(openOnce); t = setTimeout(openOnce, T.timing.freshFocusFallback); }
    }
    store.setLast(n.id); // 關掉 app 時還開著這張，下次打開就直接回到這裡
    return () => { clearTimeout(t); off?.(); mounted.current = false; closeNote(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 控制中心「記一行」（qieji://new，C1）：升起輸入框。app 還沒回到前景就等它回來（不在前景叫不起鍵盤）；
  // 目錄面板開著就等它收完（跟上面從目錄開新的一張同一個理由），沒開就馬上。冷啟動時請求比紙早到，紙掛上來先拿一次
  const composeNow = useRef(openComposer);
  composeNow.current = openComposer;
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined, off: (() => void) | undefined, offApp: (() => void) | undefined;
    const stop = () => { clearTimeout(t); off?.(); off = undefined; offApp?.(); offApp = undefined; };
    const open = () => { stop(); if (mounted.current) composeNow.current(); };
    const whenActive = () => {
      if (!store.panelOpen) return open();
      off = store.onPanelClosed(open);
      t = setTimeout(open, T.timing.freshFocusFallback);
    };
    const go = () => {
      if (!store.takeCompose()) return;
      stop();
      if (AppState.currentState === 'active') return whenActive();
      const sub = AppState.addEventListener('change', s => { if (s === 'active') { offApp?.(); whenActive(); } });
      offApp = () => sub.remove();
    };
    go();
    const unsub = store.onCompose(go);
    return () => { unsub(); stop(); };
  }, []);
  // 目錄長按選單「改名字」（C4）：目錄收完才送來（換了紙就是新掛上的這張先拿一次；點的就是現在這張時紙不重掛，靠通知）
  useEffect(() => {
    const go = () => { if (store.takeRename(n.id)) setRenaming(true); };
    go();
    return store.onRename(go);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 切到別的 app、鎖屏（被打斷）：輸入框裡打到一半的字先送出、框收起、立刻寫入，字不會丟（多米 2026-11-01 定）
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active' || !draft.current.trim()) return;
      closeComposer();
      store.flush();
    });
    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- actions ---------- */
  const name = n.title.trim() || '未命名'; // 多米 2026-11-01 定（原本「沒有名字的一張」）
  const shareText = () => (n.title ? n.title + '\n\n' : '') + plain(n);
  const anyDone = n.items.some(i => i.done);
  // 點左上清單名：從下面升起切換清單（2026-11-04 改版，components/SwitchPanel）。左下膠囊、左右滑換張一起拿掉（多米選）
  function openSwitch() { Keyboard.dismiss(); switchPanel.open(); }
  // 右下 ＋ 畫在紙外面、換張時不重掛（多米 2026-11-03：＋ 要一直停在原地）。每次畫完把最新的內容交過去；
  // 紙卸載時不收回，下一張紙同一輪就會交新的，列不會閃。鍵盤升起、輸入框開著、排順序時不畫。
  // 紙自己的彈出選單（茄記版行的長按、網頁的 ⋯）開著時也不畫：列畫在紙外面、疊在紙的選單上面，不收的話選單後面霧掉了列還清清楚楚、還點得到
  useLayoutEffect(() => {
    barSlot.set({ onAdd: addLine },
      !kbUp && !composing && !menu && !rowMenu);
  });
  function share() { Keyboard.dismiss(); Share.share({ message: shareText() }).catch(() => {}); }
  function pickColor(k: ColorKey) {
    if (n.color === k) return;
    n.color = k;
    touch();
    haptic('color'); // 選單不關，震一下才知道有換到
  }
  // 刪除這張：換到最近改過的另一張；一張都沒有就開一張新的。刪除時間記下來（30 天自動清，2026-11-01 接上），復原時清掉
  // 2026-11-03 多米：目錄裡這張那格留空位、別張不往前補；復原時站回那格（leaveHole、fillHole）
  function del() {
    Keyboard.dismiss();
    const wasPinned = n.pinned; // 復原時釘回去（2026-11-04 程式審查：以前復原回來就沒釘了）
    markDeleted(n, Date.now()); n.pinned = false;
    leaveHole(store.s, n.id, Date.now());
    n.items = n.items.filter(i => i.t.trim());
    const empty = isEmpty(n);
    if (empty) dropNotes(store.s, x => x === n, Date.now());
    closed.current = true;
    const next = store.s.notes.filter(x => !x.deleted).sort((a, b) => b.updated - a.updated)[0] ?? newNote();
    store.open(next.id);
    store.change();
    if (!empty) ui.toast('已移到最近刪除', { label: '復原', fn: () => {
      markRestored(n);
      if (wasPinned && pinnedNotes(store.s).length < PIN_MAX) n.pinned = true; // 這幾秒內又釘滿了就不擠掉別張
      fillHole(store.s, n.id, Date.now()); store.open(n.id); store.change();
    } });
  }
  const setItems = (items: Item[]) => { n.items = items; touch(); };
  const moreActs: Act[] = [
    { label: '改名字', icon: 'pencil', fn: () => setRenaming(true) },
    { label: n.pinned ? '取消釘選' : '釘選', icon: n.pinned ? 'pin.slash' : 'pin', fn: () => togglePin(n) }, // 跟目錄長按選單同一套（pin.ts）
    { label: '分享', icon: 'square.and.arrow.up', fn: share },
    { label: '複製全文', icon: 'doc.on.doc', fn: () => { Clipboard.setStringAsync(shareText()).then(() => ui.toast('已複製'), () => ui.toast('沒複製到，再按一次')); } },
    { label: '清單', inline: true, hidden: n.items.length < 2 && !anyDone, sub: [
      { label: '上下順序反轉', icon: 'arrow.up.arrow.down', hidden: n.items.length < 2, fn: () => setItems([...n.items].reverse()) },
      { label: '全部恢復', icon: 'arrow.uturn.backward', hidden: !anyDone, fn: () => setItems(n.items.map(i => ({ ...i, done: false }))) },
      { label: '清掉劃掉的行', icon: 'eraser', hidden: !anyDone, fn: () => {
        // 清掉的行進最近刪除（F1，2026-11-04：跟刪單行一樣，沒按到復原也找得回來）
        const before = n.items.slice(), gone = new Set(binDone(n, Date.now()).map(i => i.id));
        touch();
        // 復原只放回清掉的那幾行（model unbinDone → putBack）：這幾秒內新記的、刪的、搬走的照留（2026-11-04 程式審查）。
        // 已經換到別張也照樣放回去；這張已經永久拿掉了才不放
        ui.toast(`已把 ${gone.size} 行移到最近刪除`, { label: '復原', fn: () => {
          if (!store.s.notes.includes(n)) return;
          if (unbinDone(n, before, gone)) touch();
        } });
      } },
    ] },
    // 開發版才有（正式版看不到）：一次塞到 LINE_MAX 行，真機試幾百、上千行打開、換張、捲動、拖到邊緣自動捲順不順（2026-11-03）
    { label: '（開發）塞到上限', icon: 'plus', hidden: !__DEV__ || !roomOf(n), fn: () => {
      const add = Array.from({ length: roomOf(n) }, (_, i) => ({ id: uid(), t: `測試第 ${n.items.length + i + 1} 行${i % 7 === 0 ? '，這行寫長一點，看換行之後高度對不對、捲過去會不會跳' : ''}`, done: i % 5 === 0, b: false }));
      setItems([...n.items, ...add]);
    } },
    { label: '刪除這張', icon: 'trash', destructive: true, fn: del },
  ];

  // 空紙：兩行灰字指到右下角的 ＋（茄子插圖多米 2026-11-01 拿掉）
  const emptyView = (
    <View style={st.empty}>
      <Text style={[st.emptyText, { color: c.textSecondary }]}>這張還是空的</Text>
      <Text style={[st.emptyText, { color: c.textSecondary }]}>點右下角的 ＋ 記一行</Text>
    </View>
  );

  // 紙底下那行手勢提示（點一下改字 · 右滑劃掉 · 左滑刪除 · 按住更多）2026-11-01 拿掉：第一次安裝放的教學紙（model.ts TUTORIAL）取代它

  return (
    // 換紙時新的那張淡入（S2）
    <Animated.View style={{ flex: 1, backgroundColor: nc.bg }} collapsable={false} entering={ROW_IN}>
      <LayoutAnimationConfig skipEntering={false}>
      {/* 最上面一行：清單名（⋯ 裡的「改名字」才會變成可以打字，點清單名不會；開目錄在時間那行下面的把手）和 ⋯。
          名字跟著系統字級放大，但最多 1.5 倍，不然會把 ⋯ 擠出去 */}
      {/* 標題區＝清單名那行＋時間那行，到分隔線為止：往下拉開目錄（B3）、左右撥換張（B4）。第一行以下不在裡面（紙上已有把手往下拖排順序） */}
      <View collapsable={false}>
      <View style={[st.bar, { paddingTop: insets.top + T.space.s }]}>
        <View style={st.titleSlide}>
        {renaming ? (
          // 多行輸入框（multiline＋Return 送出）：iOS 單行輸入框畫 28 點粗體中文時字頂會被切，加高也沒用（多米 2026-11-01 兩次回報）；
          // 紙上每一行用的多行輸入框畫中文從沒切過。貼上帶換行的字時換行換成空格，清單名只有一行
          <TextInput autoFocus defaultValue={n.title} placeholder="這張叫什麼" maxFontSizeMultiplier={T.font.titleMaxScale}
            multiline submitBehavior="blurAndSubmit"
            // 網頁的 textarea 預設兩列高，限一列；iOS 不限（限了長名字打到一半會被藏起來）
            {...(Platform.OS === 'web' ? { numberOfLines: 1 } : null)}
            placeholderTextColor={c.textMuted} style={[st.titleInput, { minHeight: T.shape.hitMin, color: c.textPrimary }]} returnKeyType="done"
            accessibilityLabel="清單名"
            onChangeText={v => { n.title = v.replace(/\n/g, ' '); touch(true); }}
            onFocus={() => onFocus('title')} onBlur={() => { setRenaming(false); onBlur('title'); touch(); }}
            onSubmitEditing={dismissKb} />
        ) : (
          // 點清單名＝切換清單（2026-11-04 改版；改名照舊從 ⋯ 的「改名字」或目錄長按選單）。
          // 清單名＝小膠囊（茄紫細框、小方磚＋名字＋▾）。2026-11-04 多米定案，大字那種拿掉
          <Pressable onPress={openSwitch} accessibilityRole="button" accessibilityLabel={`${name}，切換清單`}
            style={({ pressed }) => [st.titleBtn, pressed && { opacity: T.motion.pressDim }]}>
            <View style={[st.pill, { borderColor: c.accent }]}>
              <NoteIcon n={n} size={T.shape.titleIcon} />
              <Text style={[st.pillText, { color: n.title.trim() ? c.textPrimary : c.textSecondary }]} numberOfLines={1}
                maxFontSizeMultiplier={T.font.titleMaxScale}>{name}</Text>
              <Sym name="chevron.down" size={12} color={c.textSecondary} weight="semibold" />
            </View>
          </Pressable>
        )}
        </View>
        {/* ✓ 出現／收起時 ⋯ 跟著鍵盤的時鐘滑過去，不瞬間跳一格（多米 2026-11-01）。減少動態：不滑，直接到位 */}
        <Animated.View layout={calm ? undefined : KB_SLIDE}>
          {/* iOS：真的系統選單（2026-11-02 系統元件化），九個顏色在最上面一排；網頁預覽、舊開發版照舊自己畫的卡片 */}
          {HAS_NATIVE_MENU
            ? <NativeMenu acts={moreActs} label="選單" color={n.color} onColor={pickColor} />
            : <GlassBtn icon="ellipsis" label="選單" onPress={() => { Keyboard.dismiss(); setMenu(true); }} />}
        </Animated.View>
        {/* 在行裡或清單名裡打字時才有的茄紫 ✓（多米 2026-11-01：膠囊拿掉後行裡打字收不掉鍵盤，照 iOS 提醒事項放在右上）。
            看「哪一格在編輯」不看 composing：按輸入框的 ✓ 收起時框先收、鍵盤晚一兩格才開始收，看 composing 會在那幾格閃出一顆 ✓ */}
        {kbUp && (editing !== null || renaming) && <DoneBtn onPress={dismissKb} label="完成，收起鍵盤" />}
      </View>

      {/* 標題列下面：左邊多久前改的、右邊完整時間（多米 2026-10-31 要留） */}
      <View style={[st.timeBox, { borderBottomColor: nc.rule }]}>
        <View style={st.timeRow}>
          <Text style={[st.timeText, { color: c.textSecondary }]}>{ago(n.updated)}</Text>
          <Text style={[st.timeText, { color: c.textSecondary }]}>{fullDate(n.updated)}</Text>
        </View>
      </View>
      </View>

      <View ref={boxRef} style={{ flex: 1 }} collapsable={false}
        onLayout={() => boxRef.current?.measureInWindow((x, y, w, h) => {
          view.current.top = y; view.current.h = h; below.value = Math.max(0, winH - (y + h));
          // 自動捲的上下緣：清單頂端；底下扣掉浮在紙上的底部列
          listTop.value = y; listH.value = h; listBot.value = y + h - (T.shape.barH + insets.bottom + T.space.s * 2);
          kickWin();
          if (seekRow.current) force();
        })}>
        {/* keyboardDismissMode='interactive'（K7）：往下捲過鍵盤時手指可以把鍵盤一路拖下去，膠囊由 kbH 逐格跟著 */}
        <ListScroll ref={scrollRef} style={{ flex: 1 }} contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
          // scrollEventThrottle：iOS 不給的話捲動只回報一次，useScrollOffset 拿不到逐格的位置
          scrollEventThrottle={16}
          onScrollEndDrag={scrolled} onMomentumScrollEnd={scrolled} onContentSizeChange={(w, h) => { contentH.value = h; }}
          scrollEnabled={!dragging} contentContainerStyle={st.scrollFill}>
          {n.items.length === 0 && emptyView}
          <LayoutAnimationConfig skipEntering>
            <LineList items={n.items} stamp={renders.current} api={api} ctl={listCtl} geoRef={geoRef} kickRef={kickRef} anchorNext={anchorNext}
              bg={nc.bg} rule={nc.rule} colors={c} calm={calm} fs={fs} winH={winH} winW={winW}
              editing={editing} freshId={freshId} focused={focused} pending={pending} revs={revs} view={view}
              scrollRef={scrollRef} scrollY={scrollY} listTop={listTop} listBot={listBot} listH={listH} contentH={contentH} />
          </LayoutAnimationConfig>
          {/* 留白讓最後一行能捲上來；點這裡不會新增一行。200 只用一次。行不多時撐滿到底（contentContainerStyle flexGrow），
              （2026-11-02 起空白處不再左右撥換張，換張只在底部列） */}
          <View style={{ flexGrow: 1, minHeight: 200 + kbPad + insets.bottom }} collapsable={false} />
        </ListScroll>
      </View>

      {/* 右下角 ＋：底下升起輸入框。鍵盤開著時被鍵盤蓋住、輸入框開著時也不畫。進出跟鍵盤同一個事件、同一個時鐘（keyboardWillShow／WillHide 那一刻，
          2-4 做法 6；多米 2026-11-01 說 ✓ 之後 ＋ 回來的時間點不對：之前等鍵盤完全收完才淡進，比鍵盤晚一拍）。
          鍵盤膠囊（∧ ∨ ＋ ✓）2026-11-01 多米定拿掉：輸入框旁邊就有 ✓，行裡打字要收鍵盤點空白處或空行按 Return */}
      {/* 列本身畫在紙外面（根畫面的 PageBarHost，2026-11-03），見下面 barSlot.set */}

      {/* 輸入框（多米 2026-11-01，第四版＝乙）：框貼在鍵盤上面、跟著鍵盤一起升降，框與鍵盤同一個時鐘（keyboardFollow）。
          第三版整個畫面鋪了暗幕、點外面不能點到別行，多米真機說「編輯感覺很不好」（2-5：記是主線，不該被包成模態），同日定乙拿掉暗幕：
          輸入框開著時紙照常能看、能點——點一行＝草稿先送出、焦點直接進那一行（走 Composer 的 onBlur）；點空白處＝鍵盤收、草稿送出、框收起。
          框那層讓觸控穿透到紙 */}
      {/* 輸入框開著時整張紙變暗（多米 2026-11-01：淡一點「效果還 ok，這次想改成變暗看看」）。暗幕不接觸控（pointerEvents none）：
          手指照樣點得到行、⋯、清單名（點一行＝草稿送出、焦點進那一行，第四版乙不變），這是跟第三版暗幕不同的地方。
          跟鍵盤同一個時鐘進出（keyboardFollow），顏色用選單後面那層暗幕（scrim）。減少動態照樣淡入淡出 */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, scrimStyle]} pointerEvents="none"
        accessible={false} importantForAccessibility="no-hide-descendants" />
      {composing && (
        <Animated.View style={[st.kbarWrap, composerStyle]} pointerEvents="box-none">
          {/* maxH：框最高長到清單頂（標題列與時間列下面），再多才在框裡捲（多米 2026-11-01：打十幾行也要能沉浸，不要三行就捲） */}
          <Composer key="new" initial="" calm={calm} maxH={winH - Math.max(kbPad, insets.bottom) - view.current.top - T.space.s * 2}
            onChange={t => { draft.current = t; }} onSubmit={sendDraft} onDone={doneComposer} onBlur={closeComposer} />
        </Animated.View>
      )}

      {menu && (
        <PopMenu acts={moreActs} top={insets.top + T.shape.hitMin + T.space.m} onClose={() => setMenu(false)}
          header={<Swatches current={n.color} onPick={pickColor} />} />
      )}
      {rowMenu && <PopMenu acts={rowActs(rowMenu.id)} top={rowMenu.top} onClose={() => setRowMenu(null)} />}

      </LayoutAnimationConfig>
    </Animated.View>
  );
}

// 排順序的把手：2 欄 × 3 列六個淺點（2026-11-03 多米給的圖，原本是 iOS 的三條線）。這裡只負責畫，手勢在清單右邊那一長條（st.gripCol）
const GripDots = memo(function GripDots({ color }: { color: string }) {
  return (
    <View style={st.dots}>
      {[0, 1, 2, 3, 4, 5].map(i => <View key={i} style={[st.dot, { backgroundColor: color }]} />)}
    </View>
  );
});

// ⋯ 選單最上面一排九個色塊（Swatches.tsx，目錄的篩選也用它）：點了紙直接換色，選單不關（看得到後面換了）

// 按鍵那一刻游標選到哪（start＝end 就是沒選取、游標在 start）
type Sel = { start: number; end: number };

/* ---------- 清單引擎（2026-11-04 多米：「畫面不准有不順暢感」，為什麼這樣改寫在 .vibe/手感診斷-2026-11-04.md） ---------- */
// 以前每一行都是完整的一套（輸入框、四個手勢、六份動畫），全部的行都掛著，行的位置靠版面排：打開慢、捲動卡、排順序放手要等 React 重排所以會閃。現在：
// 1. 一行只畫字和六個點；輸入框只有正在打的那一行才有；點一下、長按、左右滑、拖把手整張清單共用一組手勢，手指碰到時查位置表知道是哪一行
// 2. 只掛畫面附近的行（WIN_BUF），看不到的行完全不存在，一千行跟十行一樣快
// 3. 每一行站哪裡不靠版面：位置全在 UI 執行緒的表裡（pos），放手換順序在 UI 執行緒一格內改完，React 後來才知道，畫面不會動
type ListApi = {
  edit: (id: string, caret?: number, y?: number) => void; // caret＝游標落在第幾個字；y＝點在這行的哪個高度
  menu: (id: string, bottom: number) => void; // 長按：bottom＝那一行在螢幕上的底邊
  strike: (id: string) => void; // 從左右滑來的劃掉（越線那一刻已經震過）
  removed: (id: string) => void; // 滑出、淡出跑完：真的拿掉
  action: (id: string, name: string) => void; // VoiceOver 的動作
  dragBegan: () => void;
  dragEnded: (from: number, to: number, y: number) => void; // 放手、位置已經換好：改資料。y＝自動捲捲到哪
  refInput: (id: string, r: TextInputInstance | null) => void;
  onChange: (id: string, v: string) => void;
  onKey: (id: string, e: TextInputKeyPressEvent, sel: Sel) => void;
  onFocus: (id: string) => void;
  onBlur: (id: string) => void;
  freshDone: (id: string) => void;
  resized: (id: string, oldH: number, h: number) => void; // 一行量到的高變了
  ensure: (id: string) => void; // 正在打的那行長高了：捲到看得到
};
type ListCtl = { fade: (id: string) => void; removed: () => void };

function useListShared(width: number) {
  return {
    // 位置表（JS 算好交過來）：每個 id 站哪裡、排第幾；照順序的陣列給手勢查「手指碰到第幾行」
    pos: useSharedValue<Record<string, number>>({}), idxOf: useSharedValue<Record<string, number>>({}),
    idsA: useSharedValue<string[]>([]), ysA: useSharedValue<number[]>([]), hsA: useSharedValue<number[]>([]), doneA: useSharedValue<boolean[]>([]),
    // 其他行滑到新位置（長出一行、拿掉一行）：全部行共用一個時鐘 shiftT，0＝還在 shiftFrom、1＝到 pos
    shiftFrom: useSharedValue<Record<string, number>>({}), shiftT: useSharedValue(1),
    gone: useSharedValue<Record<string, boolean>>({}), // 滑出跑完、等 React 拿掉的行：先藏起來
    // 排順序：拖著哪一行、對到第幾個位置、跟手指差多少；浮起多少；每行中點；手指（dragFy 從拿起算往下多少、dragAy 在螢幕上多高）；
    // dragOn＝手指還按著；dragY＝自動捲捲到哪（拖的時候只有它在捲）
    dragId: useSharedValue(''), dragIdx: useSharedValue(-1), dragTo: useSharedValue(-1), dragDy: useSharedValue(0), dragH: useSharedValue(0),
    dragLift: useSharedValue(0), dragMids: useSharedValue<number[]>([]),
    dragFy: useSharedValue(0), dragAy: useSharedValue(0), dragOn: useSharedValue(0), dragY0: useSharedValue(0), dragY: useSharedValue(0),
    // 左右滑：滑哪一行、滑多遠；底下露出那塊的位置、高；手指在哪一區（1 劃掉、-1 刪除）；越線時字彈一下；exiting＝正在滑出的那行
    swipeId: useSharedValue(''), swipeTx: useSharedValue(0), swipeOp: useSharedValue(1), swipeY: useSharedValue(0), swipeH: useSharedValue(0),
    swipeDone: useSharedValue(false), underOp: useSharedValue(1), armed: useSharedValue(0), labelScale: useSharedValue(1), exiting: useSharedValue(''),
    listW: useSharedValue(width),
  };
}
type ListShared = ReturnType<typeof useListShared>;

type ListProps = {
  items: Item[]; stamp: number; api: ListApi; ctl: RefObject<ListCtl>; geoRef: RefObject<Geo>; kickRef: RefObject<() => void>; anchorNext: RefObject<boolean>;
  bg: string; rule: string; colors: Colors; calm: boolean; fs: number; winH: number; winW: number;
  editing: string | null; freshId: string | null; focused: RefObject<string | null>; pending: RefObject<{ id: string; caret?: number } | null>; revs: RefObject<Record<string, number>>;
  view: RefObject<{ top: number; h: number; y: number; kb: number }>;
  scrollRef: AnimatedRef<ScrollViewInstance>; scrollY: SharedValue<number>; listTop: SharedValue<number>; listBot: SharedValue<number>; listH: SharedValue<number>; contentH: SharedValue<number>;
};

// 整張清單共用的手勢、位置表交給 UI 執行緒。手勢的設定只做一次（換設定要跟原生講一次），用到的東西全是不會變的
function LineList(p: ListProps) {
  const { api, ctl, calm, geoRef, view, focused, scrollRef, scrollY, listTop, listBot, listH, contentH, colors } = p;
  const made = useListShared(p.winW);
  const sv = useRef(made).current;
  const { pos, idxOf, idsA, ysA, hsA, doneA, shiftFrom, shiftT, gone, dragId, dragIdx, dragTo, dragDy, dragH, dragLift, dragMids, dragFy, dragAy, dragOn, dragY0, dragY,
    swipeId, swipeTx, swipeOp, swipeY, swipeH, swipeDone, underOp, armed, labelScale, exiting, listW } = sv;
  const dragLive = useRef(false), skipShift = useRef(false);
  const linesOf = useRef<Record<string, TextLine[]>>({}); // 每一行排版完回報的字（游標落點用）
  const itemsRef = useRef(p.items);
  itemsRef.current = p.items;
  const [heldId, setHeldId] = useState<string | null>(null);

  // JS 算好的位置表交給 UI 執行緒。animate＝其他行滑過去（從現在看到的位置開始，滑到一半又變也接得上）；
  // anchor＝畫面最上面那行不准動：它上面的行高度變了，同一格把捲動位置也補回來，看起來一動也不動
  const publish = useMemo(() => (ids: string[], ys: number[], hs: number[], done: boolean[], animate: boolean, anchor: boolean) => {
    'worklet';
    const m = maps(ids, ys);
    const g = gone.value;
    let stale = false;
    const left: Record<string, boolean> = {};
    for (const k in g) { if (m.pos[k] === undefined) stale = true; else left[k] = true; }
    if (stale) gone.value = left;
    const top = scrollY.value;
    let dy = 0;
    if (anchor && top > 0) {
      const k = hitRow(ysA.value, hsA.value, top);
      if (k >= 0) { const ny = m.pos[idsA.value[k]]; if (ny !== undefined) dy = ny - ysA.value[k]; }
    }
    if (animate) {
      const t0 = shiftT.value, P = pos.value, F = shiftFrom.value, from: Record<string, number> = {};
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i], a = P[id], b = F[id];
        from[id] = a === undefined ? ys[i] : t0 >= 1 || b === undefined ? a : b + (a - b) * t0;
      }
      shiftFrom.value = from;
      pos.value = m.pos;
      shiftT.value = 0;
      shiftT.value = withTiming(1, { duration: ROW_SHIFT_MS });
    } else {
      pos.value = m.pos;
      shiftFrom.value = m.pos;
      shiftT.value = 1;
    }
    idxOf.value = m.idx; idsA.value = ids; ysA.value = ys; hsA.value = hs; doneA.value = done;
    if (dy !== 0) scrollToUI(scrollRef, 0, top + dy, false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- 排順序 ---------- */
  // 每一格畫面算一次：碰到上下緣自己捲、被拖的行對到第幾個位置（手指不動、紙在捲時也要算）
  const autoDrag = useFrameCallback(f => {
    const from = dragIdx.value;
    if (!dragOn.value || from < 0) return;
    const ay = dragAy.value, top = listTop.value, bot = listBot.value;
    const v = ay < top + AUTO_EDGE ? -AUTO_SPEED * Math.min(1, (top + AUTO_EDGE - ay) / AUTO_EDGE)
      : ay > bot - AUTO_EDGE ? AUTO_SPEED * Math.min(1, (ay - bot + AUTO_EDGE) / AUTO_EDGE) : 0;
    if (v) {
      const max = Math.max(0, contentH.value - listH.value);
      const y = Math.min(max, Math.max(0, dragY.value + v * (f.timeSincePreviousFrame ?? FRAME_MS) / 1000));
      if (y !== dragY.value) { dragY.value = y; scrollToUI(scrollRef, 0, y, false); }
    }
    const dy = dragFy.value + dragY.value - dragY0.value;
    dragDy.value = dy;
    const mids = dragMids.value, y = mids[from] + dy;
    const to = countBelow(mids, y) - (mids[from] < y ? 1 : 0);
    if (to === dragTo.value) return;
    dragTo.value = to;
    scheduleOnRN(hapticPass);
  }, false);

  const gestures = useMemo(() => {
    const { strike, removed, dragBegan, dragEnded } = api;
    const tapAt = (x: number, y: number) => {
      const g = geoRef.current, i = hitRow(g.ys, g.hs, y);
      if (i < 0) return;
      const id = g.ids[i];
      if (focused.current === id) return; // 點的是正在打的那行：游標交給輸入框自己放
      const inRow = y - g.ys[i];
      api.edit(id, caretAt(linesOf.current[id] ?? [], x - T.space.l, inRow, itemsRef.current[i]?.t.length ?? 0), inRow);
    };
    const pressAt = (y: number) => {
      const g = geoRef.current, i = hitRow(g.ys, g.hs, y);
      if (i >= 0) api.menu(g.ids[i], view.current.top + g.ys[i] + g.hs[i] - scrollY.value);
    };
    const began = (id: string) => {
      dragLive.current = true;
      setHeldId(id);
      autoDrag.setActive(true);
      Keyboard.dismiss();
      haptic('dragStart');
      dragBegan();
    };
    const ended = (from: number, to: number, y: number) => {
      dragLive.current = false;
      autoDrag.setActive(false);
      setHeldId(null);
      if (from !== to) skipShift.current = true; // 畫面已經換好了，JS 這邊只是對帳，不要再滑一次
      dragEnded(from, to, y);
    };
    // 長按：只是開選單，在 JS。手指移超過門檻就不算長按、讓給滑動
    const pressCfg: Parameters<typeof useLongPressGesture>[0] = {
      runOnJS: true, minDuration: T.gesture.longPressMs, maxDistance: LONG_MOVE,
      onActivate: e => pressAt(e.y),
    };
    // 點一下＝進這一行編輯。手指移超過門檻就不算點（捲動時碰到字不會跳出鍵盤）。游標落在點的位置（K1）：每行排版完回報每一行字的位置，換算在 model.ts caretAt
    const tapCfg: Parameters<typeof useTapGesture>[0] = {
      runOnJS: true, numberOfTaps: 1, maxDistance: LONG_MOVE,
      onActivate: e => tapAt(e.x, e.y),
    };
    // 往右滑過門檻＝劃掉，往左滑過門檻＝刪除，沒滑夠就彈回。放手之後都是接手指放開速度的彈簧（2-4 做法 3）；劃掉在放手那一刻就改資料。
    // 減少動態：不滑回、滑出，改成整行淡回／淡出（回饋要在，只是不移動）
    const swipeCfg: Parameters<typeof usePanGesture>[0] = {
      activeOffsetX: [-SW_ACTIVATE, SW_ACTIVATE],
      failOffsetY: [-SW_FAIL_Y, SW_FAIL_Y],
      // H5 多米 2026-11-01 定乙：滑動不收鍵盤
      onActivate: e => {
        'worklet';
        // 上一行還在滑出就又滑下一行（連續刪）：上一行先藏起來，不准因為換了目標跳回原位
        const was = exiting.value;
        if (was) { gone.value = { ...gone.value, [was]: true }; exiting.value = ''; }
        armed.value = 0; labelScale.value = 1;
        const ys = ysA.value, hs = hsA.value, i = hitRow(ys, hs, e.y - e.translationY);
        if (i < 0) { swipeId.value = ''; return; }
        swipeTx.value = 0; swipeOp.value = 1; underOp.value = 1;
        swipeId.value = idsA.value[i]; swipeY.value = ys[i]; swipeH.value = hs[i]; swipeDone.value = doneA.value[i];
      },
      onUpdate: e => {
        'worklet';
        if (!swipeId.value) return;
        const dx = e.translationX, W = listW.value;
        // 手勢要橫移才成立，成立那一刻 translationX 已經有一段：扣掉它，行才會從手指底下 0 開始跟，不會先跳一格。門檻仍照手指走的距離判
        swipeTx.value = dx > 0 ? Math.max(0, dx - SW_ACTIVATE) : Math.min(0, dx + SW_ACTIVATE);
        const zone = dx > Math.min(STRIKE_MAX, W * STRIKE_RATIO) ? 1 : dx < -Math.min(DELETE_MAX, W * DELETE_RATIO) ? -1 : 0;
        if (zone === armed.value) return;
        armed.value = zone;
        if (zone === 0) return;
        scheduleOnRN(hapticArm);
        if (!calm) { labelScale.value = LABEL_ARM; labelScale.value = withSpring(1, LABEL_SPRING); }
      },
      onDeactivate: e => {
        'worklet';
        armed.value = 0;
        const id = swipeId.value;
        if (!id) return;
        const dx = e.translationX, W = listW.value, v = e.velocityX;
        const out = () => {
          'worklet';
          if (exiting.value === id) exiting.value = '';
          gone.value = { ...gone.value, [id]: true };
          scheduleOnRN(removed, id);
        };
        if (!e.canceled && dx > Math.min(STRIKE_MAX, W * STRIKE_RATIO)) {
          scheduleOnRN(strike, id); // 放手那一刻就劃；底下的滑回只是回位
          if (calm) {
            swipeTx.value = 0;
            swipeOp.value = DIM_FROM;
            swipeOp.value = withTiming(1, { duration: STRIKE_FADE });
          } else swipeTx.value = withSpring(0, { velocity: v, ...STRIKE_SPRING });
        } else if (!e.canceled && dx < -Math.min(DELETE_MAX, W * DELETE_RATIO)) {
          exiting.value = id;
          if (calm) {
            swipeTx.value = 0;
            swipeOp.value = withTiming(0, { duration: DELETE_FADE }, out);
          } else swipeTx.value = withSpring(-W, { velocity: v, ...DELETE_SPRING }, out);
        } else swipeTx.value = calm ? 0 : withSpring(0, { velocity: v, ...SNAP_SPRING });
      },
    };
    return { pressCfg, tapCfg, swipeCfg, began, ended };
  }, [calm]); // eslint-disable-line react-hooks/exhaustive-deps

  const press = useLongPressGesture(gestures.pressCfg);
  const tap = useTapGesture(gestures.tapCfg);
  const swipe = usePanGesture(gestures.swipeCfg);
  // 長按、點一下、滑動只有一個會成立：手指移超過門檻長按和點一下就放棄，滑動才接手；按住超過長按時間就不算點
  const rowGesture = useExclusiveGestures(press, tap, swipe);
  // 把手：清單右邊一長條，手指按下去查是哪一行，拿起、跟手、對位置、放下全在 UI 執行緒，不等 JS。
  // 上下動才算拿起，左右動就讓給滑動（從把手往左滑一樣是刪除）；按在把手上時長按、點一下等把手放棄了才算（按著停一下再拖不會先跳選單）
  const gripCfg = useMemo<Parameters<typeof usePanGesture>[0]>(() => {
    const { began, ended } = gestures;
    // 放手、滑到定位：同一格把順序換好、位移歸零。全部在 UI 執行緒、全部同一輪動畫更新裡，畫面上每一行的位置都不變（2026-11-04 多米：拖完畫面閃跳）。
    // React 下一刻才知道順序變了，但行的位置不看 React，所以什麼都不會動
    const finish = () => {
      'worklet';
      const from = dragIdx.value, to = dragTo.value;
      if (from !== to) {
        const g = movedGeo(idsA.value, hsA.value, doneA.value, from, to), m = maps(g.ids, g.ys);
        pos.value = m.pos; shiftFrom.value = m.pos; shiftT.value = 1; idxOf.value = m.idx;
        idsA.value = g.ids; ysA.value = g.ys; hsA.value = g.hs; doneA.value = g.done;
      }
      dragIdx.value = -1; dragDy.value = 0; dragLift.value = 0; dragId.value = '';
      scheduleOnRN(ended, from, to, dragY.value);
    };
    return {
      block: [press, tap],
      activeOffsetY: [-DRAG_ACTIVATE, DRAG_ACTIVATE],
      failOffsetX: [-DRAG_FAIL_X, DRAG_FAIL_X],
      onActivate: e => {
        'worklet';
        const ys = ysA.value, hs = hsA.value, i = hitRow(ys, hs, e.y - e.translationY);
        if (i < 0) return;
        dragMids.value = midsOf(ys, hs);
        dragH.value = hs[i]; dragFy.value = e.translationY; dragAy.value = e.absoluteY; dragDy.value = e.translationY;
        dragTo.value = i; dragIdx.value = i; dragId.value = idsA.value[i];
        dragY0.value = scrollY.value; dragY.value = scrollY.value; dragOn.value = 1;
        dragLift.value = calm ? 1 : withSpring(1, LIFT_SPRING);
        scheduleOnRN(began, idsA.value[i]);
      },
      onUpdate: e => {
        'worklet';
        if (!dragOn.value) return;
        dragFy.value = e.translationY;
        dragAy.value = e.absoluteY;
        const from = dragIdx.value;
        if (from < 0) return;
        const dy = e.translationY + dragY.value - dragY0.value;
        dragDy.value = dy; // 同一格就把行放到手指底下，不等下一格
        const mids = dragMids.value, y = mids[from] + dy, to = countBelow(mids, y) - (mids[from] < y ? 1 : 0);
        if (to !== dragTo.value) { dragTo.value = to; scheduleOnRN(hapticPass); }
      },
      // 放下：其他行早就讓好位了，被拖的行接著手指的速度滑進空出來的那一格，滑到了才換順序；放手那一刻震一下。減少動態：直接到位
      onDeactivate: e => {
        'worklet';
        if (!dragOn.value) return;
        dragOn.value = 0;
        const from = dragIdx.value;
        if (from < 0) return;
        const target = landOffset(ysA.value, hsA.value, from, dragTo.value);
        scheduleOnRN(hapticLand);
        dragLift.value = calm ? 0 : withSpring(0, LIFT_SPRING);
        if (calm) { dragDy.value = target; finish(); return; }
        dragDy.value = withSpring(target, { velocity: e.velocityY, ...LAND_SPRING }, finish);
      },
    };
  }, [press, tap, gestures]); // eslint-disable-line react-hooks/exhaustive-deps
  const grip = usePanGesture(gripCfg);

  // 紙要做的兩件事：從選單刪一行先淡出；真的拿掉之後把左右滑的狀態收乾淨（底下露出的那塊淡掉）
  const fadeRow = useMemo(() => {
    const { removed } = api;
    return (id: string) => {
      'worklet';
      swipeId.value = id; swipeTx.value = 0; swipeH.value = 0; underOp.value = 1;
      swipeOp.value = withTiming(0, { duration: DELETE_FADE }, () => {
        gone.value = { ...gone.value, [id]: true };
        scheduleOnRN(removed, id);
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const afterRemove = useMemo(() => () => {
    'worklet';
    underOp.value = withTiming(0, { duration: FADE_MS }, f => {
      if (!f) return;
      swipeId.value = ''; swipeTx.value = 0; swipeOp.value = 1; swipeH.value = 0; underOp.value = 1;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listW.value = p.winW; }, [p.winW]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    ctl.current = {
      fade: id => scheduleOnUI(fadeRow, id),
      removed: () => scheduleOnUI(afterRemove),
    };
  });

  return (
    <GestureDetector gesture={rowGesture}>
      <View collapsable={false}>
        <SwipeUnder sv={sv} colors={colors} />
        <Rows {...p} sv={sv} publish={publish} dragLive={dragLive} skipShift={skipShift} heldId={heldId} linesOf={linesOf} itemsRef={itemsRef} />
        <GestureDetector gesture={grip}>
          <View collapsable={false} style={st.gripCol} accessible={false} importantForAccessibility="no-hide-descendants" />
        </GestureDetector>
      </View>
    </GestureDetector>
  );
}

// 量過的行高（跨紙共用，id 不會重複）：下次打開同一張紙，第一格位置就全對。t＝量的時候的字，字改了就不算數。系統字級、螢幕寬變了整份作廢
const ROW_H = new Map<string, { h: number; t: string }>();
let rowHFor = '';

type RowsProps = ListProps & {
  sv: ListShared;
  publish: (ids: string[], ys: number[], hs: number[], done: boolean[], animate: boolean, anchor: boolean) => void;
  dragLive: RefObject<boolean>; skipShift: RefObject<boolean>; heldId: string | null;
  linesOf: RefObject<Record<string, TextLine[]>>; itemsRef: RefObject<Item[]>;
};
type RowApi = ListApi & { rowLayout: (id: string, h: number) => void; lines: (id: string, ls: TextLine[]) => void };

// 算位置、決定掛哪幾行、畫行。捲動時只有這裡重畫，手勢和紙都不動
function Rows(p: RowsProps) {
  const { items, stamp, api, geoRef, kickRef, anchorNext, bg, rule, colors, calm, fs, winH, winW, editing, freshId, focused, pending, revs, view, scrollY, listH, sv, publish, dragLive, skipShift, heldId, linesOf, itemsRef } = p;
  const { dragOn, dragY } = sv;
  const [tick, measured] = useReducer((x: number) => x + 1, 0); // 量到新的高度
  const [, rerender] = useReducer((x: number) => x + 1, 0); // 捲到別的地方，要掛的行變了

  // 位置表：紙重畫了、量到新高度才重算，單純捲動不用
  const forKey = useRef(''), geoBox = useRef<Geo>(EMPTY_GEO);
  const key = `${stamp}|${tick}`;
  if (forKey.current !== key) {
    forKey.current = key;
    const scale = `${fs}|${winW}`;
    if (rowHFor !== scale) { ROW_H.clear(); rowHFor = scale; }
    const inputId = focused.current ?? editing;
    const minH = rowMinH(fs), width = winW - TEXT_INSET, em = T.font.line.fontSize * fs, lineH = LINE_H * fs;
    geoBox.current = buildGeo(items, it => {
      const r = ROW_H.get(it.id);
      if (r && (r.t === it.t || it.id === inputId)) return r.h; // 正在打的那行字一直變，高度以量到的為準
      const h = Math.max(minH, estimateLines(it.t, width, em) * lineH + PAD_V * 2) + T.shape.borderCard;
      ROW_H.set(it.id, { h, t: it.t });
      return h;
    });
    geoRef.current = geoBox.current;
  }
  const geo = geoBox.current;

  // 上一次交給 UI 執行緒的那份：一樣就不交。拖著的時候不交（放手時 UI 執行緒自己換好）
  const published = useRef<Geo>(EMPTY_GEO), isFirst = useRef(true);
  useLayoutEffect(() => {
    if (dragLive.current) return;
    const prev = published.current;
    if (prev === geo) return;
    published.current = geo;
    if (sameGeo(prev, geo)) return;
    const structural = !sameIds(prev.ids, geo.ids);
    const inputId = focused.current ?? editing;
    const at = inputId ? geo.at.get(inputId) : undefined, was = inputId ? prev.at.get(inputId) : undefined;
    const grew = !structural && at !== undefined && was !== undefined && geo.hs[at] !== prev.hs[was];
    const anchored = anchorNext.current, skip = skipShift.current, first = isFirst.current;
    anchorNext.current = false; skipShift.current = false; isFirst.current = false;
    const animate = !first && !calm && !skip && !anchored && (structural || grew);
    scheduleOnUI(publish, geo.ids, geo.ys, geo.hs, geo.done, animate, anchored || !structural);
    if (anchored && geo.hs.length) view.current.y += geo.hs[0]; // 輸入框送出、留在原地：捲動位置往下補了新行那麼高
    if (grew && inputId) api.ensure(inputId);
  });

  // 掛哪幾行：第一格畫面只掛一個螢幕（紙先出來），下一格才補滿前後多留的
  const yNow = useRef(0), firstPaint = useRef(true), lastWin = useRef({ a: 0, b: -1 });
  const H = view.current.h || winH;
  const w = firstPaint.current ? windowOf(geo.ys, geo.hs, 0, H) : windowOf(geo.ys, geo.hs, yNow.current - H * WIN_BUF, yNow.current + H * (1 + WIN_BUF));
  lastWin.current = w;
  const [goTo] = useState(() => (y: number) => {
    yNow.current = y;
    const g = geoRef.current, h = view.current.h || winH;
    const n = windowOf(g.ys, g.hs, y - h * WIN_BUF, y + h * (1 + WIN_BUF));
    if (n.a !== lastWin.current.a || n.b !== lastWin.current.b) rerender();
  });
  kickRef.current = () => goTo(yNow.current);
  useEffect(() => {
    const r = requestAnimationFrame(() => { firstPaint.current = false; rerender(); });
    return () => cancelAnimationFrame(r);
  }, []);
  // 捲過 1/WIN_STEP 個螢幕才排回 JS 看一次（不是每一格畫面）；拖的時候自動捲也走這裡
  useAnimatedReaction(() => Math.floor((dragOn.value ? dragY.value : scrollY.value) / Math.max(1, listH.value / WIN_STEP)), (k, old) => {
    if (old !== null && k !== old) scheduleOnRN(goTo, dragOn.value ? dragY.value : scrollY.value);
  });

  // 一行量好了：跟位置表用的不一樣才重算（一格畫面只算一次）
  const tickT = useRef(0);
  useEffect(() => () => cancelAnimationFrame(tickT.current), []);
  const [rowApi] = useState<RowApi>(() => ({
    ...api,
    lines: (id, ls) => { linesOf.current[id] = ls; },
    rowLayout: (id, h) => {
      const g = geoRef.current, i = g.at.get(id);
      if (i === undefined) return;
      ROW_H.set(id, { h, t: itemsRef.current[i]?.t ?? '' });
      const old = g.hs[i];
      if (old === h) return;
      api.resized(id, old, h);
      if (!tickT.current) tickT.current = requestAnimationFrame(() => { tickT.current = 0; measured(); });
    },
  }));

  // 上一次畫完時清單裡有哪些行：只有剛加進來的行掛上時才淡入，捲動時掛上的行不淡入
  const had = useRef<Set<string> | null>(null), hadFor = useRef<string[] | null>(null);
  useLayoutEffect(() => { if (hadFor.current !== geo.ids) { hadFor.current = geo.ids; had.current = new Set(geo.ids); } });

  // 畫面附近的行，加上一定要留著的：正在打的、等著對焦的、剛送出亮著的、正在拖的（捲遠了也不能拆，拆了鍵盤會收、拖會斷）。
  // 一定照順序排：畫的順序一變，原生會把那一行拆下來再裝回去，正在打的輸入框就沒焦點了
  const idx: number[] = [];
  for (let i = w.a; i <= w.b; i++) idx.push(i);
  let extra = false;
  for (const s of [editing, focused.current, pending.current?.id, freshId, heldId]) {
    const i = s ? geo.at.get(s) : undefined;
    if (i !== undefined && (i < w.a || i > w.b) && !idx.includes(i)) { idx.push(i); extra = true; }
  }
  if (extra) idx.sort((a, b) => a - b);

  return (
    <>
      {/* 行都是疊在上面的（absolute），清單多高由這一塊撐 */}
      <View style={{ height: geo.total }} pointerEvents="none" />
      {idx.map(i => {
        const it = items[i], id = geo.ids[i];
        if (!it || it.id !== id) return null;
        return (
          <Row key={id} it={it} t={it.t} done={it.done} rev={(revs.current[id] ?? 0) + store.syncRev(id)} y={geo.ys[i]}
            bg={bg} rule={rule} colors={colors} calm={calm} fs={fs}
            input={id === editing || id === focused.current || id === pending.current?.id} editing={id === editing} fresh={id === freshId} held={id === heldId}
            born={!!had.current && !had.current.has(id)} isFirst={i === 0} isLast={i === geo.ids.length - 1} sv={sv} rowApi={rowApi} />
        );
      })}
    </>
  );
}

// 左右滑時行底下露出的那一塊（整張清單只有一塊，移到正在滑的那行後面）：越線前字從淡到亮，越線那一刻放大再彈回（跟震動同一刻，2-4 做法 6）
const SwipeUnder = memo(function SwipeUnder({ sv, colors: c }: { sv: ListShared; colors: Colors }) {
  const { swipeTx, swipeY, swipeH, swipeDone, underOp, armed, labelScale, listW } = sv;
  const { swipeStrikeBg, swipeDeleteBg } = c;
  const box = useAnimatedStyle(() => {
    const x = swipeTx.value;
    return {
      height: swipeH.value, opacity: underOp.value,
      backgroundColor: x > 0 ? swipeStrikeBg : x < 0 ? swipeDeleteBg : 'transparent',
      transform: [{ translateY: swipeY.value }],
    };
  }, WEB_DEPS ? [swipeStrikeBg, swipeDeleteBg] : undefined);
  const strikeLabel = useAnimatedStyle(() => {
    const x = swipeTx.value;
    if (x <= 0 || swipeDone.value) return { opacity: 0, transform: [{ scale: 1 }] };
    const reach = Math.max(1, Math.min(STRIKE_MAX, listW.value * STRIKE_RATIO) - SW_ACTIVATE);
    const opacity = armed.value === 1 ? 1 : interpolate(x, [0, reach], [LABEL_FROM, 1], Extrapolation.CLAMP);
    return { opacity, transform: [{ scale: labelScale.value }] };
  });
  const undoLabel = useAnimatedStyle(() => {
    const x = swipeTx.value;
    if (x <= 0 || !swipeDone.value) return { opacity: 0, transform: [{ scale: 1 }] };
    const reach = Math.max(1, Math.min(STRIKE_MAX, listW.value * STRIKE_RATIO) - SW_ACTIVATE);
    const opacity = armed.value === 1 ? 1 : interpolate(x, [0, reach], [LABEL_FROM, 1], Extrapolation.CLAMP);
    return { opacity, transform: [{ scale: labelScale.value }] };
  });
  const deleteLabel = useAnimatedStyle(() => {
    const x = swipeTx.value;
    if (x >= 0) return { opacity: 0, transform: [{ scale: 1 }] };
    const reach = Math.max(1, Math.min(DELETE_MAX, listW.value * DELETE_RATIO) - SW_ACTIVATE);
    const opacity = armed.value === -1 ? 1 : interpolate(-x, [0, reach], [LABEL_FROM, 1], Extrapolation.CLAMP);
    return { opacity, transform: [{ scale: labelScale.value }] };
  });
  const text = [st.underText, { color: c.textOnSwipe }];
  return (
    <Animated.View style={[st.under, box]} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
      <View>
        <Animated.Text style={[text, strikeLabel]}>劃掉</Animated.Text>
        <Animated.Text style={[text, st.underOver, undoLabel]}>恢復</Animated.Text>
      </View>
      <Animated.Text style={[text, deleteLabel]}>刪除</Animated.Text>
    </Animated.View>
  );
});

type RowProps = {
  it: Item; t: string; done: boolean; rev: number;
  y: number; // 掛上時站哪裡（之後的位置都在 UI 執行緒的位置表裡）
  bg: string; rule: string; colors: Colors; calm: boolean; fs: number;
  input: boolean; // 這一行現在要有輸入框（正在打、等著對焦）；不然只畫字
  editing: boolean; // 整行提亮
  fresh: boolean; // 輸入框剛送出、捲回頂端的那行：亮一下再淡掉
  held: boolean; // 正被拖著：疊在別行上面
  born: boolean; // 上一次畫的時候清單裡還沒有這一行：掛上時淡入。只在掛上那一刻有用，不必為它重畫
  isFirst: boolean; isLast: boolean; // VoiceOver 的往上移、往下移
  sv: ListShared; rowApi: RowApi;
};

// 一行：字＋六個點，正在打才換成輸入框。一行只有自己的東西變了才重畫；位置全在 UI 執行緒，不用重畫
const Row = memo(function Row(p: RowProps) {
  const { sv, calm, rowApi: api } = p;
  const id = p.it.id;
  // 動畫 worklet 只准抓拆出來的值（規矩檔）
  const { pos, idxOf, shiftFrom, shiftT, gone, dragId, dragIdx, dragTo, dragH, dragDy, dragLift, swipeId, swipeTx, swipeOp } = sv;
  const [y0] = useState(p.y);
  // 排順序時讓位要讓多少：彈簧只在「要讓到哪」變了那一刻開一次
  const giveWay = useSharedValue(0);
  useAnimatedReaction(() => {
    const from = dragIdx.value, to = dragTo.value;
    if (from < 0) return 0;
    const i = idxOf.value[id];
    if (i === undefined || i === from) return 0;
    if (from < to && i > from && i <= to) return -dragH.value;
    if (from > to && i < from && i >= to) return dragH.value;
    return 0;
  }, (v, old) => {
    if (v === old) return;
    giveWay.value = calm || dragIdx.value < 0 || old === null ? v : withSpring(v, SHIFT_SPRING);
  }, WEB_DEPS ? [id, calm] : undefined);
  const place = useAnimatedStyle(() => {
    // 掛上那一刻在 JS 這邊先算一次：直接用已知的位置，不去跟 UI 執行緒要整張位置表
    if (!WEB_DEPS && (globalThis as unknown as { __RUNTIME_KIND?: number }).__RUNTIME_KIND === 1) {
      return { opacity: 1, shadowOpacity: 0, transform: [{ translateY: y0 }, { translateX: 0 }, { scale: 1 }] }; // 陰影 0 只用一次：還沒拿起
    }
    const at = pos.value[id], target = at === undefined ? y0 : at, t = shiftT.value;
    let y = target;
    if (t < 1) { const f = shiftFrom.value[id]; if (f !== undefined) y = f + (target - f) * t; }
    const held = dragId.value === id, l = held ? dragLift.value : 0;
    const dy = held ? dragDy.value : dragIdx.value < 0 ? 0 : giveWay.value;
    const sliding = swipeId.value === id;
    return {
      opacity: gone.value[id] ? 0 : sliding ? swipeOp.value : 1,
      shadowOpacity: LIFT_SHADOW * l,
      transform: [{ translateY: y + dy }, { translateX: sliding ? swipeTx.value : 0 }, { scale: 1 + (calm ? 0 : (LIFT_SCALE - 1) * l) }],
    };
  }, WEB_DEPS ? [id, calm, y0] : undefined);

  const lh = { lineHeight: LINE_H, minHeight: rowMinH(p.fs) };
  // VoiceOver：滑動和拖曳用不了，從動作選單（上下滑）劃掉、刪除、移動；點兩下進編輯
  const actions = [
    ...(p.t.trim() ? [{ name: 'strike', label: p.done ? '恢復' : '劃掉' }] : []),
    { name: 'remove', label: '刪除這行' },
    ...(!p.isFirst ? [{ name: 'up', label: '往上移' }] : []),
    ...(!p.isLast ? [{ name: 'down', label: '往下移' }] : []),
  ];
  const onAction = (e: AccessibilityActionEvent) => api.action(id, e.nativeEvent.actionName);
  return (
    <Animated.View collapsable={false} entering={p.born ? ROW_IN : undefined}
      onLayout={e => api.rowLayout(id, e.nativeEvent.layout.height)}
      style={[st.row, { backgroundColor: p.bg, borderBottomColor: p.rule }, p.held && st.held, place]}>
      {/* 正在編輯的那一行：整行提亮一點（網頁版有，多米 2026-10-31 第一輪補回來）。墊在字底下，不擋觸控 */}
      {p.editing && <View style={[StyleSheet.absoluteFill, { backgroundColor: p.colors.rowEditingFill }]} />}
      {p.fresh && <FreshGlow calm={calm} color={p.colors.rowEditingFill} onDone={() => api.freshDone(id)} />}
      {p.input ? (
        <View style={st.field}>
          {/* key 跟著 rev：程式改了這行的字（Backspace 併行、iCloud 同步換了字）就重掛輸入框，defaultValue 才會是新的字 */}
          <Field key={p.rev} text={p.t} done={p.done} fs={p.fs} colors={p.colors} refInput={r => api.refInput(id, r)} actions={actions} onAction={onAction}
            onLines={ls => api.lines(id, ls)} onChange={v => api.onChange(id, v)} onKey={(e, sel) => api.onKey(id, e, sel)}
            onFocus={() => api.onFocus(id)} onBlur={() => api.onBlur(id)} />
        </View>
      ) : (
        // 跟輸入框同一套字型、行高、留白，字的位置一模一樣（TEXT_DROP 見 tokens），點下去換成輸入框時字不會跳
        <Text style={[st.ta, st.rowText, lh, TEXT_DROP ? { paddingTop: PAD_V + TEXT_DROP * p.fs, paddingBottom: PAD_V - TEXT_DROP * p.fs } : null, { color: p.done ? p.colors.textStrike : p.colors.textPrimary }, p.done && st.taDone]}
          accessibilityHint={p.done ? '已劃掉' : undefined} accessibilityActions={actions} onAccessibilityAction={onAction} {...({ onAccessibilityTap: () => api.edit(id) } as object)}
          onTextLayout={e => api.lines(id, e.nativeEvent.lines)}>{p.t}</Text>
      )}
      {/* 把手：每行常駐、六個小點。手勢在清單右邊那一長條；VoiceOver 不讀它（用動作選單的往上移／往下移） */}
      <View style={st.grip} accessible={false} importantForAccessibility="no-hide-descendants">
        <GripDots color={p.colors.textSecondary} />
      </View>
    </Animated.View>
  );
}, (a, b) => a.it === b.it && a.t === b.t && a.done === b.done && a.rev === b.rev && a.bg === b.bg && a.rule === b.rule && a.colors === b.colors && a.calm === b.calm && a.fs === b.fs
  && a.input === b.input && a.editing === b.editing && a.fresh === b.fresh && a.held === b.held && a.isFirst === b.isFirst && a.isLast === b.isLast);

// 剛記的那行亮一下：捲回頂端的那段時間（freshGlow.delay）亮著，之後 freshGlow.duration 淡掉，淡完通知上層收起
function FreshGlow({ calm, color, onDone }: { calm: boolean; color: string; onDone: () => void }) {
  const glow = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ opacity: glow.value }));
  useEffect(() => {
    const G2 = T.motion.freshGlow;
    glow.value = withDelay(calm ? 0 : G2.delay, withTiming(0, { duration: G2.duration }));
    const t = setTimeout(onDone, (calm ? 0 : G2.delay) + G2.duration);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color }, style]} pointerEvents="none" />;
}

// 一行的字。高度由底下一份看不見的同樣文字決定：它跟一般文字一樣會自動換行、自動長高，
// 輸入框疊在它上面撐滿，字打到超過一行就一定會長出下一行。打字時只有這一小塊重畫。
// 字級跟著系統放大。行高不用自己乘倍數：iOS 上 React Native 會自動把行高一起放大，自己再乘一次行距會變兩倍大。
// 最小高度不會自動放大，才要自己乘
// Return 在這一則裡換行（2026-11-03 多米：一則要能分段；以前 Return 是送出、在下面開新的一則）。游標在哪用 onSelectionChange 記著，行首 Backspace 併行時要用
function Field({ text, done, fs, colors: c, refInput, actions, onAction, onLines, onChange, onKey, onFocus, onBlur }: {
  text: string; done: boolean; fs: number; colors: Colors; refInput: (r: TextInputInstance | null) => void;
  actions: { name: string; label: string }[]; onAction: (e: AccessibilityActionEvent) => void;
  onLines: (lines: TextLine[]) => void; // 隱形 Text 每次排版完回報每一行（K1 游標落點用）
  onChange: (v: string) => void; onKey: (e: TextInputKeyPressEvent, sel: Sel) => void;
  onFocus: () => void; onBlur: () => void;
}) {
  const [txt, setTxt] = useState(text);
  const sel = useRef<Sel>({ start: text.length, end: text.length });
  const input = useRef<TextInputInstance | null>(null);
  const setRef = (r: TextInputInstance | null) => { input.current = r; refInput(r); };
  // 網頁預覽的 onSelectionChange 只在「選取一段」時觸發，打字移動游標不會；要用時直接讀 DOM 的游標。iOS 沒這個屬性，用記下來的
  const selNow = (): Sel => {
    const dom = input.current as unknown as { selectionStart?: number; selectionEnd?: number } | null;
    if (typeof dom?.selectionStart === 'number' && typeof dom.selectionEnd === 'number') return { start: dom.selectionStart, end: dom.selectionEnd };
    return sel.current;
  };
  const lh = { lineHeight: LINE_H, minHeight: Math.max(ROW_MIN, Math.round(LINE_H * fs) + PAD_V * 2) };
  return (
    <>
      {/* 高度誰撐：iOS 交給輸入框自己長（多行 TextInput 不給高度就跟著內容長），鏡像文字只負責 onTextLayout（K1 游標落點），鋪在底下不佔位；
          網頁的 textarea 不會自己長，才反過來由鏡像撐高、輸入框鋪滿。之前 iOS 也用鏡像撐，鏡像右邊多留的 1 點讓剛好滿行的字在鏡像裡多換一行，
          行底下就多出一整行空白（多米 2026-11-01 真機） */}
      <Text style={[st.ta, lh, st.mirror, !WEB_DEPS && st.taFill]} accessible={false} importantForAccessibility="no-hide-descendants"
        onTextLayout={e => onLines(e.nativeEvent.lines)}>{txt + '​'}</Text>
      <TextInput ref={setRef} autoFocus defaultValue={text} multiline scrollEnabled={false}
        style={[st.ta, lh, WEB_DEPS && st.taFill, { color: done ? c.textStrike : c.textPrimary }, done && st.taDone]}
        accessibilityHint={done ? '已劃掉' : undefined}
        accessibilityActions={actions} onAccessibilityAction={onAction}
        onChangeText={v => { setTxt(v); onChange(v); }} onKeyPress={e => onKey(e, selNow())}
        onSelectionChange={e => { sel.current = { start: e.nativeEvent.selection.start, end: e.nativeEvent.selection.end }; }}
        onFocus={onFocus} onBlur={onBlur} />
    </>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: T.space.s, paddingLeft: T.space.l, paddingRight: T.space.gutter }, // 標題的字離左邊 20（titleBtn 自己再內縮 xs），跟時間、每一行對齊
  titleSlide: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  titleBtn: { flex: 1, minWidth: 0, minHeight: T.shape.hitMin, flexDirection: 'row', alignItems: 'center', gap: T.space.s, paddingHorizontal: T.space.xs },
  // 清單名的小膠囊（2026-11-04 照設計圖）：茄紫細框、裡面小方磚＋名字＋▾，寬度照內容、太長就截
  pill: { flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: T.space.s, minHeight: T.shape.hitMin,
    paddingLeft: T.space.s, paddingRight: T.space.m, borderWidth: T.shape.borderSelected / 2, borderRadius: T.shape.pill(T.shape.hitMin) },
  pillText: { ...T.font.headline, flexShrink: 1, minWidth: 0 },
  titleInput: { flex: 1, minWidth: 0, ...T.font.title, paddingVertical: 0, paddingHorizontal: T.space.xs },
  // 一行就是紙上的一行：沒有卡片，底下一條淡格線，左右貼齊整頁。行都疊在清單最上面（absolute），站哪裡由 UI 執行緒的位置表決定（transform）
  // 陰影的顏色、模糊、位移先掛著，平常 shadowOpacity 是 0 看不到；排順序拿起來那一行才亮起來
  row: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-start', gap: T.space.xs, paddingLeft: T.space.l, borderBottomWidth: T.shape.borderCard,
    shadowColor: T.shape.shadowSoft.shadowColor, shadowRadius: T.shape.shadowSoft.shadowRadius, shadowOffset: T.shape.shadowSoft.shadowOffset },
  held: { zIndex: 5 }, // 被拖的那行疊在別行上面
  rowText: { flex: 1, minWidth: 0 },
  // 把手的手勢：清單右邊一長條，蓋在每一行的六個點上面
  gripCol: { position: 'absolute', top: 0, bottom: 0, right: 0, width: T.shape.hitMin },
  // 左右滑時行底下露出的那一塊：墊在所有行底下，移到正在滑的那行後面（高度、位置在動畫樣式）
  under: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: T.space.gutter },
  underText: { ...T.font.callout, fontWeight: T.font.semibold },
  underOver: { position: 'absolute', top: 0, left: 0 }, // 「恢復」疊在「劃掉」同一個位置，看這行劃掉了沒決定亮哪一個
  field: { flex: 1, minWidth: 0 },
  ta: { ...T.font.line, paddingTop: PAD_V, paddingBottom: PAD_V, paddingHorizontal: T.space.xs },
  // 隱形鏡像文字：iOS 只拿來量每一行的位置（K1 游標落點），不撐高度；網頁才用它撐高度（textarea 不會自己長）。
  // 右邊只比輸入框多留 1 點：留太多字快滿一行時鏡像會先換行、網頁的行底下就多出一整行空白；完全不留又可能反過來把最後一行切掉。5 只用一次
  mirror: { color: 'transparent', paddingRight: 5 },
  taFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, textAlignVertical: 'top' },
  taDone: { textDecorationLine: 'line-through' },
  grip: { width: T.shape.hitMin, height: T.shape.rowMin, alignItems: 'center', justifyContent: 'center' },
  dots: { width: T.shape.gripDot * 2 + T.shape.gripDotGap, flexDirection: 'row', flexWrap: 'wrap', gap: T.shape.gripDotGap, opacity: T.shape.gripDotOpacity },
  dot: { width: T.shape.gripDot, height: T.shape.gripDot, borderRadius: T.shape.pill(T.shape.gripDot) },
  timeBox: { paddingHorizontal: T.space.gutter, paddingTop: T.space.xs, paddingBottom: T.space.xl, borderBottomWidth: T.shape.borderCard },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scrollFill: { flexGrow: 1 },
  timeText: { ...T.font.footnote },
  empty: { alignItems: 'center', paddingTop: T.space.xxl, paddingHorizontal: T.space.gutter },
  previewBody: { flex: 1, overflow: 'hidden' }, // 預覽頁的行（對應紙上那個捲動區，停在最上面）
  emptyText: { ...T.font.callout, textAlign: 'center' },
  // 鍵盤上面那顆：奶油白膠囊，底下留 8 跟鍵盤分開
  // 輸入框的外框：貼在畫面底邊、離鍵盤 8，由 composerStyle 跟著鍵盤推上去
  kbarWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: T.space.s, paddingHorizontal: T.space.s },
});

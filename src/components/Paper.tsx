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
import { memo, useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  AppState, Keyboard, Platform, Pressable, ScrollView as RNScrollView, Share, StyleSheet, Text, TextInput, useWindowDimensions, View,
  type AccessibilityActionEvent, type TextInputInstance, type TextInputKeyPressEvent, type ViewInstance,
} from 'react-native';
import { GestureDetector, ScrollView, useExclusiveGestures, useLongPressGesture, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { KeyboardEvents, useKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, {
  Easing, Extrapolation, FadeIn, FadeOut, interpolate, LayoutAnimationConfig, LinearTransition,
  makeMutable, scrollTo as scrollToUI, useAnimatedReaction, useAnimatedRef, useAnimatedStyle, useDerivedValue, useFrameCallback, useReducedMotion, useScrollOffset, useSharedValue, withDelay, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { ago, binItem, caretAt, convertNote, dropNotes, FULL_MSG, fillHole, fullDate, isEmpty, leaveHole, markDeleted, markRestored, plain, roomOf, uid, unbinItem, type ColorKey, type Item, type Note, type TextLine } from '../lib/model';
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
// 行的過場（2026-11-01 第二輪 K4）：長出來淡入、拿掉淡出，其他行滑到新位置。拖曳中（拿起到放下）與減少動態時不滑（直接到位，不然會跟落地動畫打架），淡入淡出照舊；
// 整張紙第一次畫出來時不播（LayoutAnimationConfig skipEntering）。換紙時整張紙淡入（S2），第一次打開 app 那張不淡，交給啟動畫面
const ROW_IN = FadeIn.duration(T.motion.fade);
const ROW_OUT = FadeOut.duration(T.motion.fade);
const ROW_MOVE = LinearTransition.duration(T.motion.rowShift.duration);
// 右上 ⋯ 讓位給 ✓ 時用鍵盤的時鐘滑過去（2-4 連續：之前瞬間跳一格）
const KBF = T.motion.keyboardFollow;
const KB_EASING = Easing.bezier(KBF.easing[0], KBF.easing[1], KBF.easing[2], KBF.easing[3]);
const KB_SLIDE = LinearTransition.duration(KBF.duration).easing(KB_EASING);
const NOOP = () => {};
// 一行字的高度與上下留白（字級與行高看 tokens 的 bodyLine，上下各 12）
const LINE_H = T.font.line.lineHeight;
const PAD_V = T.space.m;
const ROW_MIN = T.shape.rowMin;
// 只做看得到的行（2026-11-03 多米：幾千行換張會 lag）：捲到的那一段，再往上、往下各多 LIVE_BUF 個螢幕，才做成完整的行
// （輸入框、滑動、拖曳、動畫）；其他行只畫一樣的字（LiteRow），佔一樣的高、看起來一樣，捲過去時換成完整的行
const LIVE_BUF = 1;
// 清單照舊用 RNGH 的 ScrollView（行上的滑動、把手要跟它協調），包成 Animated 才拿得到逐格的捲動位置、在 UI 執行緒捲它
// （RNGH v3 的 ScrollView 是函式元件、ref 照 React 19 當一般 prop 往下交，型別上當成 RN 的 ScrollView）
const ListScroll = Animated.createAnimatedComponent(ScrollView as unknown as typeof RNScrollView);
type ScrollViewInstance = RNScrollView;
// 拖「≡」排順序拖到清單上緣、下緣（autoEdge 點以內）：紙自己往那邊捲，越靠邊越快，最快 autoSpeed 點／秒（2026-11-03 多米選）
const AUTO_EDGE = T.gesture.dragAutoEdge, AUTO_SPEED = T.gesture.dragAutoSpeed;
// 給行的動畫 worklet 用的值，先抄成數字和自己的物件（worklet 抓到的物件會被鎖住，規矩檔）
const SHIFT_SPRING = { ...T.motion.dragShift.spring }, LIFT_SPRING = { ...T.motion.dragLift.spring }, LAND_SPRING = { ...T.motion.dragLand.spring };
const LIFT_SCALE = T.motion.dragLift.scale, LIFT_SHADOW = T.shape.shadowSoft.shadowOpacity;
// 只畫字的行的外殼接這幾個「永遠不變」的值（沒在拖），動畫就完全不跑；完整的行才接真的拖曳值（見 LineRow）
const IDLE_IDX = makeMutable(-1), IDLE_ZERO = makeMutable(0);

export function Paper({ n }: { n: Note }) {
  useStore();
  // 開發版才有：換到這張到畫出第一格花多久（lib/perf，印在終端機）
  useState(() => perf.start('paper'));
  useEffect(() => { perf.end('paper', `掛上紙「${n.title.trim() || '未命名'}」（${n.items.length} 行）`); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [, force] = useReducer((x: number) => x + 1, 0);
  const insets = useSafeAreaInsets();
  const calm = useReducedMotion();
  const { fontScale: fs, height: winH } = useWindowDimensions();
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
  const layouts = useRef<Record<string, { y: number; h: number }>>({});
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
    if (!n.items[idx].t.trim()) { n.items.splice(idx, 1); touch(); return; }
    binItem(n, id, Date.now());
    touch();
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
      { label: '刪除', icon: 'trash', destructive: true, fn: () => remove(id) },
    ];
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
    requestAnimationFrame(() => placeCaret(inp, at)); // iOS 對焦後會把游標放到最後，下一格再放回去（行首 Backspace 併行要停在接點）
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
  // 例外：從輸入框「點一行」離開（第四版乙：草稿送出、焦點進那一行）時不捲，你點的是那一行，跳走就打斷你；這時新行量好高度的那一刻
  // 往下補捲同樣的高，畫面原地不動。拖曳開始時（手指已在把手上）也一樣不捲。
  // 決定在新行量好高度的那一刻做（onLayoutRow）：那時點了哪一行（editing）已經知道。
  // （不用 ScrollView 的 maintainVisibleContentPosition：它會記住最上面那行，拖曳動到頂端幾行時自己挪捲動又捲回頂端，2026-11-01 第七批拿掉）
  const newRow = useRef<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  // 從搜尋筆記點某一行過來（2026-11-03）：捲到那行、亮一下。每次畫都看一次（點的可能就是正在看的這張，紙不會重掛）；
  // 那行還沒量好位置（剛換過來）就等 onLayoutRow，量好了就畫完直接捲（下面的 effect）。系統清單版捲不到，只換到這張
  const seekRow = useRef<string | null>(null);
  const sk = store.takeSeek(l => n.items.some(i => i.id === l));
  if (sk) seekRow.current = sk;
  // 每次畫完都看（沒有相依陣列是故意的）；拿到一次就清掉 seekRow，不會一直重畫
  useEffect(() => { // eslint-disable-line react-hooks/exhaustive-deps
    const id = seekRow.current, l = id && layouts.current[id];
    if (!id || !l) return;
    seekRow.current = null;
    scrollTo(Math.max(0, l.y - view.current.h / 3), !calm);
    setFreshId(id);
  });
  function addFromDraft(t: string) {
    const id = uid();
    newRow.current = id;
    n.items.unshift({ id, t, done: false, b: false });
    touch();
  }
  function placeNewRow(id: string, h: number) {
    newRow.current = null;
    const stay = drag.current || (editingRef.current !== null && editingRef.current !== id);
    if (stay) { if (view.current.y > T.shape.rowMin) scrollTo(view.current.y + h, false); return; }
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
    const l = id && layouts.current[id], v = view.current;
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

  /* ---------- 拖曳排序 ---------- */
  const dragIdx = useSharedValue(-1);
  const dragTo = useSharedValue(-1);
  const dragDy = useSharedValue(0);
  const dragH = useSharedValue(0);
  // 每一行的中點、頂邊、高度（拿起來那一刻量的）。放 shared value 是因為「拖到第幾個位置」和「放下落在哪」都在手勢的 worklet 裡算（UI 執行緒），
  // 不再每一格畫面跨到 JS 算一次（第三輪，2026-10-31）：JS 忙的時候被拖的那行不會慢半拍。頂邊與高度是 2026-11-01 第一輪為落地動畫加的
  const dragMids = useSharedValue<number[]>([]);
  const dragTops = useSharedValue<number[]>([]);
  const dragHs = useSharedValue<number[]>([]);
  const dragLift = useSharedValue(0); // 0＝沒拿起，1＝浮起（被拖的行放大一點、有陰影）
  // 拖到邊緣自動捲（2026-11-03）：把手只回報手指（dragFy＝從拿起算往下多少、dragAy＝手指在螢幕上的高度），
  // 「被拖的行在哪、對到第幾個位置、要不要捲」都在下面 autoDrag 每一格算（手指不動、紙在捲時也要算）。
  // dragOn＝手指還按著（放手那一刻把手清掉，落地動畫才不會被這裡蓋掉）；dragY＝自動捲捲到哪（拖的時候不能用手捲，只有這裡在捲）
  const dragFy = useSharedValue(0), dragAy = useSharedValue(0), dragOn = useSharedValue(0);
  const dragY0 = useSharedValue(0), dragY = useSharedValue(0);
  const listTop = useSharedValue(0), listBot = useSharedValue(0), listH = useSharedValue(0), contentH = useSharedValue(0);
  const autoDrag = useFrameCallback(f => {
    const from = dragIdx.value;
    if (!dragOn.value || from < 0) return;
    const ay = dragAy.value, top = listTop.value, bot = listBot.value;
    const v = ay < top + AUTO_EDGE ? -AUTO_SPEED * Math.min(1, (top + AUTO_EDGE - ay) / AUTO_EDGE)
      : ay > bot - AUTO_EDGE ? AUTO_SPEED * Math.min(1, (ay - bot + AUTO_EDGE) / AUTO_EDGE) : 0;
    if (v) {
      const max = Math.max(0, contentH.value - listH.value);
      const y = Math.min(max, Math.max(0, dragY.value + v * (f.timeSincePreviousFrame ?? 16) / 1000));
      if (y !== dragY.value) { dragY.value = y; scrollToUI(scrollRef, 0, y, false); }
    }
    // 被拖的行跟著手指，再加上紙捲了多少（手指不動、紙往下捲，行也要跟著往下才會一直在手指底下）
    const dy = dragFy.value + dragY.value - dragY0.value;
    dragDy.value = dy;
    const mids = dragMids.value, y = mids[from] + dy;
    let to = 0;
    for (let k = 0; k < mids.length; k++) if (k !== from && mids[k] < y) to++;
    if (to === dragTo.value) return;
    dragTo.value = to;
    scheduleOnRN(hapticPass);
  }, false);

  // 只做看得到的行：哪幾行做成完整的由 LineList 自己記、自己重畫（捲動時整張紙不重畫，底部列也不跟著重畫）。
  // 行的位置變了、清單量好了就叫它重算一次
  const kickRef = useRef<() => void>(NOOP);
  const kickWin = () => kickRef.current();
  // 做成完整的行時量到的高：換回只畫字的時候照這個高畫，不會因為字的排法差一兩點讓下面的行跳（字被改過就不算數）
  const liveH = useRef<Record<string, { h: number; t: string }>>({});
  const drag = useRef<{ idx: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  // 放下之後收尾分兩步（多米 2026-11-01 第六批：拖完「又再執行一次動畫」）：end() 只換順序並記一次 dropTick；那次重畫畫完
  // （useLayoutEffect）時歸零位移，下一格才關 dragging（開回行的 layout 過場）。之前 rAF 裡一起做，常跟換順序併成同一次重畫，
  // 過場在順序剛換那一刻就醒來，把落地的行再滑一次。靠近頂端的「往上抬」是另一個原因，見 addFromDraft 上面
  const [dropTick, setDropTick] = useState(0);
  // 輸入框開著時紙變暗（見 render 的 scrimStyle）：暗幕的濃淡 0～1
  const dim = useSharedValue(0);
  useEffect(() => {
    dim.value = withTiming(composing ? 1 : 0, { duration: KBF.duration, easing: KB_EASING });
  }, [composing]); // eslint-disable-line react-hooks/exhaustive-deps
  const scrimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  // start 和 end 還是在 JS（一次性的事：量位置、改資料）；手指移動中的計算與放下的落地動畫在 LineRow 的 grip worklet 裡
  const dragApi = {
    start(id: string) {
      Keyboard.dismiss();
      const idx = n.items.findIndex(i => i.id === id);
      if (idx < 0) return;
      drag.current = { idx };
      const ls = n.items.map(i => layouts.current[i.id]);
      dragMids.value = ls.map(l => (l ? l.y + l.h / 2 : 0));
      dragTops.value = ls.map(l => l?.y ?? 0);
      dragHs.value = ls.map(l => l?.h ?? ROW_MIN);
      dragH.value = (layouts.current[id]?.h ?? ROW_MIN);
      dragDy.value = 0; dragTo.value = idx; dragIdx.value = idx;
      dragY0.value = dragY.value = scrollY.value; dragOn.value = 1;
      autoDrag.setActive(true);
      dragLift.value = calm ? 1 : withSpring(1, T.motion.dragLift.spring);
      setDragging(true);
      haptic('dragStart');
    },
    // 落地動畫跑完（或減少動態時直接到位）才會到這裡：改資料、下一格把位移歸零（那時新順序已經畫好，行就在原地）
    end() {
      dragOn.value = 0;
      autoDrag.setActive(false);
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      view.current.y = dragY.value; // 自動捲過：記下現在捲到哪（平常只在手放開時記）
      const to = dragTo.value;
      if (d.idx !== to) { const [m] = n.items.splice(d.idx, 1); n.items.splice(to, 0, m); touch(); }
      // dragging 要等新順序畫完、位移歸零的那一格才關（見上面 dropTick）。跟改資料同一次重畫就關掉，行的 layout 過場（ROW_MOVE）會在
      // 「順序剛換」那一刻醒過來，把已經落地的行再從舊位置滑到新位置一次（多米 2026-11-01 真機兩次回報）
      setDropTick(t => t + 1);
    },
  };

  useLayoutEffect(() => {
    if (!dropTick) return;
    // 位移歸零就在新順序畫完的這一刻（不再等一格：等的那一格，行的序號已經換了、位移還在，會套到別行身上）；行的 layout 過場下一格才開回來
    dragIdx.value = -1; dragDy.value = 0; dragLift.value = 0;
    const r = requestAnimationFrame(() => setDragging(false));
    return () => cancelAnimationFrame(r);
  }, [dropTick]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- open / close ---------- */
  // 換到別張紙（這個元件卸載）時收尾：空行拿掉，整張是空的就不留
  function closeNote() {
    if (closed.current) return;
    closed.current = true;
    Keyboard.dismiss();
    const t = takeDraft();
    if (t) n.items.unshift({ id: uid(), t, done: false, b: false }); // 輸入框裡打到一半的字跟著這張紙走，不丟
    n.items = n.items.filter(i => i.t.trim());
    if (isEmpty(n)) dropNotes(store.s, x => x === n, Date.now()); // 立墓碑（iCloud 同步 S0）
    store.change();
    store.flush();
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
      off = store.onPanelClosed(openOnce);
      t = setTimeout(openOnce, T.timing.freshFocusFallback);
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
    markDeleted(n, Date.now()); n.pinned = false;
    leaveHole(store.s, n.id, Date.now());
    n.items = n.items.filter(i => i.t.trim());
    const empty = isEmpty(n);
    if (empty) dropNotes(store.s, x => x === n, Date.now());
    closed.current = true;
    const next = store.s.notes.filter(x => !x.deleted).sort((a, b) => b.updated - a.updated)[0] ?? newNote();
    store.open(next.id);
    store.change();
    if (!empty) ui.toast('已移到最近刪除', { label: '復原', fn: () => { markRestored(n); fillHole(store.s, n.id, Date.now()); store.open(n.id); store.change(); } });
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
        const before = n.items;
        setItems(before.filter(i => !i.done));
        ui.toast('已清掉劃掉的行', { label: '復原', fn: () => {
          if (!mounted.current || closed.current) return;
          setItems(before);
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
            <LineList items={n.items} winH={winH} view={view} layouts={layouts} scrollY={scrollY} listH={listH} dragY={dragY}
              dragging={dragging} mounted={mounted} kickRef={kickRef} render={(it, index, inWin) => {
              // 完整的行：看得到的那段，加上正在打的、剛送出亮著的、正在拖的、等著對焦的（捲遠了也不能拆掉，拆了鍵盤會收、拖會斷）
              const live = inWin || editing === it.id || freshId === it.id || focused.current === it.id
                || pending.current?.id === it.id || (dragging && drag.current?.idx === index);
              const lh = liveH.current[it.id];
              return (
              <Line key={it.id} it={it} index={index} done={it.done} bg={nc.bg} rule={nc.rule} colors={c}
                live={live} liteH={!live && lh?.t === it.t ? lh.h : 0}
                dragFy={dragFy} dragAy={dragAy} dragOn={dragOn} dragY={dragY} dragY0={dragY0}
                count={n.items.length} calm={calm} fs={fs} dragging={live && dragging} editing={editing === it.id} rev={(revs.current[it.id] ?? 0) + store.syncRev(it.id)}
                fresh={freshId === it.id} onFreshDone={() => setFreshId(f => (f === it.id ? null : f))}
                dragIdx={dragIdx} dragTo={dragTo} dragDy={dragDy} dragH={dragH} dragMids={dragMids} dragTops={dragTops} dragHs={dragHs} dragLift={dragLift}
                refInput={r => { inputs.current[it.id] = r; }}
                onLayoutRow={(y, h) => {
                  // 正在打的那行長高了（字多了一行）：點的位置跟著往下，游標通常就在長出來的地方
                  const old = layouts.current[it.id], fa = focusAt.current;
                  if (old && fa?.id === it.id && fa.y !== undefined && h > old.h) fa.y += h - old.h;
                  if (newRow.current === it.id) placeNewRow(it.id, h); // 輸入框剛送出的那行：捲回頂端亮一下，或原地不動（見 addFromDraft）
                  if (seekRow.current === it.id) { seekRow.current = null; scrollTo(Math.max(0, y - view.current.h / 3), !calm); setFreshId(it.id); } // 搜尋點過來的那行
                  layouts.current[it.id] = { y, h };
                  if (live) liveH.current[it.id] = { h, t: it.t };
                  kickWin(); // 行的位置變了：看得到的是哪幾行可能也變了
                  if (focused.current === it.id) ensureVisible(it.id); // 打到長出新的一行時，跟著往上捲
                }}
                onChange={v => onChange(it.id, v)} onKey={(e, sel) => onKey(it.id, e, sel)}
                onFocus={() => onFocus(it.id)} onBlur={() => onBlur(it.id)}
                onStrike={fromSwipe => strike(it.id, fromSwipe)} onRemove={() => remove(it.id)}
                onMenu={y => openRowMenu(it.id, y)} onEdit={(caret, y) => focusItem(it.id, caret, y)}
                onMove={d => move(it.id, d)} drag={dragApi} />
              );
            }} />
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

// 排順序的把手：2 欄 × 3 列六個淺點（2026-11-03 多米給的圖，原本是 iOS 的三條線）。熱區由外面那層 st.grip 撐到 44
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

type LineProps = {
  it: Item; index: number; done: boolean; bg: string; rule: string; colors: Colors; count: number; calm: boolean; fs: number;
  dragging: boolean; editing: boolean; rev: number; // dragging＝紙上有一行正被拖著（拿起到放下），那段關掉行的 layout 過場
  fresh: boolean; onFreshDone: () => void; // fresh＝輸入框剛送出、捲回頂端的那行：亮一下再淡掉
  dragIdx: SharedValue<number>; dragTo: SharedValue<number>; dragDy: SharedValue<number>; dragH: SharedValue<number>;
  dragMids: SharedValue<number[]>; dragTops: SharedValue<number[]>; dragHs: SharedValue<number[]>; dragLift: SharedValue<number>;
  dragFy: SharedValue<number>; dragAy: SharedValue<number>; dragOn: SharedValue<number>; // 把手回報手指（見 Paper 的 autoDrag）
  dragY: SharedValue<number>; dragY0: SharedValue<number>; // 自動捲捲到哪、拿起時捲在哪（把手直接算被拖那行的位置用）
  live: boolean; liteH: number; // live＝做成完整的行（看得到的那段）；不是的話只畫字（LiteRow），liteH＝之前完整時量到的高（0＝沒量過，照字自己撐）
  refInput: (r: TextInputInstance | null) => void; onLayoutRow: (y: number, h: number) => void;
  onChange: (v: string) => void; onKey: (e: TextInputKeyPressEvent, sel: Sel) => void;
  onFocus: () => void; onBlur: () => void;
  onStrike: (fromSwipe?: boolean) => void; onRemove: () => void; onMove: (d: -1 | 1) => void; onMenu: (bottom: number) => void;
  onEdit: (caret?: number, y?: number) => void; // caret＝游標要落在第幾個字（點一下的位置換算來的）；沒給就落在行尾。y＝點在這行的哪個高度
  drag: { start: (id: string) => void; end: () => void };
};

// 一行只有在自己的資料變了才重畫（打字不算：字由底下的 Field 自己管），
// 不然每次重畫整頁，每一行的滑動手勢都要重設一次，打字和捲動會卡
const Line = memo(LineRow, (a, b) => a.it === b.it && a.done === b.done && a.index === b.index
  && a.bg === b.bg && a.rule === b.rule && a.colors === b.colors && a.count === b.count && a.calm === b.calm && a.fs === b.fs
  && a.dragging === b.dragging && a.editing === b.editing && a.rev === b.rev && a.fresh === b.fresh && a.live === b.live && a.liteH === b.liteH);

// 只做看得到的行（2026-11-03）：從捲到的地方往上、往下各多 LIVE_BUF 個螢幕，交給 render 做成完整的行（inWin），其他只畫字。
// 自己記 win、自己重畫：捲動時只有這一排重畫，整張紙、底部列不跟著重畫（多米 2026-11-03 真機：一直往下捲每隔一段卡一下）。
// 捲過 1/WIN_STEP 個螢幕就重算（之前半個螢幕：一次要做十幾行輸入框，iOS 做輸入框很花時間，就卡一下；改成每次只多做幾行）。
// 還沒量到位置的行當成最矮的一行；一開始還沒量：先做最上面「一個螢幕＋多留的」那麼多行
const WIN_STEP = 4;
type ListProps = {
  items: Item[]; winH: number; dragging: boolean;
  view: RefObject<{ h: number }>; layouts: RefObject<Record<string, { y: number; h: number }>>; mounted: RefObject<boolean>;
  scrollY: SharedValue<number>; listH: SharedValue<number>; dragY: SharedValue<number>;
  kickRef: RefObject<() => void>; render: (it: Item, index: number, inWin: boolean) => ReactNode;
};
function LineList({ items, winH, dragging, view, layouts, mounted, scrollY, listH, dragY, kickRef, render }: ListProps) {
  const [win, setWin] = useState(() => ({ a: 0, b: Math.ceil((winH * (1 + LIVE_BUF)) / ROW_MIN) }));
  const winRef = useRef(win);
  winRef.current = win;
  const calc = useRef(() => {});
  calc.current = () => {
    const H = view.current.h || winH, y = dragging ? dragY.value : scrollY.value;
    let pos = 0, a = -1, b = -1;
    for (let i = 0; i < items.length; i++) {
      const l = layouts.current[items[i].id];
      const t = l ? l.y : pos;
      pos = t + (l ? l.h : ROW_MIN);
      if (t > y + H * (1 + LIVE_BUF)) break;
      if (a < 0 && pos >= y - H * LIVE_BUF) a = i;
      b = i;
    }
    const w = { a: Math.max(0, a), b };
    if (w.a !== winRef.current.a || w.b !== winRef.current.b) setWin(w);
  };
  // 一格畫面裡叫好幾次（每一行量到位置都會叫）只算一次
  const kickT = useRef(0);
  const [kick] = useState(() => () => {
    if (kickT.current) return;
    kickT.current = requestAnimationFrame(() => { kickT.current = 0; if (mounted.current) calc.current(); });
  });
  kickRef.current = kick;
  useEffect(() => () => cancelAnimationFrame(kickT.current), []);
  useEffect(kick, [items.length, kick]);
  // 捲過 1/WIN_STEP 個螢幕才排回 JS 重算一次（不是每一格畫面）；拖的時候自動捲也走這裡
  useAnimatedReaction(() => Math.floor(scrollY.value / Math.max(1, listH.value / WIN_STEP)), (k, old) => {
    if (old !== null && k !== old) scheduleOnRN(kick);
  });
  return <>{items.map((it, i) => render(it, i, i >= win.a && i <= win.b))}</>;
}

// 一行的外殼：底色、格線、長出來／拿掉的淡入淡出、其他行讓位時的滑動、被拖時的浮起，完整的行和只畫字的行共用這一層
// （換來換去時外殼不重掛，才不會每捲一段就有幾行淡入淡出）。
// 位移直接在這裡看拖曳的值算，不經過別的反應轉一手（2026-11-03 多米真機：拖完放手畫面抖一下——轉一手就晚一格畫面，
// 放手換順序那一格，行已經站到新位置、位移還沒歸零）。只畫字的行接 IDLE_*（永遠不變），上千行拖的時候也不用每一行都重算
function LineRow(p: LineProps) {
  const w = useSharedValue(1);
  const giveWay = useSharedValue(0); // 讓位要讓多少（彈簧由完整的行在目標變了時開，見 LiveRow）
  const rowRef = useRef<ViewInstance>(null);
  const { calm, index, live } = p;
  const dIdx = live ? p.dragIdx : IDLE_IDX, dDy = live ? p.dragDy : IDLE_ZERO, dLift = live ? p.dragLift : IDLE_ZERO;
  const shell = useAnimatedStyle(() => {
    const from = dIdx.value, held = from >= 0 && index === from;
    const l = held ? dLift.value : 0; // 0～1：浮起多少
    return {
      zIndex: held ? 5 : 0,
      overflow: held ? ('visible' as const) : ('hidden' as const),
      shadowOpacity: LIFT_SHADOW * l,
      transform: [
        { translateY: held ? dDy.value : from < 0 ? 0 : giveWay.value },
        { scale: 1 + (calm ? 0 : (LIFT_SCALE - 1) * l) },
      ],
    };
  }, WEB_DEPS ? [index, calm, live] : undefined);
  return (
    <Animated.View ref={rowRef} collapsable={false}
      onLayout={e => { w.value = e.nativeEvent.layout.width; p.onLayoutRow(e.nativeEvent.layout.y, e.nativeEvent.layout.height); }}
      // 長出來淡入、拿掉淡出只掛在完整的行上：上千行時，每一行都掛的話打開、離開那張紙要一次登記、清掉上千個過場（2026-11-03 換張、點開 lag）
      entering={p.live ? ROW_IN : undefined} exiting={p.live ? ROW_OUT : undefined} layout={!p.live || p.dragging || calm ? undefined : ROW_MOVE}
      style={[st.ci, { backgroundColor: p.bg, borderBottomColor: p.rule }, !p.live && p.liteH ? { height: p.liteH } : null, shell]}>
      {p.live ? <Live {...p} w={w} giveWay={giveWay} rowRef={rowRef} />
        : <LiteRow t={p.it.t} done={p.done} bg={p.bg} colors={p.colors} fs={p.fs} />}
    </Animated.View>
  );
}

// 只畫字的一行（捲得很遠、看不到的那些）：跟完整的行同一套字型、行高、留白、右邊的把手，看起來一樣、佔一樣的高，
// 但沒有輸入框、手勢、動畫。捲過來之前（上下多留一個螢幕）就換成完整的行
const LiteRow = memo(function LiteRow({ t, done, bg, colors: c, fs }: { t: string; done: boolean; bg: string; colors: Colors; fs: number }) {
  const lh = { lineHeight: LINE_H, minHeight: Math.max(ROW_MIN, Math.round(LINE_H * fs) + PAD_V * 2) };
  return (
    <View style={[st.cin, { backgroundColor: bg }]}>
      <View style={st.field}>
        <Text style={[st.ta, lh, { color: done ? c.textStrike : c.textPrimary }, done && st.taDone]}>{t}</Text>
      </View>
      <View style={st.grip} accessible={false} importantForAccessibility="no-hide-descendants">
        <GripDots color={c.textSecondary} />
      </View>
    </View>
  );
});

type LiveProps = LineProps & {
  w: SharedValue<number>; giveWay: SharedValue<number>;
  rowRef: RefObject<ViewInstance | null>;
};
// 完整的一行：輸入框、滑動劃掉／刪除、長按選單、點一下編輯、把手拖曳。拿起、放下（dragging 變）只有外殼要換過場，
// 這層不跟著重畫（重畫就要重設每一行的四個手勢，拿起那一刻會頓一下）
const Live = memo(function Live(p: LiveProps) { return <LiveRow {...p} />; }, (a, b) => a.it === b.it && a.done === b.done && a.index === b.index
  && a.bg === b.bg && a.rule === b.rule && a.colors === b.colors && a.count === b.count && a.calm === b.calm && a.fs === b.fs
  && a.editing === b.editing && a.rev === b.rev && a.fresh === b.fresh);
function LiveRow(p: LiveProps) {
  const tx = useSharedValue(0);
  const op = useSharedValue(1);
  // 手勢和動畫只能抓這些「拆出來的」值；抓到 p 會連 p.it（這一行的資料）一起被凍住，打字就存不進去
  const { onStrike, onRemove, onMenu, onEdit, index, calm, dragIdx, dragTo, dragDy, dragH, dragTops, dragHs, dragLift, dragFy, dragAy, dragOn, dragY, dragY0 } = p;
  const { w, giveWay, rowRef } = p;
  const { start: dragStart, end: dragEnd } = p.drag;
  const { swipeStrikeBg, swipeDeleteBg } = p.colors;
  const id = p.it.id;
  const M = T.motion, G = T.gesture;
  // 手指現在在哪一區：1＝已越過劃掉門檻、-1＝已越過刪除門檻、0＝都沒有。換區那一刻震一下（iOS 郵件、備忘錄的做法），放手不震
  const armed = useSharedValue(0);
  // 滑動露出的「劃掉／刪除」那個字：越線那一刻放大一下再彈回，跟震動是同一個事件（2-4 做法 6）。
  // 這是震動的「看得見的版本」：手機放桌上、觸覺關掉的人也知道滑夠了（2-4 失效邊界 2）。減少動態：不放大
  const labelScale = useSharedValue(1);

  // 往右滑過門檻＝劃掉，往左滑過門檻＝刪除，沒滑夠就彈回。
  // 放手之後的滑回、彈回、滑出都是接手指放開速度的彈簧（2-4 做法 3），不是固定時長；劃掉在放手那一刻就改資料，不等滑回跑完。
  // 減少動態：不播滑回、滑出，改成整行淡回／淡出（回饋要在，只是不移動）
  const swipe = usePanGesture({
    activeOffsetX: [-G.swipeActivate, G.swipeActivate],
    failOffsetY: [-G.swipeFailY, G.swipeFailY],
    // H5 多米 2026-11-01 定乙：滑動不收鍵盤（記是核心動作，劃掉是周邊，周邊不打斷核心；之前 onActivate 就 dismissKb，正在打 A 行順手劃 B 行鍵盤會沒了）
    onActivate: () => { 'worklet'; armed.value = 0; labelScale.value = 1; },
    onUpdate: e => {
      'worklet';
      const dx = e.translationX, W = w.value, A = G.swipeActivate;
      // 手勢要橫移 A 才成立，成立那一刻 translationX 已經是 A：扣掉它，行才會從手指底下 0 開始跟，不會先跳一格。門檻仍照手指走的距離（dx）判
      tx.value = dx > 0 ? Math.max(0, dx - A) : Math.min(0, dx + A);
      const zone = dx > Math.min(G.strikeMax, W * G.strikeRatio) ? 1 : dx < -Math.min(G.deleteMax, W * G.deleteRatio) ? -1 : 0;
      if (zone === armed.value) return;
      armed.value = zone;
      if (zone === 0) return;
      scheduleOnRN(hapticArm);
      if (!calm) { labelScale.value = M.swipeLabel.armScale; labelScale.value = withSpring(1, M.swipeLabel.spring); }
    },
    onDeactivate: e => {
      'worklet';
      armed.value = 0;
      const dx = e.translationX, W = w.value, v = e.velocityX;
      if (!e.canceled && dx > Math.min(G.strikeMax, W * G.strikeRatio)) {
        scheduleOnRN(onStrike, true); // 放手那一刻就劃；底下的滑回只是回位
        if (calm) {
          tx.value = 0;
          op.value = M.reducedDimFrom;
          op.value = withTiming(1, { duration: M.strikeReturn.reducedFade });
        } else tx.value = withSpring(0, { velocity: v, ...M.strikeReturn.spring });
      } else if (!e.canceled && dx < -Math.min(G.deleteMax, W * G.deleteRatio)) {
        if (calm) {
          tx.value = 0;
          op.value = withTiming(0, { duration: M.deleteSlide.reducedFade }, () => scheduleOnRN(onRemove));
        } else tx.value = withSpring(-W, { velocity: v, ...M.deleteSlide.spring }, () => scheduleOnRN(onRemove));
      } else tx.value = calm ? 0 : withSpring(0, { velocity: v, ...M.snapBack.spring });
    },
  });
  // 長按：在 JS 端跑（只是開選單）。手指移超過門檻就不算長按、讓給滑動
  const press = useLongPressGesture({
    runOnJS: true,
    minDuration: G.longPressMs,
    maxDistance: G.longPressMove,
    onActivate: () => { rowRef.current?.measureInWindow((x, y, w, h) => onMenu(y + h)); },
  });
  // 點一下＝進這一行編輯。手指移超過門檻就不算點（捲動時碰到字不會跳出鍵盤）；第二輪試驗，誤觸就改回 2。
  // K1（2026-11-01 第三輪）：游標落在點的位置。撐高度的隱形 Text 用 onTextLayout 回報每一行的位置與文字（存在 lines），
  // 點的 x、y 是相對於掛手勢的那層（st.cin），x 扣掉它的左內距就跟 Text 同一個座標系；換算在 model.ts caretAt。
  // 網頁預覽沒有 onTextLayout，lines 是空的，照舊落在行尾；中英混排差一兩個字時再點一下，那時行已在編輯、原生輸入框自己接
  const lines = useRef<TextLine[]>([]);
  const textLen = p.it.t.length;
  const tap = useTapGesture({
    runOnJS: true,
    numberOfTaps: 1,
    maxDistance: G.longPressMove,
    onActivate: e => onEdit(caretAt(lines.current, e.x - T.space.l, e.y, textLen), e.y),
  });
  // 長按、點一下、滑動只有一個會成立：手指移超過門檻長按和點一下就放棄，滑動才接手；按住超過長按時間就不算點
  const rowGesture = useExclusiveGestures(press, tap, swipe);
  // 把手：拿起、放下回 JS（量位置、改資料）；手指移動中「拖到第幾個位置」與放下的落地動畫在這裡（UI 執行緒）算，不等 JS。
  // 拿起來的那幾毫秒 dragIdx 還是 -1（JS 還沒量完），先不算；跨過一行排回 JS 震一下
  // 把手常駐之後要分工（多米 2026-11-01）：把手上「上下」動才算拿起，「左右」動就讓給整行的滑動（從把手往左滑一樣是刪除，不會變成拖）
  const grip = usePanGesture({
    // 按在把手上：整行的長按、點一下等把手放棄了才算（2026-11-03 多米真機：拖把手時畫面閃一下——按著停一下再拖，
    // 整行的長按先成立、跳出行的選單（背景霧掉、底部列收起），一拖又關掉）。往左右滑把手會放棄（failOffsetX），整行的滑動照常
    block: [press, tap],
    activeOffsetY: [-G.dragActivate, G.dragActivate],
    failOffsetX: [-G.dragFailX, G.dragFailX],
    onActivate: () => { 'worklet'; scheduleOnRN(dragStart, id); },
    // 回報手指，同時直接把被拖那行放到手指底下（2026-11-03 多米真機：排順序很 lag——只交給 autoDrag 那一格才算，
    // 手指動了要等下一格畫面行才跟上）。對到第幾個位置、碰到上下緣要不要捲，還是 Paper 的 autoDrag 每一格算
    onUpdate: e => {
      'worklet';
      dragFy.value = e.translationY;
      dragAy.value = e.absoluteY;
      if (dragOn.value && dragIdx.value >= 0) dragDy.value = e.translationY + dragY.value - dragY0.value;
    },
    // 放下（onDeactivate 才帶放手速度）：其他行早就讓好位了，被拖的行滑進空出來的那一格
    // （往下拖＝to 那行原本的底邊往上一個自己的高；往上拖＝to 那行原本的頂邊），滑到了才回 JS 改資料；放手那一刻震一下。減少動態：直接到位
    onDeactivate: e => {
      'worklet';
      dragOn.value = 0; // 手放開了：autoDrag 不再寫行的位置、不再捲，換這裡的落地動畫
      const from = dragIdx.value;
      if (from < 0) { scheduleOnRN(dragEnd); return; }
      const to = dragTo.value, tops = dragTops.value, hs = dragHs.value, h = dragH.value;
      const target = to === from ? 0 : to > from ? tops[to] + hs[to] - h - tops[from] : tops[to] - tops[from];
      scheduleOnRN(hapticLand);
      dragLift.value = calm ? 0 : withSpring(0, LIFT_SPRING);
      if (calm) { dragDy.value = target; scheduleOnRN(dragEnd); return; }
      dragDy.value = withSpring(target, { velocity: e.velocityY, ...LAND_SPRING }, () => scheduleOnRN(dragEnd));
    },
    // 保險：手勢沒成立就放開（或拿起那幾毫秒內放開、JS 還沒量完）時收尾；end() 沒東西可收會自己略過
    onFinalize: () => { 'worklet'; if (dragIdx.value < 0) scheduleOnRN(dragEnd); },
  });

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }], opacity: op.value }));
  // 剛記的那行亮一下：捲回頂端的那段時間（freshGlow.delay）亮著，之後 freshGlow.duration 淡掉，淡完通知上層收起
  const glow = useSharedValue(0);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const { fresh, onFreshDone } = p;
  useEffect(() => {
    if (!fresh) return;
    const G2 = T.motion.freshGlow;
    glow.value = 1;
    glow.value = withDelay(calm ? 0 : G2.delay, withTiming(0, { duration: G2.duration }));
    const t = setTimeout(onFreshDone, (calm ? 0 : G2.delay) + G2.duration);
    return () => clearTimeout(t);
  }, [fresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const under = useAnimatedStyle(() => ({ backgroundColor: tx.value > 0 ? swipeStrikeBg : tx.value < 0 ? swipeDeleteBg : 'transparent' }));
  // 露出的字：越線前跟著行的位移從淡到亮，到門檻剛好全亮；越線後鎖在全亮；放手回位時再淡回去。
  // 行的位移比手指少 A（起步那段扣掉了），所以「到門檻」對行來說是門檻 − A
  const leftLabel = useAnimatedStyle(() => {
    const x = tx.value;
    if (x <= 0) return { opacity: 0, transform: [{ scale: 1 }] };
    const reach = Math.max(1, Math.min(G.strikeMax, w.value * G.strikeRatio) - G.swipeActivate);
    const opacity = armed.value === 1 ? 1 : interpolate(x, [0, reach], [M.swipeLabel.fromOpacity, 1], Extrapolation.CLAMP);
    return { opacity, transform: [{ scale: labelScale.value }] };
  });
  const rightLabel = useAnimatedStyle(() => {
    const x = tx.value;
    if (x >= 0) return { opacity: 0, transform: [{ scale: 1 }] };
    const reach = Math.max(1, Math.min(G.deleteMax, w.value * G.deleteRatio) - G.swipeActivate);
    const opacity = armed.value === -1 ? 1 : interpolate(-x, [0, reach], [M.swipeLabel.fromOpacity, 1], Extrapolation.CLAMP);
    return { opacity, transform: [{ scale: labelScale.value }] };
  });
  // 其他行讓位（被拖的那行跟手指走、浮起在外殼 LineRow 直接算）：彈簧只在「要讓到哪」變了那一刻開一次
  // （2026-11-03 多米真機：拖的時候有點 lag——以前寫在樣式裡，手指每動一格每一行都重開一次 200ms 的彈簧，讓位一直被往後拖）
  useAnimatedReaction(() => {
    const from = dragIdx.value, to = dragTo.value;
    if (from < 0 || index === from) return 0;
    if (from < to && index > from && index <= to) return -dragH.value;
    if (from > to && index < from && index >= to) return dragH.value;
    return 0;
  }, (y, old) => {
    if (y === old) return;
    giveWay.value = calm || dragIdx.value < 0 || old === null ? y : withSpring(y, SHIFT_SPRING);
  }, WEB_DEPS ? [index, calm] : undefined); // 相依陣列只給網頁（iOS 自己看用到哪些值，給了會一直跳警告）
  // 換回只畫字（捲遠了）：讓位歸零，不然留著上一次讓位的量
  useEffect(() => () => { giveWay.value = 0; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // VoiceOver：滑動和拖曳用不了，從輸入框的動作選單（上下滑）劃掉、刪除、移動
  const actions = [
    ...(p.it.t.trim() ? [{ name: 'strike', label: p.done ? '恢復' : '劃掉' }] : []),
    { name: 'remove', label: '刪除這行' },
    ...(index > 0 ? [{ name: 'up', label: '往上移' }] : []),
    ...(index < p.count - 1 ? [{ name: 'down', label: '往下移' }] : []),
  ];
  function onAction(e: AccessibilityActionEvent) {
    const a = e.nativeEvent.actionName;
    if (a === 'strike') p.onStrike();
    else if (a === 'remove') p.onRemove();
    else if (a === 'up') p.onMove(-1);
    else if (a === 'down') p.onMove(1);
  }

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, st.under, under]}>
        <Animated.Text style={[st.underText, { color: p.colors.textOnSwipe }, leftLabel]}>{p.done ? '恢復' : '劃掉'}</Animated.Text>
        <Animated.Text style={[st.underText, { color: p.colors.textOnSwipe }, rightLabel]}>刪除</Animated.Text>
      </Animated.View>
      <GestureDetector gesture={rowGesture}>
        <Animated.View style={[st.cin, { backgroundColor: p.bg }, slide]}>
          {/* 沒在編輯的行：輸入框上面蓋一層看不見的板子，手指碰不到它（點一下、長按、滑動由外層手勢接）。
              不用 pointerEvents='none'：RN 在 iOS 把它做成關掉整塊的 userInteractionEnabled，
              正在打字的那行一被關，輸入框就被迫放掉焦點、鍵盤收起（∧ ∨ 切行時鍵盤收了再開就是這個） */}
          {/* 正在編輯的那一行：整行提亮一點（網頁版有，多米 2026-10-31 第一輪補回來）。墊在字底下，不擋觸控 */}
          {p.editing && <View style={[StyleSheet.absoluteFill, { backgroundColor: p.colors.rowEditingFill }]} />}
          {/* 輸入框剛送出的這行：捲到頂端那段時間後亮著，再慢慢淡掉（見 Paper 的 addFromDraft） */}
          {p.fresh && <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: p.colors.rowEditingFill }, glowStyle]} pointerEvents="none" />}
          <View style={st.field}>
            {/* key 跟著 rev：程式改了這行的字（Return 切行、iCloud 同步換了字）就重掛輸入框，defaultValue 才會是新的字 */}
            <Field key={p.rev} text={p.it.t} done={p.done} fs={p.fs} colors={p.colors} refInput={p.refInput} actions={actions} onAction={onAction}
              onLines={ls => { lines.current = ls; }}
              onChange={p.onChange} onKey={p.onKey} onFocus={p.onFocus} onBlur={p.onBlur} />
            {!p.editing && <View style={StyleSheet.absoluteFill} collapsable={false} accessible={false} importantForAccessibility="no" />}
          </View>
          {/* 把手：每行常駐、熱區 44 寬，六個小點（2026-11-03 起，原本是 iOS 的三條線）。VoiceOver 不讀它（用輸入框動作選單的往上移／往下移） */}
          <GestureDetector gesture={grip}>
            <View style={st.grip} accessible={false} importantForAccessibility="no-hide-descendants">
              <GripDots color={p.colors.textSecondary} />
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
    </>
  );
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
      <TextInput ref={setRef} defaultValue={text} multiline scrollEnabled={false}
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
  // 一行就是紙上的一行：沒有卡片，底下一條淡格線，左右貼齊整頁
  // 陰影的顏色、模糊、位移先掛著，平常 shadowOpacity 是 0 看不到；排順序拿起來那一行由 shift 把它亮起來
  ci: { borderBottomWidth: T.shape.borderCard, overflow: 'hidden',
    shadowColor: T.shape.shadowSoft.shadowColor, shadowRadius: T.shape.shadowSoft.shadowRadius, shadowOffset: T.shape.shadowSoft.shadowOffset },
  under: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: T.space.gutter },
  underText: { ...T.font.callout, fontWeight: T.font.semibold },
  cin: { flexDirection: 'row', alignItems: 'flex-start', gap: T.space.xs, paddingLeft: T.space.l },
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

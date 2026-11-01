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
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import {
  AppState, Keyboard, Platform, Pressable, Share, StyleSheet, Text, TextInput, useWindowDimensions, View,
  type AccessibilityActionEvent, type TextInputInstance, type TextInputKeyPressEvent, type ViewInstance,
} from 'react-native';
import { GestureDetector, ScrollView, useExclusiveGestures, useLongPressGesture, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { KeyboardEvents, useKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, {
  Easing, Extrapolation, FadeIn, FadeOut, interpolate, LayoutAnimationConfig, LinearTransition,
  useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { ago, binItem, caretAt, convertNote, dropNotes, fullDate, isEmpty, markDeleted, markRestored, plain, splitPasted, uid, unbinItem, type ColorKey, type Item, type Note, type TextLine } from '../lib/model';
import { newNote, store, useStore } from '../lib/store';
import { haptic, T, useColors, useNoteColors, type Colors } from '../lib/tokens';
import type { Act } from './Acts';
import { ui } from './Overlay';
import { Composer } from './Composer';
import { PopMenu } from './PopMenu';
import { Swatches } from './Swatches';
import { Sym } from './Sym';
import { DoneBtn, Fab, GlassBtn } from './WebBars';

// 空紙上的茄子：扁平線條版（多米 2026-10-31 生的圖，去背後放 assets；轉成 WebP 品質 85，135 KB → 16 KB，顯示才 96pt 看不出差別）
const FACE_FLAT = require('../../assets/img/face-flat.webp');
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
// 一行字的高度與上下留白（字級與行高看 tokens 的 bodyLine，上下各 12）
const LINE_H = T.font.bodyLine.lineHeight;
const PAD_V = T.space.m;
const ROW_MIN = T.shape.rowMin;

export function Paper({ n }: { n: Note }) {
  useStore();
  const [, force] = useReducer((x: number) => x + 1, 0);
  const insets = useSafeAreaInsets();
  const calm = useReducedMotion();
  const { fontScale: fs, height: winH } = useWindowDimensions();
  const c = useColors();
  const nc = useNoteColors(n.color);
  const closed = useRef(false);
  const mounted = useRef(true);
  const scrollRef = useRef<any>(null);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  // 改名字時輸入框的高度＝平常那行清單名量到的高（多米 2026-11-01：改名字時大字的上緣被切掉）。iOS 單行輸入框只會照它量到的高畫字，
  // 量出來比 28 點粗體（再跟著系統字級放大）的實際字高矮，字頂就被切；拿同一行字、同字級的 Text 量到的高最準
  const [titleH, setTitleH] = useState(0);
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
      { label: '搬到…', icon: 'arrow.turn.up.right', hidden: !it.t.trim(), fn: () => router.push({ pathname: '/directory', params: { move: id } }) },
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
  function addLine() { if (composing) return; haptic('add'); openComposer(); }
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
  // K5（2026-11-01 第三輪）：貼上帶換行的字自動拆成多行。只在「新字的換行數比舊字多」時拆（舊資料本來就帶換行的格，打一個字不會整格炸開）；
  // 拆法跟網頁版 splitLines 一樣（model.ts splitPasted）：第一段留在原行、其餘依序插在正下方、游標停在最後一段尾端。
  // Return 現在是送出，一格裡的換行只剩貼上與口述「換行」兩個來源（口述換行也會拆，算對）
  const newlines = (s: string) => (s.match(/\n/g) ?? []).length;
  function onChange(id: string, v: string) {
    const idx = n.items.findIndex(i => i.id === id);
    if (idx < 0) return;
    const it = n.items[idx];
    if (newlines(v) > newlines(it.t)) {
      const parts = splitPasted(v);
      if (parts.length > 1) {
        it.t = parts[0];
        revs.current[id] = (revs.current[id] ?? 0) + 1; // 原行被程式改字，輸入框要重掛
        const rest: Item[] = parts.slice(1).map(t => ({ id: uid(), t, done: false, b: false }));
        n.items.splice(idx + 1, 0, ...rest);
        touch();
        const last = rest[rest.length - 1];
        focusItem(last.id, last.t.length);
        return;
      }
    }
    it.t = v;
    touch(true);
  }
  // Return：這行有字＝在它正下方長出新的一行，游標後面的字搬到新行、游標落在新行開頭；整行空的＝收鍵盤。
  // 不走 focusNew（那條插最上面、捲回頂端，連續記想法時視線會一直跑）。另一處會多出一行的地方就是這裡
  function onSubmit(id: string, caret: number) {
    const idx = n.items.findIndex(i => i.id === id);
    if (idx < 0) return;
    const it = n.items[idx];
    if (!it.t.trim()) { Keyboard.dismiss(); return; }
    const at = Math.max(0, Math.min(caret, it.t.length));
    const after = it.t.slice(at);
    if (after) { it.t = it.t.slice(0, at); revs.current[id] = (revs.current[id] ?? 0) + 1; }
    const nu: Item = { id: uid(), t: after, done: false, b: false };
    n.items.splice(idx + 1, 0, nu);
    touch();
    focusItem(nu.id, 0);
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
      dragLift.value = calm ? 1 : withSpring(1, T.motion.dragLift.spring);
      setDragging(true);
      haptic('dragStart');
    },
    // 落地動畫跑完（或減少動態時直接到位）才會到這裡：改資料、下一格把位移歸零（那時新順序已經畫好，行就在原地）
    end() {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
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
  function openDir() { Keyboard.dismiss(); router.push('/directory'); }
  function togglePin() { n.pinned = !n.pinned; touch(); ui.toast(n.pinned ? '已釘選' : '已取消釘選'); }
  function share() { Keyboard.dismiss(); Share.share({ message: shareText() }).catch(() => {}); }
  function pickColor(k: ColorKey) {
    if (n.color === k) return;
    n.color = k;
    touch();
    haptic('color'); // 選單不關，震一下才知道有換到
  }
  // 刪除這張：換到最近改過的另一張；一張都沒有就開一張新的。刪除時間記下來（30 天自動清，2026-11-01 接上），復原時清掉
  function del() {
    Keyboard.dismiss();
    markDeleted(n, Date.now()); n.pinned = false;
    n.items = n.items.filter(i => i.t.trim());
    const empty = isEmpty(n);
    if (empty) dropNotes(store.s, x => x === n, Date.now());
    closed.current = true;
    const next = store.s.notes.filter(x => !x.deleted).sort((a, b) => b.updated - a.updated)[0] ?? newNote();
    store.open(next.id);
    store.change();
    if (!empty) ui.toast('已移到最近刪除', { label: '復原', fn: () => { markRestored(n); store.open(n.id); store.change(); } });
  }
  const setItems = (items: Item[]) => { n.items = items; touch(); };
  const moreActs: Act[] = [
    { label: '改名字', icon: 'pencil', fn: () => setRenaming(true) },
    { label: n.pinned ? '取消釘選' : '釘選', icon: n.pinned ? 'pin.slash' : 'pin', fn: togglePin },
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
    { label: '刪除這張', icon: 'trash', destructive: true, fn: del },
  ];

  // 紙底下那行手勢提示（點一下改字 · 右滑劃掉 · 左滑刪除 · 按住更多）2026-11-01 拿掉：第一次安裝放的教學紙（model.ts TUTORIAL）取代它

  return (
    <Animated.View style={{ flex: 1, backgroundColor: nc.bg }} collapsable={false} entering={ROW_IN}>
      {/* 最上面一行：清單名（點一下開目錄；⋯ 裡的「改名字」才會變成可以打字）和 ⋯。
          名字跟著系統字級放大，但最多 1.5 倍，不然會把 ⋯ 擠出去 */}
      <View style={[st.bar, { paddingTop: insets.top + T.space.s }]}>
        {renaming ? (
          // 多行輸入框（multiline＋Return 送出）：iOS 單行輸入框畫 28 點粗體中文時字頂會被切，加高也沒用（多米 2026-11-01 兩次回報）；
          // 紙上每一行用的多行輸入框畫中文從沒切過。貼上帶換行的字時換行換成空格，清單名只有一行
          <TextInput autoFocus defaultValue={n.title} placeholder="這張叫什麼" maxFontSizeMultiplier={T.font.listTitleMaxScale}
            multiline submitBehavior="blurAndSubmit"
            // 網頁的 textarea 預設兩列高，限一列；iOS 不限（限了長名字打到一半會被藏起來）
            {...(Platform.OS === 'web' ? { numberOfLines: 1 } : null)}
            placeholderTextColor={c.textMuted} style={[st.titleInput, { minHeight: Math.max(T.shape.hitMin, titleH), color: c.textPrimary }]} returnKeyType="done"
            accessibilityLabel="清單名"
            onChangeText={v => { n.title = v.replace(/\n/g, ' '); touch(true); }}
            onFocus={() => onFocus('title')} onBlur={() => { setRenaming(false); onBlur('title'); touch(); }}
            onSubmitEditing={dismissKb} />
        ) : (
          <Pressable style={({ pressed }) => [st.titleBtn, pressed && { opacity: T.motion.pressDim }]} onPress={openDir}
            accessibilityRole="button" accessibilityLabel={`${name}，換一張清單`} accessibilityHint="打開目錄">
            {n.pinned ? <Sym name="pin.fill" size={14} color={c.textSecondary} /> : null}
            <Text style={[st.title, { color: n.title.trim() ? c.textPrimary : c.textSecondary }]} numberOfLines={1}
              onLayout={e => setTitleH(e.nativeEvent.layout.height)}
              maxFontSizeMultiplier={T.font.listTitleMaxScale}>{name}</Text>
            <View style={[st.chev, { backgroundColor: c.surface }]}>
              <Sym name="chevron.down" size={12} color={c.textPrimary} weight="semibold" />
            </View>
          </Pressable>
        )}
        {/* ✓ 出現／收起時 ⋯ 跟著鍵盤的時鐘滑過去，不瞬間跳一格（多米 2026-11-01）。減少動態：不滑，直接到位 */}
        <Animated.View layout={calm ? undefined : KB_SLIDE}>
          <GlassBtn icon="ellipsis" label="選單" onPress={() => { Keyboard.dismiss(); setMenu(true); }} />
        </Animated.View>
        {/* 在行裡或清單名裡打字時才有的茄紫 ✓（多米 2026-11-01：膠囊拿掉後行裡打字收不掉鍵盤，照 iOS 提醒事項放在右上）。
            看「哪一格在編輯」不看 composing：按輸入框的 ✓ 收起時框先收、鍵盤晚一兩格才開始收，看 composing 會在那幾格閃出一顆 ✓ */}
        {kbUp && (editing !== null || renaming) && <DoneBtn onPress={dismissKb} label="完成，收起鍵盤" />}
      </View>

      {/* 標題列下面：左邊多久前改的、右邊完整時間（多米 2026-10-31 要留） */}
      <View style={[st.timeRow, { borderBottomColor: nc.rule }]}>
        <Text style={[st.timeText, { color: c.textSecondary }]}>{ago(n.updated)}</Text>
        <Text style={[st.timeText, { color: c.textSecondary }]}>{fullDate(n.updated)}</Text>
      </View>

      <View ref={boxRef} style={{ flex: 1 }} collapsable={false}
        onLayout={() => boxRef.current?.measureInWindow((x, y, w, h) => { view.current.top = y; view.current.h = h; below.value = Math.max(0, winH - (y + h)); })}>
        {/* keyboardDismissMode='interactive'（K7）：往下捲過鍵盤時手指可以把鍵盤一路拖下去，膠囊由 kbH 逐格跟著 */}
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
          onScrollEndDrag={scrolled} onMomentumScrollEnd={scrolled}
          scrollEnabled={!dragging}>
          {/* 空紙：扁平線條的茄子＋兩行灰字指到右下角的 ＋ */}
          {n.items.length === 0 && (
            <View style={st.empty}>
              <Image source={FACE_FLAT} style={st.emptyFace} contentFit="contain" accessible={false} />
              <Text style={[st.emptyText, { color: c.textSecondary }]}>這張還是空的</Text>
              <Text style={[st.emptyText, { color: c.textSecondary }]}>點右下角的 ＋ 記一行</Text>
            </View>
          )}
          <LayoutAnimationConfig skipEntering>
            {n.items.map((it, index) => (
              <Line key={it.id} it={it} index={index} done={it.done} bg={nc.bg} rule={nc.rule} colors={c}
                count={n.items.length} calm={calm} fs={fs} dragging={dragging} editing={editing === it.id} rev={(revs.current[it.id] ?? 0) + store.syncRev(it.id)}
                fresh={freshId === it.id} onFreshDone={() => setFreshId(f => (f === it.id ? null : f))}
                dragIdx={dragIdx} dragTo={dragTo} dragDy={dragDy} dragH={dragH} dragMids={dragMids} dragTops={dragTops} dragHs={dragHs} dragLift={dragLift}
                refInput={r => { inputs.current[it.id] = r; }}
                onLayoutRow={(y, h) => {
                  // 正在打的那行長高了（字多了一行）：點的位置跟著往下，游標通常就在長出來的地方
                  const old = layouts.current[it.id], fa = focusAt.current;
                  if (old && fa?.id === it.id && fa.y !== undefined && h > old.h) fa.y += h - old.h;
                  if (newRow.current === it.id) placeNewRow(it.id, h); // 輸入框剛送出的那行：捲回頂端亮一下，或原地不動（見 addFromDraft）
                  layouts.current[it.id] = { y, h };
                  if (focused.current === it.id) ensureVisible(it.id); // 打到長出新的一行時，跟著往上捲
                }}
                onChange={v => onChange(it.id, v)} onKey={(e, sel) => onKey(it.id, e, sel)} onSubmit={caret => onSubmit(it.id, caret)}
                onFocus={() => onFocus(it.id)} onBlur={() => onBlur(it.id)}
                onStrike={fromSwipe => strike(it.id, fromSwipe)} onRemove={() => remove(it.id)}
                onMenu={y => openRowMenu(it.id, y)} onEdit={(caret, y) => focusItem(it.id, caret, y)}
                onMove={d => move(it.id, d)} drag={dragApi} />
            ))}
          </LayoutAnimationConfig>
          {/* 留白讓最後一行能捲上來；點這裡不會新增一行。200 只用一次 */}
          <View style={{ height: 200 + kbPad + insets.bottom }} />
        </ScrollView>
      </View>

      {/* 右下角 ＋：底下升起輸入框。鍵盤開著時被鍵盤蓋住、輸入框開著時也不畫。進出跟鍵盤同一個事件、同一個時鐘（keyboardWillShow／WillHide 那一刻，
          2-4 做法 6；多米 2026-11-01 說 ✓ 之後 ＋ 回來的時間點不對：之前等鍵盤完全收完才淡進，比鍵盤晚一拍）。
          鍵盤膠囊（∧ ∨ ＋ ✓）2026-11-01 多米定拿掉：輸入框旁邊就有 ✓，行裡打字要收鍵盤點空白處或空行按 Return */}
      {!kbUp && !composing && <Fab onPress={addLine} label="新增一行" />}

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
          <Composer calm={calm} maxH={winH - Math.max(kbPad, insets.bottom) - view.current.top - T.space.s * 2}
            onChange={t => { draft.current = t; }} onSubmit={sendDraft} onDone={doneComposer} onBlur={closeComposer} />
        </Animated.View>
      )}

      {menu && (
        <PopMenu acts={moreActs} top={insets.top + T.shape.hitMin + T.space.m} onClose={() => setMenu(false)}
          header={<Swatches current={n.color} onPick={pickColor} />} />
      )}
      {rowMenu && <PopMenu acts={rowActs(rowMenu.id)} top={rowMenu.top} onClose={() => setRowMenu(null)} />}
    </Animated.View>
  );
}

// ⋯ 選單最上面一排九個色塊（Swatches.tsx，目錄的篩選也用它）：點了紙直接換色，選單不關（看得到後面換了）

// 按鍵那一刻游標選到哪（start＝end 就是沒選取、游標在 start）
type Sel = { start: number; end: number };

type LineProps = {
  it: Item; index: number; done: boolean; bg: string; rule: string; colors: Colors; count: number; calm: boolean; fs: number;
  dragging: boolean; editing: boolean; rev: number; // dragging＝紙上有一行正被拖著（拿起到放下），那段關掉行的 layout 過場
  fresh: boolean; onFreshDone: () => void; // fresh＝輸入框剛送出、捲回頂端的那行：亮一下再淡掉
  dragIdx: SharedValue<number>; dragTo: SharedValue<number>; dragDy: SharedValue<number>; dragH: SharedValue<number>;
  dragMids: SharedValue<number[]>; dragTops: SharedValue<number[]>; dragHs: SharedValue<number[]>; dragLift: SharedValue<number>;
  refInput: (r: TextInputInstance | null) => void; onLayoutRow: (y: number, h: number) => void;
  onChange: (v: string) => void; onKey: (e: TextInputKeyPressEvent, sel: Sel) => void; onSubmit: (caret: number) => void;
  onFocus: () => void; onBlur: () => void;
  onStrike: (fromSwipe?: boolean) => void; onRemove: () => void; onMove: (d: -1 | 1) => void; onMenu: (bottom: number) => void;
  onEdit: (caret?: number, y?: number) => void; // caret＝游標要落在第幾個字（點一下的位置換算來的）；沒給就落在行尾。y＝點在這行的哪個高度
  drag: { start: (id: string) => void; end: () => void };
};

// 一行只有在自己的資料變了才重畫（打字不算：字由底下的 Field 自己管），
// 不然每次重畫整頁，每一行的滑動手勢都要重設一次，打字和捲動會卡
const Line = memo(LineRow, (a, b) => a.it === b.it && a.done === b.done && a.index === b.index
  && a.bg === b.bg && a.rule === b.rule && a.colors === b.colors && a.count === b.count && a.calm === b.calm && a.fs === b.fs
  && a.dragging === b.dragging && a.editing === b.editing && a.rev === b.rev && a.fresh === b.fresh);

function LineRow(p: LineProps) {
  const tx = useSharedValue(0);
  const op = useSharedValue(1);
  const w = useSharedValue(1);
  // 手勢和動畫只能抓這些「拆出來的」值；抓到 p 會連 p.it（這一行的資料）一起被凍住，打字就存不進去
  const { onStrike, onRemove, onMenu, onEdit, index, calm, dragIdx, dragTo, dragDy, dragH, dragMids, dragTops, dragHs, dragLift } = p;
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
  const rowRef = useRef<ViewInstance>(null);
  const hold = useLongPressGesture({
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
  const rowGesture = useExclusiveGestures(hold, tap, swipe);
  // 把手：拿起、放下回 JS（量位置、改資料）；手指移動中「拖到第幾個位置」與放下的落地動畫在這裡（UI 執行緒）算，不等 JS。
  // 拿起來的那幾毫秒 dragIdx 還是 -1（JS 還沒量完），先不算；跨過一行排回 JS 震一下
  // 把手常駐之後要分工（多米 2026-11-01）：把手上「上下」動才算拿起，「左右」動就讓給整行的滑動（從把手往左滑一樣是刪除，不會變成拖）
  const grip = usePanGesture({
    activeOffsetY: [-G.dragActivate, G.dragActivate],
    failOffsetX: [-G.dragFailX, G.dragFailX],
    onActivate: () => { 'worklet'; scheduleOnRN(dragStart, id); },
    onUpdate: e => {
      'worklet';
      const from = dragIdx.value;
      if (from < 0) return;
      const mids = dragMids.value, dy = e.translationY, y = mids[from] + dy;
      dragDy.value = dy;
      let to = 0;
      for (let k = 0; k < mids.length; k++) if (k !== from && mids[k] < y) to++;
      if (to === dragTo.value) return;
      dragTo.value = to;
      scheduleOnRN(hapticPass);
    },
    // 放下（onDeactivate 才帶放手速度）：其他行早就讓好位了，被拖的行滑進空出來的那一格
    // （往下拖＝to 那行原本的底邊往上一個自己的高；往上拖＝to 那行原本的頂邊），滑到了才回 JS 改資料；放手那一刻震一下。減少動態：直接到位
    onDeactivate: e => {
      'worklet';
      const from = dragIdx.value;
      if (from < 0) { scheduleOnRN(dragEnd); return; }
      const to = dragTo.value, tops = dragTops.value, hs = dragHs.value, h = dragH.value;
      const target = to === from ? 0 : to > from ? tops[to] + hs[to] - h - tops[from] : tops[to] - tops[from];
      scheduleOnRN(hapticLand);
      dragLift.value = calm ? 0 : withSpring(0, M.dragLift.spring);
      if (calm) { dragDy.value = target; scheduleOnRN(dragEnd); return; }
      dragDy.value = withSpring(target, { velocity: e.velocityY, ...M.dragLand.spring }, () => scheduleOnRN(dragEnd));
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
  // 排順序：被拖的行跟手指走並浮起（放大一點＋陰影；陰影要露出來得暫時解開給滑動用的 overflow: hidden），其他行用彈簧讓位
  const shift = useAnimatedStyle(() => {
    const from = dragIdx.value, to = dragTo.value;
    const held = from >= 0 && index === from;
    const lift = held ? dragLift.value : 0; // 0～1：浮起多少
    let y = 0;
    if (held) y = dragDy.value;
    else if (from >= 0) {
      if (from < to && index > from && index <= to) y = -dragH.value;
      if (from > to && index < from && index >= to) y = dragH.value;
    }
    return {
      zIndex: held ? 5 : 0,
      overflow: held ? ('visible' as const) : ('hidden' as const),
      shadowOpacity: T.shape.shadowSoft.shadowOpacity * lift,
      transform: [
        { translateY: held || calm || from < 0 ? y : withSpring(y, M.dragShift.spring) },
        { scale: 1 + (calm ? 0 : (M.dragLift.scale - 1) * lift) },
      ],
    };
  }, WEB_DEPS ? [index, calm] : undefined);

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
    <Animated.View ref={rowRef} collapsable={false}
      onLayout={e => { w.value = e.nativeEvent.layout.width; p.onLayoutRow(e.nativeEvent.layout.y, e.nativeEvent.layout.height); }}
      entering={ROW_IN} exiting={ROW_OUT} layout={p.dragging || calm ? undefined : ROW_MOVE}
      style={[st.ci, { backgroundColor: p.bg, borderBottomColor: p.rule }, shift]}>
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
              onChange={p.onChange} onKey={p.onKey} onSubmit={p.onSubmit} onFocus={p.onFocus} onBlur={p.onBlur} />
            {!p.editing && <View style={StyleSheet.absoluteFill} collapsable={false} accessible={false} importantForAccessibility="no" />}
          </View>
          {/* 把手：每行常駐、熱區 44 寬，三條線是 iOS 的慣例。VoiceOver 不讀它（用輸入框動作選單的往上移／往下移） */}
          <GestureDetector gesture={grip}>
            <View style={st.grip} accessible={false} importantForAccessibility="no-hide-descendants">
              <Sym name="line.3.horizontal" size={18} color={p.colors.textSecondary} />
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

// 一行的字。高度由底下一份看不見的同樣文字決定：它跟一般文字一樣會自動換行、自動長高，
// 輸入框疊在它上面撐滿，字打到超過一行就一定會長出下一行。打字時只有這一小塊重畫。
// 字級跟著系統放大。行高不用自己乘倍數：iOS 上 React Native 會自動把行高一起放大，自己再乘一次行距會變兩倍大。
// 最小高度不會自動放大，才要自己乘
// Return 不換行而是送出（submitBehavior='submit'：鍵盤不收），由上層在下面開新的一行；游標在哪用 onSelectionChange 記著，切行、行首 Backspace 併行時要用
function Field({ text, done, fs, colors: c, refInput, actions, onAction, onLines, onChange, onKey, onSubmit, onFocus, onBlur }: {
  text: string; done: boolean; fs: number; colors: Colors; refInput: (r: TextInputInstance | null) => void;
  actions: { name: string; label: string }[]; onAction: (e: AccessibilityActionEvent) => void;
  onLines: (lines: TextLine[]) => void; // 隱形 Text 每次排版完回報每一行（K1 游標落點用）
  onChange: (v: string) => void; onKey: (e: TextInputKeyPressEvent, sel: Sel) => void; onSubmit: (caret: number) => void;
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
        submitBehavior="submit" enterKeyHint="next"
        // 網頁預覽的 TextInput 不認 submitBehavior，多行只有 blurOnSubmit 才會送出；送出後上層會把焦點放到新的一行。iOS 不給這個
        {...(Platform.OS === 'web' ? { blurOnSubmit: true } : null)}
        style={[st.ta, lh, WEB_DEPS && st.taFill, { color: done ? c.textStrike : c.textPrimary }, done && st.taDone]}
        accessibilityHint={done ? '已劃掉' : undefined}
        accessibilityActions={actions} onAccessibilityAction={onAction}
        onChangeText={v => { setTxt(v); onChange(v); }} onKeyPress={e => onKey(e, selNow())}
        onSelectionChange={e => { sel.current = { start: e.nativeEvent.selection.start, end: e.nativeEvent.selection.end }; }}
        onSubmitEditing={() => onSubmit(selNow().start)}
        onFocus={onFocus} onBlur={onBlur} />
    </>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: T.space.s, paddingHorizontal: T.space.m, paddingBottom: T.space.s },
  titleBtn: { flex: 1, minWidth: 0, minHeight: T.shape.hitMin, flexDirection: 'row', alignItems: 'center', gap: T.space.s, paddingHorizontal: T.space.xs },
  title: { flexShrink: 1, minWidth: 0, ...T.font.paperTitle },
  titleInput: { flex: 1, minWidth: 0, ...T.font.paperTitle, paddingVertical: 0, paddingHorizontal: T.space.xs },
  chev: { width: T.shape.chev, height: T.shape.chev, borderRadius: T.shape.pill(T.shape.chev), alignItems: 'center', justifyContent: 'center', ...T.shape.shadowSoft },
  // 一行就是紙上的一行：沒有卡片，底下一條淡格線，左右貼齊整頁
  // 陰影的顏色、模糊、位移先掛著，平常 shadowOpacity 是 0 看不到；排順序拿起來那一行由 shift 把它亮起來
  ci: { borderBottomWidth: T.shape.borderCard, overflow: 'hidden',
    shadowColor: T.shape.shadowSoft.shadowColor, shadowRadius: T.shape.shadowSoft.shadowRadius, shadowOffset: T.shape.shadowSoft.shadowOffset },
  under: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: T.space.l },
  underText: { ...T.font.subheadBold },
  cin: { flexDirection: 'row', alignItems: 'flex-start', gap: T.space.xs, paddingLeft: T.space.l },
  field: { flex: 1, minWidth: 0 },
  ta: { ...T.font.bodyLine, paddingTop: PAD_V, paddingBottom: PAD_V, paddingHorizontal: T.space.xs },
  // 隱形鏡像文字：iOS 只拿來量每一行的位置（K1 游標落點），不撐高度；網頁才用它撐高度（textarea 不會自己長）。
  // 右邊只比輸入框多留 1 點：留太多字快滿一行時鏡像會先換行、網頁的行底下就多出一整行空白；完全不留又可能反過來把最後一行切掉。5 只用一次
  mirror: { color: 'transparent', paddingRight: 5 },
  taFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, textAlignVertical: 'top' },
  taDone: { textDecorationLine: 'line-through' },
  grip: { width: T.shape.hitMin, height: T.shape.rowMin, alignItems: 'center', justifyContent: 'center' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: T.space.l, paddingVertical: T.space.s, borderBottomWidth: T.shape.borderCard },
  timeText: { ...T.font.footnote },
  empty: { alignItems: 'center', paddingTop: T.space.xxl, paddingHorizontal: T.space.l },
  emptyFace: { width: T.shape.emptyFace, height: T.shape.emptyFace, marginBottom: T.space.m },
  emptyText: { ...T.font.subhead, lineHeight: T.font.emptyLineHeight, textAlign: 'center' },
  // 鍵盤上面那顆：奶油白膠囊，底下留 8 跟鍵盤分開
  // 輸入框的外框：貼在畫面底邊、離鍵盤 8，由 composerStyle 跟著鍵盤推上去
  kbarWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: T.space.s, paddingHorizontal: T.space.l },
});

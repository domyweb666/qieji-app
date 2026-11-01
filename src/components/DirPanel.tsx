// 目錄面板（B3，多米 2026-11-01 晚（二）定）：自己做的、從螢幕上面垂下來的面板，取代系統 formSheet。
// 開：紙的標題區往下拉（跟著手指）、點標題下的把手、行的「搬到…」。收：點下面露出的那截紙、把面板底部把手往上推、點一塊磚。
// 裡面：搜尋、新的一張、色磚、最近刪除、搬行模式（原本 src/app/directory.tsx 整段搬過來）。
// C1（2026-11-02）：磚照座位表（State.order）排，改字不換位、新的一張排最後；「已釘選／其他」兩段拿掉，釘選的磚右上角一個圖釘。
// C3：放不下往右一頁、頁點。C4：長按一塊磚跳選單（顏色、改名字、刪除、編輯目錄），長按後一拖就進抖動、同一頁裡拖換位置；
// 抖動時面板不收（往上推、點露出的紙只會結束抖動），點磚不換紙、不能搜尋、不能翻頁。
// 面板跟紙在同一個畫面（index）裡，紙那邊的手勢才能逐格推它；開到多開由 dirPanel.p（0＝收起、1＝全開）決定。
// D2：抖動中拖一張停在別張磚正中間半秒＝疊成資料夾（疊在資料夾上＝放進去）；為了到得了正中間，讓位改成停在邊邊或空隙 0.2 秒才讓（多米選照 iOS）。
// D1（2026-11-02）：資料夾。長按紙磚「放進資料夾…」；資料夾磚（名字＋裡面紙的小色塊）跟紙磚一起排、一起拖；點開在目錄上面打開一個框，
// 點名字改名；資料夾裡的紙長按「移出資料夾」。資料夾裡不能拖（D3）
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type AccessibilityActionEvent, type ScrollViewInstance } from 'react-native';
import { GestureDetector, useExclusiveGestures, useLongPressGesture, usePanGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation, LinearTransition, makeMutable, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import {
  col, dropNotes, folderOf, intoFolder, isEmpty, label, markDeleted, markRestored, moveItem, newFolder, outOfFolder, renameFolder, reseat, seatedEntries, seatedNotes,
  type ColorKey, type Entry, type Folder, type Note,
} from '../lib/model';
import { newNote, store, useStore } from '../lib/store';
import { haptic, T, useColors, useNoteColors } from '../lib/tokens';
import type { Act } from './Acts';
import { Empty } from './Empty';
import { ui } from './Overlay';
import { PopMenu } from './PopMenu';
import { Swatches } from './Swatches';
import { Sym } from './Sym';

const M = T.motion, G = T.gesture;
// useAnimatedStyle 的相依陣列只有網頁用得到，iOS 上傳了會一直跳警告（同 Paper）
const WEB_DEPS = Platform.OS === 'web';
// 拖磚時其他磚讓位滑過去（C4）
const TILE_MOVE = LinearTransition.duration(M.tileShift.duration);
const noop = () => {};
// 給手勢（UI 執行緒）呼叫的放模組層級（規矩檔：worklet 裡不准直接叫 tokens 的函式）
const hapticLand = () => haptic('dragDrop');
// 格子裡第 k 格的左上角（兩欄，磚高 TILE、間距 GAP），與拖到哪一格：看被拖那塊的中心落在哪一格
const TILE = T.shape.tile, GAP = T.space.m, PAD = T.space.l, EDGE = T.gesture.edgeZone, PRESS_DIM = T.motion.pressDim; // worklet 只抓數字，不抓整個 T（裡面有函式）
const ZONE = T.gesture.stackZone, GROW = T.motion.stackTarget.scale;
function slotX(k: number, w: number) { 'worklet'; return (k % 2) * (w + GAP); }
function slotY(k: number) { 'worklet'; return Math.floor(k / 2) * (TILE + GAP); }
function slotAt(from: number, tx: number, ty: number, w: number, count: number) {
  'worklet';
  const cx = slotX(from, w) + w / 2 + tx, cy = slotY(from) + TILE / 2 + ty;
  const k = Math.max(0, Math.floor(cy / (TILE + GAP))) * 2 + (cx < w + GAP / 2 ? 0 : 1);
  return Math.min(count - 1, Math.max(0, k));
}

let host: { begin: (move?: string) => void; settle: (open: boolean, velocity?: number, then?: () => void) => void } | null = null;
export const dirPanel = {
  p: makeMutable(0), // 0＝收起、1＝全開。紙的標題區往下拉時在 UI 執行緒逐格寫
  h: makeMutable(1), // 面板高度（螢幕高 − dirPeek），拉的距離除以它就是 p
  calm: makeMutable(false), // 減少動態：面板不滑，改淡入淡出（紙那邊放手時要知道）
  // 準備打開：掛上內容、收鍵盤、告訴 store 面板開著（控制中心「記一行」、新的一張的輸入框都等它收完）
  begin: (move?: string) => host?.begin(move),
  // 放手或點了之後：彈到全開或收起。velocity 是手指放開的速度換成 p 的單位
  settle: (open: boolean, velocity?: number, then?: () => void) => host?.settle(open, velocity, then),
  open: (move?: string) => { host?.begin(move); host?.settle(true); },
  close: (then?: () => void) => host?.settle(false, 0, then),
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
        setMove(m);
        setShown(true);
        store.panelOpened();
      },
      settle: (toOpen, velocity = 0, then) => {
        if (!toOpen) { Keyboard.dismiss(); setOpen(false); }
        const done = () => {
          if (toOpen) { setOpen(true); return; }
          setShown(false); setMove(undefined); setEditing(false);
          if (store.panelOpen) store.panelClosed();
          then?.();
        };
        const target = toOpen ? 1 : 0;
        p.value = calm ? withTiming(target, { duration: M.dirPanel.reducedFade }, f => { if (f) scheduleOnRN(done); })
          : withSpring(target, { velocity, ...M.dirPanel.spring }, f => { if (f) scheduleOnRN(done); });
      },
    };
    return () => { host = null; };
  }, [calm, p]);

  // 面板底部把手往上推：跟著手指收上去，推過一段或往上甩就收起，不然彈回全開。抖動中關掉（C4，審查紀錄 ❓5）
  const { h } = dirPanel;
  const settle = (toOpen: boolean, v: number) => dirPanel.settle(toOpen, v);
  const push = usePanGesture({
    enabled: !editing,
    activeOffsetY: [-G.pullActivate, G.pullActivate],
    onUpdate: e => { 'worklet'; p.value = Math.min(1, Math.max(0, 1 + e.translationY / h.value)); },
    onDeactivate: e => {
      'worklet';
      const shut = e.translationY < -h.value * G.pushCloseRatio || e.velocityY < -G.flick;
      scheduleOnRN(settle, !shut, e.velocityY / h.value);
    },
  });
  // 點露出的紙、點底部把手：抖動中只結束抖動（跟 iOS 點桌布一樣），不收
  const tapOut = () => (editing ? setEditing(false) : dirPanel.close());

  const sheet = useAnimatedStyle(() => (calm
    ? { opacity: p.value, transform: [{ translateY: 0 }] }
    : { opacity: 1, transform: [{ translateY: -H * (1 - p.value) }] }));
  const dim = useAnimatedStyle(() => ({ opacity: p.value }));

  if (!shown) return null;
  return (
    // 停在全開之前（正在拉、正在彈）整層不接觸控：手指還在紙的標題區上拉，不能被蓋上來的暗幕或面板搶走
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'box-none' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, dim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={tapOut}
          accessibilityRole="button" accessibilityLabel={editing ? '完成編輯' : '收起目錄'} />
      </Animated.View>
      <Animated.View style={[st.sheet, { height: H, backgroundColor: c.surface }, sheet]}
        accessibilityViewIsModal onAccessibilityEscape={tapOut}>
        <Directory move={move} padTop={insets.top + T.space.s} panelH={H} editing={editing} setEditing={setEditing} />
        <GestureDetector gesture={push}>
          <Pressable style={st.grabBox} onPress={tapOut} accessibilityRole="button" accessibilityLabel={editing ? '完成編輯' : '收起目錄'}>
            <View style={[st.grab, { backgroundColor: c.textSecondary }]} />
          </Pressable>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

type DirProps = { move?: string; padTop: number; panelH: number; editing: boolean; setEditing: (on: boolean) => void };

function Directory({ move, padTop, panelH, editing, setEditing }: DirProps) {
  const s = useStore();
  const c = useColors();
  const calm = useReducedMotion();
  const { width } = useWindowDimensions();
  const [q, setQ] = useState('');
  const searching = !!q.trim();

  // 多米 2026-11-01：排序選項與顏色篩選拿掉（太雜）；C1 起照座位表排，搜尋也照座位（審查紀錄 2026-11-01 晚、晚（三））
  const notes = seatedNotes(s, q);
  // D1：不搜尋時目錄最上層一格一格是紙或資料夾；搜尋時直接列紙（資料夾裡的也列）
  const entries: Entry[] = searching ? notes.map(n => ({ id: n.id, note: n, notes: [n] })) : seatedEntries(s);
  const trashed = s.notes.filter(n => n.deleted).length;
  // 兩欄：整頁左右各留 16，中間留 12
  const tileW = (width - T.space.l * 2 - T.space.m) / 2;
  // 分頁（C3）：格子區高 boxH 扣掉上緣留白，放得下幾列整磚就幾列（不切半塊）；第一頁最上面一列是「新的一張」
  const [boxH, setBoxH] = useState(0);
  const [page, setPage] = useState(0);
  // 一頁 R 列＝上緣 s ＋ grid 的 marginTop m ＋ R 塊磚 ＋ (R−1) 個間距 m＝s ＋ R ×（磚＋m）；第一頁的「新的一張」那列也是一塊磚高＋m
  const rows = Math.max(1, Math.floor((boxH - T.space.s) / (T.shape.tile + T.space.m)));
  const pages: Entry[][] = [];
  for (let i = 0, take = (rows - 1) * 2; i < entries.length || !pages.length; i += take, take = rows * 2) pages.push(entries.slice(i, i + take));
  const pageStart = (i: number) => (i === 0 ? 0 : (rows - 1) * 2 + (i - 1) * rows * 2);

  // 長按選單（C4）：哪一張（或哪個資料夾，D1）、選單放多高
  const [menu, setMenu] = useState<{ id: string; top: number } | null>(null);
  const menuNote = menu ? s.notes.find(n => n.id === menu.id && !n.deleted) : undefined;
  const menuFolder = menu && !menuNote ? s.folders?.find(f => f.id === menu.id) : undefined;
  // 打開的資料夾（D1）：哪一個、名字是不是正在打（新資料夾、選單的改名字一打開就能打）。裡面一張都看不到了就自己收起
  const [openF, setOpenF] = useState<{ id: string; naming: boolean } | null>(null);
  const openEntry = openF ? seatedEntries(s).find(e => e.id === openF.id && e.folder) : undefined;
  useEffect(() => { if (openF && !openEntry) setOpenF(null); }, [openF, openEntry]);
  // 打開的資料夾裡兩欄：框左右各留 l、框裡再留 l
  const innerW = (width - T.space.l * 4 - T.space.m) / 2;
  // 拖的那塊（C4、C5）：從哪一頁拿起（origin）、現在在哪一頁（page）、在整排座位裡原本第幾個（from）、現在要放第幾個（to）。
  // 手指位置（dx、dy）在 UI 執行緒；換格、翻頁才回 JS 重排讓位
  const [drag, setDrag] = useState<{ id: string; origin: number; page: number; from: number; to: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const dx = useSharedValue(0), dy = useSharedValue(0), lift = useSharedValue(0);
  // 手勢在 UI 執行緒要用的：拿起那格在原本那頁是第幾格（fromK）、翻頁後格子上下差多少（shift：第一頁上面多一列「新的一張」）、
  // 現在這頁有幾格（count）、現在對到第幾格（last）、在不在邊緣（edge：−1 左、1 右、0 不在）
  const fromK = useSharedValue(0), shift = useSharedValue(0), count = useSharedValue(0), last = useSharedValue(0), edge = useSharedValue(0);
  // D2：手指現在瞄著哪裡（aim：k＝想讓位到第 k 格；−k−1＝停在第 k 格那張磚的正中間）、準備疊到第幾格（stackK，−1＝沒有）
  const aim = useSharedValue(0), stackK = useSharedValue(-1);
  const sv = { fromK, shift, count, last, edge, aim, stackK };
  // 準備疊上去的那一格是誰（放大那塊）；計時器到了才設。ref 給放手時讀最新的
  const [stackOn, setStackOn] = useState<string | null>(null);
  const stackRef = useRef(stackOn);
  stackRef.current = stackOn;
  const aimT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const pagerRef = useRef<ScrollViewInstance>(null);
  const edgeT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cap = (i: number) => (i === 0 ? (rows - 1) * 2 : rows * 2);
  const gridTop = (i: number) => (i === 0 ? TILE : 0); // 格子在頁裡從多高開始（第一頁上面那列「新的一張」）

  // 搬行模式：來源是現在這張紙、要搬的那一行。行已經不在了（例如同時被刪）就當普通目錄用
  const from = move ? s.notes.find(n => n.id === store.last && !n.deleted) : undefined;
  const moving = from?.items.find(i => i.id === move);
  function pick(n: Note) {
    if (from && moving) {
      const name = label(n);
      if (moveItem(from, n, moving.id)) { n.updated = from.updated = Date.now(); store.change(); ui.toast(`已搬到「${name}」`); }
      dirPanel.close();
      return;
    }
    store.open(n.id);
    dirPanel.close();
  }
  // 新的一張：黃色；開完直接停在紙的輸入列（fresh）。搬行時就是搬進新的一張（紙不換）
  function add() {
    const n = newNote('yellow', 'check');
    if (from && moving) { pick(n); return; }
    store.open(n.id, true);
    dirPanel.close();
  }

  /* ---------- 長按選單（C4）：顏色、改名字、刪除、編輯目錄。D1：紙多「放進資料夾…」或「移出資料夾」；資料夾只有改名字、編輯目錄 ---------- */
  function openMenu(id: string, y: number, swatches = true, rowCount = 4) {
    Keyboard.dismiss();
    haptic('menu');
    const h = (swatches ? T.shape.swatchDot + T.space.l * 2 : 0) + T.shape.menuRow * rowCount + T.space.xs * 2 + T.space.s * 2; // 一排色塊＋幾個項目（PopMenu 的藥丸版）
    setMenu({ id, top: Math.max(padTop, Math.min(y + T.space.s, panelH - h - T.space.l)) });
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
  // 刪除：跟紙的 ⋯「刪除這張」同一套（進最近刪除、30 天、空白的直接拿掉），toast 復原。刪的是現在這張，紙自己換到最近改過的
  function del(n: Note) {
    markDeleted(n, Date.now()); n.pinned = false;
    n.items = n.items.filter(i => i.t.trim());
    const empty = isEmpty(n);
    if (empty) dropNotes(store.s, x => x === n, Date.now());
    store.change();
    if (!empty) ui.toast('已移到最近刪除', { label: '復原', fn: () => { markRestored(n); store.change(); } });
  }
  // 放進資料夾（D1）：還沒有看得到的資料夾就直接在這張的位置開一個新的、打開讓你取名；有就問放進哪一個
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
  // 移出資料夾：排在資料夾後面一格；最後一張移出，資料夾不見（打開的框跟著收起）
  function takeOut(n: Note) {
    if (outOfFolder(store.s, n.id, Date.now())) store.change();
  }
  const tileActs = (n: Note): Act[] => {
    const inside = !!folderOf(s, n.id);
    return [
      { label: '改名字', icon: 'pencil', fn: () => rename(n) },
      inside ? { label: '移出資料夾', icon: 'folder.badge.minus', fn: () => takeOut(n) } : { label: '放進資料夾…', icon: 'folder.badge.plus', fn: () => putIn(n) },
      { label: '刪除', icon: 'trash', destructive: true, fn: () => del(n) },
      { label: '編輯目錄', icon: 'square.grid.2x2', fn: () => setEditing(true), hidden: inside },
    ];
  };
  const folderActs = (f: Folder): Act[] => [
    { label: '改名字', icon: 'pencil', fn: () => setOpenF({ id: f.id, naming: true }) },
    { label: '編輯目錄', icon: 'square.grid.2x2', fn: () => setEditing(true) },
  ];
  // VoiceOver 的「往前移／往後移」：拖不了時的替代路徑（行的排順序也這樣做）。D1：資料夾磚也算一格
  function moveBy(n: { id: string }, d: -1 | 1) {
    const ids = seatedEntries(store.s).map(x => x.id), i = ids.indexOf(n.id), to = i + d;
    if (i < 0 || to < 0 || to >= ids.length) return;
    [ids[i], ids[to]] = [ids[to], ids[i]];
    reseat(store.s, ids); store.change();
  }

  /* ---------- 拖換位置（C4）：長按後一拖就進抖動；抖動中直接拖。C5：拖到左右邊緣停一下就翻頁、放到別頁 ---------- */
  function dragStart(id: string, pg: number, k: number) {
    setMenu(null); setEditing(true);
    setDrag({ id, origin: pg, page: pg, from: pageStart(pg) + k, to: pageStart(pg) + k });
    haptic('dragStart');
  }
  function dragTo(k: number) { setDrag(d => (d && d.to !== pageStart(d.page) + k ? { ...d, to: pageStart(d.page) + k } : d)); }
  function unstack() {
    if (stackK.value >= 0) stackK.value = -1;
    if (stackRef.current) setStackOn(null);
  }
  // 手指瞄的地方變了（D2）：先取消還在等的讓位／疊、縮回放大的那塊。邊邊或空隙：停 reflow 才讓位；
  // 別張磚正中間：停 stackHover 那張放大＝放手就疊。拖的是資料夾磚就只讓位不疊（資料夾不能放進資料夾）
  function onAim(a: number) {
    clearTimeout(aimT.current);
    unstack();
    const d = dragRef.current;
    if (!d) return;
    const flat = entriesRef.current.filter(e => e.id !== d.id), me = entriesRef.current.find(e => e.id === d.id);
    const k = a >= 0 ? a : -a - 1;
    if (a >= 0 || me?.folder) {
      if (pageStart(d.page) + k === dragRef.current?.to) return;
      aimT.current = setTimeout(() => { last.value = k; dragTo(k); haptic('dragPass'); }, T.timing.reflow);
      return;
    }
    if (me) flat.splice(d.to, 0, me);
    const under = flat[pageStart(d.page) + k];
    if (!under || under.id === d.id) return;
    aimT.current = setTimeout(() => { stackK.value = k; setStackOn(under.id); haptic('dragStart'); }, T.timing.stackHover);
  }
  // 在邊緣停 edgeFlip 就翻一頁；一直停著就再翻。翻過去後格子對到哪格照手指現在的位置重算（手指不動也要算）
  function onEdge(z: number) {
    clearTimeout(edgeT.current);
    if (!z) return;
    edgeT.current = setTimeout(function flip() {
      const d = dragRef.current;
      const np = d ? d.page + z : -1;
      if (!d || np < 0 || np >= pages.length || edge.value !== z) return;
      clearTimeout(aimT.current);
      unstack();
      pagerRef.current?.scrollTo({ x: np * width, animated: !calm });
      setPage(np);
      shift.value = gridTop(d.origin) - gridTop(np);
      count.value = Math.max(1, Math.min(cap(np), entries.length - pageStart(np)));
      const k = slotAt(fromK.value, dx.value, dy.value + shift.value, tileW, count.value);
      last.value = k; aim.value = k;
      setDrag({ ...d, page: np, to: pageStart(np) + k });
      haptic('dragPass');
      edgeT.current = setTimeout(flip, T.timing.edgeFlip);
    }, T.timing.edgeFlip);
  }
  useEffect(() => () => { clearTimeout(edgeT.current); clearTimeout(aimT.current); }, []);
  // 落地動畫跑完才改座位表：被拖的那張從整排的第 from 個搬到第 to 個（其他照原順序，空出來的由後面補上）
  function drop() {
    clearTimeout(edgeT.current);
    clearTimeout(aimT.current);
    const d = dragRef.current, onto = stackRef.current ? entriesRef.current.find(e => e.id === stackRef.current) : undefined;
    if (d && onto) {
      // D2 疊：疊在資料夾上＝放進最後面；疊在紙上＝在那張的位置開新資料夾（它排第一），打開取名（跟 D1 新資料夾一樣）
      const now = Date.now();
      if (onto.folder) intoFolder(store.s, d.id, onto.id, now);
      else {
        const f = newFolder(store.s, onto.id, now);
        intoFolder(store.s, d.id, f.id, now);
        setOpenF({ id: f.id, naming: true });
      }
      store.change();
    } else if (d && d.to !== d.from) {
      const ids = seatedEntries(store.s).map(x => x.id);
      const [m] = ids.splice(d.from, 1);
      ids.splice(d.to, 0, m);
      reseat(store.s, ids); store.change();
    }
    setStackOn(null); stackK.value = -1;
    setDrag(null);
    dx.value = 0; dy.value = 0; shift.value = 0;
  }
  // 拖的時候畫出來的分頁：被拖的那張先搬到要放的位置（隱形佔位），整排重新切頁，其他磚讓位、後面的往前補
  const laid: Entry[][] = [];
  if (drag) {
    const flat = entries.filter(n => n.id !== drag.id), m = entries.find(n => n.id === drag.id);
    if (m) flat.splice(drag.to, 0, m);
    pages.forEach((_, i) => laid.push(flat.slice(pageStart(i), pageStart(i) + cap(i))));
  }
  const shown = (i: number) => (drag ? laid[i] : pages[i]);

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
  const tile = (e: Entry, k: number, pg: number, total: number) => {
    const f = e.folder, n = e.note;
    const common = {
      w: tileW, sw: width, k, editing, calm, canDrag: !searching, ghost: drag?.id === e.id, count: total, dx, dy, lift, sv,
      onDragStart: () => dragStart(e.id, pg, k), onAim, onEdge, onDrop: drop, target: stackOn === e.id,
    };
    if (f) {
      return (
        <Tile key={e.id} {...common} label={`資料夾，${f.name}，${e.notes.length} 張`} selected={e.notes.some(x => x.id === store.last)} acts={FOLDER_A11Y}
          onPick={() => setOpenF({ id: f.id, naming: false })} onMenu={y => openMenu(f.id, y, false, 2)}
          onA11y={name => {
            if (name === 'activate') setOpenF({ id: f.id, naming: false });
            else if (name === 'rename') setOpenF({ id: f.id, naming: true });
            else if (name === 'forward') moveBy(f, -1);
            else if (name === 'backward') moveBy(f, 1);
          }}>
          {face(e, tileW)}
        </Tile>
      );
    }
    const inside = !!folderOf(s, n!.id);
    return (
      <Tile key={e.id} {...common} label={noteLabel(n!)} selected={e.id === store.last} acts={inside ? NOTE_IN_A11Y : NOTE_A11Y}
        onPick={() => pick(n!)} onMenu={y => openMenu(n!.id, y, true, inside ? 3 : 4)} onA11y={noteA11y(n!)}>
        {face(e, tileW)}
      </Tile>
    );
  };
  const dragged = drag ? entries.find(n => n.id === drag.id) : undefined;

  return (
    <View style={{ flex: 1 }} collapsable={false}>
      <View style={[st.top, { paddingTop: padTop }]}>
        <View style={[st.search, { backgroundColor: c.page }, editing && { opacity: T.motion.pressDim }]}>
          <Sym name="magnifyingglass" size={17} color={c.textSecondary} />
          <TextInput value={q} onChangeText={v => { setQ(v); setPage(0); }} placeholder="搜尋清單" placeholderTextColor={c.textMuted} clearButtonMode="while-editing"
            editable={!editing} style={[st.searchInput, { color: c.textPrimary }]} accessibilityLabel="搜尋清單" />
        </View>
        {/* 抖動中才有：結束編輯（跟 iOS 主畫面右上的「完成」一樣） */}
        {editing && (
          <Pressable onPress={() => setEditing(false)} hitSlop={T.space.s} accessibilityRole="button" accessibilityLabel="完成"
            style={({ pressed }) => [st.done, pressed && { opacity: T.motion.pressDim }]}>
            <Text style={[st.doneText, { color: c.textPrimary }]}>完成</Text>
          </Pressable>
        )}
      </View>

      {moving && (
        <Text style={[st.moveHead, { color: c.textSecondary }]} numberOfLines={2}>把「{moving.t.trim()}」搬到</Text>
      )}

      {searching ? (
        // 搜尋：所有頁的紙一起找，排成一整片上下捲，不分頁（不能拖：搜到的只是一部分）
        <ScrollView style={{ flex: 1 }} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={st.body}>
          <View style={st.grid}>{entries.map((e, k) => tile(e, k, 0, entries.length))}</View>
          {/* 找不到→帶他剛打的字；第一次不會是空的（紙永遠至少一張）。顏色篩選的空狀態跟著篩選一起拿掉（2026-11-01） */}
          {notes.length === 0 && <Empty lines={[`找不到含「${q.trim()}」的清單`]} />}
        </ScrollView>
      ) : (
        // C3 多頁：一頁放幾列照格子區的高度算（螢幕小、字放大就少放），放不下往右一頁；整頁翻（系統分頁捲動），每次打開從第一頁。抖動中不翻（C5 才有拖到邊緣翻頁）
        <View style={{ flex: 1 }} onLayout={e => setBoxH(e.nativeEvent.layout.height)}>
          {boxH > 0 && (
            <ScrollView ref={pagerRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEnabled={pages.length > 1 && !editing}
              keyboardShouldPersistTaps="handled" onScrollBeginDrag={() => Keyboard.dismiss()}
              onScroll={e => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
              scrollEventThrottle={T.timing.pageScroll}>
              {pages.map((list, i) => (
                <View key={i} style={[st.page, { width }]} accessibilityLabel={pages.length > 1 ? `第 ${i + 1} 頁，共 ${pages.length} 頁` : undefined}>
                  {i === 0 && (
                    <Pressable onPress={editing ? undefined : add} accessibilityRole="button" accessibilityLabel="新的一張"
                      style={({ pressed }) => [st.tile, st.add, { width: tileW, borderColor: c.separator }, pressed && !editing && { opacity: T.motion.pressDim }]}>
                      <Sym name="plus" size={22} color={c.textPrimary} />
                      <Text style={[st.tileText, { color: c.textPrimary }]}>新的一張</Text>
                    </Pressable>
                  )}
                  <View style={st.grid}>
                    {shown(i).map((n, k) => tile(n, k, i, list.length))}
                    {/* 拿起來的那張：浮在現在這頁的格子上跟著手指（要放的位置留隱形佔位，其他磚照佔位讓開）。
                        放在拿起那格的位置再平移；翻到別頁時加上兩頁格子的高低差（shift），才會一直在手指下面 */}
                    {dragged && drag?.page === i && (
                      <Ghost w={tileW} from={drag.from - pageStart(drag.origin)} dx={dx} dy={dy} shift={shift} lift={lift}>{face(dragged, tileW)}</Ghost>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>
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
        <Pressable onPress={editing ? undefined : () => dirPanel.close(() => router.push('/trash'))} accessibilityRole="button" accessibilityLabel={`最近刪除，${trashed} 張`}
          style={({ pressed }) => [st.trashRow, { borderTopColor: c.separator }, pressed && !editing && { opacity: T.motion.pressDim }]}>
          <Sym name="trash" size={17} color={c.textSecondary} />
          <Text style={[st.trashText, { color: c.textSecondary }]}>最近刪除</Text>
          <View style={{ flex: 1 }} />
          <Text style={[st.trashText, { color: c.textSecondary }]}>{trashed}</Text>
          <Sym name="chevron.right" size={12} color={c.textSecondary} />
        </Pressable>
      )}

      {/* 打開的資料夾（D1）：蓋在目錄上面，點外面收起；名字點了就能改；裡面的紙點了換紙、長按跳選單（不能拖） */}
      {openEntry?.folder && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={() => { Keyboard.dismiss(); setOpenF(null); }}
            accessibilityRole="button" accessibilityLabel="收起資料夾" />
          <View style={[st.folderBox, { top: padTop, maxHeight: panelH - padTop - T.shape.hitMin, backgroundColor: c.surface }]} accessibilityViewIsModal
            onAccessibilityEscape={() => setOpenF(null)}>
            <FolderName key={openEntry.folder.id} f={openEntry.folder} focus={openF!.naming} />
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              <View style={st.grid}>
                {openEntry.notes.map((n, k) => (
                  <Tile key={n.id} w={innerW} sw={width} k={k} editing={false} calm={calm} canDrag={false} ghost={false} count={openEntry.notes.length}
                    dx={dx} dy={dy} lift={lift} sv={sv} onDragStart={noop} onAim={noop} onEdge={noop} onDrop={noop} target={false}
                    label={noteLabel(n)} selected={n.id === store.last} acts={NOTE_IN_A11Y}
                    onPick={() => pick(n)} onMenu={y => openMenu(n.id, y, true, 3)} onA11y={noteA11y(n)}>
                    <TileFace n={n} w={innerW} cur={n.id === store.last} />
                  </Tile>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {menu && menuNote && (
        <PopMenu acts={tileActs(menuNote)} top={menu.top} onClose={() => setMenu(null)}
          header={<Swatches current={menuNote.color} onPick={k => recolor(menuNote, k)} />} />
      )}
      {menu && menuFolder && <PopMenu acts={folderActs(menuFolder)} top={menu.top} onClose={() => setMenu(null)} />}
    </View>
  );
}

type DragSV = {
  fromK: SharedValue<number>; shift: SharedValue<number>; count: SharedValue<number>; last: SharedValue<number>; edge: SharedValue<number>;
  aim: SharedValue<number>; stackK: SharedValue<number>;
};
type TileProps = {
  w: number; sw: number; k: number; editing: boolean; calm: boolean; canDrag: boolean; ghost: boolean; count: number;
  dx: SharedValue<number>; dy: SharedValue<number>; lift: SharedValue<number>; sv: DragSV;
  label: string; selected: boolean; acts: { name: string; label?: string }[]; children: ReactNode;
  onPick: () => void; onMenu: (y: number) => void; onDragStart: () => void; onAim: (a: number) => void; onEdge: (z: number) => void; onDrop: () => void; target: boolean;
  onA11y: (name: string) => void;
};

// VoiceOver 的動作：目錄裡的紙、資料夾裡的紙（不能往前往後移，D3 才有資料夾裡的排序）、資料夾
const NOTE_A11Y = [
  { name: 'activate' }, { name: 'rename', label: '改名字' }, { name: 'folder', label: '放進資料夾' }, { name: 'delete', label: '刪除' },
  { name: 'forward', label: '往前移' }, { name: 'backward', label: '往後移' },
];
const NOTE_IN_A11Y = [{ name: 'activate' }, { name: 'rename', label: '改名字' }, { name: 'out', label: '移出資料夾' }, { name: 'delete', label: '刪除' }];
const FOLDER_A11Y = [{ name: 'activate' }, { name: 'rename', label: '改名字' }, { name: 'forward', label: '往前移' }, { name: 'backward', label: '往後移' }];

// 一塊磚的手勢（C4）：點＝換紙；長按（不動）＝選單；長按後一拖、或抖動中直接拖＝拿起來換位置。
// 長按與拖同時聽（長按先成立跳選單，手指再動才拖）；點要等它們都不成立。抖動中不能點、不跳選單
function Tile(p: TileProps) {
  const { k, w, sw, count, calm, dx, dy, lift, onPick, onMenu, onDragStart, onAim, onEdge, onDrop } = p;
  // 拖的時候對到第幾格、翻頁的高低差、這頁幾格都放在目錄那邊共用（翻頁是目錄做的，這塊磚的手勢要讀得到最新的）
  const { fromK, shift, count: pageCount, last, edge, aim, stackK } = p.sv;
  const pressed = useSharedValue(0);
  const tap = useTapGesture({
    runOnJS: true,
    enabled: !p.editing,
    maxDistance: G.longPressMove,
    onBegin: () => { pressed.value = 1; },
    onFinalize: () => { pressed.value = 0; },
    onActivate: () => onPick(),
  });
  const hold = useLongPressGesture({
    runOnJS: true,
    enabled: !p.editing,
    minDuration: G.longPressMs,
    maxDistance: G.longPressMove,
    onActivate: e => onMenu(e.absoluteY),
  });
  const pan = usePanGesture({
    enabled: p.canDrag,
    activateAfterLongPress: p.editing ? 0 : G.longPressMs,
    minDistance: G.tileDrag,
    onActivate: () => {
      'worklet';
      dx.value = 0; dy.value = 0; fromK.value = k; shift.value = 0; pageCount.value = count; last.value = k; edge.value = 0; aim.value = k; stackK.value = -1;
      lift.value = calm ? 1 : withSpring(1, M.dragLift.spring);
      scheduleOnRN(onDragStart);
    },
    onUpdate: e => {
      'worklet';
      dx.value = e.translationX; dy.value = e.translationY;
      // 磚的中心離螢幕左右邊多近（格子左邊還有頁的內距 space.l）：進出邊緣才回 JS 開始或停止計時翻頁（C5）
      const sx = slotX(fromK.value, w) + w / 2 + e.translationX + PAD;
      const z = sx < EDGE ? -1 : sx > sw - EDGE ? 1 : 0;
      if (z !== edge.value) { edge.value = z; scheduleOnRN(onEdge, z); }
      const ty = e.translationY + shift.value;
      const to = slotAt(fromK.value, e.translationX, ty, w, pageCount.value);
      // D2：中心在那格磚的正中間（磚寬、高各 ZONE 以內）＝瞄著那張要疊（−to−1），不然＝瞄著那格要讓位（to）。變了才回 JS 計時
      const ox = slotX(fromK.value, w) + e.translationX - slotX(to, w), oy = slotY(fromK.value) + ty - slotY(to);
      const over = to !== last.value && Math.abs(ox) < w * ZONE && Math.abs(oy) < TILE * ZONE;
      const a = over ? -to - 1 : to;
      if (a === aim.value) return;
      aim.value = a;
      scheduleOnRN(onAim, a);
    },
    // 放手：滑進要放的那一格（翻過頁就扣掉兩頁格子的高低差），到了才回 JS 改座位表；放手那一刻震一下。減少動態：直接到位
    onDeactivate: e => {
      'worklet';
      if (edge.value) { edge.value = 0; scheduleOnRN(onEdge, 0); }
      // 準備疊了就滑到底下那張的位置（放手後才疊），不然滑進讓出來的那格
      const from = fromK.value, to = stackK.value >= 0 ? stackK.value : last.value, tx = slotX(to, w) - slotX(from, w), ty = slotY(to) - slotY(from) - shift.value;
      scheduleOnRN(hapticLand);
      lift.value = calm ? 0 : withSpring(0, M.dragLift.spring);
      if (calm) { dx.value = tx; dy.value = ty; scheduleOnRN(onDrop); return; }
      dx.value = withSpring(tx, { velocity: e.velocityX, ...M.dragLand.spring });
      dy.value = withSpring(ty, { velocity: e.velocityY, ...M.dragLand.spring }, () => scheduleOnRN(onDrop));
    },
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
  // D2：被瞄著要疊的那張放大一點。減少動態：直接變大
  const grow = useSharedValue(1);
  useEffect(() => {
    grow.value = calm ? (p.target ? GROW : 1) : withSpring(p.target ? GROW : 1, M.dragLift.spring);
  }, [p.target, calm]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }, { scale: grow.value }],
    opacity: p.ghost ? 0 : 1 - pressed.value * (1 - PRESS_DIM),
  }), WEB_DEPS ? [p.ghost] : undefined);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={style} layout={calm ? undefined : TILE_MOVE}
        accessible accessibilityRole="button" accessibilityLabel={p.label}
        accessibilityState={{ selected: p.selected }} accessibilityActions={p.acts}
        onAccessibilityAction={(e: AccessibilityActionEvent) => p.onA11y(e.nativeEvent.actionName)}>
        {p.children}
      </Animated.View>
    </GestureDetector>
  );
}

// 拿起來的那張：放在原本那格的位置、跟著手指平移，浮起一點（放大＋陰影）。不接觸控，手勢還在原本那塊上
type GhostProps = { w: number; from: number; dx: SharedValue<number>; dy: SharedValue<number>; shift: SharedValue<number>; lift: SharedValue<number>; children: ReactNode };
function Ghost({ w, from, dx, dy, shift, lift, children }: GhostProps) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.value }, { translateY: dy.value + shift.value }, { scale: 1 + lift.value * (M.dragLift.scale - 1) }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[st.ghost, { left: slotX(from, w), top: slotY(from) }, style]}>
      {children}
    </Animated.View>
  );
}

// 一塊磚的樣子：底色是那張紙的顏色，右下角露出一顆色圓，只有名字。正在看的那張用 accent 框起來（面板上唯一的 accent）。
// 釘選的右上角一個圖釘（次要字色，跟紙標題旁那顆同一個；C1）
function TileFace({ n, w, cur }: { n: Note; w: number; cur: boolean }) {
  const c = useColors();
  const nc = useNoteColors(n.color);
  return (
    <View style={[st.tile, { width: w, backgroundColor: nc.bg, borderColor: cur ? c.accent : nc.rule, borderWidth: cur ? T.shape.borderSelected : T.shape.borderCard }]}>
      {/* 沒取名的跟紙的標題列一樣用次要色，看得出是「還沒取名」不是名字 */}
      <Text style={[st.tileText, n.pinned && st.tileTextPinned, { color: n.title.trim() ? c.textPrimary : c.textSecondary }]} numberOfLines={2}>{label(n)}</Text>
      <View style={[st.tag, { backgroundColor: nc.hd }]} />
      {n.pinned ? <View style={st.pin}><Sym name="pin.fill" size={14} color={c.textSecondary} /></View> : null}
    </View>
  );
}

// 資料夾磚（D1，多米 2026-11-02 選）：跟紙磚一樣大，上面資料夾名，下面一排小方塊＝裡面紙的色點（最多四個，更多的寫 +N）。
// 底用整頁底色、框用分隔線色，跟紙磚的紙色分得開；正在看的紙在裡面就用 accent 框
function FolderFace({ f, notes, w, cur }: { f: Folder; notes: Note[]; w: number; cur: boolean }) {
  const c = useColors();
  const more = notes.length - T.shape.folderMinis;
  return (
    <View style={[st.tile, { width: w, backgroundColor: c.page, borderColor: cur ? c.accent : c.separator, borderWidth: cur ? T.shape.borderSelected : T.shape.borderCard }]}>
      <Text style={[st.tileText, { color: c.textPrimary }]} numberOfLines={1}>{f.name}</Text>
      <View style={st.minis}>
        {notes.slice(0, T.shape.folderMinis).map(n => <Mini key={n.id} color={n.color} />)}
        {more > 0 && <Text style={[st.more, { color: c.textSecondary }]}>+{more}</Text>}
      </View>
    </View>
  );
}
function Mini({ color }: { color: ColorKey }) {
  const nc = useNoteColors(color);
  return <View style={[st.mini, { backgroundColor: nc.hd }]} />;
}

// 打開的資料夾上面的名字：點了就能打，打一個字存一次（框收起時輸入框直接拿掉，等不到 blur）；清空不存，收鍵盤時變回原名
function FolderName({ f, focus }: { f: Folder; focus: boolean }) {
  const c = useColors();
  const [draft, setDraft] = useState(f.name);
  return (
    <TextInput value={draft} autoFocus={focus} selectTextOnFocus={focus} returnKeyType="done" accessibilityLabel="資料夾名字"
      onChangeText={v => { setDraft(v); if (renameFolder(store.s, f.id, v, Date.now())) store.change(); }}
      onBlur={() => { if (!draft.trim()) setDraft(f.name); }}
      style={[st.folderName, { color: c.textPrimary }]} />
  );
}

const st = StyleSheet.create({
  sheet: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden',
    borderBottomLeftRadius: T.shape.radiusPanel, borderBottomRightRadius: T.shape.radiusPanel, ...T.shape.shadowSoft },
  grabBox: { height: T.shape.hitMin, alignItems: 'center', justifyContent: 'center' },
  grab: { width: T.shape.handleSolo, height: T.shape.dirGrab, borderRadius: T.shape.pill(T.shape.dirGrab), opacity: T.shape.handleOff },
  top: { flexDirection: 'row', alignItems: 'center', gap: T.space.m, paddingHorizontal: T.space.l, paddingBottom: T.space.s },
  search: { flex: 1, height: T.shape.hitMin, borderRadius: T.shape.radiusCard, flexDirection: 'row', alignItems: 'center', gap: T.space.s,
    paddingHorizontal: T.space.m },
  // alignSelf stretch：輸入框撐滿 44 高的藥丸，字由 iOS 自己垂直置中。只靠字的本身高度時，中文字的上緣會被切掉（多米 2026-11-01 真機）
  searchInput: { flex: 1, minWidth: 0, alignSelf: 'stretch', ...T.font.body, paddingVertical: 0 },
  done: { minHeight: T.shape.hitMin, justifyContent: 'center' },
  doneText: { ...T.font.emphasis },
  body: { paddingHorizontal: T.space.l, paddingTop: T.space.s, paddingBottom: T.space.l },
  moveHead: { ...T.font.subhead, marginBottom: T.space.s, marginHorizontal: T.space.l + T.space.xs },
  page: { paddingHorizontal: T.space.l, paddingTop: T.space.s },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: T.space.s, paddingVertical: T.space.s },
  dot: { width: T.shape.pageDot, height: T.shape.pageDot, borderRadius: T.shape.pill(T.shape.pageDot) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: T.space.m, marginTop: T.space.m },
  ghost: { position: 'absolute', ...T.shape.shadowSoft },
  tile: { height: T.shape.tile, borderRadius: T.shape.radiusCard, borderWidth: T.shape.borderCard, padding: T.space.m, overflow: 'hidden' },
  add: { borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: T.space.s },
  tileText: { ...T.font.emphasis },
  tileTextPinned: { marginRight: T.space.l }, // 名字長的時候不壓到右上角的圖釘
  pin: { position: 'absolute', top: T.space.m, right: T.space.m },
  tag: { position: 'absolute', right: -T.space.m, bottom: -T.space.m, width: T.shape.tileTag, height: T.shape.tileTag, borderRadius: T.shape.pill(T.shape.tileTag) },
  trashRow: { flexDirection: 'row', alignItems: 'center', gap: T.space.s, minHeight: T.shape.hitMin, marginHorizontal: T.space.l,
    paddingVertical: T.space.m, borderTopWidth: StyleSheet.hairlineWidth },
  trashText: { ...T.font.body },
  minis: { position: 'absolute', left: T.space.m, bottom: T.space.m, flexDirection: 'row', alignItems: 'center', gap: T.space.xs },
  mini: { width: T.shape.folderMini, height: T.shape.folderMini, borderRadius: T.shape.folderMiniRadius },
  more: { ...T.font.footnote },
  folderBox: { position: 'absolute', left: T.space.l, right: T.space.l, borderRadius: T.shape.radiusPanel, padding: T.space.l, ...T.shape.shadowSoft },
  folderName: { ...T.font.listTitle, textAlign: 'center', paddingVertical: T.space.s },
});

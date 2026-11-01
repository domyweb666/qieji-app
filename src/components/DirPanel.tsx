// 目錄面板（B3，多米 2026-11-01 晚（二）定）：自己做的、從螢幕上面垂下來的面板，取代系統 formSheet。
// 開：紙的標題區往下拉（跟著手指）、點標題下的把手、行的「搬到…」。收：點下面露出的那截紙、把面板底部把手往上推、點一塊磚。
// 裡面：搜尋、新的一張、色磚、最近刪除、搬行模式（原本 src/app/directory.tsx 整段搬過來）。
// C1（2026-11-02）：磚照座位表（State.order）排，改字不換位、新的一張排最後；「已釘選／其他」兩段拿掉，釘選的磚右上角一個圖釘。
// C3：放不下往右一頁、頁點。C4：長按一塊磚跳選單（顏色、改名字、刪除、編輯目錄），長按後一拖就進抖動、同一頁裡拖換位置；
// 抖動時面板不收（往上推、點露出的紙只會結束抖動），點磚不換紙、不能搜尋、不能翻頁。
// 面板跟紙在同一個畫面（index）裡，紙那邊的手勢才能逐格推它；開到多開由 dirPanel.p（0＝收起、1＝全開）決定。
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type AccessibilityActionEvent } from 'react-native';
import { GestureDetector, useExclusiveGestures, useLongPressGesture, usePanGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation, LinearTransition, makeMutable, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { col, dropNotes, isEmpty, label, markDeleted, markRestored, moveItem, reseat, seatedNotes, type ColorKey, type Note } from '../lib/model';
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
// 給手勢（UI 執行緒）呼叫的放模組層級（規矩檔：worklet 裡不准直接叫 tokens 的函式）
const hapticPass = () => haptic('dragPass');
const hapticLand = () => haptic('dragDrop');
// 格子裡第 k 格的左上角（兩欄，磚高 TILE、間距 GAP），與拖到哪一格：看被拖那塊的中心落在哪一格
const TILE = T.shape.tile, GAP = T.space.m;
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
  const trashed = s.notes.filter(n => n.deleted).length;
  // 兩欄：整頁左右各留 16，中間留 12
  const tileW = (width - T.space.l * 2 - T.space.m) / 2;
  // 分頁（C3）：格子區高 boxH 扣掉上緣留白，放得下幾列整磚就幾列（不切半塊）；第一頁最上面一列是「新的一張」
  const [boxH, setBoxH] = useState(0);
  const [page, setPage] = useState(0);
  // 一頁 R 列＝上緣 s ＋ grid 的 marginTop m ＋ R 塊磚 ＋ (R−1) 個間距 m＝s ＋ R ×（磚＋m）；第一頁的「新的一張」那列也是一塊磚高＋m
  const rows = Math.max(1, Math.floor((boxH - T.space.s) / (T.shape.tile + T.space.m)));
  const pages: Note[][] = [];
  for (let i = 0, take = (rows - 1) * 2; i < notes.length || !pages.length; i += take, take = rows * 2) pages.push(notes.slice(i, i + take));
  const pageStart = (i: number) => (i === 0 ? 0 : (rows - 1) * 2 + (i - 1) * rows * 2);

  // 長按選單（C4）：哪一張、選單放多高
  const [menu, setMenu] = useState<{ id: string; top: number } | null>(null);
  const menuNote = menu ? s.notes.find(n => n.id === menu.id && !n.deleted) : undefined;
  // 拖的那塊（C4）：哪一頁、原本第幾格、現在要放第幾格。手指位置（dx、dy）在 UI 執行緒，換格才回 JS 重排讓位
  const [drag, setDrag] = useState<{ id: string; page: number; from: number; to: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const dx = useSharedValue(0), dy = useSharedValue(0), lift = useSharedValue(0);

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

  /* ---------- 長按選單（C4）：顏色、改名字、刪除、編輯目錄 ---------- */
  function openMenu(id: string, y: number) {
    Keyboard.dismiss();
    haptic('menu');
    const h = T.shape.swatchDot + T.space.l * 2 + T.shape.menuRow * 3 + T.space.xs * 2 + T.space.s * 2; // 一排色塊＋三個項目（PopMenu 的藥丸版）
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
  const tileActs = (n: Note): Act[] => [
    { label: '改名字', icon: 'pencil', fn: () => rename(n) },
    { label: '刪除', icon: 'trash', destructive: true, fn: () => del(n) },
    { label: '編輯目錄', icon: 'square.grid.2x2', fn: () => setEditing(true) },
  ];
  // VoiceOver 的「往前移／往後移」：拖不了時的替代路徑（行的排順序也這樣做）
  function moveBy(n: Note, d: -1 | 1) {
    const ids = seatedNotes(store.s, '').map(x => x.id), i = ids.indexOf(n.id), to = i + d;
    if (i < 0 || to < 0 || to >= ids.length) return;
    [ids[i], ids[to]] = [ids[to], ids[i]];
    reseat(store.s, ids); store.change();
  }

  /* ---------- 拖換位置（C4）：長按後一拖就進抖動；抖動中直接拖 ---------- */
  function dragStart(id: string, pg: number, k: number) {
    setMenu(null); setEditing(true);
    setDrag({ id, page: pg, from: k, to: k });
    haptic('dragStart');
  }
  function dragTo(to: number) { setDrag(d => (d && d.to !== to ? { ...d, to } : d)); }
  // 落地動畫跑完才改座位表：被拖的那張從原本第幾格搬到第幾格（其他照原順序）
  function drop() {
    const d = dragRef.current;
    if (d && d.to !== d.from) {
      const ids = seatedNotes(store.s, '').map(x => x.id), at = pageStart(d.page);
      const [m] = ids.splice(at + d.from, 1);
      ids.splice(at + d.to, 0, m);
      reseat(store.s, ids); store.change();
    }
    setDrag(null);
    dx.value = 0; dy.value = 0;
  }
  // 拖的時候那一頁畫出來的順序：被拖的那張先放到要放的格子（隱形佔位），其他磚讓位
  function shown(i: number) {
    const list = pages[i];
    if (!drag || drag.page !== i) return list;
    const a = [...list];
    const [m] = a.splice(drag.from, 1);
    a.splice(drag.to, 0, m);
    return a;
  }

  const tile = (n: Note, k: number, pg: number, count: number) => (
    <Tile key={n.id} n={n} w={tileW} k={k} cur={n.id === store.last} editing={editing} calm={calm}
      canDrag={!searching} ghost={drag?.id === n.id} count={count} dx={dx} dy={dy} lift={lift}
      onPick={() => pick(n)} onMenu={y => openMenu(n.id, y)}
      onDragStart={() => dragStart(n.id, pg, k)} onDragTo={dragTo} onDrop={drop}
      onA11y={name => {
        if (name === 'activate') pick(n);
        else if (name === 'rename') rename(n);
        else if (name === 'delete') del(n);
        else if (name === 'forward') moveBy(n, -1);
        else if (name === 'backward') moveBy(n, 1);
      }} />
  );
  const dragged = drag ? notes.find(n => n.id === drag.id) : undefined;

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
          <View style={st.grid}>{notes.map((n, k) => tile(n, k, 0, notes.length))}</View>
          {/* 找不到→帶他剛打的字；第一次不會是空的（紙永遠至少一張）。顏色篩選的空狀態跟著篩選一起拿掉（2026-11-01） */}
          {notes.length === 0 && <Empty lines={[`找不到含「${q.trim()}」的清單`]} />}
        </ScrollView>
      ) : (
        // C3 多頁：一頁放幾列照格子區的高度算（螢幕小、字放大就少放），放不下往右一頁；整頁翻（系統分頁捲動），每次打開從第一頁。抖動中不翻（C5 才有拖到邊緣翻頁）
        <View style={{ flex: 1 }} onLayout={e => setBoxH(e.nativeEvent.layout.height)}>
          {boxH > 0 && (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEnabled={pages.length > 1 && !editing}
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
                    {/* 拿起來的那張：浮在格子上跟著手指（原本的位置留隱形佔位，其他磚照佔位讓開） */}
                    {dragged && drag?.page === i && <Ghost n={dragged} w={tileW} from={drag.from} dx={dx} dy={dy} lift={lift} />}
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

      {menu && menuNote && (
        <PopMenu acts={tileActs(menuNote)} top={menu.top} onClose={() => setMenu(null)}
          header={<Swatches current={menuNote.color} onPick={k => recolor(menuNote, k)} />} />
      )}
    </View>
  );
}

type TileProps = {
  n: Note; w: number; k: number; cur: boolean; editing: boolean; calm: boolean; canDrag: boolean; ghost: boolean; count: number;
  dx: SharedValue<number>; dy: SharedValue<number>; lift: SharedValue<number>;
  onPick: () => void; onMenu: (y: number) => void; onDragStart: () => void; onDragTo: (to: number) => void; onDrop: () => void;
  onA11y: (name: string) => void;
};

const A11Y_ACTS = [
  { name: 'activate' }, { name: 'rename', label: '改名字' }, { name: 'delete', label: '刪除' },
  { name: 'forward', label: '往前移' }, { name: 'backward', label: '往後移' },
];

// 一塊磚的手勢（C4）：點＝換紙；長按（不動）＝選單；長按後一拖、或抖動中直接拖＝拿起來換位置。
// 長按與拖同時聽（長按先成立跳選單，手指再動才拖）；點要等它們都不成立。抖動中不能點、不跳選單
function Tile(p: TileProps) {
  const { k, w, count, calm, dx, dy, lift, onPick, onMenu, onDragStart, onDragTo, onDrop } = p;
  const last = useSharedValue(k);
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
      dx.value = 0; dy.value = 0; last.value = k;
      lift.value = calm ? 1 : withSpring(1, M.dragLift.spring);
      scheduleOnRN(onDragStart);
    },
    onUpdate: e => {
      'worklet';
      dx.value = e.translationX; dy.value = e.translationY;
      const to = slotAt(k, e.translationX, e.translationY, w, count);
      if (to === last.value) return;
      last.value = to;
      scheduleOnRN(onDragTo, to);
      scheduleOnRN(hapticPass);
    },
    // 放手：滑進要放的那一格，到了才回 JS 改座位表；放手那一刻震一下。減少動態：直接到位
    onDeactivate: e => {
      'worklet';
      const to = last.value, tx = slotX(to, w) - slotX(k, w), ty = slotY(to) - slotY(k);
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
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }],
    opacity: p.ghost ? 0 : 1 - pressed.value * (1 - T.motion.pressDim),
  }), WEB_DEPS ? [p.ghost] : undefined);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={style} layout={calm ? undefined : TILE_MOVE}
        accessible accessibilityRole="button" accessibilityLabel={`${label(p.n)}，${col(p.n.color).hue}${p.n.pinned ? '，已釘選' : ''}`}
        accessibilityState={{ selected: p.cur }} accessibilityActions={A11Y_ACTS}
        onAccessibilityAction={(e: AccessibilityActionEvent) => p.onA11y(e.nativeEvent.actionName)}>
        <TileFace n={p.n} w={w} cur={p.cur} />
      </Animated.View>
    </GestureDetector>
  );
}

// 拿起來的那張：放在原本那格的位置、跟著手指平移，浮起一點（放大＋陰影）。不接觸控，手勢還在原本那塊上
function Ghost({ n, w, from, dx, dy, lift }: { n: Note; w: number; from: number; dx: SharedValue<number>; dy: SharedValue<number>; lift: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.value }, { translateY: dy.value }, { scale: 1 + lift.value * (M.dragLift.scale - 1) }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[st.ghost, { left: slotX(from, w), top: slotY(from) }, style]}>
      <TileFace n={n} w={w} cur={false} />
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
});

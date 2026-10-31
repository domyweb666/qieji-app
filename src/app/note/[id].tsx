// 清單編輯。上面的標題列跟首頁同一套（奶油白圓鈕：‹ 標題 顏色點 ⋯）；「新增一行」固定在標題列下面不跟著捲；
// 底下一行一張卡片，整頁底色是清單顏色。往右滑＝劃掉，往左滑＝刪除，拉右邊的把手＝排序。
// 只有點「新增一行」才會多一行；在一行裡按換行就是在同一格裡換行。
// 2026-10-31 從 WebView 改回原生：字要能跟著系統放大、VoiceOver 要能劃掉。外觀和手勢的數字照 WebView 版。
// 顏色、字級、間距、動畫數字全部來自 src/lib/tokens.ts，這裡不寫裸數字。
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams, useNavigation, type NativeStackNavigationProp } from 'expo-router';
import { memo, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import {
  AppState, Keyboard, Platform, Pressable, Share, StyleSheet, Text, TextInput, useWindowDimensions, View,
  type AccessibilityActionEvent, type TextInputInstance, type TextInputKeyPressEvent, type ViewInstance,
} from 'react-native';
import { GestureDetector, ScrollView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import type { Act } from '../../components/Acts';
import { ui } from '../../components/Overlay';
import { PopMenu } from '../../components/PopMenu';
import { Sym } from '../../components/Sym';
import { GlassBtn } from '../../components/WebBars';
import { col, convertNote, isEmpty, plain, uid, type Item, type Note } from '../../lib/model';
import { store, useStore } from '../../lib/store';
import { haptic, T, useColors, useNoteColors, type Colors } from '../../lib/tokens';

// 鍵盤上面那顆 ✓（收鍵盤）佔的高度：膠囊 44 ＋ 跟鍵盤之間留 8。系統的 InputAccessoryView 在某些輸入法（例如 Typeless）不會出現，所以自己畫
const KBAR_H = T.shape.hitMin + T.space.s;
// 給手勢（UI 執行緒）呼叫的都放模組層級：worklet 抓到的物件會被凍住，抓到筆記或某一行就改不動了
const dismissKb = () => Keyboard.dismiss();
// useAnimatedStyle 的相依陣列只有網頁用得到，iOS 上傳了會一直跳警告
const WEB_DEPS = Platform.OS === 'web';
// 一行字的高度與上下留白（照 WebView 版：17pt 字、1.6 倍行距、上下各 12）
const LINE_H = T.font.bodyLine.lineHeight;
const PAD_V = T.space.m;
const ROW_MIN = T.shape.rowMin;
const ROW_GAP = T.space.s;
const DOT = 16;

export default function NoteScreen() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const c = useColors();
  // 關閉空白筆記時它會被移出 state，這裡留住它，讓退場動畫期間畫面不會突然變空
  const keep = useRef<Note | undefined>(undefined);
  if (!keep.current) {
    keep.current = store.s.notes.find(n => n.id === id);
    // 已經沒有記事本了：舊的文字筆記打開時轉成清單（一段一行）
    if (keep.current?.type === 'text') { convertNote(keep.current); store.save(); }
  }
  if (!keep.current) return <View style={{ flex: 1, backgroundColor: c.surface }} />;
  return <Editor n={keep.current} fresh={fresh === '1'} />;
}

function Editor({ n, fresh }: { n: Note; fresh: boolean }) {
  useStore();
  const [, force] = useReducer((x: number) => x + 1, 0);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const calm = useReducedMotion();
  const fs = useWindowDimensions().fontScale;
  const c = useColors();
  const nc = useNoteColors(n.color);
  const closed = useRef(false);
  const mounted = useRef(true);
  const titleRef = useRef<TextInputInstance>(null);
  const scrollRef = useRef<any>(null);
  const [menu, setMenu] = useState(false);
  const inputs = useRef<Record<string, TextInputInstance | null>>({});
  const layouts = useRef<Record<string, { y: number; h: number }>>({});
  const pending = useRef<{ id: string; caret?: number } | null>(null);
  const focused = useRef<string | null>(null);

  // quiet＝打字：只存檔不重畫。新增、劃掉、刪除這類改了結構的才重畫。app 正要進背景時立刻寫入
  function touch(quiet?: boolean) {
    n.updated = Date.now();
    if (!quiet) store.change();
    else if (AppState.currentState === 'active') store.save();
    else store.flush();
  }

  /* ---------- 劃掉、刪除、移動 ---------- */
  function strike(id: string) {
    const it = n.items.find(i => i.id === id);
    if (!it || !it.t.trim()) return;
    it.done = !it.done;
    touch();
    store.markHint();
    haptic('strike');
  }
  function remove(id: string) {
    const idx = n.items.findIndex(i => i.id === id);
    if (idx < 0) return;
    const [removed] = n.items.splice(idx, 1);
    touch();
    store.markHint();
    if (removed.t.trim()) ui.toast('已刪除', { label: '復原', fn: () => {
      if (!mounted.current || closed.current) return;
      n.items.splice(Math.min(idx, n.items.length), 0, removed);
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

  /* ---------- focus ---------- */
  function focusItem(id: string, caret?: number) { pending.current = { id, caret }; force(); }
  // 畫完立刻對焦（不等到畫面顯示後），換格時鍵盤不會先收再開
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    const inp = inputs.current[p.id];
    if (!inp) return;
    pending.current = null;
    inp.focus();
    const at = p.caret ?? n.items.find(i => i.id === p.id)?.t.length ?? 0;
    inp.setSelection?.(at, at);
  });
  // 新增一行：唯一會多出一行的地方。先把清單捲回最上面，新的那行就在「新增一行」正下方
  function focusNew() {
    scrollTo(0, false);
    const first = n.items[0];
    if (first && !first.t.trim()) return focusItem(first.id, 0);
    const it: Item = { id: uid(), t: '', done: false, b: false };
    n.items.unshift(it);
    touch();
    focusItem(it.id, 0);
  }
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
  const kbLift = useSharedValue(0);
  const barStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -kbLift.value }] }));
  function ensureVisible(id: string | null) {
    const l = id && layouts.current[id], v = view.current;
    if (!l || !v.h) return;
    // 沒被鍵盤和工具列擋住的高度，底下留一點空
    const shown = Math.min(v.h, v.kb - v.top - (v.kb < Infinity ? KBAR_H : 0)) - T.space.l;
    if (l.y < v.y) scrollTo(l.y);
    else if (l.y + l.h > v.y + shown) scrollTo(l.y + l.h - shown);
  }
  // 捲到哪只在「停下來」和「自己捲」的時候記，捲動途中不回報（每一格畫面都回報一次會拖慢捲動）
  function scrollTo(y: number, animated = true) {
    view.current.y = Math.max(0, y);
    scrollRef.current?.scrollTo({ y: view.current.y, animated });
  }
  const scrolled = (e: { nativeEvent: { contentOffset: { y: number } } }) => { view.current.y = e.nativeEvent.contentOffset.y; };
  useEffect(() => {
    const [x1, y1, x2, y2] = T.motion.keyboardFollow.easing;
    const show = (e: { endCoordinates: { screenY: number }; duration?: number }) => {
      const v = view.current;
      v.kb = e.endCoordinates.screenY;
      const lift = Math.max(0, v.top + v.h - v.kb);
      kbLift.value = withTiming(lift, { duration: e.duration || T.motion.keyboardFollow.duration, easing: Easing.bezier(x1, y1, x2, y2) });
      setKbPad(lift);
      requestAnimationFrame(() => ensureVisible(focused.current));
    };
    const hide = () => { view.current.kb = Infinity; kbLift.value = 0; setKbPad(0); };
    const subs = [
      Keyboard.addListener('keyboardWillShow', show), Keyboard.addListener('keyboardDidShow', show),
      Keyboard.addListener('keyboardWillHide', hide), Keyboard.addListener('keyboardDidHide', hide),
    ];
    return () => subs.forEach(s => s.remove());
  }, [kbLift]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- 在一行裡打字 ---------- */
  // 換行、貼上多行都留在同一格，不會自己拆成好幾行
  function onChange(id: string, v: string) {
    const it = n.items.find(i => i.id === id);
    if (!it) return;
    it.t = v;
    touch(true);
  }
  // 空的一行按刪除 → 這行拿掉，回到上一行的最後面（有字的行不會被併到上一行）
  function onKey(id: string, e: TextInputKeyPressEvent) {
    if (e.nativeEvent.key !== 'Backspace') return;
    const idx = n.items.findIndex(i => i.id === id);
    if (idx <= 0 || n.items[idx].t) return;
    const prev = n.items[idx - 1];
    n.items.splice(idx, 1);
    touch();
    focusItem(prev.id, prev.t.length);
  }

  /* ---------- 拖曳排序 ---------- */
  const dragIdx = useSharedValue(-1);
  const dragTo = useSharedValue(-1);
  const dragDy = useSharedValue(0);
  const dragH = useSharedValue(0);
  const drag = useRef<{ idx: number; mids: number[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragApi = {
    start(id: string) {
      Keyboard.dismiss();
      const idx = n.items.findIndex(i => i.id === id);
      const mids = n.items.map(i => { const l = layouts.current[i.id]; return l ? l.y + l.h / 2 : 0; });
      drag.current = { idx, mids };
      dragH.value = (layouts.current[id]?.h ?? ROW_MIN) + ROW_GAP;
      dragDy.value = 0; dragTo.value = idx; dragIdx.value = idx;
      setDragging(true);
      haptic('dragStart');
    },
    move(dy: number) {
      const d = drag.current;
      if (!d) return;
      const y = d.mids[d.idx] + dy;
      dragDy.value = dy;
      dragTo.value = d.mids.filter((m, k) => k !== d.idx && m < y).length;
    },
    end() {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      const to = dragTo.value;
      if (d.idx !== to) { const [m] = n.items.splice(d.idx, 1); n.items.splice(to, 0, m); touch(); }
      requestAnimationFrame(() => { dragIdx.value = -1; dragDy.value = 0; });
      setDragging(false);
    },
  };

  /* ---------- open / close ---------- */
  function closeNote() {
    if (closed.current) return;
    closed.current = true;
    Keyboard.dismiss();
    n.items = n.items.filter(i => i.t.trim());
    if (isEmpty(n)) store.s.notes = store.s.notes.filter(x => x !== n);
    store.change();
    store.flush();
  }
  // 離開畫面（返回鍵、iOS 側滑返回）時收尾：畫面卸載就是筆記關閉
  useEffect(() => {
    mounted.current = true;
    // 萬一 effect 被重跑（開發模式），把剛被當成空白移掉的筆記放回去，不能讓它消失
    if (closed.current && !n.deleted && !store.s.notes.some(x => x.id === n.id)) store.s.notes.push(n);
    closed.current = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    let off: (() => void) | undefined;
    // 新的清單先停在標題，不自動多一行；要寫點子就點「新增一行」。
    // 等推進來的動畫跑完才叫鍵盤，兩個動畫疊在一起會卡；網頁預覽沒有這個事件，靠計時器補
    if (fresh) {
      const focus = () => { clearTimeout(t); off?.(); if (mounted.current) titleRef.current?.focus(); };
      off = navigation.addListener('transitionEnd', e => { if (!e.data.closing) focus(); });
      t = setTimeout(focus, T.timing.freshFocusFallback);
    }
    store.setLast(n.id); // 關掉 app 時還開著這則，下次打開就直接回到這裡
    return () => { clearTimeout(t); off?.(); mounted.current = false; closeNote(); store.setLast(null); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- actions ---------- */
  const shareText = () => (n.title ? n.title + '\n\n' : '') + plain(n);
  const anyDone = n.items.some(i => i.done);
  function togglePin() { n.pinned = !n.pinned; touch(); ui.toast(n.pinned ? '已釘選' : '已取消釘選'); }
  function share() { Keyboard.dismiss(); Share.share({ message: shareText() }).catch(() => {}); }
  function del() {
    n.deleted = true; n.pinned = false;
    n.items = n.items.filter(i => i.t.trim());
    const empty = isEmpty(n);
    if (empty) store.s.notes = store.s.notes.filter(x => x !== n);
    closed.current = true;
    store.change();
    router.back();
    if (!empty) ui.toast('已移到最近刪除', { label: '復原', fn: () => { n.deleted = false; store.change(); } });
  }
  // 顏色：從下方升起一個色塊面板
  function pickColor() { Keyboard.dismiss(); router.push({ pathname: '/color/[id]', params: { id: n.id } }); }
  const setItems = (items: Item[]) => { n.items = items; touch(); };
  const moreActs: Act[] = [
    { label: '分享', icon: 'square.and.arrow.up', fn: share },
    { label: n.pinned ? '取消釘選' : '釘選', icon: n.pinned ? 'pin.slash' : 'pin', fn: togglePin },
    { label: '清單', inline: true, hidden: n.items.length < 2 && !anyDone, sub: [
      { label: '上下順序反轉', icon: 'arrow.up.arrow.down', hidden: n.items.length < 2, fn: () => setItems([...n.items].reverse()) },
      { label: '全部恢復', icon: 'arrow.uturn.backward', hidden: !anyDone, fn: () => setItems(n.items.map(i => ({ ...i, done: false }))) },
      { label: '清掉劃掉的行', icon: 'eraser', hidden: !anyDone, fn: () => {
        const before = n.items;
        const left = before.filter(i => !i.done);
        setItems(left);
        ui.toast(`已清掉 ${before.length - left.length} 行`, { label: '復原', fn: () => {
          if (!mounted.current || closed.current) return;
          setItems(before);
        } });
      } },
    ] },
    { label: '複製全文', icon: 'doc.on.doc', fn: () => { Clipboard.setStringAsync(shareText()).then(() => ui.toast('已複製'), () => ui.toast('沒複製到，再按一次')); } },
    { label: '刪除', icon: 'trash', destructive: true, fn: del },
  ];

  const showHint = !store.hintSeen && n.items.some(i => i.t.trim());

  return (
    <View style={{ flex: 1, backgroundColor: nc.bg }} collapsable={false}>
      {/* 標題列跟首頁同一套：‹ 標題 顏色點 ⋯，底色跟整頁一樣是清單顏色。
          標題跟著系統字級放大，但最多 1.5 倍，不然會把兩邊的按鈕擠出去 */}
      <View style={[st.bar, { paddingTop: insets.top + T.space.s }]}>
        <GlassBtn icon="chevron.left" label="返回" onPress={() => router.back()} />
        <TextInput ref={titleRef} defaultValue={n.title} placeholder="標題" maxFontSizeMultiplier={T.font.listTitleMaxScale}
          placeholderTextColor={c.textMuted}
          style={[st.title, { color: c.textPrimary }]} returnKeyType="next" submitBehavior="submit"
          onChangeText={v => { n.title = v; touch(true); }}
          onFocus={() => onFocus('title')} onBlur={() => onBlur('title')}
          onSubmitEditing={() => {
            // 有行就跳到第一行，沒有就收鍵盤（不自動多一行）
            if (n.items[0]) focusItem(n.items[0].id); else Keyboard.dismiss();
          }} />
        <GlassBtn label={`顏色：${col(n.color).hue}`} onPress={pickColor}>
          <View style={[st.dot, { backgroundColor: nc.hd, borderColor: c.dotOutline }]} />
        </GlassBtn>
        <GlassBtn icon="ellipsis" label="選單" onPress={() => { Keyboard.dismiss(); setMenu(true); }} />
      </View>

      {/* 「新增一行」固定在標題列下面，清單捲到哪都按得到；字色在九種清單底色上對比都超過 4.5 */}
      <Pressable style={({ pressed }) => [st.addrow, pressed && { opacity: T.motion.pressDim }]} onPress={focusNew}
        accessibilityRole="button" accessibilityLabel="新增一行">
        <Text style={[st.addPlus, { color: c.textAddRow }]}>＋</Text>
        <Text style={[st.addText, { color: c.textAddRow }]}>新增一行</Text>
      </Pressable>

      <View ref={boxRef} style={{ flex: 1 }} collapsable={false}
        onLayout={() => boxRef.current?.measureInWindow((x, y, w, h) => { view.current.top = y; view.current.h = h; })}>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={st.list} contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled" keyboardDismissMode="none"
          onScrollEndDrag={scrolled} onMomentumScrollEnd={scrolled}
          scrollEnabled={!dragging}>
          <View>
            {n.items.map((it, index) => (
              <Line key={it.id} it={it} index={index} done={it.done} rule={nc.rule} colors={c}
                count={n.items.length} calm={calm} fs={fs}
                dragIdx={dragIdx} dragTo={dragTo} dragDy={dragDy} dragH={dragH}
                refInput={r => { inputs.current[it.id] = r; }}
                onLayoutRow={(y, h) => {
                  layouts.current[it.id] = { y, h };
                  if (focused.current === it.id) ensureVisible(it.id); // 打到長出新的一行時，跟著往上捲
                }}
                onChange={v => onChange(it.id, v)} onKey={e => onKey(it.id, e)}
                onFocus={() => onFocus(it.id)} onBlur={() => onBlur(it.id)}
                onStrike={() => strike(it.id)} onRemove={() => remove(it.id)}
                onMove={d => move(it.id, d)} drag={dragApi} />
            ))}
          </View>
          {showHint && <Text style={[st.hint, { color: c.textMuted }]}>往右滑劃掉　·　往左滑刪除</Text>}
          {/* 留白讓最後一行能捲上來；點這裡不會新增一行。200 只用一次 */}
          <View style={{ height: 200 + kbPad + KBAR_H + insets.bottom }} />
        </ScrollView>
      </View>

      {menu && <PopMenu acts={moreActs} top={insets.top + T.shape.hitMin + T.space.m} onClose={() => setMenu(false)} />}

      {/* 鍵盤上面那顆：奶油白膠囊，右端一個 ✓ 收鍵盤。跟著鍵盤升降，鍵盤收起來就不見 */}
      {kbPad > 0 && (
        <Animated.View style={[st.kbarWrap, barStyle]}>
          <View style={[st.kbar, { backgroundColor: c.surface }]}>
            <View style={{ flex: 1 }} />
            <Pressable style={({ pressed }) => [st.kb, pressed && { opacity: T.motion.pressDim }]} onPress={() => Keyboard.dismiss()}
              accessibilityRole="button" accessibilityLabel="完成，收起鍵盤">
              <Sym name="checkmark" size={20} color={c.textPrimary} weight="semibold" />
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

type LineProps = {
  it: Item; index: number; done: boolean; rule: string; colors: Colors; count: number; calm: boolean; fs: number;
  dragIdx: SharedValue<number>; dragTo: SharedValue<number>; dragDy: SharedValue<number>; dragH: SharedValue<number>;
  refInput: (r: TextInputInstance | null) => void; onLayoutRow: (y: number, h: number) => void;
  onChange: (v: string) => void; onKey: (e: TextInputKeyPressEvent) => void; onFocus: () => void; onBlur: () => void;
  onStrike: () => void; onRemove: () => void; onMove: (d: -1 | 1) => void;
  drag: { start: (id: string) => void; move: (dy: number) => void; end: () => void };
};

// 一行只有在自己的資料變了才重畫（打字不算：字由底下的 Field 自己管），
// 不然每次重畫整頁，每一行的滑動手勢都要重設一次，打字和捲動會卡
const Line = memo(LineRow, (a, b) => a.it === b.it && a.done === b.done && a.index === b.index
  && a.rule === b.rule && a.colors === b.colors && a.count === b.count && a.calm === b.calm && a.fs === b.fs);

function LineRow(p: LineProps) {
  const tx = useSharedValue(0);
  const op = useSharedValue(1);
  const w = useSharedValue(1);
  // 手勢和動畫只能抓這些「拆出來的」值；抓到 p 會連 p.it（這一行的資料）一起被凍住，打字就存不進去
  const { onStrike, onRemove, index, calm, dragIdx, dragTo, dragDy, dragH } = p;
  const { start: dragStart, move: dragMove, end: dragEnd } = p.drag;
  const { swipeStrikeBg, swipeDeleteBg } = p.colors;
  const id = p.it.id;
  const M = T.motion, G = T.gesture;

  // 往右滑過門檻＝劃掉，往左滑過門檻＝刪除，沒滑夠就彈回。
  // 減少動態：不播滑回、滑出，改成整行淡回／淡出（回饋要在，只是不移動）
  const swipe = usePanGesture({
    activeOffsetX: [-G.swipeActivate, G.swipeActivate],
    failOffsetY: [-G.swipeFailY, G.swipeFailY],
    onActivate: () => { 'worklet'; scheduleOnRN(dismissKb); },
    onUpdate: e => { 'worklet'; tx.value = e.translationX; },
    onDeactivate: e => {
      'worklet';
      const dx = e.translationX, W = w.value;
      if (!e.canceled && dx > Math.min(G.strikeMax, W * G.strikeRatio)) {
        if (calm) {
          tx.value = 0;
          op.value = M.reducedDimFrom;
          op.value = withTiming(1, { duration: M.strikeReturn.reducedFade });
          scheduleOnRN(onStrike);
        } else tx.value = withTiming(0, { duration: M.strikeReturn.duration }, () => scheduleOnRN(onStrike));
      } else if (!e.canceled && dx < -Math.min(G.deleteMax, W * G.deleteRatio)) {
        if (calm) {
          tx.value = 0;
          op.value = withTiming(0, { duration: M.deleteSlide.reducedFade }, () => scheduleOnRN(onRemove));
        } else tx.value = withTiming(-W, { duration: M.deleteSlide.duration }, () => scheduleOnRN(onRemove));
      } else tx.value = calm ? 0 : withTiming(0, { duration: M.snapBack.duration });
    },
  });
  const grip = usePanGesture({
    runOnJS: true,
    minDistance: G.dragActivate,
    onActivate: () => dragStart(id),
    onUpdate: e => dragMove(e.translationY),
    onFinalize: () => dragEnd(),
  });

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }], opacity: op.value }));
  const under = useAnimatedStyle(() => ({ backgroundColor: tx.value > 0 ? swipeStrikeBg : tx.value < 0 ? swipeDeleteBg : 'transparent' }));
  const leftLabel = useAnimatedStyle(() => ({ opacity: tx.value > 0 ? 1 : 0 }));
  const rightLabel = useAnimatedStyle(() => ({ opacity: tx.value < 0 ? 1 : 0 }));
  const shift = useAnimatedStyle(() => {
    const from = dragIdx.value, to = dragTo.value;
    if (from < 0) return { zIndex: 0, transform: [{ translateY: 0 }] };
    if (index === from) return { zIndex: 5, transform: [{ translateY: dragDy.value }] };
    let y = 0;
    if (from < to && index > from && index <= to) y = -dragH.value;
    if (from > to && index < from && index >= to) y = dragH.value;
    return { zIndex: 0, transform: [{ translateY: calm ? y : withTiming(y, { duration: M.dragShift.duration }) }] };
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
    <Animated.View collapsable={false}
      onLayout={e => { w.value = e.nativeEvent.layout.width; p.onLayoutRow(e.nativeEvent.layout.y, e.nativeEvent.layout.height); }}
      style={[st.ci, { backgroundColor: p.colors.surface, borderColor: p.rule }, shift]}>
      <Animated.View style={[StyleSheet.absoluteFill, st.under, under]}>
        <Animated.Text style={[st.underText, { color: p.colors.textOnSwipe }, leftLabel]}>{p.done ? '恢復' : '劃掉'}</Animated.Text>
        <Animated.Text style={[st.underText, { color: p.colors.textOnSwipe }, rightLabel]}>刪除</Animated.Text>
      </Animated.View>
      <GestureDetector gesture={swipe}>
        <Animated.View style={[st.cin, { backgroundColor: p.colors.surface }, slide]}>
          <View style={st.field}>
            <Field text={p.it.t} done={p.done} fs={p.fs} colors={p.colors} refInput={p.refInput} actions={actions} onAction={onAction}
              onChange={p.onChange} onKey={p.onKey} onFocus={p.onFocus} onBlur={p.onBlur} />
          </View>
          {/* 正在打的那行也是把手：右邊寬度一樣，字才不會在打字時多換一行。把手熱區 44 寬 */}
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
function Field({ text, done, fs, colors: c, refInput, actions, onAction, onChange, onKey, onFocus, onBlur }: {
  text: string; done: boolean; fs: number; colors: Colors; refInput: (r: TextInputInstance | null) => void;
  actions: { name: string; label: string }[]; onAction: (e: AccessibilityActionEvent) => void;
  onChange: (v: string) => void; onKey: (e: TextInputKeyPressEvent) => void; onFocus: () => void; onBlur: () => void;
}) {
  const [txt, setTxt] = useState(text);
  const lh = { lineHeight: LINE_H, minHeight: Math.max(ROW_MIN, Math.round(LINE_H * fs) + PAD_V * 2) };
  return (
    <>
      <Text style={[st.ta, lh, st.mirror]} accessible={false} importantForAccessibility="no-hide-descendants">{txt + '​'}</Text>
      <TextInput ref={refInput} defaultValue={text} multiline scrollEnabled={false}
        style={[st.ta, lh, st.taFill, { color: done ? c.textMuted : c.textPrimary }, done && st.taDone]}
        accessibilityHint={done ? '已劃掉' : undefined}
        accessibilityActions={actions} onAccessibilityAction={onAction}
        onChangeText={v => { setTxt(v); onChange(v); }} onKeyPress={onKey}
        onFocus={onFocus} onBlur={onBlur} />
    </>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: T.space.s, paddingHorizontal: T.space.m, paddingBottom: T.space.s },
  title: { flex: 1, minWidth: 0, minHeight: T.shape.hitMin, ...T.font.listTitle, paddingVertical: 0, paddingHorizontal: T.space.xs },
  // 跟首頁列表的顏色點同一種圓點，大一點好按；色點本身對比不夠，靠描邊
  dot: { width: DOT, height: DOT, borderRadius: T.shape.pill(DOT), borderWidth: T.shape.borderCard },
  addrow: { flexDirection: 'row', alignItems: 'center', gap: T.space.s, minHeight: T.shape.rowMin, marginHorizontal: T.space.l, paddingLeft: T.space.m },
  addPlus: { ...T.font.plusGlyph },
  addText: { ...T.font.body },
  list: { paddingHorizontal: T.space.l },
  // 一行一張卡片，跟首頁列表的卡片同一個樣子；卡片外面的底色是清單顏色
  ci: { marginBottom: ROW_GAP, borderWidth: T.shape.borderCard, borderRadius: T.shape.radiusCard, overflow: 'hidden' },
  under: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: T.space.l },
  underText: { ...T.font.subheadBold },
  cin: { flexDirection: 'row', alignItems: 'flex-start', gap: T.space.xs, paddingLeft: T.space.m },
  field: { flex: 1, minWidth: 0 },
  ta: { ...T.font.bodyLine, paddingTop: PAD_V, paddingBottom: PAD_V, paddingHorizontal: T.space.xs },
  // 撐高度用的隱形文字：右邊只比輸入框多留 1 點。留太多（之前 2 點）字快滿一行時隱形文字會先換行，
  // 卡片底下就多出一整行空白；完全不留又可能反過來把最後一行切掉。5 只用一次
  mirror: { color: 'transparent', paddingRight: 5 },
  taFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, textAlignVertical: 'top' },
  taDone: { textDecorationLine: 'line-through' },
  grip: { width: T.shape.hitMin, height: T.shape.rowMin, alignItems: 'center', justifyContent: 'center' },
  hint: { ...T.font.footnote, textAlign: 'center', padding: T.space.m },
  // 鍵盤上面那顆：跟標題列的奶油白圓鈕同一套（底色、陰影），拉成跟清單卡片一樣寬的膠囊，底下留 8 跟鍵盤分開
  kbarWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: T.space.s, paddingHorizontal: T.space.l },
  kbar: { height: T.shape.hitMin, borderRadius: T.shape.pill(T.shape.hitMin), flexDirection: 'row', alignItems: 'center', ...T.shape.shadowSoft },
  kb: { width: T.shape.hitMin, height: T.shape.hitMin, alignItems: 'center', justifyContent: 'center' },
});

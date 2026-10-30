// 清單編輯。清單的每一行就是一個點子：
// 往右滑＝劃掉，往左滑＝刪除，拉右邊的把手＝排序。
// 只有點「新增一行」才會多一行；在一行裡按換行就是在同一格裡換行。
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { memo, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import {
  Keyboard, Platform, Pressable, Share, StyleSheet, Text, TextInput, View,
  type TextInputInstance, type TextInputKeyPressEvent, type ViewInstance,
} from 'react-native';
import { GestureDetector, ScrollView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import type { SFSymbol } from 'sf-symbols-typescript';
import type { Act } from '../../components/Acts';
import { ui } from '../../components/Overlay';
import { PopMenu } from '../../components/PopMenu';
import { Sym } from '../../components/Sym';
import {
  bloom, col, convertNote, isEmpty, plain, toggleStrike, uid, type Item, type Note,
} from '../../lib/model';
import { store, useStore } from '../../lib/store';
import { C, F } from '../../lib/theme';

// 鍵盤上面那條「復原／重做／完成」的高度
const KBAR_H = 48;
// 給手勢（UI 執行緒）呼叫的都放模組層級：worklet 抓到的物件會被凍住，抓到筆記或某一行就改不動了
const dismissKb = () => Keyboard.dismiss();
const TINT = C.tint as string;
// useAnimatedStyle 的相依陣列只有網頁用得到，iOS 上傳了會一直跳警告
const WEB_DEPS = Platform.OS === 'web';

export default function NoteScreen() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  // 關閉空白筆記時它會被移出 state，這裡留住它，讓退場動畫期間畫面不會突然變空
  const keep = useRef<Note | undefined>(undefined);
  if (!keep.current) {
    keep.current = store.s.notes.find(n => n.id === id);
    // 已經沒有記事本了：舊的文字筆記打開時轉成清單（一段一行）
    if (keep.current?.type === 'text') { convertNote(keep.current); store.save(); }
  }
  if (!keep.current) return <View style={{ flex: 1, backgroundColor: C.page }} />;
  return <Editor n={keep.current} fresh={fresh === '1'} />;
}

function Editor({ n, fresh }: { n: Note; fresh: boolean }) {
  useStore();
  const [, force] = useReducer((x: number) => x + 1, 0);
  const insets = useSafeAreaInsets();

  const closed = useRef(false);
  const mounted = useRef(true);
  const titleRef = useRef<TextInputInstance>(null);
  const scrollRef = useRef<any>(null);
  const [menu, setMenu] = useState(false);
  const inputs = useRef<Record<string, TextInputInstance | null>>({});
  const layouts = useRef<Record<string, { y: number; h: number }>>({});
  const pending = useRef<{ id: string; caret?: number } | null>(null);
  const focused = useRef<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  // 復原／重做改了字時，換 key 讓輸入框重新掛載
  const [epoch, setEpoch] = useState(0);

  /* ---------- undo / redo ---------- */
  const hist = useRef<string[]>([]);
  const hpos = useRef(-1);
  const histT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const snapPending = useRef(false);
  const snap = () => JSON.stringify({ title: n.title, items: n.items });
  function snapshot() {
    snapPending.current = false;
    const sn = snap();
    if (hist.current[hpos.current] !== sn) {
      hist.current = hist.current.slice(0, hpos.current + 1);
      hist.current.push(sn);
      if (hist.current.length > 200) hist.current.shift();
      hpos.current = hist.current.length - 1;
    }
    syncUndo();
  }
  if (hpos.current < 0) { hist.current = [snap()]; hpos.current = 0; }
  // quiet＝打字：只存檔不重畫。新增、劃掉、刪除這類改了結構的才重畫
  function changed(now?: boolean, quiet?: boolean) {
    n.updated = Date.now();
    if (quiet) store.save(); else store.change();
    clearTimeout(histT.current);
    if (now) snapshot();
    else { snapPending.current = true; histT.current = setTimeout(() => snapshot(), 450); }
    syncUndo();
  }
  // 復原／重做鍵的亮暗有變才重畫
  const undoShown = useRef('');
  function syncUndo() {
    const k = `${hpos.current > 0 || snapPending.current}|${hpos.current < hist.current.length - 1}`;
    if (k !== undoShown.current) force();
  }
  function restore(sn: string) {
    Object.assign(n, JSON.parse(sn));
    n.updated = Date.now();
    store.change();
    setEpoch(e => e + 1);
    // 輸入框換新了，游標放回原本那一格，鍵盤不收起來
    const f = focused.current;
    if (f === 'title') requestAnimationFrame(() => titleRef.current?.focus());
    else if (f && n.items.some(i => i.id === f)) focusItem(f);
  }
  const undo = () => { clearTimeout(histT.current); snapshot(); if (hpos.current > 0) { hpos.current--; restore(hist.current[hpos.current]); } };
  const redo = () => { if (hpos.current < hist.current.length - 1) { hpos.current++; restore(hist.current[hpos.current]); } };
  const canUndo = hpos.current > 0 || snapPending.current;
  const canRedo = hpos.current < hist.current.length - 1;
  undoShown.current = `${canUndo}|${canRedo}`;

  /* ---------- 開花／結茄子：畫面上不顯示了，數字照樣記著（網頁版還在用，資料不能少） ---------- */
  function bloomCheck(skipId?: string | null) {
    if (bloom(store.s, n, skipId).length) store.save();
  }
  function strike(id: string) {
    const it = n.items.find(i => i.id === id);
    if (!it || !it.t.trim()) return;
    const kind = toggleStrike(store.s, it);
    changed(true);
    store.markHint();
    if (kind) Haptics.selectionAsync().catch(() => {});
  }
  function remove(id: string) {
    const idx = n.items.findIndex(i => i.id === id);
    if (idx < 0) return;
    const [removed] = n.items.splice(idx, 1);
    changed(true);
    store.markHint();
    if (removed.t.trim()) ui.toast('已刪除', { label: '復原', fn: () => {
      if (!mounted.current) return;
      n.items.splice(idx, 0, removed);
      changed(true);
    } });
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
  // 新增一行：唯一會多出一行的地方。跟網頁版一樣先把清單捲回最上面，新的那行就在「新增一行」正下方
  function focusNew() {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    const first = n.items[0];
    if (first && !first.t.trim()) return focusItem(first.id, 0);
    const it: Item = { id: uid(), t: '', done: false, b: false };
    n.items.unshift(it);
    changed();
    focusItem(it.id, 0);
  }
  function cleanupEmpty() {
    const keep = n.items.filter(i => i.t.trim());
    if (keep.length !== n.items.length) { n.items = keep; store.change(); }
  }
  function onFocus(id: string) {
    focused.current = id;
    setFocusId(id);
    bloomCheck(id === 'title' ? null : id);
    if (id !== 'title') requestAnimationFrame(() => ensureVisible(id));
  }

  /* ---------- 鍵盤：照網頁版，不讓系統自動推畫面 ---------- */
  // 系統的自動推畫面，在鍵盤和上面那條工具列先後出現時會推兩次（新的一行先往上跑再往下掉）。
  // 改成自己記住鍵盤頂在哪：正在打的那一行被擋住才捲，沒被擋住就一動也不動。
  const boxRef = useRef<ViewInstance>(null);
  const view = useRef({ top: 0, h: 0, y: 0, kb: Infinity }); // 清單在螢幕上的頂、高，目前捲到哪，鍵盤頂
  const [kbPad, setKbPad] = useState(0);
  // 鍵盤上面那條工具列也是自己畫的（照網頁版）：系統的 InputAccessoryView 在某些輸入法（例如 Typeless）
  // 不會出現，變成打完字沒有地方按「完成」收鍵盤
  const kbLift = useSharedValue(0);
  const barStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -kbLift.value }] }));
  function ensureVisible(id: string | null) {
    const l = id && layouts.current[id], v = view.current;
    if (!l || !v.h) return;
    // 沒被鍵盤和工具列擋住的高度，底下留一點空
    const shown = Math.min(v.h, v.kb - v.top - (v.kb < Infinity ? KBAR_H : 0)) - 16;
    if (l.y < v.y) scrollRef.current?.scrollTo({ y: l.y, animated: true });
    else if (l.y + l.h > v.y + shown) scrollRef.current?.scrollTo({ y: l.y + l.h - shown, animated: true });
  }
  useEffect(() => {
    const show = (e: { endCoordinates: { screenY: number }; duration?: number }) => {
      const v = view.current;
      v.kb = e.endCoordinates.screenY;
      const lift = Math.max(0, v.top + v.h - v.kb);
      kbLift.value = withTiming(lift, { duration: e.duration || 250, easing: Easing.bezier(0.17, 0.59, 0.4, 0.77) });
      setKbPad(lift);
      requestAnimationFrame(() => ensureVisible(focused.current));
    };
    const hide = () => { view.current.kb = Infinity; kbLift.value = 0; setKbPad(0); };
    const subs = [
      Keyboard.addListener('keyboardWillShow', show), Keyboard.addListener('keyboardDidShow', show),
      Keyboard.addListener('keyboardWillHide', hide), Keyboard.addListener('keyboardDidHide', hide),
    ];
    return () => subs.forEach(s => s.remove());
  }, [kbLift]);
  function onBlur(id: string) {
    if (focused.current === id) focused.current = null;
    setTimeout(() => {
      if (focused.current || !mounted.current || closed.current) return;
      setFocusId(null);
      bloomCheck();
      cleanupEmpty();
    }, 120);
  }

  /* ---------- typing in a line ---------- */
  // 換行、貼上多行都留在同一格，不會自己拆成好幾行
  function onChange(id: string, v: string) {
    const it = n.items.find(i => i.id === id);
    if (!it) return;
    it.t = v;
    changed(false, true);
  }
  // 空的一行按刪除 → 這行拿掉，回到上一行的最後面（有字的行不會被併到上一行）
  function onKey(id: string, e: TextInputKeyPressEvent) {
    if (e.nativeEvent.key !== 'Backspace') return;
    const idx = n.items.findIndex(i => i.id === id);
    if (idx <= 0 || n.items[idx].t) return;
    const prev = n.items[idx - 1];
    n.items.splice(idx, 1);
    changed(true);
    focusItem(prev.id, prev.t.length);
  }
  function tapX(id: string) {
    const idx = n.items.findIndex(i => i.id === id);
    remove(id);
    const next = n.items[Math.min(idx, n.items.length - 1)];
    if (next) focusItem(next.id); else Keyboard.dismiss();
  }

  /* ---------- drag to reorder ---------- */
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
      dragH.value = layouts.current[id]?.h ?? 52;
      dragDy.value = 0; dragTo.value = idx; dragIdx.value = idx;
      setDragging(true);
      Haptics.selectionAsync().catch(() => {});
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
      if (d.idx !== to) { const [m] = n.items.splice(d.idx, 1); n.items.splice(to, 0, m); changed(true); }
      requestAnimationFrame(() => { dragIdx.value = -1; dragDy.value = 0; });
      setDragging(false);
    },
  };

  /* ---------- open / close ---------- */
  function closeNote() {
    if (closed.current) return;
    closed.current = true;
    Keyboard.dismiss();
    clearTimeout(histT.current);
    bloomCheck();
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
    // 新的清單先停在標題，不自動多一行；要寫點子就點「新增一行」
    if (fresh) t = setTimeout(() => titleRef.current?.focus(), 60);
    store.setLast(n.id); // 關掉 app 時還開著這則，下次打開就直接回到這裡
    return () => { clearTimeout(t); mounted.current = false; closeNote(); store.setLast(null); };
  }, []);

  /* ---------- actions ---------- */
  const shareText = () => (n.title ? n.title + '\n\n' : '') + plain(n);
  const anyDone = n.items.some(i => i.done);
  function togglePin() { n.pinned = !n.pinned; changed(); ui.toast(n.pinned ? '已釘選' : '已取消釘選'); }
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
  function pickColor() {
    Keyboard.dismiss();
    router.push({ pathname: '/color/[id]', params: { id: n.id } });
  }
  const moreActs: Act[] = [
    { label: '顏色', icon: 'paintpalette', fn: pickColor },
    { label: n.pinned ? '取消釘選' : '釘選', icon: n.pinned ? 'pin.slash' : 'pin', fn: togglePin },
    { label: '清單', inline: true, hidden: n.items.length < 2 && !anyDone, sub: [
      { label: '上下順序反轉', icon: 'arrow.up.arrow.down', hidden: n.items.length < 2, fn: () => { n.items.reverse(); changed(true); } },
      { label: '全部恢復（取消劃線）', icon: 'arrow.uturn.backward', hidden: !anyDone, fn: () => { n.items.forEach(i => (i.done = false)); changed(true); } },
      { label: '清掉劃掉的行', icon: 'eraser', hidden: !anyDone, fn: () => { n.items = n.items.filter(i => !i.done); changed(true); } },
    ] },
    { label: '複製全文', icon: 'doc.on.doc', fn: () => { Clipboard.setStringAsync(shareText()).then(() => ui.toast('已複製'), () => ui.toast('複製失敗')); } },
    { label: '刪除', icon: 'trash', destructive: true, fn: del },
  ];

  const showHint = !store.hintSeen && n.items.some(i => i.t.trim());
  // 整頁跟著筆記的顏色走；上方標題列和分隔線用同色系深一階
  const tone = { bg: col(n.color).bg, rule: col(n.color).rule };

  return (
    <View style={{ flex: 1, backgroundColor: tone.bg }} collapsable={false}>
      {/* 上方一條窄窄的標題列：返回、清單名稱、分享、更多，全部在同一行 */}
      <View style={[st.bar, { paddingTop: insets.top, backgroundColor: tone.rule }]}>
        <BarBtn icon="chevron.left" label="返回" onPress={() => router.back()} />
        <TextInput ref={titleRef} key={`title${epoch}`} defaultValue={n.title} placeholder="清單名稱"
          placeholderTextColor={C.placeholder} style={st.title} returnKeyType="next" submitBehavior="submit"
          onChangeText={v => { n.title = v; changed(false, true); }}
          onFocus={() => onFocus('title')} onBlur={() => onBlur('title')}
          onSubmitEditing={() => {
            // 有行就跳到第一行，沒有就收鍵盤（不自動多一行）
            if (n.items[0]) focusItem(n.items[0].id); else Keyboard.dismiss();
          }} />
        <BarBtn icon="square.and.arrow.up" label="分享" onPress={share} />
        <BarBtn icon="ellipsis" label="更多" onPress={() => { Keyboard.dismiss(); setMenu(true); }} />
      </View>

      {/* 「新增一行」固定在日期下面，不跟著清單捲，按下去不會被鍵盤推走；樣子跟一般的行一樣低調 */}
      <Pressable style={({ pressed }) => [st.addrow, { borderBottomColor: tone.rule }, pressed && { backgroundColor: 'rgba(255,255,255,0.45)' }]}
        onPress={focusNew} accessibilityRole="button">
        <Sym name="plus" size={18} color={C.secondary} />
        <Text style={st.addText}>新增一行</Text>
      </Pressable>

      <View ref={boxRef} style={{ flex: 1 }} collapsable={false}
        onLayout={() => boxRef.current?.measureInWindow((x, y, w, h) => { view.current.top = y; view.current.h = h; })}>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled" keyboardDismissMode="none"
        scrollEventThrottle={16} onScroll={e => { view.current.y = e.nativeEvent.contentOffset.y; }}
        scrollEnabled={!dragging}>
        <View>
          {n.items.map((it, index) => (
            <Line key={it.id} it={it} index={index} done={it.done} focused={focusId === it.id} tone={tone}
              inputKey={`${it.id}:${epoch}`}
              dragIdx={dragIdx} dragTo={dragTo} dragDy={dragDy} dragH={dragH}
              refInput={r => { inputs.current[it.id] = r; }}
              onLayoutRow={(y, h) => {
                layouts.current[it.id] = { y, h };
                if (focused.current === it.id) ensureVisible(it.id); // 打到長出新的一行時，跟著往上捲
              }}
              onChange={v => onChange(it.id, v)} onKey={e => onKey(it.id, e)}
              onFocus={() => onFocus(it.id)} onBlur={() => onBlur(it.id)}
              onStrike={() => strike(it.id)} onRemove={() => remove(it.id)} onX={() => tapX(it.id)} drag={dragApi} />
          ))}
        </View>
        {showHint && <Text style={st.hint}>往右滑劃掉　·　往左滑刪除</Text>}
        {/* 留白讓最後一行能捲上來；點這裡不會新增一行 */}
        <View style={{ height: 220 + kbPad + KBAR_H + insets.bottom }} />
      </ScrollView>
      </View>

      {menu && <PopMenu acts={moreActs} top={insets.top + 46} onClose={() => setMenu(false)} />}

      {/* 鍵盤上面那條：跟著鍵盤升降，鍵盤收起來就不見 */}
      {kbPad > 0 && (
        <Animated.View style={[st.kbarWrap, barStyle]}>
          <View style={st.kbar}>
            <Pressable style={[st.kb, !canUndo && st.kbOff]} disabled={!canUndo} onPress={undo} accessibilityLabel="復原">
              <Sym name="arrow.uturn.backward" size={19} color={C.tint} />
            </Pressable>
            <Pressable style={[st.kb, !canRedo && st.kbOff]} disabled={!canRedo} onPress={redo} accessibilityLabel="重做">
              <Sym name="arrow.uturn.forward" size={19} color={C.tint} />
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable style={st.kb} onPress={() => Keyboard.dismiss()} accessibilityLabel="完成">
              <Text style={st.kDone}>完成</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function BarBtn({ icon, label, onPress }: { icon: SFSymbol; label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [st.barBtn, pressed && { opacity: 0.4 }]} onPress={onPress} accessibilityLabel={label} hitSlop={4}>
      <Sym name={icon} size={icon === 'chevron.left' ? 22 : 20} color={C.label} weight={icon === 'chevron.left' ? 'semibold' : 'regular'} />
    </Pressable>
  );
}

type LineProps = {
  it: Item; index: number; done: boolean; focused: boolean; inputKey: string; tone: { bg: string; rule: string };
  dragIdx: SharedValue<number>; dragTo: SharedValue<number>; dragDy: SharedValue<number>; dragH: SharedValue<number>;
  refInput: (r: TextInputInstance | null) => void; onLayoutRow: (y: number, h: number) => void;
  onChange: (v: string) => void; onKey: (e: TextInputKeyPressEvent) => void; onFocus: () => void; onBlur: () => void;
  onStrike: () => void; onRemove: () => void; onX: () => void;
  drag: { start: (id: string) => void; move: (dy: number) => void; end: () => void };
};

// 一行只有在自己的資料變了才重畫（打字不算：字由底下的 Field 自己管），
// 不然每次重畫整頁，每一行的滑動手勢都要重設一次，打字和捲動會卡
const Line = memo(LineRow, (a, b) => a.it === b.it && a.done === b.done && a.focused === b.focused && a.inputKey === b.inputKey
  && a.index === b.index && a.tone.bg === b.tone.bg && a.tone.rule === b.tone.rule);

function LineRow(p: LineProps) {
  const tx = useSharedValue(0);
  const w = useSharedValue(1);
  // 手勢和動畫只能抓這些「拆出來的」值；抓到 p 會連 p.it（這一行的資料）一起被凍住，打字就存不進去
  const { onStrike, onRemove, index, dragIdx, dragTo, dragDy, dragH } = p;
  const { start: dragStart, move: dragMove, end: dragEnd } = p.drag;
  const id = p.it.id;

  // 劃掉前先在字上畫一條線（從左到右、多行就一行接一行），畫完才真的劃掉。
  // 先用一個看不見的 Text 量出每一行字的位置和寬度。恢復（取消劃掉）不用畫。
  const calm = useReducedMotion();
  const ink = useSharedValue(0);
  const [marks, setMarks] = useState<Mark[] | null>(null);
  const inkT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function finishStrike() {
    clearTimeout(inkT.current);
    setMarks(null);
    onStrike();
  }
  // 手勢可能還拿著舊的 beginStrike，所以這一行現在的狀態從 ref 讀
  const live = useRef(p);
  live.current = p;
  function beginStrike() {
    const cur = live.current;
    if (cur.done || calm || !cur.it.t.trim()) return onStrike();
    ink.value = 0;
    setMarks([]);
    inkT.current = setTimeout(finishStrike, 150); // 量不到字（例如網頁）就直接劃掉
  }
  function onMeasured(lines: { x: number; y: number; width: number; height: number }[]) {
    if (!marks || marks.length || !lines.length) return;
    clearTimeout(inkT.current);
    let off = 0;
    const m = lines.filter(l => l.width > 0).map(l => { const r = { x: l.x, y: l.y + l.height * 0.56, w: l.width, off }; off += l.width; return r; });
    setMarks(m);
    ink.value = withTiming(off, { duration: Math.min(380, Math.max(170, off * 0.7)), easing: Easing.inOut(Easing.quad) },
      done => { if (done) scheduleOnRN(finishStrike); });
  }
  useEffect(() => () => clearTimeout(inkT.current), []);

  const swipe = usePanGesture({
    activeOffsetX: [-14, 14],
    failOffsetY: [-12, 12],
    onActivate: () => { 'worklet'; scheduleOnRN(dismissKb); },
    onUpdate: e => { 'worklet'; tx.value = e.translationX; },
    onDeactivate: e => {
      'worklet';
      const dx = e.translationX, W = w.value;
      if (!e.canceled && dx > Math.min(90, W * 0.25)) {
        tx.value = withTiming(0, { duration: 150 }, () => scheduleOnRN(beginStrike));
      } else if (!e.canceled && dx < -Math.min(110, W * 0.3)) {
        tx.value = withTiming(-W, { duration: 180 }, () => scheduleOnRN(onRemove));
      } else tx.value = withTiming(0, { duration: 180 });
    },
  });
  const grip = usePanGesture({
    runOnJS: true,
    minDistance: 1,
    onActivate: () => dragStart(id),
    onUpdate: e => dragMove(e.translationY),
    onFinalize: () => dragEnd(),
  });

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const under = useAnimatedStyle(() => ({ backgroundColor: tx.value > 0 ? TINT : tx.value < 0 ? '#FF3B30' : 'transparent' }));
  const leftLabel = useAnimatedStyle(() => ({ opacity: tx.value > 0 ? 1 : 0 }));
  const rightLabel = useAnimatedStyle(() => ({ opacity: tx.value < 0 ? 1 : 0 }));
  const shift = useAnimatedStyle(() => {
    const from = dragIdx.value, to = dragTo.value;
    if (from < 0) return { zIndex: 0, transform: [{ translateY: 0 }], shadowOpacity: 0 };
    if (index === from) return { zIndex: 5, transform: [{ translateY: dragDy.value }], shadowOpacity: 0.18 };
    let y = 0;
    if (from < to && index > from && index <= to) y = -dragH.value;
    if (from > to && index < from && index >= to) y = dragH.value;
    return { zIndex: 0, transform: [{ translateY: withTiming(y, { duration: 150 }) }], shadowOpacity: 0 };
  }, WEB_DEPS ? [index] : undefined);

  return (
    <Animated.View collapsable={false}
      onLayout={e => { w.value = e.nativeEvent.layout.width; p.onLayoutRow(e.nativeEvent.layout.y, e.nativeEvent.layout.height); }}
      style={[st.ci, { backgroundColor: p.tone.bg, borderBottomColor: p.tone.rule }, shift]}>
      <Animated.View style={[StyleSheet.absoluteFill, st.under, under]}>
        <Animated.Text style={[st.underText, leftLabel]}>{p.done ? '恢復' : '劃掉'}</Animated.Text>
        <Animated.Text style={[st.underText, rightLabel]}>刪除</Animated.Text>
      </Animated.View>
      <GestureDetector gesture={swipe}>
        <Animated.View style={[st.cin, { backgroundColor: p.tone.bg }, slide]}>
          {/* 正在打的那一行亮一點，看得出游標在哪一格 */}
          {p.focused && <View pointerEvents="none" style={[StyleSheet.absoluteFill, st.wash]} />}
          <View style={st.field}>
            <Field key={p.inputKey} text={p.it.t} done={p.done} refInput={p.refInput}
              onChange={p.onChange} onKey={p.onKey} onFocus={p.onFocus} onBlur={p.onBlur} />
            {marks && (
              <View pointerEvents="none" style={st.inkBox}>
                <Text style={[st.ta, st.inkMeasure]} onTextLayout={e => onMeasured(e.nativeEvent.lines)}>{p.it.t}</Text>
                {marks.map((m, i) => <InkBar key={i} m={m} ink={ink} />)}
              </View>
            )}
          </View>
          {p.focused
            ? (
              <Pressable style={st.side} onPress={p.onX} accessibilityLabel="刪除這行">
                <Sym name="xmark.circle.fill" size={18} color={C.tertiary} />
              </Pressable>
            ) : (
              <GestureDetector gesture={grip}>
                <View style={st.side} accessibilityLabel="拖曳排序"><Sym name="line.3.horizontal" size={16} color={C.tertiary} /></View>
              </GestureDetector>
            )}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

// 一行的字。高度由底下一份看不見的同樣文字決定：它跟一般文字一樣會自動換行、自動長高，
// 輸入框疊在它上面撐滿，字打到超過一行就一定會長出下一行。打字時只有這一小塊重畫。
function Field({ text, done, refInput, onChange, onKey, onFocus, onBlur }: {
  text: string; done: boolean; refInput: (r: TextInputInstance | null) => void;
  onChange: (v: string) => void; onKey: (e: TextInputKeyPressEvent) => void; onFocus: () => void; onBlur: () => void;
}) {
  const [txt, setTxt] = useState(text);
  return (
    <>
      <Text style={[st.ta, st.mirror]} accessible={false} importantForAccessibility="no-hide-descendants">{txt + '​'}</Text>
      <TextInput ref={refInput} defaultValue={text} multiline scrollEnabled={false}
        style={[st.ta, st.taFill, done && st.taDone]}
        onChangeText={v => { setTxt(v); onChange(v); }} onKeyPress={onKey}
        onFocus={onFocus} onBlur={onBlur} />
    </>
  );
}

type Mark = { x: number; y: number; w: number; off: number };

// 劃線的一段（一行字一段）：ink 走到這一段時從左往右長出來
function InkBar({ m, ink }: { m: Mark; ink: SharedValue<number> }) {
  const { off, w } = m;
  const grow = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0, Math.min(1, (ink.value - off) / w)) }] }));
  return <Animated.View style={[st.inkBar, { left: m.x, top: m.y, width: w }, grow]} />;
}

// 一行字的高度與上下留白（照網頁版：字大一點、行距寬一點，打起來比較舒服）
const LINE_H = 29;
const PAD_V = 12;
const ROW_H = LINE_H + PAD_V * 2;

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  barBtn: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, height: 46, fontSize: F.title3, fontWeight: '700', color: C.label, paddingVertical: 0, paddingHorizontal: 4 },
  addrow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, paddingLeft: 18, paddingRight: 20, borderBottomWidth: 1 },
  addText: { fontSize: 19, color: C.secondary },
  ci: { overflow: 'hidden', borderBottomWidth: 1, shadowColor: '#000', shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  under: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  underText: { color: '#fff', fontSize: F.subhead, fontWeight: '600' },
  cin: { flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 20, paddingRight: 6 },
  wash: { backgroundColor: 'rgba(255,255,255,0.45)' },
  field: { flex: 1, minWidth: 0 },
  ta: { fontSize: 19, lineHeight: LINE_H, paddingTop: PAD_V, paddingBottom: PAD_V, paddingHorizontal: 0, minHeight: ROW_H, color: C.label },
  // 撐高度用的隱形文字：右邊少 2 點，寧可早一點換行、多留一點空，也不要字被切掉
  mirror: { color: 'transparent', paddingRight: 2 },
  taFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, textAlignVertical: 'top' },
  taDone: { textDecorationLine: 'line-through', color: C.secondary },
  inkBox: { position: 'absolute', left: 0, right: 0, top: PAD_V, bottom: 0 },
  inkMeasure: { position: 'absolute', left: 0, right: 0, top: 0, paddingTop: 0, paddingBottom: 0, minHeight: 0, opacity: 0 },
  inkBar: { position: 'absolute', height: 1.6, borderRadius: 1, backgroundColor: C.secondary, transformOrigin: 'left' },
  side: { width: 36, height: ROW_H, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: F.footnote, color: C.secondary, textAlign: 'center', padding: 14 },
  kbarWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  kbar: { height: KBAR_H, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, backgroundColor: C.groupedBg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  kb: { height: 40, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  kbOff: { opacity: 0.3 },
  kDone: { color: C.tint, fontSize: F.body, fontWeight: '600' },
});

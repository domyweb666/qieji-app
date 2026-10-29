// 筆記編輯：文字筆記／清單筆記。清單的每一行就是一個點子：
// 往右滑＝劃掉結茄子，往左滑＝刪除，拉右邊的把手＝排序。
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useReducer, useRef, useState } from 'react';
import {
  InputAccessoryView, Keyboard, Pressable, Share, StyleSheet, Text, TextInput, useWindowDimensions, View,
  type HostInstance, type TextInputInstance, type TextInputKeyPressEvent,
} from 'react-native';
import { GestureDetector, ScrollView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { menuItems, showActs, type Act } from '../../components/Acts';
import { ui } from '../../components/Overlay';
import { Sym } from '../../components/Sym';
import { GlassBtn, native, WebTop } from '../../components/WebBars';
import {
  ago, bloom, CKEYS, col, convertNote, fullDate, isEmpty, plain, splitLines, toggleStrike, uid, type Item, type Kind, type Note,
} from '../../lib/model';
import { newNote, store, useStore } from '../../lib/store';
import { C, DOTS, F } from '../../lib/theme';

const KBAR = 'kbar';
// 給手勢（UI 執行緒）呼叫的都放模組層級：worklet 抓到的物件會被凍住，抓到筆記或某一行就改不動了
const dismissKb = () => Keyboard.dismiss();
const TINT = C.tint as string;

export default function NoteScreen() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  // 關閉空白筆記時它會被移出 state，這裡留住它，讓退場動畫期間畫面不會突然變空
  const keep = useRef<Note | undefined>(undefined);
  if (!keep.current) keep.current = store.s.notes.find(n => n.id === id);
  if (!keep.current) return <View style={{ flex: 1, backgroundColor: C.page }} />;
  return <Editor n={keep.current} fresh={fresh === '1'} />;
}

function Editor({ n, fresh }: { n: Note; fresh: boolean }) {
  useStore();
  const { height: winH } = useWindowDimensions();
  const [, force] = useReducer((x: number) => x + 1, 0);

  const closed = useRef(false);
  const mounted = useRef(true);
  const scrollRef = useRef<any>(null);
  const titleRef = useRef<TextInputInstance>(null);
  const bodyRef = useRef<TextInputInstance>(null);
  const inputs = useRef<Record<string, TextInputInstance | null>>({});
  const rows = useRef<Record<string, HostInstance | null>>({});
  const layouts = useRef<Record<string, { y: number; h: number }>>({});
  const sel = useRef<Record<string, { start: number; end: number }>>({});
  const pending = useRef<{ id: string; caret?: number } | null>(null);
  const focused = useRef<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  // 程式改了某一行的字（拆行、合併、復原）時，換 key 讓那個輸入框重新掛載
  const rev = useRef<Record<string, number>>({});
  const [epoch, setEpoch] = useState(0);
  const [bodyH, setBodyH] = useState(0);

  /* ---------- undo / redo ---------- */
  const hist = useRef<string[]>([]);
  const hpos = useRef(-1);
  const histT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const snapPending = useRef(false);
  const snap = () => JSON.stringify({ title: n.title, body: n.body, items: n.items, type: n.type });
  function snapshot() {
    snapPending.current = false;
    const sn = snap();
    if (hist.current[hpos.current] !== sn) {
      hist.current = hist.current.slice(0, hpos.current + 1);
      hist.current.push(sn);
      if (hist.current.length > 200) hist.current.shift();
      hpos.current = hist.current.length - 1;
    }
    force();
  }
  if (hpos.current < 0) { hist.current = [snap()]; hpos.current = 0; }
  function changed(now?: boolean) {
    n.updated = Date.now();
    store.change();
    clearTimeout(histT.current);
    if (now) snapshot();
    else { snapPending.current = true; histT.current = setTimeout(() => snapshot(), 450); }
  }
  function restore(sn: string) {
    Object.assign(n, JSON.parse(sn));
    n.updated = Date.now();
    store.change();
    setEpoch(e => e + 1);
  }
  const undo = () => { clearTimeout(histT.current); snapshot(); if (hpos.current > 0) { hpos.current--; restore(hist.current[hpos.current]); } };
  const redo = () => { if (hpos.current < hist.current.length - 1) { hpos.current++; restore(hist.current[hpos.current]); } };
  const canUndo = hpos.current > 0 || snapPending.current;
  const canRedo = hpos.current < hist.current.length - 1;

  /* ---------- bloom / harvest ---------- */
  function fx(id: string, kind: Kind, fly: boolean) {
    rows.current[id]?.measureInWindow((x, y, w, h) => {
      if (y + h < 0 || y > winH) return;
      const at = { x: x + w, y: y + h / 2 };
      if (fly) ui.toBasket(at, kind); else ui.pop(at, kind);
    });
  }
  // an idea "blooms" the first time it is left with text in it
  function bloomCheck(anim: boolean, skipId?: string | null) {
    const ids = bloom(store.s, n, skipId);
    if (!ids.length) return;
    store.change();
    if (anim && n.type === 'check') ids.forEach(id => fx(id, 'f', false));
  }
  function strike(id: string) {
    const it = n.items.find(i => i.id === id);
    if (!it || !it.t.trim()) return;
    const kind = toggleStrike(store.s, it);
    changed(true);
    store.markHint();
    if (kind) {
      fx(id, kind, true);
      Haptics.impactAsync(kind === 'g' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
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
  useEffect(() => {
    const p = pending.current;
    if (!p) return;
    const inp = inputs.current[p.id];
    if (!inp) return;
    pending.current = null;
    inp.focus();
    const at = p.caret ?? n.items.find(i => i.id === p.id)?.t.length ?? 0;
    inp.setSelection?.(at, at);
  });
  function focusNew() {
    const first = n.items[0];
    if (first && !first.t.trim()) return focusItem(first.id, 0);
    const it: Item = { id: uid(), t: '', done: false, b: false };
    n.items.unshift(it);
    changed();
    focusItem(it.id, 0);
  }
  function insertAfter(id: string, text: string) {
    const it: Item = { id: uid(), t: text, done: false, b: false };
    n.items.splice(n.items.findIndex(i => i.id === id) + 1, 0, it);
    changed();
    focusItem(it.id, 0);
    bloomCheck(true, it.id);
  }
  function cleanupEmpty() {
    const keep = n.items.filter(i => i.t.trim());
    if (keep.length !== n.items.length) { n.items = keep; store.change(); }
  }
  function onFocus(id: string) {
    focused.current = id;
    setFocusId(id);
    if (n.type === 'check') bloomCheck(true, id === 'title' ? null : id);
  }
  function onBlur(id: string) {
    if (focused.current === id) focused.current = null;
    setTimeout(() => {
      if (focused.current || !mounted.current || closed.current) return;
      setFocusId(null);
      if (n.type === 'check') { bloomCheck(true); cleanupEmpty(); }
    }, 120);
  }

  /* ---------- typing in a line ---------- */
  function onChange(id: string, v: string) {
    const it = n.items.find(i => i.id === id);
    if (!it) return;
    if (!/\r?\n/.test(v)) { it.t = v; return changed(); }
    // 貼上多行 → 拆成多行（Enter 由 onSubmit 處理，不會走到這裡）
    const [head, ...more] = v.split(/\r?\n/);
    it.t = head;
    rev.current[id] = (rev.current[id] || 0) + 1;
    let prev = it;
    for (const t of splitLines(more.join('\n'))) {
      const x: Item = { id: uid(), t, done: false, b: false };
      n.items.splice(n.items.indexOf(prev) + 1, 0, x);
      prev = x;
    }
    changed(true);
    focusItem(prev.id, prev.t.length);
  }
  function onSubmit(id: string) {
    const it = n.items.find(i => i.id === id);
    if (!it) return;
    if (!it.t.trim()) return Keyboard.dismiss(); // Enter on empty line = stop
    const pos = Math.min(sel.current[id]?.start ?? it.t.length, it.t.length);
    const after = it.t.slice(pos);
    if (after) { it.t = it.t.slice(0, pos); rev.current[id] = (rev.current[id] || 0) + 1; }
    insertAfter(id, after);
  }
  function onKey(id: string, e: TextInputKeyPressEvent) {
    if (e.nativeEvent.key !== 'Backspace') return;
    const p = sel.current[id], idx = n.items.findIndex(i => i.id === id);
    if (!p || p.start !== 0 || p.end !== 0 || idx <= 0) return;
    // 在行首按刪除 → 併到上一行
    const prev = n.items[idx - 1], caret = prev.t.length;
    prev.t += n.items[idx].t;
    n.items.splice(idx, 1);
    rev.current[prev.id] = (rev.current[prev.id] || 0) + 1;
    changed(true);
    focusItem(prev.id, caret);
  }
  function tapX(id: string) {
    const idx = n.items.findIndex(i => i.id === id);
    remove(id);
    const next = n.items[Math.min(idx, n.items.length - 1)];
    if (next) focusItem(next.id); else focusNew();
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
      dragH.value = layouts.current[id]?.h ?? 46;
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
    bloomCheck(false);
    if (n.type === 'check') n.items = n.items.filter(i => i.t.trim());
    if (isEmpty(n)) store.s.notes = store.s.notes.filter(x => x !== n);
    store.change();
    store.flush();
  }
  // 離開畫面（返回鍵、iOS 側滑返回）時收尾：畫面卸載就是筆記關閉
  useEffect(() => {
    mounted.current = true;
    // 萬一 effect 被重跑（開發模式），把剛被當成空白移掉的筆記放回去，不能讓它消失
    if (closed.current && !n.deleted && !store.s.notes.includes(n)) store.s.notes.push(n);
    closed.current = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    if (fresh) t = setTimeout(() => (n.type === 'text' ? bodyRef.current?.focus() : focusNew()), 60);
    return () => { clearTimeout(t); mounted.current = false; closeNote(); };
  }, []);

  /* ---------- actions ---------- */
  const shareText = () => (n.title ? n.title + '\n\n' : '') + plain(n);
  const anyDone = n.type === 'check' && n.items.some(i => i.done);
  function togglePin() { n.pinned = !n.pinned; changed(); ui.toast(n.pinned ? '已釘選' : '已取消釘選'); }
  function convert() {
    convertNote(n); changed(true); setEpoch(e => e + 1);
    ui.toast(n.type === 'check' ? '已轉為清單' : '已轉為文字');
  }
  function share() { Keyboard.dismiss(); Share.share({ message: shareText() }).catch(() => {}); }
  function del() {
    n.deleted = true; n.pinned = false;
    if (n.type === 'check') n.items = n.items.filter(i => i.t.trim());
    const empty = isEmpty(n);
    if (empty) store.s.notes = store.s.notes.filter(x => x !== n);
    closed.current = true;
    store.change();
    router.back();
    if (!empty) ui.toast('已移到最近刪除', { label: '復原', fn: () => { n.deleted = false; store.change(); } });
  }
  // 新增：換成一則新的（跟備忘錄一樣，不會一層層疊上去）
  function compose(type: Note['type']) {
    const m = newNote(n.color, type);
    router.replace({ pathname: '/note/[id]', params: { id: m.id, fresh: '1' } });
  }
  const newActs: Act[] = [
    { label: '記事', icon: 'text.alignleft', fn: () => compose('text') },
    { label: '清單', icon: 'checklist', fn: () => compose('check') },
  ];
  const moreActs: Act[] = [
    { label: n.pinned ? '取消釘選' : '釘選', icon: n.pinned ? 'pin.slash' : 'pin', fn: togglePin },
    { label: n.type === 'text' ? '轉為清單（每行一條）' : '轉為記事', icon: n.type === 'text' ? 'checklist' : 'text.alignleft', fn: convert },
    { label: '清單', inline: true, hidden: n.type !== 'check' || (n.items.length < 2 && !anyDone), sub: [
      { label: '上下順序反轉', icon: 'arrow.up.arrow.down', hidden: n.items.length < 2, fn: () => { n.items.reverse(); changed(true); } },
      { label: '全部恢復（取消劃線）', icon: 'arrow.uturn.backward', hidden: !anyDone, fn: () => { n.items.forEach(i => (i.done = false)); changed(true); } },
      { label: '清掉劃掉的行', icon: 'eraser', hidden: !anyDone, fn: () => { n.items = n.items.filter(i => !i.done); changed(true); } },
    ] },
    { label: '複製全文', icon: 'doc.on.doc', fn: () => { Clipboard.setStringAsync(shareText()).then(() => ui.toast('已複製'), () => ui.toast('複製失敗')); } },
    { label: '刪除', icon: 'trash', destructive: true, fn: del },
  ];
  const colorActs: Act[] = CKEYS.map(k => ({ label: col(k).name, img: DOTS[k], on: n.color === k, fn: () => { n.color = k; changed(); } }));

  const showHint = n.type === 'check' && !store.hintSeen && n.items.some(i => i.t.trim());
  const inputProps = native ? { inputAccessoryViewID: KBAR } : {};
  const editing = focusId !== null;

  return (
    <View style={{ flex: 1, backgroundColor: C.page }} collapsable={false}>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets
        scrollEnabled={!dragging} onLayout={e => setBodyH(e.nativeEvent.layout.height)}>
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon="square.and.arrow.up" accessibilityLabel="分享" onPress={share} />
          <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="更多">{menuItems(moreActs)}</Stack.Toolbar.Menu>
        </Stack.Toolbar>
        {/* 打字時底部工具列讓位，改用鍵盤上方那一條 */}
        {!editing && (
          <Stack.Toolbar placement="bottom">
            <Stack.Toolbar.Menu icon="paintpalette" accessibilityLabel="顏色" title="顏色">{menuItems(colorActs)}</Stack.Toolbar.Menu>
            <Stack.Toolbar.Button icon={n.pinned ? 'pin.fill' : 'pin'} accessibilityLabel="釘選" onPress={togglePin} />
            <Stack.Toolbar.Spacer />
            <Stack.Toolbar.Menu icon="square.and.pencil" accessibilityLabel="新增" title="新增">{menuItems(newActs)}</Stack.Toolbar.Menu>
          </Stack.Toolbar>
        )}
        <WebTop left={<GlassBtn icon="chevron.left" label="返回" onPress={() => router.back()} />}
          right={(
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <GlassBtn icon="square.and.arrow.up" label="分享" onPress={share} />
              <GlassBtn icon="ellipsis" label="更多" onPress={() => showActs(moreActs)} />
            </View>
          )} />

        <View style={st.paper}>
          <TextInput ref={titleRef} key={`title${epoch}`} defaultValue={n.title} placeholder="標題" {...inputProps}
            placeholderTextColor={C.placeholder} style={st.title} multiline scrollEnabled={false}
            returnKeyType="next" submitBehavior="submit"
            onChangeText={v => { n.title = v.replace(/\r?\n/g, ' '); changed(); }}
            onFocus={() => onFocus('title')} onBlur={() => onBlur('title')}
            onSubmitEditing={() => (n.type === 'text' ? bodyRef.current?.focus() : focusNew())} />
          <View style={st.meta}>
            <View style={[st.metaDot, { backgroundColor: col(n.color).hd }]} />
            <Text style={st.metaText}>{fullDate(n.updated)}　{ago(n.updated)}</Text>
          </View>

          {n.type === 'text' ? (
            <TextInput ref={bodyRef} key={`body${epoch}`} defaultValue={n.body} placeholder="開始輸入…" multiline scrollEnabled={false}
              placeholderTextColor={C.placeholder} style={[st.body, { minHeight: Math.max(bodyH - 160, 200) }]} {...inputProps}
              onChangeText={v => { n.body = v; changed(); }}
              onFocus={() => onFocus('body')} onBlur={() => onBlur('body')} />
          ) : (
            <>
              <Pressable style={({ pressed }) => [st.addrow, pressed && { opacity: 0.5 }]} onPress={focusNew}>
                <View style={st.addIcon}><Sym name="plus" size={14} color={C.tint} weight="semibold" /></View>
                <Text style={st.addText}>新增一行</Text>
              </Pressable>
              <View>
                {n.items.map((it, index) => (
                  <Line key={it.id} it={it} index={index} done={it.done} focused={focusId === it.id}
                    inputKey={`${it.id}:${rev.current[it.id] || 0}:${epoch}`} inputProps={inputProps}
                    dragIdx={dragIdx} dragTo={dragTo} dragDy={dragDy} dragH={dragH}
                    refInput={r => { inputs.current[it.id] = r; }} refRow={r => { rows.current[it.id] = r; }}
                    onLayoutRow={(y, h) => { layouts.current[it.id] = { y, h }; }}
                    onSel={v => { sel.current[it.id] = v; }}
                    onChange={v => onChange(it.id, v)} onSubmit={() => onSubmit(it.id)} onKey={e => onKey(it.id, e)}
                    onFocus={() => onFocus(it.id)} onBlur={() => onBlur(it.id)}
                    onStrike={() => strike(it.id)} onRemove={() => remove(it.id)} onX={() => tapX(it.id)} drag={dragApi} />
                ))}
              </View>
              {showHint && <Text style={st.hint}>往右滑＝劃掉，結一顆茄子　·　往左滑＝刪除</Text>}
              {/* tap empty space = jump to the new-idea field */}
              <Pressable style={{ height: 220 }} onPress={focusNew} />
            </>
          )}
        </View>
      </ScrollView>

      {native && (
        <InputAccessoryView nativeID={KBAR}>
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
        </InputAccessoryView>
      )}
    </View>
  );
}

type LineProps = {
  it: Item; index: number; done: boolean; focused: boolean; inputKey: string; inputProps: object;
  dragIdx: SharedValue<number>; dragTo: SharedValue<number>; dragDy: SharedValue<number>; dragH: SharedValue<number>;
  refInput: (r: TextInputInstance | null) => void; refRow: (r: HostInstance | null) => void; onLayoutRow: (y: number, h: number) => void;
  onSel: (v: { start: number; end: number }) => void; onChange: (v: string) => void; onSubmit: () => void;
  onKey: (e: TextInputKeyPressEvent) => void; onFocus: () => void; onBlur: () => void;
  onStrike: () => void; onRemove: () => void; onX: () => void;
  drag: { start: (id: string) => void; move: (dy: number) => void; end: () => void };
};

function Line(p: LineProps) {
  const tx = useSharedValue(0);
  const w = useSharedValue(1);
  // 手勢和動畫只能抓這些「拆出來的」值；抓到 p 會連 p.it（這一行的資料）一起被凍住，打字就存不進去
  const { onStrike, onRemove, index, dragIdx, dragTo, dragDy, dragH } = p;
  const { start: dragStart, move: dragMove, end: dragEnd } = p.drag;
  const id = p.it.id;

  const swipe = usePanGesture({
    activeOffsetX: [-14, 14],
    failOffsetY: [-12, 12],
    onActivate: () => { 'worklet'; scheduleOnRN(dismissKb); },
    onUpdate: e => { 'worklet'; tx.value = e.translationX; },
    onDeactivate: e => {
      'worklet';
      const dx = e.translationX, W = w.value;
      if (!e.canceled && dx > Math.min(90, W * 0.25)) {
        tx.value = withTiming(0, { duration: 150 }, () => scheduleOnRN(onStrike));
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
  }, [index]);

  return (
    <Animated.View ref={p.refRow as any} collapsable={false}
      onLayout={e => { w.value = e.nativeEvent.layout.width; p.onLayoutRow(e.nativeEvent.layout.y, e.nativeEvent.layout.height); }}
      style={[st.ci, shift]}>
      <Animated.View style={[StyleSheet.absoluteFill, st.under, under]}>
        <Animated.Text style={[st.underText, leftLabel]}>{p.done ? '恢復' : '劃掉'}</Animated.Text>
        <Animated.Text style={[st.underText, rightLabel]}>刪除</Animated.Text>
      </Animated.View>
      <GestureDetector gesture={swipe}>
        <Animated.View style={[st.cin, slide]}>
          <View style={st.lineBody}>
            <TextInput ref={p.refInput} key={p.inputKey} defaultValue={p.it.t} multiline scrollEnabled={false}
              submitBehavior="submit" returnKeyType="next" {...p.inputProps}
              style={[st.ta, p.done && st.taDone]}
              onChangeText={p.onChange} onSubmitEditing={p.onSubmit} onKeyPress={p.onKey}
              onSelectionChange={e => p.onSel(e.nativeEvent.selection)}
              onFocus={p.onFocus} onBlur={p.onBlur} />
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
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  paper: { paddingHorizontal: 20 },
  title: { fontSize: F.title, fontWeight: '700', color: C.label, paddingTop: 8, paddingBottom: 2, paddingHorizontal: 0 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 14 },
  metaDot: { width: 8, height: 8, borderRadius: 4 },
  metaText: { fontSize: F.footnote, color: C.secondary },
  body: { fontSize: F.body, lineHeight: 25, color: C.label, paddingTop: 0, paddingBottom: 160, paddingHorizontal: 0, textAlignVertical: 'top' },
  addrow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 46 },
  addIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.tintSoft, alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: F.body, color: C.tint },
  ci: { overflow: 'hidden', backgroundColor: C.page, shadowColor: '#000', shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  under: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  underText: { color: '#fff', fontSize: F.subhead, fontWeight: '600' },
  cin: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: C.page },
  lineBody: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.separator },
  ta: { flex: 1, minWidth: 0, fontSize: F.body, lineHeight: 23, paddingTop: 11, paddingBottom: 11, paddingHorizontal: 0, minHeight: 46, color: C.label },
  taDone: { textDecorationLine: 'line-through', color: C.secondary },
  side: { width: 36, height: 46, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: F.footnote, color: C.secondary, textAlign: 'center', padding: 14 },
  kbar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: C.groupedBg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  kb: { height: 40, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  kbOff: { opacity: 0.3 },
  kDone: { color: C.tint, fontSize: F.body, fontWeight: '600' },
});

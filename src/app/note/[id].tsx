// 筆記編輯：文字筆記／清單筆記。清單的每一行就是一個點子：
// 往右滑＝劃掉結茄子，往左滑＝刪除，拉右邊的把手＝排序。
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useReducer, useRef, useState } from 'react';
import {
  InputAccessoryView, Keyboard, Platform, Pressable, Share, StyleSheet, Text, TextInput, useWindowDimensions, View,
  type HostInstance, type TextInputInstance, type TextInputKeyPressEvent,
} from 'react-native';
import { GestureDetector, ScrollView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon } from '../../components/Icon';
import { ui, type Row } from '../../components/Overlay';
import {
  ago, bloom, CKEYS, col, convertNote, fullDate, isEmpty, plain, splitLines, toggleStrike, uid, type Item, type Kind, type Note,
} from '../../lib/model';
import { store, useStore } from '../../lib/store';
import { T } from '../../lib/theme';

const KBAR = 'kbar';
const LINE_H = 44;

export default function NoteScreen() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  // 關閉空白筆記時它會被移出 state，這裡留住它，讓退場動畫期間畫面不會突然變空
  const keep = useRef<Note | undefined>(undefined);
  if (!keep.current) keep.current = store.s.notes.find(n => n.id === id);
  if (!keep.current) return <View style={{ flex: 1, backgroundColor: T.app }} />;
  return <Editor n={keep.current} fresh={fresh === '1'} />;
}

const mixWhite = (hex: string, w: number) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${c.map(v => Math.round(v + (255 - v) * w)).join(',')})`;
};

function Editor({ n, fresh }: { n: Note; fresh: boolean }) {
  useStore();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [, force] = useReducer((x: number) => x + 1, 0);
  const c = col(n.color);
  const ink = n.color === 'black' ? '#fff' : '#1f1f1f';

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
    scrollRef.current?.scrollTo({ y: 0, animated: false });
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
      dragH.value = layouts.current[id]?.h ?? 54;
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

  /* ---------- header actions ---------- */
  function more() {
    Keyboard.dismiss();
    const share = (n.title ? n.title + '\n\n' : '') + plain(n);
    const r: Row[] = [];
    r.push({ label: n.pinned ? '取消釘選' : '釘選到最上方', fn: () => { n.pinned = !n.pinned; changed(); ui.toast(n.pinned ? '已釘選' : '已取消釘選'); } });
    r.push({ label: n.type === 'text' ? '轉為清單（每行一條）' : '轉為文字', fn: () => {
      convertNote(n); changed(true); setEpoch(e => e + 1);
      ui.toast(n.type === 'check' ? '已轉為清單' : '已轉為文字');
    } });
    if (n.type === 'check' && n.items.length > 1) r.push({ label: '上下順序反轉', fn: () => { n.items.reverse(); changed(true); } });
    if (n.type === 'check' && n.items.some(i => i.done)) {
      r.push({ label: '全部恢復（取消劃線）', fn: () => { n.items.forEach(i => (i.done = false)); changed(true); } });
      r.push({ label: '清掉劃掉的行', fn: () => { n.items = n.items.filter(i => !i.done); changed(true); } });
    }
    r.push({ label: '分享', fn: () => { Share.share({ message: share }).catch(() => {}); } });
    r.push({ label: '複製全文', fn: () => { Clipboard.setStringAsync(share).then(() => ui.toast('已複製'), () => ui.toast('複製失敗')); } });
    r.push({ label: '刪除', danger: true, fn: () => {
      n.deleted = true; n.pinned = false;
      if (n.type === 'check') n.items = n.items.filter(i => i.t.trim());
      const empty = isEmpty(n);
      if (empty) store.s.notes = store.s.notes.filter(x => x !== n);
      closed.current = true;
      store.change();
      router.back();
      if (!empty) ui.toast('已移到垃圾桶', { label: '復原', fn: () => { n.deleted = false; store.change(); } });
    } });
    ui.sheet(r);
  }
  function pickColor() {
    Keyboard.dismiss();
    ui.custom('選擇顏色', close => (
      <View style={st.palette}>
        {CKEYS.map(k => (
          <Pressable key={k} accessibilityLabel={col(k).name} onPress={() => { n.color = k; changed(); close(); }}
            style={[st.pal, { backgroundColor: col(k).hd }, n.color === k && st.palOn]} />
        ))}
      </View>
    ));
  }

  const showHint = n.type === 'check' && !store.hintSeen && n.items.some(i => i.t.trim());
  const inputProps = Platform.OS === 'ios' ? { inputAccessoryViewID: KBAR } : {};

  return (
    <View style={[st.root, { backgroundColor: c.bg }]}>
      <View style={[st.head, { backgroundColor: c.hd, paddingTop: insets.top + 6 }]}>
        <Pressable style={st.ib} onPress={() => router.back()} accessibilityLabel="返回"><Icon name="back" color={ink} /></Pressable>
        <TextInput ref={titleRef} key={`title${epoch}`} defaultValue={n.title} placeholder="標題" {...inputProps}
          placeholderTextColor={n.color === 'black' ? 'rgba(255,255,255,.45)' : 'rgba(31,31,31,.45)'}
          style={[st.title, { color: ink }, focusId === 'title' && { backgroundColor: 'rgba(255,255,255,.55)' }]}
          returnKeyType="next" submitBehavior="submit"
          onChangeText={v => { n.title = v; changed(); }}
          onFocus={() => onFocus('title')} onBlur={() => onBlur('title')}
          onSubmitEditing={() => (n.type === 'text' ? bodyRef.current?.focus() : focusNew())} />
        <Pressable style={[st.swatch, { backgroundColor: c.hd }]} onPress={pickColor} accessibilityLabel="顏色" />
        <Pressable style={st.ib} onPress={more} accessibilityLabel="更多"><Icon name="dots" color={ink} /></Pressable>
      </View>
      <View style={st.meta}>
        <Text style={st.metaText}>{ago(n.updated)}</Text>
        <Text style={st.metaText}>{fullDate(n.updated)}</Text>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets scrollEnabled={!dragging} onLayout={e => setBodyH(e.nativeEvent.layout.height)}>
        {n.type === 'text' ? (
          <View style={{ minHeight: bodyH }}>
            <Lines rule={c.rule} height={Math.max(bodyH, 0)} />
            <TextInput ref={bodyRef} key={`body${epoch}`} defaultValue={n.body} placeholder="開始輸入…" multiline scrollEnabled={false}
              placeholderTextColor="rgba(0,0,0,.35)" style={[st.body, { minHeight: bodyH }]} {...inputProps}
              onChangeText={v => { n.body = v; changed(); }}
              onFocus={() => onFocus('body')} onBlur={() => onBlur('body')} />
          </View>
        ) : (
          <>
            <Pressable style={[st.addrow, { borderBottomColor: c.rule }]} onPress={focusNew}>
              <Text style={st.addPlus}>＋</Text><Text style={st.addText}>新增一行</Text>
            </Pressable>
            <View>
              {n.items.map((it, index) => (
                <Line key={it.id} it={it} index={index} done={it.done} focused={focusId === it.id}
                  inputKey={`${it.id}:${rev.current[it.id] || 0}:${epoch}`}
                  bg={c.bg} rule={c.rule} inputProps={inputProps}
                  dragIdx={dragIdx} dragTo={dragTo} dragDy={dragDy} dragH={dragH}
                  refInput={r => { inputs.current[it.id] = r; }} refRow={r => { rows.current[it.id] = r; }}
                  onLayoutRow={(y, h) => { layouts.current[it.id] = { y, h }; }}
                  onSel={v => { sel.current[it.id] = v; }}
                  onChange={v => onChange(it.id, v)} onSubmit={() => onSubmit(it.id)} onKey={e => onKey(it.id, e)}
                  onFocus={() => onFocus(it.id)} onBlur={() => onBlur(it.id)}
                  onStrike={() => strike(it.id)} onRemove={() => remove(it.id)} onX={() => tapX(it.id)} drag={dragApi} />
              ))}
            </View>
            {showHint && <Text style={st.hint}>向右滑＝劃掉，結一顆茄子　·　向左滑＝刪除</Text>}
            {/* tap empty space = jump to the new-idea field */}
            <Pressable style={{ height: 200 }} onPress={focusNew} />
          </>
        )}
      </ScrollView>

      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={KBAR}>
          <View style={[st.kbar, { backgroundColor: c.hd }]}>
            <Pressable style={[st.kb, !canUndo && st.kbOff]} disabled={!canUndo} onPress={undo} accessibilityLabel="復原">
              <Icon name="undo" color="rgba(0,0,0,.65)" />
            </Pressable>
            <Pressable style={[st.kb, !canRedo && st.kbOff]} disabled={!canRedo} onPress={redo} accessibilityLabel="重做">
              <Icon name="redo" color="rgba(0,0,0,.65)" />
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable style={st.kDone} onPress={() => Keyboard.dismiss()}><Text style={st.kDoneText}>完成</Text></Pressable>
          </View>
        </InputAccessoryView>
      )}
    </View>
  );
}

function Lines({ rule, height }: { rule: string; height: number }) {
  const count = Math.ceil(height / LINE_H) + 40;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ position: 'absolute', left: 0, right: 0, top: (i + 1) * LINE_H - 1, height: 1, backgroundColor: rule }} />
      ))}
    </View>
  );
}

type LineProps = {
  it: Item; index: number; done: boolean; focused: boolean; inputKey: string; bg: string; rule: string; inputProps: object;
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
  const { onStrike, onRemove, index } = p;

  const swipe = usePanGesture({
    activeOffsetX: [-14, 14],
    failOffsetY: [-12, 12],
    onActivate: () => { 'worklet'; scheduleOnRN(Keyboard.dismiss); },
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
    onActivate: () => p.drag.start(p.it.id),
    onUpdate: e => p.drag.move(e.translationY),
    onFinalize: () => p.drag.end(),
  });

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const under = useAnimatedStyle(() => ({ backgroundColor: tx.value > 0 ? '#7a7a7a' : tx.value < 0 ? '#d0443a' : 'transparent' }));
  const leftLabel = useAnimatedStyle(() => ({ opacity: tx.value > 0 ? 1 : 0 }));
  const rightLabel = useAnimatedStyle(() => ({ opacity: tx.value < 0 ? 1 : 0 }));
  const shift = useAnimatedStyle(() => {
    const from = p.dragIdx.value, to = p.dragTo.value;
    if (from < 0) return { zIndex: 0, transform: [{ translateY: 0 }], shadowOpacity: 0 };
    if (index === from) return { zIndex: 5, transform: [{ translateY: p.dragDy.value }], shadowOpacity: 0.2 };
    let y = 0;
    if (from < to && index > from && index <= to) y = -p.dragH.value;
    if (from > to && index < from && index >= to) y = p.dragH.value;
    return { zIndex: 0, transform: [{ translateY: withTiming(y, { duration: 150 }) }], shadowOpacity: 0 };
  }, [index]);

  return (
    <Animated.View ref={p.refRow as any} collapsable={false}
      onLayout={e => { w.value = e.nativeEvent.layout.width; p.onLayoutRow(e.nativeEvent.layout.y, e.nativeEvent.layout.height); }}
      style={[st.ci, { borderBottomColor: p.rule }, st.ciShadow, shift]}>
      <Animated.View style={[StyleSheet.absoluteFill, st.under, under]}>
        <Animated.Text style={[st.underText, leftLabel]}>{p.done ? '恢復' : '劃掉'}</Animated.Text>
        <Animated.Text style={[st.underText, rightLabel]}>刪除</Animated.Text>
      </Animated.View>
      <GestureDetector gesture={swipe}>
        <Animated.View style={[st.cin, { backgroundColor: p.focused ? mixWhite(p.bg, 0.45) : p.bg }, slide]}>
          <TextInput ref={p.refInput} key={p.inputKey} defaultValue={p.it.t} multiline scrollEnabled={false}
            submitBehavior="submit" returnKeyType="next" {...p.inputProps}
            style={[st.ta, p.done && st.taDone]}
            onChangeText={p.onChange} onSubmitEditing={p.onSubmit} onKeyPress={p.onKey}
            onSelectionChange={e => p.onSel(e.nativeEvent.selection)}
            onFocus={p.onFocus} onBlur={p.onBlur} />
          {p.focused
            ? <Pressable style={st.x} onPress={p.onX} accessibilityLabel="刪除這行"><Text style={st.xText}>✕</Text></Pressable>
            : (
              <GestureDetector gesture={grip}>
                <View style={st.grip} accessibilityLabel="拖曳排序"><Text style={st.gripText}>⋮⋮</Text></View>
              </GestureDetector>
            )}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, paddingBottom: 6, minHeight: 58 },
  ib: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, fontSize: 23, fontWeight: '500', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 6 },
  swatch: { width: 30, height: 30, borderRadius: 7, borderWidth: 2, borderColor: 'rgba(255,255,255,.8)', marginHorizontal: 6,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 0.5, shadowOffset: { width: 0, height: 0 } },
  meta: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 14 },
  metaText: { fontSize: 15, color: 'rgba(0,0,0,.5)' },
  body: { fontSize: 20, lineHeight: LINE_H, paddingHorizontal: 14, paddingTop: 0, paddingBottom: 160, color: T.text, textAlignVertical: 'top' },
  addrow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 14, height: 54, borderBottomWidth: 1 },
  addPlus: { fontSize: 22, color: 'rgba(0,0,0,.45)' },
  addText: { fontSize: 19, color: 'rgba(0,0,0,.45)' },
  ci: { borderBottomWidth: 1, overflow: 'hidden' },
  ciShadow: { shadowColor: '#000', shadowRadius: 9, shadowOffset: { width: 0, height: 6 } },
  under: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  underText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  cin: { flexDirection: 'row', alignItems: 'flex-start', gap: 2, paddingLeft: 14 },
  ta: { flex: 1, minWidth: 0, fontSize: 20, lineHeight: 30, paddingTop: 12, paddingBottom: 12, paddingHorizontal: 4, minHeight: 54, color: T.text },
  taDone: { textDecorationLine: 'line-through', color: 'rgba(0,0,0,.38)' },
  x: { width: 40, height: 52, alignItems: 'center', justifyContent: 'center' },
  xText: { color: 'rgba(0,0,0,.4)', fontSize: 19 },
  grip: { width: 36, height: 52, alignItems: 'center', justifyContent: 'center' },
  gripText: { color: 'rgba(0,0,0,.22)', fontSize: 18, letterSpacing: -2 },
  hint: { fontSize: 13, color: 'rgba(0,0,0,.4)', textAlign: 'center', padding: 14 },
  kbar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,.1)' },
  kb: { height: 40, minWidth: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  kbOff: { opacity: 0.3 },
  kDone: { height: 40, backgroundColor: 'rgba(0,0,0,.75)', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  kDoneText: { color: '#fff', fontSize: 16 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingTop: 10, paddingHorizontal: 20, paddingBottom: 18 },
  pal: { width: '16%', aspectRatio: 1, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,.2)' },
  palOn: { borderWidth: 3, borderColor: T.egg },
});

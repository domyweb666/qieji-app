// 目錄面板（B3，多米 2026-11-01 晚（二）定）：自己做的、從螢幕上面垂下來的面板，取代系統 formSheet。
// 開：紙的標題區往下拉（跟著手指）、點標題下的把手、行的「搬到…」。收：點下面露出的那截紙、把面板底部把手往上推、點一塊磚。
// 裡面：搜尋、新的一張、色磚、最近刪除、搬行模式（原本 src/app/directory.tsx 整段搬過來）。
// C1（2026-11-02）：磚照座位表（State.order）排，改字不換位、新的一張排最後；「已釘選／其他」兩段拿掉，釘選的磚右上角一個圖釘。
// 面板跟紙在同一個畫面（index）裡，紙那邊的手勢才能逐格推它；開到多開由 dirPanel.p（0＝收起、1＝全開）決定。
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { makeMutable, useAnimatedStyle, useReducedMotion, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { col, label, moveItem, seatedNotes, type Note } from '../lib/model';
import { newNote, store, useStore } from '../lib/store';
import { T, useColors, useNoteColors } from '../lib/tokens';
import { Empty } from './Empty';
import { ui } from './Overlay';
import { Sym } from './Sym';

const M = T.motion, G = T.gesture;

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
          setShown(false); setMove(undefined);
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

  // 面板底部把手往上推：跟著手指收上去，推過一段或往上甩就收起，不然彈回全開
  const { h } = dirPanel;
  const settle = (toOpen: boolean, v: number) => dirPanel.settle(toOpen, v);
  const push = usePanGesture({
    activeOffsetY: [-G.pullActivate, G.pullActivate],
    onUpdate: e => { 'worklet'; p.value = Math.min(1, Math.max(0, 1 + e.translationY / h.value)); },
    onDeactivate: e => {
      'worklet';
      const shut = e.translationY < -h.value * G.pushCloseRatio || e.velocityY < -G.flick;
      scheduleOnRN(settle, !shut, e.velocityY / h.value);
    },
  });

  const sheet = useAnimatedStyle(() => (calm
    ? { opacity: p.value, transform: [{ translateY: 0 }] }
    : { opacity: 1, transform: [{ translateY: -H * (1 - p.value) }] }));
  const dim = useAnimatedStyle(() => ({ opacity: p.value }));

  if (!shown) return null;
  return (
    // 停在全開之前（正在拉、正在彈）整層不接觸控：手指還在紙的標題區上拉，不能被蓋上來的暗幕或面板搶走
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'box-none' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, dim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => dirPanel.close()}
          accessibilityRole="button" accessibilityLabel="收起目錄" />
      </Animated.View>
      <Animated.View style={[st.sheet, { height: H, backgroundColor: c.surface }, sheet]}
        accessibilityViewIsModal onAccessibilityEscape={() => dirPanel.close()}>
        <Directory move={move} padTop={insets.top + T.space.s} />
        <GestureDetector gesture={push}>
          <Pressable style={st.grabBox} onPress={() => dirPanel.close()} accessibilityRole="button" accessibilityLabel="收起目錄">
            <View style={[st.grab, { backgroundColor: c.textSecondary }]} />
          </Pressable>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

function Directory({ move, padTop }: { move?: string; padTop: number }) {
  const s = useStore();
  const c = useColors();
  const { width } = useWindowDimensions();
  const [q, setQ] = useState('');
  const searching = !!q.trim();

  // 多米 2026-11-01：排序選項與顏色篩選拿掉（太雜）；C1 起照座位表排，搜尋也照座位（審查紀錄 2026-11-01 晚、晚（三））
  const notes = seatedNotes(s, q);
  const trashed = s.notes.filter(n => n.deleted).length;
  // 兩欄：整頁左右各留 16，中間留 12
  const tileW = (width - T.space.l * 2 - T.space.m) / 2;

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

  return (
    <View style={{ flex: 1 }} collapsable={false}>
      <View style={[st.top, { paddingTop: padTop }]}>
        <View style={[st.search, { backgroundColor: c.page }]}>
          <Sym name="magnifyingglass" size={17} color={c.textSecondary} />
          <TextInput value={q} onChangeText={setQ} placeholder="搜尋清單" placeholderTextColor={c.textMuted} clearButtonMode="while-editing"
            style={[st.searchInput, { color: c.textPrimary }]} accessibilityLabel="搜尋清單" />
        </View>
      </View>

      <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={st.body}>
        {moving && (
          <Text style={[st.moveHead, { color: c.textSecondary }]} numberOfLines={2}>把「{moving.t.trim()}」搬到</Text>
        )}
        {!searching && (
          <Pressable onPress={add} accessibilityRole="button" accessibilityLabel="新的一張"
            style={({ pressed }) => [st.tile, st.add, { width: tileW, borderColor: c.separator }, pressed && { opacity: T.motion.pressDim }]}>
            <Sym name="plus" size={22} color={c.textPrimary} />
            <Text style={[st.tileText, { color: c.textPrimary }]}>新的一張</Text>
          </Pressable>
        )}

        <View style={st.grid}>
          {notes.map(n => <Tile key={n.id} n={n} w={tileW} cur={n.id === store.last} onPress={() => pick(n)} />)}
        </View>

        {/* 找不到→帶他剛打的字；第一次不會是空的（紙永遠至少一張）。顏色篩選的空狀態跟著篩選一起拿掉（2026-11-01） */}
        {notes.length === 0 && searching && <Empty lines={[`找不到含「${q.trim()}」的清單`]} />}

        {trashed > 0 && (
          <Pressable onPress={() => dirPanel.close(() => router.push('/trash'))} accessibilityRole="button" accessibilityLabel={`最近刪除，${trashed} 張`}
            style={({ pressed }) => [st.trashRow, { borderTopColor: c.separator }, pressed && { opacity: T.motion.pressDim }]}>
            <Sym name="trash" size={17} color={c.textSecondary} />
            <Text style={[st.trashText, { color: c.textSecondary }]}>最近刪除</Text>
            <View style={{ flex: 1 }} />
            <Text style={[st.trashText, { color: c.textSecondary }]}>{trashed}</Text>
            <Sym name="chevron.right" size={12} color={c.textSecondary} />
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

// 一塊磚：底色是那張紙的顏色，右下角露出一顆色圓，只有名字。正在看的那張用 accent 框起來（面板上唯一的 accent）。
// 釘選的右上角一個圖釘（次要字色，跟紙標題旁那顆同一個；C1）
function Tile({ n, w, cur, onPress }: { n: Note; w: number; cur: boolean; onPress: () => void }) {
  const c = useColors();
  const nc = useNoteColors(n.color);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label(n)}，${col(n.color).hue}${n.pinned ? '，已釘選' : ''}`}
      accessibilityState={{ selected: cur }}
      style={({ pressed }) => [st.tile, { width: w, backgroundColor: nc.bg, borderColor: cur ? c.accent : nc.rule, borderWidth: cur ? T.shape.borderSelected : T.shape.borderCard },
        pressed && { opacity: T.motion.pressDim }]}>
      {/* 沒取名的跟紙的標題列一樣用次要色，看得出是「還沒取名」不是名字 */}
      <Text style={[st.tileText, n.pinned && st.tileTextPinned, { color: n.title.trim() ? c.textPrimary : c.textSecondary }]} numberOfLines={2}>{label(n)}</Text>
      <View style={[st.tag, { backgroundColor: nc.hd }]} />
      {n.pinned ? <View style={st.pin}><Sym name="pin.fill" size={14} color={c.textSecondary} /></View> : null}
    </Pressable>
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
  body: { paddingHorizontal: T.space.l, paddingTop: T.space.s, paddingBottom: T.space.l },
  moveHead: { ...T.font.subhead, marginBottom: T.space.m, marginLeft: T.space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: T.space.m, marginTop: T.space.m },
  tile: { height: T.shape.tile, borderRadius: T.shape.radiusCard, borderWidth: T.shape.borderCard, padding: T.space.m, overflow: 'hidden' },
  add: { borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: T.space.s },
  tileText: { ...T.font.emphasis },
  tileTextPinned: { marginRight: T.space.l }, // 名字長的時候不壓到右上角的圖釘
  pin: { position: 'absolute', top: T.space.m, right: T.space.m },
  tag: { position: 'absolute', right: -T.space.m, bottom: -T.space.m, width: T.shape.tileTag, height: T.shape.tileTag, borderRadius: T.shape.pill(T.shape.tileTag) },
  trashRow: { flexDirection: 'row', alignItems: 'center', gap: T.space.s, minHeight: T.shape.hitMin, marginTop: T.space.xl,
    paddingVertical: T.space.m, borderTopWidth: StyleSheet.hairlineWidth },
  trashText: { ...T.font.body },
});

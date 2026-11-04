// 切換清單（2026-11-04 改版，多米給的設計圖第 2 格）：點紙左上的清單名，從螢幕下面升起、貼齊底部（下面不是圓角）。
// 一開始用 iOS 系統的半高面板（formSheet），多米真機看：跟 ⋯ 的系統選單不像同一個畫風、而且 iOS 26 的半高面板是浮起來四角都圓的、關不掉，
// 改成自己做（多米選）：跟 ⋯ 選單同一種液態玻璃（Glass），排法照系統選單——左邊小方磚、右邊名字，組跟組之間一條線，小字標組名。
// 內容：最上面「新的一張」（F3，2026-11-04）；釘選的、這台手機最近開過的（model switchList），正在看的打勾；最下面「管理所有清單」＝收完之後打開目錄（DirPanel）。
// 收起：點上面露出的紙、往下撥上緣那條、點一張。減少動態：淡入淡出不滑
// 2026-11-04 多米真機：「切換清單有 lag，要延遲一下才切換」。以前等面板收完（約半秒）才開始換紙，現在點下去面板馬上讓開、紙同時換（規矩檔手感第 1 條）
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { label, seatFirstHole, switchList, type Note } from '../lib/model';
import { newNote, store, useStore } from '../lib/store';
import { T, useColors } from '../lib/tokens';
import { dirPanel } from './DirPanel';
import { Glass } from './Glass';
import { NoteIcon } from './NoteIcon';
import { Sym } from './Sym';

const M = T.motion, G = T.gesture;
const SPRING = { ...M.dirPanel.spring }, CLOSE = { ...M.switchClose.spring }, FADE = M.dirPanel.reducedFade;
const PULL = G.pullActivate, CLOSE_RATIO = G.pushCloseRatio, FLICK = G.flick;

let host: { open: () => void } | null = null;
export const switchPanel = { open: () => host?.open() };

export function SwitchPanelHost() {
  const [shown, setShown] = useState(false);
  useEffect(() => { host = { open: () => setShown(true) }; return () => { host = null; }; }, []);
  if (!shown) return null;
  return <SwitchPanel onGone={() => setShown(false)} />;
}

function SwitchPanel({ onGone }: { onGone: () => void }) {
  const s = useStore();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const calm = useReducedMotion();
  // 收起中清單就不再變（換了紙「最近」會重排，面板正在往下走時行不准跳）；只有打勾跟著移到點的那張
  const closing = useRef(false);
  const list = useRef<ReturnType<typeof switchList> | null>(null);
  if (!closing.current || !list.current) list.current = switchList(s, store.recent);
  const { pinned, recent } = list.current;
  // p：0＝收著、1＝全開；h：面板量到的高（還沒量到先當整個螢幕高，從螢幕外開始）
  const p = useSharedValue(0), h = useSharedValue(height), drag = useSharedValue(0);
  useEffect(() => { p.value = calm ? withTiming(1, { duration: FADE }) : withSpring(1, SPRING); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 收起：面板馬上開始讓開，收完才卸載。then＝使用者要的結果（換紙、開目錄），不等面板收完：下一格畫面就做（這一格先讓收起的動畫起跑，換紙卡 JS 也不影響它，動畫在 UI 執行緒）。
  // 收到一半又叫一次（點了一張又馬上點外面）照第一次的收。v＝手指放開的速度（換算成 p 每秒走多少），往下甩就接著那個速度走
  const close = (then?: () => void, v = 0) => {
    if (closing.current) return;
    closing.current = true;
    const fin = (f?: boolean) => { 'worklet'; if (f) scheduleOnRN(onGone); };
    p.value = calm ? withTiming(0, { duration: FADE }, fin) : withSpring(0, { ...CLOSE, velocity: v }, fin);
    if (then) requestAnimationFrame(then);
  };
  const flick = (v: number) => close(undefined, v);
  const pick = (n: Note) => close(n.id === store.last ? undefined : () => store.open(n.id));
  const all = () => close(() => dirPanel.open());
  // 新的一張（F3，2026-11-04）：黃色、放進目錄第一個空位；fresh＝紙打開後直接升起輸入框（跟目錄的 ＋ 一樣）
  const add = () => close(() => {
    const n = newNote('yellow', 'check');
    if (seatFirstHole(store.s, n.id, Date.now())) store.change();
    store.open(n.id, true);
  });
  // 往下撥上緣那條（小橫條＋組名那段）：跟著手指往下，撥過一段或往下甩就收起，不然彈回。
  // 收起時手指拉下來的那段（drag）留著不歸零：歸零的話面板會先跳回上面再往下走
  const pan = usePanGesture({
    activeOffsetY: PULL,
    onUpdate: e => { 'worklet'; drag.value = Math.max(0, e.translationY); },
    onDeactivate: e => {
      'worklet';
      if (!e.canceled && (e.translationY > h.value * CLOSE_RATIO || e.velocityY > FLICK)) scheduleOnRN(flick, -e.velocityY / Math.max(1, h.value));
      else drag.value = withSpring(0, SPRING);
    },
  });
  const sheet = useAnimatedStyle(() => (calm
    ? { opacity: p.value, transform: [{ translateY: 0 }] }
    : { opacity: 1, transform: [{ translateY: (1 - p.value) * h.value + drag.value }] }));
  const dim = useAnimatedStyle(() => ({ opacity: p.value }));

  const row = (n: Note) => {
    const cur = n.id === store.last;
    return (
      <Pressable key={n.id} onPress={() => pick(n)} accessibilityRole="button" accessibilityLabel={label(n)} accessibilityState={{ selected: cur }}
        style={({ pressed }) => [st.row, pressed && { backgroundColor: c.menuSep }]}>
        <NoteIcon n={n} size={T.shape.noteIcon} />
        <Text style={[st.name, { color: n.title.trim() ? c.textPrimary : c.textSecondary }]} numberOfLines={1}>{label(n)}</Text>
        {cur ? <Sym name="checkmark" size={17} color={c.accent} weight="semibold" /> : null}
      </Pressable>
    );
  };
  // 每組上面一條線（最上面還有「新的一張」，所以第一組也要）
  const group = (head: string, notes: Note[]) => notes.length ? (
    <View key={head}>
      <View style={[st.sep, { backgroundColor: c.menuSep }]} />
      <Text style={[st.head, { color: c.textSecondary }]}>{head}</Text>
      {notes.map(row)}
    </View>
  ) : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, dim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityRole="button" accessibilityLabel="收起切換清單" />
      </Animated.View>
      <Animated.View style={[st.sheet, { maxHeight: height * T.shape.switchMaxRatio }, sheet]} accessibilityViewIsModal
        onLayout={e => { h.value = e.nativeEvent.layout.height; }}>
        <Glass style={StyleSheet.absoluteFill} material="thick" />
        <GestureDetector gesture={pan}>
          <View style={st.grabBox} collapsable={false}>
            <View style={[st.grab, { backgroundColor: c.textSecondary }]} />
          </View>
        </GestureDetector>
        <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: insets.bottom + T.space.s }}>
          {/* 樣子跟「管理所有清單」同一種：茄紫每個畫面只出現一次，這個面板的勾已經用了 */}
          <Pressable onPress={add} accessibilityRole="button" accessibilityLabel="新的一張"
            style={({ pressed }) => [st.row, pressed && { backgroundColor: c.menuSep }]}>
            <View style={st.allIcon}><Sym name="plus" size={20} color={c.textPrimary} /></View>
            <Text style={[st.name, { color: c.textPrimary }]}>新的一張</Text>
          </Pressable>
          {group('釘選', pinned)}
          {group('最近', recent)}
          <View style={[st.sep, { backgroundColor: c.menuSep }]} />
          <Pressable onPress={all} accessibilityRole="button" accessibilityLabel="管理所有清單"
            style={({ pressed }) => [st.row, pressed && { backgroundColor: c.menuSep }]}>
            <View style={st.allIcon}><Sym name="square.grid.2x2" size={20} color={c.textPrimary} /></View>
            <Text style={[st.name, { color: c.textPrimary }]}>管理所有清單</Text>
            <Sym name="chevron.right" size={14} color={c.textSecondary} weight="semibold" />
          </Pressable>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  // 貼齊螢幕底部：只有上面兩個角是圓的（多米 2026-11-04：下面不該是圓角）
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden',
    borderTopLeftRadius: T.shape.radiusLg, borderTopRightRadius: T.shape.radiusLg },
  grabBox: { height: T.shape.hitMin / 2, alignItems: 'center', justifyContent: 'center' },
  grab: { width: T.shape.handleSolo, height: T.shape.dirGrab, borderRadius: T.shape.pill(T.shape.dirGrab), opacity: T.shape.handleOff },
  // 跟 PopMenu（系統選單的樣子）同一套：小字組名、組跟組之間一條線
  head: { ...T.font.footnote, fontWeight: T.font.semibold, marginHorizontal: T.space.gutter, marginTop: T.space.xs, marginBottom: T.space.xs },
  sep: { height: StyleSheet.hairlineWidth, marginHorizontal: T.space.gutter, marginVertical: T.space.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: T.space.m, minHeight: T.shape.menuRow, paddingHorizontal: T.space.gutter },
  name: { ...T.font.body, flex: 1, minWidth: 0 },
  allIcon: { width: T.shape.noteIcon, alignItems: 'center' },
});

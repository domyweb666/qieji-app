// 紙最下面的一條（2026-11-02 多米選甲「Safari 式底部列」）：「去別張紙」全部集中在這裡，跟紙上的行完全分開。
// 為什麼（第一性原理，審查紀錄 2026-11-02 晚）：之前左右撥換張在標題區和行下面的空白處，行上的左右滑卻是劃掉／刪除——
// 同一個方向兩個意思、界線看不見；往下拉開目錄在螢幕最上面，單手搆不到、又挨著系統的通知中心。iOS 自己的做法是「內容上的手勢只對內容，
// 去別的地方的手勢放在專用的列上」（Safari 在底部網址列左右滑換分頁、往上滑看全部分頁）。
// - 左邊玻璃膠囊：目錄圖示＋這張的名字＋頁點。在膠囊上左右滑＝換張（整張紙跟著手指走，跟以前一樣）；往上滑或點一下＝目錄從下面升起
// - 右邊茄紫玻璃圓鈕：＋ 記一行（核心動作，固定在右下角，跟以前同一個位置）
// VoiceOver：膠囊是「可調整」的元素，上下滑換張、點兩下開目錄
// 2026-11-03 多米：左右換張時 ＋ 要一直停在原地。以前底部列畫在紙裡面，換張＝整張紙重掛，列跟著重掛（玻璃重新長出來會閃一下）；
// 改成紙只把「列要用的東西」交給 barSlot，列本身由根畫面的 PageBarHost 畫在紙外面，換張時列從頭到尾是同一個、不動。
// 手勢一定要在列自己這裡建（2026-11-03 多米真機：膠囊左右滑不動）：手勢的偵測元件（RNGH v3 LeanReanimatedNativeDetector）第一次掛上時
// 就把事件綁給當時那個手勢的處理器，之後換成別的手勢不會重綁（Reanimated NativeEventsManager.updateEvents 比的是掛上時記下的那份）。
// 之前手勢由紙建、交給列：第一張紙滑得動，換過一次紙，膠囊還綁著第一張紙的處理器，新紙的事件全被丟掉。
// 現在手勢跟偵測元件同一個元件、同一輩子；紙只交「平移誰、左右是哪兩張」，換紙時同一個處理器原地換內容（Reanimated useEvent rebuild）
import { useState, useSyncExternalStore } from 'react';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedReaction, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import type { Note } from '../lib/model';
import { T, useColors } from '../lib/tokens';
import { dirPanel } from './DirPanel';
import { Glass } from './Glass';
import { Sym } from './Sym';

const KB = T.motion.keyboardFollow.duration;
// 給手勢（UI 執行緒）用的值先拆成數字和自己的物件（worklet 抓到的物件會被鎖住，規矩檔）
const PAGE_TURN = { ...T.motion.pageTurn.spring }, SNAP_BACK = { ...T.motion.snapBack.spring };
const TURN_RATIO = T.gesture.pageTurnRatio, TURN_FLICK = T.gesture.swapFlick, EDGE_FOLLOW = T.gesture.swapEdge;
const BAR_ACT = T.gesture.barActivate, PULL_OPEN = T.gesture.pullOpenRatio, FLICK = T.gesture.flick;
// 目錄面板的進度與高度（模組層級的 shared value）；開、收由手勢排回 JS（模組層級的函式，規矩檔）
const dirP = dirPanel.p, dirH = dirPanel.h;
const dirBegin = () => dirPanel.begin();
const dirSettle = (toOpen: boolean, v: number) => dirPanel.settle(toOpen, v);

// 換張要用的東西（紙給的）：整張紙的平移（hx）、已經決定換頁正在滑過去（turning）、左右兩張的 id（沒有＝''）、螢幕寬、減少動態、能不能撥；
// 滑到定位叫 onTurn（新的那張不淡入）、減少動態直接換叫 onOpenNote
export type Swipe = {
  hx: SharedValue<number>; turning: SharedValue<number>; prevId: string; nextId: string; winW: number; calm: boolean; enabled: boolean;
  onTurn: (id: string) => void; onOpenNote: (id: string) => void;
};
type BarProps = { notes: Note[]; cur: Note; name: string; swipe: Swipe; onOpen: () => void; onStep: (d: -1 | 1) => void; onAdd: () => void };
// 現在這張紙交過來的列內容；show＝要不要畫（鍵盤、輸入框、排順序時收起）
let slot: { props: BarProps; show: boolean } | null = null;
const subs = new Set<() => void>();
export const barSlot = {
  set(props: BarProps, show: boolean) { slot = { props, show }; subs.forEach(f => f()); },
};
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const snap = () => slot;

// 根畫面畫在紙與目錄面板之間：紙換了列不重掛，目錄升起時蓋過它
export function PageBarHost() {
  const s = useSyncExternalStore(subscribe, snap, snap);
  if (!s?.show) return null;
  return <PageBar {...s.props} />;
}

export function PageBar({ notes, cur, name, swipe, onOpen, onStep, onAdd }: BarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  // worklet 只抓拆出來的值，不抓整包 swipe
  const { hx, turning, prevId, nextId, winW, calm, enabled, onTurn, onOpenNote } = swipe;
  const [peekId, setPeek] = useState(''); // 手指拖過半頁時先顯示的那張（見下面 useAnimatedReaction）；要在換張的 worklet 之前宣告
  // B4：左右撥＝在頁點那幾張之間換，手指往左＝換到右邊那張。整張紙跟著手指走，旁邊那張的預覽（Paper 的 PagePreview）同時從另一邊滑進來；
  // 到頭（沒有下一張）只跟三成、放手彈回（多米 11/02 定甲：不跳提示）。撥過半頁或往那邊甩：整頁滑過去，滑到定位才換紙；不夠就彈回。
  // 減少動態：照樣跟手，放手直接換，交給整張淡入
  const swapMove = (e: { translationX: number }) => {
    'worklet';
    if (turning.value) return;
    const x = e.translationX, end = x < 0 ? !nextId : !prevId;
    hx.value = end ? x * EDGE_FOLLOW : x;
  };
  const swapEnd = (e: { translationX: number; velocityX: number; canceled: boolean }) => {
    'worklet';
    if (turning.value) return;
    const d = e.translationX < 0 ? 1 : -1, id = d > 0 ? nextId : prevId;
    const go = !e.canceled && !!id && (Math.abs(e.translationX) > winW * TURN_RATIO || -d * e.velocityX > TURN_FLICK);
    if (!go) { hx.value = calm ? 0 : withSpring(0, { velocity: e.velocityX, ...SNAP_BACK }); return; }
    scheduleOnRN(setPeek, id); // 甩一下就換：放手那一刻名字和頁點就換過去

    if (calm) { scheduleOnRN(onOpenNote, id); return; }
    turning.value = 1;
    hx.value = withSpring(-d * winW, { velocity: e.velocityX, ...PAGE_TURN }, done => { if (done) scheduleOnRN(onTurn, id); });
  };
  // 手指動超過 barActivate 那一刻看方向定案——橫的多＝換張（整頁跟手）、往上＝拉出目錄（面板跟手）、往下＝不做事。
  // 以前標題區是「往下拉」和「左右撥」兩個手勢比誰的門檻先到，斜著動結果靠運氣；現在只有一個手勢、看角度，不會兩個都成立
  const barMode = useSharedValue(0); // 0 沒定、1 換張、2 開目錄、3 往下（不做事）
  const pan = usePanGesture({
    enabled,
    minDistance: BAR_ACT,
    onActivate: () => { 'worklet'; barMode.value = 0; },
    onUpdate: e => {
      'worklet';
      // 方向在手指真的動夠了那一刻定（成立那一刻的位移有的平台還是 0）
      if (barMode.value === 0) {
        const ax = Math.abs(e.translationX), ay = Math.abs(e.translationY);
        if (Math.max(ax, ay) < BAR_ACT) return;
        barMode.value = ax >= ay ? 1 : e.translationY < 0 ? 2 : 3;
        if (barMode.value === 2) scheduleOnRN(dirBegin);
      }
      if (barMode.value === 1) swapMove(e);
      // 扣掉起步那段，面板才從 0 開始跟，不會先跳一格
      else if (barMode.value === 2) dirP.value = Math.min(1, Math.max(0, (-e.translationY - BAR_ACT) / dirH.value));
    },
    onDeactivate: e => {
      'worklet';
      if (barMode.value === 1) swapEnd(e);
      else if (barMode.value === 2) {
        const open = !e.canceled && (-e.translationY > dirH.value * PULL_OPEN || -e.velocityY > FLICK);
        scheduleOnRN(dirSettle, open, -e.velocityY / dirH.value);
      }
      barMode.value = 0;
    },
  });
  // 名字和頁點跟著手指換（2026-11-03 多米：要等快一秒才變，太久）：紙拖過半頁（放手就會換的那條線）就先寫成那張，
  // 不等滑到定位、新的那張紙掛好（換紙要重畫整張紙，那段才是慢的）。每張紙有自己的 hx，換好之後新紙的 hx 是 0，這裡跟著回到 cur
  useAnimatedReaction(
    () => (hx.value < -winW * TURN_RATIO ? nextId : hx.value > winW * TURN_RATIO ? prevId : ''),
    (id, old) => { if (id !== old) scheduleOnRN(setPeek, id); },
    [hx, winW, prevId, nextId],
  );
  const shown = (peekId && notes.find(x => x.id === peekId)) || cur;
  const shownName = shown === cur ? name : shown.title.trim() || '未命名';
  const at = Math.max(0, notes.indexOf(cur));
  const onA11y = (e: AccessibilityActionEvent) => {
    const a = e.nativeEvent.actionName;
    if (a === 'increment') onStep(1);
    else if (a === 'decrement') onStep(-1);
    else if (a === 'activate') onOpen();
  };
  return (
    // 鍵盤升起、輸入框開著時淡出，回來時淡進，跟鍵盤同一個時鐘（以前右下 ＋ 的做法）
    <Animated.View entering={FadeIn.duration(KB)} exiting={FadeOut.duration(KB)}
      style={[st.wrap, { bottom: insets.bottom + T.space.s }]} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <View style={st.capWrap} collapsable={false}>
          <Glass style={st.cap} interactive>
            <Pressable onPress={onOpen} style={({ pressed }) => [st.capHit, pressed && { opacity: T.motion.pressDim }]}
              accessible accessibilityRole="adjustable" accessibilityLabel={`全部清單，現在是「${name}」`}
              accessibilityValue={notes.length > 1 ? { text: `第 ${at + 1} 張，共 ${notes.length} 張` } : undefined}
              accessibilityHint="點兩下打開目錄；上下滑換張"
              accessibilityActions={[{ name: 'activate' }, { name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={onA11y}>
              <Sym name="square.grid.2x2" size={18} color={c.textPrimary} />
              <View style={st.mid}>
                <Text style={[st.name, { color: c.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={T.font.listTitleMaxScale}>{shownName}</Text>
                {/* 頁點：左右滑換得到的那幾張，現在這張是長條（以前在標題下面） */}
                {notes.length > 1 && (
                  <View style={st.dots}>
                    {notes.map(x => (
                      <View key={x.id} style={[st.dot, { backgroundColor: c.textSecondary }, x === shown ? st.dotOn : st.dotOff]} />
                    ))}
                  </View>
                )}
              </View>
              <Sym name="chevron.up" size={13} color={c.textSecondary} weight="semibold" />
            </Pressable>
          </Glass>
        </View>
      </GestureDetector>
      <Glass style={[st.add, T.shape.shadowStrong]} tint={c.accent} interactive>
        <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel="新增一行"
          style={({ pressed }) => [st.addHit, pressed && { opacity: T.motion.pressDim }]}>
          <Sym name="plus" size={24} color={c.fabIcon} weight="semibold" />
        </Pressable>
      </Glass>
    </Animated.View>
  );
}

const BAR = T.shape.barH;
const st = StyleSheet.create({
  wrap: { position: 'absolute', left: T.space.l, right: T.space.l, flexDirection: 'row', alignItems: 'center', gap: T.space.m },
  capWrap: { flex: 1 },
  cap: { height: BAR, borderRadius: T.shape.pill(BAR) },
  capHit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: T.space.m, paddingHorizontal: T.space.l },
  mid: { flex: 1, minWidth: 0, alignItems: 'center', gap: T.space.xs },
  name: { ...T.font.subheadBold },
  dots: { flexDirection: 'row', alignItems: 'center', gap: T.shape.handleGap },
  dot: { height: T.shape.handleH, borderRadius: T.shape.pill(T.shape.handleH) },
  dotOn: { width: T.shape.handleSeg },
  dotOff: { width: T.shape.handleH, opacity: T.shape.handleOff },
  add: { width: BAR, height: BAR, borderRadius: T.shape.pill(BAR) },
  addHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

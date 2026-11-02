// 紙最下面的一條（2026-11-02 多米選甲「Safari 式底部列」）：「去別張紙」全部集中在這裡，跟紙上的行完全分開。
// 為什麼（第一性原理，審查紀錄 2026-11-02 晚）：之前左右撥換張在標題區和行下面的空白處，行上的左右滑卻是劃掉／刪除——
// 同一個方向兩個意思、界線看不見；往下拉開目錄在螢幕最上面，單手搆不到、又挨著系統的通知中心。iOS 自己的做法是「內容上的手勢只對內容，
// 去別的地方的手勢放在專用的列上」（Safari 在底部網址列左右滑換分頁、往上滑看全部分頁）。
// - 左邊玻璃膠囊：目錄圖示＋這張的名字＋頁點。在膠囊上左右滑＝換張（整張紙跟著手指走，跟以前一樣）；往上滑或點一下＝目錄從下面升起
// - 右邊茄紫玻璃圓鈕：＋ 記一行（核心動作，固定在右下角，跟以前同一個位置）
// 手勢由 Paper 傳進來（要用到整頁平移、目錄面板的進度）。VoiceOver：膠囊是「可調整」的元素，上下滑換張、點兩下開目錄
// 2026-11-03 多米：左右換張時 ＋ 要一直停在原地。以前底部列畫在紙裡面，換張＝整張紙重掛，列跟著重掛（玻璃重新長出來會閃一下）；
// 改成紙只把「列要用的東西」交給 barSlot，列本身由根畫面的 PageBarHost 畫在紙外面，換張時列從頭到尾是同一個、不動
import { useSyncExternalStore } from 'react';
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Note } from '../lib/model';
import { T, useColors } from '../lib/tokens';
import { Glass } from './Glass';
import { Sym } from './Sym';

const KB = T.motion.keyboardFollow.duration;

type BarProps = { notes: Note[]; cur: Note; name: string; pan: PanGesture; onOpen: () => void; onStep: (d: -1 | 1) => void; onAdd: () => void };
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

export function PageBar({ notes, cur, name, pan, onOpen, onStep, onAdd }: {
  notes: Note[]; cur: Note; name: string;
  pan: PanGesture;
  onOpen: () => void; onStep: (d: -1 | 1) => void; onAdd: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
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
                <Text style={[st.name, { color: c.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={T.font.listTitleMaxScale}>{name}</Text>
                {/* 頁點：左右滑換得到的那幾張，現在這張是長條（以前在標題下面） */}
                {notes.length > 1 && (
                  <View style={st.dots}>
                    {notes.map(x => (
                      <View key={x.id} style={[st.dot, { backgroundColor: c.textSecondary }, x === cur ? st.dotOn : st.dotOff]} />
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

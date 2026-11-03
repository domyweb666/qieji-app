// 紙最下面浮著的那顆：右下茄紫玻璃圓鈕 ＋ 記一行（核心動作，固定在右下角）。
// 2026-11-04 切換清單改版（多米）：左下的膠囊（名字＋頁點、左右滑換張、點一下開目錄）拿掉，換張改成點左上清單名升起的切換清單（app/switch）；
// 左右滑換張一起拿掉（多米選）。
// ＋ 畫在紙外面（根畫面的 PageBarHost，2026-11-03 多米：換張時 ＋ 要一直停在原地）：紙只把要用的東西交給 barSlot，換張時這顆從頭到尾是同一個、不重掛
import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T, useColors } from '../lib/tokens';
import { Glass } from './Glass';
import { Sym } from './Sym';

const KB = T.motion.keyboardFollow.duration;

type BarProps = { onAdd: () => void };
// 現在這張紙交過來的內容；show＝要不要畫（鍵盤、輸入框、排順序、紙的彈出選單開著時收起）
let slot: { props: BarProps; show: boolean } | null = null;
const subs = new Set<() => void>();
export const barSlot = {
  set(props: BarProps, show: boolean) { slot = { props, show }; subs.forEach(f => f()); },
};
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const snap = () => slot;

// 根畫面畫在紙與目錄面板之間：紙換了不重掛，目錄升起時蓋過它
export function PageBarHost() {
  const s = useSyncExternalStore(subscribe, snap, snap);
  if (!s?.show) return null;
  return <PageBar {...s.props} />;
}

export function PageBar({ onAdd }: BarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    // 鍵盤升起、輸入框開著時淡出，回來時淡進，跟鍵盤同一個時鐘
    <Animated.View entering={FadeIn.duration(KB)} exiting={FadeOut.duration(KB)}
      style={[st.wrap, { bottom: insets.bottom + T.space.s }]} pointerEvents="box-none">
      {/* 不加 shadowStrong（2026-11-03 效能）：玻璃照圓角裁邊（overflow hidden），陰影本來就畫不出來，只是讓 iOS 每一格另外算一次形狀；
          液態玻璃自己有立體感，不透明版 Glass 會自己帶陰影 */}
      <Glass style={st.add} tint={c.accent} interactive>
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
  wrap: { position: 'absolute', right: T.space.l },
  add: { width: BAR, height: BAR, borderRadius: T.shape.pill(BAR) },
  addHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

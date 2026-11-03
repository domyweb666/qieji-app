// 網頁／Android 預覽用：iOS 的標題列由系統畫，其他平台用這條代替。
// GlassBtn（圓鈕）和 Fab（右下角茄紫＋）清單頁也用，讓兩頁的按鈕長得一樣。
// 2026-11-02 系統元件化：三顆按鈕都是系統材質（Glass）——iOS 26 液態玻璃、舊 iOS 霧面、減少透明度時照舊不透明。
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';
import { T, useColors } from '../lib/tokens';
import { Glass } from './Glass';
import { Sym } from './Sym';

export const native = Platform.OS === 'ios';

export function WebTop({ title, left, right }: { title?: string; left?: ReactNode; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  if (native) return null;
  return (
    <View style={{ paddingTop: insets.top + T.space.s, paddingHorizontal: T.space.gutter }}>
      <View style={s.topRow}>{left}<View style={{ flex: 1 }} />{right}</View>
      {title ? <Text style={[s.large, { color: c.textPrimary }]}>{title}</Text> : null}
    </View>
  );
}

export function GlassBtn({ icon, onPress, label, on, children }: {
  icon?: SFSymbol; onPress: () => void; label: string; on?: boolean; children?: ReactNode;
}) {
  const c = useColors();
  return (
    <Glass style={s.btn} interactive>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
        style={({ pressed }) => [s.hit, pressed && { opacity: T.motion.pressDim }]}>
        {icon ? <Sym name={icon} size={20} color={on ? c.accent : c.textPrimary} /> : children}
      </Pressable>
    </Glass>
  );
}

export function Fab({ onPress, label }: { onPress: () => void; label: string }) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  return (
    // 鍵盤升起、輸入框開著時淡出，回來時淡進（2026-11-01 第二輪 K3；之前是瞬間出現、消失）。
    // 時長跟鍵盤同一個時鐘（keyboardFollow）：＋ 的進出是鍵盤那個事件的一部分，不另外排一個 150 的時鐘（2-4 做法 6；
    // 多米 2026-11-01 真機說 ✓ 之後 ＋ 回來的時間點不對）。減少動態本來就是淡入淡出
    <Animated.View entering={FadeIn.duration(T.motion.keyboardFollow.duration)} exiting={FadeOut.duration(T.motion.keyboardFollow.duration)}
      style={[s.fabWrap, { bottom: insets.bottom + T.space.m }]}>
      {/* 茄紫上色的玻璃（像系統的 glassProminent 按鈕）；不透明版照舊實心茄紫＋重陰影 */}
      <Glass style={[s.fab, T.shape.shadowStrong]} tint={c.accent} interactive>
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
          style={({ pressed }) => [s.hit, pressed && { opacity: T.motion.pressDim }]}>
          <Sym name="plus" size={26} color={c.fabIcon} weight="semibold" />
        </Pressable>
      </Glass>
    </Animated.View>
  );
}

// 標題列右上的茄紫 ✓：在行裡打字時收鍵盤（多米 2026-11-01，參考 iOS 提醒事項：沒在打字只有 ⋯，打字時 ⋯ 右邊多一顆藍色 ✓）。
// 跟右下 ＋ 同一個顏色、同一個時鐘：鍵盤升起那一刻 ＋ 淡出、✓ 淡進，收起時反過來，accent 一個畫面還是只出現一次。
// 收起用短的淡出（fade）：⋯ 同時用鍵盤的時鐘滑回最右邊，✓ 要先讓開，不然 ⋯ 會滑進一顆還沒淡完的 ✓ 底下（多米 2026-11-01）
export function DoneBtn({ onPress, label }: { onPress: () => void; label: string }) {
  const c = useColors();
  return (
    <Animated.View entering={FadeIn.duration(T.motion.keyboardFollow.duration)} exiting={FadeOut.duration(T.motion.fade)}>
      <Glass style={s.btn} tint={c.accent} interactive>
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
          style={({ pressed }) => [s.hit, pressed && { opacity: T.motion.pressDim }]}>
          <Sym name="checkmark" size={20} color={c.fabIcon} weight="semibold" />
        </Pressable>
      </Glass>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', minHeight: T.shape.hitMin },
  large: { ...T.font.title, marginTop: T.space.xs },
  btn: { width: T.shape.hitMin, height: T.shape.hitMin, borderRadius: T.shape.pill(T.shape.hitMin) },
  hit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fabWrap: { position: 'absolute', right: T.space.gutter },
  fab: { width: T.shape.fab, height: T.shape.fab, borderRadius: T.shape.pill(T.shape.fab) },
});

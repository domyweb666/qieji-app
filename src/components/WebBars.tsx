// 網頁／Android 預覽用：iOS 的標題列由系統畫，其他平台用這條代替。
// GlassBtn（奶油白圓鈕）和 Fab（右下角茄紫＋）清單頁也用，讓兩頁的按鈕長得一樣。
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';
import { T, useColors } from '../lib/tokens';
import { Sym } from './Sym';

export const native = Platform.OS === 'ios';

export function WebTop({ title, left, right }: { title?: string; left?: ReactNode; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  if (native) return null;
  return (
    <View style={{ paddingTop: insets.top + T.space.s, paddingHorizontal: T.space.l }}>
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
    <Pressable onPress={onPress} accessibilityLabel={label}
      style={({ pressed }) => [s.btn, { backgroundColor: c.surface }, pressed && { opacity: T.motion.pressDim }]}>
      {icon ? <Sym name={icon} size={20} color={on ? c.accent : c.textPrimary} /> : children}
    </Pressable>
  );
}

export function Fab({ onPress, label }: { onPress: () => void; label: string }) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityLabel={label}
      style={({ pressed }) => [s.fab, { backgroundColor: c.accent, bottom: insets.bottom + T.space.m }, pressed && { opacity: T.motion.pressDim }]}>
      <Sym name="plus" size={26} color={c.fabIcon} weight="semibold" />
    </Pressable>
  );
}

const s = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', minHeight: T.shape.hitMin },
  large: { ...T.font.largeTitle, marginTop: T.space.xs },
  btn: { width: T.shape.hitMin, height: T.shape.hitMin, borderRadius: T.shape.pill(T.shape.hitMin), alignItems: 'center', justifyContent: 'center',
    ...T.shape.shadowSoft },
  fab: { position: 'absolute', right: T.space.l, width: T.shape.fab, height: T.shape.fab, borderRadius: T.shape.pill(T.shape.fab),
    alignItems: 'center', justifyContent: 'center', ...T.shape.shadowStrong },
});

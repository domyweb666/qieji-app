// 網頁／Android 預覽用：iOS 的標題列由系統畫，其他平台用這條代替。
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';
import { C, F } from '../lib/theme';
import { Sym } from './Sym';

export const native = Platform.OS === 'ios';

export function WebTop({ title, left, right }: { title?: string; left?: ReactNode; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  if (native) return null;
  return (
    <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16 }}>
      <View style={s.topRow}>{left}<View style={{ flex: 1 }} />{right}</View>
      {title ? <Text style={s.large}>{title}</Text> : null}
    </View>
  );
}

export function GlassBtn({ icon, onPress, label, on }: { icon: SFSymbol; onPress: () => void; label: string; on?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={({ pressed }) => [s.btn, pressed && { opacity: 0.6 }]}>
      <Sym name={icon} size={20} color={on ? C.tint : C.label} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  large: { fontSize: F.largeTitle, fontWeight: '700', color: C.label, marginTop: 4 },
  btn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
});

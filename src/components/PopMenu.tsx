// 右上角 ⋯ 打開的選單：從按鈕下方彈出一張白色卡片，後面整個畫面變暗，選單上的字才看得清楚。
// 左邊圖示、右邊文字；inline 的子選單攤開成一個區塊，區塊之間用粗一點的分隔。
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { C, F } from '../lib/theme';
import type { Act } from './Acts';
import { Sym } from './Sym';

export function PopMenu({ acts, top, onClose }: { acts: Act[]; top: number; onClose: () => void }) {
  // 一般項目連在一起算一個區塊，inline 子選單自成一個區塊
  const groups: Act[][] = [];
  for (const a of acts.filter(x => !x.hidden)) {
    if (a.sub && a.inline) {
      const rows = a.sub.filter(x => !x.hidden);
      if (rows.length) groups.push(rows, []);
    } else {
      if (!groups.length) groups.push([]);
      groups[groups.length - 1].push(a);
    }
  }
  const sections = groups.filter(g => g.length);
  const pick = (a: Act) => { onClose(); a.fn?.(); };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={[StyleSheet.absoluteFill, st.dim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="關閉選單" />
      </Animated.View>
      <Animated.View entering={ZoomIn.duration(170)} exiting={ZoomOut.duration(120)} style={[st.card, { top }]}>
        {sections.map((g, gi) => (
          <View key={gi} style={gi > 0 && st.gap}>
            {g.map((a, i) => (
              <Pressable key={a.label} onPress={() => pick(a)} accessibilityRole="menuitem"
                style={({ pressed }) => [st.row, i > 0 && st.sep, pressed && { backgroundColor: C.fill }]}>
                <View style={st.icon}>{a.icon ? <Sym name={a.icon} size={19} color={a.destructive ? C.red : C.label} /> : null}</View>
                <Text style={[st.label, a.destructive && { color: C.red }]}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  dim: { backgroundColor: 'rgba(0,0,0,0.32)' },
  card: { position: 'absolute', right: 10, width: 250, backgroundColor: C.card, borderRadius: 16, overflow: 'hidden',
    transformOrigin: 'top right',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  gap: { borderTopWidth: 7, borderTopColor: C.groupedBg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingHorizontal: 16 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  icon: { width: 24, alignItems: 'center' },
  label: { flex: 1, fontSize: F.body, color: C.label },
});

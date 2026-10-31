// 右上角 ⋯ 打開的選單：從按鈕下方彈出一張白色卡片，後面整個畫面變暗，選單上的字才看得清楚。
// 左邊圖示、右邊文字；inline 的子選單攤開成一個區塊，區塊之間用粗一點的分隔。
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { T, useColors } from '../lib/tokens';
import type { Act } from './Acts';
import { Sym } from './Sym';

// header：放在最上面的一塊（紙的 ⋯ 選單把九個色塊放這裡），跟底下的項目用粗分隔隔開
export function PopMenu({ acts, top, header, onClose }: { acts: Act[]; top: number; header?: ReactNode; onClose: () => void }) {
  const c = useColors();
  // 減少動態：放大縮小改成淡入淡出
  const calm = useReducedMotion();
  const cardIn = calm ? FadeIn.duration(T.motion.fade) : ZoomIn.duration(T.motion.menuPop.in);
  const cardOut = calm ? FadeOut.duration(T.motion.fade) : ZoomOut.duration(T.motion.menuPop.out);
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
      <Animated.View entering={FadeIn.duration(T.motion.menuBackdrop.in)} exiting={FadeOut.duration(T.motion.menuBackdrop.out)}
        style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="關閉選單" />
      </Animated.View>
      <Animated.View entering={cardIn} exiting={cardOut} style={[st.card, { backgroundColor: c.surface, top }]}>
        {header}
        {sections.map((g, gi) => (
          <View key={gi} style={(gi > 0 || !!header) && [st.gap, { borderTopColor: c.page }]}>
            {g.map((a, i) => (
              <Pressable key={a.label} onPress={() => pick(a)} accessibilityRole="menuitem"
                style={({ pressed }) => [st.row, i > 0 && [st.sep, { borderTopColor: c.separator }], pressed && { backgroundColor: c.pressedFill }]}>
                <View style={st.icon}>{a.icon ? <Sym name={a.icon} size={19} color={a.destructive ? c.danger : c.textPrimary} /> : null}</View>
                <Text style={[st.label, { color: a.destructive ? c.danger : c.textPrimary }]}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  card: { position: 'absolute', right: T.space.m, width: 250, borderRadius: T.shape.radiusCard, overflow: 'hidden', // width 只用一次
    transformOrigin: 'top right', ...T.shape.shadowSoft, elevation: 12 },
  gap: { borderTopWidth: T.space.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: T.space.m, minHeight: T.shape.menuRow, paddingHorizontal: T.space.l },
  sep: { borderTopWidth: StyleSheet.hairlineWidth },
  icon: { width: T.space.xl, alignItems: 'center' },
  label: { flex: 1, ...T.font.body },
});

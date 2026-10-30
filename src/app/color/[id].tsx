// 選顏色：從清單頁的顏色圓點打開，從下方升起的面板，一格一格的色塊，點了就換、面板收起來
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CKEYS, col, type ColorKey } from '../../lib/model';
import { store, useStore } from '../../lib/store';
import { T, useColors, useNoteColors } from '../../lib/tokens';

export default function ColorSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useStore();
  const c = useColors();
  const n = s.notes.find(x => x.id === id);

  function pick(k: ColorKey) {
    if (n && n.color !== k) { n.color = k; n.updated = Date.now(); store.change(); }
    router.back();
  }

  return (
    <View style={[st.wrap, { backgroundColor: c.surface }]}>
      <Text style={[st.title, { color: c.textSecondary }]}>選擇顏色</Text>
      <View style={st.grid}>
        {CKEYS.map(k => <Cell key={k} k={k} on={n?.color === k} onPress={() => pick(k)} />)}
      </View>
    </View>
  );
}

function Cell({ k, on, onPress }: { k: ColorKey; on: boolean; onPress: () => void }) {
  const c = useColors();
  const nc = useNoteColors(k);
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`${col(k).hue}（${col(k).name}）`} accessibilityState={{ selected: on }}
      style={({ pressed }) => [st.cell, pressed && { opacity: T.motion.pressDim }]}>
      <View style={[st.box, { borderColor: on ? c.accent : 'transparent' }]}>
        <View style={[st.swatch, { backgroundColor: nc.hd, borderColor: c.dotOutline }]} />
      </View>
      <Text style={[st.hue, { color: on ? c.accent : c.textPrimary }]} numberOfLines={1}>{col(k).hue}</Text>
      <Text style={[st.veg, { color: c.textSecondary }]} numberOfLines={1}>{col(k).name}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: { paddingTop: T.space.xl, paddingBottom: T.space.xl, paddingHorizontal: T.space.l },
  title: { ...T.font.subheadBold, marginBottom: T.space.m, marginLeft: T.space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // 一排五格：色塊，下面標顏色和蔬菜名
  cell: { width: '20%', alignItems: 'center', marginBottom: T.space.m },
  box: { width: '100%', aspectRatio: 1, padding: T.shape.swatchPad, borderRadius: T.shape.radiusCard, borderWidth: T.shape.borderSelected },
  swatch: { flex: 1, borderRadius: T.shape.radiusSwatch, borderWidth: T.shape.borderCard },
  hue: { marginTop: T.space.xs, ...T.font.footnoteBold },
  veg: { ...T.font.caption },
});

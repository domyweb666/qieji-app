// 選顏色：從筆記頁的 ⋯ 選單打開，從下方升起的面板，一格一格的色塊，點了就換、面板收起來
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CKEYS, col } from '../../lib/model';
import { store, useStore } from '../../lib/store';
import { C, F } from '../../lib/theme';

export default function ColorSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useStore();
  const n = s.notes.find(x => x.id === id);

  function pick(k: (typeof CKEYS)[number]) {
    if (n && n.color !== k) { n.color = k; n.updated = Date.now(); store.change(); }
    router.back();
  }

  return (
    <View style={st.wrap}>
      <Text style={st.title}>選擇顏色</Text>
      <View style={st.grid}>
        {CKEYS.map(k => {
          const on = n?.color === k;
          return (
            <Pressable key={k} onPress={() => pick(k)} accessibilityRole="button"
              accessibilityLabel={col(k).name} accessibilityState={{ selected: on }}
              style={({ pressed }) => [st.cell, on && st.cellOn, pressed && { opacity: 0.6 }]}>
              <View style={[st.swatch, { backgroundColor: col(k).hd }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { paddingTop: 26, paddingBottom: 36, paddingHorizontal: 18, backgroundColor: C.card },
  title: { fontSize: F.subhead, fontWeight: '600', color: C.secondary, marginBottom: 14, marginLeft: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // 一排五格
  cell: { width: '20%', aspectRatio: 1, padding: 5, borderRadius: 16, borderWidth: 3, borderColor: 'transparent' },
  cellOn: { borderColor: C.tint },
  swatch: { flex: 1, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
});

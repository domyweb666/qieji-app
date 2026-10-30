// 備忘錄式的分組列表：每組一個標題、一張白色圓角卡片，卡片裡是一行一則筆記。
// 每則只顯示顏色點和清單名稱，不放時間、進度、內容預覽（資訊太多看了會焦慮）
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { col, groupNotes, label, type Note, type SortKey } from '../lib/model';
import { C, F } from '../lib/theme';

export function NoteSections({ notes, sort, trash, onPress }: {
  notes: Note[]; sort: SortKey; trash: boolean; onPress: (n: Note) => void;
}) {
  return (
    <>
      {groupNotes(notes, { sort, trash }).map(sec => (
        <View key={sec.title}>
          <Text style={s.head}>{sec.title}</Text>
          <View style={s.card}>
            {sec.notes.map((n, i) => (
              <Pressable key={n.id} onPress={() => onPress(n)} style={({ pressed }) => pressed && { backgroundColor: C.fill }}>
                <View style={[s.row, i > 0 && s.sep]}>
                  <View style={[s.dot, { backgroundColor: col(n.color).hd }]} />
                  <Text style={s.title} numberOfLines={1}>{label(n)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

export const listStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingBottom: 120 },
});

const s = StyleSheet.create({
  head: { fontSize: F.title3, fontWeight: '700', color: C.label, marginTop: 22, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: C.card, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 12, paddingRight: 16, marginLeft: 16 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { flex: 1, fontSize: F.body, color: C.label },
});

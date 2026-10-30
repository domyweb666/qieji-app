// 分組列表：每組一個小標籤，底下一則筆記一張圓角卡片（跟清單頁裡一行一張卡片是同一個樣子）。
// 每則只顯示顏色點和清單名稱，不放時間、進度、內容預覽（資訊太多看了會焦慮）
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { col, groupNotes, label, type Note } from '../lib/model';
import { C, F } from '../lib/theme';

export function NoteSections({ notes, trash, onPress }: {
  notes: Note[]; trash: boolean; onPress: (n: Note) => void;
}) {
  return (
    <>
      {groupNotes(notes, { trash }).map(sec => (
        <View key={sec.title}>
          <Text style={s.head}>{sec.title}</Text>
          <View style={s.cards}>
            {sec.notes.map(n => (
              <Pressable key={n.id} onPress={() => onPress(n)} style={({ pressed }) => [s.card, pressed && { backgroundColor: C.fill }]}>
                <View style={[s.dot, { backgroundColor: col(n.color).hd }]} />
                <Text style={s.title} numberOfLines={1}>{label(n)}</Text>
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
  head: { fontSize: F.footnote, fontWeight: '700', color: C.secondary, letterSpacing: 1.5, marginTop: 24, marginBottom: 10, marginLeft: 4 },
  cards: { gap: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.separator },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { flex: 1, fontSize: F.body, color: C.label },
});

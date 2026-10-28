// 備忘錄式的分組列表：每組一個標題、一張白色圓角卡片，卡片裡是一行一則筆記
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { col, groupNotes, label, preview, rowDate, type Note, type SortKey } from '../lib/model';
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
                  <View style={s.titleLine}>
                    <View style={[s.dot, { backgroundColor: col(n.color).hd }]} />
                    <Text style={s.title} numberOfLines={1}>{label(n)}</Text>
                  </View>
                  <Text style={s.sub} numberOfLines={1}>
                    {rowDate(n.updated)}{'　'}{preview(n)}
                  </Text>
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
  row: { paddingVertical: 11, paddingRight: 16, marginLeft: 16 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  title: { flex: 1, fontSize: F.headline, fontWeight: '600', color: C.label },
  sub: { marginTop: 2, fontSize: F.subhead, color: C.secondary },
});

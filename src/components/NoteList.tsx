// 分組列表：每組一個小標籤，底下一則筆記一張圓角卡片（跟清單頁裡一行一張卡片是同一個樣子）。
// 每則只顯示顏色點和清單名稱，不放時間、進度、內容預覽（資訊太多看了會焦慮）
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { groupNotes, label, type Note } from '../lib/model';
import { T, useColors, useNoteColors } from '../lib/tokens';

export function NoteSections({ notes, trash, onPress }: {
  notes: Note[]; trash: boolean; onPress: (n: Note) => void;
}) {
  const c = useColors();
  const secs = groupNotes(notes, { trash });
  // 首頁沒有任何釘選時只剩「其他」一組，這兩個字沒東西可對照，不印（06-首次體驗 ❓2）
  const showHead = trash || secs.some(sec => sec.title === '已釘選');
  return (
    <>
      {secs.map(sec => (
        <View key={sec.title}>
          {showHead && <Text style={[s.head, { color: c.textSecondary }]}>{sec.title}</Text>}
          <View style={s.cards}>
            {sec.notes.map(n => <Card key={n.id} n={n} onPress={() => onPress(n)} />)}
          </View>
        </View>
      ))}
    </>
  );
}

function Card({ n, onPress }: { n: Note; onPress: () => void }) {
  const c = useColors();
  const nc = useNoteColors(n.color);
  return (
    <Pressable onPress={onPress}
      style={({ pressed }) => [s.card, { backgroundColor: pressed ? c.pressedFill : c.surface, borderColor: c.separator }]}>
      {/* 色點本身的對比不夠（7/9 不到 3:1），靠描邊；名字永遠在旁邊，色點只是裝飾 */}
      <View style={[s.dot, { backgroundColor: nc.hd, borderColor: c.dotOutline }]} />
      <Text style={[s.title, { color: c.textPrimary }]} numberOfLines={1}>{label(n)}</Text>
    </Pressable>
  );
}

export const listStyles = StyleSheet.create({
  wrap: { paddingHorizontal: T.space.l, paddingBottom: 120 }, // 只用一次：底部留白讓最後一張能捲上來
});

const DOT = 10;
const s = StyleSheet.create({
  head: { ...T.font.sectionHead, marginTop: T.space.xl, marginBottom: T.space.m, marginLeft: T.space.xs },
  cards: { gap: T.space.s },
  card: { flexDirection: 'row', alignItems: 'center', gap: T.space.m, minHeight: T.shape.cardMin, paddingVertical: T.space.m, paddingHorizontal: T.space.l,
    borderRadius: T.shape.radiusCard, borderWidth: T.shape.borderCard },
  dot: { width: DOT, height: DOT, borderRadius: T.shape.pill(DOT), borderWidth: T.shape.borderCard },
  title: { flex: 1, ...T.font.body },
});

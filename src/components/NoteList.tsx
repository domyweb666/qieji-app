// 分組列表（最近刪除用）：照 iOS 設定 app 的「分組清單」——每組一塊圓角底、上面一行小標題、組裡一行一則，用從字起算的髮絲線隔開
// （2026-11-02 系統元件化：之前一則一張卡片）。每則只顯示顏色點和清單名稱，不放時間、進度、內容預覽（資訊太多看了會焦慮）
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { groupNotes, label, type Note } from '../lib/model';
import { T, useColors, useNoteColors } from '../lib/tokens';

export function NoteSections({ notes, trash, onPress }: { notes: Note[]; trash: boolean; onPress: (n: Note) => void }) {
  const secs = groupNotes(notes, { trash });
  // 首頁沒有任何釘選時只剩「其他」一組，這兩個字沒東西可對照，不印（06-首次體驗 ❓2）
  const showHead = trash || secs.some(sec => sec.title === '已釘選');
  return (
    <>
      {secs.map(sec => (
        <ListGroup key={sec.title} title={showHead ? sec.title : undefined}>
          {sec.notes.map(n => <NoteRow key={n.id} n={n} onPress={() => onPress(n)} />)}
        </ListGroup>
      ))}
    </>
  );
}

// 一組：小標題＋圓角底，裡面的列之間自動加髮絲線
export function ListGroup({ title, children }: { title?: string; children: ReactNode[] }) {
  const c = useColors();
  return (
    <View style={s.section}>
      {title ? <Text style={[s.head, { color: c.textSecondary }]}>{title}</Text> : null}
      <View style={[s.group, { backgroundColor: c.surface }]}>
        {children.map((ch, i) => (
          <View key={i}>
            {i > 0 && <View style={[s.sep, { backgroundColor: c.separator }]} />}
            {ch}
          </View>
        ))}
      </View>
    </View>
  );
}

// 一列：左邊顏色點、中間字、右邊可以放小字（刪掉的行放它原本在哪張紙）
export function ListRow({ dot, text, detail, lines = 1, onPress, a11y }: {
  dot: string; text: string; detail?: string; lines?: number; onPress: () => void; a11y?: string;
}) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y ?? text}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: c.pressedFill }]}>
      {/* 色點本身的對比不夠（7/9 不到 3:1），靠描邊；名字永遠在旁邊，色點只是裝飾 */}
      <View style={[s.dot, { backgroundColor: dot, borderColor: c.dotOutline }]} />
      <Text style={[s.title, { color: c.textPrimary }]} numberOfLines={lines}>{text}</Text>
      {detail ? <Text style={[s.detail, { color: c.textSecondary }]} numberOfLines={1}>{detail}</Text> : null}
    </Pressable>
  );
}

function NoteRow({ n, onPress }: { n: Note; onPress: () => void }) {
  const nc = useNoteColors(n.color);
  return <ListRow dot={nc.hd} text={label(n)} onPress={onPress} />;
}

export const listStyles = StyleSheet.create({
  wrap: { paddingHorizontal: T.space.l, paddingBottom: 120 }, // 只用一次：底部留白讓最後一張能捲上來
});

const DOT = 10;
const s = StyleSheet.create({
  section: { marginTop: T.space.xl },
  head: { ...T.font.footnote, marginBottom: T.space.s, marginLeft: T.space.l },
  group: { borderRadius: T.shape.radiusMenu, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: T.space.m, minHeight: T.shape.hitMin, paddingVertical: T.space.m, paddingHorizontal: T.space.l },
  // 髮絲線從字起算（左內距＋色點＋間距），跟設定 app 一樣不切到色點
  sep: { height: StyleSheet.hairlineWidth, marginLeft: T.space.l + DOT + T.space.m },
  dot: { width: DOT, height: DOT, borderRadius: T.shape.pill(DOT), borderWidth: T.shape.borderCard },
  title: { flex: 1, ...T.font.body },
  detail: { ...T.font.footnote, maxWidth: '35%' }, // maxWidth 只用一次
});

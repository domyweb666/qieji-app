// 「最近刪除」：從目錄面板最下面那列進來。上面是刪掉的清單（一張一張），下面是各張紙刪掉的行（帶那張紙的名字）。
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { menuItems, type Act } from '../components/Acts';
import { Empty } from '../components/Empty';
import { listStyles, NoteSections } from '../components/NoteList';
import { ui } from '../components/Overlay';
import { PopMenu } from '../components/PopMenu';
import { GlassBtn, WebTop } from '../components/WebBars';
import { dropNotes, label, markRestored, TRASH_DAYS, unbinItem, visibleNotes, type Item, type Note } from '../lib/model';
import { store, useStore } from '../lib/store';
import { T, useColors, useNoteColors } from '../lib/tokens';


export default function Trash() {
  const s = useStore();
  const c = useColors();
  const title = '最近刪除';
  const notes = visibleNotes(s, { trash: true, filter: 'all', q: '', sort: s.sort });
  // 刪掉的行：只看還在的紙（紙本身被刪的，行跟著那張紙）。新刪的在前面
  const lines = s.notes.filter(n => !n.deleted).flatMap(n => n.bin.map(it => ({ n, it }))).sort((a, b) => (b.it.at || 0) - (a.it.at || 0));
  const total = notes.length + lines.length;
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  // 點一則的選單（2026-11-01 多米定 A1 全部自繪）：跟紙、目錄同一張卡（PopMenu），錨在按下去的位置，太靠下就往上推到放得下
  const [menu, setMenu] = useState<{ acts: Act[]; top: number } | null>(null);
  function openMenu(acts: Act[], y: number) {
    const h = T.shape.menuRow * acts.length + T.space.xs * (acts.length - 1) + T.space.s * 2;
    setMenu({ acts, top: Math.max(insets.top, Math.min(y, winH - insets.bottom - h)) });
  }
  function onPress(n: Note, y: number) {
    openMenu([
      { label: '還原', icon: 'arrow.uturn.backward', fn: () => { markRestored(n); store.change(); ui.toast('已還原'); } },
      { label: '永久刪除', icon: 'trash', destructive: true, fn: () => { dropNotes(s, x => x === n, Date.now()); store.change(); } },
    ], y);
  }
  function onPressLine(n: Note, it: Item, y: number) {
    openMenu([
      { label: `還原到「${label(n)}」`, icon: 'arrow.uturn.backward', fn: () => { unbinItem(n, it.id); n.updated = Date.now(); store.change(); ui.toast('已還原'); } },
      { label: '永久刪除', icon: 'trash', destructive: true, fn: () => { n.bin = n.bin.filter(x => x !== it); store.change(); } },
    ], y);
  }
  const acts: Act[] = [{
    label: `清空最近刪除（${total}）`, icon: 'trash', destructive: true,
    fn: () => ui.confirm('永久刪除這裡的所有清單和行？', () => {
      dropNotes(s, n => n.deleted, Date.now());
      s.notes.forEach(n => { n.bin = []; });
      store.change();
    }),
  }];

  return (
    <View style={{ flex: 1, backgroundColor: c.page }} collapsable={false}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={listStyles.wrap}>
        <Stack.Title large>{title}</Stack.Title>
        {total > 0 && (
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="選單">{menuItems(acts)}</Stack.Toolbar.Menu>
          </Stack.Toolbar>
        )}
        <WebTop title={title} left={<GlassBtn icon="chevron.left" label="返回" onPress={() => router.back()} />}
          right={total > 0 ? <GlassBtn icon="ellipsis" label="選單" onPress={() => openMenu(acts, insets.top + T.shape.hitMin + T.space.m)} /> : undefined} />

        {/* 30 天自動清接上後的版本（06 首次體驗 3-3）：講規則、不在每則上顯示剩幾天（那是壓力來源） */}
        {total > 0 && <Text style={[st.note, { color: c.textSecondary }]}>{`放滿 ${TRASH_DAYS} 天會自動清掉。點一下可以還原或永久刪除。`}</Text>}
        {notes.length > 0 && <NoteSections notes={notes} trash onPress={onPress} />}
        {lines.length > 0 && (
          <View>
            <Text style={[st.head, { color: c.textSecondary }]}>刪掉的行</Text>
            <View style={st.cards}>
              {lines.map(({ n, it }) => <LineCard key={it.id} n={n} it={it} onPress={y => onPressLine(n, it, y)} />)}
            </View>
          </View>
        )}
        {total === 0 && <Empty lines={['最近刪除是空的', `刪掉的清單和行會先放在這裡 ${TRASH_DAYS} 天，之後自動清掉`]} />}
      </ScrollView>
      {menu && <PopMenu acts={menu.acts} top={menu.top} onClose={() => setMenu(null)} />}
    </View>
  );
}

// 一行一張卡片，跟上面刪掉的清單同一個樣子；右邊小字是它原本在哪張紙
function LineCard({ n, it, onPress }: { n: Note; it: Item; onPress: (y: number) => void }) {
  const c = useColors();
  const nc = useNoteColors(n.color);
  return (
    <Pressable onPress={e => onPress(e.nativeEvent.pageY)} accessibilityRole="button" accessibilityLabel={`${it.t}，原本在「${label(n)}」`}
      style={({ pressed }) => [st.card, { backgroundColor: pressed ? c.pressedFill : c.surface, borderColor: c.separator }]}>
      <View style={[st.dot, { backgroundColor: nc.hd, borderColor: c.dotOutline }]} />
      <Text style={[st.text, { color: c.textPrimary }]} numberOfLines={2}>{it.t}</Text>
      <Text style={[st.from, { color: c.textSecondary }]} numberOfLines={1}>{label(n)}</Text>
    </Pressable>
  );
}

const DOT = 12;
const st = StyleSheet.create({
  note: { ...T.font.footnote, marginTop: T.space.s, marginLeft: T.space.xs },
  head: { ...T.font.sectionHead, marginTop: T.space.xl, marginBottom: T.space.m, marginLeft: T.space.xs },
  cards: { gap: T.space.s },
  card: { flexDirection: 'row', alignItems: 'center', gap: T.space.m, minHeight: T.shape.cardMin, paddingVertical: T.space.m, paddingHorizontal: T.space.l,
    borderRadius: T.shape.radiusCard, borderWidth: T.shape.borderCard },
  dot: { width: DOT, height: DOT, borderRadius: T.shape.pill(DOT), borderWidth: T.shape.borderCard },
  text: { flex: 1, ...T.font.body },
  from: { ...T.font.footnote, maxWidth: '35%' }, // maxWidth 只用一次
});

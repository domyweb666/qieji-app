// 筆記列表：上方沒有標題，右上角搜尋和選單（「最近刪除」在選單裡），下面是筆記（釘選的在最上面），右下角＋。
// 打開 app 時，如果上次離開時還開著某則筆記，直接回到那則（從左緣往右滑回到這裡）。
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { menuItems, showActs, type Act } from '../components/Acts';
import { Empty } from '../components/Empty';
import { WebWarmUp } from '../components/ListWeb';
import { listStyles, NoteSections } from '../components/NoteList';
import { Sym } from '../components/Sym';
import { GlassBtn, native, WebTop } from '../components/WebBars';
import { exportData, importData } from '../lib/backup';
import { CKEYS, col, SORTS, visibleNotes, type ColorKey, type Note, type SortKey } from '../lib/model';
import { newNote, store, useStore } from '../lib/store';
import { C, F } from '../lib/theme';

let restored = false; // 每次打開 app 只回到上次的筆記一次

export default function Home() {
  const s = useStore();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<ColorKey | 'all'>('all');
  const [q, setQ] = useState('');
  const searching = !!q.trim();

  useEffect(() => {
    if (restored) return;
    restored = true;
    const last = store.last && store.s.notes.find(n => n.id === store.last && !n.deleted);
    if (last) router.push({ pathname: '/note/[id]', params: { id: last.id, restore: '1' } });
  }, []);

  // 釘選的是最常看的，排在列表最上面的「已釘選」分組（分組在 groupNotes 做），不藏進方塊裡
  const notes = visibleNotes(s, { trash: false, filter, q, sort: s.sort });
  const trashed = s.notes.filter(n => n.deleted).length;
  const open = (n: Note) => router.push({ pathname: '/note/[id]', params: { id: n.id } });

  // 只有清單：按＋直接開一張新清單
  const add = () => {
    const n = newNote(filter !== 'all' ? filter : 'purple', 'check');
    router.push({ pathname: '/note/[id]', params: { id: n.id, fresh: '1' } });
  };

  const menu: Act[] = [
    { label: '依顏色篩選', icon: 'circle.grid.2x2', sub: [
      { label: '全部', on: filter === 'all', fn: () => setFilter('all') },
      ...CKEYS.map(k => ({ label: col(k).name, on: filter === k, fn: () => setFilter(k) })),
    ] },
    { label: '排序方式', icon: 'arrow.up.arrow.down', sub: (Object.keys(SORTS) as SortKey[]).map(k => ({
      label: SORTS[k], on: s.sort === k, fn: () => { s.sort = k; store.change(); },
    })) },
    { label: '備份', inline: true, sub: [
      { label: '匯出備份', icon: 'square.and.arrow.up', fn: exportData },
      { label: '匯入備份', icon: 'square.and.arrow.down', fn: importData },
    ] },
    { label: trashed ? `最近刪除（${trashed}）` : '最近刪除', icon: 'trash', fn: () => router.push('/trash') },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }} collapsable={false}>
      <WebWarmUp />
      {native && (
        <Stack.SearchBar placement="integratedButton" allowToolbarIntegration={false} hideWhenScrolling={false} placeholder="搜尋筆記"
          onChangeText={e => setQ(e.nativeEvent.text)} onCancelButtonPress={() => setQ('')} />
      )}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="選單">{menuItems(menu)}</Stack.Toolbar.Menu>
      </Stack.Toolbar>

      <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
        contentContainerStyle={[listStyles.wrap, { paddingTop: native ? 4 : 0 }]}>
        <WebTop right={<GlassBtn icon="ellipsis" label="選單" onPress={() => showActs(menu, '選單')} />} />
        {!native && (
          <View style={st.webSearch}>
            <Sym name="magnifyingglass" size={17} color={C.secondary} />
            <TextInput value={q} onChangeText={setQ} placeholder="搜尋筆記" placeholderTextColor={C.placeholder} style={st.webSearchInput} />
          </View>
        )}

        {filter !== 'all' && (
          <Pressable style={st.chip} onPress={() => setFilter('all')} accessibilityLabel="取消顏色篩選">
            <View style={[st.chipDot, { backgroundColor: col(filter).hd }]} />
            <Text style={st.chipText}>只顯示{col(filter).name}</Text>
            <Sym name="xmark.circle.fill" size={16} color={C.tertiary} />
          </Pressable>
        )}

        {notes.length
          ? <NoteSections notes={notes} sort={s.sort} trash={false} onPress={open} />
          : (searching || filter !== 'all')
            ? <Empty lines={['找不到符合的筆記']} />
            : <Empty lines={['還沒有筆記', '點右下角的＋，寫下第一個想法']} />}
      </ScrollView>

      <Pressable onPress={add} accessibilityLabel="新增"
        style={({ pressed }) => [st.fab, { bottom: insets.bottom + 14 }, pressed && { transform: [{ scale: 0.94 }] }]}>
        <Sym name="plus" size={26} color="#fff" weight="semibold" />
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  chip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16,
    backgroundColor: C.card, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipDot: { width: 9, height: 9, borderRadius: 4.5 },
  chipText: { fontSize: F.subhead, color: C.label },
  fab: { position: 'absolute', right: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: C.tint,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#3B2050', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  webSearch: { height: 40, borderRadius: 12, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, marginBottom: 12 },
  webSearchInput: { flex: 1, fontSize: F.body, color: C.label },
});

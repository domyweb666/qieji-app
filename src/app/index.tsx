// 筆記列表：上方沒有標題，右上角搜尋和選單，兩張方塊（釘選、最近刪除），下面依時間分組的筆記，右下角＋。
// 打開 app 時，如果上次離開時還開著某則筆記，直接回到那則（從左緣往右滑回到這裡）。
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { menuItems, showActs, type Act } from '../components/Acts';
import { EmptyArt } from '../components/Breathe';
import { listStyles, NoteSections } from '../components/NoteList';
import { ui } from '../components/Overlay';
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

  const all = visibleNotes(s, { trash: false, filter, q, sort: s.sort });
  // 釘選的筆記收在「釘選」方塊裡，列表只放其他的（搜尋時全部都找）
  const notes = searching ? all : all.filter(n => !n.pinned);
  const live = s.notes.filter(n => !n.deleted);
  const pinned = live.filter(n => n.pinned).length;
  const trashed = s.notes.length - live.length;
  const open = (n: Note) => router.push({ pathname: '/note/[id]', params: { id: n.id } });

  const compose = (type: Note['type']) => {
    const n = newNote(filter !== 'all' ? filter : 'purple', type);
    router.push({ pathname: '/note/[id]', params: { id: n.id, fresh: '1' } });
  };
  const add = () => ui.sheet([
    { label: '記事', fn: () => compose('text') },
    { label: '清單', fn: () => compose('check') },
  ], '新增');

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
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }} collapsable={false}>
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

        {!searching && (
          <View style={st.tiles}>
            <Tile bg="#F09C5E" icon="pin.fill" count={pinned} label="釘選" onPress={() => router.push('/folder/pinned')} />
            <Tile bg="#8E8E93" icon="trash.fill" count={trashed} label="最近刪除" onPress={() => router.push('/folder/trash')} />
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
            ? <EmptyArt art="search" lines={['找不到符合的筆記']} />
            : <EmptyArt art="basket" lines={['還沒有筆記', '點右下角的＋，寫下第一個想法']} />}
      </ScrollView>

      <Pressable onPress={add} accessibilityLabel="新增"
        style={({ pressed }) => [st.fab, { bottom: insets.bottom + 14 }, pressed && { transform: [{ scale: 0.94 }] }]}>
        <Sym name="plus" size={26} color="#fff" weight="semibold" />
      </Pressable>
    </View>
  );
}

// 提醒事項那種彩色方塊：左上圖示、右上數字、左下名稱
function Tile({ bg, icon, count, label, onPress }: {
  bg: string; icon: 'pin.fill' | 'trash.fill'; count: number; label: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={`${label} ${count}`}
      style={({ pressed }) => [st.tile, { backgroundColor: bg }, pressed && { opacity: 0.8 }]}>
      <View style={st.tileTop}>
        <View style={st.tileIcon}><Sym name={icon} size={16} color={bg} /></View>
        <Text style={st.tileCount}>{count}</Text>
      </View>
      <Text style={st.tileLabel}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 12, marginTop: 4 },
  tile: { flex: 1, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, minHeight: 92, justifyContent: 'space-between' },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  tileIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  tileCount: { fontSize: F.title, fontWeight: '700', color: '#fff', lineHeight: 34 },
  tileLabel: { fontSize: F.headline, fontWeight: '700', color: '#fff' },
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

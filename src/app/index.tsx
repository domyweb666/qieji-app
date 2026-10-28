// 首頁：大標題、茄子田／釘選／最近刪除三張卡片磚、依時間分組的筆記，底部是搜尋與新增
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ColorValue } from 'react-native';
import { menuItems, showActs, type Act } from '../components/Acts';
import { EmptyArt } from '../components/Breathe';
import { listStyles, NoteSections } from '../components/NoteList';
import { Sym } from '../components/Sym';
import { GlassBtn, native, WebBottom, WebTop } from '../components/WebBars';
import { exportData, importData } from '../lib/backup';
import { CKEYS, col, SORTS, visibleNotes, weekGarden, type ColorKey, type Note, type SortKey } from '../lib/model';
import { newNote, store, useStore } from '../lib/store';
import { ART, C, F } from '../lib/theme';

export default function Home() {
  const s = useStore();
  const [filter, setFilter] = useState<ColorKey | 'all'>('all');
  const [q, setQ] = useState('');
  const searching = !!q.trim();

  const notes = visibleNotes(s, { trash: false, filter, q, sort: s.sort });
  const live = s.notes.filter(n => !n.deleted);
  const pinned = live.filter(n => n.pinned).length;
  const trashed = s.notes.length - live.length;
  const week = weekGarden(s);

  const compose = () => {
    const n = newNote(filter !== 'all' ? filter : 'purple');
    router.push({ pathname: '/note/[id]', params: { id: n.id, fresh: '1' } });
  };
  const open = (n: Note) => router.push({ pathname: '/note/[id]', params: { id: n.id } });

  const acts: Act[] = [
    { label: '茄子田', icon: 'leaf', fn: () => router.push('/garden') },
    { label: '排序方式', icon: 'arrow.up.arrow.down', sub: (Object.keys(SORTS) as SortKey[]).map(k => ({
      label: SORTS[k], on: s.sort === k, fn: () => { s.sort = k; store.change(); },
    })) },
    { label: '依顏色篩選', icon: 'circle.grid.2x2', sub: [
      { label: '全部', on: filter === 'all', fn: () => setFilter('all') },
      ...CKEYS.map(k => ({ label: col(k).name, on: filter === k, fn: () => setFilter(k) })),
    ] },
    { label: '備份', inline: true, sub: [
      { label: '匯出備份', icon: 'square.and.arrow.up', fn: exportData },
      { label: '匯入備份', icon: 'square.and.arrow.down', fn: importData },
    ] },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }} collapsable={false}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
        contentContainerStyle={listStyles.wrap}>
        <Stack.Title large>茄記</Stack.Title>
        {native && <Stack.SearchBar placeholder="搜尋" onChangeText={e => setQ(e.nativeEvent.text)} onCancelButtonPress={() => setQ('')} />}
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="選單">{menuItems(acts)}</Stack.Toolbar.Menu>
        </Stack.Toolbar>
        <Stack.Toolbar placement="bottom">
          <Stack.Toolbar.SearchBarSlot />
          <Stack.Toolbar.Spacer />
          <Stack.Toolbar.Button icon="square.and.pencil" accessibilityLabel="新增" onPress={compose} />
        </Stack.Toolbar>

        <WebTop title="茄記" right={<GlassBtn icon="ellipsis" label="選單" onPress={() => showActs(acts, '選單')} />} />

        {!searching && (
          <View style={st.tiles}>
            <Pressable style={({ pressed }) => [st.tile, st.wide, pressed && st.pressed]} onPress={() => router.push('/garden')}>
              <View style={[st.badge, { backgroundColor: C.tintSoft }]}>
                <Image source={ART.egg.src} style={{ width: 20, height: 20 / ART.egg.r }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.tileTitle}>本週茄子田</Text>
                <Text style={st.tileSub}>{week.f} 朵花　·　{week.eggs.length} 顆茄子</Text>
              </View>
              <Sym name="chevron.right" size={14} color={C.tertiary} weight="semibold" />
            </Pressable>
            <Tile icon="pin.fill" color={C.tint} count={pinned} label="釘選" onPress={() => router.push('/folder/pinned')} />
            <Tile icon="trash.fill" color={C.gray} count={trashed} label="最近刪除" onPress={() => router.push('/folder/trash')} />
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
            : <EmptyArt art="basket" lines={['菜籃還是空的', '點右下角的筆，寫下第一個想法']} />}
      </ScrollView>

      <WebBottom>
        <View style={st.webSearch}>
          <Sym name="magnifyingglass" size={17} color={C.secondary} />
          <TextInput value={q} onChangeText={setQ} placeholder="搜尋" placeholderTextColor={C.placeholder} style={st.webSearchInput} />
        </View>
        <GlassBtn icon="square.and.pencil" label="新增" onPress={compose} />
      </WebBottom>
    </View>
  );
}

function Tile({ icon, color, count, label, onPress }: {
  icon: 'pin.fill' | 'trash.fill'; color: ColorValue; count: number; label: string; onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [st.tile, pressed && st.pressed]} onPress={onPress}>
      <View style={st.tileTop}>
        <View style={[st.badge, { backgroundColor: color }]}><Sym name={icon} size={15} color="#fff" /></View>
        <Text style={st.count}>{count}</Text>
      </View>
      <Text style={st.tileLabel}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  tile: { flexBasis: '45%', flexGrow: 1, backgroundColor: C.card, borderRadius: 14, padding: 12 },
  wide: { flexBasis: '100%', flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.7 },
  badge: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  tileTitle: { fontSize: F.headline, fontWeight: '600', color: C.label },
  tileSub: { fontSize: F.subhead, color: C.secondary, marginTop: 1 },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontSize: F.title, fontWeight: '700', color: C.label },
  tileLabel: { fontSize: F.subhead, fontWeight: '600', color: C.secondary, marginTop: 8 },
  chip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16,
    backgroundColor: C.card, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipDot: { width: 9, height: 9, borderRadius: 4.5 },
  chipText: { fontSize: F.subhead, color: C.label },
  webSearch: { flex: 1, height: 44, borderRadius: 22, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  webSearchInput: { flex: 1, fontSize: F.body, color: C.label },
});

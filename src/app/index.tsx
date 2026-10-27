// 筆記列表（也是垃圾桶、搜尋結果）
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyArt } from '../components/Breathe';
import { Icon } from '../components/Icon';
import { ui } from '../components/Overlay';
import { exportData, importData } from '../lib/backup';
import { CKEYS, col, label, listDate, SORTS, uid, visibleNotes, type ColorKey, type Note, type SortKey } from '../lib/model';
import { store, useStore } from '../lib/store';
import { ART, T } from '../lib/theme';

export default function ListScreen() {
  const s = useStore();
  const insets = useSafeAreaInsets();
  const [trash, setTrash] = useState(false);
  const [filter, setFilter] = useState<ColorKey | 'all'>('all');
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const listRef = useRef<FlatList<Note>>(null);

  const notes = visibleNotes(s, { trash, filter, q, sort: s.sort });
  const setSort = (k: SortKey) => { s.sort = k; store.change(); };
  const toTop = () => listRef.current?.scrollToOffset({ offset: 0, animated: false });

  function newNote(type: 'text' | 'check') {
    const n: Note = { id: uid(), type, title: '', body: '', items: [], color: filter !== 'all' ? filter : 'purple',
      pinned: false, deleted: false, created: Date.now(), updated: Date.now(), b: false };
    s.notes.push(n);
    store.change();
    router.push({ pathname: '/note/[id]', params: { id: n.id, fresh: '1' } });
  }

  function onRow(n: Note) {
    if (!trash) return router.push({ pathname: '/note/[id]', params: { id: n.id } });
    ui.sheet([
      { label: '還原', fn: () => { n.deleted = false; store.change(); ui.toast('已還原'); } },
      { label: '永久刪除', danger: true, fn: () => { s.notes = s.notes.filter(x => x !== n); store.change(); } },
    ], label(n));
  }

  function menu() {
    if (trash) {
      const cnt = s.notes.filter(n => n.deleted).length;
      return ui.sheet([
        { label: '回到茄記', fn: () => setTrash(false) },
        { label: `清空垃圾桶（${cnt}）`, danger: true, fn: () => ui.confirm('永久刪除垃圾桶裡的所有筆記？', () => {
          s.notes = s.notes.filter(n => !n.deleted); store.change();
        }) },
      ]);
    }
    ui.sheet([
      { label: '茄子田', fn: () => router.push('/garden') },
      { label: '匯出備份', fn: exportData },
      { label: '匯入備份', fn: importData },
      { label: `共 ${s.notes.filter(n => !n.deleted).length} 則筆記`, fn: () => {} },
    ], '選單');
  }

  const empty = trash
    ? <EmptyArt art="sleep" lines={['垃圾桶是空的', '茄子在睡覺']} />
    : (q.trim() || filter !== 'all')
      ? <EmptyArt art="search" lines={['找不到符合的筆記']} />
      : <EmptyArt art="basket" lines={['菜籃還是空的', '點右下角的茄子，寫下第一個想法']} />;

  return (
    <View style={s_.root}>
      <View style={[s_.head, { paddingTop: insets.top }]}>
        <View style={s_.bar}>
          {searching
            ? <TextInput style={s_.q} value={q} onChangeText={setQ} placeholder="搜尋筆記" autoFocus
                clearButtonMode="while-editing" returnKeyType="search" autoCorrect={false} />
            : <Text style={s_.h1}>{trash ? '垃圾桶' : '茄記'}</Text>}
          <Pressable style={s_.ib} onPress={() => ui.sheet([
            { label: '全部', on: filter === 'all', fn: () => setFilter('all') },
            ...CKEYS.map(k => ({ label: col(k).name, dot: col(k).hd, on: filter === k, fn: () => setFilter(k) })),
          ], '依顏色篩選')} accessibilityLabel="依顏色篩選">
            <ColorGrid filter={filter} />
          </Pressable>
          <Pressable style={s_.ib} onPress={menu} accessibilityLabel="選單"><Icon name="dots" color={T.text} /></Pressable>
        </View>
        <Pressable style={s_.sortbar} onPress={() => ui.sheet(
          (Object.keys(SORTS) as SortKey[]).map(k => ({ label: SORTS[k], on: s.sort === k, fn: () => setSort(k) })), '排序方式')}>
          <Text style={s_.sortText}>{SORTS[s.sort]} ▾</Text>
        </Pressable>
        {filter !== 'all' && <Text style={s_.filterTag}>只顯示{col(filter).name}　·　點右上色塊切換</Text>}
      </View>

      <FlatList
        ref={listRef}
        data={notes}
        keyExtractor={n => n.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 6, paddingBottom: insets.bottom + 150 }}
        ListEmptyComponent={empty}
        renderItem={({ item: n }) => {
          const c = col(n.color);
          return (
            <Pressable onPress={() => onRow(n)}
              style={({ pressed }) => [s_.row, { backgroundColor: c.bg, borderLeftColor: c.hd }, pressed && { opacity: 0.85 }]}>
              <Text style={s_.rt} numberOfLines={2}>{label(n)}</Text>
              <View style={s_.rd}>
                {n.pinned ? <Text style={{ fontSize: 15 }}>📌</Text> : null}
                {n.type === 'check' ? <Icon name="check" size={20} color="#555" /> : null}
                <Text style={s_.rdText}>{listDate(n.updated)}</Text>
              </View>
            </Pressable>
          );
        }}
      />

      {!trash && (
        <Pressable style={({ pressed }) => [s_.fab, { bottom: insets.bottom + 72 }, pressed && { transform: [{ scale: 0.92 }] }]}
          accessibilityLabel="新增筆記"
          onPress={() => ui.sheet([{ label: '文字', fn: () => newNote('text') }, { label: '清單', fn: () => newNote('check') }], '新增')}>
          <View pointerEvents="none">
            <Image source={ART['face-happy'].src} style={{ width: 58, height: 58 / ART['face-happy'].r }} />
          </View>
          <View pointerEvents="none" style={s_.plus}><Icon name="plus" size={16} color="#fff" /></View>
        </Pressable>
      )}

      <View style={[s_.bnav, { paddingBottom: insets.bottom }]}>
        <NavBtn icon="notes" on={!trash && !searching} label="筆記"
          onPress={() => { setTrash(false); setSearching(false); setQ(''); toTop(); }} />
        <NavBtn icon="search" on={searching} label="搜尋"
          onPress={() => { if (searching) setQ(''); setSearching(!searching); }} />
        <NavBtn icon="trash" on={trash} label="垃圾桶" onPress={() => { setTrash(!trash); toTop(); }} />
        <NavBtn icon="menu" on={false} label="選單" onPress={menu} />
      </View>
    </View>
  );
}

function NavBtn({ icon, on, label, onPress }: { icon: 'notes' | 'search' | 'trash' | 'menu'; on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable style={s_.navBtn} onPress={onPress} accessibilityLabel={label}>
      <Icon name={icon} size={28} color={on ? T.egg : T.navOff} />
    </Pressable>
  );
}

function ColorGrid({ filter }: { filter: ColorKey | 'all' }) {
  if (filter !== 'all') return <View style={{ width: 26, height: 26, borderRadius: 3, backgroundColor: col(filter).hd }} />;
  return (
    <View style={s_.grid}>
      {['#8E6AAE', '#EECF5E', '#8DAF62', '#F09C5E'].map(c => <View key={c} style={{ width: 12, height: 12, backgroundColor: c }} />)}
    </View>
  );
}

const s_ = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.app },
  head: { backgroundColor: T.bar, borderBottomWidth: 1, borderBottomColor: T.line },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 6, paddingRight: 6, paddingBottom: 6, paddingLeft: 16, minHeight: 56 },
  h1: { flex: 1, fontSize: 26, fontWeight: '600', color: T.egg, letterSpacing: 1 },
  q: { flex: 1, minWidth: 0, fontSize: 18, backgroundColor: T.card, borderWidth: 1, borderColor: T.line, borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 10, color: T.text },
  ib: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  grid: { width: 26, height: 26, flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  sortbar: { marginHorizontal: 8, marginBottom: 8, backgroundColor: T.card, borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 9 },
  sortText: { color: T.muted, textAlign: 'center', fontSize: 18 },
  filterTag: { fontSize: 14, color: T.muted, textAlign: 'center', marginTop: -2, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 68, marginBottom: 8, borderRadius: 12, borderLeftWidth: 6,
    paddingVertical: 10, paddingRight: 12, paddingLeft: 14, gap: 10,
    shadowColor: '#3C281E', shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  rt: { flex: 1, fontSize: 21, lineHeight: 27, color: T.text },
  rd: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rdText: { fontSize: 16, color: '#555' },
  fab: { position: 'absolute', right: 14, width: 66, height: 86, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#3C1E50', shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 5 } },
  plus: { position: 'absolute', right: 0, bottom: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: T.stem,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#fff' },
  bnav: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: T.bar, borderTopWidth: 1, borderTopColor: T.line },
  navBtn: { flex: 1, height: 60, alignItems: 'center', justifyContent: 'center' },
});

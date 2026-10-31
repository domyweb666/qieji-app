// 清單列表：上方沒有標題，右上角搜尋和選單（「最近刪除」在選單裡），下面是清單（釘選的在最上面），右下角＋。
// 打開 app 時，如果上次離開時還開著某張清單，直接回到那張（從左緣往右滑回到這裡）。
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { menuItems, showActs, type Act } from '../components/Acts';
import { Empty } from '../components/Empty';
import { listStyles, NoteSections } from '../components/NoteList';
import { Sym } from '../components/Sym';
import { Fab, GlassBtn, native, WebTop } from '../components/WebBars';
import { exportData, importData } from '../lib/backup';
import { CKEYS, col, SORTS, visibleNotes, type ColorKey, type Note, type SortKey } from '../lib/model';
import { newNote, store, useStore } from '../lib/store';
import { T, useColors, useNoteColors } from '../lib/tokens';

let restored = false; // 每次打開 app 只回到上次的清單一次

export default function Home() {
  const s = useStore();
  const c = useColors();
  const [filter, setFilter] = useState<ColorKey | 'all'>('all');
  const [q, setQ] = useState('');
  const searching = !!q.trim();
  const chipColor = useNoteColors(filter === 'all' ? 'purple' : filter);

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
    // 篩選與讀屏統一用一般色名（紫色…），不用蔬菜名（詞彙表 #10）
    { label: '依顏色篩選', icon: 'circle.grid.2x2', sub: [
      { label: '全部', on: filter === 'all', fn: () => setFilter('all') },
      // 系統選單放不了自己畫的色塊（圖片在手機上不顯示），用彩色圓點 emoji 當色塊，它是文字一定會出現
      ...CKEYS.map(k => ({ label: `${col(k).dot} ${col(k).hue}`, on: filter === k, fn: () => setFilter(k) })),
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
    <View style={{ flex: 1, backgroundColor: c.page }} collapsable={false}>
      {native && (
        <Stack.SearchBar placement="integratedButton" allowToolbarIntegration={false} hideWhenScrolling={false} placeholder="搜尋清單"
          onChangeText={e => setQ(e.nativeEvent.text)} onCancelButtonPress={() => setQ('')} />
      )}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="選單">{menuItems(menu)}</Stack.Toolbar.Menu>
      </Stack.Toolbar>

      <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
        contentContainerStyle={[listStyles.wrap, { paddingTop: native ? T.space.xs : 0 }]}>
        <WebTop right={<GlassBtn icon="ellipsis" label="選單" onPress={() => showActs(menu, '選單')} />} />
        {!native && (
          <View style={[st.webSearch, { backgroundColor: c.surface }]}>
            <Sym name="magnifyingglass" size={17} color={c.textSecondary} />
            <TextInput value={q} onChangeText={setQ} placeholder="搜尋清單" placeholderTextColor={c.textMuted}
              style={[st.webSearchInput, { color: c.textPrimary }]} />
          </View>
        )}

        {filter !== 'all' && (
          // chip 本身不到 44 高，用 hitSlop 把點擊範圍撐出去
          <Pressable style={[st.chip, { backgroundColor: c.surface }]} hitSlop={T.space.s} onPress={() => setFilter('all')}
            accessibilityLabel="取消顏色篩選">
            <View style={[st.chipDot, { backgroundColor: chipColor.hd, borderColor: c.dotOutline }]} />
            <Text style={[st.chipText, { color: c.textPrimary }]}>只顯示{col(filter).hue}</Text>
            <Sym name="xmark.circle.fill" size={16} color={c.textMuted} />
          </Pressable>
        )}

        {/* 三種空說的話分開（06-首次體驗 3-1）：找不到→帶他剛打的字；自己清掉→說東西去哪了；第一次→邀請 */}
        {notes.length
          ? <NoteSections notes={notes} trash={false} onPress={open} />
          : searching
            ? <Empty lines={[`找不到含「${q.trim()}」的清單`]} />
            : filter !== 'all'
              ? <Empty lines={[`沒有${col(filter).hue}的清單`]} />
              : trashed
                ? <Empty lines={['沒有清單了', '刪掉的在選單的「最近刪除」裡，還拿得回來']} />
                : <Empty lines={['還沒有清單', '點右下角的 ＋ 開一張']} />}
      </ScrollView>

      <Fab onPress={add} label="新增清單" />
    </View>
  );
}

const CHIP_DOT = 9;
const st = StyleSheet.create({
  chip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: T.space.s, marginTop: T.space.l,
    borderRadius: T.shape.radiusCard, paddingVertical: T.space.s, paddingHorizontal: T.space.m },
  chipDot: { width: CHIP_DOT, height: CHIP_DOT, borderRadius: T.shape.pill(CHIP_DOT), borderWidth: T.shape.borderCard },
  chipText: { ...T.font.subhead },
  webSearch: { height: T.shape.hitMin, borderRadius: T.shape.radiusCard, flexDirection: 'row', alignItems: 'center', gap: T.space.s,
    paddingHorizontal: T.space.m, marginBottom: T.space.m },
  webSearchInput: { flex: 1, ...T.font.body },
});

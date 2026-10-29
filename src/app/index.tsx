// 首頁：左右滑的三頁。往右滑是茄子田，中間是首頁（筆記），往左滑是設定。
// 首頁照提醒事項的排法：上方沒有標題，右上角搜尋和選單，兩張彩色方塊，下面是筆記列表，右下角＋。
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
  type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { menuItems, showActs, type Act } from '../components/Acts';
import { EmptyArt } from '../components/Breathe';
import { GardenView } from '../components/Garden';
import { listStyles, NoteSections } from '../components/NoteList';
import { ui } from '../components/Overlay';
import { Sym } from '../components/Sym';
import { GlassBtn, native, WebTop } from '../components/WebBars';
import { exportData, importData } from '../lib/backup';
import { CKEYS, col, SORTS, visibleNotes, weekGarden, type ColorKey, type Note, type SortKey } from '../lib/model';
import { newNote, store, useStore } from '../lib/store';
import { ART, C, F } from '../lib/theme';

const HOME = 1;

export default function Home() {
  const s = useStore();
  const { width: W } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pager = useRef<ScrollViewInstance>(null);
  const placed = useRef(false);
  const [page, setPage] = useState(HOME);
  const [visit, setVisit] = useState(0); // 第幾次滑到茄子田（每次滑過去茄子重新掉一次）
  const [filter, setFilter] = useState<ColorKey | 'all'>('all');
  const [q, setQ] = useState('');
  const searching = !!q.trim();
  // 網頁預覽沒有系統標題列，自己留出上方的空間
  const top = native ? 4 : insets.top + 56;

  function landOn(i: number) {
    if (i === page) return;
    setPage(i);
    if (i === 0) setVisit(v => v + 1);
  }
  function go(i: number) {
    pager.current?.scrollTo({ x: i * W, animated: true });
    landOn(i);
  }
  const onPaged = (e: NativeSyntheticEvent<NativeScrollEvent>) => landOn(Math.round(e.nativeEvent.contentOffset.x / W));

  const compose = (type: Note['type']) => {
    const n = newNote(filter !== 'all' ? filter : 'purple', type);
    router.push({ pathname: '/note/[id]', params: { id: n.id, fresh: '1' } });
  };
  const add = () => ui.sheet([
    { label: '記事', fn: () => compose('text') },
    { label: '清單', fn: () => compose('check') },
  ], '新增');

  const menu: Act[] = [
    { label: '茄子田', icon: 'leaf', fn: () => go(0) },
    { label: '設定', icon: 'gearshape', fn: () => go(2) },
    { label: '依顏色篩選', icon: 'circle.grid.2x2', sub: [
      { label: '全部', on: filter === 'all', fn: () => setFilter('all') },
      ...CKEYS.map(k => ({ label: col(k).name, on: filter === k, fn: () => setFilter(k) })),
    ] },
    { label: '排序方式', icon: 'arrow.up.arrow.down', sub: (Object.keys(SORTS) as SortKey[]).map(k => ({
      label: SORTS[k], on: s.sort === k, fn: () => { s.sort = k; store.change(); },
    })) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }} collapsable={false}>
      {native && (
        <Stack.SearchBar placement="integratedButton" allowToolbarIntegration={false} hideWhenScrolling={false} placeholder="搜尋筆記"
          onOpen={() => go(HOME)} onChangeText={e => setQ(e.nativeEvent.text)} onCancelButtonPress={() => setQ('')} />
      )}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="選單">{menuItems(menu)}</Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <View style={st.webTop}>
        <WebTop right={<GlassBtn icon="ellipsis" label="選單" onPress={() => showActs(menu, '選單')} />} />
      </View>

      <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} bounces={false}
        contentOffset={{ x: W * HOME, y: 0 }} onScroll={onPaged} scrollEventThrottle={32}
        onContentSizeChange={w => {
          // 一打開停在中間的首頁（等三頁都排好、寬度夠了才捲過去）
          if (placed.current || w < W * 3) return;
          placed.current = true;
          pager.current?.scrollTo({ x: W * HOME, animated: false });
        }}>
        <View style={{ width: W }}><GardenView visit={visit} top={top} /></View>
        <View style={{ width: W }}>
          <NotesPage s={s} q={q} setQ={setQ} searching={searching} filter={filter} setFilter={setFilter} top={top} goGarden={() => go(0)} />
        </View>
        <View style={{ width: W }}><SettingsPage s={s} top={top} /></View>
      </ScrollView>

      {/* 下方：目前在第幾頁＋新增 */}
      <View pointerEvents="box-none" style={[st.bottom, { bottom: insets.bottom + 14 }]}>
        <View style={st.dots} accessibilityLabel={`第 ${page + 1} 頁，共 3 頁`}>
          {[0, 1, 2].map(i => <View key={i} style={[st.dot, i === page && st.dotOn]} />)}
        </View>
        {page === HOME && (
          <Pressable onPress={add} accessibilityLabel="新增" style={({ pressed }) => [st.fab, pressed && { transform: [{ scale: 0.94 }] }]}>
            <Sym name="plus" size={26} color="#fff" weight="semibold" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

type S = ReturnType<typeof useStore>;

function NotesPage({ s, q, setQ, searching, filter, setFilter, top, goGarden }: {
  s: S; q: string; setQ: (v: string) => void; searching: boolean; filter: ColorKey | 'all'; setFilter: (f: ColorKey | 'all') => void;
  top: number; goGarden: () => void;
}) {
  const all = visibleNotes(s, { trash: false, filter, q, sort: s.sort });
  // 釘選的筆記收在「釘選」方塊裡，列表只放其他的（搜尋時全部都找）
  const notes = searching ? all : all.filter(n => !n.pinned);
  const live = s.notes.filter(n => !n.deleted);
  const pinned = live.filter(n => n.pinned).length;
  const trashed = s.notes.length - live.length;
  const week = weekGarden(s);
  const open = (n: Note) => router.push({ pathname: '/note/[id]', params: { id: n.id } });

  return (
    <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
      contentContainerStyle={[listStyles.wrap, { paddingTop: top }]}>
      {!native && (
        <View style={st.webSearch}>
          <Sym name="magnifyingglass" size={17} color={C.secondary} />
          <TextInput value={q} onChangeText={setQ} placeholder="搜尋筆記" placeholderTextColor={C.placeholder} style={st.webSearchInput} />
        </View>
      )}

      {!searching && (
        <View style={st.tiles}>
          <BigTile bg="#8E6AAE" count={week.eggs.length} label="本週茄子" onPress={goGarden}
            icon={<Image source={ART['egg-small'].src} style={{ width: 17, height: 17 / ART['egg-small'].r }} />} />
          <BigTile bg="#F09C5E" count={pinned} label="釘選" onPress={() => router.push('/folder/pinned')}
            icon={<Sym name="pin.fill" size={17} color="#F09C5E" />} />
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
          : <EmptyArt art="basket" lines={['菜籃還是空的', '點右下角的＋，寫下第一個想法']} />}

      {!searching && trashed > 0 && (
        <Pressable style={({ pressed }) => [st.trash, pressed && { backgroundColor: C.fill }]} onPress={() => router.push('/folder/trash')}>
          <View style={st.trashIcon}><Sym name="trash.fill" size={15} color="#fff" /></View>
          <Text style={st.trashLabel}>最近刪除</Text>
          <Text style={st.trashCount}>{trashed}</Text>
          <Sym name="chevron.right" size={14} color={C.tertiary} weight="semibold" />
        </Pressable>
      )}
    </ScrollView>
  );
}

// 提醒事項那種彩色方塊：左上圖示、右上數字、左下名稱
function BigTile({ bg, count, label, icon, onPress }: { bg: string; count: number; label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={`${label} ${count}`}
      style={({ pressed }) => [st.tile, { backgroundColor: bg }, pressed && { opacity: 0.8 }]}>
      <View style={st.tileTop}>
        <View style={st.tileIcon}>{icon}</View>
        <Text style={st.tileCount}>{count}</Text>
      </View>
      <Text style={st.tileLabel}>{label}</Text>
    </Pressable>
  );
}

function SettingsPage({ s, top }: { s: S; top: number }) {
  const sorts = Object.keys(SORTS) as SortKey[];
  return (
    <ScrollView contentContainerStyle={{ paddingTop: top, paddingHorizontal: 16, paddingBottom: 120 }}>
      <Text style={st.h1}>設定</Text>
      <Text style={st.section}>筆記排序</Text>
      <View style={st.card}>
        {sorts.map((k, i) => (
          <Pressable key={k} onPress={() => { s.sort = k; store.change(); }} accessibilityState={{ selected: s.sort === k }}
            style={({ pressed }) => pressed && { backgroundColor: C.fill }}>
            <View style={[st.row, i > 0 && st.sep]}>
              <Text style={st.rowLabel}>{SORTS[k]}</Text>
              {s.sort === k && <Sym name="checkmark" size={16} color={C.tint} weight="semibold" />}
            </View>
          </Pressable>
        ))}
      </View>
      <Text style={st.section}>備份</Text>
      <View style={st.card}>
        <SetRow icon="square.and.arrow.up" label="匯出備份" onPress={exportData} />
        <SetRow icon="square.and.arrow.down" label="匯入備份" onPress={importData} sep />
      </View>
      <Text style={st.foot}>筆記只存在這支手機裡。換手機或刪掉 app 之前，先匯出一份備份。</Text>
    </ScrollView>
  );
}

function SetRow({ icon, label, onPress, sep }: { icon: 'square.and.arrow.up' | 'square.and.arrow.down'; label: string; onPress: () => void; sep?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { backgroundColor: C.fill }}>
      <View style={[st.row, sep && st.sep]}>
        <Sym name={icon} size={18} color={C.tint} />
        <Text style={[st.rowLabel, { color: C.tint }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  webTop: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 5 },
  h1: { fontSize: F.largeTitle, fontWeight: '700', color: C.label, marginHorizontal: 4, marginTop: 4, marginBottom: 6 },
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
  trash: { marginTop: 22, backgroundColor: C.card, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11, paddingHorizontal: 14 },
  trashIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.gray, alignItems: 'center', justifyContent: 'center' },
  trashLabel: { flex: 1, fontSize: F.body, color: C.label },
  trashCount: { fontSize: F.body, color: C.secondary },
  section: { fontSize: F.footnote, color: C.secondary, marginTop: 24, marginBottom: 6, marginLeft: 16 },
  card: { backgroundColor: C.card, borderRadius: 14, overflow: 'hidden' },
  row: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 16, marginLeft: 16 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  rowLabel: { flex: 1, fontSize: F.body, color: C.label },
  foot: { fontSize: F.footnote, color: C.secondary, marginTop: 8, marginHorizontal: 16, lineHeight: 18 },
  bottom: { position: 'absolute', left: 20, right: 20, height: 58, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.tertiary },
  dotOn: { backgroundColor: C.label },
  fab: { position: 'absolute', right: 0, width: 58, height: 58, borderRadius: 29, backgroundColor: C.tint,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#3B2050', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  webSearch: { height: 40, borderRadius: 12, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, marginBottom: 12 },
  webSearchInput: { flex: 1, fontSize: F.body, color: C.label },
});

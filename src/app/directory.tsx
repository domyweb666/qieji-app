// 目錄：從紙最上面的清單名拉起來的面板（重新設計分支「紙是家」，首頁降級成這張面板）。
// 搜尋、色磚（只有顏色和名字，沒有時間、沒有預覽、沒有數字）、「＋ 新的一張」、最近刪除；篩選、排序、備份在右上 ⋯。
// 點一塊就換紙、面板收起來。帶 move 參數進來（紙上長按 →「搬到…」）就變成「把這行搬到哪張」：點一塊就搬過去。
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showActs, type Act } from '../components/Acts';
import { Empty } from '../components/Empty';
import { ui } from '../components/Overlay';
import { Sym } from '../components/Sym';
import { GlassBtn, native } from '../components/WebBars';
import { exportData, importData } from '../lib/backup';
import { CKEYS, col, label, moveItem, SORTS, visibleNotes, type ColorKey, type Note, type SortKey } from '../lib/model';
import { newNote, store, useStore } from '../lib/store';
import { T, useColors, useNoteColors } from '../lib/tokens';

const FACE_PUZZLED = require('../../assets/img/face-flat-puzzled.webp');

export default function Directory() {
  const { move } = useLocalSearchParams<{ move?: string }>();
  const s = useStore();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<ColorKey | 'all'>('all');
  const [q, setQ] = useState('');
  const searching = !!q.trim();
  const chipColor = useNoteColors(filter === 'all' ? 'purple' : filter);

  // K6（2026-11-01 第三輪）：面板收完那一刻（原生堆疊對這個畫面發 transitionEnd、closing＝true，在卸載之前）通知 store，
  // 紙上「新的一張」的輸入框就能馬上升起，不用等 700ms 的保險。事件名與 closing 旗標對過 expo-router 的 NativeStackView；網頁沒這個事件
  const navigation = useNavigation();
  useEffect(() => {
    const nav = navigation as unknown as { addListener: (ev: 'transitionEnd', cb: (e: { data?: { closing?: boolean } }) => void) => () => void };
    return nav.addListener('transitionEnd', e => { if (e.data?.closing) store.panelClosed(); });
  }, [navigation]);

  const notes = visibleNotes(s, { trash: false, filter, q, sort: s.sort });
  const pinned = notes.filter(n => n.pinned), other = notes.filter(n => !n.pinned);
  const trashed = s.notes.filter(n => n.deleted).length;
  // 兩欄：整頁左右各留 16，中間留 12
  const tileW = (width - T.space.l * 2 - T.space.m) / 2;

  // 搬行模式：來源是現在這張紙、要搬的那一行。行已經不在了（例如同時被刪）就當普通目錄用
  const from = move ? s.notes.find(n => n.id === store.last && !n.deleted) : undefined;
  const moving = from?.items.find(i => i.id === move);
  function pick(n: Note) {
    if (from && moving) {
      const name = label(n); // 先取名字：沒標題的紙搬進去後第一行會變成這一行
      if (moveItem(from, n, moving.id)) { n.updated = from.updated = Date.now(); store.change(); ui.toast(`已搬到「${name}」`); }
      router.back();
      return;
    }
    store.open(n.id);
    router.back();
  }
  // 新的一張：篩選中就用那個顏色；開完直接停在紙的輸入列（fresh）。搬行時就是搬進新的一張（紙不換）
  function add() {
    const n = newNote(filter !== 'all' ? filter : 'yellow', 'check');
    if (from && moving) { pick(n); return; }
    store.open(n.id, true);
    router.back();
  }

  const menu: Act[] = [
    // 篩選與讀屏統一用一般色名（紫色…），不用蔬菜名（詞彙表 #10）
    { label: '依顏色篩選', icon: 'circle.grid.2x2', sub: [
      { label: '全部', on: filter === 'all', fn: () => setFilter('all') },
      ...CKEYS.map(k => ({ label: `${col(k).dot} ${col(k).hue}`, on: filter === k, fn: () => setFilter(k) })),
    ] },
    { label: '排序方式', icon: 'arrow.up.arrow.down', sub: (Object.keys(SORTS) as SortKey[]).map(k => ({
      label: SORTS[k], on: s.sort === k, fn: () => { s.sort = k; store.change(); },
    })) },
    { label: '備份', inline: true, sub: [
      { label: '匯出備份', icon: 'square.and.arrow.up', fn: exportData },
      { label: '匯入備份', icon: 'square.and.arrow.down', fn: importData },
    ] },
  ];

  const tiles = (list: Note[]) => list.map(n => <Tile key={n.id} n={n} w={tileW} cur={n.id === store.last} onPress={() => pick(n)} />);

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }} collapsable={false}>
      {/* 面板是系統表單（上面有把手），iOS 不用再留狀態列的高度；網頁預覽是整頁，要留 */}
      <View style={[st.top, { paddingTop: native ? T.space.l : insets.top + T.space.s }]}>
        <View style={[st.search, { backgroundColor: c.page }]}>
          <Sym name="magnifyingglass" size={17} color={c.textSecondary} />
          <TextInput value={q} onChangeText={setQ} placeholder="搜尋清單" placeholderTextColor={c.textMuted} clearButtonMode="while-editing"
            style={[st.searchInput, { color: c.textPrimary }]} accessibilityLabel="搜尋清單" />
        </View>
        <GlassBtn icon="ellipsis" label="選單" onPress={() => showActs(menu, '選單')} />
      </View>

      <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
        contentContainerStyle={[st.body, { paddingBottom: insets.bottom + T.space.xxl }]}>
        {filter !== 'all' && (
          // chip 本身不到 44 高，用 hitSlop 把點擊範圍撐出去
          <Pressable style={[st.chip, { backgroundColor: c.page }]} hitSlop={T.space.s} onPress={() => setFilter('all')}
            accessibilityLabel="取消顏色篩選">
            <View style={[st.chipDot, { backgroundColor: chipColor.hd, borderColor: c.dotOutline }]} />
            <Text style={[st.chipText, { color: c.textPrimary }]}>只顯示{col(filter).hue}</Text>
            <Sym name="xmark.circle.fill" size={16} color={c.textMuted} />
          </Pressable>
        )}

        {moving && (
          <Text style={[st.moveHead, { color: c.textSecondary }]} numberOfLines={2}>把「{moving.t.trim()}」搬到</Text>
        )}
        {!searching && (
          <Pressable onPress={add} accessibilityRole="button" accessibilityLabel="新的一張"
            style={({ pressed }) => [st.tile, st.add, { width: tileW, borderColor: c.separator }, pressed && { opacity: T.motion.pressDim }]}>
            <Sym name="plus" size={22} color={c.textPrimary} />
            <Text style={[st.tileText, { color: c.textPrimary }]}>新的一張</Text>
          </Pressable>
        )}

        {pinned.length > 0 && <Text style={[st.head, { color: c.textSecondary }]}>已釘選</Text>}
        {pinned.length > 0 && <View style={st.grid}>{tiles(pinned)}</View>}
        {/* 沒有任何釘選時只剩一組，「其他」沒東西可對照，不印（06-首次體驗 ❓2） */}
        {pinned.length > 0 && other.length > 0 && <Text style={[st.head, { color: c.textSecondary }]}>其他</Text>}
        <View style={st.grid}>{tiles(other)}</View>

        {/* 三種空分開：找不到→帶他剛打的字；篩選→說是哪個顏色；第一次不會是空的（紙永遠至少一張） */}
        {notes.length === 0 && searching && <Empty face={FACE_PUZZLED} lines={[`找不到含「${q.trim()}」的清單`]} />}
        {notes.length === 0 && !searching && filter !== 'all' && <Empty face={FACE_PUZZLED} lines={[`沒有${col(filter).hue}的清單`]} />}

        {trashed > 0 && (
          <Pressable onPress={() => router.replace('/trash')} accessibilityRole="button" accessibilityLabel={`最近刪除，${trashed} 張`}
            style={({ pressed }) => [st.trashRow, { borderTopColor: c.separator }, pressed && { opacity: T.motion.pressDim }]}>
            <Sym name="trash" size={17} color={c.textSecondary} />
            <Text style={[st.trashText, { color: c.textSecondary }]}>最近刪除</Text>
            <View style={{ flex: 1 }} />
            <Text style={[st.trashText, { color: c.textSecondary }]}>{trashed}</Text>
            <Sym name="chevron.right" size={12} color={c.textSecondary} />
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

// 一塊磚：底色是那張紙的顏色，右下角露出一顆色圓，只有名字。正在看的那張用 accent 框起來（面板上唯一的 accent）
function Tile({ n, w, cur, onPress }: { n: Note; w: number; cur: boolean; onPress: () => void }) {
  const c = useColors();
  const nc = useNoteColors(n.color);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label(n)}，${col(n.color).hue}`}
      accessibilityState={{ selected: cur }}
      style={({ pressed }) => [st.tile, { width: w, backgroundColor: nc.bg, borderColor: cur ? c.accent : nc.rule, borderWidth: cur ? T.shape.borderSelected : T.shape.borderCard },
        pressed && { opacity: T.motion.pressDim }]}>
      <Text style={[st.tileText, { color: c.textPrimary }]} numberOfLines={2}>{label(n)}</Text>
      <View style={[st.tag, { backgroundColor: nc.hd }]} />
    </Pressable>
  );
}

const CHIP_DOT = 9;
const st = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: T.space.m, paddingHorizontal: T.space.l, paddingBottom: T.space.s },
  search: { flex: 1, height: T.shape.hitMin, borderRadius: T.shape.radiusCard, flexDirection: 'row', alignItems: 'center', gap: T.space.s,
    paddingHorizontal: T.space.m },
  searchInput: { flex: 1, minWidth: 0, ...T.font.body, paddingVertical: 0 },
  body: { paddingHorizontal: T.space.l, paddingTop: T.space.s },
  chip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: T.space.s, marginBottom: T.space.m,
    borderRadius: T.shape.radiusCard, paddingVertical: T.space.s, paddingHorizontal: T.space.m },
  chipDot: { width: CHIP_DOT, height: CHIP_DOT, borderRadius: T.shape.pill(CHIP_DOT), borderWidth: T.shape.borderCard },
  chipText: { ...T.font.subhead },
  head: { ...T.font.sectionHead, marginTop: T.space.l, marginBottom: T.space.s, marginLeft: T.space.xs },
  moveHead: { ...T.font.subhead, marginBottom: T.space.m, marginLeft: T.space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: T.space.m, marginTop: T.space.m },
  tile: { height: T.shape.tile, borderRadius: T.shape.radiusCard, borderWidth: T.shape.borderCard, padding: T.space.m, overflow: 'hidden' },
  add: { borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: T.space.s },
  tileText: { ...T.font.emphasis },
  tag: { position: 'absolute', right: -T.space.m, bottom: -T.space.m, width: T.shape.tileTag, height: T.shape.tileTag, borderRadius: T.shape.pill(T.shape.tileTag) },
  trashRow: { flexDirection: 'row', alignItems: 'center', gap: T.space.s, minHeight: T.shape.hitMin, marginTop: T.space.xl,
    paddingVertical: T.space.m, borderTopWidth: StyleSheet.hairlineWidth },
  trashText: { ...T.font.body },
});

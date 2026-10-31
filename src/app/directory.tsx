// 目錄：從紙最上面的清單名拉起來的面板（重新設計分支「紙是家」，首頁降級成這張面板）。
// 搜尋、色磚（只有顏色和名字，沒有時間、沒有預覽、沒有數字）、「＋ 新的一張」、最近刪除；篩選、排序、備份在右上 ⋯。
// 點一塊就換紙、面板收起來。帶 move 參數進來（紙上長按 →「搬到…」）就變成「把這行搬到哪張」：點一塊就搬過去。
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Act } from '../components/Acts';
import { Empty } from '../components/Empty';
import { ui } from '../components/Overlay';
import { PopMenu } from '../components/PopMenu';
import { Sym } from '../components/Sym';
import { GlassBtn, native } from '../components/WebBars';
import { importData } from '../lib/backup';
import { col, label, moveItem, visibleNotes, type Note } from '../lib/model';
import { newNote, store, useStore } from '../lib/store';
import { T, useColors, useNoteColors } from '../lib/tokens';

const FACE_PUZZLED = require('../../assets/img/face-flat-puzzled.webp');

export default function Directory() {
  const { move } = useLocalSearchParams<{ move?: string }>();
  const s = useStore();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState('');
  const searching = !!q.trim();

  // K6（2026-11-01 第三輪）：面板收完那一刻（原生堆疊對這個畫面發 transitionEnd、closing＝true，在卸載之前）通知 store，
  // 紙上「新的一張」的輸入框就能馬上升起，不用等 700ms 的保險。事件名與 closing 旗標對過 expo-router 的 NativeStackView；網頁沒這個事件
  const navigation = useNavigation();
  useEffect(() => {
    const nav = navigation as unknown as { addListener: (ev: 'transitionEnd', cb: (e: { data?: { closing?: boolean } }) => void) => () => void };
    return nav.addListener('transitionEnd', e => { if (e.data?.closing) store.panelClosed(); });
  }, [navigation]);

  // 多米 2026-11-01：目錄的排序選項與顏色篩選拿掉（太雜）。排序固定用 s.sort 現值（預設最近改過的在前），顏色篩選不再有；
  // 清單多了要不要分組／資料夾，照 2-5 寫成方案等他選（審查紀錄 2026-11-01 最後一段）
  const notes = visibleNotes(s, { trash: false, filter: 'all', q, sort: s.sort });
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
  // 新的一張：黃色；開完直接停在紙的輸入列（fresh）。搬行時就是搬進新的一張（紙不換）
  function add() {
    const n = newNote('yellow', 'check');
    if (from && moving) { pick(n); return; }
    store.open(n.id, true);
    router.back();
  }

  // ⋯ 選單（2026-11-01 多米定 A1 全部自繪）：跟紙的 ⋯ 同一張卡（PopMenu）。同日稍後排序與顏色篩選拿掉；
  // 再晚一點匯出備份也拿掉（多米：一般人用不到），只剩匯入（網頁版搬家用）
  const acts: Act[] = [
    { label: '匯入備份', icon: 'square.and.arrow.down', fn: importData },
  ];
  // 面板是系統表單（上面有把手），iOS 不用再留狀態列的高度；網頁預覽是整頁，要留
  const padTop = native ? T.space.l : insets.top + T.space.s;

  const tiles = (list: Note[]) => list.map(n => <Tile key={n.id} n={n} w={tileW} cur={n.id === store.last} onPress={() => pick(n)} />);

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }} collapsable={false}>
      <View style={[st.top, { paddingTop: padTop }]}>
        <View style={[st.search, { backgroundColor: c.page }]}>
          <Sym name="magnifyingglass" size={17} color={c.textSecondary} />
          <TextInput value={q} onChangeText={setQ} placeholder="搜尋清單" placeholderTextColor={c.textMuted} clearButtonMode="while-editing"
            style={[st.searchInput, { color: c.textPrimary }]} accessibilityLabel="搜尋清單" />
        </View>
        <GlassBtn icon="ellipsis" label="選單" onPress={() => setMenu(true)} />
      </View>

      <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
        contentContainerStyle={[st.body, { paddingBottom: insets.bottom + T.space.xxl }]}>
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

        {/* 找不到→帶他剛打的字；第一次不會是空的（紙永遠至少一張）。顏色篩選的空狀態跟著篩選一起拿掉（2026-11-01） */}
        {notes.length === 0 && searching && <Empty face={FACE_PUZZLED} lines={[`找不到含「${q.trim()}」的清單`]} />}

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

      {menu && (
        <PopMenu acts={acts} top={padTop + T.shape.hitMin + T.space.s} onClose={() => setMenu(false)} />
      )}
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

const st = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: T.space.m, paddingHorizontal: T.space.l, paddingBottom: T.space.s },
  search: { flex: 1, height: T.shape.hitMin, borderRadius: T.shape.radiusCard, flexDirection: 'row', alignItems: 'center', gap: T.space.s,
    paddingHorizontal: T.space.m },
  // alignSelf stretch：輸入框撐滿 44 高的藥丸，字由 iOS 自己垂直置中。只靠字的本身高度時，中文字的上緣會被切掉（多米 2026-11-01 真機）
  searchInput: { flex: 1, minWidth: 0, alignSelf: 'stretch', ...T.font.body, paddingVertical: 0 },
  body: { paddingHorizontal: T.space.l, paddingTop: T.space.s },
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

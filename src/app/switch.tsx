// 切換清單（2026-11-04 改版，多米給的三格設計圖第 2 格）：點紙左上的清單名，從下面升起 iOS 系統的半高面板（formSheet，_layout 設定）。
// 釘選的在前、再來這台手機最近開過的（model switchList）；正在看的那張打勾；點一張＝換過去、面板收起。
// 最下面「管理所有清單」＝面板收完之後打開目錄（清單總覽，DirPanel）
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dirPanel } from '../components/DirPanel';
import { NoteIcon } from '../components/NoteIcon';
import { Sym } from '../components/Sym';
import { label, switchList, type Note } from '../lib/model';
import { store, useStore } from '../lib/store';
import { T, useColors } from '../lib/tokens';

export default function Switch() {
  const s = useStore();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { pinned, recent } = switchList(s, store.recent);
  // 「管理所有清單」：等面板真的收完（這個畫面卸載）才開目錄，不然目錄跟面板會同時在動
  const toAll = useRef(false);
  useEffect(() => () => { if (toAll.current) dirPanel.open(); }, []);
  const pick = (n: Note) => {
    if (n.id !== store.last) store.open(n.id);
    router.back();
  };
  const all = () => { toAll.current = true; router.back(); };
  const row = (n: Note) => {
    const cur = n.id === store.last;
    return (
      <Pressable key={n.id} onPress={() => pick(n)} accessibilityRole="button" accessibilityLabel={label(n)} accessibilityState={{ selected: cur }}
        style={({ pressed }) => [st.row, pressed && { backgroundColor: c.searchFill }]}>
        <NoteIcon n={n} size={T.shape.noteIcon} />
        <Text style={[st.name, { color: n.title.trim() ? c.textPrimary : c.textSecondary }]} numberOfLines={1}>{label(n)}</Text>
        {n.pinned ? <Sym name="pin.fill" size={13} color={c.textSecondary} /> : null}
        {cur ? <Sym name="checkmark" size={17} color={c.accent} weight="semibold" /> : <View style={st.check} />}
      </Pressable>
    );
  };
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.page }} contentContainerStyle={[st.body, { paddingBottom: insets.bottom + T.space.l }]}>
      <Text style={[st.head, { color: c.textPrimary }]} accessibilityRole="header">切換清單</Text>
      {pinned.length > 0 && <Text style={[st.section, { color: c.textSecondary }]}>釘選</Text>}
      {pinned.map(row)}
      {recent.length > 0 && <Text style={[st.section, { color: c.textSecondary }]}>最近</Text>}
      {recent.map(row)}
      <View style={[st.rule, { backgroundColor: c.separator }]} />
      <Pressable onPress={all} accessibilityRole="button" accessibilityLabel="管理所有清單"
        style={({ pressed }) => [st.row, pressed && { backgroundColor: c.searchFill }]}>
        <View style={[st.allIcon]}><Sym name="square.grid.2x2" size={20} color={c.textPrimary} /></View>
        <Text style={[st.name, { color: c.textPrimary }]}>管理所有清單</Text>
        <Sym name="chevron.right" size={14} color={c.textSecondary} weight="semibold" />
      </Pressable>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  body: { paddingTop: T.space.l, paddingHorizontal: T.space.s },
  head: { ...T.font.emphasis, paddingHorizontal: T.space.m, paddingBottom: T.space.s },
  section: { ...T.font.footnote, paddingHorizontal: T.space.m, paddingTop: T.space.m, paddingBottom: T.space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: T.space.m, minHeight: T.shape.menuRow, paddingHorizontal: T.space.m, borderRadius: T.shape.radiusMenu },
  name: { ...T.font.body, flex: 1, minWidth: 0 },
  check: { width: T.shape.checkSlot },
  allIcon: { width: T.shape.noteIcon, alignItems: 'center' },
  rule: { height: StyleSheet.hairlineWidth, marginHorizontal: T.space.m, marginVertical: T.space.s },
});

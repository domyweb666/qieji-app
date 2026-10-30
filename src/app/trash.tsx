// 「最近刪除」：從首頁 ⋯ 選單進來
import { router, Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { menuItems, showActs, type Act } from '../components/Acts';
import { Empty } from '../components/Empty';
import { listStyles, NoteSections } from '../components/NoteList';
import { ui } from '../components/Overlay';
import { GlassBtn, WebTop } from '../components/WebBars';
import { label, visibleNotes, type Note } from '../lib/model';
import { store, useStore } from '../lib/store';
import { C, F } from '../lib/theme';

export default function Trash() {
  const s = useStore();
  const title = '最近刪除';
  const notes = visibleNotes(s, { trash: true, filter: 'all', q: '', sort: s.sort });

  function onPress(n: Note) {
    ui.sheet([
      { label: '還原', fn: () => { n.deleted = false; store.change(); ui.toast('已還原'); } },
      { label: '永久刪除', danger: true, fn: () => { s.notes = s.notes.filter(x => x !== n); store.change(); } },
    ], label(n));
  }
  const acts: Act[] = [{
    label: `清空最近刪除（${notes.length}）`, icon: 'trash', destructive: true,
    fn: () => ui.confirm('永久刪除這裡的所有筆記？', () => { s.notes = s.notes.filter(n => !n.deleted); store.change(); }),
  }];

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }} collapsable={false}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={listStyles.wrap}>
        <Stack.Title large>{title}</Stack.Title>
        {notes.length > 0 && (
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="選單">{menuItems(acts)}</Stack.Toolbar.Menu>
          </Stack.Toolbar>
        )}
        <WebTop title={title} left={<GlassBtn icon="chevron.left" label="返回" onPress={() => router.back()} />}
          right={notes.length > 0 ? <GlassBtn icon="ellipsis" label="選單" onPress={() => showActs(acts)} /> : undefined} />

        {notes.length > 0 && <Text style={st.note}>點一下可以還原或永久刪除。</Text>}
        {notes.length
          ? <NoteSections notes={notes} trash onPress={onPress} />
          : <Empty lines={['最近刪除是空的']} />}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  note: { fontSize: F.footnote, color: C.secondary, marginTop: 8, marginLeft: 4 },
});

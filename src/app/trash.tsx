// 「最近刪除」：從目錄面板最下面那列進來。上面是刪掉的清單（一張一張），下面是各張紙刪掉的行（帶那張紙的名字）。
import { router, Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { menuItems, showActs, type Act } from '../components/Acts';
import { Empty } from '../components/Empty';
import { ListGroup, ListRow, listStyles, NoteSections } from '../components/NoteList';
import { ui } from '../components/Overlay';
import { GlassBtn, WebTop } from '../components/WebBars';
import { dropNotes, FULL_MSG, fillHole, label, markRestored, roomOf, TRASH_DAYS, unbinItem, visibleNotes, type Item, type Note } from '../lib/model';
import { store, useStore } from '../lib/store';
import { noteColors, T, useColors } from '../lib/tokens';


export default function Trash() {
  const s = useStore();
  const c = useColors();
  const title = '最近刪除';
  const notes = visibleNotes(s, { trash: true, filter: 'all', q: '', sort: s.sort });
  // 刪掉的行：只看還在的紙（紙本身被刪的，行跟著那張紙）。新刪的在前面
  const lines = s.notes.filter(n => !n.deleted).flatMap(n => n.bin.map(it => ({ n, it }))).sort((a, b) => (b.it.at || 0) - (a.it.at || 0));
  const total = notes.length + lines.length;
  // 點一則（2026-11-02 系統元件化）：iOS 系統的動作表單（從下面升起、刪除是紅字），網頁預覽是自己畫的同一份
  function onPress(n: Note) {
    ui.sheet([
      // 還原：目錄裡它刪掉時留下的空位還在，就站回那格（2026-11-03）
      { label: '還原', fn: () => { markRestored(n); fillHole(s, n.id, Date.now()); store.change(); ui.toast('已還原'); } },
      { label: '永久刪除', danger: true, fn: () => { dropNotes(s, x => x === n, Date.now()); store.change(); } },
    ], label(n));
  }
  function onPressLine(n: Note, it: Item) {
    ui.sheet([
      { label: `還原到「${label(n)}」`, fn: () => { if (!roomOf(n)) { ui.toast(FULL_MSG); return; } unbinItem(n, it.id); n.updated = Date.now(); store.change(); ui.toast('已還原'); } },
      { label: '永久刪除', danger: true, fn: () => { n.bin = n.bin.filter(x => x !== it); store.change(); } },
    ], it.t.trim() || undefined);
  }
  const acts: Act[] = [{
    label: `清空最近刪除（${total}）`, icon: 'trash', destructive: true,
    fn: () => ui.confirm('永久刪除這裡的所有清單和行？', () => {
      dropNotes(s, n => n.deleted, Date.now());
      s.notes.forEach(n => { n.bin = []; });
      store.change();
    }),
  }];

  return (
    <View style={{ flex: 1, backgroundColor: c.page }} collapsable={false}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={listStyles.wrap}>
        {total > 0 && (
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="選單">{menuItems(acts)}</Stack.Toolbar.Menu>
          </Stack.Toolbar>
        )}
        <WebTop title={title} left={<GlassBtn icon="chevron.left" label="返回" onPress={() => router.back()} />}
          right={total > 0 ? <GlassBtn icon="ellipsis" label="選單" onPress={() => showActs(acts)} /> : undefined} />

        {/* 30 天自動清接上後的版本（06 首次體驗 3-3）：講規則、不在每則上顯示剩幾天（那是壓力來源） */}
        {total > 0 && <Text style={[st.note, { color: c.textSecondary }]}>{`放滿 ${TRASH_DAYS} 天會自動清掉。點一下可以還原或永久刪除。`}</Text>}
        {notes.length > 0 && <NoteSections notes={notes} trash onPress={onPress} />}
        {lines.length > 0 && (
          <ListGroup title="刪掉的行">
            {lines.map(({ n, it }) => (
              <ListRow key={it.id} dot={noteColors(n.color, c.mode).hd} text={it.t} detail={label(n)} lines={2}
                a11y={`${it.t}，原本在「${label(n)}」`} onPress={() => onPressLine(n, it)} />
            ))}
          </ListGroup>
        )}
        {total === 0 && <Empty lines={['最近刪除是空的', `刪掉的清單和行會先放在這裡 ${TRASH_DAYS} 天，之後自動清掉`]} />}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  note: { ...T.font.footnote, marginTop: T.space.s, marginLeft: T.space.l },
});

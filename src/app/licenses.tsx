// 「開源授權」（共用規格）：清單由 tools/gen-licenses.mjs 自動產生（src/lib/licenses.json），不手動維護。
// 直接用到的套件點了看授權全文；它們帶進來的套件只列名字和授權種類。
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ListGroup, listStyles } from '../components/NoteList';
import { GlassBtn, WebTop } from '../components/WebBars';
import data from '../lib/licenses.json';
import { T, useColors } from '../lib/tokens';

type Main = { name: string; version: string; license: string; text: string };
const MAIN = data.main as Main[];
const OTHERS = data.others as { name: string; license: string }[];

export default function Licenses() {
  const c = useColors();
  const title = '開源授權';
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={{ flex: 1, backgroundColor: c.page }} collapsable={false}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={listStyles.wrap}>
        {Platform.OS === 'ios' && <Text style={[st.title, { color: c.textPrimary }]} accessibilityRole="header">{title}</Text>}
        <WebTop title={title} left={<GlassBtn icon="chevron.left" label="返回" onPress={() => router.back()} />} />
        <Text style={[st.note, { color: c.textSecondary }]}>茄記用了這些開源套件。點一個看授權全文。</Text>
        <ListGroup>
          {MAIN.map(m => (
            <Pressable key={m.name} onPress={() => setOpen(open === m.name ? null : m.name)} accessibilityRole="button"
              accessibilityLabel={`${m.name}，${m.license}`} accessibilityState={{ expanded: open === m.name }}
              style={({ pressed }) => [st.row, pressed && { backgroundColor: c.pressedFill }]}>
              <View style={st.head}>
                <Text style={[st.name, { color: c.textPrimary }]}>{m.name}</Text>
                <Text style={[st.kind, { color: c.textSecondary }]}>{m.license}</Text>
              </View>
              {open === m.name && <Text style={[st.text, { color: c.textSecondary }]}>{m.text || `${m.license}（套件裡沒有附授權全文）`}</Text>}
            </Pressable>
          ))}
        </ListGroup>
        <Text style={[st.note, { color: c.textSecondary }]}>{`上面這些套件另外帶進來 ${OTHERS.length} 個套件：`}</Text>
        <Text style={[st.others, { color: c.textSecondary }]}>{OTHERS.map(o => `${o.name}（${o.license}）`).join('、')}</Text>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  title: { ...T.font.title, marginTop: T.space.s, marginLeft: T.space.l },
  note: { ...T.font.footnote, marginTop: T.space.l, marginHorizontal: T.space.l },
  row: { paddingVertical: T.space.m, paddingHorizontal: T.space.l, gap: T.space.s, minHeight: T.shape.hitMin, justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: T.space.m },
  name: { flex: 1, ...T.font.body },
  kind: { ...T.font.footnote },
  text: { ...T.font.label },
  others: { ...T.font.label, marginTop: T.space.s, marginHorizontal: T.space.l },
});

// 「開源授權」（共用規格）：清單由 tools/gen-licenses.mjs 自動產生（src/lib/licenses.json），不手動維護。
// 2026-11-14 多米真機：原本一整排套件名（@bacons/apple-targets、expo-iap…）看起來像亂碼。改成照「這是做什麼的」分組，
// 一組一列（專案的名字＋一句用途），點進去（license 那頁）才是套件名和授權全文。它們帶進來的幾百個套件收在最後一列
import { router } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ListGroup, listStyles } from '../components/NoteList';
import { Sym } from '../components/Sym';
import { GlassBtn, WebTop } from '../components/WebBars';
import data from '../lib/licenses.json';
import { T, useColors } from '../lib/tokens';

export type LicenseGroup = { title: string; sub: string; texts: { names: string[]; license: string; text: string }[] };
export const GROUPS = data.groups as LicenseGroup[];
export const OTHERS = data.others as { name: string; license: string }[];
export const OTHERS_KEY = 'others';

function Row({ text, sub, onPress }: { text: string; sub?: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={sub ? `${text}，${sub}` : text}
      style={({ pressed }) => [st.row, pressed && { backgroundColor: c.pressedFill }]}>
      <View style={st.ico}><Sym name="doc.text" size={20} color={c.textSecondary} /></View>
      <View style={st.texts}>
        <Text style={[st.name, { color: c.textPrimary }]}>{text}</Text>
        {sub ? <Text style={[st.sub, { color: c.textSecondary }]}>{sub}</Text> : null}
      </View>
      <Sym name="chevron.right" size={12} color={c.textSecondary} />
    </Pressable>
  );
}

export default function Licenses() {
  const c = useColors();
  const title = '開源授權';
  const open = (g: string) => router.push({ pathname: '/license', params: { g } });
  return (
    <View style={{ flex: 1, backgroundColor: c.page }} collapsable={false}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={listStyles.wrap}>
        {Platform.OS === 'ios' && <Text style={[st.title, { color: c.textPrimary }]} accessibilityRole="header">{title}</Text>}
        <WebTop title={title} left={<GlassBtn icon="chevron.left" label="返回" onPress={() => router.back()} />} />
        <ListGroup>
          {GROUPS.map((g, i) => <Row key={g.title} text={g.title} sub={g.sub} onPress={() => open(String(i))} />)}
        </ListGroup>
        <ListGroup>
          {[<Row key={OTHERS_KEY} text="其他套件" sub={`上面這些另外帶進來的 ${OTHERS.length} 個`} onPress={() => open(OTHERS_KEY)} />]}
        </ListGroup>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  title: { ...T.font.title, marginTop: T.space.s, marginLeft: T.space.l },
  row: { flexDirection: 'row', alignItems: 'center', gap: T.space.m, minHeight: T.shape.hitMin, paddingVertical: T.space.m, paddingHorizontal: T.space.l },
  ico: { width: T.space.xl, alignItems: 'center' },
  texts: { flex: 1, gap: T.space.xs },
  name: { ...T.font.body },
  sub: { ...T.font.footnote },
});

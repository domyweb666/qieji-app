// 「開源授權」點進去的那一頁：一組套件的名字和授權全文（g＝第幾組）；g=others 是帶進來的套件，只列名字和授權種類
import { router, useLocalSearchParams } from 'expo-router';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { listStyles } from '../components/NoteList';
import { GlassBtn, WebTop } from '../components/WebBars';
import { T, useColors } from '../lib/tokens';
import { GROUPS, OTHERS, OTHERS_KEY } from './licenses';

export default function License() {
  const c = useColors();
  const { g } = useLocalSearchParams<{ g?: string }>();
  const others = g === OTHERS_KEY;
  const group = others ? undefined : GROUPS[Number(g)];
  const title = others ? '其他套件' : group?.title ?? '開源授權';
  return (
    <View style={{ flex: 1, backgroundColor: c.page }} collapsable={false}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={listStyles.wrap}>
        {Platform.OS === 'ios' && <Text style={[st.title, { color: c.textPrimary }]} accessibilityRole="header">{title}</Text>}
        <WebTop title={title} left={<GlassBtn icon="chevron.left" label="返回" onPress={() => router.back()} />} />
        {others ? (
          <View style={[st.card, { backgroundColor: c.surface }]}>
            <Text style={[st.text, { color: c.textSecondary }]}>{OTHERS.map(o => `${o.name}（${o.license}）`).join('\n')}</Text>
          </View>
        ) : group?.texts.map(t => (
          <View key={t.names[0]} style={[st.card, { backgroundColor: c.surface }]}>
            <Text style={[st.names, { color: c.textPrimary }]}>{t.names.join('、')}</Text>
            <Text style={[st.text, { color: c.textSecondary }]}>{t.text || `${t.license}（套件裡沒有附授權全文）`}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  title: { ...T.font.title, marginTop: T.space.s, marginLeft: T.space.l },
  card: { borderRadius: T.shape.radiusMd, paddingVertical: T.space.m, paddingHorizontal: T.space.l, gap: T.space.m, marginTop: T.space.xl },
  names: { ...T.font.callout, fontWeight: T.font.semibold },
  text: { ...T.font.footnote },
});

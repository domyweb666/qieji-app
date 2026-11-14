// 「新功能」（共用規格）：重看每一版的新功能，新的在上面。內容在 lib/news.ts
import { router } from 'expo-router';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { listStyles } from '../components/NoteList';
import { GlassBtn, WebTop } from '../components/WebBars';
import { NEWS } from '../lib/news';
import { T, useColors } from '../lib/tokens';

export default function NewsPage() {
  const c = useColors();
  const title = '新功能';
  return (
    <View style={{ flex: 1, backgroundColor: c.page }} collapsable={false}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={listStyles.wrap}>
        {Platform.OS === 'ios' && <Text style={[st.title, { color: c.textPrimary }]} accessibilityRole="header">{title}</Text>}
        <WebTop title={title} left={<GlassBtn icon="chevron.left" label="返回" onPress={() => router.back()} />} />
        {NEWS.map(n => (
          <View key={n.version} style={st.block}>
            <Text style={[st.ver, { color: c.textSecondary }]} accessibilityRole="header">{n.version}</Text>
            <View style={[st.card, { backgroundColor: c.surface }]}>
              {n.points.map(p => <Text key={p} style={[st.point, { color: c.textPrimary }]}>{`・${p}`}</Text>)}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  title: { ...T.font.title, marginTop: T.space.s, marginLeft: T.space.l },
  block: { marginTop: T.space.xl },
  ver: { ...T.font.footnote, fontWeight: T.font.semibold, marginBottom: T.space.s, marginLeft: T.space.l },
  card: { borderRadius: T.shape.radiusMd, paddingVertical: T.space.m, paddingHorizontal: T.space.l, gap: T.space.s },
  point: { ...T.font.callout },
});

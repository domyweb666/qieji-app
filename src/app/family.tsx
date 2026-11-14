// 「蔬菜家族的其他 app」（共用規格；2026-11-15 多米照豆鍵那一頁）：一張卡片一個 app，名字、一句話、右邊「取得」，點了開 App Store。
// 清單內建在 lib/family.ts，不連網路
import { router } from 'expo-router';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ListGroup, listStyles } from '../components/NoteList';
import { ui } from '../components/Overlay';
import { GlassBtn, WebTop } from '../components/WebBars';
import { FAMILY } from '../lib/family';
import { T, useColors } from '../lib/tokens';

export default function Family() {
  const c = useColors();
  const title = '蔬菜家族的其他 app';
  const open = (id: string) => { Linking.openURL(`https://apps.apple.com/app/id${id}`).catch(() => ui.alert('打不開', '等一下再試一次')); };
  return (
    <View style={{ flex: 1, backgroundColor: c.page }} collapsable={false}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={listStyles.wrap}>
        {Platform.OS === 'ios' && <Text style={[st.title, { color: c.textPrimary }]} accessibilityRole="header">{title}</Text>}
        <WebTop title={title} left={<GlassBtn icon="chevron.left" label="返回" onPress={() => router.back()} />} />
        <ListGroup>
          {FAMILY.map(a => (
            <Pressable key={a.slug} onPress={() => open(a.appStoreID)} accessibilityRole="link" accessibilityLabel={`${a.name}，${a.tagline}，到 App Store 取得`}
              style={({ pressed }) => [st.row, pressed && { backgroundColor: c.pressedFill }]}>
              <View style={st.texts}>
                <Text style={[st.name, { color: c.textPrimary }]}>{a.name}</Text>
                <Text style={[st.sub, { color: c.textSecondary }]}>{a.tagline}</Text>
              </View>
              <Text style={[st.get, { color: c.textPrimary }]}>取得</Text>
            </Pressable>
          ))}
        </ListGroup>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  title: { ...T.font.title, marginTop: T.space.s, marginLeft: T.space.l },
  row: { flexDirection: 'row', alignItems: 'center', gap: T.space.m, minHeight: T.shape.hitMin, paddingVertical: T.space.m, paddingHorizontal: T.space.l },
  texts: { flex: 1, gap: T.space.xs },
  name: { ...T.font.headline },
  sub: { ...T.font.footnote },
  get: { ...T.font.headline },
});

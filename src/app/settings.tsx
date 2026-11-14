// 「設定」（1.1 片 A1，2026-11-14）：從目錄面板最下面那列進來，樣子照最近刪除（頁名畫在內容裡，原因見 _layout）。
// 這片只有「茄記完整版」一組：那列（點了直接跳 Apple 的付款框；A2 會改成打開付費頁）和「恢復購買」。iCloud 開關是 B2、關於是 C1。
// 價格用 App Store 傳回來的字，不寫死；判斷規則在 lib/full.ts、接原生在 lib/iap.ts。
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ListGroup, listStyles } from '../components/NoteList';
import { ui } from '../components/Overlay';
import { GlassBtn, WebTop } from '../components/WebBars';
import { buyFull, loadPrice, restoreFull, useFull } from '../lib/iap';
import { T, useColors } from '../lib/tokens';

const NAME = '茄記完整版';
const NO_PRICE = '連不上 App Store，價格讀不到';
const OFFLINE: [string, string] = ['連不上 App Store', '沒有扣款。等一下再試一次'];
const UNVERIFIED: [string, string] = ['Apple 傳回的購買記錄驗不過', '先當作沒買。有被扣款的話，等一下按「恢復購買」'];

export default function Settings() {
  const c = useColors();
  const f = useFull();
  const title = '設定';
  const full = f.full;
  // 打開這頁就去讀一次價格（買了就不用）
  useEffect(() => { if (!full) loadPrice(); }, [full]);

  async function buy() {
    // 價格還沒讀到：點了是再讀一次，不跳付款框（沒看到價格不准付錢）
    if (!f.price) { loadPrice(); return; }
    const r = await buyFull();
    // 成功：那列自己變成已解鎖；取消不是錯誤，什麼都不講
    if (r === 'ok' || r === 'cancel' || r === 'busy') return;
    if (r === 'pending') ui.alert('這筆購買在等核准', '核准之後，茄記會自己解鎖');
    else if (r === 'unconfirmed') ui.alert('付款完成了，但還沒收到 Apple 的確認', '等一下按「恢復購買」');
    else if (r === 'unverified') ui.alert(...UNVERIFIED);
    else if (r === 'offline') ui.alert(...OFFLINE);
    else if (r === 'blocked') ui.alert('這台手機不能購買', '沒有扣款。「設定 › 螢幕使用時間」裡的 App 內購買被關掉了');
    else ui.alert('沒有買成', '沒有扣款。等一下再試一次');
  }

  async function restore() {
    const r = await restoreFull();
    if (r === 'cancel' || r === 'busy') return;
    if (r === 'ok') ui.toast('已解鎖');
    else if (r === 'none') ui.alert(`這個 Apple 帳號沒有買過${NAME}`, '用別的 Apple 帳號買的話，先到 App Store 換成那個帳號再試');
    else if (r === 'unverified') ui.alert(...UNVERIFIED);
    else ui.alert('連不上 App Store', '等一下再試一次');
  }

  const noPrice = !full && !f.price && f.priceErr;
  const sub = noPrice ? NO_PRICE : 'iCloud 同步、小工具、控制中心';
  const right = full ? '已解鎖 ✓' : f.price ?? '';
  const a11y = full ? `${NAME}，已解鎖` : noPrice ? `${NAME}，${NO_PRICE}，點兩下再試一次` : f.price ? `${NAME}，${f.price}` : NAME;

  return (
    <View style={{ flex: 1, backgroundColor: c.page }} collapsable={false}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={listStyles.wrap}>
        {Platform.OS === 'ios' && <Text style={[st.title, { color: c.textPrimary }]} accessibilityRole="header">{title}</Text>}
        <WebTop title={title} left={<GlassBtn icon="chevron.left" label="返回" onPress={() => router.back()} />} />

        <ListGroup>
          {[
            <Pressable key="full" onPress={buy} disabled={full || f.busy} accessibilityRole="button" accessibilityLabel={a11y}
              accessibilityState={{ disabled: full || f.busy, busy: f.busy }}
              style={({ pressed }) => [st.row, pressed && { backgroundColor: c.pressedFill }]}>
              <View style={st.texts}>
                <Text style={[st.name, { color: c.textPrimary }]}>{NAME}</Text>
                <Text style={[st.sub, { color: c.textSecondary }]}>{sub}</Text>
              </View>
              {f.busy ? <ActivityIndicator color={c.textSecondary} /> : right ? <Text style={[st.right, { color: c.textSecondary }]}>{right}</Text> : null}
            </Pressable>,
            <Pressable key="restore" onPress={restore} disabled={f.busy} accessibilityRole="button" accessibilityLabel="恢復購買"
              accessibilityState={{ disabled: f.busy }}
              style={({ pressed }) => [st.row, pressed && { backgroundColor: c.pressedFill }]}>
              <Text style={[st.name, { color: c.textPrimary }]}>恢復購買</Text>
            </Pressable>,
          ]}
        </ListGroup>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  title: { ...T.font.title, marginTop: T.space.s, marginLeft: T.space.l },
  row: { flexDirection: 'row', alignItems: 'center', gap: T.space.m, minHeight: T.shape.hitMin, paddingVertical: T.space.m, paddingHorizontal: T.space.l },
  texts: { flex: 1, gap: T.space.xs },
  name: { ...T.font.body },
  sub: { ...T.font.footnote },
  right: { ...T.font.body },
});

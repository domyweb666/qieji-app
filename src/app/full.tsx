// 「茄記完整版」付費頁（1.1 片 A2，2026-11-14）：A 半高表單（線框 .uiux/03-線框/1.1-設定與付費頁.html，多米 11-11 選）。
// 系統的表單（_layout 設 formSheet）：從下面升起、後面那頁變暗、可以往下拉關掉。
// 從哪裡來：設定那列、沒買時的 iCloud 開關、鎖住的小工具與控制中心「記一行」（qieji://full）、1.0 使用者的提示框。付完或關掉都回原本的地方。
// 七種狀態：平常／讀不到價格／購買中／買好了／付款失敗／使用者取消（安靜）／恢復找不到。訊息寫在按鈕上面那一行，不另外跳框。
// 不做：倒數、限時、晚出現的關閉鍵、預先選好、羞辱式拒絕（付費提案第五節）。
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';
import { ui } from '../components/Overlay';
import { Sym } from '../components/Sym';
import { GlassBtn } from '../components/WebBars';
import { buyFull, loadPrice, restoreFull, useFull } from '../lib/iap';
import { T, useColors } from '../lib/tokens';

const NAME = '茄記完整版';
const FEATS: [SFSymbol, string, string][] = [
  ['icloud', 'iCloud 同步', '換手機、刪掉重裝，紙都會回來'],
  ['square.grid.2x2', '主畫面和鎖定畫面小工具', '不用打開 app，也看得到上次那張紙'],
  ['square.and.pencil', '控制中心「記一行」', '在任何畫面按一下，就能開始記'],
  ['plus.circle', '之後新增的完整版功能', '也都包含，不用再付'],
];

// 關掉：有上一頁就回去；直接從網址進來（小工具、控制中心）沒有上一頁，回到紙
function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function Full() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const f = useFull();
  const [msg, setMsg] = useState('');
  const full = f.full;
  useEffect(() => { if (!full) loadPrice(); }, [full]);

  const noPrice = !f.price && f.priceErr;
  const priceLine = full ? '已解鎖 ✓' : f.price ? `${f.price}，一次付清，不是訂閱` : noPrice ? '連不上 App Store，價格讀不到' : ' ';
  const buyLabel = f.busy ? '正在連到 App Store…' : f.price ? `用 ${f.price} 解鎖` : noPrice ? '再試一次' : '正在讀價格…';

  async function buy() {
    setMsg('');
    // 沒看到價格不准付錢：點了是再讀一次
    if (!f.price) { loadPrice(); return; }
    const r = await buyFull();
    if (r === 'cancel' || r === 'busy') return; // 取消不是錯誤
    if (r === 'ok') { close(); ui.toast(`已解鎖${NAME}`); return; }
    setMsg(
      r === 'pending' ? '這筆購買在等核准。核准之後，茄記會自己解鎖'
        : r === 'unconfirmed' ? '付款完成了，但還沒收到 Apple 的確認。等一下按「恢復購買」'
          : r === 'unverified' ? 'Apple 傳回的購買記錄驗不過，先當作沒買。有被扣款的話，等一下按「恢復購買」'
            : r === 'offline' ? '沒有扣款。連不上 App Store，等一下再試一次'
              : r === 'blocked' ? '沒有扣款。這台手機的「螢幕使用時間」關掉了 App 內購買'
                : '沒有扣款。等一下再試一次');
  }

  async function restore() {
    setMsg('');
    const r = await restoreFull();
    if (r === 'cancel' || r === 'busy') return;
    if (r === 'ok') { close(); ui.toast(`已解鎖${NAME}`); return; }
    setMsg(
      r === 'none' ? `這個 Apple 帳號沒有買過${NAME}`
        : r === 'unverified' ? 'Apple 傳回的購買記錄驗不過，先當作沒買'
          : '連不上 App Store，等一下再試一次');
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }} collapsable={false}>
      <ScrollView contentContainerStyle={[st.wrap, { paddingBottom: insets.bottom + T.space.l }]}>
        <View style={st.top}>
          {/* 關閉鍵一打開就在左上角；標題置中，右邊放一塊一樣寬的空白讓它真的在中間 */}
          <GlassBtn icon="xmark" label="關閉" onPress={close} />
          <Text style={[st.title, { color: c.textPrimary }]} accessibilityRole="header">{NAME}</Text>
          <View style={st.side} />
        </View>
        <Text style={[st.price, { color: c.textSecondary }]}>{priceLine}</Text>

        <View style={st.feats}>
          {FEATS.map(([icon, name, sub]) => (
            <View key={name} style={st.feat} accessible accessibilityLabel={`${name}，${sub}`}>
              <View style={st.ico}><Sym name={icon} size={24} color={c.textSecondary} /></View>
              <View style={st.featText}>
                <Text style={[st.featName, { color: c.textPrimary }]}>{name}</Text>
                <Text style={[st.featSub, { color: c.textSecondary }]}>{sub}</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={[st.note, { color: c.textSecondary }]}>家人共享：同一個家庭群組的人不用再買</Text>

        {msg ? <Text style={[st.msg, { color: c.textPrimary }]} accessibilityLiveRegion="polite">{msg}</Text> : null}

        {full ? (
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="完成"
            style={({ pressed }) => [st.buy, { backgroundColor: c.accent }, pressed && { opacity: T.motion.pressDim }]}>
            <Text style={[st.buyText, { color: c.fabIcon }]}>完成</Text>
          </Pressable>
        ) : (
          <>
            <Pressable onPress={buy} disabled={f.busy} accessibilityRole="button" accessibilityLabel={buyLabel} accessibilityState={{ disabled: f.busy, busy: f.busy }}
              style={({ pressed }) => [st.buy, { backgroundColor: c.accent }, (pressed || f.busy) && { opacity: T.motion.pressDim }]}>
              <Text style={[st.buyText, { color: c.fabIcon }]}>{buyLabel}</Text>
            </Pressable>
            <View style={st.row}>
              <Pressable onPress={restore} disabled={f.busy} accessibilityRole="button" accessibilityLabel="恢復購買"
                style={({ pressed }) => [st.plain, pressed && { opacity: T.motion.pressDim }]}>
                <Text style={[st.plainText, { color: c.textPrimary }]}>恢復購買</Text>
              </Pressable>
              <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="先不用"
                style={({ pressed }) => [st.plain, pressed && { opacity: T.motion.pressDim }]}>
                <Text style={[st.plainText, { color: c.textPrimary }]}>先不用</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { paddingHorizontal: T.space.gutter, paddingTop: T.space.l },
  top: { flexDirection: 'row', alignItems: 'center' },
  side: { width: T.shape.hitMin },
  title: { flex: 1, textAlign: 'center', ...T.font.headline },
  price: { ...T.font.callout, textAlign: 'center', marginTop: T.space.xs },
  feats: { marginTop: T.space.l, gap: T.space.m },
  feat: { flexDirection: 'row', alignItems: 'center', gap: T.space.m, minHeight: T.shape.hitMin },
  ico: { width: T.shape.hitMin, alignItems: 'center' },
  featText: { flex: 1, gap: T.space.xs / 2 },
  featName: { ...T.font.headline },
  featSub: { ...T.font.callout },
  note: { ...T.font.footnote, textAlign: 'center', marginTop: T.space.l },
  msg: { ...T.font.callout, textAlign: 'center', marginTop: T.space.l },
  buy: { minHeight: T.shape.hitMin + T.space.m, borderRadius: T.shape.radiusMd, alignItems: 'center', justifyContent: 'center', marginTop: T.space.l, paddingHorizontal: T.space.l },
  buyText: { ...T.font.headline, textAlign: 'center' },
  row: { flexDirection: 'row', marginTop: T.space.s },
  plain: { flex: 1, minHeight: T.shape.hitMin, alignItems: 'center', justifyContent: 'center' },
  plainText: { ...T.font.body },
});

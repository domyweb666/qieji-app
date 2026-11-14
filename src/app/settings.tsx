// 「設定」（1.1，2026-11-14）：從目錄面板最下面那列進來，樣子照最近刪除（頁名畫在內容裡，原因見 _layout）。
// 三組（線框 .uiux/03-線框/1.1-設定與付費頁.html）：茄記完整版（含恢復購買）、iCloud 同步、關於。
// 價格用 App Store 傳回來的字，不寫死；判斷規則在 lib/full.ts、接原生在 lib/iap.ts、開關功能在 lib/access.ts。
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ListGroup, listStyles } from '../components/NoteList';
import { ui } from '../components/Overlay';
import { Sym } from '../components/Sym';
import { GlassBtn, WebTop } from '../components/WebBars';
import { setSyncOn, useSyncOn } from '../lib/access';
import { cloudOn, cloudSyncedAt } from '../lib/cloud';
import { loadPrice, restoreFull, useFull } from '../lib/iap';
import { MAIL, PRIVACY_URL, REVIEW_URL } from '../lib/links';
import { ago } from '../lib/model';
import { T, useColors } from '../lib/tokens';

const NAME = '茄記完整版';
const NO_PRICE = '連不上 App Store，價格讀不到';
const VERSION = Constants.expoConfig?.version ?? '';

// 一列：左邊字（可以有第二行小字）、右邊放東西。沒給 onPress 就是不能點的列
function Row({ text, sub, right, onPress, disabled, a11y }: { text: string; sub?: string; right?: ReactNode; onPress?: () => void; disabled?: boolean; a11y?: string }) {
  const c = useColors();
  const body = (
    <>
      <View style={st.texts}>
        <Text style={[st.name, { color: c.textPrimary }]}>{text}</Text>
        {sub ? <Text style={[st.sub, { color: c.textSecondary }]}>{sub}</Text> : null}
      </View>
      {right}
    </>
  );
  if (!onPress) return <View style={st.row}>{body}</View>;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y ?? text} accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [st.row, pressed && { backgroundColor: c.pressedFill }]}>
      {body}
    </Pressable>
  );
}

export default function Settings() {
  const c = useColors();
  const f = useFull();
  const syncOn = useSyncOn();
  const title = '設定';
  const full = f.full;
  // 打開這頁就去讀一次價格（買了就不用）
  useEffect(() => { if (!full) loadPrice(); }, [full]);
  // iPhone 的 iCloud 雲碟有沒有開（買了、同步開著才需要知道）
  const [drive, setDrive] = useState(true);
  useEffect(() => {
    let live = true;
    if (full && syncOn) cloudOn().then(ok => { if (live) setDrive(ok); });
    return () => { live = false; };
  }, [full, syncOn]);

  const openFull = () => router.push('/full');

  async function restore() {
    const r = await restoreFull();
    if (r === 'cancel' || r === 'busy') return;
    if (r === 'ok') ui.toast('已解鎖');
    else if (r === 'none') ui.alert(`這個 Apple 帳號沒有買過${NAME}`, '用別的 Apple 帳號買的話，先到 App Store 換成那個帳號再試');
    else if (r === 'unverified') ui.alert('Apple 傳回的購買記錄驗不過', '先當作沒買。等一下再按一次「恢復購買」');
    else ui.alert('連不上 App Store', '等一下再試一次');
  }

  // 寫信給我：開郵件 app，主旨和 iOS 版本先帶好（使用者看得到、可以刪）。開不了（沒設郵件帳號）就給信箱和「複製」
  async function mail() {
    const subject = encodeURIComponent(`茄記 ${VERSION} 回饋`);
    const body = encodeURIComponent(`\n\n（iOS ${Platform.Version}）`);
    try {
      await Linking.openURL(`mailto:${MAIL}?subject=${subject}&body=${body}`);
    } catch {
      ui.ask('開不了郵件', `寫到這個信箱就可以：${MAIL}`, { label: '複製信箱', fn: () => { Clipboard.setStringAsync(MAIL).then(() => ui.toast('已複製信箱'), () => {}); } }, '關閉');
    }
  }
  const open = (url: string) => { Linking.openURL(url).catch(() => ui.alert('打不開', '等一下再試一次')); };

  const noPrice = !full && !f.price && f.priceErr;
  const chev = <Sym name="chevron.right" size={12} color={c.textSecondary} />;
  const fullRight = f.busy ? <ActivityIndicator color={c.textSecondary} />
    : full ? <Text style={[st.right, { color: c.textSecondary }]}>已解鎖 ✓</Text>
      : <>{f.price ? <Text style={[st.right, { color: c.textSecondary }]}>{f.price}</Text> : null}{chev}</>;
  const fullA11y = noPrice ? `${NAME}，${NO_PRICE}` : f.price ? `${NAME}，${f.price}` : NAME;

  // iCloud 同步那行下面的說明
  const at = cloudSyncedAt();
  const syncFoot = !full ? '完整版功能。換手機、刪掉重裝，紙都會回來。'
    : !syncOn ? '同步關著，紙只存在這支手機。iCloud 雲碟裡原本的檔案都還在。'
      : !drive ? 'iCloud 雲碟沒開，紙只存在這支手機。到「設定 › 你的名字 › iCloud › iCloud 雲碟」打開。'
        : at ? `已同步・${ago(at)}` : '同步開著。打開茄記時會自己同步。';

  const about: ReactNode[] = [
    <Row key="mail" text="寫信給我" right={chev} onPress={mail} />,
    <Row key="rate" text="給茄記評分" right={chev} onPress={() => open(REVIEW_URL)} />,
  ];
  if (PRIVACY_URL) about.push(<Row key="privacy" text="隱私權政策" right={chev} onPress={() => open(PRIVACY_URL)} />);

  return (
    <View style={{ flex: 1, backgroundColor: c.page }} collapsable={false}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={listStyles.wrap}>
        {Platform.OS === 'ios' && <Text style={[st.title, { color: c.textPrimary }]} accessibilityRole="header">{title}</Text>}
        <WebTop title={title} left={<GlassBtn icon="chevron.left" label="返回" onPress={() => router.back()} />} />

        <ListGroup>
          {[
            <Row key="full" text={NAME} sub={noPrice ? NO_PRICE : 'iCloud 同步、小工具、控制中心'} right={fullRight} a11y={fullA11y}
              onPress={full ? undefined : openFull} disabled={f.busy} />,
            <Row key="restore" text="恢復購買" onPress={restore} disabled={f.busy} />,
          ]}
        </ListGroup>

        <ListGroup title="iCloud 同步">
          {[
            full
              ? <Row key="sync" text="iCloud 同步" right={<Switch value={syncOn} onValueChange={setSyncOn} accessibilityLabel="iCloud 同步" />} />
              : <Row key="sync" text="iCloud 同步" a11y="iCloud 同步，完整版功能" onPress={openFull}
                  right={<Sym name="lock.fill" size={17} color={c.textSecondary} />} />,
          ]}
        </ListGroup>
        <Text style={[st.foot, { color: c.textSecondary }]}>{syncFoot}</Text>

        <ListGroup title="關於">{about}</ListGroup>
        <Text style={[st.foot, { color: c.textSecondary }]}>{`茄記 ${VERSION}・不蒐集任何資料`}</Text>
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
  foot: { ...T.font.footnote, marginTop: T.space.s, marginHorizontal: T.space.l },
});

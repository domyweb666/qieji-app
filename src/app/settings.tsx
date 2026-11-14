// 「設定」（1.1，2026-11-14）：從目錄面板最下面那列進來，樣子照最近刪除（頁名畫在內容裡，原因見 _layout）。
// 順序照《蔬菜家族 App 共用基本元素規格》：一般 → 資料 → 購買 → 支援 → 關於 → 頁尾。用不到的列不顯示，整區沒東西就整區不顯示。
// › 是 app 裡的下一頁，↗ 是跳出 app。每一列：圖示＋名稱＋右邊狀態或箭頭。
// 茄記的例外（多米定）：匯出／匯入不做；蔬菜家族清單內建不連網；語言、通知用不到。
// 價格用 App Store 傳回來的字，不寫死；判斷規則在 lib/full.ts、接原生在 lib/iap.ts、開關功能在 lib/access.ts。
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import { ListGroup, listStyles } from '../components/NoteList';
import { ui } from '../components/Overlay';
import { Sym } from '../components/Sym';
import { GlassBtn, WebTop } from '../components/WebBars';
import { setSyncOn, useSyncOn } from '../lib/access';
import { store } from '../lib/store';
import { setTextSize, TEXT_SIZES, textSizeLabel, useTextSize } from '../lib/textSize';
import { cloudOn, cloudSyncedAt } from '../lib/cloud';
import { FAMILY } from '../lib/family';
import { loadPrice, restoreFull, useFull } from '../lib/iap';
import { APP_URL, FB_URL, IG_URL, MAIL, PRIVACY_URL, REVIEW_URL, SITE_URL } from '../lib/links';
import { LOOK_LABEL, setLook, useLook, type Look } from '../lib/look';
import { ago } from '../lib/model';
import { T, useColors } from '../lib/tokens';

const APP = '茄記';
const NAME = '茄記完整版';
const LOGO = require('../../assets/icon.png');
const FB_ICON = require('../../assets/img/social-fb.png');
const IG_ICON = require('../../assets/img/social-ig.png');
const TAGLINE = '想到就記，沒有到期日，也不會催你';
const NO_PRICE = '連不上 App Store，價格讀不到';
const VERSION = Constants.expoConfig?.version ?? '';
const LANG = Intl.DateTimeFormat().resolvedOptions().locale;
// 回報問題用的版本資訊：意見回饋信最下面帶著、長按頁尾可以複製
// 建置號、機型要原生模組（expo-application、expo-device）；舊開發版沒有就不帶
let BUILD = '', MODEL = '';
if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 舊開發版沒有這兩個原生模組，載不到要接得住
    BUILD = (require('expo-application') as typeof import('expo-application')).nativeBuildVersion ?? '';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    MODEL = (require('expo-device') as typeof import('expo-device')).modelName ?? '';
  } catch { /* 沒有就不帶 */ }
}
const VER_LINE = `${APP} ${VERSION}${BUILD ? ` (${BUILD})` : ''}`;
const DIAG = `App：${VER_LINE}\niOS：${Platform.Version}${MODEL ? `\n機型：${MODEL}` : ''}\n語言：${LANG}`;

// 一列：圖示＋名稱（可以有第二行小字）＋右邊放東西。沒給 onPress 就是不能點的列
function Row({ icon, text, sub, right, onPress, disabled, a11y, danger }: {
  icon: SFSymbol; text: string; sub?: string; right?: ReactNode; onPress?: () => void; disabled?: boolean; a11y?: string; danger?: boolean;
}) {
  const c = useColors();
  const body = (
    <>
      <View style={st.ico}><Sym name={icon} size={20} color={danger ? c.danger : c.textSecondary} /></View>
      <View style={st.texts}>
        <Text style={[st.name, { color: danger ? c.danger : c.textPrimary }]}>{text}</Text>
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
  const look = useLook();
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
  // 字級（完整版）：沒買的人看不到這一列（2026-11-14 多米：沒買還列出來，看了煩。要買從「茄記完整版」那列進去，付費頁有列出來）
  const tk = useTextSize();
  const pickSize = () => (full
    ? ui.sheet(TEXT_SIZES.map(s => ({ label: s.label, on: s.k === tk, fn: () => setTextSize(s.k) })), '紙上的字級')
    : openFull());
  const pickLook = () => ui.sheet((['system', 'light', 'dark'] as Look[]).map(v => ({ label: LOOK_LABEL[v], on: v === look, fn: () => setLook(v) })), '外觀');

  async function restore() {
    const r = await restoreFull();
    if (r === 'cancel' || r === 'busy') return;
    if (r === 'ok') ui.toast('已恢復你的購買');
    else if (r === 'none') ui.alert('沒有找到購買紀錄', `這個 Apple 帳號沒有買過${NAME}。用別的 Apple 帳號買的話，先到 App Store 換成那個帳號再試`);
    else if (r === 'unverified') ui.alert('Apple 傳回的購買記錄驗不過', '先當作沒買。等一下再按一次「恢復購買」');
    else ui.alert('連不上 App Store', '等一下再試一次');
  }

  // 意見回饋：開郵件 app，主旨一眼看得出是哪個 app，版本資訊放最下面（使用者看得到、可以刪）。開不了（沒設郵件帳號）就給信箱和「複製」
  async function feedback() {
    const subject = encodeURIComponent(`[${APP}] 意見回饋`);
    const body = encodeURIComponent(`（請在這裡寫下你的想法）\n\n\n\n——\n${DIAG}`);
    try {
      await Linking.openURL(`mailto:${MAIL}?subject=${subject}&body=${body}`);
    } catch {
      ui.ask('開不了郵件', `寫到這個信箱就可以：${MAIL}`, { label: '複製信箱', fn: () => { Clipboard.setStringAsync(MAIL).then(() => ui.toast('已複製信箱'), () => {}); } }, '關閉');
    }
  }
  const open = (url: string) => { Linking.openURL(url).catch(() => ui.alert('打不開', '等一下再試一次')); };
  const share = () => { Share.share({ message: `我在用${APP}：${TAGLINE} ${APP_URL}` }).catch(() => {}); };
  const copyDiag = () => { Clipboard.setStringAsync(DIAG).then(() => ui.toast('已複製版本資訊'), () => {}); };

  // 清除所有資料（片 F2）：只清這支手機。兩步確認：第一步講會刪什麼、iCloud 那邊會怎樣，第二步紅字按鈕才真的刪
  function reset() {
    const cloud = full && syncOn
      ? 'iCloud 同步會先關掉。iCloud 雲碟和其他裝置上的清單不會被動到，之後重新打開同步就會回來。'
      : full ? 'iCloud 同步現在關著，iCloud 雲碟裡原本的檔案不會被動到。'
        : '你沒有 iCloud 同步，刪掉之後找不回來。';
    ui.ask('要清除所有資料嗎？', `這支手機上所有清單和最近刪除都會刪除，無法復原。${cloud}`, { label: '繼續', fn: () => {
      ui.confirm('真的要刪除這支手機上的所有資料？', async () => {
        if (full && syncOn) setSyncOn(false); // 先停同步，不然下一次拉取又全部回來
        const ok = await store.wipe();
        if (!ok) { ui.alert('沒有清成功', '資料沒有被動到一半：再試一次，或把茄記滑掉重開'); return; }
        if (router.canDismiss()) router.dismissAll();
        ui.toast('已清除這支手機上的資料');
      }, '刪除所有資料');
    } }, '取消');
  }

  const noPrice = !full && !f.price && f.priceErr;
  const next = <Sym name="chevron.right" size={12} color={c.textSecondary} />;
  const out = <Sym name="arrow.up.right" size={12} color={c.textSecondary} />;
  const state = (t: string) => <Text style={[st.right, { color: c.textSecondary }]}>{t}</Text>;
  const fullRight = f.busy ? <ActivityIndicator color={c.textSecondary} />
    : full ? state('已解鎖 ✓')
      : <>{f.price ? state(f.price) : null}{next}</>;
  const fullA11y = noPrice ? `${NAME}，${NO_PRICE}` : f.price ? `${NAME}，${f.price}` : NAME;

  // iCloud 同步那行下面的說明
  const at = cloudSyncedAt();
  const syncFoot = !full ? '完整版功能。換手機、刪掉重裝，紙都會回來。'
    : !syncOn ? '同步關著，紙只存在這支手機。iCloud 雲碟裡原本的檔案都還在。'
      : !drive ? 'iCloud 雲碟沒開，紙只存在這支手機。到「設定 › 你的名字 › iCloud › iCloud 雲碟」打開。'
        : at ? `已同步・${ago(at)}` : '同步開著。打開茄記時會自己同步。';

  const about: ReactNode[] = [];
  if (FAMILY.length) about.push(<Row key="family" icon="leaf" text="蔬菜家族的其他 app" right={next} onPress={() => router.push('/family')} />);
  if (PRIVACY_URL) about.push(<Row key="privacy" icon="hand.raised" text="隱私權政策" right={out} onPress={() => open(PRIVACY_URL)} />);
  about.push(<Row key="licenses" icon="doc.text" text="開源授權" right={next} onPress={() => router.push('/licenses')} />);

  return (
    <View style={{ flex: 1, backgroundColor: c.page }} collapsable={false}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={listStyles.wrap}>
        {Platform.OS === 'ios' && <Text style={[st.title, { color: c.textPrimary }]} accessibilityRole="header">{title}</Text>}
        <WebTop title={title} left={<GlassBtn icon="chevron.left" label="返回" onPress={() => router.back()} />} />

        <ListGroup title="一般">
          {[
            <Row key="look" icon="circle.lefthalf.filled" text="外觀" a11y={`外觀，${LOOK_LABEL[look]}`} right={<>{state(LOOK_LABEL[look])}{next}</>} onPress={pickLook} />,
            ...(full ? [<Row key="size" icon="textformat.size" text="紙上的字級" a11y={`紙上的字級，${textSizeLabel(tk)}`} onPress={pickSize}
              right={<>{state(textSizeLabel(tk))}{next}</>} />] : []),
          ]}
        </ListGroup>

        <ListGroup title="資料">
          {[
            full
              ? <Row key="sync" icon="icloud" text="iCloud 同步" right={<Switch value={syncOn} onValueChange={setSyncOn} accessibilityLabel="iCloud 同步" />} />
              : <Row key="sync" icon="icloud" text="iCloud 同步" a11y="iCloud 同步，完整版功能" onPress={openFull}
                  right={<Sym name="lock.fill" size={17} color={c.textSecondary} />} />,
          ]}
        </ListGroup>
        <Text style={[st.foot, { color: c.textSecondary }]}>{syncFoot}</Text>
        {/* 清除所有資料自己一塊、紅字，跟上面的開關隔開，免得手滑 */}
        <ListGroup>
          {[<Row key="reset" icon="trash" text="清除所有資料" danger onPress={reset} />]}
        </ListGroup>

        <ListGroup title="購買">
          {[
            <Row key="full" icon="sparkles" text={NAME} sub={noPrice ? NO_PRICE : undefined} right={fullRight} a11y={fullA11y}
              onPress={full ? undefined : openFull} disabled={f.busy} />,
            <Row key="restore" icon="arrow.clockwise" text="恢復購買" onPress={restore} disabled={f.busy} />,
          ]}
        </ListGroup>

        <ListGroup title="支援">
          {[
            <Row key="feedback" icon="envelope" text="意見回饋" right={next} onPress={feedback} />,
            <Row key="rate" icon="star" text="在 App Store 給我們評分" right={out} onPress={() => open(REVIEW_URL)} />,
            <Row key="share" icon="square.and.arrow.up" text="分享給朋友" right={out} onPress={share} />,
            <Row key="news" icon="gift" text="新功能" right={next} onPress={() => router.push('/news')} />,
          ]}
        </ListGroup>

        <ListGroup title="關於">{about}</ListGroup>

        {/* 頁尾（2026-11-15 多米照 minical 的設定頁）：茄記圖示、版本、Made by DOMYWEB，下面一排網站／Facebook／Instagram。
            長按上面那一塊複製版本資訊（回報問題用） */}
        <Pressable onLongPress={copyDiag} accessibilityRole="button" accessibilityLabel={`${APP} ${VERSION}，長按複製版本資訊`} style={st.footer}>
          <Image source={LOGO} style={st.logo} contentFit="cover" accessible={false} />
          <Text style={[st.footText, { color: c.textSecondary }]}>{VER_LINE}</Text>
          <Text style={[st.footText, { color: c.textSecondary }]}>Made by DOMYWEB</Text>
        </Pressable>
        <View style={st.social}>
          <Pressable onPress={() => open(SITE_URL)} accessibilityRole="link" accessibilityLabel="DOMYWEB 網站"
            style={({ pressed }) => [st.socialBtn, pressed && { opacity: T.motion.pressDim }]}>
            <Sym name="globe" size={T.shape.socialIcon} color={c.textSecondary} />
          </Pressable>
          <Pressable onPress={() => open(FB_URL)} accessibilityRole="link" accessibilityLabel="Facebook"
            style={({ pressed }) => [st.socialBtn, pressed && { opacity: T.motion.pressDim }]}>
            <Image source={FB_ICON} style={st.socialImg} tintColor={c.textSecondary} accessible={false} />
          </Pressable>
          <Pressable onPress={() => open(IG_URL)} accessibilityRole="link" accessibilityLabel="Instagram"
            style={({ pressed }) => [st.socialBtn, pressed && { opacity: T.motion.pressDim }]}>
            <Image source={IG_ICON} style={st.socialImg} tintColor={c.textSecondary} accessible={false} />
          </Pressable>
        </View>
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
  right: { ...T.font.body },
  foot: { ...T.font.footnote, marginTop: T.space.s, marginHorizontal: T.space.l },
  footer: { alignItems: 'center', gap: T.space.xs, marginTop: T.space.xxl, minHeight: T.shape.hitMin, justifyContent: 'center' },
  logo: { width: T.shape.aboutLogo, height: T.shape.aboutLogo, borderRadius: T.shape.aboutLogo * T.shape.tileRadiusRatio, marginBottom: T.space.s },
  social: { flexDirection: 'row', justifyContent: 'center', gap: T.space.s, marginTop: T.space.m },
  socialBtn: { width: T.shape.hitMin, height: T.shape.hitMin, alignItems: 'center', justifyContent: 'center' },
  socialImg: { width: T.shape.socialIcon, height: T.shape.socialIcon },
  footText: { ...T.font.footnote },
});

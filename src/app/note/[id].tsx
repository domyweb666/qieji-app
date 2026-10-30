// 清單編輯。上面的標題列跟首頁同一套（奶油白圓鈕：‹ 清單名稱 顏色點 ⋯），用原生畫；整頁底色是筆記顏色。
// 中間的清單（新增一行、打字、滑動劃掉／刪除、拖曳排序、鍵盤）直接用網頁版的程式畫，手感跟網頁版一樣。
// 存檔和 ⋯ 選單在這裡做，網頁那邊改了什麼會傳過來（見 components/ListWeb）。
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, useNavigation, type NativeStackNavigationProp } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Share, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Act } from '../../components/Acts';
import { ListWeb, type ListMsg, type ListWebHandle } from '../../components/ListWeb';
import { ui } from '../../components/Overlay';
import { PopMenu } from '../../components/PopMenu';
import { GlassBtn } from '../../components/WebBars';
import { col, convertNote, isEmpty, plain, type Item, type Note } from '../../lib/model';
import { store, useStore } from '../../lib/store';
import { C } from '../../lib/theme';

export default function NoteScreen() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  // 關閉空白筆記時它會被移出 state，這裡留住它，讓退場動畫期間畫面不會突然變空
  const keep = useRef<Note | undefined>(undefined);
  if (!keep.current) {
    keep.current = store.s.notes.find(n => n.id === id);
    // 已經沒有記事本了：舊的文字筆記打開時轉成清單（一段一行）
    if (keep.current?.type === 'text') { convertNote(keep.current); store.save(); }
  }
  if (!keep.current) return <View style={{ flex: 1, backgroundColor: C.page }} />;
  return <Editor n={keep.current} fresh={fresh === '1'} />;
}

function Editor({ n, fresh }: { n: Note; fresh: boolean }) {
  useStore();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const closed = useRef(false);
  const mounted = useRef(true);
  const titleRef = useRef<TextInputInstance>(null);
  const web = useRef<ListWebHandle>(null);
  const [menu, setMenu] = useState(false);
  const c = col(n.color);
  // 網頁那邊的清單換掉重畫（⋮ 選單改了清單、復原刪除之後）
  const pushItems = () => web.current?.send({ t: 'set', items: n.items, hint: !store.hintSeen });

  // quiet＝打字：只存檔不重畫。app 正要進背景時立刻寫入，不等計時器
  function touch(quiet?: boolean) {
    n.updated = Date.now();
    if (!quiet) store.change();
    else if (AppState.currentState === 'active') store.save();
    else store.flush();
  }

  /* ---------- 網頁傳來的訊息 ---------- */
  function onMessage(m: ListMsg) {
    if (closed.current) return;
    if (m.t === 'texts') {
      for (const [id, t] of m.v) { const it = n.items.find(i => i.id === id); if (it) it.t = t; }
      touch(true);
    } else if (m.t === 'items') {
      n.items = m.items;
      touch(true);
    } else if (m.t === 'removed') {
      if (m.item.t.trim()) ui.toast('已刪除', { label: '復原', fn: () => {
        if (!mounted.current || closed.current) return;
        n.items.splice(Math.min(m.idx, n.items.length), 0, m.item);
        touch();
        pushItems();
      } });
    } else if (m.t === 'seen') {
      store.markHint();
    } else if (m.t === 'haptic') {
      Haptics.selectionAsync().catch(() => {});
    }
  }
  // 從顏色面板回來換了顏色，網頁那塊也跟著換
  useEffect(() => { web.current?.send({ t: 'theme', bg: c.bg, hd: c.hd, rule: c.rule }); }, [c.bg, c.hd, c.rule]);
  // app 要進背景時，叫網頁把還沒送的字馬上送過來
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s !== 'active') web.current?.send({ t: 'flush' }); });
    return () => sub.remove();
  }, []);

  /* ---------- open / close ---------- */
  function closeNote() {
    if (closed.current) return;
    closed.current = true;
    Keyboard.dismiss();
    n.items = n.items.filter(i => i.t.trim());
    if (isEmpty(n)) store.s.notes = store.s.notes.filter(x => x !== n);
    store.change();
    store.flush();
  }
  // 離開畫面（返回鍵、iOS 側滑返回）時收尾：畫面卸載就是筆記關閉
  useEffect(() => {
    mounted.current = true;
    // 萬一 effect 被重跑（開發模式），把剛被當成空白移掉的筆記放回去，不能讓它消失
    if (closed.current && !n.deleted && !store.s.notes.some(x => x.id === n.id)) store.s.notes.push(n);
    closed.current = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    let off: (() => void) | undefined;
    // 新的清單先停在標題，不自動多一行；要寫點子就點「新增一行」。
    // 等推進來的動畫跑完才叫鍵盤，兩個動畫疊在一起會卡；網頁預覽沒有這個事件，靠計時器補
    if (fresh) {
      const focus = () => { clearTimeout(t); off?.(); if (mounted.current) titleRef.current?.focus(); };
      off = navigation.addListener('transitionEnd', e => { if (!e.data.closing) focus(); });
      t = setTimeout(focus, 700);
    }
    store.setLast(n.id); // 關掉 app 時還開著這則，下次打開就直接回到這裡
    return () => { clearTimeout(t); off?.(); mounted.current = false; closeNote(); store.setLast(null); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- actions ---------- */
  const shareText = () => (n.title ? n.title + '\n\n' : '') + plain(n);
  const anyDone = n.items.some(i => i.done);
  // 收鍵盤（網頁那邊收鍵盤時會順便把還沒送的字送過來）
  const hideKb = () => { Keyboard.dismiss(); web.current?.send({ t: 'blur' }); };
  function back() { web.current?.send({ t: 'flush' }); router.back(); }
  function togglePin() { n.pinned = !n.pinned; touch(); ui.toast(n.pinned ? '已釘選' : '已取消釘選'); }
  function share() { Share.share({ message: shareText() }).catch(() => {}); }
  function del() {
    n.deleted = true; n.pinned = false;
    n.items = n.items.filter(i => i.t.trim());
    const empty = isEmpty(n);
    if (empty) store.s.notes = store.s.notes.filter(x => x !== n);
    closed.current = true;
    store.change();
    router.back();
    if (!empty) ui.toast('已移到最近刪除', { label: '復原', fn: () => { n.deleted = false; store.change(); } });
  }
  // 顏色：從下方升起一個色塊面板
  function pickColor() { hideKb(); router.push({ pathname: '/color/[id]', params: { id: n.id } }); }
  const setItems = (items: Item[]) => { n.items = items; touch(); pushItems(); };
  const moreActs: Act[] = [
    { label: '分享', icon: 'square.and.arrow.up', fn: share },
    { label: n.pinned ? '取消釘選' : '釘選', icon: n.pinned ? 'pin.slash' : 'pin', fn: togglePin },
    { label: '清單', inline: true, hidden: n.items.length < 2 && !anyDone, sub: [
      { label: '上下順序反轉', icon: 'arrow.up.arrow.down', hidden: n.items.length < 2, fn: () => setItems([...n.items].reverse()) },
      { label: '全部恢復（取消劃線）', icon: 'arrow.uturn.backward', hidden: !anyDone, fn: () => setItems(n.items.map(i => ({ ...i, done: false }))) },
      { label: '清掉劃掉的行', icon: 'eraser', hidden: !anyDone, fn: () => {
        const before = n.items;
        const left = before.filter(i => !i.done);
        setItems(left);
        ui.toast(`已清掉 ${before.length - left.length} 行`, { label: '復原', fn: () => {
          if (!mounted.current || closed.current) return;
          setItems(before);
        } });
      } },
    ] },
    { label: '複製全文', icon: 'doc.on.doc', fn: () => { Clipboard.setStringAsync(shareText()).then(() => ui.toast('已複製'), () => ui.toast('複製失敗')); } },
    { label: '刪除', icon: 'trash', destructive: true, fn: del },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} collapsable={false}>
      {/* 標題列跟首頁同一套：‹ 清單名稱 顏色點 ⋯，底色跟整頁一樣是筆記顏色；顏色點跟首頁列表的點同一種。
          字級固定，不跟著系統字體大小放大（網頁版也不會） */}
      <View style={[st.bar, { paddingTop: insets.top + 6 }]}>
        <GlassBtn icon="chevron.left" label="返回" onPress={back} />
        <TextInput ref={titleRef} defaultValue={n.title} placeholder="標題" allowFontScaling={false}
          placeholderTextColor={C.placeholder}
          style={st.title} returnKeyType="next" submitBehavior="submit"
          onChangeText={v => { n.title = v; touch(true); }}
          onSubmitEditing={() => {
            // 有行就跳到第一行，沒有就收鍵盤（不自動多一行）
            Keyboard.dismiss();
            if (n.items[0]) web.current?.send({ t: 'focusFirst' });
          }} />
        <GlassBtn label={`顏色：${c.hue}`} onPress={pickColor}>
          <View style={[st.dot, { backgroundColor: c.hd }]} />
        </GlassBtn>
        <GlassBtn icon="ellipsis" label="更多" onPress={() => { hideKb(); setMenu(true); }} />
      </View>

      <ListWeb ref={web} init={{ items: n.items, bg: c.bg, hd: c.hd, rule: c.rule, hint: !store.hintSeen }} onMessage={onMessage} />

      {menu && <PopMenu acts={moreActs} top={insets.top + 58} onClose={() => setMenu(false)} />}
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 6 },
  title: { flex: 1, minWidth: 0, height: 44, fontSize: 20, fontWeight: '700', color: C.label, paddingVertical: 0, paddingHorizontal: 4 },
  // 跟首頁列表的顏色點同一種圓點，大一點好按
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(46,34,51,0.15)' },
});

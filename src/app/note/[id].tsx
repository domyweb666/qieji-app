// 清單編輯。上面的標題列照網頁版的樣子（← 清單名稱 色塊 ⋮），用原生畫；
// 中間的清單（新增一行、打字、滑動劃掉／刪除、拖曳排序、鍵盤）直接用網頁版的程式畫，手感跟網頁版一樣。
// 存檔和 ⋮ 選單在這裡做，網頁那邊改了什麼會傳過來（見 components/ListWeb）。
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useReducer, useRef, useState } from 'react';
import { AppState, Keyboard, Pressable, Share, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Act } from '../../components/Acts';
import { Icon } from '../../components/Icon';
import { ListWeb, type ListMsg, type ListWebHandle } from '../../components/ListWeb';
import { ui } from '../../components/Overlay';
import { PopMenu } from '../../components/PopMenu';
import { ago, col, convertNote, fullDate, isEmpty, plain, type Item, type Note } from '../../lib/model';
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
  const closed = useRef(false);
  const mounted = useRef(true);
  const titleRef = useRef<TextInputInstance>(null);
  const web = useRef<ListWebHandle>(null);
  const [menu, setMenu] = useState(false);
  const c = col(n.color);
  // 標題列用筆記顏色最深的那一階；黑豆色太深，字改白的
  const ink = n.color === 'black' ? '#fff' : '#1f1f1f';
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
    // 新的清單先停在標題，不自動多一行；要寫點子就點「新增一行」
    if (fresh) t = setTimeout(() => titleRef.current?.focus(), 60);
    store.setLast(n.id); // 關掉 app 時還開著這則，下次打開就直接回到這裡
    return () => { clearTimeout(t); mounted.current = false; closeNote(); store.setLast(null); };
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
      { label: '清掉劃掉的行', icon: 'eraser', hidden: !anyDone, fn: () => setItems(n.items.filter(i => !i.done)) },
    ] },
    { label: '複製全文', icon: 'doc.on.doc', fn: () => { Clipboard.setStringAsync(shareText()).then(() => ui.toast('已複製'), () => ui.toast('複製失敗')); } },
    { label: '刪除', icon: 'trash', destructive: true, fn: del },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} collapsable={false}>
      {/* 標題列照網頁版：← 清單名稱 色塊 ⋮。字級固定，不跟著系統字體大小放大（網頁版也不會） */}
      <View style={[st.bar, { paddingTop: insets.top + 6, backgroundColor: c.hd }]}>
        <Pressable style={({ pressed }) => [st.ib, pressed && st.ibOn]} onPress={back} accessibilityLabel="返回">
          <Icon name="back" size={26} color={ink} />
        </Pressable>
        <TextInput ref={titleRef} defaultValue={n.title} placeholder="標題" allowFontScaling={false}
          placeholderTextColor={n.color === 'black' ? 'rgba(255,255,255,.45)' : 'rgba(31,31,31,.45)'}
          style={[st.title, { color: ink }]} returnKeyType="next" submitBehavior="submit"
          onChangeText={v => { n.title = v; touch(true); }}
          onSubmitEditing={() => {
            // 有行就跳到第一行，沒有就收鍵盤（不自動多一行）
            Keyboard.dismiss();
            if (n.items[0]) web.current?.send({ t: 'focusFirst' });
          }} />
        <Pressable onPress={pickColor} accessibilityLabel={`顏色：${c.hue}`} hitSlop={8}
          style={({ pressed }) => [st.swatch, { backgroundColor: vivid(c.hd) }, pressed && { opacity: 0.7 }]} />
        <Pressable style={({ pressed }) => [st.ib, pressed && st.ibOn]} onPress={() => { hideKb(); setMenu(true); }} accessibilityLabel="更多">
          <Icon name="dots" size={26} color={ink} />
        </Pressable>
      </View>
      <Meta n={n} />

      <ListWeb ref={web} init={{ items: n.items, bg: c.bg, hd: c.hd, rule: c.rule, hint: !store.hintSeen }} onMessage={onMessage} />

      {menu && <PopMenu acts={moreActs} top={insets.top + 58} onClose={() => setMenu(false)} />}
    </View>
  );
}

// 打字只存檔不重畫整頁，所以這一小塊自己每 15 秒更新一次「剛剛／幾分鐘前」
function Meta({ n }: { n: Note }) {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => { const t = setInterval(tick, 15000); return () => clearInterval(t); }, []);
  return (
    <View style={st.meta}>
      <Text style={st.metaText} allowFontScaling={false}>{ago(n.updated)}</Text>
      <Text style={st.metaText} allowFontScaling={false}>{fullDate(n.updated)}</Text>
    </View>
  );
}

// 色塊比標題列的底色再飽和、暗一點才看得出來（網頁版是 CSS 的 saturate(1.5) brightness(.9)）
function vivid(hex: string) {
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(1 + i, 3 + i), 16));
  const s = 1.5;
  const out = [
    (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b,
  ].map(v => Math.round(Math.max(0, Math.min(255, v)) * 0.9));
  return `rgb(${out.join(',')})`;
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, paddingBottom: 6 },
  ib: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  ibOn: { backgroundColor: 'rgba(0,0,0,0.08)' },
  title: { flex: 1, minWidth: 0, height: 44, fontSize: 23, fontWeight: '500', paddingVertical: 0, paddingHorizontal: 6 },
  swatch: { width: 30, height: 30, borderRadius: 7, marginHorizontal: 6, borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 0.5, shadowOffset: { width: 0, height: 0 } },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 14 },
  metaText: { fontSize: 15, color: 'rgba(0,0,0,0.5)' },
});

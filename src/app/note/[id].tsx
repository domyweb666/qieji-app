// 清單編輯。上面的標題列（返回、清單名稱、分享、⋯）是 iOS 原生的；
// 中間的清單（新增一行、每一行的打字、滑動劃掉／刪除、拖曳排序、鍵盤）直接用網頁版的程式畫，手感跟網頁版一樣。
// 存檔、開花結茄子的計數、⋯ 選單都在這裡做，網頁那邊改了什麼會傳過來（見 components/ListWeb）。
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Keyboard, Pressable, Share, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SFSymbol } from 'sf-symbols-typescript';
import type { Act } from '../../components/Acts';
import { ListWeb, type ListMsg, type ListWebHandle } from '../../components/ListWeb';
import { ui } from '../../components/Overlay';
import { PopMenu } from '../../components/PopMenu';
import { Sym } from '../../components/Sym';
import { ago, bloom, col, convertNote, fullDate, isEmpty, plain, toggleStrike, type Item, type Note } from '../../lib/model';
import { store, useStore } from '../../lib/store';
import { C, F } from '../../lib/theme';

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
  // 整頁跟著筆記的顏色走；上方標題列和分隔線用同色系深一階
  const tone = { bg: col(n.color).bg, rule: col(n.color).rule };
  // 網頁那邊的清單換掉重畫（⋯ 選單改了清單、劃掉、復原刪除之後）
  const pushItems = () => web.current?.send({ t: 'set', items: n.items, hint: !store.hintSeen });

  // 開過花的行（整個打開期間都記著）：網頁那邊送回來的舊資料（復原、復原刪除）不能把它變回沒開過，不然會重複計數
  const bloomed = useRef<Set<string> | null>(null);
  if (!bloomed.current) bloomed.current = new Set(n.items.filter(i => i.b).map(i => i.id));
  const remember = () => n.items.forEach(i => { if (i.b) bloomed.current!.add(i.id); });

  function touch(quiet?: boolean) {
    n.updated = Date.now();
    if (quiet) store.save(); else store.change();
  }

  /* ---------- 網頁傳來的訊息 ---------- */
  function onMessage(m: ListMsg) {
    if (closed.current) return;
    if (m.t === 'items') {
      n.items = m.items.map(i => ({ ...i, b: i.b || bloomed.current!.has(i.id) }));
      touch(true);
    } else if (m.t === 'strike') {
      const it = n.items.find(i => i.id === m.id);
      if (it) toggleStrike(store.s, it);
      store.markHint();
      touch();
      pushItems();
    } else if (m.t === 'removed') {
      store.markHint();
      if (m.item.t.trim()) ui.toast('已刪除', { label: '復原', fn: () => {
        if (!mounted.current || closed.current) return;
        n.items.splice(Math.min(m.idx, n.items.length), 0, { ...m.item, b: m.item.b || bloomed.current!.has(m.item.id) });
        touch();
        pushItems();
      } });
    } else if (m.t === 'focus') {
      if (bloom(store.s, n, m.id).length) store.save();
    } else if (m.t === 'blur') {
      if (bloom(store.s, n).length) store.save();
    } else if (m.t === 'haptic') {
      Haptics.selectionAsync().catch(() => {});
    }
    remember();
  }
  // 從顏色面板回來換了顏色，網頁那塊也跟著換
  useEffect(() => { web.current?.send({ t: 'theme', bg: tone.bg, rule: tone.rule }); }, [tone.bg, tone.rule]);

  /* ---------- open / close ---------- */
  function closeNote() {
    if (closed.current) return;
    closed.current = true;
    Keyboard.dismiss();
    bloom(store.s, n);
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
  const hideKb = () => { Keyboard.dismiss(); web.current?.send({ t: 'blur' }); };
  function togglePin() { n.pinned = !n.pinned; touch(); ui.toast(n.pinned ? '已釘選' : '已取消釘選'); }
  function share() { hideKb(); Share.share({ message: shareText() }).catch(() => {}); }
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
  function pickColor() { router.push({ pathname: '/color/[id]', params: { id: n.id } }); }
  const setItems = (items: Item[]) => { n.items = items; touch(); pushItems(); };
  const moreActs: Act[] = [
    { label: '顏色', icon: 'paintpalette', fn: pickColor },
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
    <View style={{ flex: 1, backgroundColor: tone.bg }} collapsable={false}>
      {/* 上方一條窄窄的標題列：返回、清單名稱、分享、更多，全部在同一行 */}
      <View style={[st.bar, { paddingTop: insets.top, backgroundColor: tone.rule }]}>
        <BarBtn icon="chevron.left" label="返回" onPress={() => router.back()} />
        <TextInput ref={titleRef} defaultValue={n.title} placeholder="清單名稱"
          placeholderTextColor={C.placeholder} style={st.title} returnKeyType="next" submitBehavior="submit"
          onChangeText={v => { n.title = v; touch(true); }}
          onSubmitEditing={() => {
            // 有行就跳到第一行，沒有就收鍵盤（不自動多一行）
            Keyboard.dismiss();
            if (n.items[0]) web.current?.send({ t: 'focusFirst' });
          }} />
        <BarBtn icon="square.and.arrow.up" label="分享" onPress={share} />
        <BarBtn icon="ellipsis" label="更多" onPress={() => { hideKb(); setMenu(true); }} />
      </View>

      {/* 什麼時候改過：左邊幾分鐘前、右邊日期，也把「新增一行」跟標題列隔開 */}
      <Meta n={n} />

      <ListWeb ref={web} init={{ items: n.items, bg: tone.bg, rule: tone.rule, hint: !store.hintSeen }} onMessage={onMessage} />

      {menu && <PopMenu acts={moreActs} top={insets.top + 46} onClose={() => setMenu(false)} />}
    </View>
  );
}

// 打字只存檔不重畫整頁，所以這一小塊自己每 15 秒更新一次「剛剛／幾分鐘前」
function Meta({ n }: { n: Note }) {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => { const t = setInterval(tick, 15000); return () => clearInterval(t); }, []);
  return (
    <View style={st.meta}>
      <Text style={st.metaText}>{ago(n.updated)}</Text>
      <Text style={st.metaText}>{fullDate(n.updated)}</Text>
    </View>
  );
}

function BarBtn({ icon, label, onPress }: { icon: SFSymbol; label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [st.barBtn, pressed && { opacity: 0.4 }]} onPress={onPress} accessibilityLabel={label} hitSlop={4}>
      <Sym name={icon} size={icon === 'chevron.left' ? 22 : 20} color={C.label} weight={icon === 'chevron.left' ? 'semibold' : 'regular'} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  barBtn: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 2 },
  metaText: { fontSize: F.subhead, color: C.secondary },
  title: { flex: 1, minWidth: 0, height: 46, fontSize: F.title3, fontWeight: '700', color: C.label, paddingVertical: 0, paddingHorizontal: 4 },
});

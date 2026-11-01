// 目錄面板（B3，多米 2026-11-01 晚（二）定）：自己做的、從螢幕上面垂下來的面板，取代系統 formSheet。
// 開：紙的標題區往下拉（跟著手指）、點標題下的把手、行的「搬到…」。收：點下面露出的那截紙、把面板底部把手往上推、點一塊磚。
// 裡面：搜尋、新的一張、色磚、最近刪除、搬行模式（原本 src/app/directory.tsx 整段搬過來）。
// C1（2026-11-02）：磚照座位表（State.order）排，改字不換位、新的一張排最後；「已釘選／其他」兩段拿掉，釘選的磚右上角一個圖釘。
// C3：放不下往右一頁、頁點。C4：長按一塊磚跳選單（顏色、改名字、刪除、編輯目錄），長按後一拖就進抖動、同一頁裡拖換位置；
// 抖動時面板不收（往上推、點露出的紙只會結束抖動），點磚不換紙、不能搜尋、不能翻頁。
// 面板跟紙在同一個畫面（index）裡，紙那邊的手勢才能逐格推它；開到多開由 dirPanel.p（0＝收起、1＝全開）決定。
// D4（2026-11-02 晚，多米選照 iOS 三件）：拖曳改用螢幕座標，目錄的磚和資料夾裡的磚共用一套（useDragPan）：拖到資料夾磚上停一下會打開、
// 放進裡面指定位置；從資料夾拖出框停一下資料夾收起，紙還在手上，放到目錄任一格；資料夾裡換順序。浮起那塊畫在目錄最上層（DragGhost）。
// 2026-11-02 晚（多米真機回報，照 Apple iPhone 使用手冊，見 .uiux/iOS主畫面編輯-官方規範對照.md）：按住格子空白處＝進抖動、抖動中點空白處＝結束；
// 抖動中點資料夾會打開，裡面的紙跟著抖、直接拖；資料夾裡的紙長按選單不再有「移出資料夾」（只用拖的，VoiceOver 動作留著）。
// D3：打開的資料夾裡長按一張後拖，拖出框外放手＝移出資料夾（排在資料夾後面一格，多米選），在框裡放手滑回原位。
// D2：抖動中拖一張停在別張磚正中間半秒＝疊成資料夾（疊在資料夾上＝放進去）；為了到得了正中間，讓位改成停在邊邊或空隙 0.2 秒才讓（多米選照 iOS）。
// D1（2026-11-02）：資料夾。長按紙磚「放進資料夾…」；資料夾磚（名字＋裡面紙的小色塊）跟紙磚一起排、一起拖；點開在目錄上面打開一個框，
// 點名字改名；資料夾裡的紙長按「移出資料夾」。資料夾裡不能拖（D3）
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
  type AccessibilityActionEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance,
} from 'react-native';
import { GestureDetector, useExclusiveGestures, useLongPressGesture, usePanGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation, LinearTransition, makeMutable, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import {
  col, dropNotes, folderOf, intoFolder, isEmpty, label, markDeleted, markRestored, moveItem, newFolder, outOfFolder, placeInFolder, placeTop, renameFolder, reseat,
  seatedEntries, seatedNotes, type ColorKey, type Entry, type Folder, type Note,
} from '../lib/model';
import { newNote, store, useStore } from '../lib/store';
import { haptic, T, useColors, useNoteColors } from '../lib/tokens';
import type { Act } from './Acts';
import { Empty } from './Empty';
import { ui } from './Overlay';
import { togglePin } from './pin';
import { PopMenu } from './PopMenu';
import { Swatches } from './Swatches';
import { Sym } from './Sym';

const M = T.motion, G = T.gesture;
// useAnimatedStyle 的相依陣列只有網頁用得到，iOS 上傳了會一直跳警告（同 Paper）
const WEB_DEPS = Platform.OS === 'web';
// 拖磚時其他磚讓位滑過去（C4）
const TILE_MOVE = LinearTransition.duration(M.tileShift.duration);
// 給手勢（UI 執行緒）呼叫的放模組層級（規矩檔：worklet 裡不准直接叫 tokens 的函式）
const hapticLand = () => haptic('dragDrop');
// 格子裡第 k 格的左上角（兩欄，磚高 TILE、間距 GAP），與拖到哪一格：看被拖那塊的中心落在哪一格
const TILE = T.shape.tile, GAP = T.space.m, EDGE = T.gesture.edgeZone, PRESS_DIM = T.motion.pressDim; // worklet 只抓數字，不抓整個 T（裡面有函式）
const ZONE = T.gesture.stackZone, GROW = T.motion.stackTarget.scale;
// 彈簧設定抄一份自己的：被抓進 worklet 的物件會被鎖住，不讓 tokens 裡的 M、G 被鎖（規矩檔 2026-11-02）
const LIFT_SPRING = { ...M.dragLift.spring }, LAND_SPRING = { ...M.dragLand.spring }, LIFT_SCALE = M.dragLift.scale;
const PUSH_CLOSE = G.pushCloseRatio, FLICK = G.flick;
function slotX(k: number, w: number) { 'worklet'; return (k % 2) * (w + GAP); }
function slotY(k: number) { 'worklet'; return Math.floor(k / 2) * (TILE + GAP); }
// 一個點（相對格子左上角）落在第幾格：兩欄、磚高 TILE、間距 GAP（D4 起拖曳都用螢幕座標算）
function slotIn(lx: number, ly: number, w: number, count: number) {
  'worklet';
  const k = Math.max(0, Math.floor(ly / (TILE + GAP))) * 2 + (lx < w + GAP / 2 ? 0 : 1);
  return Math.min(Math.max(0, count - 1), k);
}

// 拖曳共用的 shared value（D4）。座標都是目錄的座標＝螢幕座標（面板從螢幕頂端開始，全開時沒有位移）：
// x0、y0＝浮起那塊拿起時的左上角；dx、dy＝手指移了多少；sw＝浮起那塊的寬；edge＝在不在左右邊緣；aim＝瞄著哪（見 aimOf）；stackK＝準備疊到這頁第幾格；
// gx、gy＝這頁格子的左上角；gcount＝這頁幾格；glast＝讓出來的那格在這頁第幾格（−1＝不在這頁）；
// fopen＝資料夾開著在對準；bx…bh＝資料夾框；svx、svy＝框裡格子那層的位置；fsy＝框裡捲下去多少；fcount、flast＝資料夾裡幾格、讓出來的是第幾格；
// ready＝這次拿起後 JS 把格子位置、資料夾開沒開寫好了（拿起那一刻手勢先跑、JS 晚一步，寫好之前不算瞄哪）
type DG = Record<'x0' | 'y0' | 'dx' | 'dy' | 'sw' | 'lift' | 'edge' | 'aim' | 'stackK' | 'gx' | 'gy' | 'gcount' | 'glast'
  | 'fopen' | 'bx' | 'by' | 'bw' | 'bh' | 'svx' | 'svy' | 'fsy' | 'fcount' | 'flast' | 'ready', SharedValue<number>>;
function useDG(): DG {
  return {
    x0: useSharedValue(0), y0: useSharedValue(0), dx: useSharedValue(0), dy: useSharedValue(0), sw: useSharedValue(0), lift: useSharedValue(0),
    edge: useSharedValue(0), aim: useSharedValue(0), stackK: useSharedValue(-1), gx: useSharedValue(0), gy: useSharedValue(0),
    gcount: useSharedValue(1), glast: useSharedValue(-1), fopen: useSharedValue(0), bx: useSharedValue(0), by: useSharedValue(0),
    bw: useSharedValue(0), bh: useSharedValue(0), svx: useSharedValue(0), svy: useSharedValue(0), fsy: useSharedValue(0),
    fcount: useSharedValue(1), flast: useSharedValue(0), ready: useSharedValue(0),
  };
}
// aim 的編碼：k＝目錄這頁第 k 格（停一下讓位）；−k−1＝停在第 k 格那張的正中間（停著就疊）；FOLDER_AIM＋k＝資料夾裡第 k 格；
// AIM_OUT＝資料夾開著、手指在框外（停一下收起）；AIM_NONE＝不對準（資料夾剛打開、框還沒量好）
const FOLDER_AIM = 100000, AIM_OUT = -100000, AIM_NONE = -200000;
function aimOf(cx: number, cy: number, dg: DG, gw: number, fw: number) {
  'worklet';
  if (dg.fopen.value) {
    if (!dg.bw.value) return AIM_NONE;
    const inBox = cx >= dg.bx.value && cx <= dg.bx.value + dg.bw.value && cy >= dg.by.value && cy <= dg.by.value + dg.bh.value;
    if (!inBox) return AIM_OUT;
    // 框裡捲下去了，格子跟著往上：加回捲的距離才對得到第幾格（2026-11-02 程式審查）
    return FOLDER_AIM + slotIn(cx - dg.bx.value - dg.svx.value, cy - dg.by.value - dg.svy.value - GAP + dg.fsy.value, fw, dg.fcount.value);
  }
  const lx = cx - dg.gx.value, ly = cy - dg.gy.value;
  const k = slotIn(lx, ly, gw, dg.gcount.value);
  const ox = lx - slotX(k, gw) - gw / 2, oy = ly - slotY(k) - TILE / 2;
  const over = k !== dg.glast.value && Math.abs(ox) < gw * ZONE && Math.abs(oy) < TILE * ZONE;
  return over ? -k - 1 : k;
}

// 目錄的磚、資料夾裡的磚共用的拖（D4）：長按後一拖（抖動中直接拖）拿起來；手指每動一格算一次瞄著哪，變了才回 JS 計時讓位／疊／開關資料夾；
// 放手滑進要放的那格再回 JS 改資料（資料夾開著但手指在框外就不滑，交給 JS）。減少動態：直接到位
type DragOpts = {
  enabled: boolean; editing: boolean; w: number; screenW: number; gw: number; fw: number; calm: boolean; dg: DG;
  onStart: () => void; onAim: (a: number) => void; onEdge: (z: number) => void; onDrop: () => void;
};
function useDragPan(o: DragOpts) {
  const { dg, w, screenW, gw, fw, calm, onStart, onAim, onEdge, onDrop } = o;
  return usePanGesture({
    enabled: o.enabled,
    activateAfterLongPress: o.editing ? 0 : G.longPressMs,
    // 抖動中不用等長按，門檻跟「點一下」的容許一樣（多米 2026-11-02 錄影：門檻 6 點時，抖動中點資料夾手指一晃就被當成拖，打不開）
    minDistance: o.editing ? G.longPressMove : G.tileDrag,
    onActivate: e => {
      'worklet';
      dg.x0.value = e.absoluteX - e.x; dg.y0.value = e.absoluteY - e.y; dg.dx.value = 0; dg.dy.value = 0; dg.sw.value = w;
      dg.edge.value = 0; dg.aim.value = AIM_NONE; dg.stackK.value = -1; dg.ready.value = 0;
      dg.lift.value = calm ? 1 : withSpring(1, LIFT_SPRING);
      scheduleOnRN(onStart);
    },
    onUpdate: e => {
      'worklet';
      dg.dx.value = e.translationX; dg.dy.value = e.translationY;
      // JS 還沒把這次的格子位置、資料夾開沒開寫好（dragStart → setD）：只跟手，不算邊緣和瞄哪。
      // 不然用的是上一次拖留下的值：資料夾裡拿起時被當成在目錄某一格，稍微一動放手就被拿出資料夾（多米 2026-11-02 真機記錄 aim:0、fopen:1）
      if (!dg.ready.value) return;
      const cx = dg.x0.value + e.translationX + dg.sw.value / 2, cy = dg.y0.value + e.translationY + TILE / 2;
      // 拖到左右邊緣停一下翻頁（C5）：資料夾開著的時候不算
      const z = dg.fopen.value ? 0 : cx < EDGE ? -1 : cx > screenW - EDGE ? 1 : 0;
      if (z !== dg.edge.value) { dg.edge.value = z; scheduleOnRN(onEdge, z); }
      const a = aimOf(cx, cy, dg, gw, fw);
      if (a === dg.aim.value) return;
      dg.aim.value = a;
      scheduleOnRN(onAim, a);
    },
    onDeactivate: e => {
      'worklet';
      if (dg.edge.value) { dg.edge.value = 0; scheduleOnRN(onEdge, 0); }
      scheduleOnRN(hapticLand);
      dg.lift.value = calm ? 0 : withSpring(0, LIFT_SPRING);
      // 格子位置還沒寫好就放手（剛拿起馬上放）：不滑，交給 JS 原地放回
      let tx = 0, ty = 0, slide = !!dg.ready.value;
      if (slide && dg.fopen.value) {
        // 落點也扣掉框裡捲下去的距離
        if (dg.aim.value >= FOLDER_AIM) { tx = dg.bx.value + dg.svx.value + slotX(dg.flast.value, fw); ty = dg.by.value + dg.svy.value + GAP + slotY(dg.flast.value) - dg.fsy.value; }
        else slide = false;
      } else if (slide) {
        const k = dg.stackK.value >= 0 ? dg.stackK.value : dg.glast.value;
        if (k < 0) slide = false;
        else { tx = dg.gx.value + slotX(k, gw); ty = dg.gy.value + slotY(k); }
      }
      if (!slide || calm) { scheduleOnRN(onDrop); return; }
      dg.dx.value = withSpring(tx - dg.x0.value, { velocity: e.velocityX, ...LAND_SPRING });
      dg.dy.value = withSpring(ty - dg.y0.value, { velocity: e.velocityY, ...LAND_SPRING }, () => scheduleOnRN(onDrop));
    },
  });
}

let host: { begin: (move?: string) => void; settle: (open: boolean, velocity?: number, then?: () => void) => void } | null = null;
export const dirPanel = {
  p: makeMutable(0), // 0＝收起、1＝全開。紙的標題區往下拉時在 UI 執行緒逐格寫
  h: makeMutable(1), // 面板高度（螢幕高 − dirPeek），拉的距離除以它就是 p
  calm: makeMutable(false), // 減少動態：面板不滑，改淡入淡出（紙那邊放手時要知道）
  // 準備打開：掛上內容、收鍵盤、告訴 store 面板開著（控制中心「記一行」、新的一張的輸入框都等它收完）
  begin: (move?: string) => host?.begin(move),
  // 放手或點了之後：彈到全開或收起。velocity 是手指放開的速度換成 p 的單位
  settle: (open: boolean, velocity?: number, then?: () => void) => host?.settle(open, velocity, then),
  open: (move?: string) => { host?.begin(move); host?.settle(true); },
  close: (then?: () => void) => host?.settle(false, 0, then),
};

export function DirPanelHost() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const calm = useReducedMotion();
  const [shown, setShown] = useState(false);
  const [move, setMove] = useState<string | undefined>();
  const [open, setOpen] = useState(false); // 停在全開（點露出的那截才收得起來；拉到一半不算）
  const [editing, setEditing] = useState(false); // 抖動中（C4）
  const H = height - T.shape.dirPeek;
  const { p } = dirPanel;

  useEffect(() => { dirPanel.h.value = H; }, [H]);
  useEffect(() => { dirPanel.calm.value = calm; }, [calm]);

  useEffect(() => {
    host = {
      begin: m => {
        Keyboard.dismiss();
        setMove(m);
        setShown(true);
        store.panelOpened();
      },
      settle: (toOpen, velocity = 0, then) => {
        if (!toOpen) { Keyboard.dismiss(); setOpen(false); }
        const done = () => {
          if (toOpen) { setOpen(true); return; }
          setShown(false); setMove(undefined); setEditing(false);
          if (store.panelOpen) store.panelClosed();
          then?.();
        };
        const target = toOpen ? 1 : 0;
        p.value = calm ? withTiming(target, { duration: M.dirPanel.reducedFade }, f => { if (f) scheduleOnRN(done); })
          : withSpring(target, { velocity, ...M.dirPanel.spring }, f => { if (f) scheduleOnRN(done); });
      },
    };
    return () => { host = null; };
  }, [calm, p]);

  // 面板底部把手往上推：跟著手指收上去，推過一段或往上甩就收起，不然彈回全開。抖動中關掉（C4，審查紀錄 ❓5）
  const { h } = dirPanel;
  const settle = (toOpen: boolean, v: number) => dirPanel.settle(toOpen, v);
  const push = usePanGesture({
    enabled: !editing,
    activeOffsetY: [-G.pullActivate, G.pullActivate],
    onUpdate: e => { 'worklet'; p.value = Math.min(1, Math.max(0, 1 + e.translationY / h.value)); },
    onDeactivate: e => {
      'worklet';
      const shut = e.translationY < -h.value * PUSH_CLOSE || e.velocityY < -FLICK;
      scheduleOnRN(settle, !shut, e.velocityY / h.value);
    },
  });
  // 點露出的紙、點底部把手：抖動中只結束抖動（跟 iOS 點桌布一樣），不收
  const tapOut = () => (editing ? setEditing(false) : dirPanel.close());

  const sheet = useAnimatedStyle(() => (calm
    ? { opacity: p.value, transform: [{ translateY: 0 }] }
    : { opacity: 1, transform: [{ translateY: -H * (1 - p.value) }] }));
  const dim = useAnimatedStyle(() => ({ opacity: p.value }));

  if (!shown) return null;
  return (
    // 停在全開之前（正在拉、正在彈）整層不接觸控：手指還在紙的標題區上拉，不能被蓋上來的暗幕或面板搶走
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'box-none' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, dim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={tapOut}
          accessibilityRole="button" accessibilityLabel={editing ? '完成編輯' : '收起目錄'} />
      </Animated.View>
      <Animated.View style={[st.sheet, { height: H, backgroundColor: c.surface }, sheet]}
        accessibilityViewIsModal onAccessibilityEscape={tapOut}>
        <Directory move={move} padTop={insets.top + T.space.s} panelH={H} editing={editing} setEditing={setEditing} />
        <GestureDetector gesture={push}>
          <Pressable style={st.grabBox} onPress={tapOut} accessibilityRole="button" accessibilityLabel={editing ? '完成編輯' : '收起目錄'}>
            <View style={[st.grab, { backgroundColor: c.textSecondary }]} />
          </Pressable>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

type DirProps = { move?: string; padTop: number; panelH: number; editing: boolean; setEditing: (on: boolean) => void };

function Directory({ move, padTop, panelH, editing, setEditing }: DirProps) {
  const s = useStore();
  const c = useColors();
  const calm = useReducedMotion();
  const { width } = useWindowDimensions();
  const [q, setQ] = useState('');
  const searching = !!q.trim();

  // 多米 2026-11-01：排序選項與顏色篩選拿掉（太雜）；C1 起照座位表排，搜尋也照座位（審查紀錄 2026-11-01 晚、晚（三））
  const notes = seatedNotes(s, q);
  // D1：不搜尋時目錄最上層一格一格是紙或資料夾；搜尋時直接列紙（資料夾裡的也列）
  const entries: Entry[] = searching ? notes.map(n => ({ id: n.id, note: n, notes: [n] })) : seatedEntries(s);
  const trashed = s.notes.filter(n => n.deleted).length;
  // 兩欄：整頁左右各留 16，中間留 12
  const tileW = (width - T.space.l * 2 - T.space.m) / 2;
  // 打開的資料夾裡兩欄：框左右各留 l、框裡再留 l
  const innerW = (width - T.space.l * 4 - T.space.m) / 2;

  // 拖的那塊（C4、C5、D4）：id＝拖的紙或資料夾；src＝從哪個資料夾拿起（null＝目錄）；page＝現在看的那頁；
  // to＝目錄裡讓出來那格（整排的第幾個）；from＝拿起時在目錄的第幾個；inF＝現在對準哪個打開的資料夾（null＝對準目錄）；
  // fto＝資料夾裡讓出來那格；k0＝從資料夾拿起時在第幾格
  type Drag = { id: string; src: string | null; page: number; to: number; from: number; inF: string | null; fto: number; k0: number };
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef(drag);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const dg = useDG();
  // 拖的那張（從資料夾拿起的是一張紙，目錄裡的可能是紙或資料夾）
  const dragEntryOf = (d: Drag, list = entriesRef.current): Entry | undefined => {
    if (!d.src) return list.find(e => e.id === d.id);
    const n = store.s.notes.find(x => x.id === d.id);
    return n ? { id: n.id, note: n, notes: [n] } : undefined;
  };
  // 拖的時候目錄這一排：拖的那張先從原本的地方拿掉（資料夾裡的從那格資料夾拿掉，拿光了資料夾那格也拿掉），
  // 再放進讓出來的那格。從資料夾拿起、手指還在資料夾裡時，目錄不多一格
  const flatOf = (d: Drag, list = entriesRef.current): Entry[] => {
    const base: Entry[] = [];
    for (const e of list) {
      if (e.id === d.id) continue;
      if (e.folder && e.id === d.src) {
        const rest = e.notes.filter(n => n.id !== d.id);
        // 拖出資料夾、只剩一張：資料夾那格先變回那張（放手時 model 的 dissolveIfOne 也這樣拆，照 iOS）
        if (rest.length === 1 && !d.inF) base.push({ id: rest[0].id, note: rest[0], notes: rest });
        else if (rest.length) base.push({ ...e, notes: rest });
        continue;
      }
      base.push(e);
    }
    if (d.src && d.inF) return base;
    const me = dragEntryOf(d, list);
    if (me) base.splice(Math.min(d.to, base.length), 0, me);
    return base;
  };
  // 打開的資料夾裡排出來的紙：拖進來的放在讓出來那格；從這個資料夾拿起、已經拖到外面的留在原位不顯示（那塊磚身上有手勢，不能拿掉）
  const folderNotes = (e: Entry, d: Drag | null): Note[] => {
    if (!d) return e.notes;
    const rest = e.notes.filter(n => n.id !== d.id);
    const me = store.s.notes.find(x => x.id === d.id);
    if (!me || d.src === null && d.inF !== e.id) return rest;
    const at = d.inF === e.id ? d.fto : d.src === e.id ? d.k0 : -1;
    if (at < 0) return rest;
    rest.splice(Math.min(at, rest.length), 0, me);
    return rest;
  };

  // 分頁（C3）：格子區高 boxH 扣掉上緣留白，放得下幾列整磚就幾列（不切半塊）；第一頁最上面一列是「新的一張」
  const [boxH, setBoxH] = useState(0);
  const pagerY = useRef(0); // 格子區在目錄裡的上緣（D4 算格子的螢幕位置用）
  const [page, setPage] = useState(0);
  // 一頁 R 列＝上緣 s ＋ grid 的 marginTop m ＋ R 塊磚 ＋ (R−1) 個間距 m＝s ＋ R ×（磚＋m）；第一頁的「新的一張」那列也是一塊磚高＋m
  const rows = Math.max(1, Math.floor((boxH - T.space.s) / (T.shape.tile + T.space.m)));
  const gridList = drag && !searching ? flatOf(drag, entries) : entries;
  const pages: Entry[][] = [];
  for (let i = 0, take = (rows - 1) * 2; i < gridList.length || !pages.length; i += take, take = rows * 2) pages.push(gridList.slice(i, i + take));
  const pageCount = useRef(pages.length);
  pageCount.current = pages.length;
  const pageStart = (i: number) => (i === 0 ? 0 : (rows - 1) * 2 + (i - 1) * rows * 2);
  const cap = (i: number) => (i === 0 ? (rows - 1) * 2 : rows * 2);
  // 第 i 頁格子左上角的螢幕位置：頁的上緣留白 s、第一頁多一列「新的一張」、格子的 marginTop m
  const gyOf = (i: number) => pagerY.current + T.space.s + (i === 0 ? TILE : 0) + T.space.m;

  // 長按選單（C4）：哪一張（或哪個資料夾，D1）、選單放多高
  const [menu, setMenu] = useState<{ id: string; top: number } | null>(null);
  const menuNote = menu ? s.notes.find(n => n.id === menu.id && !n.deleted) : undefined;
  const menuFolder = menu && !menuNote ? s.folders?.find(f => f.id === menu.id) : undefined;
  // 打開的資料夾（D1）：哪一個、名字是不是正在打（新資料夾、選單的改名字一打開就能打）。裡面一張都看不到了就自己收起
  const [openF, setOpenF] = useState<{ id: string; naming: boolean } | null>(null);
  // 不搜尋時 entries 就是 seatedEntries(s)，不用再算一次
  const openEntry = openF ? (searching ? seatedEntries(s) : entries).find(e => e.id === openF.id && e.folder) : undefined;
  useEffect(() => { if (openF && !openEntry) setOpenF(null); }, [openF, openEntry]);
  // 框裡捲到哪（拖的時候算格子、落點都要扣掉）。換一個資料夾或重新打開，捲動從頂端開始（ScrollView 用資料夾 id 當 key 會重掛）
  const openFolderId = openEntry?.folder?.id;
  useEffect(() => { dg.fsy.value = 0; }, [openFolderId, dg.fsy]);
  const onFolderScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => { dg.fsy.value = e.nativeEvent.contentOffset.y; };
  const folderList = openEntry ? folderNotes(openEntry, drag) : [];
  // 從這個資料夾拿起、已經拖出去：資料夾收起（看不到、點不到），但留著，拿起的那塊磚才不會不見
  const folderHidden = !!(drag && openF && drag.src === openF.id && !drag.inF);

  // 準備疊上去的那一格是誰（放大那塊）；計時器到了才設。ref 給放手時讀最新的
  const [stackOn, setStackOn] = useState<string | null>(null);
  const stackRef = useRef(stackOn);
  stackRef.current = stackOn;
  const aimT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const leaveT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const entered = useRef(false); // 打開的資料夾手指進去過了沒（剛彈開時手指常在框外，進去過一次之後離開才收起）
  const pagerRef = useRef<ScrollViewInstance>(null);
  const edgeT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 換拖曳狀態一律走這裡：同時把手勢要讀的格子位置、格數、讓出來那格寫進 shared value（不等重畫）
  function setD(d: Drag | null) {
    dragRef.current = d;
    setDrag(d);
    if (!d) return;
    const flat = flatOf(d);
    dg.gy.value = gyOf(d.page);
    dg.gcount.value = Math.max(1, Math.min(cap(d.page), flat.length - pageStart(d.page)));
    const idx = d.src && d.inF ? -1 : d.to - pageStart(d.page);
    dg.glast.value = idx >= 0 && idx < cap(d.page) ? idx : -1;
    const fe = d.inF ? entriesRef.current.find(e => e.id === d.inF) : undefined;
    if (fe) { dg.fcount.value = Math.max(1, folderNotes(fe, d).length); dg.flast.value = d.fto; }
  }

  // 搬行模式：來源是現在這張紙、要搬的那一行。行已經不在了（例如同時被刪）就當普通目錄用
  const from = move ? s.notes.find(n => n.id === store.last && !n.deleted) : undefined;
  const moving = from?.items.find(i => i.id === move);
  function pick(n: Note) {
    if (from && moving) {
      const name = label(n);
      if (moveItem(from, n, moving.id)) { n.updated = from.updated = Date.now(); store.change(); ui.toast(`已搬到「${name}」`); }
      dirPanel.close();
      return;
    }
    store.open(n.id);
    dirPanel.close();
  }
  // 新的一張：黃色；開完直接停在紙的輸入列（fresh）。搬行時就是搬進新的一張（紙不換）
  function add() {
    const n = newNote('yellow', 'check');
    if (from && moving) { pick(n); return; }
    store.open(n.id, true);
    dirPanel.close();
  }

  /* ---------- 長按選單（C4）：顏色、改名字、釘選、刪除、編輯目錄；資料夾只有改名字、編輯目錄 ---------- */
  function openMenu(id: string, y: number, swatches = true, rowCount = 4) {
    // 長按跳選單和長按後拖都在按住 longPressMs 時成立，手指按著晃一下兩個會一起來：已經拿起來了就不開選單（iOS 一拖選單就收掉；多米 2026-11-02 錄影）
    if (dragRef.current) return;
    Keyboard.dismiss();
    haptic('menu');
    const h = (swatches ? T.shape.swatchDot + T.space.l * 2 : 0) + T.shape.menuRow * rowCount + T.space.xs * 2 + T.space.s * 2; // 一排色塊＋幾個項目（PopMenu 的藥丸版）
    setMenu({ id, top: Math.max(padTop, Math.min(y + T.space.s, panelH - h - T.space.l)) });
  }
  function recolor(n: Note, k: ColorKey) {
    if (n.color === k) return;
    n.color = k; n.updated = Date.now(); store.change();
    haptic('color'); // 選單不關，震一下才知道有換到（跟紙的 ⋯ 一樣）
  }
  // 改名字：換到那張紙、目錄收起，清單名變成可以打字（改名只有清單名一個地方）
  function rename(n: Note) {
    dirPanel.close(() => { if (n.id !== store.last) store.open(n.id); store.requestRename(n.id); });
  }
  // 刪除：跟紙的 ⋯「刪除這張」同一套（進最近刪除、30 天、空白的直接拿掉），toast 復原。刪的是現在這張，紙自己換到最近改過的
  function del(n: Note) {
    markDeleted(n, Date.now()); n.pinned = false;
    n.items = n.items.filter(i => i.t.trim());
    const empty = isEmpty(n);
    if (empty) dropNotes(store.s, x => x === n, Date.now());
    store.change();
    if (!empty) ui.toast('已移到最近刪除', { label: '復原', fn: () => { markRestored(n); store.change(); } });
  }
  // 放進資料夾（D1，2026-11-02 晚起只剩 VoiceOver 動作）：還沒有看得到的資料夾就直接在這張的位置開一個新的、打開讓你取名；有就問放進哪一個
  function putIn(n: Note) {
    const made = () => {
      const f = newFolder(store.s, n.id, Date.now());
      store.change();
      setOpenF({ id: f.id, naming: true });
    };
    const shownFolders = seatedEntries(store.s).flatMap(e => (e.folder ? [e.folder] : []));
    if (!shownFolders.length) { made(); return; }
    ui.sheet([
      ...shownFolders.map(f => ({ label: f.name, fn: () => { if (intoFolder(store.s, n.id, f.id, Date.now())) store.change(); } })),
      { label: '新資料夾', fn: made },
    ], '放進資料夾');
  }
  // 移出資料夾（VoiceOver 動作、在框外放手）：排在資料夾後面一格；最後一張移出，資料夾不見（打開的框跟著收起）
  function takeOut(n: Note) {
    if (outOfFolder(store.s, n.id, Date.now())) store.change();
  }
  const tileActs = (n: Note): Act[] => {
    const inside = !!folderOf(s, n.id);
    return [
      { label: '改名字', icon: 'pencil', fn: () => rename(n) },
      // 釘選跟紙的 ⋯ 同一套（多米 2026-11-02 晚：在這裡找不到釘選）。放進、移出資料夾照 iOS 只用拖的，不放文字選項（多米 2026-11-02 晚）；
      // VoiceOver 的「放進資料夾」「移出資料夾」動作留著，給不能拖的人（HIG）
      { label: n.pinned ? '取消釘選' : '釘選', icon: n.pinned ? 'pin.slash' : 'pin', fn: () => togglePin(n) },
      { label: '刪除', icon: 'trash', destructive: true, fn: () => del(n) },
      { label: '編輯目錄', icon: 'square.grid.2x2', fn: () => setEditing(true), hidden: inside },
    ];
  };
  const folderActs = (f: Folder): Act[] => [
    { label: '改名字', icon: 'pencil', fn: () => setOpenF({ id: f.id, naming: true }) },
    { label: '編輯目錄', icon: 'square.grid.2x2', fn: () => setEditing(true) },
  ];
  // VoiceOver 的「往前移／往後移」：拖不了時的替代路徑（行的排順序也這樣做）。D1：資料夾磚也算一格
  function moveBy(n: { id: string }, d: -1 | 1) {
    const ids = seatedEntries(store.s).map(x => x.id), i = ids.indexOf(n.id), to = i + d;
    if (i < 0 || to < 0 || to >= ids.length) return;
    [ids[i], ids[to]] = [ids[to], ids[i]];
    reseat(store.s, ids); store.change();
  }

  /* ---------- 拖（C4、C5、D2、D4）：長按後一拖就進抖動；抖動中直接拖 ---------- */
  function dragStartGrid(id: string, pg: number, k: number) {
    setMenu(null); setEditing(true);
    entered.current = true;
    dg.gx.value = T.space.l; dg.fopen.value = 0;
    const at = pageStart(pg) + k;
    setD({ id, src: null, page: pg, to: at, from: at, inF: null, fto: -1, k0: -1 });
    dg.ready.value = 1; // 格子位置寫好了，手勢從下一格開始算瞄哪
    haptic('dragStart');
  }
  // 從打開的資料夾裡拿起（D3、D4）：一開始對準這個資料夾，框外停一下才收起
  function dragStartFolder(n: Note, fid: string, k: number) {
    setMenu(null); Keyboard.dismiss(); setEditing(true);
    entered.current = true;
    dg.gx.value = T.space.l; dg.fopen.value = 1;
    setD({ id: n.id, src: fid, page, to: 0, from: -1, inF: fid, fto: k, k0: k });
    dg.ready.value = 1; // 資料夾開著、格數寫好了，手勢從下一格開始算瞄哪
    haptic('dragStart');
  }
  function unstack() {
    if (dg.stackK.value >= 0) dg.stackK.value = -1;
    if (stackRef.current) setStackOn(null);
  }
  // 拖著停在資料夾磚上夠久：資料夾打開（HIG 的 spring loading），紙還在手上，先排在裡面最後一格。從資料夾拿起的不開別的資料夾（一次只開一個）
  function springOpen(fid: string) {
    const d = dragRef.current, fe = entriesRef.current.find(e => e.id === fid);
    if (!d || d.src || !fe) return;
    unstack();
    entered.current = false;
    dg.bw.value = 0; dg.fopen.value = 1; dg.aim.value = AIM_NONE;
    setOpenF({ id: fid, naming: false });
    setD({ ...d, inF: fid, fto: fe.notes.length });
    haptic('dragPass');
  }
  // 手指離開資料夾框夠久：資料夾收起，回到目錄繼續拖。從資料夾拿起的先排在資料夾後面一格（拿光了就排在資料夾原本的位置）
  function springClose() {
    leaveT.current = undefined;
    const d = dragRef.current;
    if (!d || !d.inF) return;
    dg.fopen.value = 0;
    let to = d.to;
    if (d.src) {
      const i = entriesRef.current.findIndex(e => e.id === d.src);
      const rest = (entriesRef.current[i]?.notes.length ?? 1) - 1;
      to = rest > 0 ? i + 1 : Math.max(0, i);
    } else {
      setOpenF(null);
      dg.bw.value = 0;
    }
    setD({ ...d, inF: null, to });
    haptic('dragPass');
    // 手指不動也先對一次目錄的格子
    const cx = dg.x0.value + dg.dx.value + dg.sw.value / 2, cy = dg.y0.value + dg.dy.value + TILE / 2;
    const a = aimOf(cx, cy, dg, tileW, innerW);
    dg.aim.value = a;
    onAim(a);
  }
  // 手指瞄的地方變了（D2、D4）：先取消還在等的讓位／疊、縮回放大的那塊。
  // 目錄：邊邊或空隙停 reflow 才讓位；別張磚正中間停 stackHover 那張放大＝放手就疊，是資料夾磚再停 folderSpring 就打開。拖的是資料夾磚只讓位不疊。
  // 資料夾裡：停 reflow 讓位。框外：停 folderLeave 收起
  function onAim(a: number) {
    clearTimeout(aimT.current);
    unstack();
    const d = dragRef.current;
    if (!d || a === AIM_NONE) return;
    if (a === AIM_OUT) {
      if (entered.current && !leaveT.current) leaveT.current = setTimeout(springClose, T.timing.folderLeave);
      return;
    }
    clearTimeout(leaveT.current);
    leaveT.current = undefined;
    if (a >= FOLDER_AIM) {
      entered.current = true;
      const k = a - FOLDER_AIM;
      if (!d.inF || k === d.fto) return;
      aimT.current = setTimeout(() => { const cur = dragRef.current; if (cur?.inF) { setD({ ...cur, fto: k }); haptic('dragPass'); } }, T.timing.reflow);
      return;
    }
    const me = dragEntryOf(d);
    const k = a >= 0 ? a : -a - 1;
    if (a >= 0 || me?.folder) {
      if (pageStart(d.page) + k === d.to) return;
      aimT.current = setTimeout(() => { const cur = dragRef.current; if (cur) { setD({ ...cur, to: pageStart(cur.page) + k }); haptic('dragPass'); } }, T.timing.reflow);
      return;
    }
    const under = flatOf(d)[pageStart(d.page) + k];
    if (!under || under.id === d.id) return;
    aimT.current = setTimeout(() => {
      dg.stackK.value = k; setStackOn(under.id); haptic('dragStart');
      if (under.folder && !d.src) aimT.current = setTimeout(() => springOpen(under.id), T.timing.folderSpring);
    }, T.timing.stackHover);
  }
  // 在邊緣停 edgeFlip 就翻一頁；一直停著就再翻。翻過去後格子對到哪格照手指現在的位置重算（手指不動也要算）
  function onEdge(z: number) {
    clearTimeout(edgeT.current);
    if (!z) return;
    edgeT.current = setTimeout(function flip() {
      const d = dragRef.current;
      const np = d ? d.page + z : -1;
      if (!d || d.inF || np < 0 || np >= pageCount.current || dg.edge.value !== z) return;
      clearTimeout(aimT.current);
      unstack();
      pagerRef.current?.scrollTo({ x: np * width, animated: !calm });
      setPage(np);
      setD({ ...d, page: np });
      const cx = dg.x0.value + dg.dx.value + dg.sw.value / 2, cy = dg.y0.value + dg.dy.value + TILE / 2;
      const k = slotIn(cx - dg.gx.value, cy - dg.gy.value, tileW, dg.gcount.value);
      setD({ ...dragRef.current!, to: pageStart(np) + k });
      dg.aim.value = k;
      haptic('dragPass');
      edgeT.current = setTimeout(flip, T.timing.edgeFlip);
    }, T.timing.edgeFlip);
  }
  useEffect(() => () => { clearTimeout(edgeT.current); clearTimeout(aimT.current); clearTimeout(leaveT.current); }, []);
  // 放手、滑到位之後才改資料：在打開的資料夾框裡＝放進那格（資料夾裡換順序也是這條）；準備疊了＝疊（D2）；
  // 目錄＝放到讓出來那格（從資料夾來的先拿出來）。資料夾開著但在框外放手：從資料夾拿的排在資料夾後面，從目錄拿的回原位。
  // 還沒對準任何地方就放手（剛拿起、框還沒量好）：什麼都不改，從這個資料夾拿的資料夾照樣開著
  function drop() {
    clearTimeout(edgeT.current); clearTimeout(aimT.current); clearTimeout(leaveT.current);
    leaveT.current = undefined;
    const d = dragRef.current, now = Date.now();
    // 放手當下的整排（拖的那張排在讓出來那格）：疊的時候找底下那張、放回目錄時的新順序都看這一份
    const flat = d ? flatOf(d) : [];
    const onto = stackRef.current ? flat.find(e => e.id === stackRef.current) : undefined;
    let keepOpen = false;
    if (d && d.inF) {
      const fe = entriesRef.current.find(e => e.id === d.inF);
      if (dg.aim.value >= FOLDER_AIM && fe) {
        if (placeInFolder(store.s, d.id, d.inF, folderNotes(fe, d).map(n => n.id), now)) store.change();
        keepOpen = true;
      } else if (d.src && dg.aim.value === AIM_OUT) {
        const n = store.s.notes.find(x => x.id === d.id);
        if (n) takeOut(n);
      } else keepOpen = !!d.src;
    } else if (d && onto) {
      // 疊成新資料夾不打開，名字先叫「新資料夾」，要改再點開或長按改（照 iOS，多米 2026-11-02 看錄影選）。
      // 從資料夾拿出來的先拿出來：只剩一張的資料夾先拆掉，底下那張才站在原本那格（疊上去的就是它）
      if (d.src) outOfFolder(store.s, d.id, now);
      if (onto.folder) intoFolder(store.s, d.id, onto.id, now);
      else intoFolder(store.s, d.id, newFolder(store.s, onto.id, now).id, now);
      store.change();
    } else if (d) {
      const ids = flat.map(x => x.id);
      if (d.src) { placeTop(store.s, d.id, ids, now); store.change(); }
      else if (d.to !== d.from) { reseat(store.s, ids, now); store.change(); }
    }
    setStackOn(null); dg.stackK.value = -1; dg.fopen.value = 0;
    setD(null);
    dg.dx.value = 0; dg.dy.value = 0;
    if (!keepOpen && d && (d.src || d.inF)) setOpenF(null);
  }
  const shown = (i: number) => pages[i];

  const noteA11y = (n: Note) => (name: string) => {
    if (name === 'activate') pick(n);
    else if (name === 'rename') rename(n);
    else if (name === 'delete') del(n);
    else if (name === 'folder') putIn(n);
    else if (name === 'out') takeOut(n);
    else if (name === 'forward') moveBy(n, -1);
    else if (name === 'backward') moveBy(n, 1);
  };
  const noteLabel = (n: Note) => `${label(n)}，${col(n.color).hue}${n.pinned ? '，已釘選' : ''}`;
  // 磚的樣子：紙磚，或資料夾磚（正在看的紙在裡面就框起來）
  const face = (e: Entry, w: number) => (e.folder
    ? <FolderFace f={e.folder} notes={e.notes} w={w} cur={e.notes.some(n => n.id === store.last)} />
    : <TileFace n={e.note!} w={w} cur={e.id === store.last} />);
  const tile = (e: Entry, k: number, pg: number) => {
    const f = e.folder, n = e.note;
    const common = {
      w: tileW, sw: width, fw: innerW, k, editing, calm, canDrag: !searching, ghost: drag?.id === e.id, dg,
      onDragStart: () => dragStartGrid(e.id, pg, k), onAim, onEdge, onDrop: drop, target: stackOn === e.id,
    };
    if (f) {
      return (
        <Tile key={e.id} {...common} tapInEdit label={`資料夾，${f.name}，${e.notes.length} 張`} selected={e.notes.some(x => x.id === store.last)} acts={FOLDER_A11Y}
          onPick={() => setOpenF({ id: f.id, naming: false })} onMenu={y => openMenu(f.id, y, false, 2)}
          onA11y={name => {
            if (name === 'activate') setOpenF({ id: f.id, naming: false });
            else if (name === 'rename') setOpenF({ id: f.id, naming: true });
            else if (name === 'forward') moveBy(f, -1);
            else if (name === 'backward') moveBy(f, 1);
          }}>
          {face(e, tileW)}
        </Tile>
      );
    }
    const inside = !!folderOf(s, n!.id);
    return (
      <Tile key={e.id} {...common} label={noteLabel(n!)} selected={e.id === store.last} acts={inside ? NOTE_IN_A11Y : NOTE_A11Y}
        onPick={() => pick(n!)} onMenu={y => openMenu(n!.id, y, true, inside ? 3 : 4)} onA11y={noteA11y(n!)}>
        {face(e, tileW)}
      </Tile>
    );
  };
  // 浮起那塊的樣子：從資料夾拿起的用資料夾裡的寬
  const dragged = drag ? dragEntryOf(drag, entries) : undefined;
  const ghostFace = dragged ? (drag!.src ? <TileFace n={dragged.note!} w={innerW} cur={false} /> : face(dragged, tileW)) : null;

  return (
    <View style={{ flex: 1 }} collapsable={false}>
      <View style={[st.top, { paddingTop: padTop }]}>
        <View style={[st.search, { backgroundColor: c.page }, editing && { opacity: T.motion.pressDim }]}>
          <Sym name="magnifyingglass" size={17} color={c.textSecondary} />
          <TextInput value={q} onChangeText={v => { setQ(v); setPage(0); }} placeholder="搜尋清單" placeholderTextColor={c.textMuted} clearButtonMode="while-editing"
            editable={!editing} style={[st.searchInput, { color: c.textPrimary }]} accessibilityLabel="搜尋清單" />
        </View>
        {/* 抖動中才有：結束編輯（跟 iOS 主畫面右上的「完成」一樣） */}
        {editing && (
          <Pressable onPress={() => setEditing(false)} hitSlop={T.space.s} accessibilityRole="button" accessibilityLabel="完成"
            style={({ pressed }) => [st.done, pressed && { opacity: T.motion.pressDim }]}>
            <Text style={[st.doneText, { color: c.textPrimary }]}>完成</Text>
          </Pressable>
        )}
      </View>

      {moving && (
        <Text style={[st.moveHead, { color: c.textSecondary }]} numberOfLines={2}>把「{moving.t.trim()}」搬到</Text>
      )}

      {searching ? (
        // 搜尋：所有頁的紙一起找，排成一整片上下捲，不分頁（不能拖：搜到的只是一部分）
        <ScrollView style={{ flex: 1 }} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={st.body}>
          <View style={st.grid}>{entries.map((e, k) => tile(e, k, 0))}</View>
          {/* 找不到→帶他剛打的字；第一次不會是空的（紙永遠至少一張）。顏色篩選的空狀態跟著篩選一起拿掉（2026-11-01） */}
          {notes.length === 0 && <Empty lines={[`找不到含「${q.trim()}」的清單`]} />}
        </ScrollView>
      ) : (
        // C3 多頁：一頁放幾列照格子區的高度算（螢幕小、字放大就少放），放不下往右一頁；整頁翻（系統分頁捲動），每次打開從第一頁。抖動中不翻（C5 才有拖到邊緣翻頁）
        <View style={{ flex: 1 }} onLayout={e => { setBoxH(e.nativeEvent.layout.height); pagerY.current = e.nativeEvent.layout.y; }}>
          {boxH > 0 && (
            <ScrollView ref={pagerRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEnabled={pages.length > 1 && !editing}
              keyboardShouldPersistTaps="handled" onScrollBeginDrag={() => Keyboard.dismiss()}
              onScroll={e => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
              scrollEventThrottle={T.timing.pageScroll}>
              {pages.map((_, i) => (
                <View key={i} style={[st.page, { width }]} pointerEvents="box-none" accessibilityLabel={pages.length > 1 ? `第 ${i + 1} 頁，共 ${pages.length} 頁` : undefined}>
                  <PageBack editing={editing} onHold={() => { setMenu(null); haptic('menu'); setEditing(true); }} onTap={() => setEditing(false)} />
                  {i === 0 && (
                    <Pressable onPress={editing ? undefined : add} accessibilityRole="button" accessibilityLabel="新的一張"
                      style={({ pressed }) => [st.tile, st.add, { width: tileW, borderColor: c.separator }, pressed && !editing && { opacity: T.motion.pressDim }]}>
                      <Sym name="plus" size={22} color={c.textPrimary} />
                      <Text style={[st.tileText, { color: c.textPrimary }]}>新的一張</Text>
                    </Pressable>
                  )}
                  <View style={st.grid} pointerEvents="box-none">
                    {/* 拖的時候要放的位置留隱形佔位，其他磚照佔位讓開；浮起那塊畫在目錄最上層（DragGhost） */}
                    {shown(i).map((n, k) => tile(n, k, i))}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* 頁點：幾頁幾個，亮的是現在這頁；只有一頁不印 */}
      {!searching && pages.length > 1 && (
        <View style={st.dots} accessible accessibilityLabel={`第 ${Math.min(page, pages.length - 1) + 1} 頁，共 ${pages.length} 頁`}>
          {pages.map((_, i) => (
            <View key={i} style={[st.dot, { backgroundColor: c.textSecondary, opacity: i === Math.min(page, pages.length - 1) ? 1 : T.shape.handleOff }]} />
          ))}
        </View>
      )}

      {/* 最近刪除固定在格子下面，每一頁都看得到 */}
      {trashed > 0 && (
        <Pressable onPress={editing ? undefined : () => dirPanel.close(() => router.push('/trash'))} accessibilityRole="button" accessibilityLabel={`最近刪除，${trashed} 張`}
          style={({ pressed }) => [st.trashRow, { borderTopColor: c.separator }, pressed && !editing && { opacity: T.motion.pressDim }]}>
          <Sym name="trash" size={17} color={c.textSecondary} />
          <Text style={[st.trashText, { color: c.textSecondary }]}>最近刪除</Text>
          <View style={{ flex: 1 }} />
          <Text style={[st.trashText, { color: c.textSecondary }]}>{trashed}</Text>
          <Sym name="chevron.right" size={12} color={c.textSecondary} />
        </Pressable>
      )}

      {/* 打開的資料夾（D1）：蓋在目錄上面，點外面收起；名字點了就能改；裡面的紙點了換紙、長按跳選單、長按後拖出框外拿出來（D3）。
          抖動中也打得開（iOS 一樣），裡面的紙跟著抖、手指一動就拿起來。
          照 iOS 置中、名字在框上面的大字（多米 2026-11-02 看錄影選）；框的位置照樣用 onLayout 量（外層從螢幕頂端開始，量到的就是螢幕座標） */}
      {openEntry?.folder && (
        <View style={[StyleSheet.absoluteFill, st.folderWrap, folderHidden && st.hidden]} pointerEvents={folderHidden ? 'none' : 'auto'}
          accessibilityViewIsModal onAccessibilityEscape={() => setOpenF(null)}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={() => { Keyboard.dismiss(); setOpenF(null); }}
            accessibilityRole="button" accessibilityLabel="收起資料夾" />
          <FolderName key={openEntry.folder.id} f={openEntry.folder} focus={openF!.naming} />
          <View style={[st.folderBox, { maxHeight: panelH - padTop * 2 - T.shape.hitMin * 2, backgroundColor: c.surface }]}
            onLayout={e => { const l = e.nativeEvent.layout; dg.bx.value = l.x; dg.by.value = l.y; dg.bw.value = l.width; dg.bh.value = l.height; }}>
            {/* 捲完那一下也記：throttle 可能漏掉最後一筆位置 */}
            <ScrollView key={openEntry.folder.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" scrollEnabled={!editing && !drag}
              onScroll={onFolderScroll} onScrollEndDrag={onFolderScroll} onMomentumScrollEnd={onFolderScroll} scrollEventThrottle={T.timing.pageScroll}
              onLayout={e => { dg.svx.value = e.nativeEvent.layout.x; dg.svy.value = e.nativeEvent.layout.y; }}>
              <View style={st.grid}>
                {folderList.map((n, k) => (
                  <FolderTile key={n.id} n={n} k={k} w={innerW} calm={calm} editing={editing} cur={n.id === store.last} ghost={drag?.id === n.id}
                    dg={dg} screenW={width} gw={tileW}
                    label={noteLabel(n)} onPick={() => pick(n)} onMenu={y => openMenu(n.id, y, true, 3)} onA11y={noteA11y(n)}
                    onDragStart={() => dragStartFolder(n, openEntry.id, k)} onAim={onAim} onEdge={onEdge} onDrop={drop} />
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {/* 拿起來的那張：浮在最上層跟著手指（目錄、資料夾都一樣），手勢還在原本那塊磚上 */}
      {drag && ghostFace && <DragGhost dg={dg}>{ghostFace}</DragGhost>}

      {menu && menuNote && (
        <PopMenu acts={tileActs(menuNote)} top={menu.top} onClose={() => setMenu(null)}
          header={<Swatches current={menuNote.color} onPick={k => recolor(menuNote, k)} />} />
      )}
      {menu && menuFolder && <PopMenu acts={folderActs(menuFolder)} top={menu.top} onClose={() => setMenu(null)} />}
    </View>
  );
}

type TileProps = {
  w: number; sw: number; fw: number; k: number; editing: boolean; calm: boolean; canDrag: boolean; ghost: boolean; dg: DG;
  label: string; selected: boolean; acts: { name: string; label?: string }[]; children: ReactNode;
  tapInEdit?: boolean; // 抖動中點一下也算（資料夾磚：iOS 抖動中點檔案夾會打開）
  onPick: () => void; onMenu: (y: number) => void; onDragStart: () => void; onAim: (a: number) => void; onEdge: (z: number) => void; onDrop: () => void; target: boolean;
  onA11y: (name: string) => void;
};

// VoiceOver 的動作：目錄裡的紙、資料夾裡的紙（不能往前往後移，D3 才有資料夾裡的排序）、資料夾
const NOTE_A11Y = [
  { name: 'activate' }, { name: 'rename', label: '改名字' }, { name: 'folder', label: '放進資料夾' }, { name: 'delete', label: '刪除' },
  { name: 'forward', label: '往前移' }, { name: 'backward', label: '往後移' },
];
const NOTE_IN_A11Y = [{ name: 'activate' }, { name: 'rename', label: '改名字' }, { name: 'out', label: '移出資料夾' }, { name: 'delete', label: '刪除' }];
const FOLDER_A11Y = [{ name: 'activate' }, { name: 'rename', label: '改名字' }, { name: 'forward', label: '往前移' }, { name: 'backward', label: '往後移' }];

// 一塊磚的手勢（C4）：點＝換紙；長按（不動）＝選單；長按後一拖、或抖動中直接拖＝拿起來換位置（拖的部分 D4 起跟資料夾裡共用 useDragPan）。
// 長按與拖同時聽（長按先成立跳選單，手指再動才拖）；點要等它們都不成立。抖動中不能點、不跳選單（資料夾磚除外：抖動中點會打開）
function Tile(p: TileProps) {
  const { k, w, sw, calm, onPick, onMenu, onDragStart, onAim, onEdge, onDrop } = p;
  const pressed = useSharedValue(0);
  const tap = useTapGesture({
    runOnJS: true,
    enabled: !p.editing || !!p.tapInEdit,
    maxDistance: G.longPressMove,
    onBegin: () => { pressed.value = 1; },
    onFinalize: () => { pressed.value = 0; },
    onActivate: () => onPick(),
  });
  const hold = useLongPressGesture({
    runOnJS: true,
    enabled: !p.editing,
    minDuration: G.longPressMs,
    maxDistance: G.longPressMove,
    onActivate: e => onMenu(e.absoluteY),
  });
  const pan = useDragPan({
    enabled: p.canDrag, editing: p.editing, w, screenW: sw, gw: w, fw: p.fw, calm, dg: p.dg,
    onStart: onDragStart, onAim, onEdge, onDrop,
  });
  const gesture = useExclusiveGestures(useSimultaneousGestures(hold, pan), tap);

  // 抖動：相鄰兩塊方向相反，來回轉一點點。減少動態：不抖
  const rot = useSharedValue(0);
  useEffect(() => {
    if (!p.editing || calm) { cancelAnimation(rot); rot.value = 0; return; }
    const a = k % 2 ? -M.jiggle.deg : M.jiggle.deg;
    rot.value = withRepeat(withSequence(withTiming(a, { duration: M.jiggle.half }), withTiming(-a, { duration: M.jiggle.half })), -1, true);
    return () => cancelAnimation(rot);
  }, [p.editing, calm]); // eslint-disable-line react-hooks/exhaustive-deps
  // D2：被瞄著要疊的那張放大一點。減少動態：直接變大
  const grow = useSharedValue(1);
  useEffect(() => {
    grow.value = calm ? (p.target ? GROW : 1) : withSpring(p.target ? GROW : 1, LIFT_SPRING);
  }, [p.target, calm]); // eslint-disable-line react-hooks/exhaustive-deps
  // 動畫裡只能用拆出來的真假值：寫 p.ghost 會把整包 props（紙、資料夾物件）抓進去，被鎖住之後改資料全部失效（多米 2026-11-02 真機「一團糟」）
  const ghost = p.ghost;
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }, { scale: grow.value }],
    opacity: ghost ? 0 : 1 - pressed.value * (1 - PRESS_DIM),
  }), WEB_DEPS ? [ghost] : undefined);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={style} layout={calm ? undefined : TILE_MOVE}
        accessible accessibilityRole="button" accessibilityLabel={p.label}
        accessibilityState={{ selected: p.selected }} accessibilityActions={p.acts}
        onAccessibilityAction={(e: AccessibilityActionEvent) => p.onA11y(e.nativeEvent.actionName)}>
        {p.children}
      </Animated.View>
    </GestureDetector>
  );
}

// 目錄一頁的空白處（多米 2026-11-02 晚，照 iOS 使用手冊「按住主畫面背景直到項目開始晃動」「完成後點一下背景」）：
// 墊在磚的下面，磚、新的一張蓋在上面，點到磚不會到這裡（頁和格子都設 box-none，空白處才點得到它）。按住＝進抖動；抖動中點一下＝結束
function PageBack({ editing, onHold, onTap }: { editing: boolean; onHold: () => void; onTap: () => void }) {
  const hold = useLongPressGesture({ runOnJS: true, enabled: !editing, minDuration: G.longPressMs, maxDistance: G.longPressMove, onActivate: () => onHold() });
  const tap = useTapGesture({ runOnJS: true, enabled: editing, maxDistance: G.longPressMove, onActivate: () => onTap() });
  const gesture = useExclusiveGestures(hold, tap);
  return (
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill} />
    </GestureDetector>
  );
}

// 資料夾裡的一張（D3、D4）：點＝換紙；長按（不動）＝選單；長按後一拖（抖動中直接拖）＝拿起來：框裡換順序，拖出框停一下資料夾收起、放到目錄任一格。
// 跟目錄的磚分開寫是因為長相、點的規則不同；拖跟目錄共用 useDragPan
type FolderTileProps = {
  n: Note; k: number; w: number; calm: boolean; editing: boolean; cur: boolean; ghost: boolean; dg: DG; screenW: number; gw: number; label: string;
  onPick: () => void; onMenu: (y: number) => void; onA11y: (name: string) => void;
  onDragStart: () => void; onAim: (a: number) => void; onEdge: (z: number) => void; onDrop: () => void;
};
function FolderTile(p: FolderTileProps) {
  const { calm, onPick, onMenu, onDragStart, onAim, onEdge, onDrop } = p;
  const pressed = useSharedValue(0);
  // 抖動中（iOS 晃動中打開的檔案夾）：點不換紙、不跳選單，手指一動就拿起來
  const tap = useTapGesture({
    runOnJS: true,
    enabled: !p.editing,
    maxDistance: G.longPressMove,
    onBegin: () => { pressed.value = 1; },
    onFinalize: () => { pressed.value = 0; },
    onActivate: () => onPick(),
  });
  const hold = useLongPressGesture({
    runOnJS: true,
    enabled: !p.editing,
    minDuration: G.longPressMs,
    maxDistance: G.longPressMove,
    onActivate: e => onMenu(e.absoluteY),
  });
  const pan = useDragPan({
    enabled: true, editing: p.editing, w: p.w, screenW: p.screenW, gw: p.gw, fw: p.w, calm, dg: p.dg,
    onStart: onDragStart, onAim, onEdge, onDrop,
  });
  const gesture = useExclusiveGestures(useSimultaneousGestures(hold, pan), tap);
  // 抖動：跟目錄的磚同一套（相鄰兩塊方向相反）。減少動態：不抖
  const rot = useSharedValue(0);
  useEffect(() => {
    if (!p.editing || calm) { cancelAnimation(rot); rot.value = 0; return; }
    const a = p.k % 2 ? -M.jiggle.deg : M.jiggle.deg;
    rot.value = withRepeat(withSequence(withTiming(a, { duration: M.jiggle.half }), withTiming(-a, { duration: M.jiggle.half })), -1, true);
    return () => cancelAnimation(rot);
  }, [p.editing, calm]); // eslint-disable-line react-hooks/exhaustive-deps
  // 同 Tile：動畫裡不准碰 p（p.n 是紙物件）
  const ghost = p.ghost;
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }],
    opacity: ghost ? 0 : 1 - pressed.value * (1 - PRESS_DIM),
  }), WEB_DEPS ? [ghost] : undefined);
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={style} accessible accessibilityRole="button" accessibilityLabel={p.label}
        accessibilityState={{ selected: p.cur }} accessibilityActions={NOTE_IN_A11Y}
        onAccessibilityAction={(e: AccessibilityActionEvent) => p.onA11y(e.nativeEvent.actionName)}>
        <TileFace n={p.n} w={p.w} cur={p.cur} />
      </Animated.View>
    </GestureDetector>
  );
}
// 拿起來的那張（D4 起目錄、資料夾共用）：畫在目錄最上層，從拿起那格的位置跟著手指平移，浮起一點（放大＋陰影）。不接觸控，手勢還在原本那塊上
function DragGhost({ dg, children }: { dg: DG; children: ReactNode }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: dg.x0.value + dg.dx.value }, { translateY: dg.y0.value + dg.dy.value }, { scale: 1 + dg.lift.value * (LIFT_SCALE - 1) }],
  }));
  return <Animated.View pointerEvents="none" style={[st.ghost, st.ghostAt, style]}>{children}</Animated.View>;
}

// 一塊磚的樣子：底色是那張紙的顏色，右下角露出一顆色圓，只有名字。正在看的那張用 accent 框起來（面板上唯一的 accent）。
// 釘選的右上角一個圖釘（次要字色，跟紙標題旁那顆同一個；C1）
function TileFace({ n, w, cur }: { n: Note; w: number; cur: boolean }) {
  const c = useColors();
  const nc = useNoteColors(n.color);
  return (
    <View style={[st.tile, { width: w, backgroundColor: nc.bg, borderColor: cur ? c.accent : nc.rule, borderWidth: cur ? T.shape.borderSelected : T.shape.borderCard }]}>
      {/* 沒取名的跟紙的標題列一樣用次要色，看得出是「還沒取名」不是名字 */}
      <Text style={[st.tileText, n.pinned && st.tileTextPinned, { color: n.title.trim() ? c.textPrimary : c.textSecondary }]} numberOfLines={2}>{label(n)}</Text>
      <View style={[st.tag, { backgroundColor: nc.hd }]} />
      {n.pinned ? <View style={st.pin}><Sym name="pin.fill" size={14} color={c.textSecondary} /></View> : null}
    </View>
  );
}

// 資料夾磚（D1，多米 2026-11-02 選）：跟紙磚一樣大，上面資料夾名，下面一排小方塊＝裡面紙的色點（最多四個，更多的寫 +N）。
// 底用整頁底色、框用分隔線色，跟紙磚的紙色分得開；正在看的紙在裡面就用 accent 框
function FolderFace({ f, notes, w, cur }: { f: Folder; notes: Note[]; w: number; cur: boolean }) {
  const c = useColors();
  const more = notes.length - T.shape.folderMinis;
  return (
    <View style={[st.tile, { width: w, backgroundColor: c.page, borderColor: cur ? c.accent : c.separator, borderWidth: cur ? T.shape.borderSelected : T.shape.borderCard }]}>
      <Text style={[st.tileText, { color: c.textPrimary }]} numberOfLines={1}>{f.name}</Text>
      <View style={st.minis}>
        {notes.slice(0, T.shape.folderMinis).map(n => <Mini key={n.id} color={n.color} />)}
        {more > 0 && <Text style={[st.more, { color: c.textSecondary }]}>+{more}</Text>}
      </View>
    </View>
  );
}
function Mini({ color }: { color: ColorKey }) {
  const nc = useNoteColors(color);
  return <View style={[st.mini, { backgroundColor: nc.hd }]} />;
}

// 打開的資料夾上面的名字：點了就能打，打一個字存一次（框收起時輸入框直接拿掉，等不到 blur）；清空不存，收鍵盤時變回原名
function FolderName({ f, focus }: { f: Folder; focus: boolean }) {
  const c = useColors();
  const [draft, setDraft] = useState(f.name);
  return (
    <TextInput value={draft} autoFocus={focus} selectTextOnFocus={focus} returnKeyType="done" accessibilityLabel="資料夾名字"
      onChangeText={v => { setDraft(v); if (renameFolder(store.s, f.id, v, Date.now())) store.change(); }}
      onBlur={() => { if (!draft.trim()) setDraft(f.name); }}
      style={[st.folderName, { color: c.textPrimary }]} />
  );
}

const st = StyleSheet.create({
  sheet: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden',
    borderBottomLeftRadius: T.shape.radiusPanel, borderBottomRightRadius: T.shape.radiusPanel, ...T.shape.shadowSoft },
  grabBox: { height: T.shape.hitMin, alignItems: 'center', justifyContent: 'center' },
  grab: { width: T.shape.handleSolo, height: T.shape.dirGrab, borderRadius: T.shape.pill(T.shape.dirGrab), opacity: T.shape.handleOff },
  top: { flexDirection: 'row', alignItems: 'center', gap: T.space.m, paddingHorizontal: T.space.l, paddingBottom: T.space.s },
  search: { flex: 1, height: T.shape.hitMin, borderRadius: T.shape.radiusCard, flexDirection: 'row', alignItems: 'center', gap: T.space.s,
    paddingHorizontal: T.space.m },
  // alignSelf stretch：輸入框撐滿 44 高的藥丸，字由 iOS 自己垂直置中。只靠字的本身高度時，中文字的上緣會被切掉（多米 2026-11-01 真機）
  searchInput: { flex: 1, minWidth: 0, alignSelf: 'stretch', ...T.font.body, paddingVertical: 0 },
  done: { minHeight: T.shape.hitMin, justifyContent: 'center' },
  doneText: { ...T.font.emphasis },
  body: { paddingHorizontal: T.space.l, paddingTop: T.space.s, paddingBottom: T.space.l },
  moveHead: { ...T.font.subhead, marginBottom: T.space.s, marginHorizontal: T.space.l + T.space.xs },
  page: { paddingHorizontal: T.space.l, paddingTop: T.space.s },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: T.space.s, paddingVertical: T.space.s },
  dot: { width: T.shape.pageDot, height: T.shape.pageDot, borderRadius: T.shape.pill(T.shape.pageDot) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: T.space.m, marginTop: T.space.m },
  ghost: { position: 'absolute', ...T.shape.shadowSoft },
  ghostAt: { left: 0, top: 0 },
  hidden: { opacity: 0 },
  tile: { height: T.shape.tile, borderRadius: T.shape.radiusCard, borderWidth: T.shape.borderCard, padding: T.space.m, overflow: 'hidden' },
  add: { borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: T.space.s },
  tileText: { ...T.font.emphasis },
  tileTextPinned: { marginRight: T.space.l }, // 名字長的時候不壓到右上角的圖釘
  pin: { position: 'absolute', top: T.space.m, right: T.space.m },
  tag: { position: 'absolute', right: -T.space.m, bottom: -T.space.m, width: T.shape.tileTag, height: T.shape.tileTag, borderRadius: T.shape.pill(T.shape.tileTag) },
  trashRow: { flexDirection: 'row', alignItems: 'center', gap: T.space.s, minHeight: T.shape.hitMin, marginHorizontal: T.space.l,
    paddingVertical: T.space.m, borderTopWidth: StyleSheet.hairlineWidth },
  trashText: { ...T.font.body },
  minis: { position: 'absolute', left: T.space.m, bottom: T.space.m, flexDirection: 'row', alignItems: 'center', gap: T.space.xs },
  mini: { width: T.shape.folderMini, height: T.shape.folderMini, borderRadius: T.shape.folderMiniRadius },
  more: { ...T.font.footnote },
  folderWrap: { justifyContent: 'center' },
  folderBox: { marginHorizontal: T.space.l, borderRadius: T.shape.radiusPanel, padding: T.space.l, ...T.shape.shadowSoft },
  folderName: { ...T.font.paperTitle, textAlign: 'center', paddingVertical: T.space.m, marginHorizontal: T.space.l },
});

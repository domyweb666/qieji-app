// 疊在所有畫面上面的一層：選單、確認框、toast、開花與茄子進籃的動畫。
// 其他畫面用 ui.sheet() / ui.toast() / ui.pop() / ui.toBasket() 呼叫。
import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, interpolate, SlideInDown, SlideOutDown, useAnimatedStyle, useReducedMotion,
  useSharedValue, withSequence, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import type { Kind } from '../lib/model';
import { ART, T } from '../lib/theme';

export type Row = { label: string; fn: () => void; danger?: boolean; dot?: string; on?: boolean };
type SheetSpec = { title?: string; rows?: Row[]; render?: (close: () => void) => ReactNode };
type ToastSpec = { msg: string; action?: { label: string; fn: () => void } };
type Pt = { x: number; y: number };
type Fx = { key: number; kind: Kind; at: Pt; fly: boolean };

let host: {
  sheet: (s: SheetSpec | null) => void;
  confirm: (c: { msg: string; ok: () => void } | null) => void;
  toast: (t: ToastSpec | null) => void;
  fx: (f: Fx) => void;
} | null = null;
let calm = false;
let fxKey = 0;

export const ui = {
  sheet: (rows: Row[], title?: string) => host?.sheet({ rows, title }),
  custom: (title: string, render: (close: () => void) => ReactNode) => host?.sheet({ title, render }),
  confirm: (msg: string, ok: () => void) => host?.confirm({ msg, ok }),
  toast: (msg: string, action?: ToastSpec['action']) => host?.toast({ msg, action }),
  // 行尾冒出一朵花（或茄子）往上飄；at = 那一行右側中間的螢幕座標
  pop: (at: Pt, kind: Kind) => host?.fx({ key: ++fxKey, kind, at, fly: false }),
  // 劃掉時小茄子沿拋物線飛進右下角的籃子；系統開「減少動態效果」時改回原地彈出
  toBasket: (at: Pt, kind: Kind) => host?.fx({ key: ++fxKey, kind, at, fly: !calm }),
};

export function OverlayHost() {
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const [confirm, setConfirm] = useState<{ msg: string; ok: () => void } | null>(null);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const [fx, setFx] = useState<Fx[]>([]);
  const [basketOn, setBasketOn] = useState(false);
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  useEffect(() => { calm = reduce; }, [reduce]);

  useEffect(() => {
    const mine: typeof host = {
      sheet: setSheet,
      confirm: setConfirm,
      toast: setToast,
      fx: f => { setFx(a => [...a, f]); if (f.fly) setBasketOn(true); },
    };
    host = mine;
    return () => { if (host === mine) host = null; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // 籃子在最後一顆茄子落下 1.3 秒後收起
  const [landed, setLanded] = useState(0);
  useEffect(() => {
    if (!landed) return;
    const t = setTimeout(() => setBasketOn(false), 1300);
    return () => clearTimeout(t);
  }, [landed]);

  const closeSheet = () => setSheet(null);
  const dropFx = (key: number) => setFx(a => a.filter(f => f.key !== key));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {fx.map(f => f.fly
        ? <Fly key={f.key} f={f} bottom={insets.bottom} onLand={() => { dropFx(f.key); setLanded(Date.now()); }} />
        : <Pop key={f.key} f={f} onDone={() => dropFx(f.key)} />)}
      <Basket on={basketOn} bottom={insets.bottom} landed={landed} />

      {toast && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}
          style={[s.toast, { bottom: insets.bottom + 150 }]}>
          <Text style={s.toastText}>{toast.msg}</Text>
          {toast.action && (
            <Pressable hitSlop={10} onPress={() => { toast.action!.fn(); setToast(null); }}>
              <Text style={s.toastBtn}>{toast.action.label}</Text>
            </Pressable>
          )}
        </Animated.View>
      )}

      {sheet && (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)} style={[StyleSheet.absoluteFill, s.backdrop]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
          </Animated.View>
          <Animated.View entering={SlideInDown.duration(220)} exiting={SlideOutDown.duration(180)}
            style={[s.sheet, { paddingBottom: insets.bottom + 8 }]}>
            <ScrollView bounces={false}>
              {sheet.title ? <Text style={s.sheetTitle}>{sheet.title}</Text> : null}
              {sheet.render?.(closeSheet)}
              {sheet.rows?.map((r, i) => (
                <Pressable key={i} style={({ pressed }) => [s.opt, pressed && { backgroundColor: '#F3ECE2' }]}
                  onPress={() => { closeSheet(); r.fn(); }}>
                  {r.dot ? <View style={[s.dot, { backgroundColor: r.dot }]} /> : null}
                  <Text style={[s.optText, r.danger && { color: T.danger }]}>{r.label}</Text>
                  {r.on ? <Text style={s.on}>✓</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        </View>
      )}

      {confirm && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[StyleSheet.absoluteFill, s.backdrop, s.center]}>
          <View style={s.dlg}>
            <Text style={s.dlgText}>{confirm.msg}</Text>
            <View style={s.acts}>
              <Pressable hitSlop={8} onPress={() => setConfirm(null)}><Text style={s.act}>取消</Text></Pressable>
              <Pressable hitSlop={8} onPress={() => { const ok = confirm.ok; setConfirm(null); ok(); }}>
                <Text style={[s.act, { color: T.danger }]}>刪除</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const artOf = (k: Kind) => (k === 'f' ? ART.flower : k === 'g' ? ART['egg-gold'] : ART['egg-small']);

function Pop({ f, onDone }: { f: Fx; onDone: () => void }) {
  const t = useSharedValue(0);
  const w = f.kind === 'f' ? 34 : 40;
  const a = artOf(f.kind);
  useEffect(() => {
    t.value = withTiming(1, { duration: 1150, easing: Easing.linear }, done => { if (done) scheduleOnRN(onDone); });
  }, []);
  const st = useAnimatedStyle(() => {
    const v = t.value;
    return {
      opacity: interpolate(v, [0, 0.22, 0.75, 1], [0, 1, 1, 0]),
      transform: [
        { translateY: interpolate(v, [0, 0.22, 0.36, 0.75, 1], [8, -4, 0, -22, -38]) },
        { scale: interpolate(v, [0, 0.22, 0.36, 0.75, 1], [0.2, 1.18, 1, 1, 0.9]) },
      ],
    };
  });
  const left = f.at.x - (f.kind === 'f' ? 50 : 58);
  const top = f.at.y - (f.kind === 'f' ? 20 : 30);
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left, top, width: w, height: w / a.r }, st]}>
      <Image source={a.src} style={{ width: w, height: w / a.r }} />
    </Animated.View>
  );
}

const BASKET_W = 64;
const basketBox = (W: number, H: number, bottom: number) => {
  const h = BASKET_W / ART['basket-only'].r;
  return { x: W - 16 - BASKET_W / 2, y: H - (bottom + 18) - h + h * 0.45 }; // 籃口
};

function Fly({ f, bottom, onLand }: { f: Fx; bottom: number; onLand: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
  const t = useSharedValue(0);
  const a = artOf(f.kind);
  const sx = f.at.x - 58, sy = f.at.y - 30; // 從那一行旁邊出發
  const b = basketBox(W, H, bottom);
  const tx = b.x - sx - 20, ty = b.y - sy - 40;
  useEffect(() => {
    t.value = withTiming(1, { duration: 1050, easing: Easing.linear }, done => { if (done) scheduleOnRN(onLand); });
  }, []);
  const st = useAnimatedStyle(() => {
    const p = t.value;
    if (p < 0.28) {
      // 先在原地彈出來
      return {
        opacity: interpolate(p, [0, 0.16, 0.28], [0, 1, 1]),
        transform: [
          { translateX: sx },
          { translateY: sy + interpolate(p, [0, 0.16, 0.28], [8, -6, 0]) },
          { rotate: '0deg' },
          { scale: interpolate(p, [0, 0.16, 0.28], [0.2, 1.18, 1]) },
        ],
      };
    }
    // 再沿拋物線轉著落進籃子
    const u = (p - 0.28) / 0.72;
    const lift = 90 * Math.sin(Math.PI * u) * (1 - u * 0.4);
    return {
      opacity: u > 0.875 ? interpolate(u, [0.875, 1], [1, 0]) : 1,
      transform: [
        { translateX: sx + tx * u },
        { translateY: sy + ty * u * u - lift },
        { rotate: `${u * 200}deg` },
        { scale: 1 - 0.35 * u },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: 40, height: 40 / a.r, zIndex: 42 }, st]}>
      <Image source={a.src} style={{ width: 40, height: 40 / a.r }} />
    </Animated.View>
  );
}

function Basket({ on, bottom, landed }: { on: boolean; bottom: number; landed: number }) {
  const v = useSharedValue(0);
  const sx = useSharedValue(1), sy = useSharedValue(1);
  useEffect(() => {
    v.value = withTiming(on ? 1 : 0, { duration: 250, easing: Easing.bezier(0.3, 1.4, 0.5, 1) });
  }, [on]);
  useEffect(() => {
    if (!landed) return;
    // 茄子落進去，籃子壓扁再回彈
    const ease = { duration: 127, easing: Easing.out(Easing.quad) };
    sx.value = withSequence(withTiming(1.16, ease), withTiming(0.95, ease), withTiming(1, ease));
    sy.value = withSequence(withTiming(0.82, ease), withTiming(1.06, ease), withTiming(1, ease));
  }, [landed]);
  const st = useAnimatedStyle(() => ({
    opacity: Math.min(1, v.value),
    transform: [
      { translateY: (1 - v.value) * 16 },
      { scale: 0.85 + 0.15 * v.value },
      { scaleX: sx.value },
      { scaleY: sy.value },
    ],
  }));
  const a = ART['basket-only'];
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', right: 16, bottom: bottom + 18, zIndex: 41 }, st]}>
      <Image source={a.src} style={{ width: BASKET_W, height: BASKET_W / a.r }} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,.35)' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '80%', backgroundColor: T.card,
    borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8 },
  sheetTitle: { marginTop: 8, marginHorizontal: 20, marginBottom: 6, fontSize: 15, color: T.muted, fontWeight: '500' },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 20 },
  optText: { fontSize: 18, color: T.text },
  dot: { width: 24, height: 24, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(0,0,0,.2)' },
  on: { marginLeft: 'auto', color: T.egg, fontWeight: '700', fontSize: 18 },
  dlg: { backgroundColor: T.card, borderRadius: 26, width: '100%', maxWidth: 420, paddingTop: 26, paddingHorizontal: 24, paddingBottom: 14 },
  dlgText: { fontSize: 21, lineHeight: 31, color: T.text, marginBottom: 18 },
  acts: { flexDirection: 'row', justifyContent: 'flex-end', gap: 30, marginTop: 16 },
  act: { color: T.egg, fontSize: 19, paddingVertical: 10, paddingHorizontal: 6 },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: '#3A2E42', paddingVertical: 11, paddingHorizontal: 18,
    borderRadius: 22, flexDirection: 'row', gap: 16, alignItems: 'center', zIndex: 50 },
  toastText: { color: '#fff', fontSize: 15 },
  toastBtn: { color: '#CDB4E6', fontWeight: '700', fontSize: 15 },
});

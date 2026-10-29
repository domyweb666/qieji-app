// 劃掉一行時的收成動畫：籃子從右下升起 → 小茄子從那一行彈出、翻滾飛過去 → 掉進籃子
// （籃子前緣蓋住它）→ 籃子壓扁晃兩下、冒出 +1、輕震一下 → 停一下再沉下去。
// 籃子分兩層畫：後層是整張圖，前層只留籃口以下，茄子夾在兩層中間，看起來就是掉進去了。
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { Kind } from '../lib/model';
import { weekGarden } from '../lib/model';
import { store } from '../lib/store';
import { HARVEST } from '../lib/theme';
import { Sym } from './Sym';

export type Flight = { key: number; kind: Kind; at: { x: number; y: number } };

const BW = 80;          // 籃子寬
const UP = 64;          // 離底部安全區的距離（讓出底部工具列）
const T_POP = 260, T_ARC = 560, T_DROP = 200; // 彈出、飛、落下（毫秒）
const T_ALL = T_POP + T_ARC + T_DROP;
const STAY = 900;       // 最後一顆落下後籃子再停多久
const GOLD = '#D9A520';

const level = (n: number) => (n <= 0 ? 0 : n < 7 ? 1 : 2);
const weekEggs = () => weekGarden(store.s).eggs.length;

// 籃子的位置與籃口（螢幕座標）
function useBox(bottom: number) {
  const { width: W, height: H } = useWindowDimensions();
  // 三張籃子圖高度差一點點，框子用最高的那張，圖都貼齊底部
  const h = Math.max(...HARVEST.baskets.map(b => BW / b.r));
  const x = W - 16 - BW, y = H - (bottom + UP) - h;
  const h0 = BW / HARVEST.baskets[0].r;
  return { x, y, w: BW, h, cx: x + BW / 2, mouth: y + (h - h0) + h0 * HARVEST.rim };
}

export function HarvestLayer({ flights, bottom, onDone }: { flights: Flight[]; bottom: number; onDone: (key: number) => void }) {
  const box = useBox(bottom);
  const show = useSharedValue(0);  // 升起 0→1
  const sx = useSharedValue(1), sy = useSharedValue(1), rot = useSharedValue(0);
  const [fill, setFill] = useState(0);
  const [pluses, setPluses] = useState<{ key: number; gold: boolean }[]>([]);
  const [lastLand, setLastLand] = useState(0);
  const active = flights.length > 0;

  // 有茄子要飛 → 籃子升起
  useEffect(() => {
    if (!active) return;
    show.value = withTiming(1, { duration: 280, easing: Easing.bezier(0.3, 1.5, 0.5, 1) });
  }, [active]);

  // 最後一顆落下後停一下再沉下去
  useEffect(() => {
    if (!lastLand || active) return;
    const t = setTimeout(() => {
      show.value = withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) });
      setTimeout(() => setLastLand(0), 300); // 收好了，下一輪重新算籃子裡有多少
    }, STAY);
    return () => clearTimeout(t);
  }, [lastLand, active]);

  function land(f: Flight) {
    onDone(f.key);
    setLastLand(Date.now());
    setFill(level(weekEggs()));
    setPluses(p => [...p, { key: f.key, gold: f.kind === 'g' }]);
    // 壓扁 → 回彈 → 左右晃兩下
    const q = { duration: 110, easing: Easing.out(Easing.quad) };
    sx.value = withSequence(withTiming(1.14, q), withTiming(0.96, q), withTiming(1, q));
    sy.value = withSequence(withTiming(0.84, q), withTiming(1.05, q), withTiming(1, q));
    rot.value = withSequence(withTiming(-6, q), withTiming(5, q), withTiming(-2, q), withTiming(0, q));
    if (f.kind === 'g') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  const basketSt = useAnimatedStyle(() => ({
    opacity: Math.min(1, show.value * 1.5),
    transform: [
      { translateY: (1 - show.value) * 90 },
      { rotate: `${rot.value}deg` },
      { scaleX: sx.value },
      { scaleY: sy.value },
    ],
  }));

  // 還沒有茄子落下時，先顯示收成前的數量
  const img = HARVEST.baskets[lastLand ? fill : level(weekEggs() - flights.length)];
  const boxSt = { left: box.x, top: box.y, width: box.w, height: box.h };
  const imgSt = { position: 'absolute' as const, bottom: 0, width: box.w, height: box.w / img.r };
  return (
    <>
      {/* 後層：整個籃子 */}
      <Animated.View pointerEvents="none" style={[st.basket, boxSt, { zIndex: 41 }, basketSt]}>
        <Image source={img.src} style={imgSt} />
      </Animated.View>
      {flights.map(f => <Egg key={f.key} f={f} box={box} onLand={() => land(f)} />)}
      {/* 前層：只有籃口前緣以下，蓋住掉進去的茄子 */}
      <Animated.View pointerEvents="none" style={[st.basket, boxSt, { zIndex: 43 }, basketSt]}>
        <Image source={img.front} style={imgSt} />
      </Animated.View>
      {pluses.map(p => (
        <Plus key={p.key} gold={p.gold} x={box.cx} y={box.y} show={show}
          onDone={() => setPluses(a => a.filter(x => x.key !== p.key))} />
      ))}
    </>
  );
}

// 一顆飛的茄子：原地彈出（壓扁再彈起）→ 拋物線翻滾到籃口正上方 → 直直掉進籃子
function Egg({ f, box, onLand }: { f: Flight; box: ReturnType<typeof useBox>; onLand: () => void }) {
  const t = useSharedValue(0);
  const a = HARVEST.fly[f.kind === 'g' ? 'g' : 'e'];
  const EW = a.w, eh = EW / a.r;
  const sx = f.at.x - 56, sy = f.at.y - eh / 2;        // 從那一行右側出發
  const ax = box.cx - EW / 2, ay = box.mouth - eh - 26; // 籃口正上方
  // 落進籃子後：大半被前緣蓋住，但腳不能從籃底露出來
  const iy = Math.min(box.mouth - eh * 0.3, box.y + box.h - 8 - eh * 0.94);
  const p1 = T_POP / T_ALL, p2 = (T_POP + T_ARC) / T_ALL;
  const spin = sx < ax ? 1 : -1;

  useEffect(() => {
    t.value = withTiming(1, { duration: T_ALL, easing: Easing.linear }, done => { if (done) scheduleOnRN(onLand); });
  }, []);

  const style = useAnimatedStyle(() => {
    const v = t.value;
    if (v < p1) {
      const u = v / p1;
      return {
        opacity: interpolate(u, [0, 0.3, 1], [0, 1, 1]),
        transform: [
          { translateX: sx },
          { translateY: sy + interpolate(u, [0, 0.45, 0.7, 1], [10, -14, -8, -10]) },
          { rotate: '0deg' },
          { scaleX: interpolate(u, [0, 0.45, 0.7, 1], [0.3, 0.92, 1.12, 1]) },
          { scaleY: interpolate(u, [0, 0.45, 0.7, 1], [0.3, 1.18, 0.88, 1]) },
        ],
      };
    }
    if (v < p2) {
      // 拋物線：越過一個弧頂，邊飛邊翻一圈
      const u = (v - p1) / (p2 - p1);
      const lift = 110 * Math.sin(Math.PI * u);
      const e = u * u * (3 - 2 * u);
      return {
        opacity: 1,
        transform: [
          { translateX: sx + (ax - sx) * e },
          { translateY: sy - 10 + (ay - sy + 10) * e - lift },
          { rotate: `${spin * 360 * e}deg` },
          { scaleX: 1 - 0.12 * u },
          { scaleY: 1 - 0.12 * u },
        ],
      };
    }
    // 掉進去：像重力一樣越掉越快，最後稍微拉長
    const u = (v - p2) / (1 - p2);
    return {
      opacity: 1,
      transform: [
        { translateX: ax },
        { translateY: ay + (iy - ay) * u * u },
        { rotate: '0deg' },
        { scaleX: 0.88 - 0.06 * u },
        { scaleY: 0.88 + 0.08 * u },
      ],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[st.egg, { width: EW, height: eh }, style]}>
      <Image source={a.src} style={{ width: EW, height: eh }} />
    </Animated.View>
  );
}

// 籃子上方冒出 +1（金色茄子再加一圈星星）
function Plus({ gold, x, y, show, onDone }: { gold: boolean; x: number; y: number; show: SharedValue<number>; onDone: () => void }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(40, withTiming(1, { duration: 820, easing: Easing.out(Easing.cubic) }, done => { if (done) scheduleOnRN(onDone); }));
  }, []);
  const plus = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.15, 0.7, 1], [0, 1, 1, 0]) * Math.min(1, show.value * 1.5),
    transform: [{ translateY: -34 * t.value }, { scale: interpolate(t.value, [0, 0.18, 0.3, 1], [0.5, 1.2, 1, 1]) }],
  }));
  const stars = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.2, 0.6, 1], [0, 1, 1, 0]),
    transform: [{ scale: interpolate(t.value, [0, 0.3, 1], [0.3, 1.1, 0.9]) }, { rotate: `${40 * t.value}deg` }],
  }));
  return (
    <>
      <Animated.View pointerEvents="none" style={[st.plus, { left: x - 30, top: y - 10 }, plus]}>
        <Text style={[st.plusText, gold && { color: GOLD }]}>+1</Text>
      </Animated.View>
      {gold && (
        <Animated.View pointerEvents="none" style={[st.stars, { left: x - 60, top: y - 30 }, stars]}>
          <View style={{ position: 'absolute', left: 4, top: 30 }}><Sym name="sparkle" size={16} color={GOLD} /></View>
          <View style={{ position: 'absolute', right: 6, top: 8 }}><Sym name="sparkle" size={20} color={GOLD} /></View>
          <View style={{ position: 'absolute', right: 0, top: 58 }}><Sym name="sparkle" size={13} color={GOLD} /></View>
        </Animated.View>
      )}
    </>
  );
}

const st = StyleSheet.create({
  basket: { position: 'absolute', transformOrigin: 'bottom' },
  egg: { position: 'absolute', left: 0, top: 0, zIndex: 42 },
  plus: { position: 'absolute', width: 60, alignItems: 'center', zIndex: 44 },
  plusText: { fontSize: 20, fontWeight: '800', color: '#7A4FA0', textShadowColor: 'rgba(255,255,255,0.9)', textShadowRadius: 4 },
  stars: { position: 'absolute', width: 120, height: 90, zIndex: 44 },
});

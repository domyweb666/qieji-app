// 茄子田：只顯示本週，茄子依收成順序一顆顆掉到田畦上
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, Keyframe, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { SLOTS, weekGarden } from '../lib/model';
import { useStore } from '../lib/store';
import { ART, T } from '../lib/theme';

const FW = 941, FH = 800;

export default function GardenScreen() {
  const s = useStore();
  const insets = useSafeAreaInsets();
  const calm = useReducedMotion();
  const [fieldW, setFieldW] = useState(0);
  const { f, eggs } = weekGarden(s);
  const shown = eggs.slice(0, SLOTS.length);
  const more = eggs.length - shown.length;
  const t = s.garden.tot;
  const fieldH = fieldW / (FW / FH);
  const eggW = fieldW * 0.08;

  // back ridge first so front ones overlap correctly
  const planted = shown.map((n, i) => ({ n, xy: SLOTS[i], i })).sort((a, b) => a.xy[1] - b.xy[1]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: T.app }} contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 24 }}>
      <View style={st.head}>
        <Text style={st.h2}>茄子田</Text>
        <Pressable style={st.ib} onPress={() => router.back()} accessibilityLabel="關閉"><Icon name="close" color={T.text} /></Pressable>
      </View>

      <View style={{ width: '100%', aspectRatio: FW / FH }} onLayout={e => setFieldW(e.nativeEvent.layout.width)}>
        <Image source={ART.field.src} style={StyleSheet.absoluteFill} contentFit="fill" />
        {fieldW > 0 && planted.map(({ n, xy: [x, y], i }) => {
          const a = ART[n], h = eggW / a.r;
          return (
            <Animated.View key={i}
              entering={calm ? undefined : drop(h).delay(200 + Math.min(i * 75, 1500))}
              style={[st.egg, { left: (x / FW) * fieldW - eggW / 2, top: (y / FH) * fieldH - h * 0.9, width: eggW, height: h }]}>
              <Image source={a.src} style={{ width: eggW, height: h }} />
            </Animated.View>
          );
        })}
        <Text style={st.sign}>本週{'\n'}{eggs.length} 顆</Text>
      </View>

      <View style={st.stats}>
        <Stat art="flower" n={f} label="本週開的花" />
        <Stat art="egg" n={eggs.length} label="本週結的茄子" />
      </View>
      <Text style={st.note}>
        {eggs.length
          ? (more > 0 ? `田裡種不下了，還有 ${more} 顆收在籃子裡。\n` : '') + '每一顆茄子，都是一個你想完、放下的念頭。'
          : '這週的田還空著。\n記下一個想法會開一朵花，\n在清單裡往右滑劃掉它，就會結出一顆茄子。'}
      </Text>
      <Text style={st.total}>到目前為止：{t.f} 朵花　·　{t.e} 顆茄子</Text>
    </ScrollView>
  );
}

// 從天上掉下來、壓扁、彈一下（位移以茄子自己的高度為單位，跟網頁版的 % 一樣）
const drop = (h: number) => new Keyframe({
  0: { transform: [{ translateY: -3.3 * h }, { scaleX: 1 }, { scaleY: 1 }], opacity: 0 },
  45: { opacity: 1 },
  62: { transform: [{ translateY: 0.06 * h }, { scaleX: 1.08 }, { scaleY: 0.9 }], easing: Easing.bezier(0.35, 0.6, 0.45, 1) },
  78: { transform: [{ translateY: -0.14 * h }, { scaleX: 0.97 }, { scaleY: 1.04 }] },
  100: { transform: [{ translateY: 0 }, { scaleX: 1 }, { scaleY: 1 }], opacity: 1 },
}).duration(750);

function Stat({ art, n, label }: { art: 'flower' | 'egg'; n: number; label: string }) {
  const a = ART[art];
  return (
    <View style={st.stat}>
      <Image source={a.src} style={{ width: 34, height: 34 / a.r }} />
      <View>
        <Text style={st.statN}>{n}</Text>
        <Text style={st.statL}>{label}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 6, paddingHorizontal: 6, paddingLeft: 16 },
  h2: { flex: 1, fontSize: 24, fontWeight: '600', color: T.egg },
  ib: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  egg: { position: 'absolute', shadowColor: '#3C1E14', shadowOpacity: 0.25, shadowRadius: 2, shadowOffset: { width: 0, height: 2 } },
  sign: { position: 'absolute', left: '72%', width: '15%', top: '6.5%', transform: [{ rotate: '4deg' }], fontSize: 13, fontWeight: '700',
    color: '#6B4423', textAlign: 'center', lineHeight: 15 },
  stats: { flexDirection: 'row', gap: 10, paddingTop: 4, paddingHorizontal: 16 },
  stat: { flex: 1, backgroundColor: T.card, borderWidth: 1, borderColor: T.line, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 10,
    flexDirection: 'row', alignItems: 'center', gap: 10 },
  statN: { fontSize: 24, color: T.egg, fontWeight: '700', lineHeight: 27 },
  statL: { fontSize: 13, color: T.muted },
  note: { marginTop: 14, marginHorizontal: 22, fontSize: 14, lineHeight: 25, color: T.muted, textAlign: 'center' },
  total: { marginTop: 10, marginHorizontal: 22, fontSize: 13, color: T.muted, textAlign: 'center' },
});

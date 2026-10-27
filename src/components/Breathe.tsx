// 空白畫面的插圖：輕輕上下浮動
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { ART, T, type ArtName } from '../lib/theme';

export function EmptyArt({ art, lines }: { art: ArtName; lines: string[] }) {
  const calm = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (calm) return;
    t.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [calm]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: -7 * t.value }, { scale: 1 + 0.012 * t.value }] }));
  const a = ART[art];
  return (
    <View style={s.wrap}>
      <Animated.View style={[s.art, st]}>
        <Image source={a.src} style={{ width: '100%', aspectRatio: a.r }} />
      </Animated.View>
      {lines.map((l, i) => <Text key={i} style={s.text}>{l}</Text>)}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 20 },
  art: { width: '62%', maxWidth: 230, marginBottom: 8 },
  text: { color: T.muted, fontSize: 17, lineHeight: 30, textAlign: 'center' },
});

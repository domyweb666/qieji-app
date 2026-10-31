// 空白畫面：置中的灰色說明文字，上面可以放一顆茄子（扁平線條版，只在空的地方陪人，不在動作之後鼓掌）
import { Image, type ImageSource } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { T, useColors } from '../lib/tokens';

export function Empty({ lines, face }: { lines: string[]; face?: ImageSource }) {
  const c = useColors();
  return (
    <View style={s.wrap}>
      {face ? <Image source={face} style={s.face} contentFit="contain" accessible={false} /> : null}
      {lines.map((l, i) => <Text key={i} style={[s.text, { color: c.textSecondary }]}>{l}</Text>)}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: T.space.xxl, paddingHorizontal: T.space.l },
  face: { width: T.shape.emptyFace, height: T.shape.emptyFace, marginBottom: T.space.m },
  text: { ...T.font.subhead, lineHeight: T.font.emptyLineHeight, textAlign: 'center' },
});

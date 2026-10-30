// 空白畫面：置中的灰色說明文字
import { StyleSheet, Text, View } from 'react-native';
import { T, useColors } from '../lib/tokens';

export function Empty({ lines }: { lines: string[] }) {
  const c = useColors();
  return (
    <View style={s.wrap}>
      {lines.map((l, i) => <Text key={i} style={[s.text, { color: c.textSecondary }]}>{l}</Text>)}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: T.space.xxl, paddingHorizontal: T.space.l },
  text: { ...T.font.subhead, lineHeight: T.font.emptyLineHeight, textAlign: 'center' },
});

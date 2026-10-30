// 空白畫面：置中的灰色說明文字
import { StyleSheet, Text, View } from 'react-native';
import { C, F } from '../lib/theme';

export function Empty({ lines }: { lines: string[] }) {
  return (
    <View style={s.wrap}>
      {lines.map((l, i) => <Text key={i} style={s.text}>{l}</Text>)}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  text: { color: C.secondary, fontSize: F.subhead, lineHeight: 24, textAlign: 'center' },
});

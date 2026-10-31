// 一排九個色塊（紙的九種顏色）：紙的 ⋯ 選單用它換紙的顏色，目錄的 ⋯ 用它篩選。
// 2026-11-01 多米定 A1「全部自繪」：同一個意義（紙的顏色）整個 app 一種樣子，目錄不再用原生表單的 emoji 色點。
// current＝null 表示沒有選中的（篩選「全部」）。顏色、尺寸全部來自 src/lib/tokens.ts，這裡不寫裸數字。
import { Pressable, StyleSheet, View } from 'react-native';
import { CKEYS, col, type ColorKey } from '../lib/model';
import { T, useColors, useNoteColors } from '../lib/tokens';

export function Swatches({ current, onPick, label = '顏色' }: { current: ColorKey | null; onPick: (k: ColorKey) => void; label?: string }) {
  return (
    <View style={st.swatches} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {CKEYS.map(k => <Swatch key={k} k={k} on={k === current} onPress={() => onPick(k)} />)}
    </View>
  );
}
function Swatch({ k, on, onPress }: { k: ColorKey; on: boolean; onPress: () => void }) {
  const c = useColors();
  const nc = useNoteColors(k);
  return (
    <Pressable onPress={onPress} hitSlop={T.space.s} accessibilityRole="radio"
      accessibilityLabel={`${col(k).hue}（${col(k).name}）`} accessibilityState={{ selected: on, checked: on }}
      style={({ pressed }) => [st.swatchBox, { borderColor: on ? c.accent : 'transparent' }, pressed && { opacity: T.motion.pressDim }]}>
      <View style={[st.swatch, { backgroundColor: nc.hd, borderColor: c.dotOutline }]} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  swatches: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: T.space.m, paddingVertical: T.space.m },
  swatchBox: { width: T.shape.swatchDot, height: T.shape.swatchDot, borderRadius: T.shape.pill(T.shape.swatchDot), borderWidth: T.shape.borderSelected - T.shape.borderCard },
  swatch: { flex: 1, borderRadius: T.shape.pill(T.shape.swatchDot), borderWidth: T.shape.borderCard },
});

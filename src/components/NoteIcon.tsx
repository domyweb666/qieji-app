// 小方磚（2026-11-04 切換清單改版：切換清單每一項前面、左上清單名的小膠囊裡）：跟目錄的磚同一個樣子縮小——
// 紙的顏色、圓角（邊長 × tileRadiusRatio）、正中間磚上的字（glyphOf；沒取名也沒設字是灰色「未」）
import { StyleSheet, Text, View } from 'react-native';
import { glyphOf, type Note } from '../lib/model';
import { T, useColors, useNoteColors } from '../lib/tokens';

export function NoteIcon({ n, size }: { n: Note; size: number }) {
  const c = useColors();
  const nc = useNoteColors(n.color);
  return (
    <View style={[st.box, { width: size, height: size, borderRadius: size * T.shape.tileRadiusRatio, backgroundColor: nc.bg, borderColor: nc.rule }]}>
      <Text style={[st.glyph, { fontSize: Math.round(size * T.shape.tileGlyphRatio), color: n.title.trim() || n.glyph ? c.textPrimary : c.textSecondary }]}
        allowFontScaling={false} accessible={false}>{glyphOf(n)}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  box: { borderWidth: T.shape.borderCard, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  glyph: { fontWeight: T.font.emphasis.fontWeight, textAlign: 'center' },
});

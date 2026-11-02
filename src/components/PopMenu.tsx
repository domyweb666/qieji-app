// 選單：右上角 ⋯ 或長按打開，從錨點彈出一張奶油白卡片，後面整個畫面變暗，選單上的字才看得清楚。
// 2026-11-01 多米定 A1「全部自繪」：紙的 ⋯、行的長按、目錄的 ⋯、最近刪除的一則，整個 app 只有這一種選單（之前目錄與最近刪除走 iOS 原生動作表單，
// 收法、語意、色點都跟這張卡對不上）。皮換成目錄面板的語彙：卡片裡每一項是 page 底的藥丸、靠間距分組，沒有髮絲分隔線（2-6 接近律）；
// 左邊圖示、右邊文字，打勾的項目（on）右端一個 ✓。inline 的子選單攤開成一組；head 的組最上面印一行小字當標題（例如「排序」）。
// header：放在最上面的一塊（紙的 ⋯ 把九個色塊放這裡，目錄用同一排色塊篩選）。
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { T, useColors } from '../lib/tokens';
import type { Act } from './Acts';
import { Sym } from './Sym';

type Group = { head?: string; rows: Act[] };

// side、lifted（2026-11-02，目錄的長按照虛擬手機原型＝iOS 主畫面）：side 是卡片靠哪邊（預設右）；lifted 是畫在暗幕上面、卡片下面的東西
// （目錄把被長按的那塊磚浮起來放在原位，選單接在它正下方或正上方）
export function PopMenu({ acts, top, header, onClose, side = 'right', lifted }: {
  acts: Act[]; top: number; header?: ReactNode; onClose: () => void; side?: 'left' | 'right'; lifted?: ReactNode;
}) {
  const c = useColors();
  // 減少動態：放大縮小改成淡入淡出
  const calm = useReducedMotion();
  const cardIn = calm ? FadeIn.duration(T.motion.fade) : ZoomIn.duration(T.motion.menuPop.in);
  const cardOut = calm ? FadeOut.duration(T.motion.fade) : ZoomOut.duration(T.motion.menuPop.out);
  // 一般項目連在一起算一組，inline 子選單自成一組
  const groups: Group[] = [];
  for (const a of acts.filter(x => !x.hidden)) {
    if (a.sub && a.inline) {
      const rows = a.sub.filter(x => !x.hidden);
      if (rows.length) groups.push({ head: a.head ? a.label : undefined, rows }, { rows: [] });
    } else {
      if (!groups.length) groups.push({ rows: [] });
      groups[groups.length - 1].rows.push(a);
    }
  }
  const sections = groups.filter(g => g.rows.length);
  const pick = (a: Act) => { onClose(); a.fn?.(); };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn.duration(T.motion.menuBackdrop.in)} exiting={FadeOut.duration(T.motion.menuBackdrop.out)}
        style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="關閉選單" />
      </Animated.View>
      {lifted}
      <Animated.View entering={cardIn} exiting={cardOut} style={[st.card, side === 'left' && st.cardLeft, { backgroundColor: c.surface, top }]}>
        {header}
        {/* 分組照 iOS 設定 app 的「分組清單」：一組一塊圓角底、組裡的項目用從文字起算的髮絲線隔開、組與組之間留一大段（多米 2026-11-01 看了
            每項各自一顆藥丸的版本說太雜，要參考設定 app 的間距） */}
        {sections.map((g, gi) => (
          <View key={gi} style={(gi > 0 || !!header) && st.groupGap}>
            {g.head ? <Text style={[st.head, { color: c.textSecondary }]}>{g.head}</Text> : null}
            <View style={[st.group, { backgroundColor: c.page }]}>
              {g.rows.map((a, i) => (
                <View key={a.label}>
                  {i > 0 && <View style={[st.sep, { backgroundColor: c.separator }]} />}
                  <Pressable onPress={() => pick(a)} accessibilityRole="menuitem"
                    accessibilityState={a.on == null ? undefined : { checked: a.on }}
                    style={({ pressed }) => [st.row, pressed && { backgroundColor: c.pressedFill }]}>
                    <View style={st.icon}>{a.icon ? <Sym name={a.icon} size={19} color={a.destructive ? c.danger : c.textPrimary} /> : null}</View>
                    <Text style={[st.label, { color: a.destructive ? c.danger : c.textPrimary }]}>{a.label}</Text>
                    {a.on ? <Sym name="checkmark" size={16} color={c.accent} weight="semibold" /> : null}
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  // 280 只用一次：卡的寬度，要放得下一排九個色塊（9 × 26 ＋ 兩邊內距）
  card: { position: 'absolute', right: T.space.m, width: 280, borderRadius: T.shape.radiusCard, padding: T.space.m,
    transformOrigin: 'top right', ...T.shape.shadowSoft, elevation: 12 },
  cardLeft: { right: undefined, left: T.space.m, transformOrigin: 'top left' },
  // 一組一塊圓角底；組與組之間留 24（設定 app 的分組間距那一級）
  group: { borderRadius: T.shape.radiusCard, overflow: 'hidden' },
  groupGap: { marginTop: T.space.xl },
  head: { ...T.font.footnote, marginLeft: T.space.l, marginBottom: T.space.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: T.space.m, minHeight: T.shape.menuRow, paddingHorizontal: T.space.l },
  // 髮絲線從文字起算（左內距＋圖示欄＋間距），跟設定 app 一樣不切到圖示
  sep: { height: StyleSheet.hairlineWidth, marginLeft: T.space.l + T.space.xl + T.space.m },
  icon: { width: T.space.xl, alignItems: 'center' },
  label: { flex: 1, ...T.font.body },
});

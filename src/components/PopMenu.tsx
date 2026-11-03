// 選單：右上角 ⋯ 或長按打開，從錨點彈出一張奶油白卡片，後面整個畫面變暗，選單上的字才看得清楚。
// 2026-11-01 多米定 A1「全部自繪」：紙的 ⋯、行的長按、目錄的 ⋯、最近刪除的一則，整個 app 只有這一種選單（之前目錄與最近刪除走 iOS 原生動作表單，
// 收法、語意、色點都跟這張卡對不上）。皮換成目錄面板的語彙：卡片裡每一項是 page 底的藥丸、靠間距分組，沒有髮絲分隔線（2-6 接近律）；
// 左邊圖示、右邊文字，打勾的項目（on）右端一個 ✓。inline 的子選單攤開成一組；head 的組最上面印一行小字當標題（例如「排序」）。
// header：放在最上面的一塊（紙的 ⋯ 把九個色塊放這裡，目錄用同一排色塊篩選）。
// 2026-11-02 系統元件化（多米：外觀全換、互動保留）：卡片換成 iOS 長按選單的樣子——系統材質（液態玻璃／霧面）、寬 250、大圓角、
// 字在左、圖示在右、組與組之間一條粗縫；後面那層改成霧化＋一點點暗（iOS 的長按選單是把後面霧掉）。誰叫出它、怎麼收（點外面）都不變。
// 點一下才開的選單（紙的 ⋯）在 iOS 上已經換成真的系統選單（NativeMenu），這張卡只剩長按（一行、目錄的磚）和網頁預覽在用。
import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { T, useColors } from '../lib/tokens';
import type { Act } from './Acts';
import { Glass, useCanBlur } from './Glass';
import { Sym } from './Sym';

type Group = { head?: string; rows: Act[] };

// side、lifted（2026-11-02，目錄的長按照虛擬手機原型＝iOS 主畫面）：side 是卡片靠哪邊（預設右）；lifted 是畫在後面那層上面、卡片下面的東西
// （目錄把被長按的那塊磚浮起來放在原位，選單接在它正下方或正上方）
export function PopMenu({ acts, top, header, onClose, side = 'right', lifted }: {
  acts: Act[]; top: number; header?: ReactNode; onClose: () => void; side?: 'left' | 'right'; lifted?: ReactNode;
}) {
  const c = useColors();
  const blur = useCanBlur();
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
        style={StyleSheet.absoluteFill}>
        {blur && <BlurView style={StyleSheet.absoluteFill} intensity={T.shape.menuBlur} tint="default" pointerEvents="none" />}
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: blur ? c.menuVeil : c.scrim }]} onPress={onClose} accessibilityLabel="關閉選單" />
      </Animated.View>
      {lifted}
      <Animated.View entering={cardIn} exiting={cardOut} style={[st.at, side === 'left' && st.atLeft, { top, width: header ? T.shape.menuWide : T.shape.menuW }]}>
        <Glass style={st.card} material="thick">
          {header}
          {sections.map((g, gi) => (
            <View key={gi}>
              {(gi > 0 || !!header) && <View style={[st.gap, { backgroundColor: c.menuSep }]} />}
              {g.head ? <Text style={[st.head, { color: c.textSecondary }]}>{g.head}</Text> : null}
              {g.rows.map((a, i) => (
                <View key={a.label}>
                  {i > 0 && <View style={[st.sep, { backgroundColor: c.menuSep }]} />}
                  <Pressable onPress={() => pick(a)} accessibilityRole="menuitem"
                    accessibilityState={a.on == null ? undefined : { checked: a.on }}
                    style={({ pressed }) => [st.row, pressed && { backgroundColor: c.menuSep }]}>
                    {/* 打勾的項目：勾在最前面（iOS 選單的位置） */}
                    {a.on ? <Sym name="checkmark" size={15} color={c.textPrimary} weight="semibold" /> : null}
                    <Text style={[st.label, { color: a.destructive ? c.danger : c.textPrimary }]}>{a.label}</Text>
                    {a.icon ? <Sym name={a.icon} size={18} color={a.destructive ? c.danger : c.textPrimary} /> : null}
                  </Pressable>
                </View>
              ))}
            </View>
          ))}
        </Glass>
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  at: { position: 'absolute', right: T.space.m, width: T.shape.menuW, transformOrigin: 'top right' },
  atLeft: { right: undefined, left: T.space.m, transformOrigin: 'top left' },
  card: { borderRadius: T.shape.radiusLg },
  // 組與組之間：一條粗縫（iOS 選單的分組）；組裡項目之間：髮絲線
  gap: { height: T.shape.menuGap },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: T.space.l },
  head: { ...T.font.footnote, fontWeight: T.font.semibold, marginHorizontal: T.space.l, marginTop: T.space.s, marginBottom: T.space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: T.space.m, minHeight: T.shape.menuRow, paddingHorizontal: T.space.l },
  label: { flex: 1, ...T.font.body },
});

// 底部輸入框（多米 2026-11-01）：按右下 ＋ 或膠囊 ＋ 時從底下升起、貼在鍵盤上面，在裡面打字。
// Return＝送出一行（放到紙的最上面，框清空、鍵盤不收，可以連續記）；空的按 Return＝收起（跟空行按 Return 收鍵盤同一個意思）；
// ✓＝有字就送出、然後收起；失去焦點（點了別行、開選單、滑動、切 app）＝一樣有字就送出、然後收起。字不會丟（2-8）。
// 跟提案第三輪拿掉的「常駐輸入列」不同：按 ＋ 才出現，而且跟著字長高（最多 shape.composerLines 行，再多在框裡捲），不會「超過一行看不到前面」。
// 升降的位置（跟著鍵盤）由 Paper 包在外層；這裡只管卡片、輸入框、✓ 和進出動畫。減少動態：滑入滑出改淡入淡出。
// 顏色、字級、間距、動畫數字全部來自 src/lib/tokens.ts，這裡不寫裸數字。
import { useLayoutEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, type TextInputInstance } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { T, useColors } from '../lib/tokens';
import { Sym } from './Sym';

const LINE_H = T.font.bodyLine.lineHeight;
const MAX_H = LINE_H * T.shape.composerLines;

export function Composer({ calm, onChange, onSubmit, onDone, onBlur }: {
  calm: boolean;
  onChange: (t: string) => void;
  onSubmit: () => boolean; // 回傳有沒有真的送出一行（空的會直接收起，那就不用清空、重新對焦）
  onDone: () => void;
  onBlur: () => void;
}) {
  const c = useColors();
  const input = useRef<TextInputInstance | null>(null);
  // 框的高度跟著字：一行起跳，最多 composerLines 行。輸入框自己上下不留白（留白在卡片上），量到的內容高度就是幾行 × 行高
  const [h, setH] = useState(LINE_H);
  // 網頁預覽的送出會先失焦（blurOnSubmit），那段期間的失焦不算「收起」；iOS 的 submitBehavior='submit' 不會失焦，這個旗標只是空轉
  const sending = useRef(false);
  // 畫完立刻對焦（跟行的 focusItem 一樣）。網頁預覽：Reanimated 的進場動畫會先把元素藏一兩格（visibility hidden），
  // 藏著的輸入框對不了焦，所以沒對到就下一格再試（網頁開發版重畫慢的時候要等上幾十格，上限一秒）；iOS 的 autoFocus 會先對到，多試無害
  useLayoutEffect(() => {
    let tries = 0, raf = 0;
    const tryFocus = () => {
      const inp = input.current;
      if (!inp || inp.isFocused?.()) return;
      inp.focus();
      if (!inp.isFocused?.() && tries++ < 60) raf = requestAnimationFrame(tryFocus);
    };
    tryFocus();
    return () => cancelAnimationFrame(raf);
  }, []);
  const submit = () => {
    sending.current = true;
    if (onSubmit()) {
      input.current?.clear();
      setH(LINE_H);
      requestAnimationFrame(() => { input.current?.focus(); sending.current = false; });
    } else sending.current = false;
  };
  return (
    <Animated.View
      entering={calm ? FadeIn.duration(T.motion.fade) : SlideInDown.duration(T.motion.sheetSlide.in)}
      exiting={calm ? FadeOut.duration(T.motion.fade) : SlideOutDown.duration(T.motion.sheetSlide.out)}
      style={[s.card, { backgroundColor: c.surface }]}>
      <TextInput ref={input} autoFocus multiline submitBehavior="submit" enterKeyHint="next"
        {...(Platform.OS === 'web' ? { blurOnSubmit: true } : null)}
        placeholder="記一行" placeholderTextColor={c.textMuted}
        style={[s.input, { color: c.textPrimary, height: Math.min(MAX_H, Math.max(LINE_H, h)) }]}
        accessibilityLabel="輸入框"
        onChangeText={onChange}
        onContentSizeChange={e => setH(e.nativeEvent.contentSize.height)}
        onSubmitEditing={submit}
        onBlur={() => { if (!sending.current) onBlur(); }} />
      <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel="記下來，收起輸入框"
        style={({ pressed }) => [s.btn, pressed && { opacity: T.motion.pressDim }]}>
        <Sym name="checkmark" size={20} color={c.textPrimary} weight="semibold" />
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  // 跟鍵盤膠囊同一家：奶油白、圓角 16、軟陰影。✓ 貼在右端底部，字長高時它留在下面
  card: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: T.shape.radiusCard, paddingLeft: T.space.l, paddingRight: T.space.xs, paddingVertical: T.space.s, ...T.shape.shadowSoft },
  // 一行時連上下留白剛好 44 高，跟 ✓ 一樣高；留白用 margin 不用 padding，量到的內容高度才會剛好是行數 × 行高
  input: { flex: 1, minWidth: 0, ...T.font.bodyLine, paddingVertical: 0, paddingHorizontal: 0, textAlignVertical: 'top', marginVertical: (T.shape.hitMin - LINE_H) / 2 },
  btn: { width: T.shape.hitMin, height: T.shape.hitMin, alignItems: 'center', justifyContent: 'center' },
});

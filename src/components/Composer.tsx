// 輸入框（多米 2026-11-01）：按右下 ＋ 或膠囊 ＋ 時從底下升起、貼在鍵盤上面，在裡面打字；紙照常看得到、點得到。
// （同日第二版曾升到畫面正中，多米看了說體感很糟，第三版貼回鍵盤但留了暗幕；真機又說編輯感覺很不好，第四版＝乙：暗幕拿掉，
// 點紙上的行＝草稿先送出、焦點直接進那一行。進出跟鍵盤同一個時鐘、同一條曲線，一個東西只有一段動）
// Return＝送出一行（放到紙的最上面，框清空、鍵盤不收，可以連續記）；空的按 Return＝收起（跟空行按 Return 收鍵盤同一個意思）；
// ✓＝有字就送出、然後收起；失去焦點（點了別行、開選單、滑動、切 app）＝一樣有字就送出、然後收起。字不會丟（2-8）。
// 跟提案第三輪拿掉的「常駐輸入列」不同：按 ＋ 才出現，而且跟著字長高（最多 shape.composerLines 行，再多在框裡捲），不會「超過一行看不到前面」。
// 位置（貼鍵盤、跟著升降）由 Paper 包在外層；這裡只管卡片、輸入框、✓ 和進出動畫（時長與曲線＝鍵盤的 keyboardFollow）。減少動態：滑入滑出改淡入淡出。
// 顏色、字級、間距、動畫數字全部來自 src/lib/tokens.ts，這裡不寫裸數字。
import { useLayoutEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { T, useColors } from '../lib/tokens';
import { Sym } from './Sym';

const LINE_H = T.font.bodyLine.lineHeight;
const WEB = Platform.OS === 'web';
// 卡片上下內距＋輸入框上下留白：從 Paper 給的「框最高多少」扣掉，才是輸入框本身的上限
const CHROME = T.space.s * 2 + (T.shape.hitMin - LINE_H);
// 進出跟鍵盤同一個時鐘：鍵盤升起的時長與曲線（Paper 用同一組推 kbLift），框從畫面底邊滑上來跟鍵盤一起到位、收起時一起下去
const KB = T.motion.keyboardFollow;
const KB_EASE = Easing.bezier(KB.easing[0], KB.easing[1], KB.easing[2], KB.easing[3]);

export function Composer({ calm, maxH, onChange, onSubmit, onDone, onBlur }: {
  calm: boolean;
  maxH: number; // 整張卡最高多少（Paper 算：鍵盤頂到清單頂那段），再多在框裡捲
  onChange: (t: string) => void;
  onSubmit: () => boolean; // 回傳有沒有真的送出一行（空的會直接收起，那就不用清空、重新對焦）
  onDone: () => void;
  onBlur: () => void;
}) {
  const c = useColors();
  const input = useRef<TextInputInstance | null>(null);
  // 框的高度跟著字：一行起跳，最多 composerLines 行、再多在框裡捲。量高度的方法跟紙上每一行（Paper 的 Field）同一套：
  // 一個透明的鏡像 Text 撐高度、輸入框鋪滿在上面。之前自己聽 onContentSizeChange 再設 height，真機（Typeless 輸入法）打超過一行
  // 框沒長高、前面的字看不到（多米 2026-11-01）；網頁的 textarea 也不會自己長，鏡像兩邊都通
  const [txt, setTxt] = useState('');
  const maxInput = Math.max(LINE_H, maxH - CHROME);
  // 網頁預覽的送出會先失焦（blurOnSubmit），那段期間的失焦不算「收起」；iOS 的 submitBehavior='submit' 不會失焦，這個旗標只是空轉
  const sending = useRef(false);
  // 畫完立刻對焦（跟行的 focusItem 一樣）。網頁預覽：Reanimated 的進場動畫會先把元素藏一兩格（visibility hidden），
  // 藏著的輸入框對不了焦，所以沒對到就下一格再試（網頁開發版一格可能拖到幾十毫秒，上限 180 格約三秒）；iOS 的 autoFocus 會先對到，多試無害
  useLayoutEffect(() => {
    let tries = 0, raf = 0;
    const tryFocus = () => {
      const inp = input.current;
      if (!inp || inp.isFocused?.()) return;
      inp.focus();
      if (!inp.isFocused?.() && tries++ < 180) raf = requestAnimationFrame(tryFocus);
    };
    tryFocus();
    return () => cancelAnimationFrame(raf);
  }, []);
  const submit = () => {
    sending.current = true;
    if (onSubmit()) {
      input.current?.clear();
      setTxt('');
      requestAnimationFrame(() => { input.current?.focus(); sending.current = false; });
    } else sending.current = false;
  };
  return (
    <Animated.View
      entering={calm ? FadeIn.duration(T.motion.fade) : SlideInDown.duration(KB.duration).easing(KB_EASE)}
      exiting={calm ? FadeOut.duration(T.motion.fade) : SlideOutDown.duration(KB.duration).easing(KB_EASE)}
      style={[s.card, { backgroundColor: c.surface }]}>
      {/* 高度誰撐：iOS 交給輸入框自己長（多行 TextInput 不給高度就跟著內容長，跟紙上每一行同一套）；網頁的 textarea 不會自己長，
          才用隱形鏡像文字撐高、輸入框鋪滿。之前 iOS 也用鏡像撐，文字不在框的正中、滿行時多一行空白（多米 2026-11-01 真機） */}
      <View style={[s.grow, { maxHeight: maxInput }]}>
        {WEB && <Text style={[s.input, s.mirror]} accessible={false} importantForAccessibility="no-hide-descendants">{txt + '​'}</Text>}
        <TextInput ref={input} autoFocus multiline submitBehavior="submit" enterKeyHint="next"
          {...(Platform.OS === 'web' ? { blurOnSubmit: true } : null)}
          placeholder="記一行" placeholderTextColor={c.textMuted}
          style={[s.input, WEB ? s.fill : { maxHeight: maxInput }, { color: c.textPrimary }]}
          accessibilityLabel="輸入框"
          onChangeText={v => { setTxt(v); onChange(v); }}
          onSubmitEditing={submit}
          onBlur={() => { if (!sending.current) onBlur(); }} />
      </View>
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
  // grow：輸入框（iOS）或鏡像 Text（網頁）撐出來的高度，上限由 Paper 給（maxH），再多輸入框自己在裡面捲
  grow: { flex: 1, minWidth: 0, marginVertical: (T.shape.hitMin - LINE_H) / 2 },
  input: { ...T.font.bodyLine, minHeight: LINE_H, paddingVertical: 0, paddingHorizontal: 0, textAlignVertical: 'top' },
  // 鏡像：跟 Paper 的 Field 同一招，右邊比輸入框多留 1 點，字快滿一行時才不會先換行多出一行空白。5 只用一次
  mirror: { color: 'transparent', paddingRight: 5 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  btn: { width: T.shape.hitMin, height: T.shape.hitMin, alignItems: 'center', justifyContent: 'center' },
});

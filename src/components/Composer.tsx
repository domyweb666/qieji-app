// 輸入框（多米 2026-11-01）：按右下 ＋ 或膠囊 ＋ 時從底下升起、貼在鍵盤上面，在裡面打字；紙照常看得到、點得到。
// （同日第二版曾升到畫面正中，多米看了說體感很糟，第三版貼回鍵盤但留了暗幕；真機又說編輯感覺很不好，第四版＝乙：暗幕拿掉，
// 點紙上的行＝草稿先送出、焦點直接進那一行。進出跟鍵盤同一個時鐘、同一條曲線，一個東西只有一段動）
// Return＝送出一行（放到紙的最上面，框清空、鍵盤不收，可以連續記）；空的按 Return＝收起（跟空行按 Return 收鍵盤同一個意思）；
// ✓＝有字就送出、然後收起；失去焦點（點了別行、開選單、滑動、切 app）＝一樣有字就送出、然後收起。字不會丟（2-8）。
// 跟提案第三輪拿掉的「常駐輸入列」不同：按 ＋ 才出現，而且跟著字長高（長到清單頂，再多在框裡捲），不會「超過一行看不到前面」。
// 位置（貼鍵盤、跟著升降）由 Paper 包在外層；這裡只管卡片、輸入框、✓ 和進出動畫（時長與曲線＝鍵盤的 keyboardFollow）。減少動態：滑入滑出改淡入淡出。
// 顏色、字級、間距、動畫數字全部來自 src/lib/tokens.ts，這裡不寫裸數字。
import { useLayoutEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { T, useColors } from '../lib/tokens';
import { Sym } from './Sym';

const LINE_H = T.font.bodyLine.lineHeight;
const WEB = Platform.OS === 'web';
// 字：網頁照紙上每一行的 17／27。iOS 只給字級、不給行高，用字型自己的行距：給了 27 行高，iOS 的輸入框把字貼在每一行的底部、
// 跟鏡像 Text 的排法對不齊，一行時字不在框的正中（多米 2026-11-01 真機兩次回報）。輸入框跟紙上的行是兩種東西，行距不必一樣
const INPUT_FONT = WEB ? T.font.bodyLine : { fontSize: T.font.bodyLine.fontSize };
// 卡片上下內距：從 Paper 給的「框最高多少」扣掉，才是輸入框本身的上限
const CHROME = T.space.s * 2;
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
  // 框的高度跟著字：一行起跳，長到 Paper 給的 maxH、再多在框裡捲。誰撐高（多米 2026-11-01 真機三版）：
  // 一、自己聽 onContentSizeChange 設 height：Typeless 打超過一行不長；二、鏡像 Text 撐高、輸入框鋪滿：會長，但鏡像右邊多留 5 點，
  // 剛好滿行時多一行空白，加上 27 行高字不在正中；三、iOS 交給多行輸入框自己長：注音選字中（還沒按下去的字）換到第二行時框不長，
  // 第二行被切掉（原生量高度只算已經確定的字）。第四版回到鏡像撐高——onChangeText 連選字中的字都會給，鏡像才跟得上——
  // 但鏡像跟輸入框同寬、iOS 不給行高（見 INPUT_FONT），兩邊換行與行距一致
  const [txt, setTxt] = useState('');
  const [boxH, setBoxH] = useState(0);
  const maxInput = Math.max(LINE_H, maxH - CHROME);
  const atMax = boxH >= maxInput; // 長到頂了，輸入框才開捲動（沒到頂時不捲，多出半點行距也不會讓字往上跑）
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
      {/* grow 至少 44 高、把字那塊上下置中（一行時字跟 ✓ 在同一條中線）；box 由隱形鏡像文字撐高、最高 maxInput，輸入框鋪滿在上面 */}
      <View style={s.grow}>
        <View style={{ maxHeight: maxInput }} onLayout={e => setBoxH(e.nativeEvent.layout.height)}>
          <Text style={[s.input, s.mirror, WEB && s.mirrorWeb]} accessible={false} importantForAccessibility="no-hide-descendants">{txt + '​'}</Text>
          <TextInput ref={input} autoFocus multiline submitBehavior="submit" enterKeyHint="next" scrollEnabled={WEB || atMax}
          {...(Platform.OS === 'web' ? { blurOnSubmit: true } : null)}
          placeholder="記一行" placeholderTextColor={c.textMuted}
          style={[s.input, s.fill, { color: c.textPrimary }]}
          accessibilityLabel="輸入框"
          onChangeText={v => { setTxt(v); onChange(v); }}
          onSubmitEditing={submit}
          onBlur={() => { if (!sending.current) onBlur(); }} />
        </View>
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
  // grow：至少跟 ✓ 一樣高（44），字那塊在裡面上下置中；多行時一起長高，上限由 Paper 給（maxH），再多輸入框自己在裡面捲
  grow: { flex: 1, minWidth: 0, minHeight: T.shape.hitMin, justifyContent: 'center' },
  input: { ...INPUT_FONT, paddingVertical: 0, paddingHorizontal: 0, textAlignVertical: 'top' },
  // 鏡像：iOS 跟輸入框同寬（多留一點就會比輸入框早換行、多出一行空白）
  mirror: { color: 'transparent' },
  // 網頁的 textarea 換行比 Text 早一點，鏡像右邊多留才不會切掉最後一行（網頁驗過的值）。5 只用一次
  mirrorWeb: { paddingRight: 5 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  btn: { width: T.shape.hitMin, height: T.shape.hitMin, alignItems: 'center', justifyContent: 'center' },
});

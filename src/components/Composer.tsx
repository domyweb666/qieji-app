// 輸入框（多米 2026-11-01）：按右下 ＋ 或膠囊 ＋ 時從底下升起、貼在鍵盤上面，在裡面打字；紙照常看得到、點得到。
// （同日第二版曾升到畫面正中，多米看了說體感很糟，第三版貼回鍵盤但留了暗幕；真機又說編輯感覺很不好，第四版＝乙：暗幕拿掉，
// 點紙上的行＝草稿先送出、焦點直接進那一行。進出跟鍵盤同一個時鐘、同一條曲線，一個東西只有一段動）
// Return＝送出一行（放到紙的最上面，框清空、鍵盤不收，可以連續記）；空的按 Return＝收起（跟空行按 Return 收鍵盤同一個意思）；
// ✓＝有字就送出、然後收起；失去焦點（點了別行、開選單、滑動、切 app）＝一樣有字就送出、然後收起。字不會丟（2-8）。
// 跟提案第三輪拿掉的「常駐輸入列」不同：按 ＋ 才出現，而且跟著字長高（長到清單頂，再多在框裡捲），不會「超過一行看不到前面」。
// 位置（貼鍵盤、跟著升降）由 Paper 包在外層；這裡只管卡片、輸入框、✓ 和進出動畫（時長與曲線＝鍵盤的 keyboardFollow）。減少動態：滑入滑出改淡入淡出。
// 顏色、字級、間距、動畫數字全部來自 src/lib/tokens.ts，這裡不寫裸數字。
import { useLayoutEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance, type TextInputInstance } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { T, useColors } from '../lib/tokens';
import { Sym } from './Sym';

const LINE_H = T.font.bodyLine.lineHeight;
const WEB = Platform.OS === 'web';
// 字：網頁照紙上每一行的 17／27。iOS 只給字級、不給行高，用字型自己的行距：給了 27 行高，一行時字不在框的正中
// （多米 2026-11-01 真機兩次回報）。輸入框跟紙上的行是兩種東西，行距不必一樣
const INPUT_FONT = WEB ? T.font.bodyLine : { fontSize: T.font.bodyLine.fontSize };
// 卡片上下內距：從 Paper 給的「框最高多少」扣掉，才是輸入框本身的上限
const CHROME = T.space.s * 2;
// 進出跟鍵盤同一個時鐘：鍵盤升起的時長與曲線（Paper 用同一組推 kbLift），框從畫面底邊滑上來跟鍵盤一起到位、收起時一起下去
const KB = T.motion.keyboardFollow;
const KB_EASE = Easing.bezier(KB.easing[0], KB.easing[1], KB.easing[2], KB.easing[3]);
// 【暫時】輸入框高度量測（2026-11-01 第五批之後多米說「還是沒修好」）：開發版才印，印在電腦的 Metro 視窗，
// 看選字中的字、原生量到的內容高、輸入框與外層實際的高是在哪一步沒跟上。查完就整段拿掉
const probe = (what: string, v: unknown) => { if (__DEV__) console.log(`[輸入框] ${what}`, JSON.stringify(v)); };

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
  // 框的高度跟著字：一行起跳，長到 Paper 給的 maxH、再多在框裡捲。誰撐高（多米 2026-11-01 真機四版都不對）：
  // 一、自己聽 onContentSizeChange 設 height：Typeless 打超過一行不長；二、鏡像 Text 撐高、鏡像右邊多留 5 點：滿行時多一行空白；
  // 三、輸入框自己長但開著自己的捲動、還限高：選字到第二行框不長；四、鏡像撐高、鏡像跟輸入框同寬：鏡像一行塞得下的字輸入框塞不下，
  // 輸入框已經換行、框還是一行，打的字跑到看不見的第二行。
  // 第五版（iOS）：照抄紙上每一行（Paper 的 Field）——那是在多米手機上一直長得對的唯一一套：輸入框不開自己的捲動、不給高度，
  // 由它自己跟著字長（選字中的字也算，RN 每打一個注音就更新它量高度用的字），外面包一層限高的 ScrollView，超過才在那層捲。
  // 網頁的 textarea 不會自己長，仍由鏡像撐高、輸入框鋪滿
  const [txt, setTxt] = useState('');
  const txtRef = useRef(txt);
  txtRef.current = txt;
  const maxInput = Math.max(LINE_H, maxH - CHROME);
  // 外層捲到底：游標在最後面時，字長出新的一行就跟著捲到底（輸入框自己不捲了，看不見的那行要外層帶出來）
  const scroller = useRef<ScrollViewInstance | null>(null);
  const caretAtEnd = useRef(true);
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
  // 輸入框本身兩邊一樣，差在 iOS 不開它自己的捲動（交給外層）、網頁鋪滿在鏡像上面
  const field = (extra: typeof s.fill | null) => (
    <TextInput ref={input} autoFocus multiline submitBehavior="submit" enterKeyHint="next" scrollEnabled={WEB}
      {...(WEB ? { blurOnSubmit: true } : null)}
      placeholder="記一行" placeholderTextColor={c.textMuted}
      style={[s.input, extra, { color: c.textPrimary }]}
      accessibilityLabel="輸入框"
      onChangeText={v => { setTxt(v); onChange(v); probe('字', { 長度: v.length, 尾巴: v.slice(-6) }); }}
      onContentSizeChange={e => probe('原生內容高', Math.round(e.nativeEvent.contentSize.height))}
      onLayout={e => probe('輸入框高', Math.round(e.nativeEvent.layout.height))}
      onSelectionChange={e => { caretAtEnd.current = e.nativeEvent.selection.end >= txtRef.current.length; }}
      onSubmitEditing={submit}
      onBlur={() => { if (!sending.current) onBlur(); }} />
  );
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
      {/* grow 至少 44 高、把字那塊上下置中（一行時字跟 ✓ 在同一條中線）；字那塊最高 maxInput */}
      <View style={s.grow}>
        {WEB ? (
          <View style={{ maxHeight: maxInput }}>
            <Text style={[s.input, s.mirror]} accessible={false} importantForAccessibility="no-hide-descendants">{txt + '​'}</Text>
            {field(s.fill)}
          </View>
        ) : (
          <ScrollView ref={scroller} style={[s.scroll, { maxHeight: maxInput }]} keyboardShouldPersistTaps="always"
            onLayout={e => probe('外層高', { 高: Math.round(e.nativeEvent.layout.height), 上限: Math.round(maxInput) })}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => { if (caretAtEnd.current) scroller.current?.scrollToEnd({ animated: false }); }}>
            {field(null)}
          </ScrollView>
        )}
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
  // 鏡像（只有網頁）：textarea 換行比 Text 早一點，鏡像右邊多留才不會切掉最後一行（網頁驗過的值）。5 只用一次
  mirror: { color: 'transparent', paddingRight: 5 },
  // iOS 外層：不撐滿，跟著輸入框的高度，最高 maxInput
  scroll: { flexGrow: 0 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  btn: { width: T.shape.hitMin, height: T.shape.hitMin, alignItems: 'center', justifyContent: 'center' },
});

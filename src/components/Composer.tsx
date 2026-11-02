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
import { Glass } from './Glass';
import { Sym } from './Sym';

const LINE_H = T.font.bodyLine.lineHeight;
const WEB = Platform.OS === 'web';
// 字：網頁照紙上每一行的 17／27（網頁驗過）。iOS 用 composerLine（17／22）：行高貼著字型自己的行距，一行時字才在正中；
// 而且量高度的隱形文字和輸入框一定要同一個明寫的行高（第五版不給行高，真機量到隱形文字一行 23、輸入框一行 28）
const INPUT_FONT = WEB ? T.font.bodyLine : T.font.composerLine;
// 卡片上下內距：從 Paper 給的「框最高多少」扣掉，才是輸入框本身的上限
const CHROME = T.space.s * 2;
// 進出跟鍵盤同一個時鐘：鍵盤升起的時長與曲線（Paper 用同一組推 kbLift），框從畫面底邊滑上來跟鍵盤一起到位、收起時一起下去
const KB = T.motion.keyboardFollow;
const KB_EASE = Easing.bezier(KB.easing[0], KB.easing[1], KB.easing[2], KB.easing[3]);

export function Composer({ calm, maxH, initial = '', onChange, onSubmit, onDone, onBlur }: {
  calm: boolean;
  initial?: string; // 改一行（系統清單版點一行，2026-11-02）：框裡先放那行的字，Return＝改好收起
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
  // 五、照抄紙上每一行讓輸入框自己長：真機量測（開發版印在 Metro）一開始量一次高 23，之後打了 47 個字（含注音）一次都沒再量——
  // 在多米手機上輸入框根本不會自己長。
  // 第六版（多米 2026-11-01 真機確認「打字部分你搞定了」）：兩邊（iOS、網頁）都由隱形鏡像撐高（onChangeText 每打一個注音都會到，這一點真機量測確認了），輸入框鋪滿；
  // 鏡像與輸入框同字級、同明寫行高（INPUT_FONT），右邊多留一點點給游標；輸入框開著自己的捲動，萬一換行還是差一個字，
  // 游標所在那行也會被它自己捲出來，不會跑到看不見的地方
  const [txt, setTxt] = useState(initial);
  const fixing = initial !== '';
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
      >
      {/* 卡片是系統材質（2026-11-02 系統元件化：iOS 26 液態玻璃、舊 iOS 霧面、減少透明度照舊奶油白） */}
      <Glass style={s.card}>
      {/* grow 至少 44 高、把字那塊上下置中（一行時字跟 ✓ 在同一條中線）；字那塊由鏡像撐高、最高 maxInput，輸入框鋪滿在上面 */}
      <View style={s.grow}>
        <View style={{ maxHeight: maxInput }}>
          <Text style={[s.input, s.mirror]} accessible={false} importantForAccessibility="no-hide-descendants">{txt + '​'}</Text>
          <TextInput ref={input} autoFocus multiline submitBehavior="submit" enterKeyHint={fixing ? 'done' : 'next'}
            {...(WEB ? { blurOnSubmit: true } : null)} defaultValue={initial}
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
      </Glass>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  // 跟鍵盤膠囊同一家：奶油白、圓角 16、軟陰影。✓ 貼在右端底部，字長高時它留在下面
  card: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: T.shape.radiusMenu, paddingLeft: T.space.l, paddingRight: T.space.xs, paddingVertical: T.space.s },
  // grow：至少跟 ✓ 一樣高（44），字那塊在裡面上下置中；多行時一起長高，上限由 Paper 給（maxH），再多輸入框自己在裡面捲
  grow: { flex: 1, minWidth: 0, minHeight: T.shape.hitMin, justifyContent: 'center' },
  input: { ...INPUT_FONT, paddingVertical: 0, paddingHorizontal: 0, textAlignVertical: 'top' },
  // 鏡像：右邊比輸入框多留一點（網頁 textarea、iOS 游標都比 Text 早一點換行），鏡像才不會比輸入框晚換行、把打的字藏到看不見的下一行。
  // 寧可剛好滿行時多一行空白，不可少一行。5 只用一次（網頁驗過的值）
  mirror: { color: 'transparent', paddingRight: 5 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  btn: { width: T.shape.hitMin, height: T.shape.hitMin, alignItems: 'center', justifyContent: 'center' },
});

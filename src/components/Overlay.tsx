// 疊在所有畫面上面的一層：選單、確認框、toast。其他畫面用 ui.sheet() / ui.confirm() / ui.toast() 呼叫。
import { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Appearance, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, haptic, T, useColors } from '../lib/tokens';
import { Glass } from './Glass';

export type Row = { label: string; fn: () => void; danger?: boolean; dot?: string; on?: boolean };
type SheetSpec = { title?: string; rows: Row[] };
// title 有值＝只有一顆按鈕的提示框（存檔失敗這類要讀完的訊息），沒有「取消」
type ConfirmSpec = { title?: string; msg: string; ok: () => void; okLabel: string };
type ToastSpec = { msg: string; action?: { label: string; fn: () => void } };
export type PromptSpec = { title: string; msg: string; initial: string; okLabel: string; placeholder?: string; check: (v: string) => string | null; ok: (v: string) => void };

let host: {
  sheet: (s: SheetSpec | null) => void;
  confirm: (c: ConfirmSpec | null) => void;
  toast: (t: ToastSpec | null) => void;
  prompt: (p: PromptSpec | null) => void;
} | null = null;

export const ui = {
  // iOS 用系統的動作表單與確認框，其他平台（網頁預覽）用自己畫的
  // message：標題下面那行小字（例：釘滿兩張的「要換掉哪一張？」）；網頁預覽併在標題下一行
  sheet: (rows: Row[], title?: string, message?: string) => {
    if (Platform.OS !== 'ios') return host?.sheet({ rows, title: [title, message].filter(Boolean).join('\n') || undefined });
    const opts = [...rows.map(r => (r.on ? `✓ ${r.label}` : r.label)), '取消'];
    const destructiveButtonIndex = rows.map((r, i) => (r.danger ? i : -1)).filter(i => i >= 0);
    // 系統動作表單不在 React 樹裡，拿不到 hook，顏色照目前外觀算一次
    ActionSheetIOS.showActionSheetWithOptions(
      { title, message, options: opts, cancelButtonIndex: rows.length, destructiveButtonIndex, tintColor: colors(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light').accent },
      i => { if (i < rows.length) rows[i].fn(); },
    );
  },
  // 按鈕名動詞帶對象，預設「永久刪除」（詞彙表 #13）
  confirm: (msg: string, ok: () => void, okLabel = '永久刪除') => {
    if (Platform.OS !== 'ios') return host?.confirm({ msg, ok, okLabel });
    Alert.alert(msg, undefined, [{ text: '取消', style: 'cancel' }, { text: okLabel, style: 'destructive', onPress: ok }]);
  },
  // 要人讀完的訊息（會丟字的錯誤）：系統提示框、一顆按鈕，不像 toast 會自己消失（06-首次體驗 ❓7）
  alert: (title: string, msg: string, okLabel = '知道了', then?: () => void) => {
    if (Platform.OS !== 'ios') return host?.confirm({ title, msg, ok: then ?? (() => {}), okLabel });
    Alert.alert(title, msg, [{ text: okLabel, onPress: then }]);
  },
  // 兩個選項的提示框（iCloud 看起來換了帳號，S5）：iOS 用系統提示框；網頁不同步、用不到，只留一顆按鈕的保險版
  ask: (title: string, msg: string, yes: { label: string; fn: () => void }, noLabel: string, no?: () => void) => {
    if (Platform.OS !== 'ios') return host?.confirm({ title, msg, ok: yes.fn, okLabel: yes.label });
    Alert.alert(title, msg, [{ text: noLabel, style: 'cancel', onPress: no }, { text: yes.label, onPress: yes.fn }]);
  },
  toast: (msg: string, action?: ToastSpec['action']) => host?.toast({ msg, action }),
  // 打一小段字（改磚上的字）：自己畫的卡片，不用系統的輸入提示框（2026-11-04 多米：要像填密碼不達標那樣，就在這一頁提醒、不讓通過；系統提示框一按按鈕就關，留不住）
  prompt: (spec: PromptSpec) => host?.prompt(spec),
};

// 按「好」時 check 回傳要提醒的話就留在這一頁（紅字＋輸入框紅框＋晃一下＋震一下），字都還在；回傳 null 才收起來、交給 ok
function PromptCard({ spec, onClose }: { spec: PromptSpec; onClose: () => void }) {
  const c = useColors();
  const calm = useReducedMotion();
  const [err, setErr] = useState<string | null>(null);
  const val = useRef(spec.initial);
  // 卡片停在鍵盤上方那段的正中，跟著鍵盤一起動（鍵盤高度逐格來，跟輸入框 Composer 同一個來源）
  const kbH = useSharedValue(0), nudge = useSharedValue(0);
  useKeyboardHandler({
    onMove: e => { 'worklet'; kbH.value = e.height; },
    onInteractive: e => { 'worklet'; kbH.value = e.height; },
    onEnd: e => { 'worklet'; kbH.value = e.height; },
  }, []);
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -kbH.value / 2 }] }));
  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: nudge.value }] }));
  const leave = () => { Keyboard.dismiss(); onClose(); };
  const submit = () => {
    const bad = spec.check(val.current);
    if (bad) {
      setErr(bad);
      haptic('reject');
      if (!calm) {
        const { dist: d, step } = T.motion.reject, t = { duration: step };
        nudge.value = withSequence(withTiming(-d, t), withTiming(d, t), withTiming(-d / 2, t), withTiming(0, t));
      }
      return;
    }
    leave();
    spec.ok(val.current);
  };
  return (
    <Animated.View entering={FadeIn.duration(T.motion.fade)} exiting={FadeOut.duration(T.motion.fade)}
      style={[StyleSheet.absoluteFill, s.center, { backgroundColor: c.scrim }]} accessibilityViewIsModal>
      <Animated.View style={[s.promptWrap, lift]}>
        <Animated.View style={[s.dlg, { backgroundColor: c.surface }, shake]}>
          <Text style={[s.dlgText, { color: c.textPrimary }]}>{spec.title}</Text>
          <Text style={[s.dlgBody, { color: c.textSecondary }]}>{spec.msg}</Text>
          <TextInput autoFocus defaultValue={spec.initial} selectTextOnFocus submitBehavior="submit" returnKeyType="done"
            placeholder={spec.placeholder} placeholderTextColor={c.textMuted} accessibilityLabel={spec.title}
            style={[s.promptInput, { color: c.textPrimary, backgroundColor: c.searchFill, borderColor: err ? c.danger : 'transparent' }]}
            onChangeText={v => { val.current = v; if (err) setErr(spec.check(v)); }}
            onSubmitEditing={submit} />
          {/* 永遠佔一行高：紅字出現時卡片不會變高、不會跳 */}
          <Text style={[s.promptErr, { color: c.danger }]} accessibilityLiveRegion="polite">{err ?? ' '}</Text>
          <View style={[s.acts, { borderTopColor: c.separator }]}>
            <Pressable style={s.promptAct} hitSlop={T.space.s} onPress={leave} accessibilityRole="button">
              <Text style={[s.act, { color: c.accent }]}>取消</Text>
            </Pressable>
            <Pressable style={s.promptAct} hitSlop={T.space.s} onPress={submit} accessibilityRole="button">
              <Text style={[s.act, s.promptOk, { color: c.accent }]}>{spec.okLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

export function OverlayHost() {
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const [prompt, setPrompt] = useState<PromptSpec | null>(null);
  const insets = useSafeAreaInsets();
  const c = useColors();
  // 減少動態：滑入滑出改成淡入淡出（替換，不是關掉）
  const calm = useReducedMotion();
  // 提示條（2026-11-02 系統元件化）：系統材質的膠囊，字用一般的深字。UI 範本 v2：不透明版也跟其他浮層一樣是奶油白（以前是深底白字）
  const sheetIn = calm ? FadeIn.duration(T.motion.fade) : SlideInDown.duration(T.motion.sheetSlide.in);
  const sheetOut = calm ? FadeOut.duration(T.motion.fade) : SlideOutDown.duration(T.motion.sheetSlide.out);

  useEffect(() => {
    const mine: typeof host = {
      sheet: setSheet,
      confirm: setConfirm,
      toast: setToast,
      prompt: setPrompt,
    };
    host = mine;
    return () => { if (host === mine) host = null; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), T.timing.toastStay);
    return () => clearTimeout(t);
  }, [toast]);

  const closeSheet = () => setSheet(null);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {toast && (
        <Animated.View entering={FadeIn.duration(T.motion.fade)} exiting={FadeOut.duration(T.motion.fade)}
          style={[s.toastAt, { bottom: insets.bottom + 76 }]} accessibilityLiveRegion="polite">{/* 76 只用一次：toast 離底部的距離 */}
          <Glass style={s.toast}>
            <Text style={[s.toastText, { color: c.textPrimary }]}>{toast.msg}</Text>
            {toast.action && (
              <Pressable hitSlop={T.space.m} onPress={() => { toast.action!.fn(); setToast(null); }} accessibilityRole="button">
                <Text style={[s.toastBtn, { color: c.accent }]}>{toast.action.label}</Text>
              </Pressable>
            )}
          </Glass>
        </Animated.View>
      )}

      {sheet && (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View entering={FadeIn.duration(T.motion.sheetBackdrop.in)} exiting={FadeOut.duration(T.motion.sheetBackdrop.out)}
            style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
          </Animated.View>
          <Animated.View entering={sheetIn} exiting={sheetOut}
            style={[s.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + T.space.s }]}>
            <ScrollView bounces={false}>
              {sheet.title ? <Text style={[s.sheetTitle, { color: c.textSecondary }]}>{sheet.title}</Text> : null}
              {sheet.rows.map((r, i) => (
                <Pressable key={i} style={({ pressed }) => [s.opt, pressed && { backgroundColor: c.pressedFill }]}
                  onPress={() => { closeSheet(); r.fn(); }}>
                  {r.dot ? <View style={[s.dot, { backgroundColor: r.dot, borderColor: c.dotOutline }]} /> : null}
                  <Text style={[s.optText, { color: r.danger ? c.danger : c.accent }]}>{r.label}</Text>
                  {r.on ? <Text style={[s.on, { color: c.accent }]}>✓</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        </View>
      )}

      {confirm && (
        <Animated.View entering={FadeIn.duration(T.motion.fade)} exiting={FadeOut.duration(T.motion.fade)}
          style={[StyleSheet.absoluteFill, s.center, { backgroundColor: c.scrim }]}>
          <View style={[s.dlg, { backgroundColor: c.surface }]}>
            {confirm.title ? <Text style={[s.dlgText, { color: c.textPrimary }]}>{confirm.title}</Text> : null}
            <Text style={[confirm.title ? s.dlgBody : s.dlgText, { color: c.textPrimary }]}>{confirm.msg}</Text>
            <View style={[s.acts, { borderTopColor: c.separator }]}>
              {!confirm.title && (
                <Pressable hitSlop={T.space.s} onPress={() => setConfirm(null)}><Text style={[s.act, s.confirmAct, { color: c.accent }]}>取消</Text></Pressable>
              )}
              <Pressable hitSlop={T.space.s} onPress={() => { const ok = confirm.ok; setConfirm(null); ok(); }}>
                <Text style={[s.act, s.confirmAct, { color: confirm.title ? c.accent : c.danger }]}>{confirm.okLabel}</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}

      {prompt && <PromptCard spec={prompt} onClose={() => setPrompt(null)} />}
    </View>
  );
}

const SHEET_DOT = 14;
const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: T.space.xxl },
  sheet: { position: 'absolute', left: T.space.s, right: T.space.s, bottom: 0, maxHeight: '80%',
    borderRadius: T.shape.radiusLg, paddingTop: T.space.xs, marginBottom: T.space.s },
  sheetTitle: { marginTop: T.space.m, marginBottom: T.space.xs, ...T.font.footnote, textAlign: 'center' },
  opt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: T.space.m, paddingVertical: T.space.l, paddingHorizontal: T.space.l },
  optText: { ...T.font.body },
  dot: { width: SHEET_DOT, height: SHEET_DOT, borderRadius: T.shape.pill(SHEET_DOT), borderWidth: T.shape.borderCard },
  on: { ...T.font.headline },
  dlg: { borderRadius: T.shape.radiusLg, width: '100%', maxWidth: 300, paddingTop: T.space.l, overflow: 'hidden' }, // maxWidth 只用一次
  dlgText: { ...T.font.headline, textAlign: 'center', paddingHorizontal: T.space.l, marginBottom: T.space.l },
  dlgBody: { ...T.font.callout, textAlign: 'center', paddingHorizontal: T.space.l, marginBottom: T.space.l },
  acts: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  // 不放 flex：磚字卡片的字包在 Pressable 裡（直向），flex 會把字高壓成只剩上下留白、字被卡片切掉（2026-11-04 模擬器抓到）
  act: { ...T.font.body, paddingVertical: T.space.m, paddingHorizontal: T.space.xl, textAlign: 'center' },
  confirmAct: { flex: 1 },
  promptWrap: { width: '100%', alignItems: 'center' },
  promptInput: { ...T.font.body, minHeight: T.shape.hitMin, marginHorizontal: T.space.l, paddingHorizontal: T.space.m, textAlign: 'center',
    borderRadius: T.shape.radiusSm, borderWidth: T.shape.borderCard },
  promptErr: { ...T.font.footnote, textAlign: 'center', paddingHorizontal: T.space.l, marginTop: T.space.xs, marginBottom: T.space.s },
  promptAct: { flex: 1 },
  promptOk: { fontWeight: T.font.semibold },
  // 長的提示（例如存檔失敗）要能換行，不能超出螢幕
  toastAt: { position: 'absolute', alignSelf: 'center', maxWidth: '90%', zIndex: 50 }, // 50 只用一次
  toast: { paddingVertical: T.space.m, paddingHorizontal: T.space.l,
    borderRadius: T.shape.pill(T.shape.hitMin), flexDirection: 'row', gap: T.space.l, alignItems: 'center' },
  toastText: { ...T.font.callout, flexShrink: 1 },
  toastBtn: { ...T.font.callout, fontWeight: T.font.semibold },
});

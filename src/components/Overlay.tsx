// 疊在所有畫面上面的一層：選單、確認框、toast。其他畫面用 ui.sheet() / ui.confirm() / ui.toast() 呼叫。
import { useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, T, useColors } from '../lib/tokens';

export type Row = { label: string; fn: () => void; danger?: boolean; dot?: string; on?: boolean };
type SheetSpec = { title?: string; rows: Row[] };
// title 有值＝只有一顆按鈕的提示框（存檔失敗這類要讀完的訊息），沒有「取消」
type ConfirmSpec = { title?: string; msg: string; ok: () => void; okLabel: string };
type ToastSpec = { msg: string; action?: { label: string; fn: () => void } };

let host: {
  sheet: (s: SheetSpec | null) => void;
  confirm: (c: ConfirmSpec | null) => void;
  toast: (t: ToastSpec | null) => void;
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
      { title, message, options: opts, cancelButtonIndex: rows.length, destructiveButtonIndex, tintColor: colors('light').accent },
      i => { if (i < rows.length) rows[i].fn(); },
    );
  },
  // 按鈕名動詞帶對象，預設「永久刪除」（詞彙表 #13）
  confirm: (msg: string, ok: () => void, okLabel = '永久刪除') => {
    if (Platform.OS !== 'ios') return host?.confirm({ msg, ok, okLabel });
    Alert.alert(msg, undefined, [{ text: '取消', style: 'cancel' }, { text: okLabel, style: 'destructive', onPress: ok }]);
  },
  // 要人讀完的訊息（會丟字的錯誤）：系統提示框、一顆按鈕，不像 toast 會自己消失（06-首次體驗 ❓7）
  alert: (title: string, msg: string, okLabel = '知道了') => {
    if (Platform.OS !== 'ios') return host?.confirm({ title, msg, ok: () => {}, okLabel });
    Alert.alert(title, msg, [{ text: okLabel }]);
  },
  // 兩個選項的提示框（iCloud 看起來換了帳號，S5）：iOS 用系統提示框；網頁不同步、用不到，只留一顆按鈕的保險版
  ask: (title: string, msg: string, yes: { label: string; fn: () => void }, noLabel: string, no?: () => void) => {
    if (Platform.OS !== 'ios') return host?.confirm({ title, msg, ok: yes.fn, okLabel: yes.label });
    Alert.alert(title, msg, [{ text: noLabel, style: 'cancel', onPress: no }, { text: yes.label, onPress: yes.fn }]);
  },
  toast: (msg: string, action?: ToastSpec['action']) => host?.toast({ msg, action }),
};

export function OverlayHost() {
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const insets = useSafeAreaInsets();
  const c = useColors();
  // 減少動態：滑入滑出改成淡入淡出（替換，不是關掉）
  const calm = useReducedMotion();
  const sheetIn = calm ? FadeIn.duration(T.motion.fade) : SlideInDown.duration(T.motion.sheetSlide.in);
  const sheetOut = calm ? FadeOut.duration(T.motion.fade) : SlideOutDown.duration(T.motion.sheetSlide.out);

  useEffect(() => {
    const mine: typeof host = {
      sheet: setSheet,
      confirm: setConfirm,
      toast: setToast,
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
          style={[s.toast, { backgroundColor: c.toastBg, bottom: insets.bottom + 76 }]}>{/* 76 只用一次：toast 離底部的距離 */}
          <Text style={[s.toastText, { color: c.toastText }]}>{toast.msg}</Text>
          {toast.action && (
            <Pressable hitSlop={T.space.m} onPress={() => { toast.action!.fn(); setToast(null); }}>
              <Text style={[s.toastBtn, { color: c.toastAction }]}>{toast.action.label}</Text>
            </Pressable>
          )}
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
                <Pressable hitSlop={T.space.s} onPress={() => setConfirm(null)}><Text style={[s.act, { color: c.accent }]}>取消</Text></Pressable>
              )}
              <Pressable hitSlop={T.space.s} onPress={() => { const ok = confirm.ok; setConfirm(null); ok(); }}>
                <Text style={[s.act, { color: confirm.title ? c.accent : c.danger }]}>{confirm.okLabel}</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const SHEET_DOT = 14;
const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: T.space.xxl },
  sheet: { position: 'absolute', left: T.space.s, right: T.space.s, bottom: 0, maxHeight: '80%',
    borderRadius: T.shape.radiusCard, paddingTop: T.space.xs, marginBottom: T.space.s },
  sheetTitle: { marginTop: T.space.m, marginBottom: T.space.xs, ...T.font.footnote, textAlign: 'center' },
  opt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: T.space.m, paddingVertical: T.space.l, paddingHorizontal: T.space.l },
  optText: { ...T.font.sheetOption },
  dot: { width: SHEET_DOT, height: SHEET_DOT, borderRadius: T.shape.pill(SHEET_DOT), borderWidth: T.shape.borderCard },
  on: { ...T.font.emphasis },
  dlg: { borderRadius: T.shape.radiusCard, width: '100%', maxWidth: 300, paddingTop: T.space.l, overflow: 'hidden' }, // maxWidth 只用一次
  dlgText: { ...T.font.emphasis, textAlign: 'center', paddingHorizontal: T.space.l, marginBottom: T.space.l },
  dlgBody: { ...T.font.subhead, textAlign: 'center', paddingHorizontal: T.space.l, marginBottom: T.space.l },
  acts: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  act: { flex: 1, ...T.font.body, paddingVertical: T.space.m, paddingHorizontal: T.space.xl, textAlign: 'center' },
  // 長的提示（例如存檔失敗）要能換行，不能超出螢幕
  toast: { position: 'absolute', alignSelf: 'center', maxWidth: '90%', paddingVertical: T.space.m, paddingHorizontal: T.space.l,
    borderRadius: T.shape.pill(T.shape.hitMin), flexDirection: 'row', gap: T.space.l, alignItems: 'center', zIndex: 50 },
  toastText: { ...T.font.subhead, flexShrink: 1 },
  toastBtn: { ...T.font.subheadBold },
});

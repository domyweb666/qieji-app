// 疊在所有畫面上面的一層：選單、確認框、toast。其他畫面用 ui.sheet() / ui.confirm() / ui.toast() 呼叫。
import { useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../lib/theme';

export type Row = { label: string; fn: () => void; danger?: boolean; dot?: string; on?: boolean };
type SheetSpec = { title?: string; rows: Row[] };
type ToastSpec = { msg: string; action?: { label: string; fn: () => void } };

let host: {
  sheet: (s: SheetSpec | null) => void;
  confirm: (c: { msg: string; ok: () => void } | null) => void;
  toast: (t: ToastSpec | null) => void;
} | null = null;

export const ui = {
  // iOS 用系統的動作表單與確認框，其他平台（網頁預覽）用自己畫的
  sheet: (rows: Row[], title?: string) => {
    if (Platform.OS !== 'ios') return host?.sheet({ rows, title });
    const opts = [...rows.map(r => (r.on ? `✓ ${r.label}` : r.label)), '取消'];
    const destructiveButtonIndex = rows.map((r, i) => (r.danger ? i : -1)).filter(i => i >= 0);
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: opts, cancelButtonIndex: rows.length, destructiveButtonIndex, tintColor: C.tint as string },
      i => { if (i < rows.length) rows[i].fn(); },
    );
  },
  confirm: (msg: string, ok: () => void, okLabel = '刪除') => {
    if (Platform.OS !== 'ios') return host?.confirm({ msg, ok });
    Alert.alert(msg, undefined, [{ text: '取消', style: 'cancel' }, { text: okLabel, style: 'destructive', onPress: ok }]);
  },
  toast: (msg: string, action?: ToastSpec['action']) => host?.toast({ msg, action }),
};

export function OverlayHost() {
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const [confirm, setConfirm] = useState<{ msg: string; ok: () => void } | null>(null);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const insets = useSafeAreaInsets();

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
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const closeSheet = () => setSheet(null);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {toast && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}
          style={[s.toast, { bottom: insets.bottom + 76 }]}>
          <Text style={s.toastText}>{toast.msg}</Text>
          {toast.action && (
            <Pressable hitSlop={10} onPress={() => { toast.action!.fn(); setToast(null); }}>
              <Text style={s.toastBtn}>{toast.action.label}</Text>
            </Pressable>
          )}
        </Animated.View>
      )}

      {sheet && (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)} style={[StyleSheet.absoluteFill, s.backdrop]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
          </Animated.View>
          <Animated.View entering={SlideInDown.duration(220)} exiting={SlideOutDown.duration(180)}
            style={[s.sheet, { paddingBottom: insets.bottom + 8 }]}>
            <ScrollView bounces={false}>
              {sheet.title ? <Text style={s.sheetTitle}>{sheet.title}</Text> : null}
              {sheet.rows.map((r, i) => (
                <Pressable key={i} style={({ pressed }) => [s.opt, pressed && { backgroundColor: C.fill }]}
                  onPress={() => { closeSheet(); r.fn(); }}>
                  {r.dot ? <View style={[s.dot, { backgroundColor: r.dot }]} /> : null}
                  <Text style={[s.optText, r.danger && { color: C.red }]}>{r.label}</Text>
                  {r.on ? <Text style={s.on}>✓</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        </View>
      )}

      {confirm && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[StyleSheet.absoluteFill, s.backdrop, s.center]}>
          <View style={s.dlg}>
            <Text style={s.dlgText}>{confirm.msg}</Text>
            <View style={s.acts}>
              <Pressable hitSlop={8} onPress={() => setConfirm(null)}><Text style={s.act}>取消</Text></Pressable>
              <Pressable hitSlop={8} onPress={() => { const ok = confirm.ok; setConfirm(null); ok(); }}>
                <Text style={[s.act, { color: C.red }]}>刪除</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,.3)' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  sheet: { position: 'absolute', left: 8, right: 8, bottom: 0, maxHeight: '80%', backgroundColor: C.card,
    borderRadius: 14, paddingTop: 4, marginBottom: 8 },
  sheetTitle: { marginTop: 10, marginBottom: 4, fontSize: F.footnote, color: C.secondary, textAlign: 'center' },
  opt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 20 },
  optText: { fontSize: F.body + 3, color: C.tint },
  dot: { width: 14, height: 14, borderRadius: 7 },
  on: { color: C.tint, fontWeight: '600', fontSize: F.body },
  dlg: { backgroundColor: C.card, borderRadius: 14, width: '100%', maxWidth: 300, paddingTop: 20, overflow: 'hidden' },
  dlgText: { fontSize: F.headline, fontWeight: '600', color: C.label, textAlign: 'center', paddingHorizontal: 16, marginBottom: 18 },
  acts: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  act: { flex: 1, color: C.tint, fontSize: F.body, paddingVertical: 12, paddingHorizontal: 30, textAlign: 'center' },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(58,46,66,0.94)', paddingVertical: 11, paddingHorizontal: 18,
    borderRadius: 22, flexDirection: 'row', gap: 16, alignItems: 'center', zIndex: 50 },
  toastText: { color: '#fff', fontSize: F.subhead },
  toastBtn: { color: '#D7B8F3', fontWeight: '600', fontSize: F.subhead },
});

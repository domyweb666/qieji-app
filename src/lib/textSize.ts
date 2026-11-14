// 外觀自訂：紙上的字級（1.1 完整版功能，2026-11-14）。在系統字級上再乘一段：小／標準／大／特大。
// 只影響紙上的行和記事本的內文；標題、選單、設定照系統字級。記在手機上，不同步。
// 退款之後已經調好的字級留著，只是不能再改（鎖住只停功能）。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export const TEXT_SIZES = [
  { k: 0.88, label: '小' },
  { k: 1, label: '標準' },
  { k: 1.15, label: '大' },
  { k: 1.3, label: '特大' },
] as const;
const KEY = 'qieji.textSize.v1';
let k = 1;
const subs = new Set<() => void>();

export async function loadTextSize() {
  try {
    const v = Number(await AsyncStorage.getItem(KEY));
    if (TEXT_SIZES.some(s => s.k === v)) { k = v; subs.forEach(f => f()); }
  } catch { /* 讀不到就標準 */ }
}
export function setTextSize(v: number) {
  if (v === k || !TEXT_SIZES.some(s => s.k === v)) return;
  k = v;
  (v === 1 ? AsyncStorage.removeItem(KEY) : AsyncStorage.setItem(KEY, String(v))).catch(() => {});
  subs.forEach(f => f());
}
export const textSizeLabel = (v: number) => TEXT_SIZES.find(s => s.k === v)?.label ?? '標準';

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const get = () => k;
// 不是 hook 的版本：清單的每一行在畫的時候直接拿（字級變了那些行本來就會重畫，因為傳進去的 fs 跟著變）
export const textK = () => k;
export function useTextSize(): number { return useSyncExternalStore(subscribe, get, get); }

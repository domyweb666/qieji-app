// 外觀：跟隨系統／淺色／深色（多米 2026-11-14 定：照蔬菜家族共用規格加，免費；推翻 11-08、11-11「不加切換」）。
// 用系統的外觀覆寫（Appearance.setColorScheme）：整個 app 連系統提示框、選單一起換。小工具照舊跟系統走。
// 記在手機上；打開 app 時在紙畫出來之前先套（_layout 等這個），免得先閃一下另一種顏色。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

export type Look = 'system' | 'light' | 'dark';
export const LOOK_LABEL: Record<Look, string> = { system: '跟隨系統', light: '淺色', dark: '深色' };
const KEY = 'qieji.look.v1';
let look: Look = 'system';
const subs = new Set<() => void>();

function apply() {
  try { Appearance.setColorScheme(look === 'system' ? 'unspecified' : look); } catch (e) { console.warn('外觀沒套上：', e); }
}

export async function loadLook() {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') { look = v; apply(); subs.forEach(f => f()); }
  } catch { /* 讀不到就跟系統 */ }
}

export function setLook(v: Look) {
  if (v === look) return;
  look = v;
  apply();
  (v === 'system' ? AsyncStorage.removeItem(KEY) : AsyncStorage.setItem(KEY, v)).catch(() => {});
  subs.forEach(f => f());
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const get = () => look;
export function useLook(): Look {
  return useSyncExternalStore(subscribe, get, get);
}

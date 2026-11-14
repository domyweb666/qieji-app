// 「買了沒」接到會被鎖的功能（1.1 組塊 B，2026-11-14）。🔍 送審前要給會寫 iOS／React Native 的人看的檔之一。
// - iCloud 同步（B1）：買了、而且使用者沒在設定頁關掉，才准跑（cloud.setCloudAllowed）。不准時只是停，不刪任何東西
// - 小工具（B3）：沒買推鎖住的樣子，買了推紙（widget.setWidgetLocked）
// - 1.0 開過同步的人（B5）：更新後第一次打開跳一次提示框
// 控制中心「記一行」（B4）在 app/+native-intent.tsx 判斷。
// 判斷本身在 full.ts／iap.ts，這裡只照結果開關功能；出錯一律倒向「不准」。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { setCloudAllowed } from './cloud';
import { isFull, onFullChange, whenAsked, whenKnown } from './iap';
import { store } from './store';
import { pushWidget, setWidgetLocked } from './widget';

const SYNC_OFF_KEY = 'qieji.syncOff.v1';   // '1'＝使用者自己在設定頁把同步關掉（買了的人才關得了）
const NOTICE_KEY = 'qieji.fullNotice.v1';  // 1.0 使用者的提示框跳過了（存跳的時間；買了的人直接記 0，以後不用跳）

let syncOff = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

function apply() {
  const full = isFull();
  setCloudAllowed(full && !syncOff);
  setWidgetLocked(!full);
  if (store.loaded) pushWidget(store.s, store.last);
}

// 提示框跳的時間（沒跳過是 null）：評分提示要避開它之後的 14 天（lib/review.ts）
export async function noticeAt(): Promise<number | null> {
  try {
    const v = await AsyncStorage.getItem(NOTICE_KEY);
    const t = v === null ? NaN : Number(v);
    return Number.isFinite(t) && t > 0 ? t : null;
  } catch { return null; }
}

// B5：這台手機的紙有傳過 iCloud 的記號（sh）或傳過排列＝1.0 時開著同步。更新後第一次打開、確定沒買，跳一次
// 回傳有沒有跳：跳了的話，這次打開就不再跳「新功能」卡片（一次只跳一個框）
async function noticeOnce(show: () => void): Promise<boolean> {
  try {
    const full = await whenAsked();
    if ((await AsyncStorage.getItem(NOTICE_KEY)) !== null) return false;
    if (full) { await AsyncStorage.setItem(NOTICE_KEY, '0'); return false; }
    if (!store.loaded) return false; // 紙還沒讀完（很少見）：下次打開再看
    const synced = store.s.notes.some(n => !!n.sh) || store.s.orderSent !== undefined;
    if (!synced) return false; // 沒同步過的人（1.1 才裝的）不用講
    await AsyncStorage.setItem(NOTICE_KEY, String(Date.now()));
    show();
    return true;
  } catch (e) {
    console.warn('完整版提示框沒跳成：', e);
    return false;
  }
}

let started = false;
// 打開 app 時叫一次（_layout，在 startIap 之後）。show＝跳 B5 的提示框；after＝提示框那關過了之後（noticed＝這次有沒有跳）
export function startAccess(show: () => void, after?: (noticed: boolean) => void) {
  if (started) return;
  started = true;
  (async () => {
    try { syncOff = (await AsyncStorage.getItem(SYNC_OFF_KEY)) === '1'; } catch { syncOff = false; }
    await whenKnown();
    apply();
    emit();
    onFullChange(() => { apply(); emit(); });
    after?.(await noticeOnce(show));
  })();
}

// 設定頁的開關：買了的人自己開關同步。關掉只是停，iCloud 雲碟裡的檔案留著
export function setSyncOn(on: boolean) {
  syncOff = !on;
  (on ? AsyncStorage.removeItem(SYNC_OFF_KEY) : AsyncStorage.setItem(SYNC_OFF_KEY, '1')).catch(() => {});
  apply();
  emit();
  if (on) store.save(); // 重新打開：把關掉期間改的排進去傳（會先拉再傳）
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const get = () => !syncOff;
// 使用者要不要同步（不管買了沒）
export function useSyncOn(): boolean {
  return useSyncExternalStore(subscribe, get, get);
}

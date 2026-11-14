// 個別上鎖（1.1 完整版功能，2026-11-14）：上鎖的紙打開前要過 Face ID（沒有 Face ID 的手機用手機密碼）。
// 多米定：上鎖的紙不上傳 iCloud、只存在這支手機（model.pendingUploads 擋、上鎖那一刻把 iCloud 上那份拿掉）。
// 這是「在茄記裡擋著不給看」，不是加密：手機裡的存檔是一般文字。
// 這次打開 app 驗過的紙記在記憶體裡，切到背景就全部忘掉，回來要再驗一次。
// 開鎖不看買了沒：完整版退款之後，鎖著的紙照樣打得開（鎖住只停功能，不把人關在外面）；要「新上鎖」才需要完整版。
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

type LA = typeof import('expo-local-authentication');
let mod: LA | null | undefined;
function load(): LA | null {
  if (mod !== undefined) return mod;
  if (Platform.OS !== 'ios') return (mod = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 只有 iOS 才載；舊開發版沒有這個原生模組
    mod = require('expo-local-authentication') as LA;
  } catch (e) {
    console.warn('Face ID 模組載入失敗（要重新打包的開發版才有）：', e);
    mod = null;
  }
  return mod;
}

const open = new Set<string>(); // 這次驗過的紙
const subs = new Set<() => void>();
let version = 0;
const emit = () => { version++; subs.forEach(f => f()); };
AppState.addEventListener('change', s => { if (s !== 'active' && open.size) { open.clear(); emit(); } });

export const isOpen = (id: string) => open.has(id);
export function forget(id: string) { if (open.delete(id)) emit(); }

// 這支手機能不能上鎖：要有 Face ID／Touch ID 或手機密碼。沒有模組（網頁、舊開發版）一律不能
export async function canLock(): Promise<boolean> {
  const m = load();
  if (!m) return false;
  try { return (await m.getEnrolledLevelAsync()) !== m.SecurityLevel.NONE; } catch { return false; }
}

// 驗一次。回傳過了沒。why＝系統框上那句話
// 手機後來把密碼整個關掉（連手機本身都沒鎖）：驗不了，直接放行——不然那張紙永遠打不開
export async function unlock(id: string, why: string): Promise<boolean> {
  if (open.has(id)) return true;
  const m = load();
  if (!m) return false;
  try {
    if ((await m.getEnrolledLevelAsync()) !== m.SecurityLevel.NONE) {
      const r = await m.authenticateAsync({ promptMessage: why, cancelLabel: '取消' });
      if (!r.success) return false;
    }
  } catch (e) {
    console.warn('Face ID 沒驗成：', e);
    return false;
  }
  open.add(id);
  emit();
  return true;
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const get = () => version;
// 畫面用：驗過的紙變了就重畫
export function useLockVersion() { return useSyncExternalStore(subscribe, get, get); }

// 茄記完整版的購買（1.1 片 A1，2026-11-14）：問 Apple 買了沒、讀價格、買、恢復購買。規則在 full.ts，這裡只接原生模組（expo-iap，StoreKit 2）。
// 🔍 送審前要給會寫 iOS／React Native 的人看的檔：這個和 full.ts（.vibe/安全標準.md「授權」段）。
// - 「買了沒」只看 getAvailablePurchases({ onlyIncludeActiveItemsIOS: true })：原生那邊讀 Transaction.currentEntitlements，
//   只交出驗過簽章的交易，退款／撤銷的不在裡面；清單裡有驗不過的會整個丟錯（transaction-validation-failed）→ 當沒買
// - 手機上記的那個記號（KEY）只是快取：打開 app、回到前景、買完、恢復完都重問一次，以 Apple 為準
// - 不存憑證、不印交易內容、不連任何自己的伺服器；錯誤只印代碼
// - 沒有測試用的假解鎖：開發版也要用沙盒帳號真的買
// - 只有 iOS 的開發版／正式版有原生模組：網頁預覽、還沒重新打包的舊開發版載不到，當成「問不到」，其他功能照常
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { confirmed, failOf, FULL_ID, nextFull, owns, priceOf, type Check, type Fail } from './full';

type Iap = typeof import('expo-iap');
let mod: Iap | null | undefined;

const KEY = 'qieji.full.v1';   // '1'＝上次問 Apple 的結果是買了。不在紙的存檔（colornotes.v1）裡
const PRICE_LIMIT = 15_000;    // 讀價格最多等這麼久，超過就照實說讀不到

export type FullState = {
  full: boolean;          // 現在算不算買了
  price: string | null;   // App Store 傳回的在地價格；還沒讀到是 null
  priceErr: boolean;      // 這次讀價格失敗
  busy: boolean;          // 正在買或正在恢復：那兩列先不能再點
};
let snap: FullState = { full: false, price: null, priceErr: false, busy: false };
const subs = new Set<() => void>();
function set(patch: Partial<FullState>) {
  snap = { ...snap, ...patch };
  subs.forEach(f => f());
}

const code = (e: unknown) => (e as { code?: unknown } | null)?.code;

function load(): Iap | null {
  if (mod !== undefined) return mod;
  if (Platform.OS !== 'ios') return (mod = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 只有 iOS 才載；舊開發版沒有這個原生模組，載不到要接得住
    mod = require('expo-iap') as Iap;
  } catch (e) {
    console.warn('內購模組載入失敗（要重新打包的開發版才有）：', code(e) ?? String(e));
    mod = null;
  }
  return mod;
}

// 連上 App Store。已經連著的話原生那邊直接回 true，所以每次要用之前都叫一次
async function connect(): Promise<Iap> {
  const m = load();
  if (!m) throw new Error('沒有內購模組');
  await m.initConnection();
  return m;
}

async function ask(): Promise<Check> {
  try {
    const m = await connect();
    return { ok: true, list: await m.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true }) };
  } catch (e) {
    const unverified = failOf(e) === 'unverified';
    console.warn('問 App Store 買了沒失敗：', code(e) ?? 'unknown');
    return { ok: false, unverified };
  }
}

// 重問一次 Apple，照規則更新「買了沒」；問得到（或確定驗不過）才改手機上記的
async function refresh(): Promise<Check> {
  const check = await ask();
  const full = nextFull(snap.full, check);
  if (confirmed(check)) {
    // 記不進去沒關係：下次打開會再問一次 Apple
    (full ? AsyncStorage.setItem(KEY, '1') : AsyncStorage.removeItem(KEY)).catch(() => {});
  }
  if (full !== snap.full) set({ full });
  return check;
}

let started = false;
// 打開 app 時叫一次：先拿手機上次記的（沒網路也馬上知道），再問 Apple；之後每次回到前景重問
export function startIap() {
  if (started) return;
  started = true;
  (async () => {
    try {
      if ((await AsyncStorage.getItem(KEY)) === '1') set({ full: true });
    } catch (e) {
      console.warn('讀解鎖記號失敗：', code(e) ?? 'unknown');
    }
    const m = load();
    // 付款框以外進來的交易（等家長核准後才通過的、別台買的）也從這裡來；買好的交易要跟 Apple 說收到了，不然每次打開都會重送
    m?.purchaseUpdatedListener(p => {
      (async () => {
        if (owns([p])) {
          try { await m.finishTransaction({ purchase: p, isConsumable: false }); } catch (e) { console.warn('交易收尾失敗：', code(e) ?? 'unknown'); }
        }
        await refresh();
      })();
    });
    await refresh();
    AppState.addEventListener('change', s => { if (s === 'active') refresh(); });
  })();
}

let pricing = false;
// 讀價格（設定頁打開時、讀不到時點那列再試）。讀到過就留著；這次失敗又沒有舊的才標成讀不到
export async function loadPrice() {
  if (pricing) return;
  pricing = true;
  if (snap.priceErr) set({ priceErr: false });
  try {
    const m = await connect();
    const list = await new Promise<unknown>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('讀價格逾時')), PRICE_LIMIT);
      m.fetchProducts({ skus: [FULL_ID], type: 'in-app' }).then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
    const price = priceOf(list);
    if (price) set({ price, priceErr: false });
    else if (!snap.price) set({ priceErr: true });
  } catch (e) {
    console.warn('讀價格失敗：', code(e) ?? 'unknown');
    if (!snap.price) set({ priceErr: true });
  } finally {
    pricing = false;
  }
}

// 買：跳 Apple 的付款框。回 'ok'＝Apple 確認買了；'unconfirmed'＝付款框說成功，但重問 Apple 還看不到（很少見，請使用者按恢復購買）
export async function buyFull(): Promise<'ok' | 'busy' | 'unconfirmed' | Fail> {
  if (snap.busy) return 'busy';
  set({ busy: true });
  try {
    const m = await connect();
    await m.requestPurchase({ request: { apple: { sku: FULL_ID } }, type: 'in-app' });
  } catch (e) {
    const why = failOf(e);
    if (why !== 'cancel') console.warn('購買沒完成：', code(e) ?? 'unknown');
    set({ busy: false });
    return why;
  }
  await refresh();
  set({ busy: false });
  return snap.full ? 'ok' : 'unconfirmed';
}

// 恢復購買：請 Apple 重新同步這個帳號的購買（可能會要輸入 Apple 帳號密碼），再重問一次。'none'＝這個帳號沒買過
export async function restoreFull(): Promise<'ok' | 'none' | 'busy' | Fail> {
  if (snap.busy) return 'busy';
  set({ busy: true });
  try {
    const m = await connect();
    await m.restorePurchases();
  } catch (e) {
    const why = failOf(e);
    if (why !== 'cancel') console.warn('恢復購買沒完成：', code(e) ?? 'unknown');
    set({ busy: false });
    return why;
  }
  const check = await refresh();
  set({ busy: false });
  if (!check.ok) return check.unverified ? 'unverified' : 'offline';
  return snap.full ? 'ok' : 'none';
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const get = () => snap;
export function useFull(): FullState {
  return useSyncExternalStore(subscribe, get, get);
}

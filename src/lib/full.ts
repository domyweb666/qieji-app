// 「茄記完整版買了沒」的判斷規則（1.1 片 A1，2026-11-14）。純函式：不碰原生、不碰存檔，測試直接跑（tools/tests/a1-full.test.ts）。
// 規則照 .vibe/安全標準.md「授權：誰算買了」：
// 1. 只信 Apple 驗過的交易。原生那邊（StoreKit 2 的 currentEntitlements）只交出驗過簽章、沒被撤銷的；這裡再檢查一次欄位，格式不對一律當沒買
// 2. 問得到 Apple：照 Apple 說的，蓋掉手機上記的
// 3. Apple 交出驗不過簽章的交易：當沒買（寧可鎖住）
// 4. 問不到（沒網路、App Store 沒回應、沒有內購模組）：沿用手機上次記的；從來沒記過就是沒買
// 這裡只回「買了沒」，不刪、不改任何紙（鎖住只停功能）。

export const FULL_ID = 'org.domyweb.qieji.full';

// 問 Apple 的結果。list 是外面進來的東西，型別不保證，用之前要驗
export type Check = { ok: true; list: unknown } | { ok: false; unverified: boolean };

const rec = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' ? x as Record<string, unknown> : null);

// 這份交易清單裡有沒有一筆有效的「茄記完整版」：產品 ID 對、狀態是買好了、沒有撤銷日期（退款、家人共享被收回都會有）
export function owns(list: unknown): boolean {
  if (!Array.isArray(list)) return false;
  return list.some(x => {
    const p = rec(x);
    return !!p && p.productId === FULL_ID && p.purchaseState === 'purchased' && p.revocationDateIOS == null;
  });
}

// cached＝手機上次記的。回這次之後算不算買了
export function nextFull(cached: boolean, check: Check): boolean {
  if (check.ok) return owns(check.list);
  if (check.unverified) return false;
  return cached;
}

// 這次的結果要不要寫回手機：問到了、或確定驗不過才寫；問不到就不動上次記的
export function confirmed(check: Check): boolean {
  return check.ok || check.unverified;
}

// App Store 傳回的商品清單裡，茄記完整版的在地價格字串（例如「NT$150」）。找不到、格式不對回 null，畫面就照實說讀不到
export function priceOf(list: unknown): string | null {
  if (!Array.isArray(list)) return null;
  for (const x of list) {
    const p = rec(x);
    if (p && p.id === FULL_ID && typeof p.displayPrice === 'string' && p.displayPrice.trim()) return p.displayPrice.trim();
  }
  return null;
}

// 原生丟出來的錯誤代碼 → 畫面要分的幾種情況。認不得的一律當一般失敗
export type Fail = 'cancel' | 'pending' | 'unverified' | 'offline' | 'blocked' | 'fail';
export function failOf(e: unknown): Fail {
  const code = rec(e)?.code;
  if (code === 'user-cancelled') return 'cancel';
  if (code === 'deferred-payment' || code === 'pending') return 'pending';
  if (code === 'transaction-validation-failed' || code === 'purchase-verification-failed') return 'unverified';
  if (code === 'network-error' || code === 'service-timeout' || code === 'service-disconnected') return 'offline';
  if (code === 'iap-not-available' || code === 'billing-unavailable') return 'blocked';
  return 'fail';
}

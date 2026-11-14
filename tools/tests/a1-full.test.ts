// 1.1 片 A1「買了沒」的純函式測試：只信有效交易、問不到沿用上次、驗不過當沒買、價格不寫死
// @ts-expect-error node 直接跑 TS 檔要帶 .ts 副檔名（跑法：node tools/tests/a1-full.test.ts）
import { confirmed, failOf, FULL_ID, nextFull, owns, priceOf } from '../../src/lib/full.ts';

let fail = 0;
const eq = (name: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n   got ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`}`);
};

const bought = { productId: FULL_ID, purchaseState: 'purchased', revocationDateIOS: null };

// 交易清單算不算買了
eq('有一筆有效的完整版 → 買了', owns([bought]), true);
eq('家人共享來的（ownershipType 不同）也算', owns([{ ...bought, ownershipTypeIOS: 'FAMILY_SHARED' }]), true);
eq('空清單 → 沒買', owns([]), false);
eq('別的產品 → 沒買', owns([{ ...bought, productId: 'org.domyweb.qieji.other' }]), false);
eq('有撤銷日期（退款）→ 沒買', owns([{ ...bought, revocationDateIOS: 1763000000000 }]), false);
eq('還在等核准 → 沒買', owns([{ ...bought, purchaseState: 'pending' }]), false);
eq('狀態欄位不見 → 沒買', owns([{ productId: FULL_ID }]), false);
eq('不是清單（null）→ 沒買', owns(null), false);
eq('不是清單（字串）→ 沒買', owns('purchased'), false);
eq('清單裡混了壞東西，有效的那筆照算', owns([null, 3, 'x', bought]), true);
eq('清單裡只有壞東西 → 沒買', owns([null, 3, 'x', {}]), false);

// 問完 Apple 之後
eq('上次沒買，Apple 說買了 → 買了', nextFull(false, { ok: true, list: [bought] }), true);
eq('上次買了，Apple 說沒有（退款、記錄清掉）→ 鎖回來', nextFull(true, { ok: true, list: [] }), false);
eq('上次買了，問不到（飛航模式）→ 還是買了', nextFull(true, { ok: false, unverified: false }), true);
eq('從來沒記過，問不到 → 沒買', nextFull(false, { ok: false, unverified: false }), false);
eq('上次買了，Apple 交出驗不過的交易 → 當沒買', nextFull(true, { ok: false, unverified: true }), false);
eq('上次買了，Apple 回的不是清單 → 當沒買', nextFull(true, { ok: true, list: undefined }), false);

// 要不要改手機上記的
eq('問到了 → 寫回', confirmed({ ok: true, list: [] }), true);
eq('驗不過 → 寫回（鎖住）', confirmed({ ok: false, unverified: true }), true);
eq('問不到 → 不動上次記的', confirmed({ ok: false, unverified: false }), false);

// 價格
eq('拿 App Store 給的在地價格字串', priceOf([{ id: FULL_ID, displayPrice: 'NT$150' }]), 'NT$150');
eq('別國價格照樣原樣拿', priceOf([{ id: FULL_ID, displayPrice: '¥800' }]), '¥800');
eq('清單是空的 → 讀不到', priceOf([]), null);
eq('只有別的產品 → 讀不到', priceOf([{ id: 'x', displayPrice: 'NT$30' }]), null);
eq('價格是空字串 → 讀不到', priceOf([{ id: FULL_ID, displayPrice: '  ' }]), null);
eq('價格不是字串 → 讀不到', priceOf([{ id: FULL_ID, displayPrice: 150 }]), null);
eq('不是清單 → 讀不到', priceOf(undefined), null);

// 錯誤分類
eq('使用者取消', failOf({ code: 'user-cancelled' }), 'cancel');
eq('等家長核准', failOf({ code: 'deferred-payment' }), 'pending');
eq('驗不過簽章', failOf({ code: 'transaction-validation-failed' }), 'unverified');
eq('沒網路', failOf({ code: 'network-error' }), 'offline');
eq('螢幕使用時間擋購買', failOf({ code: 'iap-not-available' }), 'blocked');
eq('認不得的代碼 → 一般失敗', failOf({ code: 'whatever' }), 'fail');
eq('不是物件 → 一般失敗', failOf('boom'), 'fail');
eq('null → 一般失敗', failOf(null), 'fail');

console.log(fail ? `\n${fail} 條沒過` : '\n全過');
process.exit(fail ? 1 : 0);

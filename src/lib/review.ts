// 評分提示（1.1 片 C2，2026-11-14；規格 .uiux/功能增刪提案.md A7，多米 2026-11-08 定）。
// 劃掉一行之後、三個條件都到了，叫一次系統評分框（expo-store-review）。只用系統的框，不先問喜不喜歡、不拿東西換評分。
// 計數只記在這台手機（AsyncStorage），畫面上不顯示，不同步、不進紙的存檔。
// 上半是純規則（tools/tests/c2-review.test.ts 直接測），下半接手機。

export const REVIEW_DAYS = 7;        // 裝了這麼多天以上
export const REVIEW_OPEN_DAYS = 4;   // 在這麼多個不同的日子打開過
export const REVIEW_STRIKES = 10;    // 累計劃掉這麼多行以上
export const REVIEW_QUIET_DAYS = 14; // 看過「iCloud 同步改成完整版」提示框之後，這麼多天內不問
const DAY = 86_400_000;

export type ReviewStats = { first: number; days: string[]; strikes: number; asked: string | null };
export const emptyStats = (now: number): ReviewStats => ({ first: now, days: [], strikes: 0, asked: null });

// 手機裡存的那份讀回來：格式不對的欄位用安全的值（first 壞掉就當現在才裝，寧可晚問）
export function readStats(raw: string | null, now: number): ReviewStats {
  let o: Record<string, unknown> = {};
  try { const v: unknown = JSON.parse(raw ?? '{}'); if (v && typeof v === 'object') o = v as Record<string, unknown>; } catch { /* 壞了當沒記過 */ }
  const first = typeof o.first === 'number' && Number.isFinite(o.first) && o.first > 0 && o.first <= now ? o.first : now;
  const days = Array.isArray(o.days) ? [...new Set(o.days.filter((d): d is string => typeof d === 'string'))].slice(-REVIEW_OPEN_DAYS) : [];
  const strikes = typeof o.strikes === 'number' && Number.isFinite(o.strikes) && o.strikes > 0 ? Math.floor(o.strikes) : 0;
  const asked = typeof o.asked === 'string' ? o.asked : null;
  return { first, days, strikes, asked };
}

const p2 = (n: number) => String(n).padStart(2, '0');
// 手機當地的日期（跨午夜算新的一天）
export function dayOf(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

// 今天打開過：記一個日子（只留最近幾個，夠數就好）
export function markOpen(st: ReviewStats, now: number): boolean {
  const day = dayOf(now);
  if (st.days.includes(day)) return false;
  st.days = [...st.days, day].slice(-REVIEW_OPEN_DAYS);
  return true;
}

// 該不該現在問。version＝現在這版；noticeAt＝看過提示框的時間（沒看過是 null）
export function shouldAsk(st: ReviewStats, now: number, version: string, noticeAt: number | null): boolean {
  if (!version || st.asked === version) return false;                              // 這一版問過了
  if (now - st.first < REVIEW_DAYS * DAY) return false;
  if (st.days.length < REVIEW_OPEN_DAYS) return false;
  if (st.strikes < REVIEW_STRIKES) return false;
  if (noticeAt !== null && now - noticeAt < REVIEW_QUIET_DAYS * DAY) return false;  // 剛被告知同步要付費的人，先不問
  return true;
}

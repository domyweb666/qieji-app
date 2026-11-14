// 1.1 片 C2 評分提示的純函式測試：三個條件、每版一次、提示框後 14 天不問、壞資料
// @ts-expect-error node 直接跑 TS 檔要帶 .ts 副檔名（跑法：node tools/tests/c2-review.test.ts）
import { dayOf, emptyStats, markOpen, readStats, shouldAsk } from '../../src/lib/review.ts';

let fail = 0;
const eq = (name: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n   got ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`}`);
};

const DAY = 86_400_000;
const now = new Date(2026, 10, 30, 12, 0, 0).getTime();
const ready = () => ({ first: now - 8 * DAY, days: ['2026-11-22', '2026-11-25', '2026-11-28', '2026-11-30'], strikes: 10, asked: null as string | null });

eq('三個條件都到 → 問', shouldAsk(ready(), now, '1.1.0', null), true);
eq('裝不到 7 天 → 不問', shouldAsk({ ...ready(), first: now - 6 * DAY }, now, '1.1.0', null), false);
eq('剛好 7 天 → 問', shouldAsk({ ...ready(), first: now - 7 * DAY }, now, '1.1.0', null), true);
eq('只在 3 個日子打開過 → 不問', shouldAsk({ ...ready(), days: ['2026-11-25', '2026-11-28', '2026-11-30'] }, now, '1.1.0', null), false);
eq('只劃掉 9 行 → 不問', shouldAsk({ ...ready(), strikes: 9 }, now, '1.1.0', null), false);
eq('這一版問過 → 不問', shouldAsk({ ...ready(), asked: '1.1.0' }, now, '1.1.0', null), false);
eq('上一版問過、這版還沒 → 問', shouldAsk({ ...ready(), asked: '1.0.0' }, now, '1.1.0', null), true);
eq('看過提示框 13 天 → 不問', shouldAsk(ready(), now, '1.1.0', now - 13 * DAY), false);
eq('看過提示框 14 天 → 問', shouldAsk(ready(), now, '1.1.0', now - 14 * DAY), true);
eq('版本讀不到 → 不問', shouldAsk(ready(), now, '', null), false);

// 記打開的日子
const st = emptyStats(now);
eq('第一次打開記一個日子', [markOpen(st, now), st.days], [true, ['2026-11-30']]);
eq('同一天再打開不重複記', [markOpen(st, now + 3600_000), st.days.length], [false, 1]);
eq('隔天記第二個', [markOpen(st, now + DAY), st.days.length], [true, 2]);
eq('日期用手機當地時間', dayOf(new Date(2026, 0, 5, 23, 59).getTime()), '2026-01-05');

// 手機裡存的那份讀回來
eq('沒記過 → 從現在起算', readStats(null, now), { first: now, days: [], strikes: 0, asked: null });
eq('壞掉的 JSON → 從現在起算', readStats('{oops', now), { first: now, days: [], strikes: 0, asked: null });
eq('正常的照讀', readStats(JSON.stringify(ready()), now), ready());
eq('first 在未來（時鐘被調過）→ 當現在才裝', readStats(JSON.stringify({ ...ready(), first: now + DAY }), now).first, now);
eq('strikes 是負的或不是數字 → 0', [readStats('{"strikes":-5}', now).strikes, readStats('{"strikes":"many"}', now).strikes], [0, 0]);
eq('days 混了壞東西、重複的 → 只留字串、不重複', readStats('{"days":["2026-11-01",3,null,"2026-11-01","2026-11-02"]}', now).days, ['2026-11-01', '2026-11-02']);

console.log(fail ? `\n${fail} 條沒過` : '\n全過');
process.exit(fail ? 1 : 0);

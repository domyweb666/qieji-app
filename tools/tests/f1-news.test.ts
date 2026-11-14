// 1.1 片 F1 新功能卡片的規則測試
// @ts-expect-error node 直接跑 TS 檔要帶 .ts 副檔名（跑法：node tools/tests/f1-news.test.ts）
import { NEWS, newsToShow } from '../../src/lib/news.ts';

let fail = 0;
const eq = (name: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n   got ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`}`);
};
const v = (n: { version: string } | null) => n?.version ?? null;

eq('剛裝好第一次打開 → 不跳', v(newsToShow(null, '1.1.0', true)), null);
eq('1.0 的人更新上來（沒記過）→ 跳 1.1.0', v(newsToShow(null, '1.1.0', false)), '1.1.0');
eq('看過 1.1.0 → 不跳', v(newsToShow('1.1.0', '1.1.0', false)), null);
eq('小修正 1.1.0 → 1.1.1 → 不跳', v(newsToShow('1.1.0', '1.1.1', false)), null);
eq('這一版沒有寫新功能 → 不跳', v(newsToShow('1.1.0', '9.9.0', false)), null);
eq('版本讀不到 → 不跳', v(newsToShow(null, '', false)), null);
eq('每一版最多三點', NEWS.every((n: { points: string[] }) => n.points.length >= 1 && n.points.length <= 3), true);

console.log(fail ? `\n${fail} 條沒過` : '\n全過');
process.exit(fail ? 1 : 0);

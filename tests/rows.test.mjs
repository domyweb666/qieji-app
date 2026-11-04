// 手感引擎的位置表（2026-11-04）：每一行站哪裡全靠這些算，算錯就是行疊在一起、點錯行、放手跳位置
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeo, countBelow, estimateLines, hitRow, landOffset, maps, midsOf, movedGeo, sameGeo, sameIds, windowOf } from '../src/lib/rows.ts';

const items = (...hs) => hs.map((h, i) => ({ id: `r${i}`, t: String(h), done: false }));
const geo = (...hs) => buildGeo(items(...hs), it => Number(it.t));

test('位置表：一行接一行往下排，總高是全部加起來', () => {
  const g = geo(53, 79, 53);
  assert.deepEqual(g.ys, [0, 53, 132]);
  assert.deepEqual(g.hs, [53, 79, 53]);
  assert.equal(g.total, 185);
  assert.equal(g.at.get('r1'), 1);
});

test('空的紙：總高 0，碰哪裡都不是一行，窗口是空的', () => {
  const g = geo();
  assert.equal(g.total, 0);
  assert.equal(hitRow(g.ys, g.hs, 10), -1);
  const w = windowOf(g.ys, g.hs, 0, 800);
  assert.ok(w.b < w.a);
});

test('手指碰到第幾行：邊界算下面那行，超過最後一行是 -1', () => {
  const g = geo(53, 79, 53);
  assert.equal(hitRow(g.ys, g.hs, 0), 0);
  assert.equal(hitRow(g.ys, g.hs, 52.9), 0);
  assert.equal(hitRow(g.ys, g.hs, 53), 1);
  assert.equal(hitRow(g.ys, g.hs, 131.9), 1);
  assert.equal(hitRow(g.ys, g.hs, 184.9), 2);
  assert.equal(hitRow(g.ys, g.hs, 185), -1);
  assert.equal(hitRow(g.ys, g.hs, -1), -1);
});

test('窗口：只掛碰到這段的行，一千行也只掛附近幾十行', () => {
  const g = geo(...new Array(1000).fill(53));
  const w = windowOf(g.ys, g.hs, 53 * 500, 53 * 510);
  assert.ok(w.a <= 500 && w.a >= 499);
  assert.ok(w.b >= 510 && w.b <= 511);
  const top = windowOf(g.ys, g.hs, -700, 700);
  assert.equal(top.a, 0);
  assert.equal(top.b, Math.floor(700 / 53));
  const end = windowOf(g.ys, g.hs, 53 * 995, 53 * 2000);
  assert.equal(end.b, 999);
});

test('拖到第幾個位置：跟一行一行數的舊算法結果一樣', () => {
  const g = geo(53, 79, 53, 131, 53, 53);
  const mids = midsOf(g.ys, g.hs);
  const old = (from, y) => { let to = 0; for (let k = 0; k < mids.length; k++) if (k !== from && mids[k] < y) to++; return to; };
  for (let from = 0; from < mids.length; from++) {
    for (let y = -50; y < g.total + 50; y += 7) {
      const to = countBelow(mids, y) - (mids[from] < y ? 1 : 0);
      assert.equal(to, old(from, y), `from ${from} y ${y}`);
    }
  }
});

test('放手：滑到的位置就是重排之後自己的位置，放下那一格不會跳', () => {
  const g = geo(53, 79, 53, 131, 53);
  for (let from = 0; from < 5; from++) {
    for (let to = 0; to < 5; to++) {
      const m = movedGeo(g.ids, g.hs, g.done, from, to);
      const newAt = m.ids.indexOf(g.ids[from]);
      assert.equal(g.ys[from] + landOffset(g.ys, g.hs, from, to), m.ys[newAt], `${from}→${to}`);
    }
  }
});

test('放手：別的行讓位之後的位置，也等於重排之後的位置', () => {
  const g = geo(53, 79, 53, 131, 53);
  const h = g.hs;
  for (let from = 0; from < 5; from++) {
    for (let to = 0; to < 5; to++) {
      const m = movedGeo(g.ids, g.hs, g.done, from, to);
      for (let i = 0; i < 5; i++) {
        if (i === from) continue;
        const give = from < to && i > from && i <= to ? -h[from] : from > to && i < from && i >= to ? h[from] : 0;
        assert.equal(g.ys[i] + give, m.ys[m.ids.indexOf(g.ids[i])], `${from}→${to} 第 ${i} 行`);
      }
    }
  }
});

test('放手之後的順序、高度、劃掉都跟著走，原本的表不被改到', () => {
  const its = items(53, 79, 131);
  its[0].done = true;
  const g = buildGeo(its, it => Number(it.t));
  const m = movedGeo(g.ids, g.hs, g.done, 0, 2);
  assert.deepEqual(m.ids, ['r1', 'r2', 'r0']);
  assert.deepEqual(m.hs, [79, 131, 53]);
  assert.deepEqual(m.done, [false, false, true]);
  assert.deepEqual(m.ys, [0, 79, 210]);
  assert.deepEqual(g.ids, ['r0', 'r1', 'r2']);
});

test('查表：每個 id 站哪裡、排第幾', () => {
  const { pos, idx } = maps(['a', 'b'], [0, 53]);
  assert.deepEqual(pos, { a: 0, b: 53 });
  assert.deepEqual(idx, { a: 0, b: 1 });
});

test('比較：一樣就不用再交給 UI 執行緒；順序換了算結構變了', () => {
  const a = geo(53, 79), b = geo(53, 79), c = geo(53, 80);
  assert.ok(sameGeo(a, b));
  assert.ok(!sameGeo(a, c));
  assert.ok(sameIds(a.ids, c.ids));
  assert.ok(!sameIds(['a', 'b'], ['b', 'a']));
  assert.ok(!sameIds(['a'], ['a', 'b']));
});

test('估行數：中文照字數換行、分段算好幾行、英文整個字換行', () => {
  assert.equal(estimateLines('', 320, 17), 1);
  assert.equal(estimateLines('記一行', 320, 17), 1);
  assert.equal(estimateLines('一'.repeat(18), 320, 17), 1);
  assert.equal(estimateLines('一'.repeat(19), 320, 17), 2);
  assert.equal(estimateLines('一'.repeat(40), 320, 17), 3);
  assert.equal(estimateLines('第一段\n第二段\n\n第四段', 320, 17), 4);
  assert.equal(estimateLines('hello world', 320, 17), 1);
  assert.equal(estimateLines('word '.repeat(30).trim(), 320, 17), 5); // 一個字約 43 點寬，一行七個字
  assert.equal(estimateLines('測試第 1 行，這行寫長一點，看換行之後高度對不對、捲過去會不會跳', 320, 17), 2);
});

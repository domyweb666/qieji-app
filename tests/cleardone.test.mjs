// 「清掉劃掉的行」進最近刪除（F1，2026-11-04）：跟刪單行同一套，沒按到復原也找得回來；復原只放回還在最近刪除裡的
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binDone, binItem, unbinDone, unbinItem } from '../src/lib/model.ts';

const it = (id, done = false) => ({ id, t: id, done, b: true });
const paper = (items) => ({ id: 'p', type: 'check', title: '', body: '', items, bin: [], color: 'yellow', pinned: false, deleted: false, created: 1, updated: 1, b: true });
const ids = (a) => a.map(i => i.id);
// 照紙上的 ⋯「清掉劃掉的行」：記下清之前的樣子和清掉了哪幾行
function clear(n, now = 10) {
  const before = n.items.slice();
  const gone = new Set(binDone(n, now).map(i => i.id));
  return { before, gone };
}

test('清掉：劃掉的行進最近刪除，照紙上的先後排在最前面，時間記清掉那一刻', () => {
  const n = paper([it('a'), it('x1', true), it('b'), it('x2', true)]);
  n.bin.push({ ...it('old'), at: 3 });
  const { gone } = clear(n, 10);
  assert.deepEqual(ids(n.items), ['a', 'b']);
  assert.deepEqual(ids(n.bin), ['x1', 'x2', 'old']);
  assert.deepEqual(n.bin.map(i => i.at), [10, 10, 3]);
  assert.deepEqual([...gone], ['x1', 'x2']);
});

test('沒有劃掉的行：什麼都不動', () => {
  const n = paper([it('a'), it('b')]);
  assert.deepEqual(binDone(n, 10), []);
  assert.deepEqual(ids(n.items), ['a', 'b']);
  assert.deepEqual(n.bin, []);
});

test('清完馬上復原：回到原本的位置，最近刪除裡不留一份、時間拿掉', () => {
  const n = paper([it('a'), it('x1', true), it('b'), it('x2', true), it('c')]);
  const { before, gone } = clear(n);
  assert.equal(unbinDone(n, before, gone), 2);
  assert.deepEqual(ids(n.items), ['a', 'x1', 'b', 'x2', 'c']);
  assert.deepEqual(n.bin, []);
  assert.ok(n.items.every(i => i.at === undefined));
});

test('清完記了新的一行再復原：新的那行還在', () => {
  const n = paper([it('x0', true), it('a'), it('x1', true), it('b')]);
  const { before, gone } = clear(n);
  n.items.unshift(it('new')); // 右下 ＋ 記的一行在最上面
  unbinDone(n, before, gone);
  assert.deepEqual(ids(n.items), ['x0', 'new', 'a', 'x1', 'b']);
});

test('這幾秒內在最近刪除還原過一行、永久刪掉一行：復原只放回還在最近刪除的，不會一行兩份', () => {
  const n = paper([it('a'), it('x1', true), it('x2', true), it('x3', true)]);
  const { before, gone } = clear(n);
  unbinItem(n, 'x1');                       // 最近刪除 →「還原到那張」：放最上面
  n.bin = n.bin.filter(i => i.id !== 'x2'); // 最近刪除 →「永久刪除」
  assert.equal(unbinDone(n, before, gone), 1);
  assert.deepEqual(ids(n.items), ['x1', 'x3', 'a']); // x3 接在原本排在它前面、現在還在紙上的那行後面（putBack）
  assert.deepEqual(n.bin, []);
});

test('之前刪的單行不受影響：復原不會把它一起拿回來', () => {
  const n = paper([it('a'), it('d'), it('x', true)]);
  binItem(n, 'd', 5);
  const { before, gone } = clear(n);
  unbinDone(n, before, gone);
  assert.deepEqual(ids(n.items), ['a', 'x']);
  assert.deepEqual(ids(n.bin), ['d']);
});

test('按兩次復原：不會再多放一份', () => {
  const n = paper([it('a'), it('x', true)]);
  const { before, gone } = clear(n);
  assert.equal(unbinDone(n, before, gone), 1);
  assert.equal(unbinDone(n, before, gone), 0);
  assert.deepEqual(ids(n.items), ['a', 'x']);
});

test('這幾秒內 iCloud 合併換過物件：放回去的是最近刪除裡那一份', () => {
  const n = paper([it('a'), it('x', true)]);
  const { before, gone } = clear(n);
  n.bin = n.bin.map(i => ({ ...i, t: 'x（別台改過）' }));
  unbinDone(n, before, gone);
  assert.deepEqual(n.items.map(i => i.t), ['a', 'x（別台改過）']);
  assert.equal(n.items[1].at, undefined);
});

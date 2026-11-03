// 「清掉劃掉的行」的復原（2026-11-04 程式審查修）：只放回清掉的那幾行，這段時間新記的、刪的、搬走的都照留。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binItem, moveItem, putBack } from '../src/lib/model.ts';

const it = (id, done = false) => ({ id, t: id, done, b: true });
const paper = (items) => ({ id: 'p', type: 'check', title: '', body: '', items, bin: [], color: 'yellow', pinned: false, deleted: false, created: 1, updated: 1, b: true });
const ids = (n) => n.items.map(i => i.id);
// 照紙上的「清掉劃掉的行」：記下清之前的樣子和清掉了哪幾行
function clear(n) {
  const before = n.items.slice();
  const gone = new Set(before.filter(i => i.done).map(i => i.id));
  n.items = before.filter(i => !i.done);
  return { before, gone };
}

test('清完馬上復原：每一行回到原本的位置', () => {
  const n = paper([it('a'), it('x1', true), it('b'), it('x2', true), it('x3', true), it('c')]);
  const { before, gone } = clear(n);
  assert.deepEqual(ids(n), ['a', 'b', 'c']);
  assert.equal(putBack(n, before, gone), 3);
  assert.deepEqual(ids(n), ['a', 'x1', 'b', 'x2', 'x3', 'c']);
});

test('清完之後記了新的一行再復原：新的那行還在，清掉的接回原本前面那行後面', () => {
  const n = paper([it('x0', true), it('a'), it('x1', true), it('b')]);
  const { before, gone } = clear(n);
  n.items.unshift(it('new')); // 右下 ＋ 記的一行在最上面
  putBack(n, before, gone);
  assert.deepEqual(ids(n), ['x0', 'new', 'a', 'x1', 'b']);
});

test('清完之後刪了一行、搬走一行再復原：那兩行不會跑回來（不會一行兩份）', () => {
  const n = paper([it('a'), it('x', true), it('b'), it('c')]);
  const other = paper([]);
  const { before, gone } = clear(n);
  binItem(n, 'b', 5);          // 往左滑刪掉
  moveItem(n, other, 'c');     // 搬到別張
  putBack(n, before, gone);
  assert.deepEqual(ids(n), ['a', 'x']);
  assert.deepEqual(n.bin.map(i => i.id), ['b']);
  assert.deepEqual(ids(other), ['c']);
});

test('前面那行也不在了：往前找還在的那行接在後面；都不在就放最上面', () => {
  const n = paper([it('a'), it('b'), it('x', true), it('c')]);
  const { before, gone } = clear(n);
  binItem(n, 'b', 5);
  putBack(n, before, gone);
  assert.deepEqual(ids(n), ['a', 'x', 'c']);
  const m = paper([it('a'), it('x', true)]);
  const r = clear(m);
  binItem(m, 'a', 5);
  putBack(m, r.before, r.gone);
  assert.deepEqual(ids(m), ['x']);
});

test('已經放回去過（按了兩次復原）：不會再多放一份', () => {
  const n = paper([it('a'), it('x', true)]);
  const { before, gone } = clear(n);
  assert.equal(putBack(n, before, gone), 1);
  assert.equal(putBack(n, before, gone), 0);
  assert.deepEqual(ids(n), ['a', 'x']);
});

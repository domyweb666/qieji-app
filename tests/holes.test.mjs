// 目錄自由擺放（2026-11-03，多米：「清單定死位置，沒法像主畫面想放哪就放哪」）：座位表裡的空位
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixOrder, intoFolder, isBreak, isHole, newHole, reseat, seatedLayout } from '../src/lib/model.ts';

const note = (id, o = {}) => ({ id, type: 'check', title: id, body: '', bin: [], color: 'yellow', items: [], pinned: false, deleted: false, created: 1, updated: 1, b: true, ...o });
const state = (notes, order, folders) => ({ sort: 'updated', notes, garden: { days: {}, tot: { f: 0, e: 0 } }, order, folders });
// 格子簡寫：空位寫「_」、換頁標記寫「|」
const cells = es => es.map(e => (e.hole ? '_' : e.brk ? '|' : e.id));

test('空位：id 以 . 開頭，跟紙、換頁標記分得開', () => {
  const h = newHole();
  assert.ok(isHole(h));
  assert.ok(!isBreak(h));
  assert.ok(!isHole('a'));
  assert.ok(!isHole('|1'));
  assert.ok(!isHole(undefined));
});

test('fixOrder：兩格之間、頁首的空位留著', () => {
  const s = state([note('a'), note('b')], ['.0', 'a', '.1', '.2', 'b']);
  fixOrder(s);
  assert.deepEqual(s.order, ['.0', 'a', '.1', '.2', 'b']);
});

test('fixOrder：頁尾的空位不存（最後面、下一個換頁標記前）', () => {
  const s = state([note('a'), note('b')], ['a', '.1', '|1', 'b', '.2', '.3']);
  fixOrder(s);
  assert.deepEqual(s.order, ['a', '|1', 'b']);
});

test('fixOrder：整頁只有空位＝那頁不存在，空位和標記一起拿掉', () => {
  const s = state([note('a'), note('b')], ['a', '|1', '.1', '.2', '|2', 'b']);
  fixOrder(s);
  assert.deepEqual(s.order, ['a', '|1', 'b']);
});

test('fixOrder：最近刪除的紙不算格子，它後面沒有看得到的格子時空位也不存', () => {
  const s = state([note('a'), note('x', { deleted: true })], ['a', '.1', 'x']);
  fixOrder(s);
  assert.deepEqual(s.order, ['a', 'x']);
});

test('seatedLayout：空位照座位表的位置佔一格；頁尾的不畫', () => {
  const s = state([note('a'), note('b'), note('c')], ['a', '.1', '.2', 'b', '.3', '|1', '.4', 'c', '.5']);
  assert.deepEqual(cells(seatedLayout(s)), ['a', '_', '_', 'b', '|', '_', 'c']);
});

test('reseat：放到空位＝那格換成這張，原本那格變空位，別張不動', () => {
  const s = state([note('a'), note('b'), note('c')], ['a', 'b', '.1', 'c']);
  const h = newHole();
  // b 從第 2 格搬到第 3 格（原本是空位）：b 那格留空位
  reseat(s, ['a', h, 'b', 'c'], 5);
  assert.deepEqual(s.order, ['a', h, 'b', 'c']);
});

test('reseat：放到最後一張後面更遠的格子＝中間補空位；搬走的那格留空位', () => {
  const s = state([note('a'), note('b'), note('c')], ['a', 'b', 'c']);
  const h1 = newHole(), h2 = newHole(), h3 = newHole();
  reseat(s, ['a', h1, 'c', h2, h3, 'b'], 5);
  assert.deepEqual(s.order, ['a', h1, 'c', h2, h3, 'b']);
});

test('reseat：用掉的舊空位不留，最近刪除的紙留在原位', () => {
  const s = state([note('a'), note('x', { deleted: true }), note('c')], ['a', 'x', '.1', 'c']);
  // c 搬進 .1 那格：.1 用掉了，c 原本那格在最後面＝頁尾，不存
  reseat(s, ['a', 'c'], 5);
  assert.deepEqual(s.order, ['a', 'x', 'c']);
});

test('reseat：換頁標記要跟著 visible 一起給，空位不會把它吃掉', () => {
  const s = state([note('a'), note('b'), note('c')], ['a', '.1', 'b', '|1', 'c']);
  reseat(s, ['.1', 'a', 'b', '|1', 'c'], 5);
  assert.deepEqual(s.order, ['.1', 'a', 'b', '|1', 'c']);
});

test('intoFolder：疊進資料夾，原本那格留空位（後面還有格子時）', () => {
  const s = state([note('a'), note('b'), note('c')], ['f1', 'b', 'c'], [{ id: 'f1', name: '新資料夾', ids: ['a'] }]);
  intoFolder(s, 'b', 'f1', 5);
  assert.equal(s.order.length, 3);
  assert.equal(s.order[0], 'f1');
  assert.ok(isHole(s.order[1]));
  assert.equal(s.order[2], 'c');
  assert.deepEqual(s.folders[0].ids, ['a', 'b']);
});

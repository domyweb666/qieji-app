// 目錄換頁標記（2026-11-02，多米：拖到最後一頁邊緣開新的一頁）。Dock 同一天拿掉了，釘選的跟一般的一起排
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixOrder, reseat, seatedLayout, seatedEntries, isBreak, newBreak, placeTop, newFolder } from '../src/lib/model.ts';

const note = (id, o = {}) => ({ id, type: 'check', title: id, body: '', bin: [], color: 'yellow', items: [], pinned: false, deleted: false, created: 1, updated: 1, b: true, ...o });
const state = (notes, order, folders) => ({ sort: 'updated', notes, garden: { days: {}, tot: { f: 0, e: 0 } }, order, folders });
const ids = es => es.map(e => (e.brk ? '|' : e.id));

test('換頁標記：id 以 | 開頭、跟紙分得開', () => {
  const b = newBreak();
  assert.ok(isBreak(b));
  assert.ok(!isBreak('a'));
  assert.ok(!isBreak(undefined));
});

test('fixOrder 留住兩格之間的標記，拿掉最前面、最後面、連在一起的', () => {
  const s = state([note('a'), note('b'), note('c')], ['|0', 'a', '|1', '|2', 'b', '|3', 'c', '|4']);
  fixOrder(s);
  assert.deepEqual(s.order, ['a', '|1', 'b', '|3', 'c']);
});

test('fixOrder：標記隔開的那頁只剩最近刪除的紙＝那頁不存在，標記拿掉', () => {
  const s = state([note('a'), note('x', { deleted: true }), note('b')], ['a', '|1', 'x', '|2', 'b']);
  fixOrder(s);
  assert.deepEqual(s.order, ['a', '|1', 'x', 'b']);
});

test('fixOrder：釘選的紙算看得到（Dock 拿掉了），隔開它的標記留著', () => {
  const s = state([note('a'), note('p', { pinned: true }), note('b')], ['a', '|1', 'p', '|2', 'b']);
  fixOrder(s);
  assert.deepEqual(s.order, ['a', '|1', 'p', '|2', 'b']);
});

test('seatedLayout：釘選的跟一般的一起排在格子裡，標記插在兩格之間', () => {
  const s = state([note('a'), note('p', { pinned: true }), note('b'), note('c')], ['a', 'p', '|1', 'b', 'c']);
  assert.deepEqual(ids(seatedLayout(s)), ['a', 'p', '|', 'b', 'c']);
  assert.deepEqual(seatedEntries(s).map(e => e.id), ['a', 'p', 'b', 'c']);
});

test('seatedLayout：資料夾裡釘選的那張照樣算在資料夾裡', () => {
  const s = state([note('a'), note('b', { pinned: true }), note('c')], ['f1', 'c'], [{ id: 'f1', name: '新資料夾', ids: ['a', 'b'] }]);
  assert.deepEqual(seatedLayout(s)[0].notes.map(n => n.id), ['a', 'b']);
});

test('reseat：拖到新的一頁（visible 多一個新標記）→ 標記和那張接在最後，一張不少', () => {
  const s = state([note('a'), note('b'), note('c')], ['a', 'b', 'c']);
  const b = newBreak();
  reseat(s, ['b', 'c', b, 'a'], 10);
  assert.deepEqual(s.order, ['b', 'c', b, 'a']);
  assert.ok(s.orderMod >= 10);
});

test('reseat：跨頁搬，標記跟著 visible 走；看不到的（最近刪除）留在原位', () => {
  const s = state([note('a'), note('x', { deleted: true }), note('b'), note('c')], ['a', 'x', '|1', 'b', 'c']);
  reseat(s, ['b', '|1', 'a', 'c'], 5);
  assert.deepEqual(s.order, ['b', 'x', '|1', 'a', 'c']);
});

test('reseat：搬走之後那頁空了 → 標記自己消失，頁合回去', () => {
  const s = state([note('a'), note('b')], ['a', '|1', 'b']);
  reseat(s, ['b', 'a', '|1'], 5);
  assert.deepEqual(s.order, ['b', 'a']);
});

test('placeTop：放到指定位置', () => {
  const s = state([note('a'), note('b'), note('p')], ['a', 'b', 'p']);
  s.notes[2].pinned = false;
  placeTop(s, 'p', ['p', 'a', 'b'], 5);
  assert.deepEqual(s.order, ['p', 'a', 'b']);
});

test('資料夾函式碰到標記照常：在標記後面那頁疊成資料夾', () => {
  const s = state([note('a'), note('b'), note('c')], ['a', '|1', 'b', 'c']);
  const f = newFolder(s, 'b', 5, 'f9');
  assert.equal(f.id, 'f9');
  assert.deepEqual(s.order, ['a', '|1', 'f9', 'c']);
});

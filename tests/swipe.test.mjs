// 清單左右滑的頁（2026-11-02，多米：最左邊固定是最近看的那張沒釘選的，右邊接釘選的；從釘選那張往回滑要回到原本那張）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeSet, switchList } from '../src/lib/model.ts';

const note = (id, o = {}) => ({ id, type: 'check', title: id, body: '', bin: [], color: 'yellow', items: [], pinned: false, deleted: false, created: 1, updated: 1, b: true, ...o });
const state = notes => ({ sort: 'updated', notes, garden: { days: {}, tot: { f: 0, e: 0 } } });
const ids = set => set.map(n => n.id);

test('現在這張沒釘選：它在最左，右邊接釘選的（照建立先後）', () => {
  const a = note('a'), p2 = note('p2', { pinned: true, created: 5 }), p1 = note('p1', { pinned: true, created: 2 });
  assert.deepEqual(ids(swipeSet(state([a, p2, p1]), a, 'x')), ['a', 'p1', 'p2']);
});

test('釘 1 張＝2 頁、釘 2 張＝3 頁、沒釘＝1 頁', () => {
  const a = note('a'), p1 = note('p1', { pinned: true });
  assert.equal(swipeSet(state([a]), a).length, 1);
  assert.equal(swipeSet(state([a, p1]), a).length, 2);
  assert.equal(swipeSet(state([a, p1, note('p2', { pinned: true, created: 3 })]), a).length, 3);
});

test('滑到釘選那張：最左還是原本那張（lastFree），回得去', () => {
  const a = note('a', { updated: 1 }), b = note('b', { updated: 9 }), p1 = note('p1', { pinned: true });
  assert.deepEqual(ids(swipeSet(state([a, b, p1]), p1, 'a')), ['a', 'p1']);
});

test('lastFree 被刪了或被釘選了：改用最近改過的那張沒釘選的', () => {
  const a = note('a', { deleted: true }), b = note('b', { updated: 3 }), c = note('c', { updated: 7 }), p1 = note('p1', { pinned: true });
  assert.deepEqual(ids(swipeSet(state([a, b, c, p1]), p1, 'a')), ['c', 'p1']);
  const a2 = note('a', { pinned: true, created: 0 });
  assert.deepEqual(ids(swipeSet(state([a2, b, c, p1]), p1, 'a')), ['c', 'a', 'p1']);
});

test('沒記 lastFree（第一次）：用最近改過的那張沒釘選的；全部都釘選了就只有釘選的', () => {
  const b = note('b', { updated: 3 }), c = note('c', { updated: 7 }), p1 = note('p1', { pinned: true });
  assert.deepEqual(ids(swipeSet(state([b, c, p1]), p1, null)), ['c', 'p1']);
  const p2 = note('p2', { pinned: true, created: 2 });
  assert.deepEqual(ids(swipeSet(state([p1, p2]), p2, null)), ['p1', 'p2']);
});

test('舊資料釘超過上限（PIN_MAX 5）、現在這張是第六張：照舊暫時排最左', () => {
  const ps = [1, 2, 3, 4, 5, 6].map(i => note('p' + i, { pinned: true, created: i }));
  assert.deepEqual(ids(swipeSet(state(ps), ps[5], null)), ['p6', 'p1', 'p2', 'p3', 'p4', 'p5']);
});

test('switchList：釘選的照建立先後在前；最近開過的接著（不重複、不含釘選、不含刪除的），最多 5 張', () => {
  const ns = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => note(id, { created: i, updated: i }));
  ns[1].pinned = true; ns[0].pinned = true; ns[6].deleted = true;
  const { pinned, recent } = switchList(state(ns), ['g', 'c', 'b', 'e', 'c']);
  assert.deepEqual(ids(pinned), ['a', 'b']);
  // 記到的 c、e 在前，不夠的用最近改過的補（f、d）
  assert.deepEqual(ids(recent), ['c', 'e', 'f', 'd']);
});

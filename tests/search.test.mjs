// 搜尋筆記（2026-11-03，多米：搜尋要找得到筆記、看得出是哪一行）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchLines } from '../src/lib/model.ts';

const note = (id, o = {}) => ({ id, type: 'check', title: id, body: '', bin: [], color: 'yellow', items: [], pinned: false, deleted: false, created: 1, updated: 1, b: true, ...o });
const item = (id, t, done = false) => ({ id, t, done });
const state = notes => ({ sort: 'updated', notes, garden: { days: {}, tot: { f: 0, e: 0 } } });

test('列出每張中了哪幾行（不分大小寫），劃掉的也算', () => {
  const a = note('買菜', { items: [item('1', '牛奶'), item('2', 'Milk 低脂', true), item('3', '雞蛋')] });
  const [h] = searchLines(state([a]), 'milk');
  assert.equal(h.note, a);
  assert.equal(h.title, false);
  assert.deepEqual(h.lines.map(l => [l.id, l.done]), [['2', true]]);
});

test('只有清單名中：照樣列出那張，沒有行', () => {
  const r = searchLines(state([note('旅行', { items: [item('1', '護照')] })]), '旅');
  assert.equal(r.length, 1);
  assert.equal(r[0].title, true);
  assert.deepEqual(r[0].lines, []);
});

test('最近刪除裡的不找；空字串回空', () => {
  const s = state([note('a', { deleted: true, items: [item('1', '找我')] })]);
  assert.deepEqual(searchLines(s, '找'), []);
  assert.deepEqual(searchLines(state([note('a')]), '  '), []);
});

test('舊的文字筆記（body）整段當一行，id 是空的', () => {
  const r = searchLines(state([note('a', { type: 'text', body: '以前寫的一段話' })]), '一段');
  assert.deepEqual(r[0].lines.map(l => l.id), ['']);
});

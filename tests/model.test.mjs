// 用「網頁版存檔格式」測資料層：舊資料載入一則不少、機制規則與網頁版一致。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseState, importBackup, exportJSON, KEY, plain,
} from '../src/lib/model.ts';

// 最早期的網頁版存檔：沒有 garden、沒有 b 欄位、還有已廢除的 pink 色
const OLD = JSON.stringify({
  sort: 'title',
  notes: [
    { id: 'a', type: 'check', title: '點子', items: [{ id: 'a1', t: '做茄子田', done: true }, { id: 'a2', t: '寫交接', done: false }, { id: 'a3', t: '' }],
      color: 'pink', pinned: true, deleted: false, created: 1, updated: 2 },
    { id: 'b', type: 'text', title: '', body: '一段想法', color: 'purple', pinned: false, deleted: false, created: 3, updated: 4 },
    { id: 'c', type: 'check', title: '丟掉的', items: [{ id: 'c1', t: 'x', done: true }], color: 'nope', deleted: true, created: 5, updated: 6 },
  ],
});

test('storage key 沒有被改名', () => assert.equal(KEY, 'colornotes.v1'));

test('舊資料載入：筆記一則不少、欄位補齊、累計換算', () => {
  const s = parseState(OLD);
  assert.equal(s.notes.length, 3);
  assert.equal(s.sort, 'title');
  assert.equal(s.notes[0].color, 'red');          // pink → red
  assert.equal(s.notes[2].color, 'yellow');       // 不認識的色 → yellow
  assert.ok(s.notes.every(n => n.b === true));    // 舊資料視為已開過花
  assert.ok(s.notes[0].items.every(i => i.b === true));
  assert.equal(s.notes[1].items.length, 0);
  // 只算沒刪的：2 行有字 + 1 則有內文的文字筆記 = 3 朵花；1 個劃掉 = 1 顆茄子
  assert.deepEqual(s.garden.tot, { f: 3, e: 1 });
  assert.deepEqual(s.garden.days, {});
});

test('壞掉或空的存檔回到空白狀態', () => {
  assert.equal(parseState(null).notes.length, 0);
  assert.equal(parseState('{oops').notes.length, 0);
  assert.equal(parseState('{"x":1}').notes.length, 0);
});

test('已經有 garden 的存檔不會重算', () => {
  const s = parseState(JSON.stringify({ notes: [], garden: { days: { '2026-01-01': { f: 1, e: 2, g: 0 } }, tot: { f: 9, e: 9 } } }));
  assert.deepEqual(s.garden.tot, { f: 9, e: 9 });
});

test('匯入網頁版備份：依 updated 合併、茄子田每天取較大值', () => {
  const s = parseState(OLD);
  const backup = JSON.parse(exportJSON(parseState(OLD)));
  backup.notes[0].title = '比較新的標題'; backup.notes[0].updated = 99;
  backup.notes[1].body = '比較舊'; backup.notes[1].updated = 1;
  backup.notes.push({ id: 'new', type: 'text', body: '新的', created: 7, updated: 8 });
  backup.garden = { days: { '2026-10-28': { f: 4, e: 1, g: 0 } }, tot: { f: 50, e: 0 } };
  const r = importBackup(s, JSON.stringify(backup));
  assert.deepEqual(r, { added: 1, updated: 1 });
  assert.equal(s.notes.length, 4);
  assert.equal(s.notes[0].title, '比較新的標題');
  assert.equal(s.notes[1].body, '一段想法');
  assert.equal(s.notes[3].color, 'yellow');
  assert.deepEqual(s.garden.days['2026-10-28'], { f: 4, e: 1, g: 0 });
  assert.deepEqual(s.garden.tot, { f: 50, e: 1 });
});

test('不是備份檔就丟錯，不動資料', () => {
  const s = parseState(OLD);
  assert.throws(() => importBackup(s, '{"hello":1}'));
  assert.throws(() => importBackup(s, 'not json'));
  assert.equal(s.notes.length, 3);
});

test('列表只分已釘選和其他，不用時間分組；最近刪除整頁一組', async () => {
  const { groupNotes, visibleNotes, parseState, rowDate } = await import('../src/lib/model.ts');
  const now = new Date(2026, 9, 28, 12, 0);
  const at = (y, m, d) => new Date(y, m, d, 9, 0).getTime();
  const s = parseState(JSON.stringify({ notes: [
    { id: 'p', type: 'text', body: '釘', pinned: true, created: 1, updated: at(2025, 0, 1) },
    { id: 't', type: 'text', body: '今天', created: 1, updated: at(2026, 9, 28) },
    { id: 'y', type: 'text', body: '昨天', created: 1, updated: at(2026, 9, 27) },
    { id: 'w', type: 'text', body: '這週', created: 1, updated: at(2026, 9, 23) },
    { id: 'o', type: 'text', body: '很久', created: 1, updated: at(2026, 2, 3) },
  ] }));
  const notes = visibleNotes(s, { trash: false, filter: 'all', q: '', sort: 'updated' });
  const g = groupNotes(notes, { trash: false });
  assert.deepEqual(g.map(x => [x.title, x.notes.map(n => n.id).join('')]),
    [['已釘選', 'p'], ['其他', 'tywo']]);
  const gt = groupNotes(notes, { trash: true });
  assert.deepEqual(gt.map(x => [x.title, x.notes.length]), [['最近刪除', 5]]);
  assert.equal(rowDate(at(2026, 9, 27), now), '昨天');
  assert.equal(rowDate(at(2026, 9, 26), now), '星期一');
});

test('同一則筆記被重複存兩次：只留最新那份，其他筆記不動', () => {
  const raw = JSON.stringify({ notes: [
    { id: 'x', type: 'text', title: '舊', body: '', color: 'yellow', created: 1, updated: 5 },
    { id: 'y', type: 'text', title: '另一則', body: '', color: 'yellow', created: 1, updated: 1 },
    { id: 'x', type: 'text', title: '新', body: '', color: 'yellow', created: 1, updated: 9 },
  ] });
  const s = parseState(raw);
  assert.deepEqual(s.notes.map(n => n.id + n.title), ['y另一則', 'x新']);
});

test('複製全文：每行編號、中間空一行，劃掉的行照常顯示文字並標（劃線），空白行略過', () => {
  const n = { type: 'check', items: [
    { id: '1', t: '寫交接', done: false }, { id: '2', t: '  ', done: false }, { id: '3', t: '做茄子田', done: true },
  ] };
  assert.equal(plain(n), '1.寫交接\n\n2.（劃線）做茄子田');
});

/* ---------------- 紙上的順序（重新設計分支） ---------------- */
import { setDone, tidyDone } from '../src/lib/model.ts';

const row = (id, done = false) => ({ id, t: id, done, b: false });

test('tidyDone：劃掉的行排到後面，沒動到就回 false', () => {
  const items = [row('a'), row('b', true), row('c'), row('d', true)];
  assert.equal(tidyDone(items), true);
  assert.deepEqual(items.map(i => i.id), ['a', 'c', 'b', 'd']);
  assert.equal(tidyDone(items), false); // 已經排好
  assert.deepEqual(items.map(i => i.id), ['a', 'c', 'b', 'd']);
});

test('setDone：劃掉搬到劃掉區最前面，恢復搬回最上面', () => {
  const items = [row('a'), row('b'), row('c'), row('x', true), row('y', true)];
  setDone(items, 'b', true);
  assert.deepEqual(items.map(i => `${i.id}${i.done ? '-' : ''}`), ['a', 'c', 'b-', 'x-', 'y-']);
  setDone(items, 'y', false);
  assert.deepEqual(items.map(i => `${i.id}${i.done ? '-' : ''}`), ['y', 'a', 'c', 'b-', 'x-']);
  setDone(items, 'nope', true); // 找不到：什麼都不動
  assert.equal(items.length, 5);
  // 一張沒有劃掉的紙：劃掉第一行就排到最後
  const one = [row('p'), row('q')];
  setDone(one, 'p', true);
  assert.deepEqual(one.map(i => i.id), ['q', 'p']);
});

/* ---------------- 刪掉的行進 bin、搬到別張（重新設計分支） ---------------- */
import { binItem, unbinItem, moveItem } from '../src/lib/model.ts';

const paper = (ids, extra = {}) => ({ id: 'p', type: 'check', title: '', body: '', items: ids.map(id => row(id)), bin: [], color: 'purple',
  pinned: false, deleted: false, created: 1, updated: 1, b: false, ...extra });

test('舊存檔沒有 bin：載入後是空陣列；bin 裡的行會補齊欄位', () => {
  const s = parseState(JSON.stringify({ notes: [
    { id: 'a', type: 'check', title: '', items: [], color: 'purple' },
    { id: 'b', type: 'check', title: '', items: [], bin: [{ id: 'x', t: '舊的', at: 123 }, { id: 'y', t: '沒時間' }], color: 'purple' },
  ] }));
  assert.deepEqual(s.notes[0].bin, []);
  assert.equal(s.notes[1].bin.length, 2);
  assert.equal(s.notes[1].bin[0].at, 123);
  assert.equal(s.notes[1].bin[1].at, undefined);
  assert.equal(s.notes[1].bin[1].done, false);
});

test('binItem：行離開紙、記下時間、排在 bin 最前面；找不到回 undefined', () => {
  const n = paper(['a', 'b', 'c']);
  assert.equal(binItem(n, 'b', 1000).id, 'b');
  assert.deepEqual(n.items.map(i => i.id), ['a', 'c']);
  assert.equal(n.bin[0].at, 1000);
  binItem(n, 'c', 2000);
  assert.deepEqual(n.bin.map(i => i.id), ['c', 'b']);
  assert.equal(binItem(n, 'nope', 3000), undefined);
});

test('unbinItem：放回最上面或指定位置，時間拿掉，劃掉的沉到後面', () => {
  const n = paper(['a', 'b']);
  binItem(n, 'a', 1000);
  unbinItem(n, 'a');
  assert.deepEqual(n.items.map(i => i.id), ['a', 'b']);
  assert.equal(n.items[0].at, undefined);
  binItem(n, 'a', 1000);
  unbinItem(n, 'a', 99); // 超過長度就放最後
  assert.deepEqual(n.items.map(i => i.id), ['b', 'a']);
  n.items[1].done = true;
  binItem(n, 'a', 1000);
  unbinItem(n, 'a', 0); // 劃掉的回來也不會排在沒劃掉的前面
  assert.deepEqual(n.items.map(i => i.id), ['b', 'a']);
  assert.equal(unbinItem(n, 'nope'), undefined);
});

test('moveItem：搬到別張的最上面；同一張不動', () => {
  const a = paper(['a1', 'a2'], { id: 'a' }), b = paper(['b1'], { id: 'b' });
  assert.equal(moveItem(a, b, 'a2').id, 'a2');
  assert.deepEqual(a.items.map(i => i.id), ['a1']);
  assert.deepEqual(b.items.map(i => i.id), ['a2', 'b1']);
  assert.equal(moveItem(a, a, 'a1'), undefined);
  assert.deepEqual(a.items.map(i => i.id), ['a1']);
  // 劃掉的搬過去也沉到後面
  a.items[0].done = true;
  moveItem(a, b, 'a1');
  assert.deepEqual(b.items.map(i => `${i.id}${i.done ? '-' : ''}`), ['a2', 'b1', 'a1-']);
});

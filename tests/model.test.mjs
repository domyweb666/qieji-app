// 用「網頁版存檔格式」測資料層：舊資料載入一則不少、機制規則與網頁版一致。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseState, bloom, toggleStrike, harvest, weekGarden, importBackup, exportJSON, dayKey, KEY,
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

test('開花只開一次，略過正在打字的那行', () => {
  const s = parseState(JSON.stringify({ notes: [] }));
  const n = { id: 'n', type: 'check', title: '', body: '', items: [
    { id: 'x', t: '新點子', done: false, b: false }, { id: 'y', t: '打字中', done: false, b: false }, { id: 'z', t: '  ', done: false, b: false },
  ], color: 'purple', pinned: false, deleted: false, created: 0, updated: 0, b: false };
  assert.deepEqual(bloom(s, n, 'y'), ['x']);
  assert.deepEqual(bloom(s, n, 'y'), []);
  assert.deepEqual(bloom(s, n), ['y']);
  assert.equal(s.garden.tot.f, 2);
  assert.equal(s.garden.days[dayKey()].f, 2);
});

test('劃掉結茄子、每第 10 顆是金色、取消只收回今天的', () => {
  const s = parseState(JSON.stringify({ notes: [], garden: { days: {}, tot: { f: 0, e: 8 } } }));
  const it = { id: 'i', t: '點子', done: false, b: false };
  assert.equal(toggleStrike(s, it), 'e');          // 第 9 顆
  assert.equal(it.b, true);                         // 劃掉時順便開花
  assert.equal(s.garden.tot.f, 1);
  const it2 = { id: 'j', t: '點子二', done: false, b: true };
  assert.equal(toggleStrike(s, it2), 'g');         // 第 10 顆 → 金色
  assert.deepEqual(s.garden.days[dayKey()], { f: 1, e: 2, g: 1 });
  assert.equal(toggleStrike(s, it2), null);        // 取消劃掉，收回金色那顆
  assert.deepEqual(s.garden.days[dayKey()], { f: 1, e: 1, g: 0 });
  assert.equal(s.garden.tot.e, 9);
  assert.equal(toggleStrike(s, { id: 'k', t: '  ', done: false, b: false }), null); // 空白行不能劃
});

test('取消劃掉不會拿走以前的茄子', () => {
  const s = parseState(JSON.stringify({ notes: [], garden: { days: { '2020-01-01': { f: 0, e: 5, g: 0 } }, tot: { f: 0, e: 5 } } }));
  assert.equal(harvest(s, false), null);
  assert.equal(s.garden.tot.e, 5);
  assert.equal(s.garden.days['2020-01-01'].e, 5);
});

test('茄子田只算本週（週一開始），今天的是小茄子、金色排前面', () => {
  const wed = new Date(2026, 9, 28); // 2026-10-28 星期三
  const s = parseState(JSON.stringify({ notes: [], garden: { tot: { f: 0, e: 0 }, days: {
    '2026-10-25': { f: 9, e: 9, g: 0 },   // 上週日，不算
    '2026-10-26': { f: 2, e: 3, g: 1 },   // 週一
    '2026-10-28': { f: 1, e: 2, g: 0 },   // 今天
  } } }));
  const w = weekGarden(s, wed);
  assert.equal(w.f, 3);
  assert.deepEqual(w.eggs, ['egg-gold', 'egg', 'egg', 'egg-small', 'egg-small']);
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

test('列表依時間分組，釘選的排最上面', async () => {
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
  const g = groupNotes(notes, { sort: 'updated', trash: false }, now);
  assert.deepEqual(g.map(x => [x.title, x.notes.map(n => n.id).join('')]),
    [['已釘選', 'p'], ['今天', 't'], ['昨天', 'y'], ['過去 7 天', 'w'], ['3月', 'o']]);
  assert.equal(rowDate(at(2026, 9, 27), now), '昨天');
  assert.equal(rowDate(at(2026, 9, 26), now), '星期一');
});

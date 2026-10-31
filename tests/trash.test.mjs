// 最近刪除 30 天自動清掉：這是會真的刪掉使用者資料的功能，規則全部用測試釘死。
// 鐵則：拿不準就不刪。只有「在最近刪除裡、有可信的刪除時間、而且已經滿 30 天」才會被清掉。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRASH_DAYS, isExpiredTrash, isExpiredAt, markDeleted, markRestored, stampOldTrash, purgeExpiredTrash, stampOldBin, purgeExpiredBin, parseState, importBackup,
} from '../src/lib/model.ts';

const DAY = 86400000;
const NOW = new Date(2026, 9, 31, 12, 0).getTime();
const note = (o) => ({ id: o.id || 'x', type: 'check', title: o.title || '', body: '', items: [], color: 'purple',
  pinned: false, deleted: false, created: 1, updated: 1, b: true, ...o });

test('保留天數是 30 天', () => assert.equal(TRASH_DAYS, 30));

test('沒被刪除的清單，不管多舊都不會被清掉', () => {
  assert.equal(isExpiredTrash(note({ created: 1, updated: 1 }), NOW), false);
  // 就算身上殘留很舊的刪除時間（例如還原過），只要不在最近刪除裡就不刪
  assert.equal(isExpiredTrash(note({ deletedAt: NOW - 400 * DAY }), NOW), false);
});

test('在最近刪除裡：未滿 30 天不刪，滿 30 天才刪', () => {
  assert.equal(isExpiredTrash(note({ deleted: true, deletedAt: NOW - 29 * DAY }), NOW), false);
  assert.equal(isExpiredTrash(note({ deleted: true, deletedAt: NOW - 30 * DAY + 1 }), NOW), false);
  assert.equal(isExpiredTrash(note({ deleted: true, deletedAt: NOW - 30 * DAY }), NOW), true);
  assert.equal(isExpiredTrash(note({ deleted: true, deletedAt: NOW - 365 * DAY }), NOW), true);
});

test('看的是刪除時間，不是最後修改或建立時間', () => {
  // 很久以前寫的清單，昨天才刪 → 不刪
  assert.equal(isExpiredTrash(note({ deleted: true, created: 1, updated: 1, deletedAt: NOW - DAY }), NOW), false);
});

test('沒有刪除時間（功能上線前就丟進最近刪除的）→ 不刪', () => {
  assert.equal(isExpiredTrash(note({ deleted: true }), NOW), false);
});

test('刪除時間不可信 → 不刪', () => {
  for (const bad of ['2026-01-01', null, NaN, Infinity, -1, 0, {}, true]) {
    assert.equal(isExpiredTrash(note({ deleted: true, deletedAt: bad }), NOW), false, String(bad));
  }
  // 手機時間被往前調過：刪除時間比現在還晚 → 不刪
  assert.equal(isExpiredTrash(note({ deleted: true, deletedAt: NOW + 5 * DAY }), NOW), false);
});

test('現在時間不可信 → 一則都不刪', () => {
  const old = note({ deleted: true, deletedAt: NOW - 100 * DAY });
  for (const bad of [NaN, 0, -1, Infinity]) assert.equal(isExpiredTrash(old, bad), false, String(bad));
});

test('刪除時記下時間，還原時清掉', () => {
  const n = note({ pinned: true });
  markDeleted(n, NOW);
  assert.equal(n.deleted, true);
  assert.equal(n.deletedAt, NOW);
  markRestored(n);
  assert.equal(n.deleted, false);
  assert.equal(n.deletedAt, undefined);
  // 還原之後就算時間過了很久也不會被清
  assert.equal(isExpiredTrash(n, NOW + 400 * DAY), false);
});

test('舊的最近刪除補上刪除時間：從現在開始算 30 天，不動其他清單、不蓋掉已有的時間', () => {
  const notes = [
    note({ id: 'old', deleted: true }),
    note({ id: 'has', deleted: true, deletedAt: NOW - 10 * DAY }),
    note({ id: 'live' }),
    note({ id: 'bad', deleted: true, deletedAt: 'oops' }),
  ];
  assert.equal(stampOldTrash(notes, NOW), 2);
  assert.equal(notes[0].deletedAt, NOW);
  assert.equal(notes[1].deletedAt, NOW - 10 * DAY);
  assert.equal(notes[2].deletedAt, undefined);
  assert.equal(notes[3].deletedAt, NOW);
  // 補完之後當下一則都不會過期
  assert.equal(notes.filter(n => isExpiredTrash(n, NOW)).length, 0);
});

test('清掉過期的：只拿掉過期那幾則，其他照原順序留著，不改原本的陣列', () => {
  const notes = [
    note({ id: 'a' }),
    note({ id: 'b', deleted: true, deletedAt: NOW - 31 * DAY }),
    note({ id: 'c', deleted: true, deletedAt: NOW - 2 * DAY }),
    note({ id: 'd', pinned: true }),
    note({ id: 'e', deleted: true }),
  ];
  const before = notes.map(n => n.id).join('');
  const r = purgeExpiredTrash(notes, NOW);
  assert.deepEqual(r.kept.map(n => n.id), ['a', 'c', 'd', 'e']);
  assert.deepEqual(r.removed.map(n => n.id), ['b']);
  assert.equal(notes.map(n => n.id).join(''), before);
});

test('沒有東西過期時，回傳的就是原本那幾則', () => {
  const notes = [note({ id: 'a' }), note({ id: 'b', deleted: true, deletedAt: NOW })];
  const r = purgeExpiredTrash(notes, NOW);
  assert.equal(r.removed.length, 0);
  assert.deepEqual(r.kept.map(n => n.id), ['a', 'b']);
});

test('自己的存檔讀回來，刪除時間會留著；不在最近刪除裡的殘留時間會被拿掉', () => {
  const raw = JSON.stringify({ notes: [
    { id: 'z', type: 'check', title: '丟掉', items: [], color: 'blue', deleted: true, deletedAt: NOW - 3 * DAY, created: 1, updated: 2 },
    // 網頁版還原過的：deleted 是 false 但 deletedAt 還留著（網頁版只改 deleted）→ 讀回來要拿掉，不然下次刪它會立刻過期
    { id: 'w', type: 'check', title: '還原過', items: [], color: 'blue', deleted: false, deletedAt: NOW - 400 * DAY, created: 1, updated: 2 },
  ] });
  const s = parseState(raw);
  assert.equal(s.notes[0].deletedAt, NOW - 3 * DAY);
  assert.equal(s.notes[1].deletedAt, undefined);
});

test('匯入備份：在最近刪除裡的張與行一律從匯入當下重算 30 天（風險 1、2：網頁版的舊時間、很久以前的備份）', () => {
  const raw = JSON.stringify({ notes: [
    { id: 'z', type: 'check', title: '丟掉', items: [], color: 'blue', deleted: true, deletedAt: NOW - 400 * DAY, created: 1, updated: 2,
      bin: [{ id: 'z1', t: '刪掉的行', at: NOW - 400 * DAY }] },
    { id: 'w', type: 'check', title: '還原過', items: [], color: 'blue', deleted: false, deletedAt: NOW - 400 * DAY, created: 1, updated: 2 },
  ] });
  const s = parseState(null);
  importBackup(s, raw, NOW);
  assert.equal(s.notes[0].deletedAt, NOW);
  assert.equal(s.notes[0].bin[0].at, NOW);
  assert.equal(s.notes[1].deletedAt, undefined);
  // 一匯入當下一則都不會過期
  assert.equal(purgeExpiredTrash(s.notes, NOW).removed.length, 0);
  assert.equal(purgeExpiredBin(s.notes, NOW), 0);
  // 同一則比較新的那份蓋過舊的（Object.assign），帶過去的也是重算過的時間
  const s2 = parseState(JSON.stringify({ notes: [{ id: 'z', type: 'check', title: '舊', items: [], color: 'blue', deleted: true, deletedAt: NOW - 50 * DAY, created: 1, updated: 1 }] }));
  importBackup(s2, raw, NOW);
  assert.equal(s2.notes[0].deletedAt, NOW);
});

test('刪掉的行（bin 裡的 at）同一套規則：沒時間的補成現在、滿 30 天的清掉、其他照留', () => {
  const notes = [
    note({ id: 'a', bin: [{ id: 'a1', t: '舊', at: NOW - 31 * DAY }, { id: 'a2', t: '新', at: NOW - DAY }, { id: 'a3', t: '沒時間' }, { id: 'a4', t: '未來', at: NOW + DAY }] }),
    note({ id: 'b', bin: [] }),
  ];
  assert.equal(stampOldBin(notes, NOW), 1);
  assert.equal(notes[0].bin[2].at, NOW);
  assert.equal(purgeExpiredBin(notes, NOW), 1);
  assert.deepEqual(notes[0].bin.map(i => i.id), ['a2', 'a3', 'a4']);
  assert.equal(isExpiredAt(NOW - 30 * DAY, NOW), true);
  assert.equal(isExpiredAt(NOW - 30 * DAY + 1, NOW), false);
  assert.equal(isExpiredAt('oops', NOW), false);
});

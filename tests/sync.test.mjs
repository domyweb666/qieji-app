// iCloud 同步的資料規則（S0，2026-11-01）：墓碑、指紋、合併。鐵則：拿不準就兩邊都留，寧可多一行、多一張，不能少。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseState, emptyState, fingerprint, stampMods, dropNotes, markSynced, pendingUploads, mergeRemote, isExpiredTrash,
} from '../src/lib/model.ts';

const NOW = new Date(2026, 10, 1, 12, 0).getTime();
const it = (id, t, o = {}) => ({ id, t, done: false, b: true, ...o });
const note = (o) => ({ id: o.id || 'x', type: 'check', title: o.title || '', body: '', items: [], bin: [], color: 'purple',
  pinned: false, deleted: false, created: 1, updated: 1, b: true, ...o });
const state = (...notes) => ({ ...emptyState(), notes });
const clone = (x) => JSON.parse(JSON.stringify(x));
const texts = (n) => n.items.map(i => i.t);
// 一張紙在兩台都對上過 iCloud 的起點：本機與 iCloud 同一份，sh＝h
function synced(n) {
  const s = state(note(n));
  stampMods(s, NOW - 1000);
  markSynced(s.notes[0]);
  return { s, cloud: clone(s.notes[0]) };
}

test('指紋：欄位順序不同算同一份；h、mod、sh 不算內容；改一個字就不同', () => {
  const a = note({ id: 'a', items: [it('1', '想法')] });
  const b = { updated: 1, created: 1, ...clone(a), h: 'zz', mod: 9, sh: 'yy' };
  assert.equal(fingerprint(a), fingerprint(b));
  const c = clone(a); c.items[0].t = '想法！';
  assert.notEqual(fingerprint(a), fingerprint(c));
});

test('存檔前蓋時間：舊紙第一次算指紋，mod 用 updated 不用現在；沒變不動；變了才是現在', () => {
  const s = state(note({ id: 'a', updated: 500 }));
  assert.equal(stampMods(s, NOW), 1);
  assert.equal(s.notes[0].mod, 500);
  assert.equal(stampMods(s, NOW), 0);
  s.notes[0].items.push(it('1', '新的一行'));
  assert.equal(stampMods(s, NOW + 5), 1);
  assert.equal(s.notes[0].mod, NOW + 5);
});

test('舊存檔（沒有墓碑、沒有指紋欄位）讀進來照常，墓碑是空的', () => {
  const s = parseState(JSON.stringify({ sort: 'updated', notes: [note({ id: 'a' })] }));
  assert.equal(s.notes.length, 1);
  assert.deepEqual(s.gone, {});
  const bad = parseState(JSON.stringify({ notes: [], gone: { a: 'x', b: -1, c: 123 } }));
  assert.deepEqual(bad.gone, { c: 123 });
});

test('永久拿掉一律立墓碑；同一張再拿一次時間取新的', () => {
  const s = state(note({ id: 'a', deleted: true }), note({ id: 'b' }));
  const r = dropNotes(s, n => n.deleted, NOW);
  assert.deepEqual(r.map(n => n.id), ['a']);
  assert.deepEqual(s.notes.map(n => n.id), ['b']);
  assert.equal(s.gone.a, NOW);
  // 已經有比較新的墓碑（例如從 iCloud 合進來的），再拿一次不會把時間改舊
  const t = state(note({ id: 'c' }));
  t.gone = { c: NOW + 10 };
  dropNotes(t, () => true, NOW);
  assert.equal(t.gone.c, NOW + 10);
});

test('30 天清掉的紙也立墓碑（store 走 dropNotes＋isExpiredTrash）', () => {
  const DAY = 86400000;
  const s = state(note({ id: 'old', deleted: true, deletedAt: NOW - 31 * DAY }), note({ id: 'new', deleted: true, deletedAt: NOW - DAY }));
  dropNotes(s, n => isExpiredTrash(n, NOW), NOW);
  assert.deepEqual(s.notes.map(n => n.id), ['new']);
  assert.equal(s.gone.old, NOW);
});

test('iCloud 有、本機沒有的紙：加進來（換手機、刪掉重裝資料回來）', () => {
  const s = state();
  const r = mergeRemote(s, { notes: [note({ id: 'a', items: [it('1', '從 iCloud 來')] })] }, NOW);
  assert.equal(r.added, 1);
  assert.deepEqual(texts(s.notes[0]), ['從 iCloud 來']);
  assert.equal(s.notes[0].sh, s.notes[0].h); // 跟 iCloud 對上了，不用再傳
  assert.deepEqual(r.push, []);
});

test('本機有、iCloud 沒有的紙：留著、要上傳（不會因為 iCloud 那份還沒下載就被當成刪了）', () => {
  const s = state(note({ id: 'a', items: [it('1', '還沒傳')] }));
  const r = mergeRemote(s, { notes: [] }, NOW);
  assert.equal(s.notes.length, 1);
  assert.deepEqual(r.push, ['a']);
});

test('只有 iCloud 那邊改了：拿 iCloud 的', () => {
  const { s, cloud } = synced({ id: 'a', items: [it('1', '一')] });
  cloud.items.push(it('2', '另一台記的'));
  cloud.mod = NOW;
  const r = mergeRemote(s, { notes: [cloud] }, NOW + 1);
  assert.equal(r.taken, 1);
  assert.deepEqual(texts(s.notes[0]), ['一', '另一台記的']);
  assert.deepEqual(r.push, []);
});

test('只有本機改了：留本機的、要上傳', () => {
  const { s, cloud } = synced({ id: 'a', items: [it('1', '一')] });
  s.notes[0].items.push(it('2', '這台記的'));
  const r = mergeRemote(s, { notes: [cloud] }, NOW);
  assert.deepEqual(texts(s.notes[0]), ['一', '這台記的']);
  assert.deepEqual(r.push, ['a']);
});

test('兩邊都改了同一張：兩邊新記的行都在，插在各自原本的位置，比兩邊都新、要上傳', () => {
  const { s, cloud } = synced({ id: 'a', items: [it('1', '一'), it('2', '二')] });
  s.notes[0].items.splice(1, 0, it('L', '這台插在一後面'));
  cloud.items.unshift(it('R', '另一台記在最上面'));
  cloud.mod = NOW + 50; // iCloud 那份比較新：以它為主
  const r = mergeRemote(s, { notes: [cloud] }, NOW + 100);
  assert.equal(r.united, 1);
  assert.deepEqual(texts(s.notes[0]), ['另一台記在最上面', '一', '這台插在一後面', '二']);
  assert.ok(s.notes[0].mod > NOW + 50);
  assert.deepEqual(r.push, ['a']);
});

test('兩邊都改了同一行的字：用比較新的那邊（另一邊的字不會變成第二行）', () => {
  const { s, cloud } = synced({ id: 'a', items: [it('1', '原本')] });
  s.notes[0].items[0].t = '這台改的';
  stampMods(s, NOW + 10);
  cloud.items[0].t = '另一台改的';
  cloud.mod = NOW + 20;
  mergeRemote(s, { notes: [cloud] }, NOW + 30);
  assert.deepEqual(texts(s.notes[0]), ['另一台改的']);
});

test('主的那邊刪掉的行（在最近刪除裡）不會被另一邊救回紙上，最近刪除裡也只有一份', () => {
  const { s, cloud } = synced({ id: 'a', items: [it('1', '一'), it('2', '要刪的')] });
  const [gone] = s.notes[0].items.splice(1, 1);
  s.notes[0].bin.push({ ...gone, at: NOW });
  stampMods(s, NOW + 100);
  cloud.items.push(it('3', '另一台記的'));
  cloud.mod = NOW + 10;
  mergeRemote(s, { notes: [cloud] }, NOW + 200);
  assert.deepEqual(texts(s.notes[0]), ['一', '另一台記的']);
  assert.deepEqual(s.notes[0].bin.map(i => i.id), ['2']);
});

test('這台從沒跟 iCloud 對過、同一張內容又不一樣（例如兩台都匯過同一份備份再各自改）：合起來，不丟', () => {
  const s = state(note({ id: 'a', items: [it('1', '共同'), it('L', '這台的')] }));
  const r = mergeRemote(s, { notes: [note({ id: 'a', items: [it('1', '共同'), it('R', '那台的')] })] }, NOW);
  assert.equal(r.united, 1);
  assert.deepEqual(texts(s.notes[0]).sort(), ['共同', '這台的', '那台的'].sort());
});

test('內容一樣：什麼都不動、記下對上了', () => {
  const s = state(note({ id: 'a', items: [it('1', '一')] }));
  const r = mergeRemote(s, { notes: [note({ id: 'a', items: [it('1', '一')] })] }, NOW);
  assert.deepEqual(r, { added: 0, taken: 0, united: 0, removed: 0, push: [] });
  assert.equal(s.notes[0].sh, s.notes[0].h);
});

test('另一台永久刪除（墓碑比這張最後一次改動新）：本機這張拿掉，不復活', () => {
  const { s } = synced({ id: 'a', items: [it('1', '一')] });
  const r = mergeRemote(s, { notes: [], gone: { a: NOW } }, NOW + 1);
  assert.equal(r.removed, 1);
  assert.equal(s.notes.length, 0);
  assert.equal(s.gone.a, NOW);
});

test('本機永久刪除過：iCloud 上的舊那份不會被加回來', () => {
  const s = state();
  s.gone = { a: NOW };
  mergeRemote(s, { notes: [note({ id: 'a', updated: NOW - 100 })] }, NOW + 1);
  assert.equal(s.notes.length, 0);
});

test('另一台刪了之後這台還有改（墓碑比改動舊）：拿不準，留著', () => {
  const { s } = synced({ id: 'a', items: [it('1', '一')] });
  s.notes[0].items.push(it('2', '離線時記的'));
  stampMods(s, NOW + 500);
  const r = mergeRemote(s, { notes: [], gone: { a: NOW } }, NOW + 600);
  assert.equal(r.removed, 0);
  assert.deepEqual(texts(s.notes[0]), ['一', '離線時記的']);
  assert.deepEqual(r.push, ['a']);
});

test('網頁版舊格式的紙從 iCloud 來（沒有 bin、pink 色、沒有 mod）：照 fixNote 補齊再合', () => {
  const s = state();
  mergeRemote(s, { notes: [{ id: 'w', type: 'check', title: '網頁版', items: [{ id: 'w1', t: '舊的一行', done: true }], color: 'pink', updated: 7, created: 1 }] }, NOW);
  assert.equal(s.notes[0].color, 'red');
  assert.deepEqual(s.notes[0].bin, []);
  assert.equal(s.notes[0].mod, 7);
});

test('iCloud 上的壞資料（沒有 id、null）略過，不會把本機弄壞', () => {
  const s = state(note({ id: 'a' }));
  mergeRemote(s, { notes: [null, { title: '沒有 id' }, 3] }, NOW);
  assert.deepEqual(s.notes.map(n => n.id), ['a']);
});

test('合了一次再合同一份：結果不變（重複同步不會長出重複的行）', () => {
  const { s, cloud } = synced({ id: 'a', items: [it('1', '一')] });
  s.notes[0].items.push(it('L', '這台'));
  cloud.items.push(it('R', '那台'));
  cloud.mod = NOW;
  mergeRemote(s, { notes: [cloud] }, NOW + 1);
  const once = texts(s.notes[0]);
  mergeRemote(s, { notes: [cloud] }, NOW + 2);
  assert.deepEqual(texts(s.notes[0]), once);
  assert.equal(new Set(s.notes[0].items.map(i => i.id)).size, s.notes[0].items.length);
});

// S2 只上傳（2026-11-01）
test('要上傳的紙：從沒傳過的、傳過之後又改的；傳過沒改的不傳', () => {
  const s = state(note({ id: 'a' }), note({ id: 'b' }), note({ id: 'c' }));
  stampMods(s, NOW);
  assert.deepEqual(pendingUploads(s).map(n => n.id), ['a', 'b', 'c']);
  s.notes.forEach(n => markSynced(n));
  assert.deepEqual(pendingUploads(s), []);
  s.notes[1].items.push(it('1', '改了'));
  stampMods(s, NOW + 1);
  assert.deepEqual(pendingUploads(s).map(n => n.id), ['b']);
});

test('上傳途中又改了同一張：記的是開始上傳那一刻的指紋，這張下一輪還要再傳', () => {
  const s = state(note({ id: 'a', items: [it('1', '一')] }));
  stampMods(s, NOW);
  const h = s.notes[0].h;                      // 開始上傳
  s.notes[0].items.push(it('2', '上傳途中打的'));
  stampMods(s, NOW + 1);                        // 途中又存了一次檔
  markSynced(s.notes[0], h);                    // 這次上傳完成
  assert.deepEqual(pendingUploads(s).map(n => n.id), ['a']);
});

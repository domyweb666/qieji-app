// 外面進來的壞資料（2026-11-04 程式審查）：iCloud 資料夾裡格式不對的檔、存檔裡夾著不是紙的東西。
// 鐵則：一張壞的不能害到整次同步、不能害畫面閃退、不能害整份存檔讀不出來；好的紙一個字都不能變（指紋不能變）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, fingerprint, fixNote, glyphOf, label, mergeCloud, parseState, readState, stampMods } from '../src/lib/model.ts';

const NOW = new Date(2026, 10, 4, 12, 0).getTime();
const good = (o = {}) => ({ id: 'a', type: 'check', title: '好的', body: '', items: [{ id: 'i1', t: '一', done: false, b: true }], bin: [],
  color: 'yellow', pinned: false, deleted: false, created: 1, updated: 1, b: true, ...o });
const clone = (x) => JSON.parse(JSON.stringify(x));
// 畫面會對紙做的事：名字、磚上的字、每一行的字
const draw = (n) => { label(n); glyphOf(n); n.items.forEach(i => i.t.trim()); n.bin.forEach(i => i.t.trim()); };

test('iCloud 上一張格式不對的紙：整次同步照樣合完，好的那張照收，壞的那張畫得出來', () => {
  const bad = {
    'items 是字串': { items: 'oops' },
    'items 是物件': { items: { 0: 'x' } },
    'items 裡有 null': { items: [null, { id: 'i2', t: '還在', done: false }] },
    'bin 裡有 null': { bin: [null] },
    '名字是數字': { title: 5 },
    '行的字是數字': { items: [{ id: 'z', t: 7, done: false }] },
    '行的 id 是數字': { items: [{ id: 3, t: '三', done: false }] },
    '內文是陣列': { body: ['x'] },
  };
  for (const [what, o] of Object.entries(bad)) {
    const s = emptyState();
    s.notes.push(clone(good()));
    const r = mergeCloud(s, { notes: [clone(good()), { ...good({ id: 'b', title: '壞的' }), ...o }], gone: {} }, NOW);
    assert.ok(r, what);
    const b = s.notes.find(n => n.id === 'b');
    assert.ok(b, `${what}：那張還是收進來（拿不準就留著）`);
    assert.doesNotThrow(() => draw(b), `${what}：畫面不會閃退`);
    assert.ok(s.notes.find(n => n.id === 'a'), `${what}：好的那張照留`);
  }
});

test('壞掉的欄位怎麼修：數字轉成字、不是物件的行丟掉、行的字不見就當空的', () => {
  const n = fixNote({ ...good(), title: 5, items: [null, 'x', { id: 7, t: 8 }, { id: 'k', t: { a: 1 } }], body: null });
  assert.equal(n.title, '5');
  assert.equal(n.body, '');
  assert.deepEqual(n.items.map(i => [i.id, i.t]), [['7', '8'], ['k', '']]);
});

test('格式本來就對的紙：修過之後一個字都沒變，指紋也一樣（不然每張都會被當成改過、重傳一次）', () => {
  const samples = [
    good(),
    good({ items: [{ id: 'x', t: '', done: true, b: false }, { id: 'y', t: '有字', done: false, b: true, at: 5 }] }),
    good({ type: 'text', body: '一段\n兩段', items: [] }),
    good({ glyph: '茄', pinned: true, deleted: true, deletedAt: NOW, bin: [{ id: 'z', t: '刪掉的', done: false, b: true, at: NOW }] }),
  ];
  for (const raw of samples) {
    const once = fixNote(clone(raw));
    const twice = fixNote(clone(once));
    assert.deepEqual(twice, once);
    assert.equal(fingerprint(twice), fingerprint(once));
  }
});

test('存檔裡夾著不是紙的東西（null、字串）：只丟掉那幾個，好的紙照讀', () => {
  const raw = JSON.stringify({ sort: 'updated', notes: [good(), null, 'x', good({ id: 'b', title: '第二張' })], garden: { days: {}, tot: { f: 0, e: 0 } } });
  const s = parseState(raw);
  assert.deepEqual(s.notes.map(n => n.id), ['a', 'b']);
});

test('讀不出來的存檔：readState 回 null（store 據此先另存原本那份），parseState 照舊給空的', () => {
  for (const raw of ['{壞掉', '[]', '{"notes":5}', 'null', '"字串"']) {
    assert.equal(readState(raw), null, raw);
    assert.deepEqual(parseState(raw).notes, []);
  }
  assert.equal(readState(null), null);
  assert.ok(readState(JSON.stringify({ notes: [] })), '空的存檔（一張都沒有）讀得出來，不算壞');
});

test('修過的紙照常對得上指紋（stampMods 不會因為修欄位而把好的紙當成改過）', () => {
  const s = parseState(JSON.stringify({ notes: [good()] }));
  stampMods(s, NOW - 1000);
  const h = s.notes[0].h, mod = s.notes[0].mod;
  const again = parseState(JSON.stringify(s));
  assert.equal(stampMods(again, NOW), 0);
  assert.equal(again.notes[0].h, h);
  assert.equal(again.notes[0].mod, mod);
});

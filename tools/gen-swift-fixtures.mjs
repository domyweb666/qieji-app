// 產生 Swift 版（ios-native/）的對照答案：用 Expo 版的 src/lib/model.ts 跑一批情境，把「輸入＋算出來的結果」寫成
// ios-native/QiejiTests/fixtures.json。Swift 的測試（FixtureTests.swift）拿同樣的輸入算一次，結果要一字不差。
// 用法：node tools/gen-swift-fixtures.mjs（model.ts 的規則有改就重跑一次、連同 Swift 那邊一起改）
// 亂數用固定種子：每次產出來的檔一樣。
import { writeFileSync } from 'node:fs';
import * as M from '../src/lib/model.ts';

/* ---------- 小工具 ---------- */
const clone = (x) => JSON.parse(JSON.stringify(x));
// 照鍵名排好的 JSON（跟 Swift 那邊的 stringify 同一個樣子）
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v) ?? 'null';
}
function rng(seed) {
  let x = seed >>> 0;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const NOW = 1794000000000; // 固定的「現在」
const DAY = 86400000;

const it = (id, t, o = {}) => ({ id, t, done: false, b: true, ...o });
const note = (o) => ({ id: 'x', type: 'check', title: '', body: '', items: [], bin: [], color: 'purple',
  pinned: false, deleted: false, created: 1, updated: 1, b: true, ...o });
const state = (...notes) => ({ ...M.emptyState(), notes });

/* ---------- 一、指紋 ---------- */
const printNotes = [
  note({ id: 'a', items: [it('1', '想法')] }),
  note({ id: 'b', title: '標題 "引號" 與 \\ 反斜線', items: [it('1', '第一行\n第二行\t定位'), it('2', '', { done: true })] }),
  note({ id: 'c', title: '🍆茄子👨‍👩‍👧 emoji ❤️ 🇹🇼', glyph: '🍆', items: [it('1', 'Ünïcödé ñ 中文 日本語 한국어')] }),
  note({ id: 'd', body: '舊的文字筆記\n有兩行', type: 'text', color: 'yellow', pinned: true }),
  note({ id: 'e', deleted: true, deletedAt: NOW - 5 * DAY, bin: [it('z', '刪掉的行', { at: NOW - DAY })] }),
  note({ id: 'f', cover: 'abc123', locked: true, items: [it('1', '上鎖的')] }),
  note({ id: 'g', created: 1730000000123, updated: 1730000999456, mod: 5, h: 'zz', sh: 'yy' }),
  { ...note({ id: 'h' }), future: { nested: [1, 2.5, null, true, 'x'], h: 'inner', deep: { mod: 1, keep: 'y' } }, other: 1e21, tiny: 1.5e-7, neg: -3.25 },
  note({ id: 'i', title: '控制字元 \u0001\u001f\u007f 與   行分隔', items: [it('1', '\b\f\r')] }),
  note({ id: 'j', items: Array.from({ length: 40 }, (_, i) => it(`j-${i}`, `第 ${i} 行`, { done: i % 3 === 0 })) }),
];
const prints = printNotes.map(n => ({ raw: clone(n), print: M.fingerprint(M.fixNote(clone(n))) }));

/* ---------- 二、讀存檔 ---------- */
const bookRaws = [
  JSON.stringify(state(note({ id: 'a', title: '一', items: [it('1', '行')] }), note({ id: 'b', color: 'green', pinned: true }))),
  JSON.stringify({ ...state(note({ id: 'a', updated: 5 }), note({ id: 'a', updated: 9, title: '新的' }), note({ id: 'b' })), sort: 'title' }),
  JSON.stringify({ ...state(note({ id: 'a', color: 'pink' }), note({ id: 'b', color: 'nope', glyph: ' 🇹🇼好 ', cover: 'BAD NAME', locked: 1 })),
    gone: { x: 5, y: 'no', z: -1 }, order: ['a', 'b', 3, '|p', '.h'], orderMod: 7, orderSent: 7, grid: 4,
    folders: [{ id: 'f1', name: '夾', ids: ['a', 9] }, { name: '沒 id' }, 'junk'], later: { keep: true } }),
  JSON.stringify({ notes: [note({ id: 'a', deleted: true, deletedAt: 123 }), note({ id: 'b', deletedAt: 123 }),
    note({ id: 'c', items: [null, 'x', { id: 'ok', t: 5, done: 1 }, { id: 'n', t: null, b: 0, at: 77 }], bin: 'nope' })],
    garden: { days: { '2026-11-01': { f: 1, e: 2, g: 0 } }, tot: { f: 3, e: 4 } } }),
  JSON.stringify({ notes: [note({ id: 'a', type: 'text', body: ' 有字 ' }), note({ id: 'b', items: [it('1', '做完', { done: true }), it('2', '  ')] })] }),
  '{"notes":"不是陣列"}', 'not json', '', '[]', 'null',
];
// 讀完接著對一次座位表（存檔前本來就會做）：資料夾、座位裡格式不對的東西在那一步才清掉
const books = bookRaws.map(raw => { const s = M.readState(raw); if (s) M.fixOrder(s); return { raw, out: s ? canon(s) : null }; });

/* ---------- 三、同步合併 ---------- */
function synced(n) {
  const s = state(note(n));
  M.stampMods(s, NOW - 1000);
  M.markSynced(s.notes[0]);
  return { s, cloud: clone(s.notes[0]) };
}
const mergeCases = [];
function addMerge(name, local, remote, now = NOW) {
  const s = M.parseState(JSON.stringify(local));
  const input = canon(s);
  const r = M.mergeCloud(s, clone(remote), now);
  mergeCases.push({ name, local: input, remote: clone(remote), now, out: canon(s),
    res: { added: r.added, taken: r.taken, united: r.united, removed: r.removed, spare: r.spare, push: r.push, retyped: r.retyped, changed: r.changed } });
}
{
  const base = { id: 'a', title: '清單', items: [it('1', '甲'), it('2', '乙'), it('3', '丙')] };
  let { s, cloud } = synced(base);
  addMerge('兩邊一樣', s, { notes: [cloud] });
  ({ s, cloud } = synced(base)); cloud.items[0].t = '甲改'; cloud.updated = 9; delete cloud.h; cloud.mod = NOW - 10;
  addMerge('只有 iCloud 改', s, { notes: [cloud] });
  ({ s, cloud } = synced(base)); s.notes[0].items.push(it('4', '丁')); s.notes[0].updated = 50;
  addMerge('只有本機改', s, { notes: [cloud] });
  ({ s, cloud } = synced(base)); s.notes[0].items.splice(1, 0, it('L', '本機加的')); cloud.items.push(it('R', '雲端加的')); cloud.items[0].t = '甲雲'; cloud.mod = NOW + 5;
  addMerge('兩邊都改，雲端新', s, { notes: [cloud] });
  ({ s, cloud } = synced(base)); s.notes[0].items.shift(); s.notes[0].bin.push(it('1', '甲', { at: NOW - 3 })); cloud.items.unshift(it('R0', '雲端最上面')); cloud.mod = 5;
  addMerge('兩邊都改，本機新，本機刪掉的行不救回來', s, { notes: [cloud] });
  ({ s, cloud } = synced({ ...base, type: 'text', body: '本來' })); s.notes[0].body = '本機寫'; cloud.body = '雲端寫'; cloud.mod = NOW - 5;
  addMerge('內文不一樣兩段都留', s, { notes: [cloud] });
  ({ s, cloud } = synced(base));
  addMerge('墓碑擋住，本機沒再改', s, { notes: [], gone: { a: NOW } });
  ({ s, cloud } = synced(base)); s.notes[0].items.push(it('9', '離線還在記')); M.stampMods(s, NOW + 50);
  addMerge('墓碑之後還有人改，留著', s, { notes: [], gone: { a: NOW } }, NOW + 100);
  ({ s, cloud } = synced(base));
  addMerge('iCloud 上沒有也沒墓碑，留著', s, { notes: [] });
  addMerge('iCloud 有新的一張', state(), { notes: [note({ id: 'n1', title: '別台的', updated: 77 }), note({ id: 'n2', updated: 5, mod: 9 }), note({ id: 'n1', title: '舊的那份', updated: 3 })] });
  addMerge('墓碑擋住雲端那張', state(), { notes: [note({ id: 'n1', updated: 5 })], gone: { n1: 10 } });
  addMerge('本機沒動過的教學紙，雲端有真的紙', state(M.tutorialNote(NOW - 9)), { notes: [note({ id: 'real', title: '真的', updated: 5 })] });
  addMerge('雲端只有沒動過的教學紙', state(note({ id: 'mine', title: '我的', updated: 4 })), { notes: [M.tutorialNote(NOW - 9)] });
  ({ s, cloud } = synced(base)); s.notes[0].locked = true; cloud.items[1].t = '乙雲'; cloud.mod = NOW - 3; cloud.locked = true;
  addMerge('這台上鎖，雲端改了，鎖留著', s, { notes: [cloud] });
  addMerge('從沒對過、內容不同', state(note({ id: 'a', title: '', items: [it('1', '本機')], updated: 10 })), { notes: [note({ id: 'a', title: '雲端名', items: [it('2', '雲端')], updated: 20 })] });
  addMerge('雲端的檔格式怪', state(note({ id: 'a' })), { notes: [null, 'x', { id: 5 }, note({ id: 'w', items: 'no', title: 9, color: 'pink' })], gone: 'bad' });
}
// 亂數情境：兩台各自亂改同一份，再合
for (let seed = 1; seed <= 40; seed++) {
  const r = rng(seed);
  const s = state(...['a', 'b', 'c'].map((id, k) => note({ id, title: `紙${id}`, color: pick(r, M.CKEYS), updated: 100 + k,
    items: Array.from({ length: 2 + Math.floor(r() * 5) }, (_, i) => it(`${id}${i}`, `${id} 第 ${i} 行`)) })));
  M.stampMods(s, NOW - 5000);
  for (const n of s.notes) n.sh = n.h;
  const cloud = clone(s.notes).map(({ sh, ...n }) => n);
  const mutate = (list, who, t) => {
    for (let k = 0; k < 3; k++) {
      const n = pick(r, list); if (!n) continue;
      const act = Math.floor(r() * 7);
      if (act === 0) n.items.push(it(`${who}${seed}${k}`, `${who} 加的 ${k}`));
      else if (act === 1 && n.items.length) n.items[Math.floor(r() * n.items.length)].t += who;
      else if (act === 2 && n.items.length) n.items[Math.floor(r() * n.items.length)].done = true;
      else if (act === 3 && n.items.length) M.binItem(n, n.items[Math.floor(r() * n.items.length)].id, t);
      else if (act === 4) n.title += who;
      else if (act === 5 && n.items.length > 1) n.items.reverse();
      else if (act === 6) n.color = pick(r, M.CKEYS);
      n.updated = t;
    }
  };
  mutate(s.notes, 'L', NOW - 100);
  mutate(cloud, 'R', NOW - 200 + Math.floor(r() * 300));
  for (const n of cloud) { n.h = M.fingerprint(n); n.mod = n.updated; }
  const gone = {};
  if (r() < 0.3) { const dead = pick(r, cloud); gone[dead.id] = NOW - 150; if (r() < 0.5) cloud.splice(cloud.indexOf(dead), 1); }
  if (r() < 0.3) cloud.push(note({ id: `new${seed}`, title: '別台新開的', updated: NOW - 50 }));
  addMerge(`亂數 ${seed}`, s, { notes: cloud, gone });
}

/* ---------- 四、目錄座位表：一連串動作，每一步的結果 ---------- */
// 空位的 id 有亂數（newHole）：不是「.紙的 id」的空位一律寫成「.?」再比
function seatView(s) {
  const ids = new Set(s.notes.map(n => n.id));
  const norm = id => (M.isHole(id) && !ids.has(id.slice(1)) ? '.?' : id);
  return canon({ order: (s.order ?? null) && s.order.map(norm), folders: s.folders ?? null, grid: s.grid ?? null,
    hasMod: s.orderMod !== undefined, layout: M.seatedLayout(s).map(e => norm(e.id) + (e.brk ? 'B' : e.hole ? 'H' : e.folder ? 'F' + e.notes.map(n => n.id).join('+') : '')) });
}
// 亂數的空位 id 每一步做完改成固定的名字（.H1、.H2…，照座位表裡出現的先後）：Swift 那邊照同一個規則改，兩邊才對得起來
const KNOWN_HOLE = /^\.(H\d+|h\d*|n\d+|add\d+_\d+)$/;
function tameHoles(s, box) {
  if (!Array.isArray(s.order)) return;
  s.order = s.order.map(id => (M.isHole(id) && !KNOWN_HOLE.test(id) ? `.H${++box.n}` : id));
}
const seatCases = [];
for (let seed = 1; seed <= 60; seed++) {
  const r = rng(seed * 7919);
  const count = 4 + Math.floor(r() * 6);
  const s = state(...Array.from({ length: count }, (_, k) => note({ id: `n${k}`, title: `紙 ${k}`, updated: 1000 - k * 3 + Math.floor(r() * 5),
    created: k, pinned: r() < 0.2, deleted: r() < 0.15, color: pick(r, M.CKEYS) })));
  if (seed % 3 === 0) s.sort = pick(r, ['updated', 'created', 'title', 'color']);
  if (seed % 4 === 0) { s.order = s.notes.map(n => n.id).reverse(); s.order.splice(2, 0, '|p1', '.h1'); s.order.push('ghost', '|p2'); }
  const start = canon(s);
  const steps = [];
  let now = NOW;
  let folderSeq = 0;
  const box = { n: 0 };
  const live = () => s.notes.filter(n => !n.deleted).map(n => n.id);
  const anyId = () => pick(r, s.notes).id;
  for (let k = 0; k < 14; k++) {
    now += 10;
    const kind = pick(r, ['fixOrder', 'reseat', 'newFolder', 'intoFolder', 'outOfFolder', 'leaveHole', 'fillHole', 'seatNew', 'seatFirstHole',
      'packGrid', 'placeInFolder', 'placeTop', 'trash', 'restore', 'drop', 'renameFolder', 'addNote', 'breakIn']);
    const op = { kind, now };
    let ret = null;
    if (kind === 'fixOrder') ret = M.fixOrder(s);
    else if (kind === 'reseat') {
      const vis = M.seatedLayout(s).map(e => e.id);
      for (let i = vis.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [vis[i], vis[j]] = [vis[j], vis[i]]; }
      op.visible = vis; M.reseat(s, vis, now);
    } else if (kind === 'newFolder') { op.note = anyId(); op.id = `f${++folderSeq}`; M.newFolder(s, op.note, now, op.id); }
    else if (kind === 'intoFolder') {
      const f = pick(r, s.folders ?? []); if (!f) continue;
      op.note = anyId(); op.folder = f.id; op.leave = r() < 0.5; ret = M.intoFolder(s, op.note, op.folder, now, op.leave);
    } else if (kind === 'outOfFolder') {
      op.note = anyId();
      const lay = M.seatedLayout(s);
      const hole = lay.find(e => e.hole);
      if (hole && r() < 0.4) op.hole = hole.id; else if (lay.length && r() < 0.4) op.after = pick(r, lay).id;
      ret = M.outOfFolder(s, op.note, now, { hole: op.hole, after: op.after });
    } else if (kind === 'leaveHole') { op.note = anyId(); ret = M.leaveHole(s, op.note, now); }
    else if (kind === 'fillHole') { op.note = anyId(); ret = M.fillHole(s, op.note, now); }
    else if (kind === 'seatNew') {
      op.note = anyId();
      const lay = M.seatedLayout(s);
      const hole = lay.find(e => e.hole);
      if (hole && r() < 0.5) op.hole = hole.id; else if (lay.length) op.after = pick(r, lay).id;
      ret = M.seatNew(s, op.note, now, { hole: op.hole, after: op.after });
    } else if (kind === 'seatFirstHole') { op.note = anyId(); ret = M.seatFirstHole(s, op.note, now); }
    else if (kind === 'packGrid') ret = M.packGrid(s, now);
    else if (kind === 'placeInFolder') {
      const f = pick(r, s.folders ?? []); if (!f) continue;
      op.note = pick(r, live()) ?? anyId(); op.folder = f.id;
      const inner = f.ids.filter(id => s.notes.some(n => n.id === id && !n.deleted) && id !== op.note);
      inner.splice(Math.floor(r() * (inner.length + 1)), 0, op.note);
      op.visible = inner; ret = M.placeInFolder(s, op.note, op.folder, inner, now);
    } else if (kind === 'placeTop') {
      op.note = pick(r, live()); if (!op.note) continue;
      M.fixOrder(s);
      const vis = M.seatedLayout(s).map(e => e.id).filter(id => id !== op.note);
      vis.splice(Math.floor(r() * (vis.length + 1)), 0, op.note);
      op.visible = vis; op.pre = true; M.placeTop(s, op.note, vis, now);
    } else if (kind === 'trash') { op.note = anyId(); const n = s.notes.find(x => x.id === op.note); M.leaveHole(s, op.note, now); M.markDeleted(n, now); }
    else if (kind === 'restore') { op.note = anyId(); const n = s.notes.find(x => x.id === op.note); M.markRestored(n); M.fillHole(s, op.note, now); }
    else if (kind === 'drop') { if (s.notes.length < 3) continue; op.note = anyId(); M.dropNotes(s, n => n.id === op.note, now); M.fixOrder(s); }
    else if (kind === 'renameFolder') { const f = pick(r, s.folders ?? []); if (!f) continue; op.folder = f.id; op.name = pick(r, ['', '  ', f.name, '改名了']); ret = M.renameFolder(s, f.id, op.name, now); }
    else if (kind === 'addNote') { op.note = `add${seed}_${k}`; s.notes.push(note({ id: op.note, title: '新的', updated: now, created: now })); M.fixOrder(s); }
    else if (kind === 'breakIn') { M.fixOrder(s); op.at = Math.floor(r() * (s.order.length + 1)); op.mark = pick(r, ['|b', '.h']) + k; s.order.splice(op.at, 0, op.mark); M.fixOrder(s); }
    tameHoles(s, box);
    steps.push({ op, ret, view: seatView(s) });
  }
  seatCases.push({ start, steps });
}

/* ---------- 五、排列同步 ---------- */
const layoutCases = [];
{
  const mk = () => { const s = state(note({ id: 'a', title: '甲' }), note({ id: 'b', title: '乙' }), note({ id: 'c', title: '丙' })); M.fixOrder(s); return s; };
  const run = (name, prep, raw) => {
    const s = mk(); prep(s);
    const input = canon(s);
    const changed = M.mergeLayout(s, raw === undefined ? undefined : raw === 'UNREADABLE' ? null : clone(raw));
    layoutCases.push({ name, local: input, fetch: raw === undefined ? 'missing' : raw === 'UNREADABLE' ? 'unreadable' : 'found', raw: raw === undefined || raw === 'UNREADABLE' ? null : raw,
      changed, out: canon({ order: s.order, folders: s.folders ?? null, orderMod: s.orderMod ?? null, orderSent: s.orderSent ?? null }) });
  };
  run('iCloud 沒有，這台沒排過', () => {}, undefined);
  run('iCloud 沒有，這台排過也傳過', s => { s.orderMod = 5; s.orderSent = 5; }, undefined);
  run('讀不到', s => { s.orderMod = 5; s.orderSent = 5; }, 'UNREADABLE');
  run('iCloud 比較新', s => { s.orderMod = 5; }, { order: ['c', 'zzz', 'a'], mod: 9, folders: [{ id: 'f1', name: '夾', ids: ['b', 'nope'] }] });
  run('這台比較新還沒傳', s => { s.orderMod = 50; }, { order: ['c', 'b', 'a'], mod: 9 });
  run('這台比較新、以為傳過', s => { s.orderMod = 50; s.orderSent = 50; }, { order: ['c', 'b', 'a'], mod: 9 });
  run('一樣新', s => { s.orderMod = 9; s.orderSent = 9; }, { order: ['b', 'a', 'c'], mod: 9, folders: [] });
  run('格式壞掉', s => { s.orderMod = 3; s.orderSent = 3; }, { order: 'no', mod: 9 });
  run('mod 是負的', s => {}, { order: ['c'], mod: -1 });
  run('這台沒排過，照 iCloud', s => {}, { order: ['|x', 'c', '.h', 'b', '|y', 'a', '|z'], mod: 0, folders: [{ id: 'f', ids: [] }, { id: 'g', name: 5, ids: ['a'] }] });
}

/* ---------- 六、最近刪除、行、字 ---------- */
const expired = [[NOW - 30 * DAY, NOW], [NOW - 30 * DAY + 1, NOW], [NOW + 1, NOW], [0, NOW], [-5, NOW], [null, NOW], [NOW - 40 * DAY, 0], [NOW - 400 * DAY, NOW], [1, NaN]]
  .map(([at, now]) => ({ at, now: Number.isNaN(now) ? null : now, out: M.isExpiredAt(at, now) }));
const lineCases = [];
for (let seed = 1; seed <= 40; seed++) {
  const r = rng(seed * 104729);
  const n = note({ id: 'p', items: Array.from({ length: 3 + Math.floor(r() * 6) }, (_, i) => it(`i${i}`, `行 ${i}`, { done: r() < 0.4 })) });
  const start = canon(n);
  const steps = [];
  let before = null, ids = null, now = NOW;
  for (let k = 0; k < 10; k++) {
    now += 5;
    const kind = pick(r, ['bin', 'unbin', 'binDone', 'unbinDone', 'toggle', 'add', 'purge']);
    const op = { kind, now };
    let ret = null;
    if (kind === 'bin') { if (!n.items.length) continue; op.id = pick(r, n.items).id; ret = !!M.binItem(n, op.id, now); }
    else if (kind === 'unbin') { if (!n.bin.length) continue; op.id = pick(r, n.bin).id; op.at = Math.floor(r() * 12) - 2; ret = !!M.unbinItem(n, op.id, op.at); }
    else if (kind === 'binDone') { before = clone(n.items); const gone = M.binDone(n, now); ids = gone.map(i => i.id); op.remember = true; ret = gone.length; }
    else if (kind === 'unbinDone') { if (!before) continue; ret = M.unbinDone(n, clone(before), new Set(ids)); }
    else if (kind === 'toggle') { if (!n.items.length) continue; op.id = pick(r, n.items).id; const x = n.items.find(i => i.id === op.id); x.done = !x.done; }
    else if (kind === 'add') { op.id = `add${k}`; n.items.unshift(it(op.id, `新 ${k}`)); }
    else if (kind === 'purge') { op.now = now + pick(r, [0, 31 * DAY]); ret = M.purgeExpiredBin([n], op.now); }
    steps.push({ op, ret, view: canon({ items: n.items, bin: n.bin }) });
  }
  lineCases.push({ start, steps });
}
const glyphs = ['', ' ', '茄', '茄子', '🍆', '👨‍👩‍👧', '🇹🇼🇯🇵', '❤️好', '👍🏽', 'é', '1️⃣2', 'áb', '  兩邊空白  ']
  .map(t => ({ t, parts: M.graphemes(t), problem: M.glyphProblem(t) }));
const pasted = ['- 一\n• 二\n3. 三\n\n  4) 四  \n5、五\n☐ 六\r\n✓ 七', '沒有符號', '', '\n\n', '10.十\n-連著', '- [ ] 牛奶\n* [x] 蛋\n- [x](a)\n[ ] 米']
  .map(t => ({ t, out: M.splitPasted(t) }));
const labels = [note({ id: 'a' }), note({ id: 'b', title: ' 有名字 ' }), note({ id: 'c', items: [it('1', '  '), it('2', '這是一行很長很長很長的字')] }),
  note({ id: 'd', type: 'text', body: '\n第二行才有字' }), note({ id: 'e', glyph: '菜', title: '買菜' }), note({ id: 'f', title: '🍆茄記', items: [it('1', '一', { done: true }), it('2', '二')] })]
  .map(n => ({ raw: n, label: M.label(n), glyph: M.glyphOf(n), pick: M.pickLabel(n), empty: M.isEmpty(n), plain: M.plain(n) }));

const out = { prints, books, merges: mergeCases, seats: seatCases, layouts: layoutCases, expired, lines: lineCases, glyphs, pasted, labels };
writeFileSync(new URL('../ios-native/QiejiTests/fixtures.json', import.meta.url), JSON.stringify(out));
console.log(`fixtures：指紋 ${prints.length}、存檔 ${books.length}、合併 ${mergeCases.length}、座位 ${seatCases.length}（共 ${seatCases.reduce((a, c) => a + c.steps.length, 0)} 步）、排列 ${layoutCases.length}、行 ${lineCases.length}`);

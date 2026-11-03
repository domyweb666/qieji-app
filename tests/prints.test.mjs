// 指紋不重算（2026-11-04 效能）：stampMods、mergeRemote 改成內容沒變就沿用上次的指紋。
// 這裡釘死「結果跟每次都從頭算一模一樣」：同一串改動，用沒有快取的算法（照抄改之前的程式）對一份、用新的對一份，每一步都要一樣。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, fingerprint, mergeRemote, stampMods } from '../src/lib/model.ts';

const NOW = new Date(2026, 10, 4, 12, 0).getTime();
const clone = (x) => JSON.parse(JSON.stringify(x));
const note = (id, lines, o = {}) => ({ id, type: 'check', title: id, body: '', bin: [], color: 'yellow', pinned: false, deleted: false,
  created: 1, updated: 1, b: true, items: Array.from({ length: lines }, (_, i) => ({ id: `${id}-${i}`, t: `第 ${i} 行`, done: false, b: true })), ...o });

// 改之前的 stampMods（每張都從頭算）
function stampOld(s, now) {
  let changed = 0;
  for (const n of s.notes) {
    const f = fingerprint(n);
    if (n.h === f) continue;
    n.mod = n.h === undefined ? (typeof n.mod === 'number' && Number.isFinite(n.mod) && n.mod > 0 ? n.mod : n.updated || now) : now;
    n.h = f;
    changed++;
  }
  return changed;
}

test('存檔前對指紋：一連串改字、劃掉、刪行、換色、記過再改回來，每一步都跟從頭算的一樣', () => {
  const a = emptyState();
  a.notes.push(note('p', 30), note('q', 5), note('r', 0));
  const b = clone(a);
  const steps = [
    s => { s.notes[0].items[3].t = '改了字'; },
    s => { s.notes[0].items[4].done = true; },
    () => {},                                              // 什麼都沒改
    s => { s.notes[1].bin.unshift({ ...s.notes[1].items.shift(), at: 5 }); },
    s => { s.notes[2].color = 'purple'; },
    s => { s.notes[0].items[3].t = '第 3 行'; },           // 改回原本的字：指紋回到原本，但這是一次改動（mod 會更新，跟以前一樣）
    s => { s.notes[1].sh = s.notes[1].h; },                // 只改 sh（傳上去了）：不算改內容
    s => { delete s.notes[0].h; },                         // 指紋被拿掉（升級前的存檔）
    s => { s.notes.push(note('new', 2)); },
    s => { s.notes[0].items.reverse(); },
  ];
  steps.forEach((step, i) => {
    step(a); step(b);
    const t = NOW + i * 1000;
    assert.equal(stampMods(a, t), stampOld(b, t), `第 ${i} 步變了幾張`);
    assert.deepEqual(a, b, `第 ${i} 步每張紙的 h、mod`);
    // 再對一次（中間沒改）：什麼都不變
    assert.equal(stampMods(a, t + 1), 0);
    assert.deepEqual(a, b);
  });
});

test('拉 iCloud：同一份檔案連拉幾次、中間 iCloud 那份被別台改過，合出來的結果都跟每次從頭算一樣', async () => {
  // 另外載一份 model（網址加參數＝新的一份程式，快取是空的），每一步都用全新的那份當對照組
  const fresh = async (k) => import(`../src/lib/model.ts?fresh=${k}`);
  const local = emptyState();
  local.notes.push(note('p', 20), note('q', 3));
  stampMods(local, NOW - 5000);
  for (const n of local.notes) n.sh = n.h;
  const remote0 = clone(local.notes).map(({ sh: _sh, ...n }) => n);
  const pulls = [
    remote0,                                                  // 兩邊一樣
    remote0,                                                  // 再拉一次一樣的（這次會用到快取）
    (() => { const r = clone(remote0); r[0].items[2].t = '別台改的'; r[0].mod = NOW; return r; })(), // 別台改了一張
    (() => { const r = clone(remote0); r[0].items[2].t = '別台改的'; r[0].mod = NOW; return r; })(), // 同一份再拉一次
    [...clone(remote0), note('z', 4, { mod: NOW })],          // 別台多一張
  ];
  let k = 0;
  const warm = clone(local);
  for (const r of pulls) {
    const ref = (await fresh(k++)).mergeRemote;
    const cold = clone(warm);
    const a = mergeRemote(warm, { notes: clone(r), gone: {} }, NOW + k);
    const b = ref(cold, { notes: clone(r), gone: {} }, NOW + k);
    assert.deepEqual(a, b, `第 ${k} 次拉的結果`);
    assert.deepEqual(warm, cold, `第 ${k} 次拉完本機的紙`);
  }
});

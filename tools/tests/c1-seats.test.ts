// C1 座位表的純函式測試：舊存檔轉換、改字不換位、新紙排最後、刪除還原回原位、永久拿掉清座位、搜尋照座位
// @ts-expect-error node 直接跑 TS 檔要帶 .ts 副檔名（跑法：node tools/tests/c1-seats.test.ts）
import { fixOrder, parseState, reseat, seatedNotes, visibleNotes } from '../../src/lib/model.ts';

let fail = 0;
const eq = (name: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n   got ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`}`);
};
const note = (id: string, updated: number, extra: Record<string, unknown> = {}) => ({
  id, type: 'check', title: id.toUpperCase(), body: '', items: [{ id: id + 'i', t: 'line ' + id, done: false, b: false }], bin: [],
  color: 'yellow', pinned: false, deleted: false, created: updated, updated, b: false, ...extra,
});

// 舊存檔：沒有 order；a 最新、b、c（釘選、比較舊）、d（最近刪除）、e（釘選）
const raw = JSON.stringify({ sort: 'updated', garden: { days: {}, tot: { f: 0, e: 0 } }, gone: {}, notes: [
  note('a', 500), note('b', 400), note('c', 100, { pinned: true }), note('d', 450, { deleted: true, deletedAt: 450 }), note('e', 300, { pinned: true }),
] });
const s = parseState(raw);
const ids = (ns: { id: string }[]) => ns.map(n => n.id);
const before = ids(visibleNotes(s, { trash: false, filter: 'all', q: '', sort: s.sort }));

eq('轉換前：座位表還沒寫，目錄跟 C1 之前一樣（釘選在前）', ids(seatedNotes(s, '')), before);
eq('C1 之前的樣子', before, ['e', 'c', 'a', 'b']);
eq('第一次 fixOrder 有改', fixOrder(s), true);
eq('座位表＝舊目錄順序＋最近刪除的接在後面', s.order, ['e', 'c', 'a', 'b', 'd']);
eq('舊欄位 sort 還在', s.sort, 'updated');
eq('轉換後目錄順序沒變', ids(seatedNotes(s, '')), before);
eq('再 fixOrder 不改', fixOrder(s), false);

// 存檔再讀回來（關掉再開）
const s2 = parseState(JSON.stringify(s));
eq('存檔讀回來座位表還在', s2.order, ['e', 'c', 'a', 'b', 'd']);

// 改了後面那張（b）的字：不換位
s2.notes.find(n => n.id === 'b')!.updated = 9999;
eq('改字不跳位', ids(seatedNotes(s2, '')), ['e', 'c', 'a', 'b']);

// 釘選／取消釘選：不換位
s2.notes.find(n => n.id === 'a')!.pinned = true;
s2.notes.find(n => n.id === 'e')!.pinned = false;
eq('釘選或取消不換位', ids(seatedNotes(s2, '')), ['e', 'c', 'a', 'b']);

// 新的一張：還沒存檔前就排最後；存檔時補進座位表最後
s2.notes.push(note('f', 10) as never);
eq('新的一張存檔前就排最後', ids(seatedNotes(s2, '')), ['e', 'c', 'a', 'b', 'f']);
fixOrder(s2);
eq('新的一張補在座位表最後', s2.order, ['e', 'c', 'a', 'b', 'd', 'f']);

// 空白新紙換走被拿掉：座位丟掉，不留空格
s2.notes = s2.notes.filter(n => n.id !== 'f');
fixOrder(s2);
eq('永久拿掉的紙座位丟掉', s2.order, ['e', 'c', 'a', 'b', 'd']);

// 刪掉 c 再還原：回原位
const c = s2.notes.find(n => n.id === 'c')!;
c.deleted = true;
eq('刪掉後目錄看不到', ids(seatedNotes(s2, '')), ['e', 'a', 'b']);
fixOrder(s2);
c.deleted = false;
eq('還原回原位', ids(seatedNotes(s2, '')), ['e', 'c', 'a', 'b']);

// 搜尋照座位
eq('搜尋照座位排', ids(seatedNotes(s2, 'LINE')), ['e', 'c', 'a', 'b']);
eq('搜尋只留對到的', ids(seatedNotes(s2, 'line b')), ['b']);

// 座位表壞掉：重複、不存在的 id、非字串
s2.order = ['a', 'a', 'zzz', 7 as never, 'b'];
fixOrder(s2);
eq('壞掉的座位表：重複留第一個、不存在的丟掉、缺的補最後（最近改過在前）', s2.order, ['a', 'b', 'd', 'e', 'c']);

// 別台同步來的兩張：補在最後，最近改過的在前
s2.notes.push(note('g', 50) as never, note('h', 60) as never);
fixOrder(s2);
eq('這台沒見過的紙補最後', s2.order.slice(-2), ['h', 'g']);

// 第一次安裝（沒有舊存檔）
const fresh = parseState(null);
fresh.notes.push(note('t', 1) as never);
fixOrder(fresh);
eq('第一次安裝：教學紙有座位', fresh.order, ['t']);

// C4 拖完換座位：看得到的照新順序，最近刪除的座位留在原位
const r = parseState(JSON.stringify({ sort: 'updated', garden: { days: {}, tot: { f: 0, e: 0 } }, gone: {}, notes: [
  note('a', 5), note('b', 4), note('x', 9, { deleted: true }), note('c', 3), note('d', 2),
], order: ['a', 'b', 'x', 'c', 'd'] }));
reseat(r, ['c', 'a', 'b', 'd']);
eq('拖完換座位：看得到的照新順序', ids(seatedNotes(r, '')), ['c', 'a', 'b', 'd']);
eq('拖完換座位：最近刪除那張座位不動', r.order, ['c', 'a', 'x', 'b', 'd']);
// 還沒存檔的新紙也能拖（reseat 先補座位）
r.notes.push(note('n', 1) as never);
reseat(r, ['n', 'c', 'a', 'b', 'd']);
eq('新紙拖到最前', ids(seatedNotes(r, '')), ['n', 'c', 'a', 'b', 'd']);

console.log(fail ? `\n${fail} FAIL` : '\nALL PASS');
process.exit(fail ? 1 : 0);

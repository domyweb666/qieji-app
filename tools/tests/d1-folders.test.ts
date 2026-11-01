// D1 資料夾的純函式測試：放進、移出、改名、刪除還原、空了消失、搜尋、存檔讀回、跟著 layout.json 同步（跑法：node tools/tests/d1-folders.test.ts）
// @ts-expect-error node 直接跑 TS 檔要帶 .ts 副檔名
import { dropNotes, fixOrder, folderOf, intoFolder, layoutToSend, mergeLayout, newFolder, outOfFolder, parseState, renameFolder, reseat, seatedEntries, seatedNotes } from '../../src/lib/model.ts';

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
const saved = (notes: unknown[], order: string[], extra: Record<string, unknown> = {}) =>
  parseState(JSON.stringify({ sort: 'updated', garden: { days: {}, tot: { f: 0, e: 0 } }, gone: {}, notes, order, orderMod: 0, orderSent: 0, ...extra }));
// 目錄最上層看到的樣子：紙寫 id，資料夾寫 名字[裡面的紙]
const top = (s: Parameters<typeof seatedEntries>[0]) => seatedEntries(s).map(e => (e.folder ? `${e.folder.name}[${e.notes.map(n => n.id).join(',')}]` : e.id));
const ids = (ns: { id: string }[]) => ns.map(n => n.id);

const s = saved([note('a', 500), note('b', 400), note('c', 300), note('d', 200)], ['a', 'b', 'c', 'd']);

// 新資料夾：在那張紙的位置
const f = newFolder(s, 'b', 1000, 'F1');
eq('新資料夾站在那張紙的位置、名字「新資料夾」', top(s), ['a', '新資料夾[b]', 'c', 'd']);
eq('建資料夾算親手排（要傳）', layoutToSend(s)?.mod, 1000);

// 放進現有的：排在裡面最後
eq('放進現有的資料夾', intoFolder(s, 'd', 'F1', 1100), true);
intoFolder(s, 'a', 'F1', 1200);
eq('紙從目錄消失、排在資料夾裡最後', top(s), ['新資料夾[b,d,a]', 'c']);
eq('同一張再放一次不改', intoFolder(s, 'a', 'F1', 1300), false);
eq('找得到紙在哪個資料夾', folderOf(s, 'd')?.id, 'F1');

// 改名
eq('改名', [renameFolder(s, 'F1', '工作', 1400), f.name], [true, '工作']);
eq('清空名字不改（維持原名）', [renameFolder(s, 'F1', '   ', 1500), s.folders![0].name], [false, '工作']);

// 搜尋：直接列出資料夾裡的紙，照資料夾的位置
eq('搜尋找得到資料夾裡的紙', ids(seatedNotes(s, 'line')), ['b', 'd', 'a', 'c']);

// 新的一張排在目錄最後面，不會跑進資料夾
s.notes.push(note('n', 2000) as never);
fixOrder(s);
eq('新的一張排最後、不進資料夾', top(s), ['工作[b,d,a]', 'c', 'n']);

// 資料夾磚也能拖換位置（跟紙磚同一套 reseat）
reseat(s, ['c', 'F1', 'n'], 2100);
eq('資料夾磚拖換位置', top(s), ['c', '工作[b,d,a]', 'n']);

// 刪掉資料夾裡的紙 → 看不到；還原 → 回到資料夾原位
s.notes.find(n => n.id === 'd')!.deleted = true;
eq('資料夾裡刪掉一張', top(s), ['c', '工作[b,a]', 'n']);
s.notes.find(n => n.id === 'd')!.deleted = false;
eq('還原回到資料夾原位', top(s), ['c', '工作[b,d,a]', 'n']);

// 全部在最近刪除 → 看不到資料夾；還原一張就回來
for (const id of ['b', 'd', 'a']) s.notes.find(n => n.id === id)!.deleted = true;
eq('全在最近刪除就看不到資料夾', top(s), ['c', 'n']);
s.notes.find(n => n.id === 'a')!.deleted = false;
eq('還原一張資料夾就回來', top(s), ['c', '工作[a]', 'n']);
for (const id of ['b', 'd']) s.notes.find(n => n.id === id)!.deleted = false;

// 存檔讀回來（關掉再開）
const s2 = parseState(JSON.stringify(s));
eq('關掉再開資料夾還在', top(s2), ['c', '工作[b,d,a]', 'n']);

// 移出：排在資料夾後面一格
eq('移出資料夾', outOfFolder(s2, 'd', 3000), true);
eq('移出的排在資料夾後面一格', top(s2), ['c', '工作[b,a]', 'd', 'n']);
eq('不在資料夾的移出不改', outOfFolder(s2, 'c', 3100), false);

// 移出到只剩一張 → 資料夾拆掉、剩的那張站在資料夾原位（照 iOS，多米 2026-11-02 看錄影選）
outOfFolder(s2, 'b', 3200);
eq('只剩一張就拆掉，剩的站原位、拿出來的排後面', [top(s2), s2.folders], [['c', 'a', 'b', 'd', 'n'], []]);
eq('拆掉後那張不在資料夾', outOfFolder(s2, 'a', 3300), false);

// 只剩一張看得到、另一張在最近刪除 → 一樣拆掉，最近刪除那張也站在那裡（還原回到附近）
{
  const t = saved([note('a', 500), note('b', 400), note('c', 300), note('d', 200)], ['a', 'b', 'c', 'd']);
  newFolder(t, 'a', 1000, 'F');
  intoFolder(t, 'b', 'F', 1001);
  intoFolder(t, 'c', 'F', 1002);
  t.notes.find(n => n.id === 'b')!.deleted = true;
  outOfFolder(t, 'c', 1100);
  eq('看得到的剩一張就拆', [top(t), t.folders, t.order], [['a', 'c', 'd'], [], ['a', 'b', 'c', 'd']]);
}
// 看得到的一張都不剩、只剩最近刪除的 → 不拆（還原時回到資料夾）
{
  const t = saved([note('a', 500), note('b', 400), note('c', 300)], ['a', 'b', 'c']);
  newFolder(t, 'a', 1000, 'F');
  intoFolder(t, 'b', 'F', 1001);
  t.notes.find(n => n.id === 'b')!.deleted = true;
  outOfFolder(t, 'a', 1100);
  eq('只剩最近刪除的不拆', t.folders?.map(f => f.ids), [['b']]);
}
// 從資料夾放進別的資料夾、原本的只剩一張 → 原本的拆掉
{
  const t = saved([note('a', 500), note('b', 400), note('c', 300), note('d', 200)], ['a', 'b', 'c', 'd']);
  newFolder(t, 'a', 1000, 'F');
  intoFolder(t, 'b', 'F', 1001);
  newFolder(t, 'c', 1002, 'G');
  intoFolder(t, 'b', 'G', 1100);
  eq('原本的只剩一張就拆', top(t), ['a', '新資料夾[c,b]', 'd']);
}

// 永久拿掉資料夾裡的紙：從資料夾拿掉；拿光了資料夾不見
const s3 = saved([note('a', 500), note('b', 400), note('c', 300)], ['a', 'b', 'c']);
newFolder(s3, 'a', 1000, 'F');
intoFolder(s3, 'b', 'F', 1100);
dropNotes(s3, n => n.id === 'a', 1200);
fixOrder(s3);
eq('永久拿掉的從資料夾拿掉', top(s3), ['新資料夾[b]', 'c']);
dropNotes(s3, n => n.id === 'b', 1300);
fixOrder(s3);
eq('拿光了資料夾不見', [top(s3), s3.folders, s3.order], [['c'], [], ['c']]);

// 資料夾資料壞掉：紙照樣出現在目錄
const bad = saved([note('a', 500), note('b', 400)], ['a', 'X', 'b'], { folders: [{ id: 'X', name: 3, ids: 'nope' }, null, { id: 'Y', ids: ['a', 'zz'] }, { id: 'Z', name: '重複', ids: ['a', 'b'] }] });
fixOrder(bad);
eq('壞掉的資料夾丟掉、名字壞了用預設、同一張只在一個資料夾', [top(bad), bad.folders], [['新資料夾[a]', '重複[b]'], [{ id: 'Y', name: '新資料夾', ids: ['a'] }, { id: 'Z', name: '重複', ids: ['b'] }]]);
const noArr = saved([note('a', 500)], ['a'], { folders: 'oops' });
eq('folders 不是陣列：紙照樣在', [fixOrder(noArr), top(noArr)], [true, ['a']]);

// 跟著 layout.json：傳上去帶資料夾；重裝那台照 iCloud 那份連資料夾一起回來
const up = saved([note('a', 500), note('b', 400), note('c', 300)], ['a', 'b', 'c']);
newFolder(up, 'b', 5000, 'FX');
intoFolder(up, 'c', 'FX', 5100);
renameFolder(up, 'FX', '家裡', 5200);
const lay = layoutToSend(up)!;
eq('傳上去的 layout.json 帶資料夾', [lay.order, lay.folders], [['a', 'FX'], [{ id: 'FX', name: '家裡', ids: ['b', 'c'] }]]);
const fresh = saved([note('a', 500), note('b', 400), note('c', 300)], ['a', 'b', 'c'], { orderMod: undefined, orderSent: undefined });
delete fresh.orderMod; delete fresh.orderSent;
eq('重裝那台合排列：目錄有變', mergeLayout(fresh, JSON.parse(JSON.stringify(lay))), true);
eq('資料夾、名字、裡面的順序都回來', top(fresh), ['a', '家裡[b,c]']);
eq('照抄來的不傳回去', layoutToSend(fresh), null);
// 另一台改了資料夾名、這台沒動：照 iCloud 那份
mergeLayout(fresh, { ...JSON.parse(JSON.stringify(lay)), mod: 6000, folders: [{ id: 'FX', name: '家', ids: ['c', 'b'] }] });
eq('另一台後改的資料夾照它', top(fresh), ['a', '家[c,b]']);
// C2 格式（沒有 folders）的 layout.json 也讀得進來
mergeLayout(fresh, { order: ['c', 'b', 'a'], mod: 7000 });
eq('舊格式的 layout.json：沒有資料夾', top(fresh), ['c', 'b', 'a']);

console.log(fail ? `\n${fail} 條沒過` : '\n全部通過');
if (fail) process.exit(1);

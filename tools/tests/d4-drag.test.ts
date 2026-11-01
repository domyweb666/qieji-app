// D4 拖曳照 iOS 的資料規則：放進資料夾指定位置、資料夾裡換順序、從資料夾拿出來放到目錄指定位置（跑法：node tools/tests/d4-drag.test.ts）
// @ts-expect-error node 直接跑 TS 檔要帶 .ts 副檔名
import { fixOrder, intoFolder, layoutToSend, newFolder, parseState, placeInFolder, placeTop, seatedEntries } from '../../src/lib/model.ts';

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
const saved = (notes: unknown[], order: string[]) =>
  parseState(JSON.stringify({ sort: 'updated', garden: { days: {}, tot: { f: 0, e: 0 } }, gone: {}, notes, order, orderMod: 0, orderSent: 0 }));
const top = (s: Parameters<typeof seatedEntries>[0]) => seatedEntries(s).map(e => (e.folder ? `${e.folder.name}[${e.notes.map(n => n.id).join(',')}]` : e.id));
const ids5 = () => [note('a', 500), note('b', 400), note('c', 300), note('d', 200), note('e', 100)];

// 從目錄拖進資料夾、放在指定位置
{
  const s = saved(ids5(), ['a', 'b', 'c', 'd', 'e']);
  newFolder(s, 'b', 1000, 'F');
  intoFolder(s, 'c', 'F', 1001);
  eq('起點', top(s), ['a', '新資料夾[b,c]', 'd', 'e']);
  eq('拖 e 放進資料夾第一格', placeInFolder(s, 'e', 'F', ['e', 'b', 'c'], 2000), true);
  eq('e 在資料夾第一格、目錄少一格', top(s), ['a', '新資料夾[e,b,c]', 'd']);
  eq('算親手排（要傳）', (layoutToSend(s)?.mod ?? 0) >= 2000, true);
  eq('拖 a 放進資料夾中間', placeInFolder(s, 'a', 'F', ['e', 'a', 'b', 'c'], 2100), true);
  eq('a 在中間', top(s), ['新資料夾[e,a,b,c]', 'd']);
}

// 資料夾裡換順序
{
  const s = saved(ids5(), ['a', 'b', 'c', 'd', 'e']);
  newFolder(s, 'a', 1000, 'F');
  intoFolder(s, 'b', 'F', 1001);
  intoFolder(s, 'c', 'F', 1002);
  eq('資料夾裡把 c 拖到第一格', placeInFolder(s, 'c', 'F', ['c', 'a', 'b'], 2000), true);
  eq('順序換了', top(s), ['新資料夾[c,a,b]', 'd', 'e']);
  // 最近刪除裡的紙留在原位
  s.notes.find(n => n.id === 'a')!.deleted = true;
  eq('刪掉 a 之後', top(s), ['新資料夾[c,b]', 'd', 'e']);
  placeInFolder(s, 'b', 'F', ['b', 'c'], 2100);
  eq('看得到的換順序', top(s), ['新資料夾[b,c]', 'd', 'e']);
  s.notes.find(n => n.id === 'a')!.deleted = false;
  eq('還原的 a 回到它的位子附近', top(s), ['新資料夾[b,a,c]', 'd', 'e']);
}

// 從別的資料夾拖進來；原本的資料夾空了就不見
{
  const s = saved(ids5(), ['a', 'b', 'c', 'd', 'e']);
  newFolder(s, 'a', 1000, 'F');
  intoFolder(s, 'b', 'F', 1001);
  newFolder(s, 'd', 1002, 'G');
  eq('起點', top(s), ['新資料夾[a,b]', 'c', '新資料夾[d]', 'e']);
  placeInFolder(s, 'd', 'F', ['a', 'd', 'b'], 2000);
  eq('d 從 G 搬進 F，G 空了不見', [top(s), s.folders!.map(f => f.id)], [['新資料夾[a,d,b]', 'c', 'e'], ['F']]);
}

// 擋掉不合理的
{
  const s = saved(ids5(), ['a', 'b', 'c', 'd', 'e']);
  newFolder(s, 'a', 1000, 'F');
  newFolder(s, 'c', 1001, 'G');
  eq('資料夾不能放進資料夾', placeInFolder(s, 'G', 'F', ['a', 'G'], 2000), false);
  eq('沒有這個資料夾', placeInFolder(s, 'b', 'X', ['b'], 2000), false);
  eq('順序裡沒有這張', placeInFolder(s, 'b', 'F', ['a'], 2000), false);
  eq('都沒變', top(s), ['新資料夾[a]', 'b', '新資料夾[c]', 'd', 'e']);
}

// 從資料夾拿出來放到目錄指定位置
{
  const s = saved(ids5(), ['a', 'b', 'c', 'd', 'e']);
  newFolder(s, 'b', 1000, 'F');
  intoFolder(s, 'c', 'F', 1001);
  eq('起點', top(s), ['a', '新資料夾[b,c]', 'd', 'e']);
  placeTop(s, 'c', ['c', 'a', 'F', 'd', 'e'], 2000);
  eq('c 拿出來放第一格', top(s), ['c', 'a', '新資料夾[b]', 'd', 'e']);
  eq('算親手排', (layoutToSend(s)?.mod ?? 0) >= 2000, true);
  placeTop(s, 'b', ['c', 'a', 'd', 'e', 'b'], 2100);
  eq('最後一張拿出來放最後，資料夾不見', [top(s), s.folders], [['c', 'a', 'd', 'e', 'b'], []]);
  // 目錄裡一般換位也走得通
  placeTop(s, 'e', ['e', 'c', 'a', 'd', 'b'], 2200);
  eq('目錄裡的紙換位', top(s), ['e', 'c', 'a', 'd', 'b']);
  fixOrder(s);
  eq('存檔前整理不改', top(s), ['e', 'c', 'a', 'd', 'b']);
}

console.log(fail ? `\n${fail} 條沒過` : '\n全部通過');
if (fail) process.exit(1);

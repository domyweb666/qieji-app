// C2 排列同步的純函式測試：iCloud 上的 layout.json 怎麼合進這台、什麼時候要傳上去（跑法：node tools/tests/c2-layout.test.ts）
// @ts-expect-error node 直接跑 TS 檔要帶 .ts 副檔名
import { fixOrder, forgetSync, layoutToSend, markLayoutSent, mergeCloud, mergeLayout, ownLayout, parseState, readLayout, reseat, seatedNotes, tutorialNote } from '../../src/lib/model.ts';

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
const ids = (ns: { id: string }[]) => ns.map(n => n.id);
// 一份已經轉好座位表的存檔（關掉再開讀回來的樣子）
const saved = (notes: unknown[], order?: string[], extra: Record<string, unknown> = {}) =>
  parseState(JSON.stringify({ sort: 'updated', garden: { days: {}, tot: { f: 0, e: 0 } }, gone: {}, notes, ...(order ? { order } : {}), ...extra }));
const sent = (s: { order?: string[]; orderMod?: number; orderSent?: number }) => ({ order: s.order, orderMod: s.orderMod, orderSent: s.orderSent });

// 1. 升級上來、有真的紙的這台（多米現在的手機）：iCloud 還沒有 layout.json → 這台的排列傳上去當第一份，mod 0
{
  const s = saved([note('a', 500), note('b', 400), note('c', 300)], ['c', 'a', 'b']);
  ownLayout(s);
  eq('升級上來的這台有自己的排列（mod 0）', s.orderMod, 0);
  eq('iCloud 沒有 layout.json：目錄不變', mergeLayout(s, undefined), false);
  eq('要傳的就是這台現在的排列', layoutToSend(s), { order: ['c', 'a', 'b'], mod: 0, folders: [] });
  markLayoutSent(s, 0);
  eq('傳完就不再傳', layoutToSend(s), null);
  eq('之後 iCloud 那份被刪掉（檔案 app 裡刪）→ 再傳一次', (mergeLayout(s, undefined), layoutToSend(s)), { order: ['c', 'a', 'b'], mod: 0, folders: [] });
}

// 2. 剛裝好、只有教學紙（或重裝、資料夾清單還沒列出 layout.json）：不傳第一份，免得蓋掉 iCloud 上原本的排列
{
  const s = saved([]);
  s.notes.push(tutorialNote(100));
  fixOrder(s);
  ownLayout(s);
  eq('只有教學紙：不算有自己的排列', s.orderMod, undefined);
  mergeLayout(s, undefined);
  eq('iCloud 沒有 layout.json 也不傳', layoutToSend(s), null);
}

// 3. 刪 app 重裝：紙從 iCloud 合回來之後，排列照 iCloud 那份（不是照最近改過）
{
  const s = saved([]);
  s.notes.push(tutorialNote(100));
  fixOrder(s);
  const files = [note('a', 500, { mod: 500 }), note('b', 400, { mod: 400 }), note('c', 300, { mod: 300 })];
  mergeCloud(s, { notes: files, gone: {} }, 1000);
  fixOrder(s);
  eq('紙回來了、還沒合排列：照最近改過', ids(seatedNotes(s, '')), ['a', 'b', 'c']);
  eq('合排列：目錄順序變了', mergeLayout(s, { order: ['c', 'a', 'b'], mod: 700 }), true);
  eq('重裝後目錄照刪之前排的', ids(seatedNotes(s, '')), ['c', 'a', 'b']);
  eq('照抄來的不用再傳回去', layoutToSend(s), null);
  // 重裝後開新的一張：補在最後、不算改排列
  s.notes.push(note('n', 2000) as never);
  fixOrder(s);
  eq('重裝後新的一張排最後', ids(seatedNotes(s, '')), ['c', 'a', 'b', 'n']);
  eq('新的一張不算改排列（不傳）', layoutToSend(s), null);
}

// 4. 對不上的紙：iCloud 那份有、這台沒有的跳過；這台有、那份沒有的補最後
{
  const s = saved([note('a', 500), note('b', 400), note('n', 900)], ['n', 'a', 'b']);
  mergeLayout(s, { order: ['x', 'b', 'y', 'a'], mod: 50 });
  eq('別台的紙跳過、這台多的補最後', s.order, ['b', 'a', 'n']);
}

// 5. 兩台都排過：後排的為準
{
  const s = saved([note('a', 500), note('b', 400), note('c', 300)], ['a', 'b', 'c'], { orderMod: 100, orderSent: 100 });
  reseat(s, ['b', 'a', 'c'], 300);
  eq('這台拖過：記下親手排的時間', s.orderMod, 300);
  eq('拖完要傳', layoutToSend(s), { order: ['b', 'a', 'c'], mod: 300, folders: [] });
  eq('iCloud 那份比較舊（200）：留著這台的', mergeLayout(s, { order: ['c', 'b', 'a'], mod: 200 }), false);
  eq('留著的還是要傳', layoutToSend(s)?.order, ['b', 'a', 'c']);
  eq('iCloud 那份比較新（400）：照它排', mergeLayout(s, { order: ['c', 'b', 'a'], mod: 400 }), true);
  eq('照它排之後不傳', [s.order, layoutToSend(s)], [['c', 'b', 'a'], null]);
}

// 6. 這台沒排過還沒傳的：一律照 iCloud 那份（另一台排過、這台只是記字）
{
  const s = saved([note('a', 500), note('b', 400)], ['a', 'b'], { orderMod: 100, orderSent: 100 });
  s.notes[0].updated = 9999; s.notes[0].title = '改字';
  fixOrder(s);
  eq('改字不算改排列', layoutToSend(s), null);
  mergeLayout(s, { order: ['b', 'a'], mod: 150 });
  eq('照另一台排的', s.order, ['b', 'a']);
}

// 7. 拖的時候手機時鐘比照抄來的那份還早：照樣算比較新（不然拖完一同步就被彈回去）
{
  const s = saved([note('a', 500), note('b', 400)], ['a', 'b'], { orderMod: 5000, orderSent: 5000 });
  reseat(s, ['b', 'a'], 10);
  eq('拖完的時間比照抄來的新', s.orderMod, 5001);
  reseat(s, ['b', 'a'], 20);
  eq('沒換到位置不記時間', s.orderMod, 5001);
}

// 8. 讀不到、壞掉、格式不對
{
  const s = saved([note('a', 500), note('b', 400)], ['a', 'b'], { orderMod: 100, orderSent: 100 });
  eq('讀不到（null）：照這台的、不傳', [mergeLayout(s, null), s.order, layoutToSend(s)], [false, ['a', 'b'], null]);
  eq('格式不對當成沒有', readLayout({ order: 'abc', mod: 1 }), null);
  eq('沒有時間當成沒有', readLayout({ order: ['a'] }), null);
  eq('座位裡混了不是字的丟掉', readLayout({ order: ['a', 3, null, 'b'], mod: 2 }), { order: ['a', 'b'], mod: 2, folders: [] });
  mergeLayout(s, { order: 'abc', mod: 1 });
  eq('壞掉的 layout.json 會被這台的蓋掉', layoutToSend(s), { order: ['a', 'b'], mod: 100, folders: [] });
}

// 9. 還沒更新的舊版把 layout.json 當紙讀進來：沒有 id，被濾掉
{
  const s = saved([note('a', 500, { mod: 500 })], ['a']);
  const before = JSON.stringify(s.notes);
  const r = mergeCloud(s, { notes: [{ order: ['a'], mod: 1 }], gone: {} }, 1000);
  eq('舊版合紙時不會多出一張', [r.added, s.notes.length], [0, 1]);
  eq('紙內容不變', JSON.stringify(s.notes.map(n => ({ ...n, h: undefined, mod: undefined, sh: undefined }))), JSON.stringify(JSON.parse(before).map((n: object) => ({ ...n, h: undefined, mod: undefined, sh: undefined }))));
}

// 10. 傳到一半又拖了一次：還要再傳
{
  const s = saved([note('a', 500), note('b', 400), note('c', 300)], ['a', 'b', 'c'], { orderMod: 0 });
  const lay = layoutToSend(s)!;
  reseat(s, ['c', 'a', 'b'], 600);
  markLayoutSent(s, lay.mod);
  eq('傳途中的改動不漏', layoutToSend(s), { order: ['c', 'a', 'b'], mod: 600, folders: [] });
}

// 11. 最近刪除的紙座位跟著 layout 走，還原回原位
{
  const s = saved([note('a', 500), note('b', 400, { deleted: true, deletedAt: 400 }), note('c', 300)], ['a', 'c', 'b']);
  mergeLayout(s, { order: ['c', 'b', 'a'], mod: 10 });
  eq('刪掉的看不到', ids(seatedNotes(s, '')), ['c', 'a']);
  s.notes.find(n => n.id === 'b')!.deleted = false;
  eq('還原回 iCloud 那份的原位', ids(seatedNotes(s, '')), ['c', 'b', 'a']);
}

// 12. 重裝時某張紙還沒下載下來：先跳過，下次拉到那張紙、排列再對一次就回到原位
{
  const s = saved([note('a', 500, { mod: 500 }), note('c', 300, { mod: 300 })], ['a', 'c']);
  const lay = { order: ['c', 'b', 'a'], mod: 700 };
  mergeLayout(s, lay);
  eq('還沒下載的那張跳過', s.order, ['c', 'a']);
  mergeCloud(s, { notes: [note('b', 400, { mod: 400 })], gone: {} }, 1000);
  fixOrder(s);
  eq('紙下載下來先排最後', ids(seatedNotes(s, '')), ['c', 'a', 'b']);
  mergeLayout(s, lay);
  eq('再合一次排列就回到原位', ids(seatedNotes(s, '')), ['c', 'b', 'a']);
}

// 13. 換 Apple ID 選「放進去」：排列也重傳
{
  const s = saved([note('a', 500)], ['a'], { orderMod: 100, orderSent: 100 });
  forgetSync(s);
  eq('放進去之後排列重傳', layoutToSend(s), { order: ['a'], mod: 100, folders: [] });
}

console.log(fail ? `\n${fail} 條沒過` : '\n全部通過');
if (fail) process.exit(1);

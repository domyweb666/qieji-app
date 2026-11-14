// 1.1 完整版新功能的資料規則：上鎖的紙不上傳、搜不到內容、別台的版本解不開；封面代號只收安全的字；記事本
// @ts-expect-error node 直接跑 TS 檔要帶 .ts 副檔名（跑法：node tools/tests/g-full.test.ts）
import { emptyState, fixNote, isEmpty, mergeRemote, pendingUploads, plain, searchLines, stampMods, visibleNotes } from '../../src/lib/model.ts';

let fail = 0;
const eq = (name: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n   got ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`}`);
};
const note = (id: string, extra: Record<string, unknown> = {}) => fixNote({
  id, type: 'check', title: id.toUpperCase(), body: '', items: [{ id: id + '1', t: '祕密 ' + id, done: false, b: false }], bin: [],
  color: 'yellow', pinned: false, deleted: false, created: 1000, updated: 1000, b: false, ...extra,
});
const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// 欄位修補
eq('封面代號正常的留著', fixNote({ ...note('a'), cover: 'mwg34abc' }).cover, 'mwg34abc');
eq('封面代號想指到別的路徑 → 拿掉', fixNote({ ...note('a'), cover: '../../x' }).cover, undefined);
eq('封面代號有大寫、符號 → 拿掉', [fixNote({ ...note('a'), cover: 'ABC123' }).cover, fixNote({ ...note('a'), cover: 'a.b' }).cover], [undefined, undefined]);
eq('封面代號不是字串 → 拿掉', fixNote({ ...note('a'), cover: 123 }).cover, undefined);
eq('locked 只認 true', [fixNote({ ...note('a'), locked: true }).locked, fixNote({ ...note('a'), locked: 'yes' }).locked, fixNote({ ...note('a'), locked: 1 }).locked], [true, undefined, undefined]);

// 上傳
{
  const s = emptyState();
  s.notes.push(note('a'), note('b', { locked: true }));
  stampMods(s, 2000);
  eq('上鎖的紙不在要上傳的清單裡', pendingUploads(s).map((n: { id: string }) => n.id), ['a']);
  delete s.notes[1].locked;
  stampMods(s, 3000);
  eq('解除上鎖之後就會上傳', pendingUploads(s).map((n: { id: string }) => n.id), ['a', 'b']);
}

// 搜尋
{
  const s = emptyState();
  s.notes.push(note('a'), note('b', { locked: true }));
  s.order = ['a', 'b'];
  eq('搜內容：上鎖的那張搜不到', searchLines(s, '祕密').map((h: { note: { id: string } }) => h.note.id), ['a']);
  eq('搜名字：上鎖的那張找得到，但不列出行', searchLines(s, 'B').map((h: { note: { id: string }; lines: unknown[] }) => [h.note.id, h.lines.length]), [['b', 0]]);
  eq('目錄的搜尋也一樣', visibleNotes(s, { trash: false, filter: 'all', q: '祕密', sort: 'updated' }).map((n: { id: string }) => n.id), ['a']);
}

// 同步合併：別台不知道這台鎖了
{
  // 這台鎖著、跟 iCloud 對過；別台後來改了又傳上去
  const s = emptyState();
  const l = note('a');
  s.notes.push(l);
  stampMods(s, 2000);
  l.sh = l.h; // 對過
  l.locked = true; delete l.sh; stampMods(s, 3000); // 上鎖（當成沒傳過）
  const r = copy(note('a'));
  r.items.push({ id: 'a2', t: '別台加的', done: false, b: false });
  r.mod = 9000;
  mergeRemote(s, { notes: [r], gone: {} }, 10000);
  eq('合完還是鎖著', s.notes[0].locked, true);
  eq('別台加的行有進來', s.notes[0].items.map((i: { t: string }) => i.t).includes('別台加的'), true);
  eq('合完也不會被排進上傳', pendingUploads(s).length, 0);
}
{
  // 只有 iCloud 那邊改了（這台的指紋跟上次對過的一樣）
  const s = emptyState();
  const l = note('a', { locked: true });
  s.notes.push(l);
  stampMods(s, 2000);
  l.sh = l.h;
  const r = copy(note('a'));
  r.items[0].t = '別台改的';
  r.mod = 9000;
  mergeRemote(s, { notes: [r], gone: {} }, 10000);
  eq('拿別台的內容，鎖留著', [s.notes[0].items[0].t, s.notes[0].locked], ['別台改的', true]);
}
{
  // iCloud 來的檔自己帶 locked：不能把這台的紙鎖上
  const s = emptyState();
  mergeRemote(s, { notes: [{ ...copy(note('z')), locked: true }], gone: {} }, 10000);
  eq('iCloud 來的 locked 不算數', s.notes[0].locked, undefined);
}

// 記事本
{
  const pad = note('p', { type: 'text', body: '第一段\n\n第二段', items: [] });
  eq('記事本的分享文字就是內文', plain(pad), '第一段\n\n第二段');
  eq('有內文不算空的', isEmpty(pad), false);
  eq('沒名字沒內文算空的', isEmpty(note('q', { type: 'text', title: '', body: '  ', items: [] })), true);
  const s = emptyState();
  s.notes.push(pad);
  s.order = ['p'];
  eq('搜得到記事本的內文', searchLines(s, '第二').map((h: { note: { id: string } }) => h.note.id), ['p']);
}

console.log(fail ? `\n${fail} 條沒過` : '\n全過');
process.exit(fail ? 1 : 0);

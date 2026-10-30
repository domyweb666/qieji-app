// 茄記的資料結構與機制規則，從網頁版 index.html 原樣搬過來。
// 這個檔案只放純函式，不碰 React、不碰儲存，方便用舊格式資料測試。
// 鐵則：storage key 永遠是 colornotes.v1；欄位只能加，不能改名或刪掉。

export const KEY = 'colornotes.v1';
export const HINT_KEY = 'cn.hint';

export type ColorKey = 'purple' | 'yellow' | 'orange' | 'red' | 'blue' | 'green' | 'gray' | 'black' | 'white';
export type SortKey = 'updated' | 'created' | 'title' | 'color';

export type Item = { id: string; t: string; done: boolean; b: boolean };
export type Note = {
  id: string;
  type: 'text' | 'check';
  title: string;
  body: string;
  items: Item[];
  color: ColorKey;
  pinned: boolean;
  deleted: boolean;
  deletedAt?: number; // 丟進最近刪除的時間，30 天自動清掉用；還原時拿掉
  created: number;
  updated: number;
  b: boolean;
};
export type Day = { f: number; e: number; g: number };
export type Garden = { days: Record<string, Day>; tot: { f: number; e: number } };
export type State = { sort: SortKey; notes: Note[]; garden: Garden };

// name 是蔬菜名，hue 是一般人說的顏色（色塊面板上兩個都標）。
// 色碼不在這裡：九種顏色的 bg／hd／rule 在 src/lib/tokens.ts 的筆記色票（淺色、深色各一組）。
// dot 是最接近的彩色圓點 emoji，給 iOS 系統選單當色塊（系統選單裡自己的圖片顯示不出來，文字一定會出現）。
export const COLORS: Record<ColorKey, { name: string; hue: string; dot: string }> = {
  purple: { name: '茄子', hue: '紫色', dot: '🟣' },
  yellow: { name: '玉米', hue: '黃色', dot: '🟡' },
  orange: { name: '紅蘿蔔', hue: '橘色', dot: '🟠' },
  red: { name: '甜椒', hue: '紅色', dot: '🔴' },
  blue: { name: '藍莓', hue: '藍色', dot: '🔵' },
  green: { name: '青蔥', hue: '綠色', dot: '🟢' },
  gray: { name: '香菇', hue: '奶茶色', dot: '🟤' },
  black: { name: '黑豆', hue: '深灰', dot: '⚫' },
  white: { name: '白蘿蔔', hue: '白色', dot: '⚪' },
};
export const CKEYS = Object.keys(COLORS) as ColorKey[];
export const col = (c: string) => COLORS[c as ColorKey] || COLORS.yellow;
export const SORTS: Record<SortKey, string> = {
  updated: '依修改的時間排序',
  created: '依建立的時間排序',
  title: '依標題排序',
  color: '依顏色排序',
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const p2 = (x: number) => String(x).padStart(2, '0');

export function fixNote(n: any): Note {
  if (!COLORS[n.color as ColorKey]) n.color = n.color === 'pink' ? 'red' : 'yellow';
  n.items = (n.items || []).map((i: any) => ({ id: i.id || uid(), t: i.t || '', done: !!i.done, b: i.b === undefined ? true : !!i.b }));
  n.title = n.title || '';
  n.body = n.body || '';
  n.b = n.b === undefined ? true : !!n.b;
  return n as Note;
}

/* garden: days['YYYY-MM-DD'] = {f: flowers, e: eggplants, g: golden}; tot = all-time
   app 不再計數，這份資料只是原樣保留、跟著備份匯出，讓網頁版的茄子田不會被弄壞 */
export function fixGarden(s: any) {
  if (s.garden && s.garden.days && s.garden.tot) return;
  // first run: count what already exists so past ideas aren't lost
  const live = s.notes.filter((n: Note) => !n.deleted);
  const items: Item[] = live.flatMap((n: Note) => n.items);
  s.garden = {
    days: {},
    tot: {
      f: items.filter(i => i.t.trim()).length + live.filter((n: Note) => n.type === 'text' && n.body.trim()).length,
      e: items.filter(i => i.done).length,
    },
  };
}

export const emptyState = (): State => ({ notes: [], sort: 'updated', garden: { days: {}, tot: { f: 0, e: 0 } } });

// 讀進存檔字串（可能是 null、壞掉的 JSON、或任何舊版格式）
// 同一個 id 出現兩次（同一則筆記被重複存進去）時只留最新的那份；不同 id 的筆記一則都不動
function dedupe(notes: Note[]) {
  const best = new Map<string, Note>();
  for (const n of notes) {
    const o = best.get(n.id);
    if (!o || (n.updated || 0) > (o.updated || 0)) best.set(n.id, n);
  }
  return notes.filter(n => best.get(n.id) === n);
}

export function parseState(raw: string | null): State {
  try {
    const s = JSON.parse(raw as string);
    if (s && Array.isArray(s.notes)) {
      s.notes.forEach(fixNote);
      s.notes = dedupe(s.notes);
      fixGarden(s);
      if (!SORTS[s.sort as SortKey]) s.sort = 'updated';
      return s;
    }
  } catch {}
  return emptyState();
}

/* ---------------- dates ---------------- */
export function fullDate(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
export function ago(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return '剛剛';
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`;
  if (s < 86400 * 365) return `${Math.floor(s / 86400 / 30)} 個月前`;
  return `${Math.floor(s / 86400 / 365)} 年前`;
}

/* ---------------- note helpers ---------------- */
// 複製／分享用的文字：每行編號、行和行之間空一行，比較好讀。
// 劃掉的行不用刪除線字元（貼到別的 app 會變成怪字），改成在編號後面標「（劃線）」
export const plain = (n: Note) =>
  n.type === 'text' ? n.body : n.items.filter(i => i.t.trim())
    .map((i, k) => `${k + 1}.${i.done ? '（劃線）' : ''}${i.t}`).join('\n\n');
export const label = (n: Note) =>
  n.title.trim() ||
  (n.type === 'text' ? n.body : n.items.map(i => i.t).join('\n')).split('\n').find(l => l.trim()) ||
  '（無標題）';
export const isEmpty = (n: Note) => !n.title.trim() && (n.type === 'text' ? !n.body.trim() : n.items.every(i => !i.t.trim()));

export function visibleNotes(s: State, o: { trash: boolean; filter: ColorKey | 'all'; q: string; sort: SortKey }) {
  const q = o.q.trim().toLowerCase();
  const notes = s.notes
    .filter(n => (o.trash ? n.deleted : !n.deleted))
    .filter(n => o.filter === 'all' || n.color === o.filter)
    .filter(n => !q || (n.title + '\n' + n.body + '\n' + n.items.map(i => i.t).join('\n')).toLowerCase().includes(q));
  notes.sort((a, b) => {
    if (!o.trash && a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    switch (o.sort) {
      case 'created': return b.created - a.created;
      case 'title': return label(a).localeCompare(label(b), 'zh-Hant');
      case 'color': return CKEYS.indexOf(a.color) - CKEYS.indexOf(b.color) || b.updated - a.updated;
      default: return b.updated - a.updated;
    }
  });
  return notes;
}

/* ---------------- backup ---------------- */
export function exportJSON(s: State, now = Date.now()) {
  return JSON.stringify({ app: 'colornotes', version: 1, exported: now, notes: s.notes, garden: s.garden }, null, 1);
}
export function backupName(d = new Date()) {
  return `茄記備份-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}.json`;
}
// merge a backup file into state; notes merge by `updated`, garden keeps the bigger count per day
export function importBackup(s: State, text: string) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.notes)) throw new Error('not a backup');
  const have = new Map(s.notes.map(n => [n.id, n]));
  let added = 0, updated = 0;
  for (const n0 of data.notes) {
    const n = fixNote(n0), h = have.get(n.id);
    if (!h) { s.notes.push(n); have.set(n.id, n); added++; }
    else if (n.updated > h.updated) { Object.assign(h, n); updated++; }
  }
  if (data.garden && data.garden.days) {
    const g = s.garden;
    for (const [k, d] of Object.entries<any>(data.garden.days)) {
      const m = g.days[k] || (g.days[k] = { f: 0, e: 0, g: 0 });
      m.f = Math.max(m.f, d.f || 0); m.e = Math.max(m.e, d.e || 0); m.g = Math.max(m.g, d.g || 0);
    }
    g.tot.f = Math.max(g.tot.f, data.garden.tot?.f || 0);
    g.tot.e = Math.max(g.tot.e, data.garden.tot?.e || 0);
  }
  return { added, updated };
}

export function convertNote(n: Note) {
  if (n.type === 'text') {
    n.items = n.body.split('\n').map(s => s.trim()).filter(Boolean).map(t => ({ id: uid(), t, done: false, b: !!n.b }));
    n.type = 'check';
  } else {
    n.body = n.items.filter(i => i.t.trim()).map(i => i.t).join('\n');
    n.type = 'text';
  }
}

/* ---------------- list grouping (iOS 備忘錄式分組) ---------------- */
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

export function rowDate(ts: number, now = new Date()) {
  const d = new Date(ts), days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days <= 0) return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  if (days === 1) return '昨天';
  if (days < 7) return WEEK[d.getDay()];
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export type Section = { title: string; notes: Note[] };
// 只分「已釘選」和「其他」，不用今天／昨天／幾月這種時間標題（看了會覺得清單放太久，有壓力）。
// 順序照使用者選的排序方式，由 visibleNotes 排好；最近刪除整頁一組。
export function groupNotes(notes: Note[], o: { trash: boolean }): Section[] {
  const out: Section[] = [];
  const push = (title: string, n: Note) => {
    const last = out[out.length - 1];
    if (last && last.title === title) last.notes.push(n); else out.push({ title, notes: [n] });
  };
  for (const n of notes) {
    if (o.trash) push('最近刪除', n);
    else push(n.pinned ? '已釘選' : '其他', n);
  }
  return out;
}

/* ---------------- 最近刪除 30 天自動清掉 ---------------- */
// 會真的刪掉使用者資料，所以規則是「拿不準就不刪」：只有在最近刪除裡、刪除時間可信、而且已經滿 30 天才清。
// 規則細節都在 tests/trash.test.mjs。注意：目前還沒有任何地方呼叫 purgeExpiredTrash，要等工程師看過才接上。
export const TRASH_DAYS = 30;
const TRASH_MS = TRASH_DAYS * 86400000;
const validTime = (t: unknown): t is number => typeof t === 'number' && Number.isFinite(t) && t > 0;

export function isExpiredTrash(n: Note, now: number) {
  if (!n.deleted) return false;
  if (!validTime(now) || !validTime(n.deletedAt)) return false;
  if (n.deletedAt > now) return false; // 手機時間被往前調過
  return now - n.deletedAt >= TRASH_MS;
}

export function markDeleted(n: Note, now: number) {
  n.deleted = true;
  n.deletedAt = now;
}

export function markRestored(n: Note) {
  n.deleted = false;
  delete n.deletedAt;
}

// 功能上線前就在最近刪除裡的（沒有可信的刪除時間）：從現在開始算 30 天。回傳補了幾則
export function stampOldTrash(notes: Note[], now: number) {
  let stamped = 0;
  for (const n of notes) {
    if (n.deleted && !validTime(n.deletedAt)) { n.deletedAt = now; stamped++; }
  }
  return stamped;
}

// 不改原本的陣列：回傳留下的和要清掉的，由呼叫的人決定要不要真的換掉
export function purgeExpiredTrash(notes: Note[], now: number) {
  const kept: Note[] = [], removed: Note[] = [];
  for (const n of notes) (isExpiredTrash(n, now) ? removed : kept).push(n);
  return { kept, removed };
}

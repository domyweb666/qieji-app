// 茄記的資料結構與機制規則，從網頁版 index.html 原樣搬過來。
// 這個檔案只放純函式，不碰 React、不碰儲存，方便用舊格式資料測試。
// 鐵則：storage key 永遠是 colornotes.v1；欄位只能加，不能改名或刪掉。

export const KEY = 'colornotes.v1';
export const HINT_KEY = 'cn.hint';

export type ColorKey = 'purple' | 'yellow' | 'orange' | 'red' | 'blue' | 'green' | 'gray' | 'black' | 'white';
export type SortKey = 'updated' | 'created' | 'title' | 'color';
export type Kind = 'f' | 'e' | 'g'; // 花、茄子、金茄子

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
  created: number;
  updated: number;
  b: boolean;
};
export type Day = { f: number; e: number; g: number };
export type Garden = { days: Record<string, Day>; tot: { f: number; e: number } };
export type State = { sort: SortKey; notes: Note[]; garden: Garden };

// name 是蔬菜名，hue 是一般人說的顏色（色塊面板上兩個都標）
export const COLORS: Record<ColorKey, { bg: string; hd: string; rule: string; name: string; hue: string }> = {
  purple: { bg: '#EDE4F3', hd: '#8E6AAE', rule: '#D6C6E6', name: '茄子', hue: '紫色' },
  yellow: { bg: '#FBF2C9', hd: '#EECF5E', rule: '#EEDF9A', name: '玉米', hue: '黃色' },
  orange: { bg: '#FCE2CB', hd: '#F09C5E', rule: '#F2C49E', name: '紅蘿蔔', hue: '橘色' },
  red: { bg: '#F9D7D2', hd: '#E07A6F', rule: '#EDADA5', name: '甜椒', hue: '紅色' },
  blue: { bg: '#DCE5F4', hd: '#7F99D0', rule: '#B7C7E7', name: '藍莓', hue: '藍色' },
  green: { bg: '#E0ECD2', hd: '#8DAF62', rule: '#C3D8A9', name: '青蔥', hue: '綠色' },
  gray: { bg: '#EEE7DE', hd: '#B6A895', rule: '#DACFC1', name: '香菇', hue: '奶茶色' },
  black: { bg: '#DAD5DB', hd: '#4A3F4E', rule: '#C4BDC6', name: '黑豆', hue: '深灰' },
  white: { bg: '#FFFDF9', hd: '#E8E0D3', rule: '#EFE8DC', name: '白蘿蔔', hue: '白色' },
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

/* garden: days['YYYY-MM-DD'] = {f: flowers, e: eggplants, g: golden}; tot = all-time */
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
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export function weekKeys(d = new Date()) {
  const back = (d.getDay() + 6) % 7; // Monday-start week
  return [...Array(back + 1)].map((_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() - back + i);
    return dayKey(x);
  });
}

/* ---------------- note helpers ---------------- */
export const plain = (n: Note) =>
  n.type === 'text' ? n.body : n.items.map(i => (i.done ? i.t.split('').map(c => c + '̶').join('') : i.t)).join('\n');
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

/* ---------------- garden rules ---------------- */
export function gday(s: State, k = dayKey()) {
  return s.garden.days[k] || (s.garden.days[k] = { f: 0, e: 0, g: 0 });
}
// an idea "blooms" the first time it is left with text in it; returns the ids that bloomed
export function bloom(s: State, n: Note, skipId?: string | null): string[] {
  const out: string[] = [];
  if (n.type === 'text') {
    if (!n.b && n.body.trim()) { n.b = true; out.push(n.id); }
  } else n.items.forEach(it => {
    if (!it.b && it.t.trim() && it.id !== skipId) { it.b = true; out.push(it.id); }
  });
  if (out.length) { gday(s).f += out.length; s.garden.tot.f += out.length; }
  return out;
}
// every 10th eggplant is golden — never random
export function harvest(s: State, on: boolean): Kind | null {
  const d = gday(s), t = s.garden.tot;
  if (on) { t.e++; d.e++; if (t.e % 10 === 0) { d.g++; return 'g'; } return 'e'; }
  // un-striking only takes back an eggplant picked today, never an old one
  if (d.e > 0) { if (t.e % 10 === 0 && d.g > 0) d.g--; d.e--; t.e--; }
  return null;
}
// strike / unstrike one line; returns what was picked (null when unstriking or the line is blank)
export function toggleStrike(s: State, it: Item): Kind | null {
  if (!it.t.trim()) return null;
  it.done = !it.done;
  const kind = harvest(s, it.done);
  if (!it.b) { it.b = true; gday(s).f++; s.garden.tot.f++; }
  return kind;
}

export type EggArt = 'egg-gold' | 'egg-small' | 'egg';
export function weekGarden(s: State, now = new Date()) {
  const days = s.garden.days, today = dayKey(now);
  let f = 0;
  const eggs: EggArt[] = [];
  weekKeys(now).forEach(k => {
    const d = days[k];
    if (!d) return;
    f += d.f;
    for (let i = 0; i < d.e; i++) eggs.push(i < d.g ? 'egg-gold' : k === today ? 'egg-small' : 'egg');
  });
  return { f, eggs };
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
export function groupNotes(notes: Note[], o: { sort: SortKey; trash: boolean }, now = new Date()): Section[] {
  const out: Section[] = [];
  const push = (title: string, n: Note) => {
    const last = out[out.length - 1];
    if (last && last.title === title) last.notes.push(n); else out.push({ title, notes: [n] });
  };
  const today = startOfDay(now);
  const bucket = (ts: number) => {
    const days = Math.round((today - startOfDay(new Date(ts))) / 86400000);
    if (days <= 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return '過去 7 天';
    if (days < 30) return '過去 30 天';
    const d = new Date(ts);
    return d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1}月` : `${d.getFullYear()}年`;
  };
  for (const n of notes) {
    if (!o.trash && n.pinned) push('已釘選', n);
    else if (o.sort === 'updated' || o.sort === 'created') push(bucket(o.sort === 'created' ? n.created : n.updated), n);
    else push(o.trash ? '最近刪除' : '筆記', n);
  }
  return out;
}

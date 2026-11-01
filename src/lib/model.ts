// 茄記的資料結構與機制規則，從網頁版 index.html 原樣搬過來。
// 這個檔案只放純函式，不碰 React、不碰儲存，方便用舊格式資料測試。
// 鐵則：storage key 永遠是 colornotes.v1；欄位只能加，不能改名或刪掉。

export const KEY = 'colornotes.v1';
export const HINT_KEY = 'cn.hint';
// 第一次轉成座位表（C1）之前，整份原始存檔原封不動另存在這裡，只存一次；轉壞了從這裡救
export const SEAT_BACKUP_KEY = 'colornotes.v1.before-c1';

export type ColorKey = 'purple' | 'yellow' | 'orange' | 'red' | 'blue' | 'green' | 'gray' | 'black' | 'white';
export type SortKey = 'updated' | 'created' | 'title' | 'color';

export type Item = { id: string; t: string; done: boolean; b: boolean; at?: number }; // at：被刪掉的時間，只有在 bin 裡才有
export type Note = {
  id: string;
  type: 'text' | 'check';
  title: string;
  body: string;
  items: Item[];
  bin: Item[]; // 這張紙刪掉的行（最近刪除）；欄位 2026-10-31 加，舊存檔沒有就是空的
  color: ColorKey;
  pinned: boolean;
  deleted: boolean;
  deletedAt?: number; // 丟進最近刪除的時間，30 天自動清掉用；還原時拿掉
  created: number;
  updated: number;
  b: boolean;
  // iCloud 同步用（S0，2026-11-01 加；舊存檔沒有就是還沒算過）。h＝內容指紋；mod＝指紋上次變的時間（同步比新舊用，
  // 跟畫面上的 updated 分開：清掉最近刪除裡的行不會讓紙跳到目錄最前面）；sh＝上次跟 iCloud 對上時的指紋（合併時的共同祖先）
  h?: string;
  mod?: number;
  sh?: string;
};
export type Day = { f: number; e: number; g: number };
export type Garden = { days: Record<string, Day>; tot: { f: number; e: number } };
// gone＝墓碑：永久拿掉的紙 id → 拿掉的時間（S0，2026-11-01 加）。沒有它，另一台還留著的那張會被同步回來，刪掉的紙復活
// order＝目錄座位表（C1，2026-11-02 加）：每張紙的 id 照目錄裡的先後排，舊存檔沒有。sort 從此不用，但照鐵則留著
// orderMod＝座位表最後一次親手排（拖、往前移／往後移）的時間，或從 iCloud 照抄來那份的時間；orderSent＝上次跟 iCloud 對上的 orderMod（C2，2026-11-02 加）
export type State = { sort: SortKey; notes: Note[]; garden: Garden; gone?: Record<string, number>; order?: string[]; orderMod?: number; orderSent?: number };

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
  const fixItem = (i: any): Item => ({ id: i.id || uid(), t: i.t || '', done: !!i.done, b: i.b === undefined ? true : !!i.b,
    ...(typeof i.at === 'number' && Number.isFinite(i.at) && i.at > 0 ? { at: i.at } : {}) });
  n.items = (n.items || []).map(fixItem);
  n.bin = (Array.isArray(n.bin) ? n.bin : []).map(fixItem);
  n.title = n.title || '';
  n.body = n.body || '';
  n.b = n.b === undefined ? true : !!n.b;
  // 30 天自動清（2026-11-01 接上）：不在最近刪除裡就不該留著刪除時間——網頁版還原只改 deleted、不清 deletedAt，殘留的舊時間會讓它下次被刪時立刻過期。
  // 在最近刪除裡但時間不可信的也拿掉，交給 stampOldTrash 從現在起算
  if (!n.deleted || !validTime(n.deletedAt)) delete n.deletedAt;
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

// 第一次安裝時放的教學紙（多米 2026-11-01 定，取代紙底下那行「點一下改字 · 右滑劃掉…」）：每一行就是叫你做的那個動作，
// 照做這行就被劃掉、刪掉或改掉，做完一輪紙也清空了（2-7 怎麼做 3：讓內容自己當提示）。只在手機上完全沒有茄記資料時放（store.load）。
// 第 1 行順便說「劃掉」在茄記的意思：想完了、放下了，不是做完了
export const TUTORIAL = {
  title: '從這裡開始',
  lines: [
    '想完的事，往右滑劃掉',
    '不要的，往左滑刪掉（刪了在最近刪除找得回來）',
    '點一下這行，就能改字',
    '按住這行，看還能做什麼',
    '按住右邊三條線上下拖，換順序',
    '右下角 ＋，記下你現在想到的事',
  ],
};
export function tutorialNote(now: number): Note {
  return { id: uid(), type: 'check', title: TUTORIAL.title, body: '', bin: [], color: 'yellow',
    items: TUTORIAL.lines.map(t => ({ id: uid(), t, done: false, b: false })),
    pinned: false, deleted: false, created: now, updated: now, b: false };
}

export const emptyState = (): State => ({ notes: [], sort: 'updated', garden: { days: {}, tot: { f: 0, e: 0 } }, gone: {} });

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
      s.gone = fixGone(s.gone);
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
// 沒取名的紙一律叫「未命名」，跟紙的標題列同一個字（多米 2026-11-01：目錄磚拿第一行當名字，會以為那是名字）
export const label = (n: Note) => n.title.trim() || '未命名';
// 要在選單裡分出是哪張：沒名字的寫「未命名・」＋第一行開頭，不單用第一行（理由同上）
const PEEK = 8;
export function pickLabel(n: Note) {
  if (n.title.trim()) return n.title.trim();
  const first = (n.type === 'text' ? n.body.split('\n') : n.items.map(i => i.t)).map(t => t.trim()).find(Boolean);
  if (!first) return '未命名';
  const chars = Array.from(first);
  return `未命名・${chars.slice(0, PEEK).join('')}${chars.length > PEEK ? '…' : ''}`;
}
// 釘選最多兩張：標題區左右滑只在這兩張之間換（多米 2026-11-01 晚定）。
// 舊資料或別台同步回來超過的不自動拔，等下次釘新的時全部列出來讓人挑
export const PIN_MAX = 2;
export const pinnedNotes = (s: State) => s.notes.filter(n => n.pinned && !n.deleted).sort((a, b) => b.updated - a.updated);
// 標題區換張的那幾張（B2 把手的段數、B4 左右滑）：釘選的照建立先後（不照修改時間，改一個字不會換位置），
// 現在這張不在裡面（沒釘，或舊資料釘超過兩張）就暫時排最左
export function swipeSet(s: State, cur: Note) {
  const set = s.notes.filter(n => n.pinned && !n.deleted).sort((a, b) => a.created - b.created).slice(0, PIN_MAX);
  return set.includes(cur) ? set : [cur, ...set];
}
export const isEmpty = (n: Note) => !n.title.trim() && (n.type === 'text' ? !n.body.trim() : n.items.every(i => !i.t.trim()));

// q 要先 trim、轉小寫
const hit = (n: Note, q: string) => !q || (n.title + '\n' + n.body + '\n' + n.items.map(i => i.t).join('\n')).toLowerCase().includes(q);

export function visibleNotes(s: State, o: { trash: boolean; filter: ColorKey | 'all'; q: string; sort: SortKey }) {
  const q = o.q.trim().toLowerCase();
  const notes = s.notes
    .filter(n => (o.trash ? n.deleted : !n.deleted))
    .filter(n => o.filter === 'all' || n.color === o.filter)
    .filter(n => hit(n, q));
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

/* ---------------- 目錄座位表（C1） ---------------- */
// 改字不換位（公理 2：手記得住不動的位置）。舊存檔沒有座位表時，照 C1 之前目錄的樣子編第一次（釘選的在前、再照 sort），
// 打開新版看到的順序才會跟以前一模一樣；在最近刪除裡的紙接在後面（看不到，座位留著，還原就回原位）
const firstSeats = (s: State) => [
  ...visibleNotes(s, { trash: false, filter: 'all', q: '', sort: s.sort }),
  ...s.notes.filter(n => n.deleted).sort((a, b) => b.updated - a.updated),
].map(n => n.id);

// 存檔前對一次座位表：表裡有、紙沒有的座位丟掉（永久拿掉的紙），重複的只留第一個；紙有、表裡沒有的補在最後（新的一張、
// 這台沒見過的、匯入的；好幾張時最近改過的在前）。有改才寫回，回傳有沒有改
export function fixOrder(s: State) {
  const ids = new Set(s.notes.map(n => n.id));
  const seen = new Set<string>();
  const order = (Array.isArray(s.order) ? s.order : firstSeats(s))
    .filter(id => typeof id === 'string' && ids.has(id) && !seen.has(id) && !!seen.add(id));
  for (const n of s.notes.filter(n => !seen.has(n.id)).sort((a, b) => b.updated - a.updated)) order.push(n.id);
  const old = s.order;
  if (Array.isArray(old) && old.length === order.length && old.every((id, i) => id === order[i])) return false;
  s.order = order;
  return true;
}

// 拖完換座位（C4）：visible＝目錄裡看得到的紙排好的新順序。座位表裡「看得到的紙」那些位子依序換成新順序，
// 看不到的（最近刪除）留在原位，還原時照樣回到附近。C2：有換到位置就記下親手排的時間（比照抄來的那份新，同步時才贏）
export function reseat(s: State, visible: string[], now = Date.now()) {
  fixOrder(s);
  const set = new Set(visible);
  let k = 0;
  const old = s.order!;
  s.order = old.map(id => (set.has(id) ? visible[k++] : id));
  if (s.order.some((id, i) => id !== old[i])) s.orderMod = Math.max(now, (s.orderMod ?? 0) + 1);
}

// 目錄裡的紙（不含最近刪除），照座位排；搜尋也照座位。純函式不改 state：還沒寫進座位表的（剛開的新的一張）先排在最後，存檔時 fixOrder 補上
export function seatedNotes(s: State, q: string) {
  const seat = new Map((Array.isArray(s.order) ? s.order : firstSeats(s)).map((id, i) => [id, i] as const));
  const k = q.trim().toLowerCase();
  const end = seat.size;
  return s.notes.filter(n => !n.deleted && hit(n, k))
    .sort((a, b) => (seat.get(a.id) ?? end) - (seat.get(b.id) ?? end) || b.updated - a.updated);
}

/* ---------------- 目錄排列同步（C2） ---------------- */
// iCloud 茄記資料夾裡的 layout.json：{ order, mod }。故意沒有 id 欄位：還沒更新的舊版把它當紙讀進來時，mergeCloud 會濾掉。
// 多米 2026-11-02 定：只有親手排才算改排列（新的一張補最後、永久拿掉不算）；兩台都排過，後排的那台為準；對不上的紙補在最後
export type Layout = { order: string[]; mod: number };

// 外面讀進來的 layout.json 先驗：格式不對回 null（當成 iCloud 上沒有）
export function readLayout(raw: unknown): Layout | null {
  const r = raw as { order?: unknown; mod?: unknown } | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r.order)) return null;
  if (typeof r.mod !== 'number' || !Number.isFinite(r.mod) || r.mod < 0) return null;
  return { order: r.order.filter((id): id is string => typeof id === 'string'), mod: r.mod };
}

// 這台有自己的排列（升級上來的、已經有真的紙）：iCloud 上沒有 layout.json 時拿這台的當第一份，mod 從 0 起算（誰親手排過都比它新）。
// 剛裝好、只有教學紙的不算：重裝時資料夾清單可能還沒列出 layout.json，先傳一份上去會把原本的排列蓋掉
export function ownLayout(s: State) {
  if (s.orderMod === undefined && s.notes.some(n => !isUntouchedTutorial(n))) s.orderMod = 0;
}

// 要傳上 iCloud 的排列：這台的排列跟上次對上 iCloud 的不一樣才傳
export function layoutToSend(s: State): Layout | null {
  if (!Array.isArray(s.order) || s.orderMod === undefined || s.orderMod === s.orderSent) return null;
  return { order: s.order.slice(), mod: s.orderMod };
}
export function markLayoutSent(s: State, mod: number) { s.orderSent = mod; }

// 拉 iCloud 時合排列（紙合完之後）。raw：layout.json 的內容；null＝有這個檔但這次讀不到（還沒下載、逾時），undefined＝沒有這個檔。
// 這台排過還沒傳、而且比 iCloud 那份新 → 留著等上傳；不然照 iCloud 那份排，這台沒有的紙跳過、那份沒有的補最後（fixOrder）。
// 回傳目錄順序有沒有變
export function mergeLayout(s: State, raw: unknown): boolean {
  if (raw === null) return false; // 讀不到：照這台的排，下次再對
  const r = readLayout(raw);
  if (!r) {
    // iCloud 上沒有（第一次、被刪掉、壞掉）：這台有自己的排列就傳上去
    if (s.orderMod !== undefined) delete s.orderSent;
    return false;
  }
  const mine = s.orderMod;
  if (mine !== undefined && mine !== s.orderSent && mine > r.mod) return false;
  const before = (s.order ?? []).join('\n');
  s.order = r.order;
  s.orderMod = s.orderSent = r.mod;
  fixOrder(s);
  return s.order.join('\n') !== before;
}

/* ---------------- backup ---------------- */
export function exportJSON(s: State, now = Date.now()) {
  return JSON.stringify({ app: 'colornotes', version: 1, exported: now, notes: s.notes, garden: s.garden }, null, 1);
}
export function backupName(d = new Date()) {
  return `茄記備份-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}.json`;
}
// merge a backup file into state; notes merge by `updated`, garden keeps the bigger count per day
export function importBackup(s: State, text: string, now = Date.now()) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.notes)) throw new Error('not a backup');
  const have = new Map(s.notes.map(n => [n.id, n]));
  let added = 0, updated = 0;
  for (const n0 of data.notes) {
    const n = fixNote(n0), h = have.get(n.id);
    // 30 天自動清：匯進來的、在最近刪除裡的張與行一律從匯入當下重算 30 天（拿不準就不刪）。備份可能來自網頁版（還原不清 deletedAt，
    // 會帶著過期的舊時間）、也可能是很久以前的備份（照舊時間會一匯入就清掉）。Object.assign 合併時帶過去的也是重算過的值
    restampTrash(n, now);
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

/* ---------------- 刪掉的行：進這張紙的 bin（最近刪除），不是直接消失 ---------------- */
// 回傳被移走的那行；找不到回 undefined
export function binItem(n: Note, id: string, now: number): Item | undefined {
  const idx = n.items.findIndex(i => i.id === id);
  if (idx < 0) return undefined;
  const [it] = n.items.splice(idx, 1);
  it.at = now;
  n.bin.unshift(it);
  return it;
}
// 從 bin 放回紙上：預設放最上面，給 at 就放回那個位置
export function unbinItem(n: Note, id: string, at = 0): Item | undefined {
  const idx = n.bin.findIndex(i => i.id === id);
  if (idx < 0) return undefined;
  const [it] = n.bin.splice(idx, 1);
  delete it.at;
  n.items.splice(Math.max(0, Math.min(at, n.items.length)), 0, it);
  return it;
}
// 搬到別張紙：放到那張的最上面。同一張不動
export function moveItem(from: Note, to: Note, id: string): Item | undefined {
  if (from === to) return undefined;
  const idx = from.items.findIndex(i => i.id === id);
  if (idx < 0) return undefined;
  const [it] = from.items.splice(idx, 1);
  to.items.unshift(it);
  return it;
}

/* ---------------- 在一行裡打字的兩個純函式（2026-11-01 第三輪） ---------------- */
// K5：貼上帶換行的字拆成多行，跟網頁版 splitLines 一樣——以換行切、去掉行首的「- • 1. 」這類清單符號、丟掉空行
export function splitPasted(txt: string): string[] {
  return txt.split(/\r?\n/).map(s => s.replace(/^\s*([-*•□☐✓☑]|\d+[.)、])\s*/, '').trim()).filter(Boolean);
}
// K1：點一下，游標落在點的位置。lines＝撐高度的隱形 Text 用 onTextLayout 回報的每一行（x、y、width、height、text），
// x、y＝點的座標（跟 lines 同一個座標系）。先用 y 找第幾行，行內用比例算第幾個字（中文等寬所以準，中英混排差一兩個字），
// 前面幾行的字數加總當起點，最後夾在 0～max。沒有 lines（網頁預覽沒有 onTextLayout）回 undefined，讓呼叫端照舊落在行尾
export type TextLine = { x: number; y: number; width: number; height: number; text: string };
export function caretAt(lines: TextLine[], x: number, y: number, max: number): number | undefined {
  if (!lines.length) return undefined;
  let k = lines.findIndex(l => y < l.y + l.height);
  if (k < 0) k = lines.length - 1;
  let at = 0;
  for (let i = 0; i < k; i++) at += lines[i].text.length;
  const l = lines[k];
  const ratio = l.width > 0 ? (x - l.x) / l.width : 1;
  at += Math.round(Math.max(0, Math.min(1, ratio)) * l.text.length);
  return Math.max(0, Math.min(max, at));
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
// 規則細節都在 tests/trash.test.mjs。2026-11-01 接上 app（多米定）：store.purgeTrash 在打開 app 與回到前景時跑；張看 deletedAt、刪掉的行看 bin 裡的 at
export const TRASH_DAYS = 30;
const TRASH_MS = TRASH_DAYS * 86400000;
const validTime = (t: unknown): t is number => typeof t === 'number' && Number.isFinite(t) && t > 0;

// 四條規則合在一處：時間可信、現在可信、時間不比現在晚（手機時間被往前調過）、已滿 30 天
export function isExpiredAt(at: unknown, now: number): boolean {
  if (!validTime(now) || !validTime(at)) return false;
  if (at > now) return false;
  return now - at >= TRASH_MS;
}
export function isExpiredTrash(n: Note, now: number) {
  if (!n.deleted) return false;
  return isExpiredAt(n.deletedAt, now);
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
// 刪掉的行（每張紙的 bin，at＝刪掉的時間）同一套規則。沒有可信時間的補成現在；滿 30 天的清掉。回傳補了幾行／清了幾行
export function stampOldBin(notes: Note[], now: number) {
  let stamped = 0;
  for (const n of notes) for (const it of n.bin) if (!validTime(it.at)) { it.at = now; stamped++; }
  return stamped;
}
export function purgeExpiredBin(notes: Note[], now: number) {
  let removed = 0;
  for (const n of notes) {
    const keep = n.bin.filter(it => !isExpiredAt(it.at, now));
    removed += n.bin.length - keep.length;
    if (keep.length !== n.bin.length) n.bin = keep;
  }
  return removed;
}
// 匯入備份時用：在最近刪除裡的張與行一律從現在起算 30 天；不在最近刪除裡的張不留刪除時間
export function restampTrash(n: Note, now: number) {
  if (n.deleted) n.deletedAt = now; else delete n.deletedAt;
  for (const it of n.bin) it.at = now;
}

/* ---------------- iCloud 同步：資料規則（S0，2026-11-01） ----------------
   只有規則，不碰 iCloud、不碰儲存；傳輸那層（S2 上傳、S3 下載）再接。規則全部用 tests/sync.test.mjs 釘死。
   鐵則：拿不準就兩邊都留——寧可多一行、多一張，不能少。
   比的單位是一張紙：一邊改＝拿改的那邊；兩邊都改＝把兩邊的行合起來（同一行兩邊都在就用比較新的那邊）；永久拿掉的紙靠墓碑擋住復活 */

function fixGone(g: any): Record<string, number> {
  const out: Record<string, number> = {};
  if (g && typeof g === 'object') for (const [id, t] of Object.entries(g)) if (validTime(t)) out[id] = t as number;
  return out;
}

// 指紋：紙的內容（不含 h、mod、sh 自己）照鍵名排好再算，欄位順序不同、兩台存出來的 JSON 長得不一樣也算同一份
const NO_PRINT = new Set(['h', 'mod', 'sh']);
function canon(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter(k => !NO_PRINT.has(k) && v[k] !== undefined).sort()
      .map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v) ?? 'null';
}
// FNV-1a 兩個起始值各算一次接起來（64 位元），只拿來判斷「有沒有變」，不是加密
function fnv(str: string, seed: number) {
  let x = seed >>> 0;
  for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
  return x.toString(16).padStart(8, '0');
}
export function fingerprint(n: Note) {
  const c = canon(n);
  return fnv(c, 2166136261) + fnv(c, 3735928559);
}

// 存檔前呼叫：內容變了的紙記下 mod＝現在。還沒算過指紋的（舊存檔、剛開的新紙）mod 從 updated 起算，
// 不然升級後第一次存檔每張紙都變成「剛剛改的」，跟 iCloud 上的版本比會亂贏。回傳變了幾張
export function stampMods(s: State, now: number) {
  let changed = 0;
  for (const n of s.notes) {
    const f = fingerprint(n);
    if (n.h === f) continue;
    n.mod = n.h === undefined ? (validTime(n.mod) ? n.mod : n.updated || now) : now;
    n.h = f;
    changed++;
  }
  return changed;
}

// 永久拿掉紙（永久刪除、清空最近刪除、30 天清、空紙關掉）一律走這裡：拿掉、同時立墓碑。回傳拿掉的紙
export function dropNotes(s: State, pick: (n: Note) => boolean, now: number) {
  const gone = (s.gone ??= {});
  const removed: Note[] = [];
  s.notes = s.notes.filter(n => {
    if (!pick(n)) return true;
    removed.push(n);
    gone[n.id] = Math.max(gone[n.id] ?? 0, now);
    return false;
  });
  return removed;
}

// S4（2026-11-01）：iCloud 上這個檔案的紙已經被墓碑擋住（永久刪除之後沒人再改過）＝可以從 iCloud 拿掉。
// 墓碑之後還有人改過（離線那台還在記）就留著，跟 mergeRemote 同一條規則
export function cloudFileBuried(gone: Record<string, number>, raw: unknown) {
  const r = fixNote(raw);
  return gone[r.id] !== undefined && gone[r.id] >= (validTime(r.mod) ? r.mod : r.updated || 0);
}

// S5（2026-11-01 多米選「停下來問一次」）：iCloud 看起來換了一個——這台有同步過的紙（sh 有值），
// iCloud 資料夾裡卻一張都沒有、墓碑也沒提到任何一張。可能是換了 Apple ID，或「檔案」裡的茄記資料夾被刪掉。
// 套件讀不到帳號是誰，只能這樣推。names 用資料夾清單（含還沒下載的檔），不用讀得到的紙，免得檔案還在下載就誤判
export function seemsNewCloud(s: State, names: string[], gone: unknown) {
  const synced = s.notes.filter(n => n.sh !== undefined);
  if (!synced.length) return false;
  const there = new Set(names);
  const g = fixGone(gone);
  return !synced.some(n => there.has(`${n.id}.json`) || g[n.id] !== undefined);
}

// 多米選「放進去」：忘掉跟舊 iCloud 對過的記號，每張紙都當成沒傳過，下一輪全部傳進現在這個 iCloud
export function forgetSync(s: State) {
  for (const n of s.notes) delete n.sh;
  delete s.orderSent; // C2：排列也重傳
}

// 第一次安裝放的教學紙、一個字都沒動過（S3，2026-11-01，規劃七之一）：不上傳；iCloud 上有別的紙時，從 iCloud 下來的這種也不收、本機的拿掉。
// 動過任何一點（改字、劃掉、換色、丟進最近刪除）就是一般的紙，照常同步
export function isUntouchedTutorial(n: Note) {
  return !n.deleted && !n.pinned && n.color === 'yellow' && n.title === TUTORIAL.title && !n.bin.length
    && n.items.length === TUTORIAL.lines.length && n.items.every((it, i) => it.t === TUTORIAL.lines[i] && !it.done);
}

// 要上傳的紙：內容跟上次傳上 iCloud 的不一樣（從沒傳過的 sh 是空的，也算）；沒動過的教學紙不傳
export function pendingUploads(s: State) { return s.notes.filter(n => n.h !== n.sh && !isUntouchedTutorial(n)); }

// iCloud 上那個檔案的指紋（跟本機 h 同一套算法），上傳前比對用：不是 sh 也不是 h ＝別台改過、這台還沒拉下來，不能蓋
export function remotePrint(raw: unknown) { return fingerprint(fixNote(raw)); }

// 上傳成功之後呼叫：這張紙跟 iCloud 對上了。h 傳「開始上傳那一刻」的指紋——
// 上傳途中又改了，n.h 已經是新的，記成新的就會漏傳這次改動（S2，2026-11-01）
export function markSynced(n: Note, h = n.h) { n.sh = h; }

// 墓碑比這張紙最後一次改動還新（或一樣）＝它在別台被永久拿掉之後就沒人動過，拿掉。
// 比墓碑新＝拿掉之後還有人改（例如離線那台還在記），拿不準，留著
const buried = (gone: Record<string, number>, n: Note) => gone[n.id] !== undefined && gone[n.id] >= (n.mod ?? n.updated);

// 兩邊都改了同一張：以 mod 比較新的那張為主（一樣新就本機），另一張多出來的行插回它原本的前一行後面；
// 主的那張刪掉的行（在 bin 裡）不會被救回來——還在最近刪除裡，找得回來。內文（文字筆記）不一樣就兩段都留
function unite(w: Note, x: Note): Note {
  const items = w.items.map(i => ({ ...i }));
  const seen = new Set([...items.map(i => i.id), ...w.bin.map(i => i.id)]);
  let prev: string | null = null;
  for (const it of x.items) {
    if (!seen.has(it.id)) {
      const at = prev === null ? 0 : items.findIndex(i => i.id === prev) + 1;
      items.splice(at, 0, { ...it });
      seen.add(it.id);
    }
    if (items.some(i => i.id === it.id)) prev = it.id;
  }
  const bin = [...w.bin.map(i => ({ ...i })), ...x.bin.filter(i => !seen.has(i.id)).map(i => ({ ...i }))];
  const body = w.body === x.body || !x.body.trim() ? w.body : !w.body.trim() ? x.body : w.body + '\n\n' + x.body;
  return { ...w, title: w.title || x.title, body, items, bin,
    created: Math.min(w.created, x.created), updated: Math.max(w.updated, x.updated) };
}

// 把 iCloud 上的紙與墓碑合進本機。remote 的紙可能來自另一台、舊版本、甚至網頁版備份，一律先 fixNote。
// 回傳數字（測試與日後的紀錄用）和 push：合完之後本機比 iCloud 新、要上傳的紙 id
export function mergeRemote(s: State, remote: { notes: any[]; gone?: any }, now: number) {
  stampMods(s, now);
  const gone = (s.gone ??= {});
  for (const [id, t] of Object.entries(fixGone(remote.gone))) gone[id] = Math.max(gone[id] ?? 0, t);
  const theirs = new Map<string, Note>();
  for (const r0 of remote.notes || []) {
    if (!r0 || typeof r0.id !== 'string') continue;
    const r = fixNote(r0);
    r.h = fingerprint(r);
    if (!validTime(r.mod)) r.mod = r.updated || 0;
    const o = theirs.get(r.id);
    if (!o || (r.mod ?? 0) > (o.mod ?? 0)) theirs.set(r.id, r);
  }
  const out: Note[] = [], push: string[] = [];
  let added = 0, taken = 0, united = 0, removed = 0;
  for (const l of s.notes) {
    const r = theirs.get(l.id);
    theirs.delete(l.id);
    if (!r) {
      // iCloud 上沒有：墓碑擋住就拿掉；不然留著（可能是還沒上傳、或 iCloud 那份還沒下載下來），要上傳
      if (buried(gone, l)) { removed++; continue; }
      out.push(l);
      if (l.h !== l.sh) push.push(l.id);
      continue;
    }
    const newest = Math.max(l.mod ?? 0, r.mod ?? 0);
    if (gone[l.id] !== undefined && gone[l.id] >= newest) { removed++; continue; }
    if (l.h === r.h) { l.sh = r.h; out.push(l); continue; }
    if (l.sh !== undefined && l.h === l.sh) { r.sh = r.h; out.push(r); taken++; continue; } // 只有 iCloud 那邊改了
    if (l.sh !== undefined && r.h === l.sh) { out.push(l); push.push(l.id); continue; }       // 只有本機改了
    // 兩邊都改了（或這台從沒跟 iCloud 對過、內容又不一樣）：合起來，比兩邊都新，要上傳
    const m = (r.mod ?? 0) > (l.mod ?? 0) ? unite(r, l) : unite(l, r);
    m.h = fingerprint(m);
    m.mod = Math.max(now, newest + 1);
    m.sh = r.h;
    out.push(m); push.push(m.id); united++;
  }
  for (const r of theirs.values()) {
    if (buried(gone, r)) continue;
    r.sh = r.h;
    out.push(r); added++;
  }
  s.notes = out;
  return { added, taken, united, removed, push };
}

// 合併時盡量沿用本機原本的物件：畫面上的行用物件判斷要不要重畫、輸入框不受控，
// 換成新物件會讓正在打字的那行寫到沒人看的舊物件上。內容一樣的行沿用舊物件；
// 字被同步改掉的行換新物件並回報 id，畫面要重掛那行的輸入框才看得到新字。紙一律沿用舊物件、把欄位換成合併後的
function adopt(before: Note[], s: State) {
  const old = new Map(before.map(n => [n.id, n]));
  const retyped: string[] = [];
  s.notes = s.notes.map(n => {
    const o = old.get(n.id);
    if (!o || o === n) return n;
    const oldItems = new Map(o.items.map(i => [i.id, i]));
    const items = n.items.map(i => {
      const oi = oldItems.get(i.id);
      if (!oi) return i;
      if (canon(oi) === canon(i)) return oi;
      if (oi.t !== i.t) retyped.push(i.id);
      return i;
    });
    for (const k of Object.keys(o)) delete (o as any)[k];
    return Object.assign(o, n, { items });
  });
  return retyped;
}

// S3：把 iCloud 拉下來的東西合進本機（打開 app、回到前景、iCloud 變成可用、上傳時發現別台改過）。
// remote.notes 是一個個 <id>.json 讀出來的原樣。回傳 changed＝畫面要重畫；retyped＝要重掛輸入框的行
export function mergeCloud(s: State, remote: { notes: unknown[]; gone?: unknown }, now: number) {
  const before = s.notes.slice();
  const notes = ((remote.notes || []) as any[]).filter(r => r && typeof r.id === 'string' && !isUntouchedTutorial(fixNote(r)));
  const gone = fixGone(remote.gone);
  // iCloud 上有真的紙（沒被墓碑擋掉的）＝重裝或換新手機：本機那張沒動過的教學紙是多的，拿掉（從沒上傳過，不立墓碑）
  let spare = 0;
  if (notes.some(r => !(gone[r.id] !== undefined && gone[r.id] >= (validTime(r.mod) ? r.mod : r.updated || 0)))) {
    const keep = s.notes.filter(n => !isUntouchedTutorial(n));
    spare = s.notes.length - keep.length;
    s.notes = keep;
  }
  const r = mergeRemote(s, { notes, gone }, now);
  const retyped = adopt(before, s);
  return { ...r, spare, retyped, changed: r.added + r.taken + r.united + r.removed + spare > 0 };
}

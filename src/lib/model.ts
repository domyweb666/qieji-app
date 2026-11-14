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
  glyph?: string; // 磚正中間的字（2026-11-03 多米：長按選單「改磚上的字」）；沒設＝名字的第一個字（glyphOf）
  // 1.1 完整版功能（2026-11-14 加，只加欄位，舊存檔沒有）：
  // cover＝封面圖的檔名代號（圖檔在手機的 covers 資料夾，lib/covers.ts；只准小寫英數）；
  // locked＝這張上鎖了，打開要 Face ID（lib/lock.ts）。上鎖的紙不上傳 iCloud，所以這個欄位不會出現在 iCloud 的檔案裡
  cover?: string;
  locked?: boolean;
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
// folders＝目錄裡的資料夾（D1，2026-11-02 加）：名字＋裡面的紙照順序。資料夾在座位表裡佔一格，裡面的紙不佔
export type Folder = { id: string; name: string; ids: string[] };
export type State = { sort: SortKey; notes: Note[]; garden: Garden; gone?: Record<string, number>; order?: string[]; orderMod?: number; orderSent?: number; folders?: Folder[]; grid?: number };

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

// 外面進來的紙（iCloud 資料夾裡的檔、舊存檔）欄位型別不一定對（2026-11-04 程式審查）：以前 items 不是陣列、行是 null，
// 整次 iCloud 同步就爆掉、之後每次都爆；名字或行的字是數字，畫面一碰 .trim() 就閃退。
// 字：字串原樣不動（好的紙指紋才不會變）、數字轉成字、其他當成空的；行：不是物件的丟掉
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const idOf = (v: unknown) => (typeof v === 'string' && v ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : uid());

export function fixNote(n: any): Note {
  if (!COLORS[n.color as ColorKey]) n.color = n.color === 'pink' ? 'red' : 'yellow';
  const fixItem = (i: any): Item => ({ id: idOf(i.id), t: str(i.t), done: !!i.done, b: i.b === undefined ? true : !!i.b,
    ...(typeof i.at === 'number' && Number.isFinite(i.at) && i.at > 0 ? { at: i.at } : {}) });
  n.items = (Array.isArray(n.items) ? n.items : []).filter(isObj).map(fixItem);
  n.bin = (Array.isArray(n.bin) ? n.bin : []).filter(isObj).map(fixItem);
  n.title = str(n.title);
  n.body = str(n.body);
  // 磚上的字只留一個字（emoji 也算一個）；空的、不是字串的拿掉，回到用名字的第一個字
  const g = typeof n.glyph === 'string' ? graphemes(n.glyph.trim())[0] : undefined;
  if (g) n.glyph = g; else delete n.glyph;
  // 封面代號會拿去組檔名：只准小寫英數，其他一律拿掉（外面進來的檔不能指到別的路徑）
  if (typeof n.cover !== 'string' || !/^[a-z0-9]{4,40}$/.test(n.cover)) delete n.cover;
  if (n.locked !== true) delete n.locked;
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
    '按住右邊的小點點上下拖，換順序',
    '點左上的名字，換一張紙或開新的一張',
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
  return readState(raw) ?? emptyState();
}
// 讀不出來（沒有存檔、JSON 壞掉、不是茄記的格式）回 null：有存檔卻讀不出來時，store 要先把原本那份另存起來，不能直接拿空的蓋掉
export function readState(raw: string | null): State | null {
  try {
    const s = JSON.parse(raw as string);
    if (s && Array.isArray(s.notes)) {
      s.notes = s.notes.filter(isObj); // 夾在裡面的 null、字串不是紙，丟掉（以前一個 null 就整份讀不出來）
      s.notes.forEach(fixNote);
      s.notes = dedupe(s.notes);
      fixGarden(s);
      if (!SORTS[s.sort as SortKey]) s.sort = 'updated';
      s.gone = fixGone(s.gone);
      return s;
    }
  } catch { /* 壞掉的 JSON：回 null，交給呼叫的人決定 */ }
  return null;
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
// 磚正中間的字：自己設的（glyph），沒設就是名字的第一個字（沒取名是「未」）
export const glyphOf = (n: Note) => n.glyph || Array.from(label(n))[0] || '';
// 把字串切成「看起來一個字」：❤️、🇹🇼、👍🏽、👨‍👩‍👧 這類 emoji 由好幾個碼位組成，也算一個（手機的 JS 引擎沒有 Intl.Segmenter，自己併）
export function graphemes(s: string): string[] {
  const out: string[] = [];
  let afterJoin = false, flagOpen = false;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    const flag = cp >= 0x1F1E6 && cp <= 0x1F1FF;
    const attach = cp === 0x200D || (cp >= 0xFE00 && cp <= 0xFE0F) || (cp >= 0x1F3FB && cp <= 0x1F3FF)
      || (cp >= 0x300 && cp <= 0x36F) || cp === 0x20E3 || (cp >= 0xE0020 && cp <= 0xE007F);
    if (out.length && (attach || afterJoin || (flag && flagOpen))) out[out.length - 1] += ch;
    else out.push(ch);
    afterJoin = cp === 0x200D;
    flagOpen = flag && !flagOpen;
  }
  return out;
}
// 改磚上的字：超過一個字由輸入框當頁擋下（glyphProblem），這裡保險只取第一個；清空＝回到用名字的第一個字。回傳有沒有改
export function setGlyph(n: Note, v: string) {
  const g = graphemes(v.trim())[0];
  if ((g ?? undefined) === n.glyph) return false;
  if (g) n.glyph = g; else delete n.glyph;
  return true;
}
// 磚上的字打超過一個：回傳要提醒的話；沒問題回傳 null（清空也沒問題）
export function glyphProblem(v: string): string | null {
  const k = graphemes(v.trim()).length;
  return k > 1 ? `只能打一個字，現在有 ${k} 個` : null;
}
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
export const PIN_MAX = 5; // 2026-11-03 多米：2 → 5
export const pinnedNotes = (s: State) => s.notes.filter(n => n.pinned && !n.deleted).sort((a, b) => b.updated - a.updated);
// 標題區換張的那幾張（B2 把手的段數、B4 左右滑）：釘選的照建立先後（不照修改時間，改一個字不會換位置），
// 最左邊固定是一張沒釘選的（多米 2026-11-02：釘 1 張＝2 頁、釘 2 張＝3 頁，從釘選那張往回滑要回到原本那張）。
// 現在這張不在釘選裡（沒釘，或舊資料釘超過兩張）就是它；在釘選裡就用 lastFree（最近看的那張沒釘選的），
// 那張被刪了或後來被釘選了，改用最近改過的那張沒釘選的
export function swipeSet(s: State, cur: Note, lastFree?: string | null) {
  const set = s.notes.filter(n => n.pinned && !n.deleted).sort((a, b) => a.created - b.created).slice(0, PIN_MAX);
  if (!set.includes(cur)) return [cur, ...set];
  const free = s.notes.find(n => n.id === lastFree && !n.pinned && !n.deleted)
    ?? s.notes.filter(n => !n.pinned && !n.deleted).sort((a, b) => b.updated - a.updated)[0];
  return free ? [free, ...set] : set;
}
// 切換清單（2026-11-04 改版，點左上清單名升起的面板）：釘選的全部（照建立先後，最多 PIN_MAX），再來最近開過的 RECENT_MAX 張
// （recent＝這台手機最近開過的 id，新的在前；不重複、不含釘選、不含最近刪除裡的）。最近一張都沒記到（剛裝、剛升級）就用最近改過的補
export const RECENT_MAX = 5;
export function switchList(s: State, recent: string[]) {
  const live = (n: Note) => !n.deleted;
  const pinned = s.notes.filter(n => n.pinned && live(n)).sort((a, b) => a.created - b.created).slice(0, PIN_MAX);
  const seen = new Set(pinned.map(n => n.id));
  const out: Note[] = [];
  const take = (n: Note | undefined) => { if (n && live(n) && !seen.has(n.id) && out.length < RECENT_MAX) { seen.add(n.id); out.push(n); } };
  recent.forEach(id => take(s.notes.find(n => n.id === id)));
  s.notes.filter(n => live(n) && !seen.has(n.id)).sort((a, b) => b.updated - a.updated).forEach(take);
  return { pinned, recent: out };
}
export const isEmpty = (n: Note) => !n.title.trim() && (n.type === 'text' ? !n.body.trim() : n.items.every(i => !i.t.trim()));

// q 要先 trim、轉小寫
// 上鎖的紙只比名字：裡面的字搜不到（1.1 個別上鎖）
const hit = (n: Note, q: string) => !q || (n.locked ? n.title : n.title + '\n' + n.body + '\n' + n.items.map(i => i.t).join('\n')).toLowerCase().includes(q);

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

/* ---------------- 換頁標記（2026-11-02，多米選照 iOS：拖到最後一頁右邊緣停一下＝開新的一頁） ---------------- */
// 座位表裡用「|」開頭的 id 當換頁標記：它後面的格子從新的一頁開始排。紙和資料夾的 id 不會有「|」。
// 還沒更新的舊版讀到會在 fixOrder 丟掉（只是頁合回去，紙不會少）
export const BRK = '|';
export const isBreak = (id: unknown): id is string => typeof id === 'string' && id.startsWith(BRK);
export const newBreak = () => BRK + uid();
// 空位（2026-11-03，多米：「清單定死位置，沒法像主畫面想放哪就放哪」，照 iOS 主畫面自由擺放）：座位表裡「.」開頭的 id 佔一格、畫成空的。
// 拖走一張，原本那格變空位、別張不往前補；放到空格就停在那格。每頁最後面的空位、整頁都是空位的不存（fixOrder）。資料夾裡不留空位。
// 舊版讀到會在 fixOrder 丟掉（只是格子合回去，紙不會少）
export const HOLE = '.';
export const isHole = (id: unknown): id is string => typeof id === 'string' && id.startsWith(HOLE);
export const newHole = () => HOLE + uid();
// 刪掉一張（進最近刪除）也留空位（2026-11-03 多米：「刪除、拿出資料夾也改成留空位」）：目錄最上層的紙在座位前面放一個這張專用的空位，
// 在資料夾裡的不放（資料夾裡緊排）。還原時那個空位還挨著它（中間只隔著別張最近刪除的、別的空位）就拿掉，紙站回原本那格、別張不動；
// 空位已經被別張用掉、搬走了就不管，紙照座位回來。永久刪除後空位留著（照 iOS：刪掉的 App 那格空著）
export const holeFor = (noteId: string) => HOLE + noteId;

/* ---------------- 目錄座位表（C1） ---------------- */
// 改字不換位（公理 2：手記得住不動的位置）。舊存檔沒有座位表時，照 C1 之前目錄的樣子編第一次（釘選的在前、再照 sort），
// 打開新版看到的順序才會跟以前一模一樣；在最近刪除裡的紙接在後面（看不到，座位留著，還原就回原位）
const firstSeats = (s: State) => [
  ...visibleNotes(s, { trash: false, filter: 'all', q: '', sort: s.sort }),
  ...s.notes.filter(n => n.deleted).sort((a, b) => b.updated - a.updated),
].map(n => n.id);

// 資料夾（D1）：格式不對的丟掉；裡面不存在的紙、重複的、已經在前一個資料夾裡的拿掉；一張都不剩的資料夾拿掉（多米 2026-11-02：空了就消失）。
// 在最近刪除裡的紙留在資料夾裡（還原回去）。存檔裡、iCloud 上讀來的都可能是壞的，一律走這裡
export const FOLDER_NAME = '新資料夾';
function fixFolders(raw: unknown, ids: Set<string>): Folder[] {
  const used = new Set<string>(), fids = new Set<string>();
  const out: Folder[] = [];
  for (const f of (Array.isArray(raw) ? raw : []) as Partial<Folder>[]) {
    if (!f || typeof f.id !== 'string' || ids.has(f.id) || fids.has(f.id) || !Array.isArray(f.ids)) continue;
    const inner = f.ids.filter(id => typeof id === 'string' && ids.has(id) && !used.has(id) && !!used.add(id));
    if (!inner.length) continue;
    fids.add(f.id);
    out.push({ id: f.id, name: typeof f.name === 'string' && f.name.trim() ? f.name : FOLDER_NAME, ids: inner });
  }
  return out;
}

// 存檔前對一次座位表：表裡有、紙沒有的座位丟掉（永久拿掉的紙），重複的只留第一個；紙有、表裡沒有的補在最後（新的一張、
// 這台沒見過的、匯入的；好幾張時最近改過的在前）。D1：資料夾佔一格（沒座位的補最後），在資料夾裡的紙不佔格。有改才寫回，回傳有沒有改
export function fixOrder(s: State) {
  const ids = new Set(s.notes.map(n => n.id));
  const folders = fixFolders(s.folders, ids);
  const inFolder = new Set(folders.flatMap(f => f.ids)), fids = new Set(folders.map(f => f.id));
  const seen = new Set<string>();
  const kept = (Array.isArray(s.order) ? s.order : firstSeats(s))
    .filter(id => typeof id === 'string' && ((ids.has(id) && !inFolder.has(id)) || fids.has(id) || isBreak(id) || isHole(id)) && !seen.has(id) && !!seen.add(id));
  for (const f of folders) if (!seen.has(f.id)) { kept.push(f.id); seen.add(f.id); }
  for (const n of s.notes.filter(n => !seen.has(n.id) && !inFolder.has(n.id)).sort((a, b) => b.updated - a.updated)) kept.push(n.id);
  // 換頁標記只留「前後兩邊都有看得到的格子」的：最前面、最後面、連在一起、隔開的那頁看不到東西（全在最近刪除）的都拿掉。
  // 空位只留「後面同一頁還有看得到的格子」的：頁尾的空位（下一個換頁標記前、最後面）不存，整頁只有空位的連空位一起拿掉
  const shown = (id: string) => fids.has(id) || s.notes.some(n => n.id === id && !n.deleted);
  const order: string[] = [];
  let since = false; // 上一個標記（或最前面）之後有沒有看得到的格子
  let held: string[] = []; // 這一頁裡還沒等到後面有看得到的格子的空位
  for (const id of kept) {
    if (isHole(id)) { held.push(id); continue; }
    if (!isBreak(id)) {
      if (shown(id)) { order.push(...held); held = []; since = true; }
      order.push(id);
      continue;
    }
    held = [];
    if (since) { order.push(id); since = false; }
  }
  // 最後一個標記後面沒有看得到的格子：拿掉
  for (let i = order.length - 1; i >= 0; i--) {
    if (isBreak(order[i])) { order.splice(i, 1); break; }
    if (shown(order[i])) break;
  }
  const old = s.order;
  const sameFolders = JSON.stringify(folders) === JSON.stringify(s.folders ?? []);
  if (Array.isArray(old) && old.length === order.length && old.every((id, i) => id === order[i]) && sameFolders) return false;
  s.order = order;
  if (!sameFolders) s.folders = folders;
  return true;
}

// 拖完換座位（C4）：visible＝目錄裡看得到的格子排好的新順序（紙、資料夾、空位、換頁標記，照 seatedLayout 的樣子）。座位表裡「看得到的格子」那些位子
// 依序換成新順序，看不到的（最近刪除）留在原位，還原時照樣回到附近。C2：有換到位置就記下親手排的時間（比照抄來的那份新，同步時才贏）。
// 2026-11-03 自由擺放：空位、換頁標記不看在不在 visible 裡都算「看得到的位子」——拖的時候會補新的空位、用掉舊的空位，舊的沒用到就不留；
// 所以 visible 一定要是整排（含空位和換頁標記），只給紙的順序會把換頁標記吃掉
export function reseat(s: State, visible: string[], now = Date.now()) {
  fixOrder(s);
  const set = new Set(visible);
  let k = 0;
  const old = s.order!;
  const next: string[] = [];
  for (const id of old) {
    if (!set.has(id) && !isHole(id) && !isBreak(id)) { next.push(id); continue; }
    if (k < visible.length) next.push(visible[k++]);
  }
  // visible 比座位表裡的多（剛開新的一頁、補了空位）：多出來的接在最後
  if (k < visible.length) next.push(...visible.slice(k));
  s.order = next;
  if (s.order.length !== old.length || s.order.some((id, i) => id !== old[i])) s.orderMod = Math.max(now, (s.orderMod ?? 0) + 1);
  fixOrder(s);
}

// 座位攤平：資料夾那一格換成它裡面的紙（D1，搜尋時資料夾裡的紙就排在資料夾的位置）
const okFolders = (s: State) => (Array.isArray(s.folders) ? s.folders : []).filter(f => f && typeof f.id === 'string' && Array.isArray(f.ids));
function flatSeats(s: State) {
  if (!Array.isArray(s.order)) return firstSeats(s);
  const fs = new Map(okFolders(s).map(f => [f.id, f.ids] as const));
  return s.order.flatMap(id => fs.get(id) ?? [id]);
}

// 目錄裡的紙（不含最近刪除），照座位排；搜尋也照座位。純函式不改 state：還沒寫進座位表的（剛開的新的一張）先排在最後，存檔時 fixOrder 補上
export function seatedNotes(s: State, q: string) {
  const seat = new Map(flatSeats(s).map((id, i) => [id, i] as const));
  const k = q.trim().toLowerCase();
  const end = seat.size;
  return s.notes.filter(n => !n.deleted && hit(n, k))
    .sort((a, b) => (seat.get(a.id) ?? end) - (seat.get(b.id) ?? end) || b.updated - a.updated);
}

// 搜尋筆記（多米 2026-11-03：「搜尋清單」其實早就找得到每一行，但結果只列整張磚、看不出是哪一行，改成直接列出符合的行）：
// 照目錄的座位順序，每張列出名字有沒有中、中了哪幾行（劃掉的也算，還在紙上）。舊的文字筆記（body）沒有行，整段當一行看
export type LineHit = { note: Note; title: boolean; lines: { id: string; t: string; done: boolean }[] };
export function searchLines(s: State, q: string): LineHit[] {
  const k = q.trim().toLowerCase();
  if (!k) return [];
  const has = (t: string) => t.toLowerCase().includes(k);
  return seatedNotes(s, k).map(n => ({
    note: n,
    title: has(n.title),
    lines: n.locked ? [] : [
      ...n.items.filter(i => has(i.t)).map(i => ({ id: i.id, t: i.t, done: !!i.done })),
      ...(n.body && has(n.body) ? [{ id: '', t: n.body, done: false }] : []),
    ],
  }));
}

/* ---------------- 資料夾（D1） ---------------- */
// 目錄最上層的一格：一張紙，或一個資料夾（notes＝裡面看得到的紙，照資料夾裡的順序）。一張都看不到的資料夾（全在最近刪除）不出現
// brk＝換頁標記那一格（seatedLayout 才有，2026-11-02）：不畫成磚，排頁時從它後面開新的一頁。hole＝空位那一格（2026-11-03）：佔一格、畫成空的
export type Entry = { id: string; note?: Note; folder?: Folder; notes: Note[]; brk?: true; hole?: true };
export function seatedEntries(s: State): Entry[] {
  const owner = new Map<string, Folder>();
  for (const f of okFolders(s)) for (const id of f.ids) if (!owner.has(id)) owner.set(id, f);
  const out: Entry[] = [], open = new Map<string, Entry>();
  for (const n of seatedNotes(s, '')) {
    const f = owner.get(n.id);
    if (!f) { out.push({ id: n.id, note: n, notes: [n] }); continue; }
    const e = open.get(f.id);
    if (e) { e.notes.push(n); continue; }
    const ne = { id: f.id, folder: f, notes: [n] };
    open.set(f.id, ne);
    out.push(ne);
  }
  return out;
}
export const folderOf = (s: State, noteId: string) => okFolders(s).find(f => f.ids.includes(noteId));

// 目錄格子（2026-11-02）：seatedEntries 再把換頁標記照座位表的位置插進來（只插在兩格之間，最前面、連續的不插）。
// 釘選的紙跟一般的一起排（多米 2026-11-02 拿掉 Dock：放下面就不能放資料夾）。
// 2026-11-03 空位也照座位表的位置插進來，只插在同一頁後面還有格子的地方（頁尾的、整頁都是空位的不插，跟 fixOrder 同一套）
export function seatedLayout(s: State): Entry[] {
  const all = seatedEntries(s);
  if (!Array.isArray(s.order)) return all;
  const pos = new Map(s.order.map((id, i) => [id, i] as const));
  const marks = s.order.flatMap((id, i) => (isBreak(id) || isHole(id) ? [[id, i] as const] : []));
  const out: Entry[] = [];
  let b = 0;
  for (const e of all) {
    const p = pos.get(e.id) ?? Infinity;
    let cut: string | null = null;
    let held: Entry[] = []; // 這格前面、同一頁的空位（碰到換頁標記就作廢：那是上一頁頁尾的）
    while (b < marks.length && marks[b][1] < p) {
      const id = marks[b++][0];
      if (isBreak(id)) { cut = id; held = []; } else held.push({ id, notes: [], hole: true });
    }
    if (cut && out.length) out.push({ id: cut, notes: [], brk: true });
    out.push(...held, e);
  }
  return out;
}

// 建資料夾、放進、移出、改名都算親手排（C2：同步時後排的那台為準）
const touchLayout = (s: State, now: number) => { s.orderMod = Math.max(now, (s.orderMod ?? 0) + 1); };
// 磚改成一排 GRID_COLS 個（2026-11-03 多米：1×1，跟 App 一樣）：寬磚時期留的空位、換頁標記照「第幾格」存，一排四個之後位置全對不上，
// 多米選「空格清掉、照順序排緊」——只清一次（記在 s.grid），清單和資料夾的先後不變。算親手排：同步時這台排緊的版本贏，別台裝了新版也會自己清
export const GRID_COLS = 4;
export function packGrid(s: State, now = Date.now()) {
  if (s.grid === GRID_COLS) return false;
  s.grid = GRID_COLS;
  if (Array.isArray(s.order)) s.order = s.order.filter(id => !isHole(id) && !isBreak(id));
  touchLayout(s, now);
  fixOrder(s);
  return true;
}

// 從資料夾拿走一張之後：看得到的只剩一張就拆掉資料夾，剩下的紙（含最近刪除的）照原本順序站在資料夾那格
// （照 iOS 拖出來只剩一個 App 檔案夾就變回那個 App，多米 2026-11-02 看錄影選）。全部在最近刪除的不拆（還原時才回得來）
function dissolveIfOne(s: State, f: Folder) {
  const shown = f.ids.filter(id => s.notes.some(n => n.id === id && !n.deleted));
  const at = s.order!.indexOf(f.id);
  if (shown.length !== 1 || at < 0) return;
  s.order!.splice(at, 1, ...f.ids);
  s.folders = s.folders!.filter(x => x !== f);
}

// 長按選單「放進資料夾…」→ 新資料夾：在那張紙的位置開一個資料夾，裡面只有它
export function newFolder(s: State, noteId: string, now: number, id = 'f' + uid()): Folder {
  fixOrder(s);
  const f: Folder = { id, name: FOLDER_NAME, ids: [noteId] };
  const from = folderOf(s, noteId);
  if (from) { from.ids = from.ids.filter(x => x !== noteId); dissolveIfOne(s, from); }
  const at = s.order!.indexOf(noteId);
  if (at >= 0) s.order![at] = id; else s.order!.push(id);
  s.folders = [...(s.folders ?? []), f];
  touchLayout(s, now);
  fixOrder(s);
  return f;
}
// 放進現有的資料夾：排在裡面最後一張。leave＝原本那格留空位（從目錄放進來的；剛從別的資料夾拿出來、臨時排在那裡的不留，給 false）
export function intoFolder(s: State, noteId: string, folderId: string, now: number, leave = true) {
  fixOrder(s);
  const f = s.folders?.find(x => x.id === folderId);
  if (!f || f.ids.includes(noteId)) return false;
  const from = folderOf(s, noteId);
  if (from) { from.ids = from.ids.filter(x => x !== noteId); dissolveIfOne(s, from); }
  // 原本那格留空位（2026-11-03 自由擺放：疊進資料夾、放進資料夾，別張不往前補，照 iOS）；頁尾的空位 fixOrder 會清掉
  s.order = leave ? s.order!.map(x => (x === noteId ? newHole() : x)) : s.order!.filter(x => x !== noteId);
  f.ids.push(noteId);
  touchLayout(s, now);
  fixOrder(s);
  return true;
}
// 移出資料夾：to.hole＝放進這個空位、to.after＝排在這格後面（2026-11-03 自由擺放：目錄算好那頁第一個空格給進來，別張不往後推）；
// 沒給、或找不到就排在資料夾後面一格。是最後一張就資料夾拿掉、紙站在資料夾原本的位置；看得到的只剩一張也拆掉（dissolveIfOne）
export function outOfFolder(s: State, noteId: string, now: number, to?: { hole?: string; after?: string }) {
  fixOrder(s);
  const f = folderOf(s, noteId);
  if (!f) return false;
  f.ids = f.ids.filter(x => x !== noteId);
  const at = s.order!.indexOf(f.id);
  if (f.ids.length) {
    const h = to?.hole && isHole(to.hole) ? s.order!.indexOf(to.hole) : -1;
    const a = to?.after ? s.order!.indexOf(to.after) : -1;
    if (h >= 0) s.order![h] = noteId;
    else s.order!.splice((a >= 0 ? a : at) + 1, 0, noteId);
    dissolveIfOne(s, f);
  }
  else { s.order![at] = noteId; s.folders = s.folders!.filter(x => x !== f); }
  touchLayout(s, now);
  fixOrder(s);
  return true;
}
// 新的一張放進目錄第一個空格（2026-11-03 多米：「第一頁還有空缺就優先補上」，不然會跑到第二頁去）：to.hole＝放進這個空位、
// to.after＝排在這格後面（那頁最後一張後面、這頁還放得下；第幾頁放得下幾格只有目錄知道，所以由目錄算好給進來）。
// 沒給、或找不到就照舊排最後。放進去算親手排（C2：同步時這台的排法才贏，不然別台的座位表會把它排回最後）。回傳有沒有放
export function seatNew(s: State, noteId: string, now: number, to?: { hole?: string; after?: string }) {
  fixOrder(s);
  const o = s.order!;
  const h = to?.hole && isHole(to.hole) ? o.indexOf(to.hole) : -1;
  const a = to?.after && to.after !== noteId ? o.indexOf(to.after) : -1;
  if (h < 0 && a < 0) return false;
  s.order = o.filter(x => x !== noteId);
  if (h >= 0) s.order[s.order.indexOf(to!.hole!)] = noteId;
  else s.order.splice(s.order.indexOf(to!.after!) + 1, 0, noteId);
  touchLayout(s, now);
  fixOrder(s);
  return true;
}
// 切換清單的「新的一張」（F3，2026-11-04）放哪：目錄裡第一個空位。一頁放幾格只有目錄打開時量得到，所以不看「那頁最後一張後面還放不放得下」：
// 沒有空位就不放，存檔時 fixOrder 排在最後。只有前面的頁有換頁標記又沒放滿時，會跟目錄的 ＋ 放的地方不一樣。回傳有沒有放
export function seatFirstHole(s: State, noteId: string, now: number) {
  const hole = seatedLayout(s).find(e => e.hole);
  return hole ? seatNew(s, noteId, now, { hole: hole.id }) : false;
}
// 刪掉一張（進最近刪除）時呼叫：在它的座位前面放它專用的空位（見 holeFor）。在資料夾裡的、已經有的不放。回傳有沒有放
export function leaveHole(s: State, noteId: string, now: number) {
  fixOrder(s);
  const at = s.order!.indexOf(noteId);
  if (at < 0 || s.order!.includes(holeFor(noteId))) return false;
  s.order!.splice(at, 0, holeFor(noteId));
  touchLayout(s, now);
  fixOrder(s);
  return true;
}
// 還原時呼叫：它專用的空位還挨著它（中間只隔著別張最近刪除的、別的空位：空位長得都一樣，連刪幾張時整理座位表會換它們的先後）就拿掉，
// 紙站回那格、別張不動。回傳有沒有拿掉
export function fillHole(s: State, noteId: string, now: number) {
  fixOrder(s);
  const o = s.order!, at = o.indexOf(noteId), h = o.indexOf(holeFor(noteId));
  if (at < 0 || h < 0) return false;
  const between = o.slice(Math.min(at, h) + 1, Math.max(at, h));
  if (!between.every(id => isHole(id) || s.notes.some(n => n.id === id && n.deleted))) return false;
  o.splice(h, 1);
  touchLayout(s, now);
  fixOrder(s);
  return true;
}

// D4（照 iOS）：把紙放進資料夾的指定位置，也用來在資料夾裡換順序。visible＝放完之後資料夾裡看得到的紙（不含最近刪除）想要的順序，
// 要包含這張。在最近刪除裡的紙留在原本的位子（跟 reseat 同一個做法）。不在這個資料夾的先拿過來（從目錄或別的資料夾）
export function placeInFolder(s: State, noteId: string, folderId: string, visible: string[], now: number) {
  fixOrder(s);
  const f = s.folders?.find(x => x.id === folderId);
  if (!f || !visible.includes(noteId) || s.folders!.some(x => x.id === noteId)) return false; // 資料夾不能放進資料夾
  // 先驗再動：visible 只能有這張和這個資料夾原本的紙、不重複（拖的時候資料夾被同步改了就會對不上），對不上就什麼都不改。
  // 原本是拿過來之後才驗，驗不過回 false 時紙已經搬進來了，畫面不重畫也不存檔（2026-11-02 程式審查）
  if (new Set(visible).size !== visible.length || visible.some(id => id !== noteId && !f.ids.includes(id))) return false;
  if (!f.ids.includes(noteId) && !intoFolder(s, noteId, folderId, now)) return false;
  // 拿過來時原本的資料夾空了會被 fixOrder 整理掉，資料夾清單換成新的物件：重新拿一次
  const live = s.folders!.find(x => x.id === folderId)!;
  const set = new Set(visible);
  let k = 0;
  live.ids = live.ids.map(id => (set.has(id) ? visible[k++] : id));
  touchLayout(s, now);
  fixOrder(s);
  return true;
}
// D4（照 iOS）：把紙放到目錄的指定位置；在資料夾裡的先拿出來（空了資料夾就不見）。visible＝放完之後目錄最上層看得到的那幾格（紙和資料夾）想要的順序
export function placeTop(s: State, noteId: string, visible: string[], now: number) {
  if (folderOf(s, noteId)) outOfFolder(s, noteId, now);
  reseat(s, visible, now);
  touchLayout(s, now);
}

// 改資料夾名：清空或沒變就不改（維持原名）
export function renameFolder(s: State, folderId: string, name: string, now: number) {
  const f = s.folders?.find(x => x.id === folderId);
  if (!f || !name.trim() || name === f.name) return false;
  f.name = name;
  touchLayout(s, now);
  return true;
}

/* ---------------- 目錄排列同步（C2） ---------------- */
// iCloud 茄記資料夾裡的 layout.json：{ order, mod }。故意沒有 id 欄位：還沒更新的舊版把它當紙讀進來時，mergeCloud 會濾掉。
// 多米 2026-11-02 定：只有親手排才算改排列（新的一張補最後、永久拿掉不算）；兩台都排過，後排的那台為準；對不上的紙補在最後
// D1：資料夾一起放在這裡（多米 2026-11-02 選「跟排列一起」），同一條規則
export type Layout = { order: string[]; mod: number; folders: Folder[] };

// 外面讀進來的 layout.json 先驗：格式不對回 null（當成 iCloud 上沒有）
export function readLayout(raw: unknown): Layout | null {
  const r = raw as { order?: unknown; mod?: unknown; folders?: unknown } | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r.order)) return null;
  if (typeof r.mod !== 'number' || !Number.isFinite(r.mod) || r.mod < 0) return null;
  const folders = (Array.isArray(r.folders) ? r.folders : []) as Partial<Folder>[];
  return {
    order: r.order.filter((id): id is string => typeof id === 'string'), mod: r.mod,
    folders: folders.filter(f => f && typeof f.id === 'string' && Array.isArray(f.ids))
      .map(f => ({ id: f.id!, name: typeof f.name === 'string' ? f.name : FOLDER_NAME, ids: f.ids!.filter((id): id is string => typeof id === 'string') })),
  };
}

// 這台有自己的排列（升級上來的、已經有真的紙）：iCloud 上沒有 layout.json 時拿這台的當第一份，mod 從 0 起算（誰親手排過都比它新）。
// 剛裝好、只有教學紙的不算：重裝時資料夾清單可能還沒列出 layout.json，先傳一份上去會把原本的排列蓋掉
export function ownLayout(s: State) {
  if (s.orderMod === undefined && s.notes.some(n => !isUntouchedTutorial(n))) s.orderMod = 0;
}

// 要傳上 iCloud 的排列：這台的排列跟上次對上 iCloud 的不一樣才傳
export function layoutToSend(s: State): Layout | null {
  if (!Array.isArray(s.order) || s.orderMod === undefined || s.orderMod === s.orderSent) return null;
  return { order: s.order.slice(), mod: s.orderMod, folders: (s.folders ?? []).map(f => ({ ...f, ids: f.ids.slice() })) };
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
  // 這台的比 iCloud 那份新就留著，傳過了也一樣：拉到一半這台剛好傳了新的上去，拉回來的是舊的那份，不能拿它蓋掉（2026-11-02 錄影回報後查到）。
  // 傳過了卻讀到比較舊的：iCloud 上那份可能真的是舊的（被蓋過、沒寫成），記成沒傳再傳一次，別台才拿得到新的（2026-11-02 程式審查）
  if (mine !== undefined && mine > r.mod) {
    if (s.orderSent === mine) delete s.orderSent;
    return false;
  }
  const before = JSON.stringify([s.order ?? [], s.folders ?? []]);
  s.order = r.order;
  s.folders = r.folders;
  s.orderMod = s.orderSent = r.mod;
  fixOrder(s);
  return JSON.stringify([s.order, s.folders]) !== before;
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

/* ---------------- 一張紙最多幾行（2026-11-03 多米：每張清單上限一千筆） ---------------- */
// 記一行、Return 開新行、貼上拆行、搬行進來、從最近刪除救回來都先看這裡；滿了就擋下、跳提示。
// 不擋的兩個：iCloud 同步進來的（擋了會丟掉別台寫的字）、收起輸入框時打到一半的字（2-8：字不能丟），這兩個可能暫時超過一點
export const LINE_MAX = 1000;
export const FULL_MSG = `這張已經滿 ${LINE_MAX} 行，開一張新的吧`;
export const roomOf = (n: Note) => Math.max(0, LINE_MAX - n.items.length);

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
// 「清掉劃掉的行」的復原（2026-11-04 程式審查修）：只把清掉的那幾行（removed）放回去，接在它原本前面那行的後面
// （前面那行也不在了就往前找，都不在就放最上面）。這段時間新記的、改的、刪的都照留。
// 以前是整份換回清掉之前的陣列：中間新記的行會不見，中間刪掉的行會同時出現在紙上和最近刪除裡（同一個 id 兩份）。
// 已經回到紙上、在最近刪除裡的不重放。回傳放回幾行
export function putBack(n: Note, before: Item[], removed: Set<string>) {
  const here = new Set(n.items.map(i => i.id)), binned = new Set(n.bin.map(i => i.id));
  const after = new Map<string | null, Item[]>(); // 接在哪一行後面（null＝最上面）→ 要放回的行，照原本的先後
  let anchor: string | null = null, back = 0;
  for (const it of before) {
    if (here.has(it.id)) { anchor = it.id; continue; }
    if (!removed.has(it.id) || binned.has(it.id)) continue;
    const list = after.get(anchor);
    if (list) list.push(it); else after.set(anchor, [it]);
    back++;
  }
  if (!back) return 0;
  const out = [...(after.get(null) ?? [])];
  for (const it of n.items) { out.push(it); const list = after.get(it.id); if (list) out.push(...list); }
  n.items = out;
  return back;
}
// 「清掉劃掉的行」（F1，2026-11-04）：劃掉的行全部進這張紙的最近刪除，跟刪單行同一套（時間記清掉那一刻，30 天自動清）。
// 照紙上的先後排在最近刪除的最前面。回傳清掉的那幾行
export function binDone(n: Note, now: number): Item[] {
  const gone = n.items.filter(i => i.done);
  if (!gone.length) return gone;
  n.items = n.items.filter(i => !i.done);
  for (const it of gone) it.at = now;
  n.bin.unshift(...gone);
  return gone;
}
// 「清掉劃掉的行」的復原（F1）：ids 裡還在最近刪除的那幾行拿出來，照 putBack 放回原位。這幾秒內從最近刪除還原過、永久刪掉的不動。
// 放回去的是最近刪除裡那一份（同步合併過的話跟 before 裡的不是同一個物件）。回傳放回幾行
export function unbinDone(n: Note, before: Item[], ids: Set<string>): number {
  const pulled = new Map<string, Item>();
  n.bin = n.bin.filter(it => {
    if (!ids.has(it.id)) return true;
    delete it.at;
    pulled.set(it.id, it);
    return false;
  });
  if (!pulled.size) return 0;
  return putBack(n, before.map(it => pulled.get(it.id) ?? it), new Set(pulled.keys()));
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
    if (o.trash) push('刪掉的清單', n);
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

// 指紋不重算（2026-11-04 效能，程式審查量過）：每次存檔、每次拉 iCloud 都要對每張紙的指紋，以前每次都從頭算
// （照鍵名排好、整份字串跑兩次雜湊），1000 行的紙一張就要幾毫秒，打字停一下、回到 app 都要全部重算一遍。
// 改成先比 JSON.stringify（原生做的，快很多）：跟上次對過的時候一字不差，指紋就一定一樣，不用再算；不一樣才重算，結果跟以前一模一樣。
// 本機的紙照物件記（WeakMap，紙拿掉就跟著放掉）；iCloud 拉下來的每次都是新物件，照 id 記上次那份
const seenLocal = new WeakMap<Note, string>();
let seenRemote = new Map<string, { json: string; h: string }>();

// 存檔前呼叫：內容變了的紙記下 mod＝現在。還沒算過指紋的（舊存檔、剛開的新紙）mod 從 updated 起算，
// 不然升級後第一次存檔每張紙都變成「剛剛改的」，跟 iCloud 上的版本比會亂贏。回傳變了幾張
export function stampMods(s: State, now: number) {
  let changed = 0;
  for (const n of s.notes) {
    const json = JSON.stringify(n);
    if (seenLocal.get(n) === json) continue; // 上次對完之後一個字都沒動：h 還是對的
    const f = fingerprint(n);
    if (n.h === f) { seenLocal.set(n, json); continue; }
    n.mod = n.h === undefined ? (validTime(n.mod) ? n.mod : n.updated || now) : now;
    n.h = f;
    seenLocal.set(n, JSON.stringify(n)); // h、mod 改過了，記改完的樣子
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
// 上鎖的紙不傳（多米 2026-11-14 定：鎖的紙只存在這支手機，「檔案」app 裡看不到）
export function pendingUploads(s: State) { return s.notes.filter(n => n.h !== n.sh && !n.locked && !isUntouchedTutorial(n)); }

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
  const seen = new Map<string, { json: string; h: string }>(); // 這次拉到的（下次比對用；這次沒拉到的 id 就不留）
  for (const r0 of remote.notes || []) {
    if (!r0 || typeof r0.id !== 'string') continue;
    const r = fixNote(r0);
    delete r.locked; // 上鎖只算這支手機的事，iCloud 來的檔不能把這台的紙鎖上（正常也不會有：上鎖的紙不上傳）
    const json = JSON.stringify(r), last = seenRemote.get(r.id);
    r.h = last && last.json === json ? last.h : fingerprint(r); // iCloud 上那份跟上次拉到的一字不差：指紋照用
    seen.set(r.id, { json, h: r.h });
    if (!validTime(r.mod)) r.mod = r.updated || 0;
    const o = theirs.get(r.id);
    if (!o || (r.mod ?? 0) > (o.mod ?? 0)) theirs.set(r.id, r);
  }
  seenRemote = seen;
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
    // 這台上鎖的紙，別台又把它傳回 iCloud（別台不知道這台鎖了）：內容照合，但鎖要留著，不能被別台的版本解開
    if (l.sh !== undefined && l.h === l.sh) { r.sh = r.h; if (l.locked) r.locked = true; out.push(r); taken++; continue; } // 只有 iCloud 那邊改了
    if (l.sh !== undefined && r.h === l.sh) { out.push(l); push.push(l.id); continue; }       // 只有本機改了
    // 兩邊都改了（或這台從沒跟 iCloud 對過、內容又不一樣）：合起來，比兩邊都新，要上傳
    const m = (r.mod ?? 0) > (l.mod ?? 0) ? unite(r, l) : unite(l, r);
    if (l.locked) m.locked = true; else delete m.locked;
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

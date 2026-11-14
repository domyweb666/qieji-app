// iCloud 同步的傳輸層：S2 上傳、S3 下載（2026-11-01）。規則（合併、墓碑、教學紙）全在 model.ts，這裡只搬檔案。
// 「檔案 › iCloud 雲碟 › 茄記」裡一張紙一個 <id>.json，墓碑合在同一層的 gone.json。
// 靜靜做：iCloud 沒登入、雲碟關掉、讀寫失敗都不跳提示，下次存檔、回到前景或 iCloud 變成可用時再試（規劃第八節）。
// 只有 iOS 的開發版／正式版有原生模組：網頁、Android 不做；Expo Go 沒有模組，第一次載入失敗之後就不再試。
// S4：永久刪除的紙，墓碑寫進 gone.json 之後把 iCloud 上那張的檔案也拿掉（墓碑之後別台又改過的留著）。
// C2：目錄排列（座位表）是同一層的 layout.json，規則在 model.mergeLayout。
// S5：每個原生呼叫都有逾時。讀一個還沒下載到這台的檔案時，原生那邊會等 iCloud 下載完（套件註解也這樣寫）；
// 離線時會一直等，「拉完才准上傳」的閘門就永遠不開。逾時就當這次拿不到：請 iCloud 下載、5 分鐘內不再讀那個檔，下次再試
import { Platform } from 'react-native';
import type { CloudStorage as CloudStorageClass } from 'react-native-cloud-storage';
import { cloudFileBuried, layoutToSend, markLayoutSent, markSynced, pendingUploads, readLayout, remotePrint, type State } from './model';

type Cloud = InstanceType<typeof CloudStorageClass>;
let cloud: Cloud | null | undefined;

const WAIT = 2000; // 最後一次存檔之後等這麼久才傳（打字中每 0.25 秒存一次，不必每次都傳）
const GONE = 'gone.json';
const LAYOUT = 'layout.json';
const NOT_FOUND = 'ERR_FILE_NOT_FOUND';
const OP_LIMIT = 10_000;      // 一次讀寫最多等這麼久
const LIST_LIMIT = 35_000;    // 列資料夾：原生那邊自己最多等 30 秒，多給一點
const PULL_LIMIT = 60_000;    // 整次拉取最多等這麼久，超過就當這次拉不了、照樣放行上傳（上傳前還有比對指紋擋著）
const STUCK_RETRY = 5 * 60_000; // 讀到逾時的檔案，這麼久之內不再讀（逾時的原生呼叫還卡在背景，一直重讀會越堆越多）
// 拉的時候同時讀幾個檔。原本一個一個讀，紙一多（或有幾個要等到逾時）一次拉要好幾十秒，
// 拉的空檔越長，越容易跟這台的上傳撞在一起（2026-11-02 程式審查）；同時讀太多又怕原生那邊塞住，先開 4 條
const PULL_PARALLEL = 4;

// store 在載入時接上：synced＝有紙傳上去、sh 改了，要再存一次檔；pull＝去 iCloud 拉一次合進來
let hooks: { synced: () => void; pull: () => void } | null = null;
let job: State | null = null; // 最新一次存檔交過來的
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false, again = false;
let ready = false;   // 打開 app 後第一次拉完（或確定拉不了）才准上傳：先傳會拿舊的蓋掉別台剛改的
let dirReady = false;
let goneSent = '';   // 上次寫進 gone.json 的本機墓碑（只記在記憶體：重開 app 會再合一次，沒關係）
const stuck = new Map<string, number>(); // 讀到逾時的檔名 → 什麼時候逾時的
let paused = false; // S5：iCloud 看起來換了一個、使用者還沒說要不要放進去：不上傳
// 1.1 片 B1（🔍 送審前外部審查）：iCloud 同步是完整版功能。allowed＝買了、而且使用者沒在設定頁把同步關掉（lib/access.ts 決定）。
// 不准的時候：不上傳、不拉回、不清檔，手機上的紙和 iCloud 雲碟裡的檔案一個都不動。預設不准（還不知道買了沒就先不動，寧可晚一點同步）
let allowed = false;
let lastSync: number | null = null; // 這次打開 app 之後，最近一次跟 iCloud 對上的時間（設定頁狀態那行用）
export const cloudSyncedAt = () => lastSync;
export function setCloudAllowed(on: boolean) {
  if (allowed === on) return;
  allowed = on;
  if (!on) { clearTimeout(timer); return; }
  // 剛變成准：一定先拉再傳（鎖住期間別台可能改過）。ready 收回去，等這次拉完 store 會再打開；
  // 排到下一輪再拉：正好有一次被擋掉的拉取還沒收尾的話，讓它先結束
  ready = false;
  setTimeout(() => hooks?.pull(), 0);
}

function load(): Cloud | null {
  if (cloud !== undefined) return cloud;
  if (Platform.OS !== 'ios') return (cloud = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 只有 iOS 才載，import 做不到
    const m = require('react-native-cloud-storage') as typeof import('react-native-cloud-storage');
    const c = new m.CloudStorage(m.CloudStorageProvider.ICloud, { scope: m.CloudStorageScope.Documents });
    // 剛開 app 時 iCloud 可能還沒準備好、或使用者之後才登入：變成可用就拉一次（拉完會接著傳）
    c.subscribeToCloudAvailability(ok => { if (ok) hooks?.pull(); });
    cloud = c;
  } catch (e) {
    console.warn('iCloud 模組載入失敗（Expo Go 沒有，開發版才有）：', e);
    cloud = null;
  }
  return cloud;
}

const code = (e: unknown) => (e as { code?: string } | null)?.code;
const TIMEOUT = 'TIMEOUT';
function within<T>(p: Promise<T>, ms = OP_LIMIT): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error('iCloud 逾時'), { code: TIMEOUT })), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}
const isStuck = (name: string) => { const t = stuck.get(name); return t !== undefined && Date.now() - t < STUCK_RETRY; };
// 讀一個檔：逾時就記下來、請 iCloud 下載，往外丟同一個錯
async function read(c: Cloud, name: string) {
  try {
    const text = await within(c.readFile(name));
    stuck.delete(name);
    return text;
  } catch (e) {
    if (code(e) === TIMEOUT) { stuck.set(name, Date.now()); c.triggerSync(name).catch(() => {}); }
    throw e;
  }
}
const warn = (what: string, e: unknown) => { if (__DEV__) console.warn(`iCloud ${what}失敗（下次再試）：`, e); };

export function initCloud(h: { synced: () => void; pull: () => void }) {
  hooks = h;
  return !!load();
}

function schedule(ms: number) {
  clearTimeout(timer);
  timer = setTimeout(run, ms);
}

// 存檔成功後呼叫。soon＝app 正要進背景，不等 2 秒（進背景之後 JS 很快就停了）
export function pushCloud(s: State, soon = false) {
  if (!load()) return;
  job = s; // 不准同步時也記著：之後准了，拉完就會把這份傳上去
  if (!allowed) return;
  schedule(soon ? 0 : WAIT);
}

// S5：暫停／恢復上傳（換了 iCloud 等使用者回答時）
export function pauseCloud(p: boolean) {
  paused = p;
  if (!p && job) schedule(0);
}

// 現在 iCloud 能不能用（S5「iCloud 沒開」提示前再確認一次）；沒有模組當成不適用，回 true 不提示
export async function cloudOn() {
  const c = load();
  if (!c) return true;
  try { return await within(c.isCloudAvailable()); } catch { return true; }
}

// store 合完一次（或確定這次拉不了）之後呼叫：從這一刻起准上傳，等著的馬上傳
export function cloudPulled() {
  ready = true;
  if (job) schedule(0);
}

async function run() {
  if (running) { again = true; return; } // 正在傳：傳完再跑一輪
  running = true;
  try {
    do { again = false; await once(); } while (again);
  } catch (e) {
    warn('上傳', e);
  } finally {
    running = false;
  }
}

async function once() {
  const c = cloud, s = job;
  if (!c || !s || !ready || paused || !allowed) return;
  const notes = pendingUploads(s);
  const gone = s.gone ?? {};
  const goneNow = JSON.stringify(gone);
  const goneDirty = goneNow !== goneSent && Object.keys(gone).length > 0;
  const lay = layoutToSend(s);
  if (!notes.length && !goneDirty && !lay) return;
  if (!(await within(c.isCloudAvailable()))) return; // 沒登入或雲碟關掉：等可用的通知

  if (!dirReady) { await within(c.mkdir('')); dirReady = true; } // 容器裡的 Documents 第一次不一定存在

  let synced = 0, conflict = false;
  for (const n of notes) {
    if (!allowed) return; // 傳到一半被鎖住（退款）：剩下的不傳，也不往下清檔
    const path = `${n.id}.json`;
    // 蓋之前先看 iCloud 上那份：不是上次傳的（sh）也不是現在這份（h）＝別台改過、還沒拉下來。
    // 這時候蓋下去，別台的改動就只剩別台手上有；改成先拉下來合併（合完會再存檔、再傳）
    if (isStuck(path)) continue; // 上次讀到逾時（iCloud 那份還沒下載下來）：這張等一下再傳
    let there: string | null = null;
    try {
      there = await read(c, path);
    } catch (e) {
      if (code(e) !== NOT_FOUND) { warn('讀檔', e); continue; } // 還沒下載下來、逾時：這張這輪先不傳
    }
    if (there !== null) {
      let print: string | null = null;
      try { print = remotePrint(JSON.parse(there)); } catch { /* 壞掉的檔案：蓋掉 */ }
      if (print !== null && print !== n.sh && print !== n.h) { conflict = true; continue; }
    }
    // 指紋與內容在同一刻取；sh 是這台自己的記號，不傳上去
    const h = n.h;
    const { sh: _sh, ...paper } = n;
    await within(c.writeFile(path, JSON.stringify(paper)));
    markSynced(n, h);
    synced++;
  }

  // C2：排列。蓋之前先看 iCloud 上那份：比這台新＝別台後來排過、還沒拉下來，不蓋、改成先拉。
  // 讀不到（還沒下載下來、逾時）這輪先不傳；檔案不存在或壞掉才直接寫
  if (lay && !isStuck(LAYOUT)) {
    try {
      let theirs: ReturnType<typeof readLayout> = null;
      try {
        theirs = readLayout(JSON.parse(await read(c, LAYOUT)));
      } catch (e) {
        if (!(e instanceof SyntaxError) && code(e) !== NOT_FOUND) throw e;
      }
      if (theirs && theirs.mod > lay.mod) conflict = true;
      else {
        await within(c.writeFile(LAYOUT, JSON.stringify(lay)));
        markLayoutSent(s, lay.mod);
        synced++;
      }
    } catch (e) {
      warn('排列', e);
    }
  }

  if (synced) { lastSync = Date.now(); hooks?.synced(); } // 先記下傳上去的紙：後面墓碑那段失敗也不影響
  if (!allowed) return;

  if (goneDirty && !isStuck(GONE)) {
    // 先讀 iCloud 上原本那份合起來再寫，別台立的墓碑不能被蓋掉。
    // 讀不到（還沒下載下來、逾時）就這輪先不寫；檔案不存在或壞掉才當成空的
    try {
      let theirs: Record<string, unknown> = {};
      try {
        theirs = JSON.parse(await read(c, GONE)) ?? {};
      } catch (e) {
        if (!(e instanceof SyntaxError) && code(e) !== NOT_FOUND) throw e;
      }
      const merged: Record<string, number> = { ...gone };
      for (const [id, t] of Object.entries(theirs)) {
        if (typeof t === 'number' && Number.isFinite(t)) merged[id] = Math.max(merged[id] ?? 0, t);
      }
      await within(c.writeFile(GONE, JSON.stringify(merged)));
      goneSent = goneNow;
      await sweep(c, merged);
    } catch (e) {
      warn('墓碑', e);
    }
  }

  if (conflict) hooks?.pull();
}

// S4：墓碑寫上去之後，把被擋住的紙的檔案從 iCloud 拿掉（「檔案」app 裡才不會一直留著刪掉的紙）。
// 一定在 gone.json 寫成功之後才拿：先拿檔案、墓碑沒上去，別台會把它當成「還沒上傳」又傳回來。
// 讀檔再判斷：墓碑之後別台又改過（離線那台還在記）就留著。某一張失敗不影響其他張，下次再掃
async function sweep(c: Cloud, gone: Record<string, number>) {
  let names: string[];
  try { names = await within(c.readdir(''), LIST_LIMIT); } catch (e) { warn('列資料夾', e); return; }
  for (const name of names) {
    const id = name.endsWith('.json') ? name.slice(0, -'.json'.length) : '';
    if (!id || name === GONE || name === LAYOUT || gone[id] === undefined || isStuck(name)) continue;
    try {
      if (cloudFileBuried(gone, JSON.parse(await read(c, name)))) await within(c.unlink(name));
    } catch (e) {
      warn(`清 ${name} `, e);
    }
  }
}

// 把 iCloud 上所有紙和墓碑讀回來（原樣，規則交給 model.mergeCloud），layout.json（C2，規則交給 model.mergeLayout；null＝有但讀不到、undefined＝沒有），加上資料夾清單 names（含還沒下載的檔，S5 判斷換帳號用）。
// iCloud 沒登入或雲碟關掉回 'off'；其他拿不到（資料夾還沒有、讀失敗、整次逾時）回 null。
// 某一張讀不到（還沒下載下來、逾時）就先請 iCloud 下載、這次跳過，下次拉就有了：少一張不會害到資料，本機那張留著，
// 而且那張在上傳前也會因為「讀不到 iCloud 那份」先不傳，不會拿本機的去蓋
export async function fetchCloud(): Promise<{ notes: unknown[]; gone: unknown; layout: unknown; names: string[] } | 'off' | null> {
  const c = load();
  if (!c || !allowed) return null; // 不准同步：當成這次拉不了，什麼都不合
  try {
    const got = await within(fetchAll(c), PULL_LIMIT);
    if (!allowed) return null; // 拉到一半被鎖住：這份不用
    if (got && got !== 'off') lastSync = Date.now();
    return got;
  } catch (e) {
    warn('下載', e);
    return null;
  }
}

async function fetchAll(c: Cloud) {
  if (!(await within(c.isCloudAvailable()))) return 'off' as const;
  let names: string[];
  try {
    names = await within(c.readdir(''), LIST_LIMIT);
  } catch (e) {
    warn('列資料夾', e);
    return null;
  }
  const notes: unknown[] = [];
  let gone: unknown = {};
  let layout: unknown = names.includes(LAYOUT) ? null : undefined;
  const todo = names.filter(name => name.endsWith('.json') && !name.startsWith('.') && !isStuck(name));
  // 開 PULL_PARALLEL 條一起讀，每條讀完一個再拿下一個（共用 next）
  let next = 0;
  const lane = async () => {
    while (next < todo.length) {
      const name = todo[next++];
      let text: string;
      try {
        text = await read(c, name);
      } catch (e) {
        warn(`讀 ${name} `, e);
        c.triggerSync(name).catch(() => {});
        continue;
      }
      let data: unknown;
      try { data = JSON.parse(text); } catch { if (name === LAYOUT) layout = undefined; continue; } // 壞掉的檔案（或別的東西）不理；壞掉的排列當成沒有，會被這台的蓋掉
      if (name === GONE) gone = data;
      else if (name === LAYOUT) layout = data;
      else notes.push(data);
    }
  };
  await Promise.all(Array.from({ length: PULL_PARALLEL }, lane));
  return { notes, gone, layout, names };
}

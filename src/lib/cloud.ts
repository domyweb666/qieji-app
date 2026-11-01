// iCloud 同步 S2：只上傳（2026-11-01）。store 存檔成功後呼叫 pushCloud；
// 改過的紙（h ≠ sh）各寫一個 <id>.json 到「檔案 › iCloud 雲碟 › 茄記」，墓碑合進同一層的 gone.json。
// 靜靜做：iCloud 沒登入、雲碟關掉、寫失敗都不跳提示，下次存檔或 iCloud 變成可用時再試（規劃第八節）。
// 只有 iOS 的開發版／正式版有原生模組：網頁、Android 不做；Expo Go 沒有模組，第一次載入失敗之後就不再試。
// 下載與合併是 S3，刪掉 iCloud 上的檔案是 S4，這裡都不做。
import { Platform } from 'react-native';
import type { CloudStorage as CloudStorageClass } from 'react-native-cloud-storage';
import { markSynced, pendingUploads, type State } from './model';

type Cloud = InstanceType<typeof CloudStorageClass>;
let cloud: Cloud | null | undefined;

const WAIT = 2000; // 最後一次存檔之後等這麼久才傳（打字中每 0.25 秒存一次，不必每次都傳）
const GONE = 'gone.json';

let job: { s: State; onSynced: () => void } | null = null; // 最新一次存檔交過來的
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false, again = false;
let dirReady = false;
let goneSent = ''; // 上次寫進 gone.json 的本機墓碑（只記在記憶體：重開 app 會再合一次，沒關係）

function load(): Cloud | null {
  if (cloud !== undefined) return cloud;
  if (Platform.OS !== 'ios') return (cloud = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 只有 iOS 才載，import 做不到
    const m = require('react-native-cloud-storage') as typeof import('react-native-cloud-storage');
    const c = new m.CloudStorage(m.CloudStorageProvider.ICloud, { scope: m.CloudStorageScope.Documents });
    // 剛開 app 時 iCloud 可能還沒準備好、或使用者之後才登入：變成可用就把等著的補傳
    c.subscribeToCloudAvailability(ok => { if (ok && job) schedule(0); });
    cloud = c;
  } catch (e) {
    console.warn('iCloud 模組載入失敗（Expo Go 沒有，開發版才有）：', e);
    cloud = null;
  }
  return cloud;
}

function schedule(ms: number) {
  clearTimeout(timer);
  timer = setTimeout(run, ms);
}

// 存檔成功後呼叫。soon＝app 正要進背景，不等 2 秒（進背景之後 JS 很快就停了）。
// onSynced：有紙傳上去、sh 改了，要再存一次檔把 sh 記下來
export function pushCloud(s: State, onSynced: () => void, soon = false) {
  if (!load()) return;
  job = { s, onSynced };
  schedule(soon ? 0 : WAIT);
}

async function run() {
  if (running) { again = true; return; } // 正在傳：傳完再跑一輪
  running = true;
  try {
    do { again = false; await once(); } while (again);
  } catch (e) {
    if (__DEV__) console.warn('iCloud 上傳失敗（下次存檔再試）：', e);
  } finally {
    running = false;
  }
}

async function once() {
  const c = cloud, p = job;
  if (!c || !p) return;
  const notes = pendingUploads(p.s);
  const gone = p.s.gone ?? {};
  const goneNow = JSON.stringify(gone);
  const goneDirty = goneNow !== goneSent && Object.keys(gone).length > 0;
  if (!notes.length && !goneDirty) return;
  if (!(await c.isCloudAvailable())) return; // 沒登入或雲碟關掉：等可用的通知

  if (!dirReady) { await c.mkdir(''); dirReady = true; } // 容器裡的 Documents 第一次不一定存在

  let synced = 0;
  for (const n of notes) {
    // 指紋與內容在同一刻取；sh 是這台自己的記號，不傳上去
    const h = n.h;
    const { sh: _sh, ...paper } = n;
    await c.writeFile(`${n.id}.json`, JSON.stringify(paper));
    markSynced(n, h);
    synced++;
  }

  if (goneDirty) {
    // 先讀 iCloud 上原本那份合起來再寫，別台立的墓碑不能被蓋掉。
    // 讀不到（還沒下載下來、逾時）就這輪先不寫；檔案不存在或壞掉才當成空的
    let theirs: Record<string, unknown> = {};
    try {
      theirs = JSON.parse(await c.readFile(GONE)) ?? {};
    } catch (e) {
      if (!(e instanceof SyntaxError) && (e as { code?: string }).code !== 'ERR_FILE_NOT_FOUND') throw e;
    }
    const merged: Record<string, number> = { ...gone };
    for (const [id, t] of Object.entries(theirs)) {
      if (typeof t === 'number' && Number.isFinite(t)) merged[id] = Math.max(merged[id] ?? 0, t);
    }
    await c.writeFile(GONE, JSON.stringify(merged));
    goneSent = goneNow;
  }

  if (synced) p.onSynced();
}

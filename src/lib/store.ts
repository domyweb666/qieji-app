// 整個 app 只有一份 state，跟網頁版一樣直接改物件，改完呼叫 change() 觸發重畫與存檔。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { cloudOn, cloudPulled, fetchCloud, initCloud, pauseCloud, pushCloud } from './cloud';
import { dropNotes, emptyState, forgetSync, mergeCloud, seemsNewCloud, HINT_KEY, isExpiredTrash, KEY, parseState, purgeExpiredBin, stampMods, stampOldBin, stampOldTrash, tutorialNote, uid, type ColorKey, type Note, type State } from './model';
import { pushWidget } from './widget';
import { T } from './tokens';

// 開發時一改程式，這個檔案會被重跑。資料放在 global 上，重跑後還是同一份，
// 不會變回空白狀態再被存回去蓋掉舊資料（正式版不會重跑，這只是保險）。
type Box = {
  state: State; loaded: boolean; version: number; hintSeen: boolean; last: string | null; fresh?: string | null;
  saveT?: ReturnType<typeof setTimeout>; onSaveError?: () => void; saveFailed?: boolean; subs: Set<() => void>; listening?: boolean;
  panelSubs?: Set<() => void>; // 等「目錄面板收完」的人（K6）
  panelOpen?: boolean; compose?: boolean; composeSubs?: Set<() => void>; // 目錄面板開著；控制中心「記一行」等著紙升起輸入框（C1）
  pulling?: boolean; synced?: Record<string, number>;
  newCloud?: 'asking' | 'declined'; onNewCloud?: (adopt: () => void, decline: () => void) => void; onCloudOff?: () => void; // S5 // iCloud S3：正在拉；被同步改了字的行，各重掛過幾次輸入框
};
const g = globalThis as { __qiejiStore?: Box };
const box: Box = (g.__qiejiStore ??= { state: emptyState(), loaded: false, version: 0, hintSeen: false, last: null, subs: new Set() });
const emit = () => box.subs.forEach(f => f());
const LAST_KEY = 'cn.last'; // 只記一個筆記 id，跟筆記資料分開存
const CLOUD_OFF_KEY = 'cn.cloudOffSeen'; // 「iCloud 雲碟沒開」提示過了（只跳一次，S5）

// S5 多米選「提示一次」：iCloud 不能用、過 10 秒再確認還是不能用，才跳一次「紙只存在這台手機」，之後永遠不再跳
let offT: ReturnType<typeof setTimeout> | undefined;
function cloudOffOnce() {
  clearTimeout(offT);
  offT = setTimeout(async () => {
    try {
      if (await AsyncStorage.getItem(CLOUD_OFF_KEY)) return;
      if (await cloudOn()) return;
      await AsyncStorage.setItem(CLOUD_OFF_KEY, '1');
      box.onCloudOff?.();
    } catch { /* 下次再說 */ }
  }, T.timing.cloudOffGrace);
}

async function writeNow() {
  clearTimeout(box.saveT);
  if (!box.loaded) return; // 還沒讀完舊資料前絕對不寫，免得蓋掉
  try {
    stampMods(box.state, Date.now()); // iCloud 同步用：內容變了的紙記下改動時間（S0；畫面上的 updated 不動）
    await AsyncStorage.setItem(KEY, JSON.stringify(box.state));
    box.saveFailed = false;
    pushWidget(box.state, box.last); // 存檔成功才推給桌面小工具（多米 2026-10-31）
    // 存檔成功才把改過的紙傳上 iCloud（S2）；進背景時不等，馬上傳
    pushCloud(box.state, AppState.currentState !== 'active');
  } catch {
    // 打字中每 0.25 秒會再存一次；失敗只報一次，成功存回去之後再失敗才再報
    if (box.saveFailed) return;
    box.saveFailed = true;
    box.onSaveError?.();
  }
}

export const store = {
  get s() { return box.state; },
  get loaded() { return box.loaded; },
  get hintSeen() { return box.hintSeen; },
  // 上次開著的筆記（關掉 app 時還開著的那則），下次打開直接回到它；停在列表就是 null
  get last() { return box.last; },
  setLast(id: string | null) {
    if (box.last === id) return;
    box.last = id;
    (id ? AsyncStorage.setItem(LAST_KEY, id) : AsyncStorage.removeItem(LAST_KEY)).catch(() => {});
    if (box.loaded) pushWidget(box.state, id); // 換了一張紙，小工具跟著換
  },

  // 目錄點了哪張、或剛開了新的一張：換到那張紙（根畫面照 last 畫）。fresh＝新的一張，紙打開後直接停在輸入列
  open(id: string, fresh = false) {
    box.fresh = fresh ? id : null;
    store.setLast(id);
    box.version++;
    emit();
  },
  get fresh() { return box.fresh ?? null; },
  clearFresh() { box.fresh = null; },
  // 目錄面板收完那一刻（原生堆疊的 transitionEnd closing）由目錄呼叫，紙收到就馬上升起輸入框，不用等 700ms 的保險（K6，2026-11-01）
  panelClosed() { box.panelOpen = false; box.panelSubs?.forEach(f => f()); },
  panelOpened() { box.panelOpen = true; },
  get panelOpen() { return !!box.panelOpen; },
  onPanelClosed(f: () => void) { (box.panelSubs ??= new Set()).add(f); return () => { box.panelSubs?.delete(f); }; },

  async load() {
    if (box.loaded) return;
    const [raw, hint, last] = await Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(HINT_KEY), AsyncStorage.getItem(LAST_KEY)]);
    if (box.loaded) return;
    box.state = parseState(raw);
    box.hintSeen = hint === '1';
    box.last = last;
    // 第一次安裝（手機上根本沒有這個存檔，raw 是 null）：放一張教學紙當第一張（多米 2026-11-01）。
    // 讀到壞掉的存檔不算第一次（raw 不是 null），不放，免得蓋在使用者的資料上
    const first = raw === null;
    if (first) {
      const t = tutorialNote(Date.now());
      box.state.notes.push(t);
      box.last = t.id;
    }
    box.loaded = true;
    box.version++;
    emit();
    if (first) writeNow();
    store.purgeTrash();
    store.pullCloud();
  },
  // 控制中心「記一行」按鈕（qieji://new，2026-11-01 C1）：要首頁那張紙升起輸入框。
  // 紙還沒掛上（冷啟動、還在讀資料）就先留著，紙掛上來時自己拿；已經掛著就通知它
  requestCompose() {
    box.compose = true;
    box.composeSubs?.forEach(f => f());
  },
  takeCompose() { const c = !!box.compose; box.compose = false; return c; },
  onCompose(f: () => void) { (box.composeSubs ??= new Set()).add(f); return () => { box.composeSubs?.delete(f); }; },
  // iCloud S3：拉下來合進本機（打開 app 讀完、回到前景、iCloud 變成可用、上傳時發現別台改過）。
  // 合併規則全在 model.mergeCloud；有變才重畫，一律存一次（記下 sh、把合出來比 iCloud 新的傳上去）
  async pullCloud() {
    // 換了 iCloud 正在問、或這次打開選了「先不要」：不拉不傳，下次打開 app 再問
    if (!box.loaded || box.pulling || box.newCloud) return;
    box.pulling = true;
    try {
      const remote = await fetchCloud();
      if (remote === 'off') { cloudOffOnce(); return; }
      if (!remote) return;
      // S5：這個 iCloud 裡一張這台同步過的紙都沒有（換了 Apple ID、或資料夾被刪了）：先停下來問，不合也不傳
      if (seemsNewCloud(box.state, remote.names, remote.gone)) {
        box.newCloud = 'asking';
        pauseCloud(true);
        box.onNewCloud?.(store.adoptCloud, () => { box.newCloud = 'declined'; });
        return;
      }
      const r = mergeCloud(box.state, remote, Date.now());
      if (r.retyped.length) {
        const m = (box.synced ??= {});
        for (const id of r.retyped) m[id] = (m[id] ?? 0) + 1;
      }
      if (r.changed) { box.version++; emit(); }
      await writeNow();
    } finally {
      box.pulling = false;
      cloudPulled();
    }
  },
  // S5 多米選「放進去」：這台的紙全部當成沒傳過，跟現在這個 iCloud 合起來（它原本有的紙也會進來）、全部傳上去
  adoptCloud() {
    forgetSync(box.state);
    box.newCloud = undefined;
    pauseCloud(false);
    store.save();
    store.pullCloud();
  },
  onNewCloud(fn: (adopt: () => void, decline: () => void) => void) { box.onNewCloud = fn; },
  onCloudOff(fn: () => void) { box.onCloudOff = fn; },
  // 這行的字被同步改過幾次：畫面加進輸入框的 key，字被換掉時重掛才看得到新字
  syncRev(id: string) { return box.synced?.[id] ?? 0; },
  // 最近刪除 30 天自動清（2026-11-01 接上，多米定；規則在 model.ts 與 tests/trash.test.mjs，鐵則是拿不準就不刪）：
  // 打開 app 讀完資料、回到前景時各跑一次。先把沒有可信時間的張與行補成現在（從今天起算 30 天），再清掉滿 30 天的；清了才重畫，只補時間就只存檔。
  // 清掉不提示、只留一筆墓碑（紙的 id＋時間，給 iCloud 同步擋復活）（跟 iOS 備忘錄一樣；最近刪除頁那句「放滿 30 天會自動清掉」就是告知）。回傳清掉幾張＋幾行
  purgeTrash(now = Date.now()) {
    if (!box.loaded) return 0;
    const notes = box.state.notes;
    const stamped = stampOldTrash(notes, now) + stampOldBin(notes, now);
    // 清掉的紙立墓碑（S0）：不然 iCloud 同步會從另一台把它帶回來
    const removed = dropNotes(box.state, n => isExpiredTrash(n, now), now);
    const lines = purgeExpiredBin(box.state.notes, now);
    if (removed.length || lines) store.change();
    else if (stamped) store.save();
    return removed.length + lines;
  },
  // 改完資料後呼叫：重畫畫面，稍後存檔
  change() {
    box.version++;
    emit();
    store.save();
  },
  // 打字用：只排程存檔、不重畫（輸入框自己會顯示字，每打一個字就重畫整頁會卡）
  save() {
    clearTimeout(box.saveT);
    box.saveT = setTimeout(writeNow, 250);
  },
  flush: writeNow,
  markHint() {
    if (box.hintSeen) return;
    box.hintSeen = true;
    AsyncStorage.setItem(HINT_KEY, '1').catch(() => {});
  },
  onSaveError(fn: () => void) { box.onSaveError = fn; },
};

// app 進背景時立刻存，不等計時器；回到前景時跑一次 30 天自動清、去 iCloud 拉一次（重跑檔案時不重複註冊）
if (!box.listening) {
  box.listening = true;
  AppState.addEventListener('change', s => { if (s !== 'active') writeNow(); else { store.purgeTrash(); store.pullCloud(); } });
}
// iCloud：傳上去之後再存一次記下 sh；上傳發現別台改過、或 iCloud 變成可用時去拉（重跑檔案時換成新的這組）
initCloud({ synced: () => store.save(), pull: () => { store.pullCloud(); } });

const subscribe = (f: () => void) => { box.subs.add(f); return () => { box.subs.delete(f); }; };
const getVersion = () => box.version;

export function useStore() {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return box.state;
}

// 新增筆記：現在只有清單（type 參數留著，舊資料和測試用得到）。預設黃色（多米 2026-10-31 定）
export function newNote(color: ColorKey = 'yellow', type: Note['type'] = 'check') {
  const n: Note = { id: uid(), type, title: '', body: '', items: [], bin: [], color,
    pinned: false, deleted: false, created: Date.now(), updated: Date.now(), b: false };
  box.state.notes.push(n);
  store.change();
  return n;
}

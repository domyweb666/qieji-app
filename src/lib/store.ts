// 整個 app 只有一份 state，跟網頁版一樣直接改物件，改完呼叫 change() 觸發重畫與存檔。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { emptyState, HINT_KEY, KEY, parseState, purgeExpiredBin, purgeExpiredTrash, stampOldBin, stampOldTrash, uid, type ColorKey, type Note, type State } from './model';
import { pushWidget } from './widget';

// 開發時一改程式，這個檔案會被重跑。資料放在 global 上，重跑後還是同一份，
// 不會變回空白狀態再被存回去蓋掉舊資料（正式版不會重跑，這只是保險）。
type Box = {
  state: State; loaded: boolean; version: number; hintSeen: boolean; last: string | null; fresh?: string | null;
  saveT?: ReturnType<typeof setTimeout>; onSaveError?: () => void; saveFailed?: boolean; subs: Set<() => void>; listening?: boolean;
  panelSubs?: Set<() => void>; // 等「目錄面板收完」的人（K6）
};
const g = globalThis as { __qiejiStore?: Box };
const box: Box = (g.__qiejiStore ??= { state: emptyState(), loaded: false, version: 0, hintSeen: false, last: null, subs: new Set() });
const emit = () => box.subs.forEach(f => f());
const LAST_KEY = 'cn.last'; // 只記一個筆記 id，跟筆記資料分開存

async function writeNow() {
  clearTimeout(box.saveT);
  if (!box.loaded) return; // 還沒讀完舊資料前絕對不寫，免得蓋掉
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(box.state));
    box.saveFailed = false;
    pushWidget(box.state, box.last); // 存檔成功才推給桌面小工具（多米 2026-10-31）
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
  panelClosed() { box.panelSubs?.forEach(f => f()); },
  onPanelClosed(f: () => void) { (box.panelSubs ??= new Set()).add(f); return () => { box.panelSubs?.delete(f); }; },

  async load() {
    if (box.loaded) return;
    const [raw, hint, last] = await Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(HINT_KEY), AsyncStorage.getItem(LAST_KEY)]);
    if (box.loaded) return;
    box.state = parseState(raw);
    box.hintSeen = hint === '1';
    box.last = last;
    box.loaded = true;
    box.version++;
    emit();
    store.purgeTrash();
  },
  // 最近刪除 30 天自動清（2026-11-01 接上，多米定；規則在 model.ts 與 tests/trash.test.mjs，鐵則是拿不準就不刪）：
  // 打開 app 讀完資料、回到前景時各跑一次。先把沒有可信時間的張與行補成現在（從今天起算 30 天），再清掉滿 30 天的；清了才重畫，只補時間就只存檔。
  // 清掉不留紀錄、不提示（跟 iOS 備忘錄一樣；最近刪除頁那句「放滿 30 天會自動清掉」就是告知）。回傳清掉幾張＋幾行
  purgeTrash(now = Date.now()) {
    if (!box.loaded) return 0;
    const notes = box.state.notes;
    const stamped = stampOldTrash(notes, now) + stampOldBin(notes, now);
    const { kept, removed } = purgeExpiredTrash(notes, now);
    const lines = purgeExpiredBin(notes, now);
    if (removed.length) box.state.notes = kept;
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

// app 進背景時立刻存，不等計時器；回到前景時跑一次 30 天自動清（重跑檔案時不重複註冊）
if (!box.listening) {
  box.listening = true;
  AppState.addEventListener('change', s => { if (s !== 'active') writeNow(); else store.purgeTrash(); });
}

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

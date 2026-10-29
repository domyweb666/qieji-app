// 整個 app 只有一份 state，跟網頁版一樣直接改物件，改完呼叫 change() 觸發重畫與存檔。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { emptyState, HINT_KEY, KEY, parseState, uid, type ColorKey, type Note, type State } from './model';

// 開發時一改程式，這個檔案會被重跑。資料放在 global 上，重跑後還是同一份，
// 不會變回空白狀態再被存回去蓋掉舊資料（正式版不會重跑，這只是保險）。
type Box = {
  state: State; loaded: boolean; version: number; hintSeen: boolean;
  saveT?: ReturnType<typeof setTimeout>; onSaveError?: () => void; subs: Set<() => void>; listening?: boolean;
};
const g = globalThis as { __qiejiStore?: Box };
const box: Box = (g.__qiejiStore ??= { state: emptyState(), loaded: false, version: 0, hintSeen: false, subs: new Set() });
const emit = () => box.subs.forEach(f => f());

async function writeNow() {
  clearTimeout(box.saveT);
  if (!box.loaded) return; // 還沒讀完舊資料前絕對不寫，免得蓋掉
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(box.state));
  } catch {
    box.onSaveError?.();
  }
}

export const store = {
  get s() { return box.state; },
  get loaded() { return box.loaded; },
  get hintSeen() { return box.hintSeen; },

  async load() {
    if (box.loaded) return;
    const [raw, hint] = await Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(HINT_KEY)]);
    if (box.loaded) return;
    box.state = parseState(raw);
    box.hintSeen = hint === '1';
    box.loaded = true;
    box.version++;
    emit();
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

// app 進背景時立刻存，不等計時器（重跑檔案時不重複註冊）
if (!box.listening) {
  box.listening = true;
  AppState.addEventListener('change', s => { if (s !== 'active') writeNow(); });
}

const subscribe = (f: () => void) => { box.subs.add(f); return () => { box.subs.delete(f); }; };
const getVersion = () => box.version;

export function useStore() {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return box.state;
}

// 新增筆記：type 由新增選單決定（記事或清單）
export function newNote(color: ColorKey = 'purple', type: Note['type'] = 'check') {
  const n: Note = { id: uid(), type, title: '', body: '', items: [], color,
    pinned: false, deleted: false, created: Date.now(), updated: Date.now(), b: false };
  box.state.notes.push(n);
  store.change();
  return n;
}

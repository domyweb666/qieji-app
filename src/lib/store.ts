// 整個 app 只有一份 state，跟網頁版一樣直接改物件，改完呼叫 change() 觸發重畫與存檔。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { emptyState, HINT_KEY, KEY, parseState, uid, type ColorKey, type Note, type State } from './model';

let state: State = emptyState();
let loaded = false;
let version = 0;
let saveT: ReturnType<typeof setTimeout> | undefined;
let onSaveError: (() => void) | undefined;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

async function writeNow() {
  clearTimeout(saveT);
  if (!loaded) return; // 還沒讀完舊資料前絕對不寫，免得蓋掉
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    onSaveError?.();
  }
}

export const store = {
  get s() { return state; },
  get loaded() { return loaded; },
  hintSeen: false,

  async load() {
    if (loaded) return;
    const [raw, hint] = await Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(HINT_KEY)]);
    state = parseState(raw);
    store.hintSeen = hint === '1';
    loaded = true;
    version++;
    emit();
  },
  // 改完資料後呼叫：重畫畫面，稍後存檔
  change() {
    version++;
    emit();
    clearTimeout(saveT);
    saveT = setTimeout(writeNow, 250);
  },
  flush: writeNow,
  markHint() {
    if (store.hintSeen) return;
    store.hintSeen = true;
    AsyncStorage.setItem(HINT_KEY, '1').catch(() => {});
  },
  onSaveError(fn: () => void) { onSaveError = fn; },
};

// app 進背景時立刻存，不等計時器
AppState.addEventListener('change', s => { if (s !== 'active') writeNow(); });

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const getVersion = () => version;

export function useStore() {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return state;
}

// 新增筆記：直接開一張清單，點子就是一行一行記，少一次「文字還是清單」的選擇
export function newNote(color: ColorKey = 'purple', type: Note['type'] = 'check') {
  const n: Note = { id: uid(), type, title: '', body: '', items: [], color,
    pinned: false, deleted: false, created: Date.now(), updated: Date.now(), b: false };
  state.notes.push(n);
  store.change();
  return n;
}

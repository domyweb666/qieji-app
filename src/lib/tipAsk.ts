// 單點提示接手機的那一半：記哪個提示出現過了。規則在 tip.ts。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tipToShow } from './tip';

const KEY = 'qieji.tipSeen.return.v1';
// 讀一次就記在記憶體：每打一個字都會問，不能每次都讀手機
let seen: boolean | null = null;

async function load() {
  if (seen === null) {
    try { seen = (await AsyncStorage.getItem(KEY)) !== null; } catch { seen = true; } // 讀不到就當看過：寧可不提示，不要每次都跳
  }
  return seen;
}
function mark() {
  seen = true;
  AsyncStorage.setItem(KEY, '1').catch(() => {});
}

// 啟動時呼叫一次：剛裝好的人直接記成看過（他沒有「Return 會記下來」的舊習慣）；其他人先把紀錄讀進記憶體
export async function primeTips(firstRun: boolean) {
  if (firstRun) mark(); else await load();
}

// 輸入框每次改字問一次：這次該不該冒 ✓ 的提示。回 true 的那一次同時記下「出現過了」
export function takeReturnTip(prev: string, next: string) {
  if (seen !== false || !tipToShow(false, prev, next)) return false; // 還沒讀完（null）也不跳
  mark();
  return true;
}

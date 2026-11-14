// 評分提示接手機的那一半（1.1 片 C2）：記打開的日子、記劃掉幾行、條件到了叫系統評分框。規則在 review.ts。
// 只有 iOS 的開發版／正式版有原生模組；載不到就什麼都不做。
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { noticeAt } from './access';
import { markOpen, readStats, shouldAsk, type ReviewStats } from './review';
import { T } from './tokens';

const KEY = 'qieji.review.v1';
let stats: ReviewStats | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const save = () => { if (stats) AsyncStorage.setItem(KEY, JSON.stringify(stats)).catch(() => {}); };

async function load(): Promise<ReviewStats> {
  if (stats) return stats;
  let raw: string | null = null;
  try { raw = await AsyncStorage.getItem(KEY); } catch { /* 讀不到當沒記過 */ }
  const fresh = raw === null;
  stats = readStats(raw, Date.now());
  if (fresh) save(); // 第一次：記下「從今天起算」
  return stats;
}

// 打開 app、回到前景時叫：記今天打開過
export async function reviewOpened() {
  const st = await load();
  if (markOpen(st, Date.now())) save();
}

// 劃掉一行（不是恢復）時叫。動畫跑完、手指離開大約一秒後才看條件；這一秒內又劃一行就重新等
export async function reviewStruck() {
  const st = await load();
  st.strikes += 1;
  save();
  clearTimeout(timer);
  timer = setTimeout(ask, T.timing.reviewDelay);
}

async function ask() {
  if (Platform.OS !== 'ios' || AppState.currentState !== 'active' || !stats) return; // 已經切走就不跳
  const version = Constants.expoConfig?.version ?? '';
  if (!shouldAsk(stats, Date.now(), version, await noticeAt())) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 只有 iOS 才載；舊開發版沒有這個原生模組
    const sr = require('expo-store-review') as typeof import('expo-store-review');
    if (!(await sr.isAvailableAsync())) return;
    stats.asked = version; // 先記再叫：這一版只叫一次，系統跳不跳都算
    save();
    await sr.requestReview();
  } catch (e) {
    console.warn('評分框沒跳成：', e);
  }
}

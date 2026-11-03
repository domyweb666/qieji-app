// 開發版才有的效能量測（2026-11-03 多米：換張、點磚打開、排順序都 lag）：數字印在跑 tunnel 的終端機（Metro），
// 多米操作一次，Agent 讀終端機就知道卡在哪、卡多久，不用再猜。正式版（__DEV__ 是 false）整段不跑。
// - [perf] JS 卡住 Nms：JS 執行緒有一段 N 毫秒什麼都做不了（點了沒反應、手勢排回 JS 的事延後）
// - [perf] 畫面掉格：手指碰到畫面起 WATCH_MS 內量 UI 執行緒，每 WINDOW_MS 印一次掉了幾格、最長一格幾毫秒（動畫、跟手卡頓）
// - [perf] 掛上紙：換到一張紙到畫出第一格花多久（幾行）
import { useState } from 'react';
import { useFrameCallback } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const ON = __DEV__;
const TICK_MS = 50, STALL_MS = 120; // JS 每 50 毫秒醒一次，晚超過 120 才算卡住
const SLOW_FRAME_MS = 25, WINDOW_MS = 1000, WATCH_MS = 4000; // 一格超過 25 毫秒算掉格（60Hz 一格 16.7）

let watching = false;
export function startJsWatch() {
  if (!ON || watching) return;
  watching = true;
  let last = Date.now();
  setInterval(() => {
    const now = Date.now(), late = now - last - TICK_MS;
    if (late > STALL_MS) console.log(`[perf] JS 卡住 ${late}ms`);
    last = now;
  }, TICK_MS);
}

const logDrops = (n: number, worst: number, total: number) => console.log(`[perf] 畫面掉格 ${n}/${total} 格，最長一格 ${Math.round(worst)}ms`);

// 掛在根畫面：回傳 onTouchStart，手指一碰就量 WATCH_MS
export function useFrameWatch() {
  const [st] = useState(() => ({ t: 0 as ReturnType<typeof setTimeout> | 0 }));
  const probe = useFrameCallback(f => {
    'worklet';
    const dt = f.timeSincePreviousFrame;
    if (dt === null) return;
    const g = globalThis as unknown as { __perf?: { n: number; worst: number; total: number; acc: number } };
    const s = g.__perf ?? (g.__perf = { n: 0, worst: 0, total: 0, acc: 0 });
    s.total++; s.acc += dt;
    if (dt > SLOW_FRAME_MS) { s.n++; s.worst = Math.max(s.worst, dt); }
    if (s.acc < WINDOW_MS) return;
    if (s.n) scheduleOnRN(logDrops, s.n, s.worst, s.total);
    s.n = 0; s.worst = 0; s.total = 0; s.acc = 0;
  }, false);
  if (!ON) return undefined;
  return () => {
    probe.setActive(true);
    if (st.t) clearTimeout(st.t);
    st.t = setTimeout(() => { probe.setActive(false); st.t = 0; }, WATCH_MS);
  };
}

const marks = new Map<string, number>();
export const perf = {
  start(k: string) { if (ON) marks.set(k, performance.now()); },
  // 畫出下一格才算（掛上、排版、畫完）
  end(k: string, what: string) {
    if (!ON) return;
    const t = marks.get(k);
    if (t === undefined) return;
    marks.delete(k);
    requestAnimationFrame(() => console.log(`[perf] ${what} ${Math.round(performance.now() - t)}ms`));
  },
};

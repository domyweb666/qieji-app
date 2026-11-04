// 紙上一行一行的「位置表」（2026-11-04 手感引擎，多米：「畫面不准有不順暢感」）。這裡只有純計算，沒有畫面，測試在 tests/rows.test.mjs。
// 每一行站哪裡不再由版面排出來，是這裡算好、交給 UI 執行緒，所以：
// - 只掛畫面附近的行，看不到的行不佔任何東西（一千行跟十行一樣快）
// - 排順序放手時，位置在 UI 執行緒一格內改完，不用等 React 重排，不會閃
// 標 'worklet' 的函式手勢也會在 UI 執行緒呼叫：參數只准純數字、陣列，裡面不准碰外面的變數。

export type GeoItem = { id: string; t: string; done: boolean };
export type Geo = { ids: string[]; ys: number[]; hs: number[]; done: boolean[]; total: number; at: Map<string, number> };
export const EMPTY_GEO: Geo = { ids: [], ys: [], hs: [], done: [], total: 0, at: new Map() };

/* ---------- 還沒量過的行先估高度：真的掛上時會量到準的（那時多半還在畫面外） ---------- */
// 全形（中日韓、全形標點、emoji）一個字一個字級寬；半形照系統字型的大約比例。估錯只差一行，掛上時就修正
function isWide(cp: number) {
  return cp >= 0x1100 && (
    cp <= 0x115F || (cp >= 0x2E80 && cp <= 0xA4CF) || (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xF900 && cp <= 0xFAFF)
    || (cp >= 0xFE30 && cp <= 0xFE6F) || (cp >= 0xFF00 && cp <= 0xFF60) || (cp >= 0xFFE0 && cp <= 0xFFE6) || cp >= 0x1F000
  );
}
const NARROW = new Set('ijlftrI.,;:\'!|`()[]{}"');
const BROAD = new Set('mwMW@%');
function latinEm(ch: string) {
  if (NARROW.has(ch)) return 0.33;
  if (BROAD.has(ch)) return 0.88;
  if (ch >= 'A' && ch <= 'Z') return 0.67;
  if (ch >= '0' && ch <= '9') return 0.61;
  return 0.54;
}
const SPACE_EM = 0.27;

// 這段字在 width 寬裡排幾行：英文整個字一起換行，中文哪裡都能換
export function estimateLines(t: string, width: number, em: number): number {
  if (!t || width <= 0) return 1;
  let lines = 0;
  for (const para of t.split('\n')) {
    let n = 1, x = 0, word = 0;
    const flush = () => {
      if (!word) return;
      if (x > 0 && x + word > width) { n++; x = 0; }
      while (word > width) { n++; word -= width; }
      x += word;
      word = 0;
    };
    for (const ch of para) {
      if (isWide(ch.codePointAt(0) ?? 0)) {
        flush();
        if (x + em > width) { n++; x = 0; }
        x += em;
      } else if (ch === ' ' || ch === '\t') {
        flush();
        x += em * SPACE_EM;
      } else word += latinEm(ch) * em;
    }
    flush();
    lines += n;
  }
  return lines;
}

/* ---------- 位置表 ---------- */
export function buildGeo(items: readonly GeoItem[], heightOf: (it: GeoItem) => number): Geo {
  const n = items.length;
  const ids = new Array<string>(n), ys = new Array<number>(n), hs = new Array<number>(n), done = new Array<boolean>(n);
  const at = new Map<string, number>();
  let y = 0;
  for (let i = 0; i < n; i++) {
    const it = items[i], h = heightOf(it);
    ids[i] = it.id; ys[i] = y; hs[i] = h; done[i] = it.done;
    at.set(it.id, i);
    y += h;
  }
  return { ids, ys, hs, done, total: y, at };
}

// 兩份位置表一不一樣（給的是一樣的就不用再交給 UI 執行緒）
export function sameGeo(a: Geo, b: Geo) {
  const n = a.ids.length;
  if (n !== b.ids.length) return false;
  for (let i = 0; i < n; i++) if (a.ids[i] !== b.ids[i] || a.hs[i] !== b.hs[i] || a.done[i] !== b.done[i]) return false;
  return true;
}
// 順序或行數有沒有變（有變是資料動了，其他行要滑過去；只有高度變多半是量到準的高度）
export function sameIds(a: readonly string[], b: readonly string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// 落在 [top, bottom] 這一段裡的行：回傳第一行和最後一行的序號。一行都沒有時 b < a
export function windowOf(ys: readonly number[], hs: readonly number[], top: number, bottom: number) {
  const n = ys.length;
  let lo = 0, hi = n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ys[m] + hs[m] >= top) hi = m; else lo = m + 1; }
  const a = lo;
  lo = a; hi = n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ys[m] <= bottom) lo = m + 1; else hi = m; }
  return { a, b: lo - 1 };
}

// 手指在 y（從清單頂算）碰到第幾行；碰到最後一行底下回傳 -1
export function hitRow(ys: readonly number[], hs: readonly number[], y: number): number {
  'worklet';
  let lo = 0, hi = ys.length - 1, k = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (ys[m] <= y) { k = m; lo = m + 1; } else hi = m - 1;
  }
  return k >= 0 && y < ys[k] + hs[k] ? k : -1;
}

// 排順序拖著走時對到第幾個位置：比 y 高的中點有幾個（中點由上往下排好的，一千行也只要比十次）
export function countBelow(mids: readonly number[], y: number): number {
  'worklet';
  let lo = 0, hi = mids.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (mids[m] < y) lo = m + 1; else hi = m;
  }
  return lo;
}

export function midsOf(ys: readonly number[], hs: readonly number[]): number[] {
  'worklet';
  const out = new Array<number>(ys.length);
  for (let i = 0; i < ys.length; i++) out[i] = ys[i] + hs[i] / 2;
  return out;
}

// 被拖的行落在 to 時，它要從原本的位置移動多少才站進空出來的那格
export function landOffset(ys: readonly number[], hs: readonly number[], from: number, to: number): number {
  'worklet';
  if (from === to) return 0;
  return to > from ? ys[to] + hs[to] - hs[from] - ys[from] : ys[to] - ys[from];
}

// 查表用：每個 id 站哪裡、排第幾
export function maps(ids: readonly string[], ys: readonly number[]) {
  'worklet';
  const pos: Record<string, number> = {}, idx: Record<string, number> = {};
  for (let i = 0; i < ids.length; i++) { pos[ids[i]] = ys[i]; idx[ids[i]] = i; }
  return { pos, idx };
}

// 把第 from 行搬到 to 之後的整份位置表（放手那一格在 UI 執行緒算）
export function movedGeo(ids: readonly string[], hs: readonly number[], done: readonly boolean[], from: number, to: number) {
  'worklet';
  const I = ids.slice(), H = hs.slice(), D = done.slice();
  const i = I.splice(from, 1), h = H.splice(from, 1), d = D.splice(from, 1);
  I.splice(to, 0, i[0]); H.splice(to, 0, h[0]); D.splice(to, 0, d[0]);
  const Y = new Array<number>(I.length);
  let y = 0;
  for (let k = 0; k < I.length; k++) { Y[k] = y; y += H[k]; }
  return { ids: I, ys: Y, hs: H, done: D };
}

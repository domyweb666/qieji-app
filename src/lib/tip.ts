// 單點提示（2026-11-15，多米選）：不變暗、不擋觸控，只在東西旁邊冒一張小卡，每個提示一輩子只出現一次。
// 第一個：輸入框的 ✓。1.1 把 Return 從「記下這行」改成「換行」，從 1.0 更新上來的人第一次按 Return 時告訴他要按 ✓。
// 純規則，接手機的在 tipAsk.ts。
export const RETURN_TIP = 'Return 現在是換行，按 ✓ 記下來';

const breaks = (s: string) => s.split('\n').length - 1;

// 這次改字是不是「按了一下 Return」：剛好多一個字，而且多的是換行。
// 貼上一大段（一次多很多字）、刪字、注音選字時按 Return（只確認選字，不會多出換行）都不算
export function typedReturn(prev: string, next: string) {
  return next.length === prev.length + 1 && breaks(next) === breaks(prev) + 1;
}

// 該不該冒提示：seen＝這個提示記過了沒。剛裝好的人沒有舊習慣，不用提示（由 tipAsk 在第一次打開時直接記成看過）
export function tipToShow(seen: boolean, prev: string, next: string) {
  return !seen && typedReturn(prev, next);
}

// 新功能（蔬菜家族共用規格）：每個版本最多三點。更新後第一次打開跳一次，設定頁「新功能」可以重看。
// 小修正（1.1.0 → 1.1.1）不跳：只有前兩段變了才算。純規則，接手機的在 newsAsk.ts。
export type News = { version: string; points: string[] };

// 新的在前面。送審前照這一版真的有的功能改（片 D2）
export const NEWS: News[] = [
  { version: '1.1.0', points: [
    '多了「設定」，在目錄最下面',
    '新增茄記完整版：iCloud 同步、小工具、控制中心「記一行」',
    '記一行時按 Return 是換行，按右邊的勾才記下來',
  ] },
];

const minor = (v: string) => v.split('.').slice(0, 2).join('.');

// 該不該跳卡片：seen＝上次看過的版本（沒記過是 null）；firstRun＝這次是剛裝好第一次打開
export function newsToShow(seen: string | null, version: string, firstRun: boolean): News | null {
  if (!version || firstRun) return null;          // 剛裝的人不用知道「新」功能
  if (seen !== null && minor(seen) === minor(version)) return null;
  return NEWS.find(n => minor(n.version) === minor(version)) ?? null;
}

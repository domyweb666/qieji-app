// 蔬菜家族的其他 app（共用規格）。多米 2026-11-14 定：清單內建在 app 裡、不連網路（茄記對外說「除了 iCloud 和 App Store 不連網路」）。
// 上新 app 時在這裡加一筆，跟著茄記下次更新出去。自己（qieji）不顯示；清單空的時候設定頁不顯示那一列。
export type FamilyApp = { slug: string; name: string; tagline: string; appStoreID: string };
export const FAMILY: FamilyApp[] = [
  { slug: 'doujian', name: '豆鍵', tagline: '大字注音鍵盤', appStoreID: '6829152938' }, // 多米 2026-11-15
];

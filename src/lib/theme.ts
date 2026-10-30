// 「黏土菜園」色票：奶油白底、帶茄紫的深色字，強調色直接取自插圖，讓介面跟黏土插圖同一個色溫。
// 不用 iOS 系統色（冷灰底會跟暖色插圖打架，茄子田的米色底也會變成一塊方框）。
// 深色模式之後另外定一組「深茄夜」，到時候這裡改成依外觀切換。
export const C = {
  groupedBg: '#FBF3E7',
  card: '#FFFCF6',
  page: '#FFFCF6',
  fill: 'rgba(125,70,127,0.08)',
  label: '#2E2233',
  secondary: '#85778A',
  tertiary: 'rgba(46,34,51,0.3)',
  placeholder: 'rgba(46,34,51,0.35)',
  separator: '#EADFCF',
  red: '#D0443A',
  gray: '#A39383',
  // 茄子紫：整個 app 的強調色（按鈕、圓圈、勾選），取自插圖裡的茄子
  tint: '#7D467F',
  tintSoft: 'rgba(125,70,127,0.14)',
};

// 系統字級（pt）
export const F = { largeTitle: 34, title: 28, title2: 22, title3: 20, headline: 17, body: 17, callout: 16, subhead: 15, footnote: 13, caption: 12 };

// 插圖（空白畫面用）：require 路徑＋原圖寬高比（寬/高），讓 Image 知道該留多高。
// 列在這裡的圖才會被打包進 app；茄子花、茄子、籃子、茄子田的圖檔還在 assets/img，要用時再加回來
export const ART = {
  basket: { src: require('../../assets/img/basket.webp'), r: 640 / 451 },
  sleep: { src: require('../../assets/img/sleep.webp'), r: 640 / 399 },
  search: { src: require('../../assets/img/search.webp'), r: 600 / 588 },
} as const;
export type ArtName = keyof typeof ART;

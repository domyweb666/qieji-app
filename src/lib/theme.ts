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

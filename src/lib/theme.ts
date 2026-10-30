import { Platform, PlatformColor, type ColorValue } from 'react-native';

// iOS 一律用系統色，外觀跟備忘錄、提醒事項一致；之後開深色模式時這些顏色會自己跟著換。
// 網頁／Android 沒有系統色，用 iOS 淺色模式的色碼代替（只用在開發預覽）。
const ios = Platform.OS === 'ios';
const sys = (name: string, fallback: string): ColorValue => (ios ? PlatformColor(name) : fallback);

export const C = {
  groupedBg: sys('systemGroupedBackground', '#F2F2F7'),
  card: sys('secondarySystemGroupedBackground', '#FFFFFF'),
  page: sys('systemBackground', '#FFFFFF'),
  fill: sys('tertiarySystemFill', 'rgba(118,118,128,0.12)'),
  label: sys('label', '#000000'),
  secondary: sys('secondaryLabel', 'rgba(60,60,67,0.6)'),
  tertiary: sys('tertiaryLabel', 'rgba(60,60,67,0.3)'),
  placeholder: sys('placeholderText', 'rgba(60,60,67,0.3)'),
  separator: sys('separator', 'rgba(60,60,67,0.29)'),
  red: sys('systemRed', '#FF3B30'),
  gray: sys('systemGray', '#8E8E93'),
  // 茄子紫：整個 app 的強調色（按鈕、圓圈、勾選）
  tint: '#7A4FA0',
  tintSoft: 'rgba(122,79,160,0.14)',
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

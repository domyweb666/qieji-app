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

export const HAIRLINE = ios ? 0.33 : 0.5;

// 插圖：require 路徑＋原圖寬高比（寬/高），讓 Image 知道該留多高
export const ART = {
  'face-happy': { src: require('../../assets/img/face-happy.webp'), r: 240 / 393 },
  basket: { src: require('../../assets/img/basket.webp'), r: 640 / 451 },
  sleep: { src: require('../../assets/img/sleep.webp'), r: 640 / 399 },
  search: { src: require('../../assets/img/search.webp'), r: 600 / 588 },
  flower: { src: require('../../assets/img/flower.webp'), r: 200 / 198 },
  'egg-small': { src: require('../../assets/img/egg-small.webp'), r: 180 / 283 },
  egg: { src: require('../../assets/img/egg.webp'), r: 180 / 252 },
  'egg-gold': { src: require('../../assets/img/egg-gold.webp'), r: 180 / 209 },
  'basket-only': { src: require('../../assets/img/basket-only.webp'), r: 154 / 129 },
  field: { src: require('../../assets/img/field.webp'), r: 941 / 800 },
} as const;
export type ArtName = keyof typeof ART;

// 選單裡的顏色圓點（原生選單只能放圖，不能直接塗色）
export const DOTS = {
  purple: require('../../assets/img/dot-purple.png'),
  yellow: require('../../assets/img/dot-yellow.png'),
  orange: require('../../assets/img/dot-orange.png'),
  red: require('../../assets/img/dot-red.png'),
  blue: require('../../assets/img/dot-blue.png'),
  green: require('../../assets/img/dot-green.png'),
  gray: require('../../assets/img/dot-gray.png'),
  black: require('../../assets/img/dot-black.png'),
  white: require('../../assets/img/dot-white.png'),
} as const;

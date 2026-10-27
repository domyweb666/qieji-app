export const T = {
  app: '#F7F1E8',
  bar: '#F0E6D8',
  line: '#E0D3C1',
  text: '#2A2230',
  muted: '#7A6E7F',
  egg: '#5B3A72',
  stem: '#6E8B3D',
  card: '#FFFDF9',
  danger: '#d0443a',
  navOff: '#9A8F9E',
};

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

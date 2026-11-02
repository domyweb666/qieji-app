// 網頁預覽／Android：沒有 SwiftUI 的系統選單（@expo/ui/swift-ui 在網頁上一載入就報錯），呼叫的地方看 HAS_NATIVE_MENU 改用自己畫的卡片（PopMenu）。
// iOS 版在 NativeMenu.ios.tsx。
import type { SFSymbol } from 'sf-symbols-typescript';
import type { ColorKey } from '../lib/model';
import type { Act } from './Acts';

export const HAS_NATIVE_MENU = false;

export function NativeMenu(_: {
  acts: Act[]; label: string; icon?: SFSymbol; color?: ColorKey; onColor?: (k: ColorKey) => void;
}) {
  return null;
}

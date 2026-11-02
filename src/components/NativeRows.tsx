// 網頁預覽／Android：沒有 SwiftUI 的系統清單，紙照舊用茄記自己做的行（Paper 看 HAS_NATIVE_ROWS）。iOS 版在 NativeRows.ios.tsx。
import type { StyleProp, ViewStyle } from 'react-native';
import type { Item } from '../lib/model';
import type { Colors } from '../lib/tokens';

export const HAS_NATIVE_ROWS = false;

export type NativeRowsProps = {
  items: Item[];
  colors: Colors; bg: string; rule: string;
  ordering: boolean;
  style?: StyleProp<ViewStyle>;
  onTap: (id: string) => void;
  onStrike: (id: string) => void;
  onRemove: (id: string) => void;
  onMoveTo: (id: string) => void;
  onCopy: (id: string) => void;
  onMove: (from: number, to: number) => void;
};

export function NativeRows(_: NativeRowsProps) {
  return null;
}

// SF Symbols 圖示。iOS 用系統圖示；網頁預覽沒有 SF Symbols，用舊的線條圖示或文字代替。
import { SymbolView } from 'expo-symbols';
import { Platform, Text, type ColorValue } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import type { Icon as IconComponent } from './Icon';

// 線條圖示（react-native-svg）只有網頁、Android 預覽會畫；iOS 不在啟動時載入那個模組（2026-10-31 低風險三件之一）
// eslint-disable-next-line @typescript-eslint/no-require-imports -- 要在執行時依平台決定載不載，import 做不到
const Icon: typeof IconComponent | null = Platform.OS === 'ios' ? null : require('./Icon').Icon;

const FALLBACK: Partial<Record<string, Parameters<typeof IconComponent>[0]['name']>> = {
  'chevron.left': 'back', checkmark: 'check', ellipsis: 'dots', plus: 'plus', magnifyingglass: 'search',
  trash: 'trash', xmark: 'close', 'arrow.uturn.backward': 'undo', 'arrow.uturn.forward': 'redo',
  'line.3.horizontal': 'menu', 'chevron.down': 'down', 'chevron.up': 'upchev', 'chevron.right': 'right', 'arrow.up': 'up', minus: 'minus',
};

export function Sym({ name, size = 20, color, weight }: { name: SFSymbol; size?: number; color: ColorValue; weight?: 'regular' | 'medium' | 'semibold' }) {
  if (Platform.OS === 'ios') return <SymbolView name={name} size={size} tintColor={color} weight={weight} />;
  const f = FALLBACK[name];
  if (f && Icon) return <Icon name={f} size={size} color={color as string} />;
  return <Text style={{ fontSize: size * 0.8, color, width: size, textAlign: 'center' }}>•</Text>;
}

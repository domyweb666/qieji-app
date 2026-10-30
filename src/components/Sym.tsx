// SF Symbols 圖示。iOS 用系統圖示；網頁預覽沒有 SF Symbols，用舊的線條圖示或文字代替。
import { SymbolView } from 'expo-symbols';
import { Platform, Text, type ColorValue } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Icon } from './Icon';

const FALLBACK: Partial<Record<string, Parameters<typeof Icon>[0]['name']>> = {
  'chevron.left': 'back', checkmark: 'check', ellipsis: 'dots', plus: 'plus', magnifyingglass: 'search',
  trash: 'trash', xmark: 'close', 'arrow.uturn.backward': 'undo', 'arrow.uturn.forward': 'redo',
  'line.3.horizontal': 'menu',
};

export function Sym({ name, size = 20, color, weight }: { name: SFSymbol; size?: number; color: ColorValue; weight?: 'regular' | 'medium' | 'semibold' }) {
  if (Platform.OS === 'ios') return <SymbolView name={name} size={size} tintColor={color} weight={weight} />;
  const f = FALLBACK[name];
  if (f) return <Icon name={f} size={size} color={color as string} />;
  return <Text style={{ fontSize: size * 0.8, color, width: size, textAlign: 'center' }}>•</Text>;
}

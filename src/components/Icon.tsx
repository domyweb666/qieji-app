// 線條圖示：網頁預覽沒有 SF Symbols 時的替身，所以形狀照 iOS 的 chevron.left、ellipsis（橫的 ⋯）
import Svg, { Circle, Path } from 'react-native-svg';

type Name = 'back' | 'check' | 'dots' | 'plus' | 'notes' | 'search' | 'trash' | 'close' | 'menu' | 'undo' | 'redo';

// 顏色一律由呼叫的人從代號給，這裡沒有預設色
export function Icon({ name, size = 26, color }: { name: Name; size?: number; color: string }) {
  const line = (w: number) => ({ fill: 'none', stroke: color, strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'back' && <Path {...line(2.2)} d="M15 5l-7 7 7 7" />}
      {name === 'check' && <Path {...line(2.6)} d="M4.5 12.5l5 5L20 7" />}
      {name === 'dots' && <>
        <Circle cx={5} cy={12} r={2} fill={color} />
        <Circle cx={12} cy={12} r={2} fill={color} />
        <Circle cx={19} cy={12} r={2} fill={color} />
      </>}
      {name === 'plus' && <Path {...line(2.4)} d="M12 5v14M5 12h14" />}
      {name === 'notes' && <Path fill={color} d="M6 3h12a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 5v2h8V8H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8zM7 1h2v4H7zm4 0h2v4h-2zm4 0h2v4h-2z" />}
      {name === 'search' && <>
        <Circle {...line(2.4)} cx={10.5} cy={10.5} r={6.5} />
        <Path {...line(2.4)} d="M15.5 15.5L21 21" />
      </>}
      {name === 'trash' && <Path {...line(2.1)} d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />}
      {name === 'close' && <Path {...line(2.4)} d="M6 6l12 12M18 6L6 18" />}
      {name === 'menu' && <Path {...line(2.3)} d="M4 6h16M4 12h16M4 18h16" />}
      {name === 'undo' && <Path {...line(2.6)} d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 6 6v1" />}
      {name === 'redo' && <Path {...line(2.6)} d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0-6 6v1" />}
    </Svg>
  );
}

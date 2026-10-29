// 選單項目只寫一次：iOS 畫成原生下拉選單（Stack.Toolbar.Menu），網頁預覽改成自己畫的動作表單。
import { Stack } from 'expo-router';
import type { ImageSourcePropType } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import { ui } from './Overlay';

export type Act = {
  label: string;
  icon?: SFSymbol;
  img?: ImageSourcePropType; // 彩色小圖（例如顏色圓點），保留原本的顏色
  fn?: () => void;
  destructive?: boolean;
  on?: boolean;
  sub?: Act[];      // 子選單
  inline?: boolean; // 子選單直接攤開成一個區塊
  hidden?: boolean;
};

// 注意：這是函式不是元件。Stack.Toolbar 只認得它自己的子元件，包一層自訂元件會被忽略。
export function menuItems(acts: Act[]) {
  return acts.filter(a => !a.hidden).map((a, i) => (a.sub
    ? <Stack.Toolbar.Menu key={i} title={a.label} icon={a.icon} inline={a.inline}>{menuItems(a.sub)}</Stack.Toolbar.Menu>
    : (
      <Stack.Toolbar.MenuAction key={i} icon={a.img ?? a.icon} iconRenderingMode={a.img ? 'original' : undefined}
        isOn={a.on} destructive={a.destructive} onPress={a.fn}>
        {a.label}
      </Stack.Toolbar.MenuAction>
    )));
}

export function showActs(acts: Act[], title?: string) {
  ui.sheet(acts.filter(a => !a.hidden).flatMap(a => (a.sub && a.inline
    ? a.sub.filter(x => !x.hidden).map(x => ({ label: x.label, on: x.on, danger: x.destructive, fn: () => x.fn?.() }))
    : [{ label: a.label, on: a.on, danger: a.destructive, fn: () => (a.sub ? showActs(a.sub, a.label) : a.fn?.()) }])), title);
}

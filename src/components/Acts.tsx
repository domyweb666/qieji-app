// 選單項目只寫一次：iOS 畫成原生下拉選單（Stack.Toolbar.Menu），網頁預覽改成自己畫的動作表單。
import { Stack } from 'expo-router';
import type { SFSymbol } from 'sf-symbols-typescript';
import { ui } from './Overlay';

export type Act = {
  label: string;
  icon?: SFSymbol;
  fn?: () => void;
  destructive?: boolean;
  on?: boolean;
  sub?: Act[];      // 子選單
  inline?: boolean; // 子選單直接攤開成一個區塊
  head?: boolean;   // inline 攤開時，把這個 label 印成那一組的小標題（PopMenu；例如目錄的「排序」）
  hidden?: boolean;
};

// 注意：這是函式不是元件。Stack.Toolbar 只認得它自己的子元件，包一層自訂元件會被忽略。
export function menuItems(acts: Act[]) {
  return acts.filter(a => !a.hidden).map((a, i) => (a.sub
    ? <Stack.Toolbar.Menu key={i} title={a.label} icon={a.icon} inline={a.inline}>{menuItems(a.sub)}</Stack.Toolbar.Menu>
    : (
      <Stack.Toolbar.MenuAction key={i} icon={a.icon} isOn={a.on} destructive={a.destructive} onPress={a.fn}>
        {a.label}
      </Stack.Toolbar.MenuAction>
    )));
}

export function showActs(acts: Act[], title?: string) {
  ui.sheet(acts.filter(a => !a.hidden).flatMap(a => (a.sub && a.inline
    ? a.sub.filter(x => !x.hidden).map(x => ({ label: x.label, on: x.on, danger: x.destructive, fn: () => x.fn?.() }))
    : [{ label: a.label, on: a.on, danger: a.destructive, fn: () => (a.sub ? showActs(a.sub, a.label) : a.fn?.()) }])), title);
}

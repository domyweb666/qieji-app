// 把「上次那張紙」推給桌面小工具（expo-widgets）。store 存檔成功、或換了一張紙時呼叫。
// 小工具跑在隔離環境、讀不到 AsyncStorage 也不能 import tokens，所以這裡把名字、前幾行、
// 顏色（淺色深色各一組）、字級、間距、各尺寸放幾行全部算好，用 props 一次推過去。
// 只有 iOS 的開發版／正式版有這個原生模組：網頁、Android 不推；Expo Go 沒有模組，第一次推會失敗，之後就不再試。
import { Platform } from 'react-native';
import { label, type Note, type State } from './model';
import { colors, noteColors, T } from './tokens';
import type { PaperWidgetProps } from '../../widgets/PaperWidget';

type PaperWidget = { updateSnapshot(props: PaperWidgetProps): void };
let widget: PaperWidget | null | undefined;

function load(): PaperWidget | null {
  if (widget !== undefined) return widget;
  if (Platform.OS !== 'ios') return (widget = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 只有 iOS 才載，import 做不到
    widget = (require('../../widgets/PaperWidget') as { default: PaperWidget }).default;
  } catch (e) {
    console.warn('小工具模組載入失敗（Expo Go 沒有 expo-widgets，開發版才有）：', e);
    widget = null;
  }
  return widget;
}

// 跟根畫面（src/app/index.tsx）同一條規則：上次開著的那張，沒有就最近改過的那張
export function pickPaper(s: State, last: string | null): Note | undefined {
  return s.notes.find(x => x.id === last && !x.deleted)
    ?? s.notes.filter(x => !x.deleted).sort((a, b) => b.updated - a.updated)[0];
}

export function widgetProps(s: State, last: string | null): PaperWidgetProps {
  const n = pickPaper(s, last);
  const key = n?.color ?? 'yellow';
  const scheme = (mode: 'light' | 'dark') => {
    const c = colors(mode);
    return { bg: noteColors(key, mode).bg, text: c.textPrimary, strike: c.textStrike };
  };
  const lines = n ? n.items.filter(i => i.t.trim()).slice(0, T.widget.lines.large).map(i => ({ t: i.t, done: i.done })) : [];
  return {
    title: n ? label(n) : '茄記',
    lines,
    light: scheme('light'),
    dark: scheme('dark'),
    titleSize: T.font.subheadBold.fontSize,
    lineSize: T.font.subhead.fontSize,
    gap: T.space.xs,
    max: T.widget.lines,
  };
}

// 上次推過去的內容：一樣就不推（2026-11-03 多米：用一下手機就發熱）。每推一次 iOS 就叫醒小工具重畫一次（expo-widgets 的
// updateSnapshot → WidgetCenter.reloadTimelines），以前每次存檔都推：打字停一下、拖一下目錄、換一張紙都推，小工具上的字根本沒變
let sent = '';
export function pushWidget(s: State, last: string | null) {
  const w = load();
  if (!w) return;
  try {
    const props = widgetProps(s, last), key = JSON.stringify(props);
    if (key === sent) return;
    w.updateSnapshot(props);
    sent = key;
  } catch (e) {
    console.warn('小工具更新失敗：', e);
  }
}

// 桌面／鎖定畫面小工具（expo-widgets）：上次那張紙的名字和前幾行，點了開 app（app 的根就是上次那張紙）。
// 多米 2026-10-31 定：第一版只讀不寫；行照紙上順序列，劃掉的用刪除線加淡色。
// 這個函式跑在小工具自己的隔離環境：不能 import、不能用 hooks、不能碰函式外的變數。
// 所以顏色、字級、間距、每種尺寸放幾行全部由 src/lib/widget.ts 從 tokens 算好，用 props 傳進來；這裡一個裸數字都不寫。
import { Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, lineLimit, strikethrough } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type PaperWidgetLine = { t: string; done: boolean };
export type PaperWidgetScheme = { bg: string; text: string; strike: string };
export type PaperWidgetProps = {
  title: string;
  lines: PaperWidgetLine[];
  light: PaperWidgetScheme;
  dark: PaperWidgetScheme;
  titleSize: number;
  lineSize: number;
  gap: number;
  max: { small: number; medium: number; large: number; lock: number };
};

const PaperWidget = (p: PaperWidgetProps, env: WidgetEnvironment) => {
  'widget';
  const fam = env.widgetFamily;
  // 鎖定畫面那幾種由系統決定顏色（vibrant），不上底色也不指定文字色
  const lock = fam === 'accessoryRectangular' || fam === 'accessoryInline' || fam === 'accessoryCircular';
  const c = env.colorScheme === 'dark' ? p.dark : p.light;
  const max = lock ? p.max.lock : fam === 'systemLarge' ? p.max.large : fam === 'systemSmall' ? p.max.small : p.max.medium;
  const shown = p.lines.slice(0, max);
  const titleMods = lock
    ? [font({ size: p.titleSize, weight: 'bold' }), lineLimit(1)]
    : [font({ size: p.titleSize, weight: 'bold' }), foregroundStyle(c.text), lineLimit(1)];
  // 不自己加 padding：iOS 17 起系統已經替小工具留一圈內邊距，再疊一圈字會縮在中間、看起來比實際小（多米 2026-11-01）
  return (
    <VStack alignment="leading" spacing={p.gap} modifiers={lock ? [] : [containerBackground(c.bg, 'widget')]}>
      <Text modifiers={titleMods}>{p.title}</Text>
      {shown.map((l, i) => (
        <Text
          key={i}
          modifiers={
            lock
              ? [font({ size: p.lineSize }), strikethrough({ isActive: l.done, pattern: 'solid' }), lineLimit(1)]
              : [
                  font({ size: p.lineSize }),
                  foregroundStyle(l.done ? c.strike : c.text),
                  strikethrough({ isActive: l.done, pattern: 'solid', color: c.strike }),
                  lineLimit(1),
                ]
          }>
          {l.t}
        </Text>
      ))}
      <Spacer />
    </VStack>
  );
};

// 第一次裝上、app 還沒推過資料時的樣子（空紙）。真正的值由 src/lib/widget.ts 在存檔時推
export const EMPTY_PROPS: PaperWidgetProps = {
  title: '茄記',
  lines: [],
  // 抄自 tokens 的 cream100／plum900（淺、深）：這個檔不能 import tokens（原生那邊會單獨 bundle 它），只在小工具還沒收到資料時用，之後每次存檔都會被 tokens 算出來的值蓋掉
  light: { bg: '#FBF3E7', text: '#2E2233', strike: '#2E2233' },
  dark: { bg: '#211A27', text: '#F2EAF1', strike: '#F2EAF1' },
  titleSize: 15,
  lineSize: 15,
  gap: 4,
  max: { small: 3, medium: 4, large: 10, lock: 2 },
};

export default createWidget<PaperWidgetProps>('PaperWidget', PaperWidget, EMPTY_PROPS);

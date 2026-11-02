// 點一下就開的選單（紙右上的 ⋯）：iOS 上用真的系統選單（SwiftUI Menu，@expo/ui），跟備忘錄、提醒事項的 ⋯ 同一個東西——
// 從按鈕長出來、後面霧掉、項目照系統排、刪除是紅字（2026-11-02 多米：「整個 app 都用 iPhone 自己的系統元件」）。
// 九個顏色放最上面一排（系統選單的「調色盤」樣式，像郵件的旗標顏色）。
// 項目還是寫成 Act[]（跟 PopMenu 同一份），所以網頁預覽、還沒重建的舊開發版（沒有原生碼）照舊用自己畫的卡片（呼叫的地方判斷 HAS_NATIVE_MENU）。
import { requireOptionalNativeModule } from 'expo';
import { Button, Host, Image, Menu, Picker, Section } from '@expo/ui/swift-ui';
import { accessibilityLabel, contentShape, frame, menuOrder, pickerStyle, shapes, tag, tint } from '@expo/ui/swift-ui/modifiers';
import { Platform, StyleSheet } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import { CKEYS, col, type ColorKey } from '../lib/model';
import { noteColors, T, useColors } from '../lib/tokens';
import type { Act } from './Acts';
import { Glass } from './Glass';

export const HAS_NATIVE_MENU = Platform.OS === 'ios' && !!requireOptionalNativeModule('ExpoUI');

const BTN = T.shape.hitMin;

// Act[] → 系統選單的項目：一般的是按鈕、inline 的子選單是一個分段（有 head 就印小標題）、其他子選單是下一層選單
function items(acts: Act[]) {
  return acts.filter(a => !a.hidden).map((a, i) => {
    if (a.sub && a.inline) {
      const rows = a.sub.filter(x => !x.hidden);
      return rows.length ? <Section key={i} title={a.head ? a.label : undefined}>{items(rows)}</Section> : null;
    }
    if (a.sub) return <Menu key={i} label={a.label} systemImage={a.icon}>{items(a.sub)}</Menu>;
    return (
      <Button key={i} label={a.label} systemImage={(a.on ? 'checkmark' : a.icon) as SFSymbol | undefined}
        role={a.destructive ? 'destructive' : undefined} onPress={a.fn} />
    );
  });
}

export function NativeMenu({ acts, label, icon = 'ellipsis', color, onColor }: {
  acts: Act[]; label: string; icon?: SFSymbol;
  color?: ColorKey; onColor?: (k: ColorKey) => void; // 給了就在最上面放一排九個顏色
}) {
  const c = useColors();
  return (
    <Glass style={st.btn} interactive>
      <Host style={st.host}>
        <Menu
          label={<Image systemName={icon} size={20} color={c.textPrimary} modifiers={[frame({ width: BTN, height: BTN }), contentShape(shapes.circle())]} />}
          modifiers={[menuOrder('fixed'), accessibilityLabel(label)]}>
          {color && onColor ? (
            <Picker label="顏色" systemImage="paintpalette" selection={color} onSelectionChange={(k: ColorKey) => onColor(k)}
              modifiers={[pickerStyle('palette')]}>
              {CKEYS.map(k => {
                const hex = noteColors(k, c.mode).hd;
                return <Image key={k} systemName="circle.fill" color={hex} modifiers={[tag(k), tint(hex), accessibilityLabel(`${col(k).hue}（${col(k).name}）`)]} />;
              })}
            </Picker>
          ) : null}
          {items(acts)}
        </Menu>
      </Host>
    </Glass>
  );
}

const st = StyleSheet.create({
  btn: { width: BTN, height: BTN, borderRadius: T.shape.pill(BTN) },
  host: { width: BTN, height: BTN },
});

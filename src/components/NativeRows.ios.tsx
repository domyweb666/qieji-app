// 紙上的行：iOS 系統清單版（SwiftUI List，@expo/ui）。多米 2026-11-02 選「真的系統清單元件」，跟茄記自己做的那套並存、⋯ 選單裡切換對照。
// 全部是系統的行為：
// - 往右滑露出「劃掉」、往左滑露出「刪除」，再點一下或滑到底才做（郵件、提醒事項那種）
// - 長按一行＝系統的長按選單（浮起那行、後面霧掉）
// - 排順序＝⋯ →「排順序」進系統的編輯模式，右邊出現 ≡ 拖、左邊紅色 − 刪除
// - 捲動、彈回、往下捲收鍵盤也是系統的
// 系統清單裡不能放輸入框在原地打字（會跟鍵盤、捲動打架），所以點一行＝下面的輸入框帶著那行的字升起來改（Paper 處理）。
import { Button, ContextMenu, Host, List, SwipeActions, Text } from '@expo/ui/swift-ui';
import {
  accessibilityLabel, contentShape, environment, font, foregroundStyle, frame, lineSpacing, listRowBackground, listRowInsets, listRowSeparatorTint,
  listStyle, onTapGesture, scrollContentBackground, scrollDismissesKeyboard, shapes, strikethrough, tint,
} from '@expo/ui/swift-ui/modifiers';
import { requireOptionalNativeModule } from 'expo';
import { useCallback, useRef } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import type { Item } from '../lib/model';
import { T, type Colors } from '../lib/tokens';

export const HAS_NATIVE_ROWS = Platform.OS === 'ios' && !!requireOptionalNativeModule('ExpoUI');

// 字跟茄記版一樣大（多米 2026-11-03：系統清單的字太小）：以前寫死 17 點、不跟「設定→字體大小」放大，茄記版會跟；
// 改用系統內文字級（預設也是 17，會跟著放大）。多行時的行距補到跟茄記版的 27 差不多（系統自己的行高約 22，差的那段用 lineSpacing 補），
// 上下留白也照茄記版每行上下各 12（以前只給左右，上下是 0，整行擠在一起看起來更小）
const LINE_GAP = T.font.bodyLine.lineHeight - T.font.composerLine.lineHeight, PAD = T.space.m, SIDE = T.space.l;

export type NativeRowsProps = {
  items: Item[];
  colors: Colors; bg: string; rule: string;
  ordering: boolean; // 系統編輯模式（排順序）
  style?: StyleProp<ViewStyle>;
  onTap: (id: string) => void;
  onStrike: (id: string) => void;
  onRemove: (id: string) => void;
  onMoveTo: (id: string) => void;
  onCopy: (id: string) => void;
  onMove: (from: number, to: number) => void; // to＝拿掉之前的位置（系統的算法），Paper 換算
};

export function NativeRows({ items, colors: c, bg, rule, ordering, style, onTap, onStrike, onRemove, onMoveTo, onCopy, onMove }: NativeRowsProps) {
  // 2026-11-03 多米真機：系統清單版排順序不能用。兩個原因：(1) 每一行都一次畫出來（recycling 關著），上千行時一動就要重畫上千行；
  // (2) 畫一行的函式跟著紙每次重畫換新（點、劃掉這些函式每次都是新的），清單以為每一行都變了、全部重畫。
  // 改成只畫看得到附近的行（recycling 開著），點、劃掉這些交給 ref，畫一行的函式只在顏色換了才換
  const on = useRef({ onTap, onStrike, onRemove, onMoveTo, onCopy });
  on.current = { onTap, onStrike, onRemove, onMoveTo, onCopy };
  const row = useCallback(({ item: it }: { item: Item }) => {
    const { onTap, onStrike, onRemove, onMoveTo, onCopy } = on.current;
    const has = !!it.t.trim();
    return (
      <SwipeActions modifiers={[listRowBackground(bg), listRowSeparatorTint(rule), listRowInsets({ top: PAD, bottom: PAD, leading: SIDE, trailing: SIDE })]}>
        <ContextMenu>
          <ContextMenu.Items>
            {has ? <Button label={it.done ? '恢復' : '劃掉'} systemImage={it.done ? 'arrow.uturn.backward' : 'strikethrough'} onPress={() => onStrike(it.id)} /> : null}
            {has ? <Button label="搬到…" systemImage="arrow.turn.up.right" onPress={() => onMoveTo(it.id)} /> : null}
            {has ? <Button label="複製" systemImage="doc.on.doc" onPress={() => onCopy(it.id)} /> : null}
            <Button label="刪除" systemImage="trash" role="destructive" onPress={() => onRemove(it.id)} />
          </ContextMenu.Items>
          <ContextMenu.Trigger>
            <Text modifiers={[
              font({ textStyle: 'body' }),
              lineSpacing(LINE_GAP),
              foregroundStyle(it.done ? c.textStrike : c.textPrimary),
              strikethrough({ isActive: it.done, pattern: 'solid' }),
              frame({ maxWidth: Infinity, alignment: 'leading' }),
              frame({ minHeight: T.shape.rowMin - PAD * 2 }),
              contentShape(shapes.rectangle()),
              onTapGesture(() => onTap(it.id)),
              accessibilityLabel(it.done ? `${it.t}，已劃掉` : it.t),
            ]}>{it.t}</Text>
          </ContextMenu.Trigger>
        </ContextMenu>
        {has ? (
          <SwipeActions.Actions edge="leading">
            <Button label={it.done ? '恢復' : '劃掉'} systemImage={it.done ? 'arrow.uturn.backward' : 'strikethrough'}
              onPress={() => onStrike(it.id)} modifiers={[tint(c.swipeStrikeBg)]} />
          </SwipeActions.Actions>
        ) : null}
        <SwipeActions.Actions edge="trailing">
          <Button label="刪除" systemImage="trash" role="destructive" onPress={() => onRemove(it.id)} />
        </SwipeActions.Actions>
      </SwipeActions>
    );
  }, [bg, rule, c]);

  return (
    <Host style={style} colorScheme={c.mode === 'dark' ? 'dark' : 'light'}>
      <List modifiers={[
        listStyle('plain'), scrollContentBackground('hidden'), scrollDismissesKeyboard('interactively'),
        environment('editMode', ordering ? 'active' : 'inactive'),
      ]}>
        <List.ForEach data={items} keyExtractor={it => it.id} estimatedItemSize={T.shape.rowMin}
          onMove={(src, dest) => onMove(src[0], dest)} onDelete={idx => idx.forEach(i => items[i] && on.current.onRemove(items[i].id))}>
          {row}
        </List.ForEach>
      </List>
    </Host>
  );
}

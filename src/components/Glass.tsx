// 系統材質（2026-11-02 多米：「整個 app 都用 iPhone 自己的系統元件」，選「外觀全換、互動保留」）。
// 浮在紙上面的那一層（右上圓鈕、右下 ＋、✓、輸入框、提示條、選單卡）都用這個，照 Apple 的 Materials 規範只用在「浮在內容上面」的東西：
// - iOS 26 以上：液態玻璃（expo-glass-effect 的 GlassView，就是系統按鈕、工具列用的那個 UIGlassEffect）
// - iOS 26 以下：系統霧面材質（expo-blur 的 BlurView＝UIVisualEffectView）
// - 系統「減少透明度」開著、網頁預覽、或還沒重建的舊開發版裡沒有原生碼：不透明的底（solid），樣子跟以前一樣，不會閃退
import { requireOptionalNativeModule } from 'expo';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useSyncExternalStore, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';
import { T, useColors } from '../lib/tokens';

const IOS = Platform.OS === 'ios';
const HAS_BLUR = IOS && !!requireOptionalNativeModule('ExpoBlur');
const HAS_GLASS_MOD = IOS && !!requireOptionalNativeModule('ExpoGlassEffect');
// 有些 iOS 26 測試版沒有液態玻璃的 API、硬畫會閃退（官方文件），兩個都要問過
const HAS_GLASS = HAS_GLASS_MOD && (() => { try { return isGlassEffectAPIAvailable() && isLiquidGlassAvailable(); } catch { return false; } })();

// 系統設定「減少透明度」（輔助使用 → 顯示與文字大小）：開著就不霧化、不玻璃，改用不透明的底（HIG：Materials）。
// 整個 app 只問一次、只聽一次（2026-11-04 程式審查）：以前每個浮層掛上時才各自去問，問到之前一律當成沒開——
// 開著這個設定的人，每次打開選單、跳提示條、右下 ＋ 回來，都會先閃一下玻璃再變不透明。app 一啟動就問，紙畫出來之前就知道了
let reduceOn = false;
const reduceSubs = new Set<() => void>();
const setReduce = (v: boolean) => { if (v === reduceOn) return; reduceOn = v; reduceSubs.forEach(f => f()); };
if (IOS) { // 只有 iOS 有這個設定（網頁預覽沒有這個方法）
  AccessibilityInfo.isReduceTransparencyEnabled().then(setReduce, e => console.warn('讀不到「減少透明度」設定：', e));
  AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce);
}
const subscribeReduce = (f: () => void) => { reduceSubs.add(f); return () => { reduceSubs.delete(f); }; };
const getReduce = () => reduceOn;
export function useReduceTransparency() {
  return useSyncExternalStore(subscribeReduce, getReduce, getReduce);
}

export type Surface = 'glass' | 'blur' | 'solid';
// 這台手機、這個設定下，浮層用哪一種材質
export function useSurface(): Surface {
  const reduce = useReduceTransparency();
  if (reduce) return 'solid';
  if (HAS_GLASS) return 'glass';
  return HAS_BLUR ? 'blur' : 'solid';
}
// 霧化做得出來嗎（資料夾後面、選單後面那層用；液態玻璃不適合鋪滿整個畫面）
export function useCanBlur() {
  const reduce = useReduceTransparency();
  return HAS_BLUR && !reduce;
}

type Props = {
  style?: StyleProp<ViewStyle>; // 外框：大小、圓角（玻璃照圓角裁）、位置
  tint?: ColorValue;            // 玻璃上色（右下 ＋ 用茄紫）；霧面與不透明版用它當底色
  solid?: ColorValue;           // 不透明版的底色，預設奶油白 surface
  interactive?: boolean;        // 按下去玻璃會亮一下、微微放大（系統按鈕的手感），只有液態玻璃有
  material?: 'chrome' | 'thick'; // 霧面版用哪一種：按鈕列用 chrome，選單卡用 thick
  children?: ReactNode;
};

export function Glass({ style, tint, solid, interactive, material = 'chrome', children }: Props) {
  const c = useColors();
  const kind = useSurface();
  if (kind === 'glass') {
    return (
      <GlassView style={[st.clip, style]} glassEffectStyle="regular" isInteractive={interactive} tintColor={tint as string | undefined}
        colorScheme={c.mode === 'dark' ? 'dark' : 'light'}>
        {children}
      </GlassView>
    );
  }
  if (kind === 'blur') {
    const m = material === 'thick' ? 'systemThickMaterial' : 'systemChromeMaterial';
    return (
      <View style={[st.clip, style, tint ? { backgroundColor: tint } : null]}>
        <BlurView style={StyleSheet.absoluteFill} intensity={T.shape.materialBlur} tint={m} pointerEvents="none" />
        {children}
      </View>
    );
  }
  // 不透明版跟以前一樣帶軟陰影（不裁邊，陰影才不會被切掉）
  return <View style={[{ backgroundColor: tint ?? solid ?? c.surface }, T.shape.shadowSoft, style]}>{children}</View>;
}

const st = StyleSheet.create({
  // 圓角要靠 overflow hidden 才裁得到霧面（expo-blur 文件）
  clip: { overflow: 'hidden' },
});

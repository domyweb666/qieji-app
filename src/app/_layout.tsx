import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { OverlayHost, ui } from '../components/Overlay';
import { store } from '../lib/store';
import { T, useColors } from '../lib/tokens';

// 存不進去時字還在記憶體裡，下次有改動或 app 進背景會再存一次；但這時把 app 關掉就會不見，要講清楚。
// 第一句先答「有沒有損失」；用一顆按鈕的提示框不用 toast，因為會丟字的訊息要讓人讀完（06-首次體驗 ❓7）
store.onSaveError(() => ui.alert('字還在，但沒存進手機', '空間可能不夠。先別關 app，清出空間後再改一下就會重存'));

const ios = Platform.OS === 'ios';
// iOS 26 起標題列是玻璃材質，自己加模糊反而會蓋掉；舊版 iOS 才補上系統模糊
const glass = ios && parseInt(String(Platform.Version), 10) >= 26;

// 啟動畫面撐到資料讀完、紙畫出來才收（2026-10-31 低風險三件之一）。不然 expo-router 第一次畫完就收，
// 中間會閃一下空白的奶油色再出現紙。要在第一次畫之前叫，所以放模組層級；沒有原生模組（網頁）時它自己什麼都不做。
// S1（2026-11-01 第四輪）：收起時淡出（只有 iOS 有），奶油底融進第一張紙、不硬切，06 的 ❓12 不改色就收；
// 改用 expo-splash-screen 自己的 API（expo-router 的殼沒有 setOptions）。開發版的啟動畫面不完全等於正式版，最後要看 release 建置
SplashScreen.setOptions({ fade: true, duration: T.motion.splashFade });
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const c = useColors();
  const [ready, setReady] = useState(store.loaded);
  useEffect(() => { store.load().then(() => setReady(true)); }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.page }}>
      {/* K7（2026-11-01 第四輪）：鍵盤逐格高度的來源。要包在整個 app 外面，紙上的膠囊與輸入框從它拿鍵盤位置（網頁上只是個 View） */}
      <KeyboardProvider>
        <StatusBar style={c.mode === 'dark' ? 'light' : 'dark'} />
        {/* 收啟動畫面：ready 之後第一次排版完才收，畫面上已經是紙，不是空白。
            onLayout 要掛在「ready 才掛上」的這層：之前掛在根 View，它第一次排版時 ready 還是 false，之後子樹換成紙根 View 的框沒變、
            onLayout 不會再來，啟動畫面就永遠收不掉。以前沒事是因為 expo-splash-screen 的原生模組根本沒裝進去、preventAutoHide 是空轉；
            第四輪 S1 真的裝上後（2026-11-01 真機：一片白）才露出來 */}
        {ready ? (
          <View style={{ flex: 1 }} onLayout={() => SplashScreen.hide()}>
            <Stack screenOptions={{
              headerShown: ios,
              headerTransparent: ios,
              headerBlurEffect: glass ? undefined : 'systemChromeMaterial',
              headerShadowVisible: false,
              headerLargeTitleShadowVisible: false,
              headerTintColor: c.accent,
              headerBackButtonDisplayMode: 'minimal',
              headerTitle: '',
              // 被蓋在下面的畫面（例如開著筆記時的首頁）先暫停，不跟著重畫
              freezeOnBlur: true,
              contentStyle: { backgroundColor: c.page },
            }}>
              {/* 根畫面就是一張紙（重新設計分支「紙是家」）：不用系統標題列，自己畫一條：清單名和 ⋯ 在同一行 */}
              <Stack.Screen name="index" options={{ headerShown: false, contentStyle: { backgroundColor: c.page } }} />
              {/* 目錄：從紙最上面的清單名拉起來的面板，佔九成高。0.9 只用一次 */}
              <Stack.Screen name="directory" options={{
                presentation: 'formSheet', sheetAllowedDetents: [0.9], sheetGrabberVisible: true, sheetCornerRadius: T.shape.radiusPanel,
                headerShown: false, contentStyle: { backgroundColor: c.surface },
              }} />
              <Stack.Screen name="trash" options={{ headerLargeTitleEnabled: true }} />
            </Stack>
          </View>
        ) : <View style={{ flex: 1, backgroundColor: c.page }} />}
        <OverlayHost />
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { OverlayHost, ui } from '../components/Overlay';
import { store } from '../lib/store';
import { C } from '../lib/theme';

store.onSaveError(() => ui.toast('儲存失敗：空間不足'));

const ios = Platform.OS === 'ios';
// iOS 26 起標題列是玻璃材質，自己加模糊反而會蓋掉；舊版 iOS 才補上系統模糊
const glass = ios && parseInt(String(Platform.Version), 10) >= 26;

export default function RootLayout() {
  const [ready, setReady] = useState(store.loaded);
  useEffect(() => { store.load().then(() => setReady(true)); }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <StatusBar style="dark" />
      {ready ? (
        <Stack screenOptions={{
          headerShown: ios,
          headerTransparent: ios,
          headerBlurEffect: glass ? undefined : 'systemChromeMaterial',
          headerShadowVisible: false,
          headerLargeTitleShadowVisible: false,
          headerTintColor: C.tint,
          headerBackButtonDisplayMode: 'minimal',
          headerTitle: '',
          // 被蓋在下面的畫面（例如開著筆記時的首頁）先暫停，不跟著重畫
          freezeOnBlur: true,
          contentStyle: { backgroundColor: C.groupedBg },
        }}>
          {/* 首頁：標題列不透明、不放標題（像提醒事項），底下是左右滑的三頁 */}
          <Stack.Screen name="index" options={{ headerTransparent: false, headerStyle: { backgroundColor: C.groupedBg } }} />
          <Stack.Screen name="trash" options={{ headerLargeTitleEnabled: true }} />
          {/* iOS 26 預設整個畫面往右滑都會返回，會搶走「往右滑劃掉」；改成只有從螢幕左緣滑才返回 */}
          {/* 打開 app 直接回到上次的筆記時不播推入動畫，看起來就是停在那裡 */}
          {/* 清單頁不用系統標題列，自己畫一條窄的：返回鍵和清單名稱在同一行 */}
          <Stack.Screen name="note/[id]" options={({ route }) => ({
            headerShown: false, contentStyle: { backgroundColor: C.page }, fullScreenGestureEnabled: false,
            animation: (route.params as { restore?: string } | undefined)?.restore ? 'none' : 'default',
          })} />
          <Stack.Screen name="color/[id]" options={{
            presentation: 'formSheet', sheetAllowedDetents: 'fitToContents', sheetGrabberVisible: true, sheetCornerRadius: 24,
            headerShown: false, contentStyle: { backgroundColor: C.card },
          }} />
        </Stack>
      ) : <View style={{ flex: 1, backgroundColor: C.groupedBg }} />}
      <OverlayHost />
    </GestureHandlerRootView>
  );
}

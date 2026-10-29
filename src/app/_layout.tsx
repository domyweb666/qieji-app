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
          <Stack.Screen name="index" options={{ headerLargeTitleEnabled: true }} />
          <Stack.Screen name="folder/[kind]" options={{ headerLargeTitleEnabled: true }} />
          {/* iOS 26 預設整個畫面往右滑都會返回，會搶走「往右滑劃掉」；改成只有從螢幕左緣滑才返回 */}
          <Stack.Screen name="note/[id]" options={{ contentStyle: { backgroundColor: C.page }, fullScreenGestureEnabled: false }} />
          <Stack.Screen name="garden" options={{ presentation: 'modal', sheetGrabberVisible: true, headerTitle: '茄子田' }} />
        </Stack>
      ) : <View style={{ flex: 1, backgroundColor: C.groupedBg }} />}
      <OverlayHost />
    </GestureHandlerRootView>
  );
}

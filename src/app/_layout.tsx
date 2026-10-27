import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { OverlayHost, ui } from '../components/Overlay';
import { store } from '../lib/store';
import { T } from '../lib/theme';

store.onSaveError(() => ui.toast('儲存失敗：空間不足'));

export default function RootLayout() {
  const [ready, setReady] = useState(store.loaded);
  useEffect(() => { store.load().then(() => setReady(true)); }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: T.app }}>
      <StatusBar style="dark" />
      {ready ? (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: T.app } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="note/[id]" options={{ gestureEnabled: true }} />
          <Stack.Screen name="garden" options={{ presentation: 'modal' }} />
        </Stack>
      ) : <View style={{ flex: 1, backgroundColor: T.app }} />}
      <OverlayHost />
    </GestureHandlerRootView>
  );
}

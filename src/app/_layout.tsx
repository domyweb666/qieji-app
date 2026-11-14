import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { OverlayHost, ui } from '../components/Overlay';
import { startAccess } from '../lib/access';
import { startIap } from '../lib/iap';
import { loadLook } from '../lib/look';
import { takeNews } from '../lib/newsAsk';
import { loadTextSize } from '../lib/textSize';
import { reviewOpened } from '../lib/reviewAsk';
import { store } from '../lib/store';
import { T, useColors } from '../lib/tokens';

// 存不進去時字還在記憶體裡，下次有改動或 app 進背景會再存一次；但這時把 app 關掉就會不見，要講清楚。
// 第一句先答「有沒有損失」；用一顆按鈕的提示框不用 toast，因為會丟字的訊息要讓人讀完（06-首次體驗 ❓7）
store.onSaveError(() => ui.alert('字還在，但沒存進手機', '空間可能不夠。先別關 app，清出空間後再改一下就會重存'));
// iCloud S5（多米 2026-11-01 選）：iCloud 看起來換了一個 → 問一次；iCloud 雲碟沒開 → 提示一次。第一句先答「有沒有損失」
store.onNewCloud((adopt, decline) => ui.ask(
  '這個 iCloud 裡沒有你的紙',
  '紙都還在這台手機上。可能換了 Apple ID，或「檔案」裡的茄記資料夾被刪掉了。要把這台的紙放進現在這個 iCloud 嗎？選「先不要」的話，這次只存在手機上，下次打開會再問',
  { label: '放進去', fn: adopt }, '先不要', decline));
store.onCloudOff(() => ui.toast('iCloud 雲碟沒開，紙只存在這台手機'));
// 打開 app 時存檔讀不出來（2026-11-04 程式審查）：原本那份已經另存（store 的 RESCUE_KEY），先講沒有損失，再講紙會從哪裡回來
store.onUnreadable(() => ui.alert('手機裡原本的紙讀不出來', '原本那份已經另存起來，沒有被蓋掉。開著 iCloud 的話，紙會從 iCloud 回來'));

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
  useEffect(() => {
    // 茄記完整版買了沒（1.1 片 A1）：跟讀紙各走各的，問不到也不擋紙出來
    startIap();
    // 評分提示要數「在幾個不同的日子打開過」（1.1 片 C2）
    reviewOpened();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') reviewOpened(); });
    // 外觀（跟隨系統／淺色／深色）要在紙畫出來之前套好，所以跟讀紙一起等
    Promise.all([store.load(), loadLook(), loadTextSize()]).then(() => {
      setReady(true);
      // 紙讀完才把「買了沒」接到 iCloud 同步和小工具（1.1 組塊 B）；在這之前同步是停著的。
      // 1.0 開過同步的人，更新後第一次打開跳一次（B5；字照線框）
      startAccess(() => ui.ask(
        'iCloud 同步改成完整版功能',
        '手機上的紙都還在，iCloud 雲碟裡的也都還在。買了完整版之後會接著同步。',
        { label: '看看完整版', fn: () => router.push('/full') }, '知道了'),
      // 新功能卡片（共用規格）：更新後第一次打開跳一次，最多三點、一顆「好」。上面那個提示框這次有跳就不跳，一次只跳一個
      noticed => {
        takeNews(store.firstRun).then(n => {
          if (n && !noticed) ui.alert(`茄記 ${n.version} 的新功能`, n.points.map(p => `・${p}`).join('\n'), '好');
        });
      });
    }, e => {
      // 讀手機裡的資料失敗（很少見）：以前啟動畫面永遠收不掉、什麼都不講（2026-11-04 程式審查）。收起來說一聲；
      // 紙先不畫：沒讀完就不准存檔（store），讓人在這時候記東西會存不進去
      console.warn('讀存檔失敗：', e);
      SplashScreen.hide();
      ui.alert('讀不到手機裡的紙', '紙沒有被動到。把茄記從多工畫面滑掉，再打開一次');
    });
    return () => sub.remove();
  }, []);

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
              {/* 目錄不是路由了：B3 起是紙畫面裡自己做的面板（components/DirPanel），從上面垂下來 */}
              {/* 不開系統大標題：紙那頁沒有標題列，推進大標題的頁面時標題列邊進場邊長高，標題往下掉約 25 點（2026-11-04 多米真機「抖」，模擬器錄影看到）。標題畫在頁面裡（trash.tsx） */}
              <Stack.Screen name="trash" />
              {/* 設定（1.1 片 A1）：跟最近刪除同一種推入頁 */}
              <Stack.Screen name="settings" />
              <Stack.Screen name="news" />
              <Stack.Screen name="licenses" />
              <Stack.Screen name="license" />
              {/* 付費頁（1.1 片 A2）：系統的表單，從下面升起、後面變暗、往下拉可以關 */}
              <Stack.Screen name="full" options={{
                presentation: 'formSheet', headerShown: false, sheetGrabberVisible: true,
                sheetAllowedDetents: [1], // 一次展開到底（2026-11-14 多米真機：先半高、要再往上滑一次才看得到購買鍵，很麻煩；推翻 11-11 的半高）
                sheetCornerRadius: T.shape.radiusLg, contentStyle: { backgroundColor: c.surface },
              }} />
            </Stack>
          </View>
        ) : <View style={{ flex: 1, backgroundColor: c.page }} />}
        <OverlayHost />
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

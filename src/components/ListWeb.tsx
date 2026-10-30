// 清單那一塊的網頁畫面。iPhone 上是 WebView；網頁預覽（開發用）沒有 WebView，改用 iframe。
// send() 把訊息丟給網頁；網頁丟回來的訊息交給 onMessage。
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type ComponentType, type Ref } from 'react';
import { Platform, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { listPage, type PageInit } from '../lib/listPage';

export type ListMsg =
  | { t: 'texts'; v: [string, string][] }
  | { t: 'items'; items: PageInit['items'] }
  | { t: 'removed'; idx: number; item: PageInit['items'][number] }
  | { t: 'seen' }
  | { t: 'haptic' };
export type ListWebHandle = { send: (m: object) => void };

// 套件的型別預設把 props 和 undefined 交集，新版 TypeScript 會算成 never；這裡給它正確的型別
type WebViewRef = { injectJavaScript: (js: string) => void };
const WV = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewRef> }>;

// 第一個 WebView 要先把網頁引擎叫起來，很慢；放一個看不見的空白 WebView 在首頁先暖好，
// 按＋開新清單時就不用在推頁動畫中途等它（同一個 app 裡的 WebView 共用引擎）
export function WebWarmUp() {
  if (Platform.OS === 'web') return null;
  return <WV source={{ html: '<html></html>' }} style={{ width: 1, height: 1 }} containerStyle={warm} pointerEvents="none" />;
}
const warm = { position: 'absolute', width: 1, height: 1, opacity: 0 } as const;

export const ListWeb = forwardRef<ListWebHandle, { init: PageInit; onMessage: (m: ListMsg) => void }>(
  function ListWeb({ init, onMessage }, ref) {
    // 頁面只在打開時產生一次；之後的變動都用訊息送，不重新載入
    const html = useMemo(() => listPage(init), []); // eslint-disable-line react-hooks/exhaustive-deps
    const wv = useRef<WebViewRef>(null);
    const frame = useRef<HTMLIFrameElement | null>(null);
    const handler = useRef(onMessage);
    handler.current = onMessage;
    const parse = (s: string) => { try { handler.current(JSON.parse(s)); } catch { /* 不是我們的訊息 */ } };

    useImperativeHandle(ref, () => ({
      send(m) {
        if (Platform.OS === 'web') (frame.current?.contentWindow as any)?.__recv?.(m);
        else wv.current?.injectJavaScript(`window.__recv(${JSON.stringify(m)});true;`);
      },
    }), []);

    useEffect(() => {
      if (Platform.OS !== 'web') return;
      const on = (e: MessageEvent) => { if (e.source === frame.current?.contentWindow && e.data?.qieji) parse(e.data.qieji); };
      window.addEventListener('message', on);
      return () => window.removeEventListener('message', on);
    }, []);

    if (Platform.OS === 'web') {
      return (
        <View style={{ flex: 1 }}>
          <iframe ref={frame} srcDoc={html} title="清單" style={{ flex: 1, border: 0, width: '100%', height: '100%', background: init.bg }} />
        </View>
      );
    }
    return (
      <WV ref={wv} source={{ html }} originWhitelist={['*']} onMessage={(e: WebViewMessageEvent) => parse(e.nativeEvent.data)}
        style={{ flex: 1, backgroundColor: init.bg }} containerStyle={{ backgroundColor: init.bg }}
        // 程式對焦（例如標題按「下一步」跳到第一行）也要能叫出鍵盤
        keyboardDisplayRequiresUserAction={false}
        // 鍵盤上面保留 Safari 那條「︿ ﹀ ✓」，按 ✓ 就能收鍵盤
        hideKeyboardAccessoryView={false}
        automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never"
        allowsBackForwardNavigationGestures={false} allowsLinkPreview={false} setSupportMultipleWindows={false}
        textInteractionEnabled scrollEnabled bounces />
    );
  },
);

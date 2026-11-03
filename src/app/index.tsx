// 根畫面就是一張紙（重新設計分支「紙是家」）：打開 app 直接停在上次那張；沒有上次就是最近改過的那張；一張都沒有就開一張新的。
// 換一張、開新的一張、找舊東西：標題區往下拉或點標題下的把手，目錄面板（DirPanel）從上面垂下來，跟紙在同一個畫面（B3）。
import { useEffect } from 'react';
import { View } from 'react-native';
import { LayoutAnimationConfig } from 'react-native-reanimated';
import { DirPanelHost } from '../components/DirPanel';
import { PageBarHost } from '../components/PageBar';
import { SwitchPanelHost } from '../components/SwitchPanel';
import { Paper } from '../components/Paper';
import { startJsWatch, useFrameWatch } from '../lib/perf';
import { newNote, store, useStore } from '../lib/store';
import { useColors } from '../lib/tokens';

startJsWatch(); // 開發版才有：JS 卡住多久印在終端機（lib/perf）

export default function Home() {
  const s = useStore();
  const onTouch = useFrameWatch(); // 開發版才有：手指一碰就量畫面掉格
  const c = useColors();
  const n = s.notes.find(x => x.id === store.last && !x.deleted)
    ?? s.notes.filter(x => !x.deleted).sort((a, b) => b.updated - a.updated)[0];
  useEffect(() => { if (!n) newNote(); }, [n]);
  if (!n) return <View style={{ flex: 1, backgroundColor: c.page }} />;
  // key 換了就是換紙：舊的那張卸載時自己收尾（空行拿掉、整張空的就不留）。
  // 換紙時新的那張淡入（2026-11-01 第二輪 S2，Paper 自己帶進場動畫）；第一次打開 app 的那張跟這個包一起掛上，不播進場，交給啟動畫面。
  // 左右撥換張時旁邊那張擺在螢幕外（Paper 的 PagePreview），這層把螢幕外的裁掉
  return (
    <View style={{ flex: 1, overflow: 'hidden' }} onTouchStart={onTouch}>
      <LayoutAnimationConfig skipEntering><Paper key={n.id} n={n} /></LayoutAnimationConfig>
      {/* 底部列（換張、開目錄、右下 ＋）在紙外面：換張時不跟著紙重掛，＋ 一直停在原地（2026-11-03）；目錄面板蓋在它上面 */}
      <PageBarHost />
      <DirPanelHost />
      {/* 切換清單（2026-11-04 改版）：點紙左上清單名從下面升起，蓋在最上面 */}
      <SwitchPanelHost />
    </View>
  );
}

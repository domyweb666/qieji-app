// 根畫面就是一張紙（重新設計分支「紙是家」）：打開 app 直接停在上次那張；沒有上次就是最近改過的那張；一張都沒有就開一張新的。
// 換一張、開新的一張、找舊東西：點紙最上面的清單名，目錄（/directory）從下面升起來。
import { useEffect } from 'react';
import { View } from 'react-native';
import { LayoutAnimationConfig } from 'react-native-reanimated';
import { Paper } from '../components/Paper';
import { newNote, store, useStore } from '../lib/store';
import { useColors } from '../lib/tokens';

export default function Home() {
  const s = useStore();
  const c = useColors();
  const n = s.notes.find(x => x.id === store.last && !x.deleted)
    ?? s.notes.filter(x => !x.deleted).sort((a, b) => b.updated - a.updated)[0];
  useEffect(() => { if (!n) newNote(); }, [n]);
  if (!n) return <View style={{ flex: 1, backgroundColor: c.page }} />;
  // key 換了就是換紙：舊的那張卸載時自己收尾（空行拿掉、整張空的就不留）。
  // 換紙時新的那張淡入（2026-11-01 第二輪 S2，Paper 自己帶進場動畫）；第一次打開 app 的那張跟這個包一起掛上，不播進場，交給啟動畫面
  return <LayoutAnimationConfig skipEntering><Paper key={n.id} n={n} /></LayoutAnimationConfig>;
}

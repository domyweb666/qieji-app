// 系統用網址打開 app 時先經過這裡（expo-router 的 +native-intent）。
// 控制中心「記一行」按鈕打開 qieji://new（2026-11-01 C1）：不是一個畫面，是「回到首頁那張紙、升起輸入框」。
// 開著目錄或最近刪除時，回到 '/' 會把它們收掉；其他網址照常交給路由
import { store } from '../lib/store';

const NEW_LINE = /^(qieji:\/\/)?\/?new\/?(\?.*)?$/;

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (NEW_LINE.test(path)) {
    store.requestCompose();
    return '/';
  }
  return path;
}

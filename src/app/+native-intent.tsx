// 系統用網址打開 app 時先經過這裡（expo-router 的 +native-intent）。
// 控制中心「記一行」按鈕打開 qieji://new（2026-11-01 C1）：不是一個畫面，是「回到首頁那張紙、升起輸入框」。
// 開著目錄或最近刪除時，回到 '/' 會把它們收掉；其他網址照常交給路由
// 1.1 片 B4：控制中心「記一行」是完整版功能。沒買的人按了，打開付費頁、不開輸入框（多米 2026-11-08 定）。
// 鎖住的小工具點了開 qieji://full，也是付費頁。網址只能打開畫面，解鎖不了任何東西（.vibe/安全標準.md 平台互動、授權段）
import { whenKnown } from '../lib/iap';
import { store } from '../lib/store';

const NEW_LINE = /^(qieji:\/\/)?\/?new\/?(\?.*)?$/;
const FULL = /^(qieji:\/\/)?\/?full\/?(\?.*)?$/;

export async function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (FULL.test(path)) return '/full';
    if (NEW_LINE.test(path)) {
      // 冷啟動時要等手機上次記的「買了沒」讀出來（很快，只讀手機裡一個記號，不等網路）
      if (!(await whenKnown())) return '/full';
      store.requestCompose();
      return '/';
    }
  } catch (e) {
    // 這裡丟錯會讓 app 閃退（expo-router 文件）：出錯就照原本的路走
    console.warn('處理打開 app 的網址失敗：', e);
  }
  return path;
}

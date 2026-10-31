// 匯入備份 JSON，格式跟網頁版完全一樣（網頁版的資料搬進來用）。
// 匯出 2026-11-01 多米定拿掉（一般人用不到）；要接回來看 git log「匯出備份拿掉」，model.ts 的 exportJSON 還在
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ui } from '../components/Overlay';
import { importBackup } from './model';
import { store } from './store';

export async function importData() {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', '*/*'], copyToCacheDirectory: true });
  if (res.canceled) return;
  try {
    const text = await new File(res.assets[0].uri).text();
    const { added, updated } = importBackup(store.s, text);
    store.change();
    ui.toast(`匯入完成：新增 ${added}、更新 ${updated}`);
  } catch {
    ui.toast('這不是茄記的備份檔，現有清單沒動');
  }
}

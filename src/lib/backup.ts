// 匯出／匯入備份 JSON，格式跟網頁版完全一樣，兩邊可以互相搬
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ui } from '../components/Overlay';
import { backupName, exportJSON, importBackup } from './model';
import { store } from './store';

export async function exportData() {
  try {
    const file = new File(Paths.cache, backupName());
    if (file.exists) file.delete();
    file.create();
    file.write(exportJSON(store.s));
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: '匯出備份' });
  } catch {
    ui.toast('沒匯出成，再試一次');
  }
}

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

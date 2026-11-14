// 封面圖（1.1 完整版功能，2026-11-14）：紙頂部放一張圖，目錄的磚、小方磚也用它。
// 圖檔放在手機的「文件／covers／<代號>.jpg」，紙上只記代號（Note.cover）。選的照片先縮到寬 COVER_W 再存（幾百 KB）。
// 選照片用系統的選取畫面（PHPicker），不用跟使用者要相簿權限。
// iCloud（多米定：同步、先縮圖）：圖轉成 base64 文字存成「cover-<代號>.b64」，跟紙放同一個資料夾（lib/cloud.ts 的 syncCovers）。
// 只有 iOS 的開發版／正式版有原生模組；載不到就當沒有封面功能，其他照常。
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { uid, type Note } from './model';

const COVER_W = 1200;    // 存檔的寬（點擊放大看也夠；一張約 200～500 KB）
const COVER_Q = 0.8;

type FS = typeof import('expo-file-system');
let fs: FS | null | undefined;
function loadFs(): FS | null {
  if (fs !== undefined) return fs;
  if (Platform.OS !== 'ios') return (fs = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 只有 iOS 才載
    fs = require('expo-file-system') as FS;
  } catch (e) {
    console.warn('檔案模組載入失敗：', e);
    fs = null;
  }
  return fs;
}

const safe = (id: string) => /^[a-z0-9]{4,40}$/.test(id);
function fileOf(id: string) {
  const m = loadFs();
  if (!m || !safe(id)) return null;
  return new m.File(m.Paths.document, 'covers', `${id}.jpg`);
}

// 手機上有哪些封面檔（查一次檔案系統就記著；畫面每畫一次都問原生太貴）
const have = new Map<string, boolean>();
const subs = new Set<() => void>();
let version = 0;
const emit = () => { version++; subs.forEach(f => f()); };

export function hasCover(id: string | undefined): boolean {
  if (!id) return false;
  const known = have.get(id);
  if (known !== undefined) return known;
  let ok = false;
  try { ok = !!fileOf(id)?.exists; } catch { ok = false; }
  have.set(id, ok);
  return ok;
}
// 畫得出來的封面圖位址；沒有封面、檔案不在這支手機上（還沒從 iCloud 下來）回 null，畫面就照沒有封面畫
export function coverUri(n: Note): string | null {
  return n.cover && hasCover(n.cover) ? fileOf(n.cover)?.uri ?? null : null;
}

function ensureDir() {
  const m = loadFs();
  if (!m) throw new Error('沒有檔案模組');
  const dir = new m.Directory(m.Paths.document, 'covers');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

export type PickResult = 'ok' | 'cancel' | 'fail';
// 選一張照片當這張紙的封面。回傳後由呼叫的人存檔、重畫
export async function pickCover(n: Note): Promise<PickResult> {
  if (Platform.OS !== 'ios') return 'fail';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 只有 iOS 才載；舊開發版沒有這兩個原生模組
    const picker = require('expo-image-picker') as typeof import('expo-image-picker');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const manip = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
    const r = await picker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1 });
    if (r.canceled || !r.assets?.[0]) return 'cancel';
    const a = r.assets[0];
    const actions = a.width > COVER_W ? [{ resize: { width: COVER_W } }] : [];
    const out = await manip.manipulateAsync(a.uri, actions, { compress: COVER_Q, format: manip.SaveFormat.JPEG, base64: true });
    if (!out.base64) return 'fail';
    const id = uid().replace(/[^a-z0-9]/g, '');
    await writeCover(id, out.base64);
    const old = n.cover;
    n.cover = id;
    if (old) removeFile(old);
    return 'ok';
  } catch (e) {
    console.warn('封面圖沒放成：', e);
    return 'fail';
  }
}

export function clearCover(n: Note) {
  const old = n.cover;
  delete n.cover;
  if (old) removeFile(old);
}
function removeFile(id: string) {
  try { const f = fileOf(id); if (f?.exists) f.delete(); } catch (e) { console.warn('舊封面檔沒刪掉：', e); }
  have.set(id, false);
  emit();
}

// base64 寫成手機上的圖檔（自己選的、或從 iCloud 下來的）
export async function writeCover(id: string, base64: string) {
  if (!safe(id) || !base64) throw new Error('封面代號或內容不對');
  ensureDir();
  const f = fileOf(id);
  if (!f) throw new Error('沒有檔案模組');
  if (!f.exists) f.create();
  await f.write(base64, { encoding: 'base64' });
  have.set(id, true);
  emit();
}
// 讀出 base64（上傳 iCloud 用）；沒有檔回 null
export async function readCover(id: string): Promise<string | null> {
  try { const f = fileOf(id); return f?.exists ? await f.base64() : null; } catch { return null; }
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const get = () => version;
// 畫面用：封面檔到了、換了、拿掉了就重畫
export function useCoverVersion() { return useSyncExternalStore(subscribe, get, get); }

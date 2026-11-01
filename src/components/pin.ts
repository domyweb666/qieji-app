// 釘選／取消釘選（B1）：紙的 ⋯ 和目錄長按選單共用一套（多米 2026-11-02 晚：在目錄長按選單找不到釘選）。
// 沒滿直接釘；釘滿兩張一步跳選單問換掉哪張（審查紀錄 11/01 晚（四）甲），換完 toast 可復原；換掉的那張不動 updated，目錄裡位置不跳
import { PIN_MAX, pickLabel, pinnedNotes, type Note } from '../lib/model';
import { store } from '../lib/store';
import { ui } from './Overlay';

const touch = (n: Note) => { n.updated = Date.now(); store.change(); };

export function togglePin(n: Note) {
  if (n.pinned) { n.pinned = false; touch(n); ui.toast('已取消釘選'); return; }
  const pinned = pinnedNotes(store.s);
  if (pinned.length < PIN_MAX) { n.pinned = true; touch(n); ui.toast('已釘選'); return; }
  ui.sheet(pinned.map(o => ({ label: pickLabel(o), fn: () => swapPin(n, o) })), '已釘滿兩張', '要換掉哪一張？');
}

function swapPin(n: Note, o: Note) {
  o.pinned = false; n.pinned = true; touch(n);
  ui.toast(`已釘選，「${pickLabel(o)}」已取消釘選`, { label: '復原', fn: () => { o.pinned = true; n.pinned = false; touch(n); } });
}

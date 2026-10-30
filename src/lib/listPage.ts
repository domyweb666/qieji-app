// 清單頁中間那一塊（新增一行＋每一行）用網頁畫：程式和樣式直接搬網頁版 easynote/index.html 的清單，
// 打字、自動換行、滑動、拖曳、鍵盤都跟網頁版一樣。外觀跟首頁同一套：一行一張圓角卡片，頁面底色跟著筆記顏色換。
// 標題列、⋯ 選單、存檔留在 app 這邊，兩邊用訊息溝通：
//   網頁 → app：texts（打字停手 0.3 秒後，只送改過字的那幾行）、items（加行、刪行、劃掉、排序這類改了結構的，立刻送整份）、
//              removed（刪掉了哪一行，給 toast 復原用）、seen（看過滑動提示了）、haptic
//   app → 網頁：set（整份清單換掉重畫）、theme（換顏色）、focusFirst（標題按下一步）、blur（收鍵盤）、flush（馬上送出還沒送的字）
// 鍵盤上方只留 iOS 自己那條「︿ ﹀ ✓」（按 ✓ 收鍵盤），不再另外疊一條自己的工具列。
import type { Item } from './model';

export type PageInit = { items: Item[]; bg: string; hd: string; rule: string; hint: boolean };

// 注意：下面的 CSS 和 JS 放在一個 template literal 裡，裡面不能用反引號，也不能出現錢字號接左大括號
const CSS = `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--bg);color:#2E2233;font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC",sans-serif;
  font-size:17px;-webkit-text-size-adjust:100%;-webkit-user-select:none;user-select:none}
body{padding:0 16px 200px;overscroll-behavior-y:contain}
button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
textarea{font:inherit;color:inherit;outline:0;-webkit-user-select:text;user-select:text}
svg{display:block}
.hidden{display:none!important}
.addrow{display:flex;align-items:center;gap:6px;width:100%;padding:0 0 0 12px;height:54px;font-size:17px;color:rgba(46,34,51,.5);
  text-align:left}
.addrow span:first-child{font-size:20px}
/* 一行一張卡片，跟首頁列表的筆記卡片同一個樣子；卡片外面的底色是筆記顏色 */
.ci{position:relative;margin-bottom:8px;background:#FFFCF6;border:1px solid var(--rule);border-radius:16px;overflow:hidden;touch-action:pan-y}
.ci .under{position:absolute;inset:0;display:flex;align-items:center;justify-content:space-between;padding:0 18px;
  font-size:15px;font-weight:600;color:#FFFCF6}
.ci.sw-r .under{background:#9C8C7A}
.ci.sw-l .under{background:#d0443a}
.ci.sw-r .under .r,.ci.sw-l .under .l{visibility:hidden}
.ci .cin{position:relative;display:flex;align-items:flex-start;gap:2px;padding:0 0 0 12px;background:#FFFCF6;will-change:transform}
.ci textarea{flex:1;min-width:0;border:0;background:transparent;resize:none;font-size:17px;line-height:1.6;
  padding:12px 4px;height:54px;overflow:hidden;display:block}
.ci.done textarea{text-decoration:line-through;text-decoration-thickness:2px;color:rgba(46,34,51,.38)}
.ci .x{flex:none;width:40px;height:52px;display:none;place-items:center;color:rgba(46,34,51,.4);font-size:19px}
.ci.focus .x{display:grid}
.ci .grip{flex:none;width:36px;height:52px;display:grid;place-items:center;color:rgba(46,34,51,.22);touch-action:none;font-size:18px;letter-spacing:-2px}
.ci.focus .grip{display:none}
.ci.dragging{z-index:5;box-shadow:0 6px 18px rgba(46,34,51,.2)}
.hint{font-size:13px;color:rgba(46,34,51,.4);text-align:center;padding:14px}
`;

const JS = `
var $ = function(s){ return document.querySelector(s); };
var items = INIT.items, hintOn = INIT.hint;
var dirty = {}, flushT = null;
var uid = function(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); };
var esc = function(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
var findItem = function(id){ for (var i=0;i<items.length;i++) if (items[i].id===id) return i; return -1; };

function send(m){
  var s = JSON.stringify(m);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
  else if (window.parent !== window) window.parent.postMessage({qieji:s}, '*');
}
function theme(c){
  // 頁面底色和卡片邊框跟著筆記顏色；卡片本身（包括正在打的那一行）一律是奶油白
  var st = document.documentElement.style;
  st.setProperty('--bg', c.bg); st.setProperty('--rule', c.rule);
}

/* ---------- list ---------- */
function itemHTML(it){
  return '<div class="ci' + (it.done?' done':'') + '" data-id="' + esc(it.id) + '">' +
    '<div class="under"><span class="l">' + (it.done?'恢復':'劃掉') + '</span><span class="r">刪除</span></div>' +
    '<div class="cin"><textarea rows="1">' + esc(it.t) + '</textarea>' +
    '<button class="x" aria-label="刪除這行">✕</button>' +
    '<span class="grip" aria-label="拖曳排序">⋮⋮</span></div></div>';
}
function render(){
  // 重畫前記住游標在哪一行哪個位置，畫完放回去
  var a = document.activeElement, keep = null;
  if (a && a.tagName === 'TEXTAREA'){ var r = a.closest('.ci'); keep = {id:r.dataset.id, p:a.selectionStart}; }
  // 重畫時每一行會先縮回一行高再量，整頁暫時變短，iOS 就把畫面往上推（它沒有自動補位）。
  // 先撐住清單原本的高度，量完再放開，捲動位置放回原處
  var cl = $('#cl'), y = window.scrollY;
  cl.style.minHeight = cl.offsetHeight + 'px';
  cl.innerHTML = items.map(itemHTML).join('');
  document.querySelectorAll('.ci textarea').forEach(sizeTA);
  cl.style.minHeight = '';
  window.scrollTo(0, y);
  $('#hint').classList.toggle('hidden', !(hintOn && items.some(function(i){ return i.t.trim(); })));
  if (keep && findItem(keep.id) >= 0) focusItem(keep.id, keep.p, true);
}
function sizeTA(t){ t.style.height = '0px'; t.style.height = Math.max(54, t.scrollHeight) + 'px'; }
function focusItem(id, caret, quiet){
  var t = $('.ci[data-id="' + CSS.escape(id) + '"] textarea'); if (!t) return;
  t.focus();
  var p = caret == null ? t.value.length : caret;
  try { t.setSelectionRange(p,p); } catch(e){}
  if (!quiet) t.closest('.ci').scrollIntoView({block:'nearest'});
}
// 新增一行：唯一會多出一行的地方。先捲回最上面，新的那行就在「新增一行」正下方
function focusNew(){
  var first = items[0];
  if (first && !first.t.trim()){ focusItem(first.id, 0); return; }
  var n = {id:uid(), t:'', done:false, b:false};
  items.unshift(n); changed(); render();
  window.scrollTo(0, 0); focusItem(n.id, 0, true);
}
function seen(){ if (hintOn){ hintOn = false; send({t:'seen'}); } }
function removeItem(id, refocus){
  var idx = findItem(id); if (idx < 0) return;
  var removed = items.splice(idx, 1)[0];
  seen(); changed(true); render();
  send({t:'removed', idx:idx, item:removed});
  if (refocus){ var next = items[Math.min(idx, items.length-1)]; if (next) focusItem(next.id); else document.activeElement.blur(); }
}
function cleanupEmpty(){
  var keep = items.filter(function(i){ return i.t.trim(); });
  if (keep.length !== items.length){ items = keep; render(); sendItems(); }
}

$('#add').innerHTML = '<span>＋</span><span>新增一行</span>';
document.addEventListener('click', function(e){
  if (e.target.closest('#add')) return focusNew();
  var row = e.target.closest('.ci');
  if (row && e.target.closest('.x')) removeItem(row.dataset.id, true);
});
// 打字：只記下哪一行改了，停手 0.3 秒才送給 app 存檔
document.addEventListener('input', function(e){
  var row = e.target.closest('.ci'); if (!row) return;
  var it = items[findItem(row.dataset.id)]; if (!it) return;
  it.t = e.target.value;
  sizeTA(e.target);
  dirty[it.id] = 1;
  clearTimeout(flushT); flushT = setTimeout(flush, 300);
});
// 換行就是在同一格換行（不攔）。空的一行按刪除 → 這行拿掉，回到上一行最後面
document.addEventListener('keydown', function(e){
  var row = e.target.closest && e.target.closest('.ci'); if (!row || e.target.tagName !== 'TEXTAREA') return;
  if (e.isComposing || e.keyCode === 229) return;
  var idx = findItem(row.dataset.id), ta = e.target;
  if (e.key === 'Backspace' && !ta.value && idx > 0){
    e.preventDefault();
    var prev = items[idx-1];
    items.splice(idx, 1);
    changed(true); render(); focusItem(prev.id);
  }
});

/* ---------- focus：正在打的那一行換成 ✕（刪除這行），收鍵盤時清掉空白行 ---------- */
document.addEventListener('focusin', function(e){
  document.querySelectorAll('.ci.focus').forEach(function(r){ r.classList.remove('focus'); });
  var r = e.target.closest && e.target.closest('.ci'); if (r) r.classList.add('focus');
});
document.addEventListener('focusout', function(){
  flush();
  setTimeout(function(){
    var a = document.activeElement;
    if (!a || a.tagName !== 'TEXTAREA'){
      document.querySelectorAll('.ci.focus').forEach(function(r){ r.classList.remove('focus'); });
      cleanupEmpty();
    }
  }, 120);
});
document.addEventListener('visibilitychange', function(){ if (document.hidden) flush(); });
window.addEventListener('pagehide', flush);

/* ---------- swipe: right = strike, left = delete ---------- */
var sw = null;
document.addEventListener('pointerdown', function(e){
  if (e.target.closest('.grip') || e.target.closest('.x')) return;
  var row = e.target.closest('.ci'); if (!row) return;
  sw = {row:row, x:e.clientX, y:e.clientY, dx:0, on:false, id:e.pointerId};
});
document.addEventListener('pointermove', function(e){
  if (!sw || drag) return;
  var dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (!sw.on){
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)){ sw = null; return; }
    if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy)*1.4) return;
    sw.on = true;
    try { sw.row.setPointerCapture(sw.id); } catch(_){}
    if (document.activeElement) document.activeElement.blur();
  }
  e.preventDefault();
  sw.dx = dx;
  sw.row.classList.toggle('sw-r', dx > 0); sw.row.classList.toggle('sw-l', dx < 0);
  sw.row.querySelector('.cin').style.transform = 'translateX(' + dx + 'px)';
}, {passive:false});
function endSwipe(){
  if (!sw) return;
  var s = sw; sw = null;
  if (!s.on) return;
  var cin = s.row.querySelector('.cin'), w = s.row.offsetWidth, id = s.row.dataset.id;
  if (s.dx > Math.min(90, w*.25)){
    cin.style.transition = 'transform .15s'; cin.style.transform = '';
    setTimeout(function(){ strike(id); }, 150);
  } else if (s.dx < -Math.min(110, w*.3)){
    cin.style.transition = 'transform .18s'; cin.style.transform = 'translateX(' + (-w) + 'px)';
    setTimeout(function(){ removeItem(id); }, 180);
  } else {
    cin.style.transition = 'transform .18s'; cin.style.transform = '';
    setTimeout(function(){ cin.style.transition = ''; s.row.classList.remove('sw-l','sw-r'); }, 200);
  }
  // 滑完之後跟著來的 click 吃掉，不要讓它去對焦打字
  var stop = function(ev){ ev.stopPropagation(); ev.preventDefault(); };
  s.row.addEventListener('click', stop, {capture:true, once:true});
  setTimeout(function(){ s.row.removeEventListener('click', stop, {capture:true}); }, 400);
}
document.addEventListener('pointerup', function(){ endSwipe(); endDrag(); });
document.addEventListener('pointercancel', function(){ if (sw && sw.on) sw.dx = 0; endSwipe(); endDrag(); });
function strike(id){
  var it = items[findItem(id)];
  if (!it || !it.t.trim()){ render(); return; }
  it.done = !it.done;
  seen(); changed(true); render();
  send({t:'haptic'});
}

/* ---------- drag to reorder ---------- */
var drag = null;
document.addEventListener('pointerdown', function(e){
  var g = e.target.closest('.grip'); if (!g) return;
  e.preventDefault();
  var row = g.closest('.ci');
  var rows = Array.prototype.slice.call(document.querySelectorAll('.ci'));
  drag = {row:row, rows:rows, startY:e.clientY, idx:rows.indexOf(row), to:rows.indexOf(row), h:row.offsetHeight,
    mids:rows.map(function(r){ var b = r.getBoundingClientRect(); return b.top + b.height/2; })};
  row.classList.add('dragging'); g.setPointerCapture(e.pointerId);
  send({t:'haptic'});
});
document.addEventListener('pointermove', function(e){
  if (!drag) return;
  var dy = e.clientY - drag.startY, y = drag.mids[drag.idx] + dy;
  drag.to = drag.mids.filter(function(m,k){ return k !== drag.idx && m < y; }).length;
  drag.row.style.transform = 'translateY(' + dy + 'px)';
  drag.rows.forEach(function(r,k){
    if (r === drag.row) return;
    var s = 0;
    if (drag.idx < drag.to && k > drag.idx && k <= drag.to) s = -drag.h;
    if (drag.idx > drag.to && k < drag.idx && k >= drag.to) s = drag.h;
    r.style.transition = 'transform .15s'; r.style.transform = s ? 'translateY(' + s + 'px)' : '';
  });
});
function endDrag(){
  if (!drag) return;
  var idx = drag.idx, to = drag.to; drag = null;
  if (idx !== to){ var m = items.splice(idx,1)[0]; items.splice(to,0,m); changed(true); }
  render();
}

/* ---------- 送給 app ---------- */
// 打字停手後：只送改過字的那幾行
function flush(){
  clearTimeout(flushT);
  var v = [];
  for (var id in dirty){ var i = findItem(id); if (i >= 0) v.push([id, items[i].t]); }
  dirty = {};
  if (v.length) send({t:'texts', v:v});
}
// 改了結構：整份清單立刻送（裡面已經有最新的字，打字那邊的待送就不用了）
function sendItems(){ clearTimeout(flushT); dirty = {}; send({t:'items', items:items}); }
function changed(){ sendItems(); }

/* ---------- 從 app 來的訊息 ---------- */
window.__recv = function(m){
  if (m.t === 'set'){ items = m.items; if (m.hint != null) hintOn = m.hint; render(); }
  else if (m.t === 'theme') theme(m);
  else if (m.t === 'focusFirst'){ if (items[0]) focusItem(items[0].id); }
  else if (m.t === 'blur'){ flush(); if (document.activeElement) document.activeElement.blur(); }
  else if (m.t === 'flush') flush();
};

theme(INIT);
render();
`;

export function listPage(init: PageInit) {
  // 資料塞進 script 裡：把 < 換掉，內容裡的 </script> 才不會提早結束這段程式
  const data = JSON.stringify(init).replace(/</g, '\\u003c');
  return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">' +
    '<style>' + CSS + '</style></head><body>' +
    '<button class="addrow" id="add"></button><div id="cl"></div><div class="hint hidden" id="hint">往右滑劃掉　·　往左滑刪除</div>' +
    '<script>var INIT = ' + data + ';' + JS + '</script></body></html>';
}

// 產生開源授權清單（共用規格：建置時自動產生，不要手動維護）。用法：node tools/gen-licenses.mjs（npm run licenses；EAS 打包時裝完套件會自動跑）
// 直接用到的套件（package.json 的 dependencies）附授權全文；它們底下帶進來的套件數量很多，只列名字和授權種類，全文放進去 app 會多好幾 MB。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
const direct = Object.keys(pkg.dependencies ?? {}).sort();

const licenseOf = p => (typeof p.license === 'string' ? p.license : p.license?.type) ?? (Array.isArray(p.licenses) ? p.licenses.map(l => l.type).join(' / ') : '') ?? '';
function textOf(dir) {
  if (!existsSync(dir)) return '';
  const f = readdirSync(dir).find(n => /^(licen[sc]e|copying)(\.(md|txt))?$/i.test(n));
  return f ? readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim() : '';
}

const main = direct.map(name => {
  const dir = join(ROOT, 'node_modules', name);
  const p = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  return { name, version: p.version, license: licenseOf(p) || '未標示', text: textOf(dir) };
});

const seen = new Set(direct);
const others = [];
for (const [path, p] of Object.entries(lock.packages ?? {})) {
  if (!path.startsWith('node_modules/') || p.dev || p.devOptional) continue;
  const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  if (seen.has(name)) continue;
  seen.add(name);
  others.push({ name, license: (typeof p.license === 'string' ? p.license : '') || '未標示' });
}
others.sort((a, b) => a.name.localeCompare(b.name));

// 設定頁「開源授權」照人看得懂的名字分組（2026-11-14 多米：一整排套件名像亂碼）。一組一列，點進去才是套件名和授權全文。
// 沒被任何一組收走的直接用到的套件，自己一組、用套件名當標題（新加套件忘了分組也不會漏掉）
const GROUPS = [
  { title: 'Expo', sub: '畫面、路由和 iPhone 的系統功能', test: n => (n === 'expo' || n.startsWith('expo-') || n.startsWith('@expo/')) && n !== 'expo-iap' },
  { title: 'React、React Native', sub: '整個 app 的骨架', test: n => ['react', 'react-dom', 'react-native', 'react-native-web'].includes(n) },
  { title: 'Reanimated', sub: '動畫', test: n => ['react-native-reanimated', 'react-native-worklets'].includes(n) },
  { title: 'Gesture Handler', sub: '滑動、拖曳、長按', test: n => n === 'react-native-gesture-handler' },
  { title: 'Keyboard Controller', sub: '輸入框跟著鍵盤升降', test: n => n === 'react-native-keyboard-controller' },
  { title: 'Screens、Safe Area Context', sub: '換頁和瀏海的留白', test: n => ['react-native-screens', 'react-native-safe-area-context'].includes(n) },
  { title: 'expo-iap', sub: '購買完整版', test: n => n === 'expo-iap' },
  { title: 'Cloud Storage', sub: 'iCloud 同步', test: n => n === 'react-native-cloud-storage' },
  { title: 'Apple Targets', sub: '小工具和控制中心', test: n => n === '@bacons/apple-targets' },
  { title: 'Async Storage', sub: '記住你的設定', test: n => n === '@react-native-async-storage/async-storage' },
  { title: 'React Native SVG', sub: '畫圖示', test: n => n === 'react-native-svg' },
];
const left = new Set(main.map(m => m.name));
const groups = GROUPS.map(g => ({ title: g.title, sub: g.sub, items: main.filter(m => g.test(m.name)) })).filter(g => g.items.length);
groups.forEach(g => g.items.forEach(m => left.delete(m.name)));
for (const name of left) groups.push({ title: name, sub: '', items: main.filter(m => m.name === name) });
// 同一組裡授權全文一樣的併成一份（Expo 那二十幾個是同一份）
const out = groups.map(g => {
  const texts = [];
  for (const m of g.items) {
    const t = texts.find(x => x.text === m.text && x.license === m.license);
    if (t) t.names.push(m.name); else texts.push({ names: [m.name], license: m.license, text: m.text });
  }
  // 套件裡沒附全文的（@expo/ui、expo-router）：同一組、同一種授權有全文的話，併到那一份底下
  for (const e of texts.filter(x => !x.text)) {
    const t = texts.find(x => x.text && x.license === e.license);
    if (t) { t.names.unshift(...e.names); texts.splice(texts.indexOf(e), 1); }
  }
  return { title: g.title, sub: g.sub, texts };
});

writeFileSync(join(ROOT, 'src/lib/licenses.json'), JSON.stringify({ groups: out, others }) + '\n');
console.log(`開源授權：直接用到 ${main.length} 個、分成 ${out.length} 組（${main.filter(m => !m.text).length} 個找不到授權全文），帶進來的 ${others.length} 個`);

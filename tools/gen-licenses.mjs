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

writeFileSync(join(ROOT, 'src/lib/licenses.json'), JSON.stringify({ main, others }) + '\n');
console.log(`開源授權：直接用到 ${main.length} 個（${main.filter(m => !m.text).length} 個找不到授權全文），帶進來的 ${others.length} 個`);

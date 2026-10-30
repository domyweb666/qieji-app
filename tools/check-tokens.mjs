// 提交前擋裸數字：畫面程式不准直接寫色碼、rgba、字級、行高、動畫毫秒、圓角、陰影、按住效果、間距數字，
// 一律從 src/lib/tokens.ts 拿。規格與例外見 .uiux/05-設計代號/使用規則.md 最後一節。
// 用法：node tools/check-tokens.mjs（npm run check:tokens；git pre-commit 會自動跑）。有命中就印檔名、行號、規則，exit 1。
// 例外：同一行或上一行有「只用一次」註解的放行（規則 5：一處用到不升格）。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIRS = ['src/app', 'src/components', 'src/lib'];
const SKIP = new Set(['src/lib/tokens.ts']); // 代號檔本身
const EXEMPT = '只用一次';
const RULES = [
  { name: '色碼', re: /['"`]#[0-9a-f]{3,8}\b/i },
  { name: 'rgba', re: /\brgba?\(/ },
  { name: '字級', re: /\bfontSize:\s*\d/ },
  { name: '行高', re: /\blineHeight:\s*\d/ },
  { name: '動畫時長', re: /\bduration\(\s*\d|\bduration:\s*[1-9]/ }, // duration: 0 是減少動態的替代版，放行
  { name: '圓角', re: /\bborderRadius:\s*\d/ },
  { name: '陰影', re: /\bshadow(Color|Opacity|Radius):\s*['"#\d]/ },
  { name: '按住效果', re: /\b(scale|opacity):\s*0\.\d/ },
  { name: '間距', re: /\b(padding|margin|gap)\w*:\s*[1-9]/ },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const hits = [];
for (const d of DIRS) {
  for (const file of walk(join(ROOT, d))) {
    const rel = relative(ROOT, file).split(sep).join('/');
    if (SKIP.has(rel)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, ''); // 註解裡的數字不算
      if (line.includes(EXEMPT) || (i > 0 && lines[i - 1].includes(EXEMPT))) return;
      for (const r of RULES) if (r.re.test(code)) hits.push(`${rel}:${i + 1}  ${r.name}  ${line.trim()}`);
    });
  }
}

if (hits.length) {
  console.error(`畫面程式裡有 ${hits.length} 處裸數字，請改用 src/lib/tokens.ts 的代號：\n` + hits.join('\n'));
  process.exit(1);
}
console.log('check-tokens：沒有裸數字');

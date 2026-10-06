// Renders docs/demo.svg: the terminal report for a small sample project with typical mistakes.
// Run: node scripts/demo-svg.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scan } from '../src/index.mjs';
import { toTerminal } from '../src/report.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bip-demo-'));
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
// assembled at runtime so the repository never holds a whole fake key
write('src/lib/stripe.ts', `export const stripe = new Stripe("${'sk_live_' + '51Hq8ZkLm3Nv9Rt2Wx7Yb4Cd'}");\n`);
write('src/pages/checkout.tsx', 'export default function Checkout() {\n  debugger;\n  console.log(cart);\n  return null;\n}\n');
write('.env', 'DATABASE_URL=postgres://app:pw@db/app\n');
write('.gitignore', 'node_modules/\n');
write('package.json', JSON.stringify({ name: 'shop', scripts: { build: 'next build' }, dependencies: { next: '^15.0.0' } }, null, 2));
const g = (...a) => spawnSync('git', a, { cwd: dir });
g('init', '-q', '-b', 'main');
g('-c', 'user.email=d@example.com', '-c', 'user.name=d', 'add', '.');
g('-c', 'user.email=d@example.com', '-c', 'user.name=d', 'commit', '-q', '--no-verify', '-m', 'wip');

const report = await scan(dir);
report.durationMs = 180;
const text = `$ npx before-i-push\n${toTerminal(report, { color: true })}`;
fs.rmSync(dir, { recursive: true, force: true });

const PALETTE = { 31: '#ff6b6b', 32: '#5af78e', 33: '#f3f99d', 36: '#57c7ff', 90: '#7b8496', 39: null };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const lines = text.replace(/\n+$/, '').split('\n');
const LH = 20;
const longest = Math.max(...lines.map((l) => [...l.replace(/\x1b\[\d+m/g, '')].length));
const W = Math.ceil(40 + longest * 8.2);
const H = 40 + lines.length * LH + 16;
let body = '';
lines.forEach((line, i) => {
  let fill = null;
  let bold = false;
  let dim = false;
  let spans = '';
  for (const part of line.split(/(\x1b\[\d+m)/)) {
    const m = part.match(/^\x1b\[(\d+)m$/);
    if (m) {
      const n = Number(m[1]);
      if (n === 1) bold = true;
      else if (n === 2) dim = true;
      else if (n === 22) bold = dim = false;
      else if (n in PALETTE) fill = PALETTE[n];
      continue;
    }
    if (!part) continue;
    const attrs = [fill && `fill="${fill}"`, bold && 'font-weight="700"', dim && 'opacity="0.6"'].filter(Boolean).join(' ');
    spans += `<tspan ${attrs}>${esc(part)}</tspan>`;
  }
  body += `<text x="20" y="${52 + i * LH}" xml:space="preserve">${spans}</text>\n`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="before-i-push terminal report">
<rect width="${W}" height="${H}" rx="10" fill="#1e2029"/>
<circle cx="22" cy="18" r="6" fill="#ff5f57"/><circle cx="42" cy="18" r="6" fill="#febc2e"/><circle cx="62" cy="18" r="6" fill="#28c840"/>
<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13.5" fill="#e6e6e6">
${body}</g>
</svg>
`;
fs.writeFileSync(path.join(here, '..', 'docs', 'demo.svg'), svg);
console.log(text);

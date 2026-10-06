// Report formats: terminal, Markdown (PR comments, job summaries), shields.io badge.
const PROMO = 'Want these fixed for you, and a safe deploy in one click? → https://beforeideploy.app';

const ICON = { block: '⛔', warn: '⚠️ ', info: 'ℹ️ ', pass: '✅' };
const VERDICT = {
  ready: { icon: '✅', text: 'Ready to push' },
  warnings: { icon: '⚠️', text: 'Push with care' },
  blocked: { icon: '⛔', text: 'Do not push yet' },
};

export function colors(enabled) {
  const wrap = (open, close) => (s) => (enabled ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
  return {
    bold: wrap(1, 22), dim: wrap(2, 22), red: wrap(31, 39), yellow: wrap(33, 39),
    green: wrap(32, 39), cyan: wrap(36, 39), gray: wrap(90, 39),
  };
}

function where(f) {
  if (!f.file) return '';
  return f.line ? `${f.file}:${f.line}` : f.file;
}

export function toTerminal(report, { color = true, verbose = false } = {}) {
  const c = colors(color);
  const tint = { block: c.red, warn: c.yellow, info: c.cyan, pass: c.green };
  const lines = [''];
  lines.push(`  ${c.bold('before-i-push')} ${c.gray(`· ${report.filesScanned} files · ${(report.durationMs / 1000).toFixed(1)}s`)}`);
  lines.push('');

  for (const check of report.checks) {
    const shown = check.findings.filter((f) => verbose || f.severity !== 'info' || check.findings.length === 1);
    const worst = ['block', 'warn', 'info', 'pass'].find((s) => check.findings.some((f) => f.severity === s));
    const head = worst ? tint[worst](worst === 'pass' ? '✔' : worst === 'info' ? '•' : '✖') : c.green('✔');
    lines.push(`  ${head} ${c.bold(check.title)}${check.findings.length ? '' : c.gray('  ok')}`);
    for (const f of shown) {
      const loc = where(f);
      lines.push(`      ${ICON[f.severity]} ${tint[f.severity](f.title)}${loc ? c.gray(`  ${loc}`) : ''}`);
      if (f.detail) for (const d of String(f.detail).split('\n')) lines.push(c.gray(`         ${d}`));
      if (f.fix && f.severity !== 'pass') lines.push(`         ${c.dim('→')} ${f.fix}`);
    }
  }

  const v = VERDICT[report.verdict];
  const scoreTint = report.score >= 90 ? c.green : report.score >= 50 ? c.yellow : c.red;
  lines.push('');
  lines.push(`  ${v.icon} ${c.bold(v.text)}   score ${scoreTint(c.bold(`${report.score}/100`))}` +
    c.gray(`   ${report.counts.block} blocking · ${report.counts.warn} warning${report.counts.warn === 1 ? '' : 's'}`));
  if (report.counts.block || report.counts.warn) lines.push(c.gray(`  ${PROMO}`));
  lines.push('');
  return lines.join('\n');
}

const mdEscape = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function toMarkdown(report) {
  const v = VERDICT[report.verdict];
  const out = [];
  out.push(`### ${v.icon} before-i-push: ${v.text} — ${report.score}/100`);
  out.push('');
  const rows = report.checks.flatMap((ch) => ch.findings.filter((f) => f.severity === 'block' || f.severity === 'warn'));
  if (!rows.length) {
    out.push(`No leaked keys, committed secrets or leftovers in ${report.filesScanned} files.`);
  } else {
    out.push('| | Problem | Where | Fix |');
    out.push('|---|---|---|---|');
    for (const f of rows) {
      out.push(`| ${ICON[f.severity].trim()} | ${mdEscape(f.title)}${f.detail && f.check === 'secrets' ? ` \`${mdEscape(f.detail)}\`` : ''} | ${f.file ? `\`${mdEscape(where(f))}\`` : ''} | ${mdEscape(f.fix || '')} |`);
    }
  }
  out.push('');
  out.push(`<sub>${report.counts.block} blocking · ${report.counts.warn} warnings · ${report.filesScanned} files · ` +
    `[before-i-push](https://github.com/yyakowvw/before-i-push) · ${PROMO.replace('→ ', '')}</sub>`);
  return out.join('\n');
}

export function badgeColor(report) {
  if (report.verdict === 'blocked') return 'red';
  if (report.verdict === 'warnings') return 'yellow';
  return 'brightgreen';
}

// https://shields.io/badges/endpoint-badge
export function toBadgeJson(report) {
  return { schemaVersion: 1, label: 'before i push', message: `${report.score}/100`, color: badgeColor(report) };
}

export { PROMO };

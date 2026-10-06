// before-i-push — public API. `scan(dir, options)` returns a report; the CLI only formats it.
import fs from 'node:fs';
import path from 'node:path';
import { createContext } from './files.mjs';
import secrets from './checks/secrets.mjs';
import env from './checks/env.mjs';
import git from './checks/git.mjs';
import deps from './checks/deps.mjs';
import leftovers from './checks/leftovers.mjs';
import scripts from './checks/scripts.mjs';

export const CHECKS = [secrets, env, git, deps, leftovers, scripts];
export const SEVERITIES = ['block', 'warn', 'info', 'pass'];
export { findSecretsInText } from './checks/secrets.mjs';

export function loadConfig(dir) {
  const root = path.resolve(dir);
  for (const name of ['.beforeipushrc.json', '.beforeipushrc']) {
    const file = path.join(root, name);
    if (fs.existsSync(file)) {
      try {
        return { ...JSON.parse(fs.readFileSync(file, 'utf8')), source: name };
      } catch (e) {
        throw new Error(`${name} is not valid JSON: ${e.message}`);
      }
    }
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (pkg.beforeIPush) return { ...pkg.beforeIPush, source: 'package.json' };
  } catch {
    /* no package.json */
  }
  return {};
}

export function score(findings) {
  const blocks = findings.filter((f) => f.severity === 'block').length;
  const warns = findings.filter((f) => f.severity === 'warn').length;
  let s = 100 - blocks * 25 - warns * 5;
  if (blocks) s = Math.min(s, 49);
  return Math.max(0, s);
}

export function verdict(findings) {
  if (findings.some((f) => f.severity === 'block')) return 'blocked';
  if (findings.some((f) => f.severity === 'warn')) return 'warnings';
  return 'ready';
}

export async function scan(dir = '.', options = {}) {
  const started = Date.now();
  const config = { ...loadConfig(dir), ...(options.config || {}) };
  const ctx = createContext(dir, config);
  const disabled = new Set([
    ...Object.entries(config.checks || {}).filter(([, on]) => on === false).map(([id]) => id),
    ...(options.skip || []),
  ]);
  if (options.scripts === false) disabled.add('scripts');

  const checks = [];
  for (const check of CHECKS) {
    if (disabled.has(check.id)) continue;
    let findings;
    try {
      findings = await check.run(ctx, options);
    } catch (e) {
      findings = [{ severity: 'warn', title: `Check crashed: ${e.message}` }];
    }
    checks.push({ id: check.id, title: check.title, findings: findings.map((f) => ({ check: check.id, ...f })) });
  }

  const findings = checks.flatMap((c) => c.findings);
  return {
    tool: 'before-i-push',
    root: ctx.root,
    filesScanned: ctx.files.length,
    durationMs: Date.now() - started,
    verdict: verdict(findings),
    score: score(findings),
    counts: Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length])),
    checks,
  };
}

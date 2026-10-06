// Dependencies: a Node project that installs the same way on every machine.
import { spawnSync } from 'node:child_process';

const LOCKS = {
  'package-lock.json': 'npm',
  'npm-shrinkwrap.json': 'npm',
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'bun.lock': 'bun',
  'bun.lockb': 'bun',
};

export function packageManager(ctx) {
  const declared = ctx.pkg?.packageManager?.split('@')[0];
  if (declared) return declared;
  for (const [file, pm] of Object.entries(LOCKS)) if (ctx.exists(file)) return pm;
  return 'npm';
}

function audit(ctx) {
  const pm = packageManager(ctx);
  if (pm !== 'npm' || !ctx.exists('package-lock.json')) return [];
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--json', '--omit=dev'], {
    cwd: ctx.root,
    encoding: 'utf8',
    timeout: 60000,
    shell: process.platform === 'win32',
  });
  let data;
  try {
    data = JSON.parse(r.stdout);
  } catch {
    return [{ severity: 'info', title: 'npm audit could not run', detail: (r.stderr || '').split('\n')[0] }];
  }
  const v = data.metadata?.vulnerabilities || {};
  const serious = (v.critical || 0) + (v.high || 0);
  if (serious) {
    return [{
      severity: 'block',
      title: `${serious} high or critical vulnerabilit${serious > 1 ? 'ies' : 'y'} in production dependencies`,
      detail: `critical ${v.critical || 0}, high ${v.high || 0}, moderate ${v.moderate || 0}`,
      fix: 'npm audit fix — or update the packages that npm audit names.',
    }];
  }
  if (v.moderate) {
    return [{ severity: 'warn', title: `${v.moderate} moderate vulnerabilit${v.moderate > 1 ? 'ies' : 'y'}`, fix: 'npm audit fix' }];
  }
  return [];
}

export default {
  id: 'deps',
  title: 'Dependencies',
  run(ctx, opts = {}) {
    if (!ctx.exists('package.json')) return [];
    if (!ctx.pkg) {
      return [{ severity: 'block', title: 'package.json is not valid JSON', file: 'package.json', fix: 'Fix the syntax — nothing will install.' }];
    }
    const out = [];
    const locks = Object.keys(LOCKS).filter((f) => ctx.exists(f));
    const hasDeps = Object.keys({ ...ctx.pkg.dependencies, ...ctx.pkg.devDependencies }).length > 0;

    if (hasDeps && !locks.length) {
      out.push({
        severity: 'warn',
        title: 'No lockfile',
        detail: 'Every install can pick different versions than the ones you tested.',
        fix: 'Run your package manager once (npm install) and commit the lockfile.',
      });
    }
    const pms = new Set(locks.map((f) => LOCKS[f]));
    if (pms.size > 1) {
      out.push({
        severity: 'warn',
        title: `Lockfiles from ${pms.size} package managers`,
        detail: locks.join(', '),
        fix: 'Keep the one you use and delete the others.',
      });
    }
    if (ctx.isRepo) {
      for (const lock of locks) {
        if (!ctx.tracked.has(lock) && ctx.files.includes(lock)) {
          out.push({ severity: 'warn', title: `${lock} is not committed`, file: lock, fix: `git add ${lock}` });
        }
      }
    }
    for (const [name, range] of Object.entries({ ...ctx.pkg.dependencies })) {
      if (/^(file:|link:|\.{1,2}\/|\/)/.test(String(range))) {
        out.push({
          severity: 'warn',
          title: `Dependency "${name}" points to a local folder`,
          detail: String(range),
          fix: 'It will not exist on the build server — publish it or use a workspace.',
        });
      }
    }
    if (opts.full) out.push(...audit(ctx));
    return out;
  },
};

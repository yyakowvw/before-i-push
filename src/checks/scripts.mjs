// Runs the project's own lint, typecheck and build scripts (only with --full).
import { spawnSync } from 'node:child_process';
import { packageManager } from './deps.mjs';

const STEPS = [
  { label: 'Lint', names: ['lint'] },
  { label: 'Typecheck', names: ['typecheck', 'type-check', 'check-types', 'tsc'] },
  { label: 'Tests', names: ['test'] },
  { label: 'Build', names: ['build'] },
];

function lastLines(text, n = 12) {
  return text.trim().split('\n').slice(-n).join('\n');
}

export default {
  id: 'scripts',
  title: 'Lint · Types · Tests · Build',
  run(ctx, opts = {}) {
    if (!ctx.pkg?.scripts) return [];
    const pm = packageManager(ctx);
    if (!opts.full) {
      const found = STEPS.filter((st) => st.names.some((n) => ctx.pkg.scripts[n])).map((st) => st.label.toLowerCase());
      if (!found.length) return [];
      return [{ severity: 'info', title: `Not run: ${found.join(', ')}`, fix: 'Add --full to run them too.' }];
    }
    const out = [];
    for (const step of STEPS) {
      const name = step.names.find((n) => ctx.pkg.scripts[n]);
      if (!name) continue;
      // npm's placeholder test script always fails
      if (name === 'test' && /no test specified/.test(ctx.pkg.scripts.test)) continue;
      opts.onProgress?.(`${step.label} (${pm} run ${name})`);
      const started = Date.now();
      const r = spawnSync(pm, ['run', name], {
        cwd: ctx.root,
        encoding: 'utf8',
        env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
        timeout: (opts.timeout || 600) * 1000,
        maxBuffer: 64 * 1024 * 1024,
        shell: process.platform === 'win32',
      });
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      if (r.error?.code === 'ENOENT') {
        out.push({ severity: 'warn', title: `${pm} is not installed`, fix: `Install ${pm}, or run with --no-scripts.` });
        break;
      }
      if (r.status !== 0) {
        out.push({
          severity: 'block',
          title: `${step.label} failed (${pm} run ${name}, ${secs}s)`,
          detail: lastLines(`${r.stdout || ''}\n${r.stderr || ''}`),
          fix: r.signal ? `Timed out or was killed (${r.signal}).` : `Run "${pm} run ${name}" to see the full output.`,
        });
      } else {
        out.push({ severity: 'pass', title: `${step.label} passed (${secs}s)` });
      }
    }
    return out;
  },
};

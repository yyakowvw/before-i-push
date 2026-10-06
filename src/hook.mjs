// Installs a git pre-push hook that runs before-i-push. Leaves existing hooks alone.
import fs from 'node:fs';
import path from 'node:path';
import { git } from './files.mjs';

const MARK = '# before-i-push';
const SCRIPT = `#!/bin/sh
${MARK}: blocks the push when a key or secret file would go out. Skip once: git push --no-verify
npx --yes before-i-push --no-color || exit 1
`;

export function installHook(dir) {
  const r = git(['rev-parse', '--git-path', 'hooks'], dir);
  if (r.code !== 0) return { ok: false, message: 'Not a git repository — run git init first.' };
  const hooksDir = path.resolve(dir, r.stdout.trim());
  const file = path.join(hooksDir, 'pre-push');
  fs.mkdirSync(hooksDir, { recursive: true });
  if (fs.existsSync(file)) {
    const current = fs.readFileSync(file, 'utf8');
    if (current.includes(MARK)) return { ok: true, message: `Already installed: ${file}` };
    return {
      ok: false,
      message: `A pre-push hook already exists (${file}).\nAdd this line to it yourself:\n  npx --yes before-i-push --no-color || exit 1`,
    };
  }
  fs.writeFileSync(file, SCRIPT, { mode: 0o755 });
  return { ok: true, message: `✅ Installed ${file}\n   Every git push is now checked. Skip once with: git push --no-verify` };
}

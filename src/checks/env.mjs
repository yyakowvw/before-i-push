// .env files: committed, or about to be.
import path from 'node:path';

const ENV_FILE = /(^|\/)\.env(\.[^/]+)?$/;
const ENV_SAFE = /\.(example|sample|template|dist|defaults)$/i;
const OTHER_SECRET_FILES = /(^|\/)(id_rsa|id_ed25519|id_ecdsa)$|\.(pem|p12|pfx|key|keystore|jks|mobileprovision)$|(^|\/)(credentials\.json|service-account[^/]*\.json|\.npmrc|\.pypirc|\.netrc)$/i;

export default {
  id: 'env',
  title: 'Secret files',
  run(ctx) {
    const out = [];
    for (const rel of ctx.files) {
      const isEnv = ENV_FILE.test(rel) && !ENV_SAFE.test(rel);
      const isOther = !isEnv && OTHER_SECRET_FILES.test(rel);
      if (!isEnv && !isOther) continue;

      // .npmrc / .pypirc are fine unless they hold a token
      if (/(\.npmrc|\.pypirc|\.netrc)$/.test(rel)) {
        const text = ctx.readText(rel) || '';
        if (!/(_authToken|password|_auth)\s*[=:]\s*[^\s$]/i.test(text)) continue;
      }

      const name = path.basename(rel);
      if (!ctx.isRepo) {
        out.push({
          severity: 'warn',
          title: `${name} is in the project`,
          file: rel,
          fix: 'Make sure it is listed in .gitignore before you create a repository.',
        });
      } else if (ctx.tracked.has(rel)) {
        out.push({
          severity: 'block',
          title: `${name} is committed to git`,
          file: rel,
          fix: `git rm --cached "${rel}", add it to .gitignore, rotate the values inside (they stay in history).`,
        });
      } else {
        out.push({
          severity: 'block',
          title: `${name} is not in .gitignore`,
          file: rel,
          fix: `Add "${isEnv ? '.env*' : name}" to .gitignore so the next "git add ." does not pick it up.`,
        });
      }
    }
    return out;
  },
};

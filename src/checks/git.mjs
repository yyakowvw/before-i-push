// Git state. Works offline: compares with the last fetched remote state, never fetches.
import fs from 'node:fs';
import path from 'node:path';

const BIG_FILE = 5 * 1024 * 1024;

export default {
  id: 'git',
  title: 'Git',
  run(ctx) {
    if (!ctx.isRepo) {
      return [{ severity: 'info', title: 'Not a git repository', fix: 'git init — and add a .gitignore first.' }];
    }
    const out = [];

    const branch = ctx.git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
    if (branch === 'HEAD') {
      out.push({ severity: 'warn', title: 'Detached HEAD', fix: 'Create a branch before committing: git switch -c my-branch' });
    }

    const status = ctx.git(['status', '--porcelain']).stdout.split('\n').filter(Boolean);
    const conflicted = status.filter((l) => /^(UU|AA|DD|AU|UA|DU|UD) /.test(l));
    if (conflicted.length) {
      out.push({
        severity: 'block',
        title: `Unresolved merge conflict in ${conflicted.length} file${conflicted.length > 1 ? 's' : ''}`,
        file: conflicted[0].slice(3),
        fix: 'Finish the merge: resolve the files, git add them, then git commit.',
      });
    } else if (status.length) {
      out.push({
        severity: 'warn',
        title: `${status.length} uncommitted change${status.length > 1 ? 's' : ''}`,
        detail: 'What you push is the last commit, not what is on your disk.',
        fix: 'Commit or stash them, so you test exactly what you ship.',
      });
    }

    if (branch && branch !== 'HEAD') {
      const upstream = ctx.git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
      if (upstream.code === 0) {
        const counts = ctx.git(['rev-list', '--left-right', '--count', 'HEAD...@{u}']).stdout.trim().split(/\s+/);
        const behind = Number(counts[1] || 0);
        if (behind > 0) {
          out.push({
            severity: 'warn',
            title: `Branch is ${behind} commit${behind > 1 ? 's' : ''} behind ${upstream.stdout.trim()}`,
            fix: 'git pull — your push will be rejected otherwise.',
          });
        }
      }
    }

    for (const rel of ctx.tracked) {
      if (rel.startsWith('node_modules/') || rel.includes('/node_modules/')) {
        out.push({
          severity: 'block',
          title: 'node_modules is committed',
          file: rel.slice(0, rel.indexOf('node_modules/') + 'node_modules'.length),
          fix: 'git rm -r --cached node_modules && echo node_modules/ >> .gitignore',
        });
        break;
      }
    }

    for (const rel of ctx.files) {
      try {
        const size = fs.statSync(path.join(ctx.root, rel)).size;
        if (size > BIG_FILE) {
          out.push({
            severity: 'warn',
            title: `Large file (${(size / 1024 / 1024).toFixed(1)} MB)`,
            file: rel,
            fix: 'Keep big binaries out of git (Git LFS, a CDN, or .gitignore). GitHub rejects files over 100 MB.',
          });
        }
      } catch {
        /* vanished while scanning */
      }
    }

    if (!ctx.exists('.gitignore')) {
      out.push({ severity: 'warn', title: 'No .gitignore', fix: 'Add one — at least node_modules/, .env* and your build folder.' });
    }
    return out;
  },
};

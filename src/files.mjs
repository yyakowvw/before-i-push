// Project context: which files to look at, and small helpers shared by the checks.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.netlify', '.output', '.svelte-kit',
  '.astro', '.cache', '_site', 'coverage', '.vercel', '.turbo', 'vendor', '.venv', 'venv', '__pycache__',
]);

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.icns', '.pdf', '.zip', '.gz', '.tgz', '.mp4',
  '.mov', '.mp3', '.wav', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.lockb', '.psd', '.sketch', '.fig',
  '.heic', '.webm', '.jar', '.class', '.so', '.dylib', '.dll', '.exe', '.wasm', '.bin', '.sqlite', '.db',
]);

const LOCK_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'npm-shrinkwrap.json']);

const MAX_TEXT_BYTES = 512 * 1024;
const MAX_FILES = 20000;

export function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function walk(dir) {
  const out = [];
  const visit = (rel) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) visit(r);
      } else if (e.isFile()) out.push(r);
    }
  };
  visit('');
  return out;
}

// Turns a simple glob ("docs/**", "*.md", "fixtures/") into a RegExp over forward-slash paths.
export function globToRegExp(glob) {
  let g = glob.trim().replace(/^\.\//, '');
  if (g.endsWith('/')) g += '**';
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        re += '.*';
        i++;
        if (g[i + 1] === '/') i++;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(g.includes('/') ? `^${re}$` : `(^|/)${re}$`);
}

export function createContext(dir, config = {}) {
  const root = path.resolve(dir);
  const isRepo = git(['rev-parse', '--is-inside-work-tree'], root).stdout.trim() === 'true';
  let tracked = new Set();
  let files;
  if (isRepo) {
    const t = git(['ls-files', '-z'], root).stdout.split('\0').filter(Boolean);
    const u = git(['ls-files', '--others', '--exclude-standard', '-z'], root).stdout.split('\0').filter(Boolean);
    tracked = new Set(t);
    files = [...new Set([...t, ...u])].filter((f) => {
      try {
        return fs.statSync(path.join(root, f)).isFile();
      } catch {
        return false; // deleted but not yet committed
      }
    });
  } else {
    files = walk(root);
  }

  const ignores = (config.ignore || []).map(globToRegExp);
  const ignored = (rel) => ignores.some((re) => re.test(rel));
  files = files.filter((f) => !ignored(f)).slice(0, MAX_FILES);

  const cache = new Map();
  const readText = (rel) => {
    if (cache.has(rel)) return cache.get(rel);
    let text = null;
    const base = path.basename(rel);
    const skipped =
      BINARY_EXT.has(path.extname(rel).toLowerCase()) ||
      LOCK_FILES.has(base) ||
      rel.split('/').some((seg) => SKIP_DIRS.has(seg));
    if (!skipped) {
      try {
        const abs = path.join(root, rel);
        if (fs.statSync(abs).size <= MAX_TEXT_BYTES) {
          const t = fs.readFileSync(abs, 'utf8');
          if (!t.includes('\u0000')) text = t;
        }
      } catch {
        /* unreadable: skip */
      }
    }
    cache.set(rel, text);
    return text;
  };

  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  } catch {
    /* not a Node project, or invalid JSON (reported by the deps check) */
  }

  return {
    root,
    isRepo,
    files,
    tracked,
    pkg,
    config,
    readText,
    exists: (rel) => fs.existsSync(path.join(root, rel)),
    git: (args) => git(args, root),
  };
}

// A line can opt out of every content check with a trailing comment.
export const IGNORE_MARK = /before-i-push:\s*ignore|bip-ignore/;

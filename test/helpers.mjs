import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Fake keys are assembled at runtime so no scanner ever sees a full one in this repository.
export const KEYS = {
  aws: 'AKIA' + 'Q7RZ3MXW2PLK9VNB',
  github: 'ghp_' + 'k3Jd9QmZ2xR7vB1nL5tY8wC4pH6sF0gA2eUi',
  stripe: 'sk_live_' + '51Hq8ZkLm3Nv9Rt2Wx7Yb4Cd',
  anthropic: 'sk-ant-' + 'api03-Zq9Kx2Lm7Nv3Rb8Wc4Yd1Pf6Hg5Js0Ta',
  privateKey: '-----BEGIN RSA ' + 'PRIVATE KEY-----',
};

export function project(files, { gitInit = false, commit = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bip-'));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  if (gitInit) {
    const g = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    g('init', '-q', '-b', 'main');
    g('config', 'user.email', 'test@example.com');
    g('config', 'user.name', 'Test');
    g('config', 'commit.gpgsign', 'false');
    if (commit.length) {
      g('add', '-f', ...commit);
      g('commit', '-q', '--no-verify', '-m', 'init');
    }
  }
  return dir;
}

export const titles = (report, check) =>
  report.checks.filter((c) => !check || c.id === check).flatMap((c) => c.findings.map((f) => f.title));

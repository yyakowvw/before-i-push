import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { KEYS, project } from './helpers.mjs';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'before-i-push.mjs');
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });

test('exit codes: 0 clean, 1 blocked, 2 usage', () => {
  assert.equal(run(project({ 'a.txt': 'hello' })).status, 0);
  assert.equal(run(project({ 'a.js': `x = "${KEYS.aws}"` })).status, 1);
  assert.equal(run('--nope').status, 2);
  assert.equal(run('/definitely/not/here').status, 2);
});

test('--strict fails on warnings', () => {
  const dir = project({ 'a.js': 'debugger;' });
  assert.equal(run(dir).status, 0);
  assert.equal(run(dir, '--strict').status, 1);
});

test('--json and --badge', () => {
  const dir = project({ 'a.txt': 'hello' });
  const badge = path.join(dir, 'badge.json');
  const r = run(dir, '--json', '--badge', badge);
  assert.equal(JSON.parse(r.stdout).verdict, 'ready');
  assert.equal(JSON.parse(fs.readFileSync(badge, 'utf8')).message, '100/100');
});

test('--install-hook writes a pre-push hook once', () => {
  const dir = project({ 'a.txt': 'x' }, { gitInit: true });
  assert.equal(run(dir, '--install-hook').status, 0);
  const hook = fs.readFileSync(path.join(dir, '.git', 'hooks', 'pre-push'), 'utf8');
  assert.match(hook, /before-i-push/);
  assert.match(run(dir, '--install-hook').stdout, /Already installed/);
});

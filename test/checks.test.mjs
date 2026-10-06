import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan, score, verdict } from '../src/index.mjs';
import { globToRegExp } from '../src/files.mjs';
import { toMarkdown, toTerminal, toBadgeJson } from '../src/report.mjs';
import { project, titles } from './helpers.mjs';

test('a committed .env blocks, an ignored one is fine, .env.example is fine', async () => {
  const dir = project(
    { '.env': 'DB_PASSWORD=hunter2\n', '.env.example': 'DB_PASSWORD=\n', '.gitignore': 'node_modules/\n' },
    { gitInit: true, commit: ['.env', '.env.example', '.gitignore'] },
  );
  const r = await scan(dir);
  assert.deepEqual(titles(r, 'env'), ['.env is committed to git']);

  const clean = project({ '.env': 'A=1\n', '.gitignore': '.env*\n' }, { gitInit: true, commit: ['.gitignore'] });
  assert.deepEqual(titles(await scan(clean), 'env'), []);
});

test('an untracked .env that is not ignored blocks', async () => {
  const dir = project({ '.env.local': 'A=1\n', '.gitignore': 'dist/\n' }, { gitInit: true, commit: ['.gitignore'] });
  assert.deepEqual(titles(await scan(dir), 'env'), ['.env.local is not in .gitignore']);
});

test('.npmrc only counts when it holds a token', async () => {
  const dir = project({ '.npmrc': 'registry=https://registry.npmjs.org/\n' });
  assert.deepEqual(titles(await scan(dir, { skip: ['git'] }), 'env'), []);
  const bad = project({ '.npmrc': '//registry.npmjs.org/:_authToken=abc123def\n' });
  assert.equal(titles(await scan(bad, { skip: ['git'] }), 'env').length, 1);
});

test('git: uncommitted changes, missing .gitignore, committed node_modules', async () => {
  const dir = project({ 'index.js': '1', 'node_modules/x/index.js': '2' }, { gitInit: true, commit: ['index.js', 'node_modules/x/index.js'] });
  const fs = await import('node:fs');
  fs.writeFileSync(`${dir}/index.js`, '2');
  const t = titles(await scan(dir), 'git');
  assert.ok(t.includes('1 uncommitted change'));
  assert.ok(t.includes('No .gitignore'));
  assert.ok(t.includes('node_modules is committed'));
});

test('not a git repository is only informational', async () => {
  const dir = project({ 'a.txt': 'hi' });
  const r = await scan(dir);
  assert.deepEqual(titles(r, 'git'), ['Not a git repository']);
  assert.equal(r.verdict, 'ready');
});

test('deps: no lockfile, two package managers, local dependency, broken JSON', async () => {
  const pkg = JSON.stringify({ dependencies: { left: '^1.0.0', mine: 'file:../mine' } });
  let t = titles(await scan(project({ 'package.json': pkg }), { skip: ['git'] }), 'deps');
  assert.ok(t.includes('No lockfile'));
  assert.ok(t.includes('Dependency "mine" points to a local folder'));

  t = titles(await scan(project({ 'package.json': pkg, 'package-lock.json': '{}', 'yarn.lock': '' }), { skip: ['git'] }), 'deps');
  assert.ok(t.includes('Lockfiles from 2 package managers'));

  t = titles(await scan(project({ 'package.json': '{ nope' }), { skip: ['git'] }), 'deps');
  assert.deepEqual(t, ['package.json is not valid JSON']);
});

test('leftovers: conflict markers, debugger, .only, reminders, console.log', async () => {
  const dir = project({
    'src/app.js': ['debugger;', 'console.log(1)', '// TODO remove before deploy', 'const ok = 1; // debugger'].join('\n'),
    'src/merge.js': ['<<<<<<< HEAD', 'a', '=======', 'b', '>>>>>>> main'].join('\n'),
    'test/a.test.js': "it.only('x', () => {}); console.log('fine in tests');",
    'scripts/release.js': "console.log('fine in scripts');",
    'README.md': 'Title\n=======\n',
  });
  const r = await scan(dir, { skip: ['git'] });
  const t = titles(r, 'leftovers');
  assert.equal(t.filter((x) => x === 'Merge conflict marker').length, 2);
  assert.ok(t.includes('debugger statement'));
  assert.ok(t.includes('.only() in a test'));
  assert.ok(t.includes('Reminder left in the code'));
  assert.ok(t.includes('1 console.log call in app code'));
});

test('a check can be switched off in config', async () => {
  const dir = project({ 'src/a.js': 'debugger;', '.beforeipushrc.json': '{"checks":{"leftovers":false}}' });
  const r = await scan(dir, { skip: ['git'] });
  assert.ok(!r.checks.some((c) => c.id === 'leftovers'));
});

test('scripts run only with --full and report failures', async () => {
  const pkg = JSON.stringify({ scripts: { lint: 'node -e "process.exit(0)"', build: 'node -e "console.error(\'boom\');process.exit(3)"' } });
  const dir = project({ 'package.json': pkg });
  assert.deepEqual(titles(await scan(dir, { skip: ['git', 'deps'] }), 'scripts'), ['Not run: lint, build']);
  const r = await scan(dir, { skip: ['git', 'deps'], full: true });
  const f = r.checks.find((c) => c.id === 'scripts').findings;
  assert.equal(f[0].severity, 'pass');
  assert.equal(f[1].severity, 'block');
  assert.match(f[1].detail, /boom/);
});

test('score and verdict', () => {
  assert.equal(score([]), 100);
  assert.equal(score([{ severity: 'warn' }, { severity: 'info' }]), 95);
  assert.equal(score([{ severity: 'block' }]), 49);
  assert.equal(verdict([{ severity: 'warn' }]), 'warnings');
  assert.equal(verdict([{ severity: 'pass' }]), 'ready');
});

test('globs', () => {
  assert.ok(globToRegExp('fixtures/**').test('fixtures/a/b.txt'));
  assert.ok(globToRegExp('fixtures/').test('fixtures/x'));
  assert.ok(globToRegExp('*.snap').test('src/__snapshots__/a.snap'));
  assert.ok(!globToRegExp('docs/*.md').test('docs/a/b.md'));
});

test('reports render', async () => {
  const r = await scan(project({ 'src/a.js': 'debugger;' }), { skip: ['git'] });
  assert.match(toMarkdown(r), /debugger statement/);
  assert.match(toTerminal(r, { color: false }), /Push with care/);
  assert.deepEqual(toBadgeJson(r), { schemaVersion: 1, label: 'before i push', message: '95/100', color: 'yellow' });
});

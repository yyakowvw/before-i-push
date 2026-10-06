import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan, findSecretsInText } from '../src/index.mjs';
import { mask } from '../src/checks/secrets.mjs';
import { KEYS, project, titles } from './helpers.mjs';

test('finds common keys and masks them', () => {
  for (const [name, key] of Object.entries(KEYS)) {
    const hits = findSecretsInText(`const x = "${key}";`);
    assert.equal(hits.length, 1, name);
    assert.ok(!hits[0].sample.includes(key.slice(8, -4)) || key.length <= 12, `${name} must be masked`);
  }
});

test('ignores placeholders and obviously fake values', () => {
  const lines = [
    'AWS_KEY=AKIAXXXXXXXXXXXXXXXX',
    'key: sk-ant-your-key-here-xxxxxxxxxxxxxxxxxxxxxxxxxx',
    'token: ghp_' + 'A'.repeat(36),
    'OPENAI=sk-' + 'abc'.repeat(15),
  ];
  for (const l of lines) assert.deepEqual(findSecretsInText(l), [], l);
});

test('a line can opt out', () => {
  assert.deepEqual(findSecretsInText(`const k = "${KEYS.aws}"; // before-i-push: ignore`), []);
});

test('blocks a key in source, only warns in a test file', async () => {
  const dir = project({ 'src/api.js': `export const key = "${KEYS.github}";\n`, 'test/api.test.js': `const k = "${KEYS.aws}";\n` });
  const r = await scan(dir, { skip: ['git'] });
  const found = r.checks.find((c) => c.id === 'secrets').findings;
  assert.equal(found.find((f) => f.file === 'src/api.js').severity, 'block');
  assert.equal(found.find((f) => f.file === 'test/api.test.js').severity, 'warn');
  assert.equal(r.verdict, 'blocked');
  assert.ok(!JSON.stringify(r).includes(KEYS.github), 'the report never contains the full key');
});

test('respects ignore globs from config', async () => {
  const dir = project({
    'fixtures/keys.txt': KEYS.aws,
    '.beforeipushrc.json': JSON.stringify({ ignore: ['fixtures/**'] }),
  });
  const r = await scan(dir, { skip: ['git'] });
  assert.deepEqual(titles(r, 'secrets'), []);
});

test('mask keeps only the ends', () => {
  assert.equal(mask('ghp_abcdefghijklmnop1234'), 'ghp_ab…1234');
  assert.equal(mask('short'), '••••••');
});

test('passwords in URLs: real ones yes, local examples no', () => {
  assert.equal(findSecretsInText('url = "postgres://admin:' + 'Zx8kQ2pLm9@prod-db.internal.io/app"').length, 1);
  assert.deepEqual(findSecretsInText('postgres://user:password@localhost:5432/db'), []);
  assert.deepEqual(findSecretsInText('redis://default:${REDIS_PASSWORD}@cache:6379'), []);
});

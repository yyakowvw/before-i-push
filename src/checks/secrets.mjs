// Leaked keys and tokens inside files that would be pushed.
import { IGNORE_MARK } from '../files.mjs';

export const PATTERNS = [
  { name: 'AWS access key', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'Stripe live secret key', re: /\b(sk|rk)_live_[0-9a-zA-Z]{20,}/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{50,}/ },
  { name: 'GitLab token', re: /\bglpat-[A-Za-z0-9_-]{20,}/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Slack webhook', re: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{20,}/ },
  { name: 'Private key', re: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY( BLOCK)?-----/ },
  { name: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{32,}/ },
  { name: 'OpenAI API key', re: /\bsk-(proj-|svcacct-)?[A-Za-z0-9_-]{40,}/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'SendGrid API key', re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/ },
  { name: 'Twilio API key', re: /\bSK[0-9a-f]{32}\b/ },
  { name: 'Mailgun API key', re: /\bkey-[0-9a-f]{32}\b/ },
  { name: 'npm token', re: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { name: 'Netlify token', re: /\bnfp_[A-Za-z0-9]{36,}/ },
  { name: 'Supabase service role key', re: /service_role["'\s:=]+eyJ[A-Za-z0-9_-]{20,}/ },
  { name: 'Discord bot token', re: /\b[MNO][A-Za-z\d_-]{23,27}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,}/ },
  { name: 'Discord webhook', re: /https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{60,}/ },
  { name: 'Telegram bot token', re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/ },
  { name: 'Password in a URL', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/'"]+:[^\s:@/'"$<>{}]{6,}@[^\s'"]+/i },
];

// Placeholders and obviously fake values people put in docs, examples and tests.
const PLACEHOLDER = /(x{6,}|your[_-]?(key|token|secret|password)|example|placeholder|changeme|<[^>]+>|\*{4,}|\.{3}|fake|dummy|redacted|test|secret|password|localhost|127\.0\.0\.1|0{8,}|1234567|abcdefgh)/i;
const REPEATS = /(.{2,})\1{2,}/; // AAAAAA, abcabcabc, SECRETSECRETSECRET — real keys are random

export function looksFake(value) {
  return PLACEHOLDER.test(value) || REPEATS.test(value);
}

const TEST_FILE = /(^|\/)(__tests__|tests?|spec|fixtures?|__mocks__|e2e)\/|\.(test|spec)\.[a-z]+$/i;

export function mask(s) {
  if (s.length <= 12) return '•'.repeat(6);
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export function findSecretsInText(text) {
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 5000 || IGNORE_MARK.test(line)) continue;
    for (const p of PATTERNS) {
      const m = line.match(p.re);
      if (m && !looksFake(m[0])) {
        hits.push({ line: i + 1, kind: p.name, sample: mask(m[0]) });
        break;
      }
    }
  }
  return hits;
}

const ENV_FILE = /(^|\/)\.env(\.[^/]+)?$/;
const ENV_SAFE = /\.(example|sample|template|dist|defaults)$/i;

export default {
  id: 'secrets',
  title: 'Leaked keys',
  run(ctx) {
    const out = [];
    for (const rel of ctx.files) {
      if (ENV_FILE.test(rel) && !ENV_SAFE.test(rel)) continue; // the env check owns real .env files
      const text = ctx.readText(rel);
      if (!text) continue;
      const inTests = TEST_FILE.test(rel);
      for (const h of findSecretsInText(text)) {
        out.push({
          // a real-looking key in a test fixture is still worth a look, but rarely a live one
          severity: inTests ? 'warn' : 'block',
          title: `${h.kind} in ${inTests ? 'a test file' : 'the code'}`,
          file: rel,
          line: h.line,
          detail: h.sample,
          fix: 'Use an environment variable instead, and revoke this key — once pushed, it is public.',
        });
        if (out.length >= 50) return out;
      }
    }
    return out;
  },
};

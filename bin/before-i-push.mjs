#!/usr/bin/env node
// before-i-push CLI. Exit codes: 0 ok, 1 blocked (or warnings with --strict), 2 usage error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan } from '../src/index.mjs';
import { toTerminal, toMarkdown, toBadgeJson } from '../src/report.mjs';
import { installHook } from '../src/hook.mjs';

const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));

const HELP = `
  before-i-push ${pkg.version}
  Catch leaked keys, committed .env files and leftover debug code before you push.

  Usage
    npx before-i-push [folder] [options]

  Options
    --full            also run npm audit and your lint, typecheck, test and build scripts
    --strict          fail on warnings too, not only on blocking problems
    --json            print the report as JSON
    --markdown        print the report as Markdown (for PR comments)
    --badge <file>    write a shields.io endpoint badge JSON file
    --skip <ids>      skip checks, comma separated: secrets,env,git,deps,leftovers,scripts
    --verbose         show informational findings too
    --no-color        plain output (also: NO_COLOR=1)
    --install-hook    run before-i-push automatically before every git push
    -v, --version
    -h, --help

  Silence one line with a comment:  // before-i-push: ignore
  Config: .beforeipushrc.json  { "ignore": ["fixtures/**"], "checks": { "leftovers": false } }
`;

function parse(argv) {
  const o = { dir: '.', skip: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case '-h': case '--help': o.help = true; break;
      case '-v': case '--version': o.version = true; break;
      case '--full': o.full = true; break;
      case '--strict': o.strict = true; break;
      case '--json': o.json = true; break;
      case '--markdown': case '--md': o.markdown = true; break;
      case '--badge': o.badge = value(); break;
      case '--skip': o.skip.push(...value().split(',').map((s) => s.trim()).filter(Boolean)); break;
      case '--verbose': o.verbose = true; break;
      case '--no-color': o.noColor = true; break;
      case '--no-scripts': o.scripts = false; break;
      case '--install-hook': o.installHook = true; break;
      default:
        if (a.startsWith('-')) throw new Error(`Unknown option ${a}`);
        o.dir = a;
    }
  }
  return o;
}

async function main() {
  let o;
  try {
    o = parse(process.argv.slice(2));
  } catch (e) {
    console.error(`before-i-push: ${e.message}\n${HELP}`);
    return 2;
  }
  if (o.help) return console.log(HELP), 0;
  if (o.version) return console.log(pkg.version), 0;
  if (!fs.existsSync(o.dir) || !fs.statSync(o.dir).isDirectory()) {
    console.error(`before-i-push: no such folder: ${o.dir}`);
    return 2;
  }
  if (o.installHook) {
    const r = installHook(o.dir);
    console.log(r.message);
    return r.ok ? 0 : 1;
  }

  const color = !o.noColor && !process.env.NO_COLOR && (Boolean(process.stdout.isTTY) || Boolean(process.env.FORCE_COLOR));
  const report = await scan(o.dir, {
    full: o.full,
    skip: o.skip,
    scripts: o.scripts,
    onProgress: o.json || o.markdown ? undefined : (s) => process.stderr.write(`  … ${s}\n`),
  });

  if (o.badge) fs.writeFileSync(o.badge, `${JSON.stringify(toBadgeJson(report))}\n`);
  if (o.json) console.log(JSON.stringify(report, null, 2));
  else if (o.markdown) console.log(toMarkdown(report));
  else console.log(toTerminal(report, { color, verbose: o.verbose }));

  if (report.verdict === 'blocked') return 1;
  if (o.strict && report.verdict === 'warnings') return 1;
  return 0;
}

main().then(
  (code) => { process.exitCode = code; },
  (e) => { console.error(`before-i-push: ${e.message}`); process.exitCode = 2; },
);

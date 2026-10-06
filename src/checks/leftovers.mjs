// Things left behind while debugging.
import path from 'node:path';
import { IGNORE_MARK } from '../files.mjs';

const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.vue', '.svelte', '.astro']);
const TEXT_EXT = new Set([...CODE_EXT, '.html', '.css', '.scss', '.json', '.md', '.yml', '.yaml', '.py', '.rb', '.go', '.php', '.java', '.kt', '.swift', '.rs', '.c', '.cpp', '.h', '.cs', '.sh']);
const TEST_FILE = /(^|\/)(__tests__|tests?|spec|e2e|cypress)\/|\.(test|spec|cy)\.[a-z]+$/i;
// console.log is fine in tools, scripts and servers' CLIs; only count it in app code
const TOOL_DIR = /(^|\/)(scripts?|bin|tools?|cli|config|examples?|docs?)\//i;

export default {
  id: 'leftovers',
  title: 'Leftovers',
  run(ctx) {
    const out = [];
    let logCount = 0;
    let firstLog = null;

    for (const rel of ctx.files) {
      const ext = path.extname(rel).toLowerCase();
      if (!TEXT_EXT.has(ext)) continue;
      const text = ctx.readText(rel);
      if (!text) continue;
      const isCode = CODE_EXT.has(ext);
      const isTest = TEST_FILE.test(rel);
      const lines = text.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (IGNORE_MARK.test(line)) continue;
        const at = { file: rel, line: i + 1 };

        if (/^(<{7}|>{7})( |$)/.test(line)) {
          out.push({ ...at, severity: 'block', title: 'Merge conflict marker', fix: 'Resolve the conflict and remove the <<<<<<< ======= >>>>>>> lines.' });
          continue;
        }
        if (!isCode) continue;

        const code = line.replace(/\/\/.*$/, '').trim();
        if (/^debugger;?$/.test(code)) {
          out.push({ ...at, severity: 'warn', title: 'debugger statement', fix: 'Remove it — it pauses the page for anyone with dev tools open.' });
        } else if (isTest && /\b(it|test|describe|context)\.only\s*\(/.test(code)) {
          out.push({ ...at, severity: 'warn', title: '.only() in a test', fix: 'Remove .only — every other test in the file is being skipped.' });
        } else if (/(\/\/|\/\*|^\s*\*|#|<!--)\s*(TODO|FIXME|HACK)\b.*\b(remove|delete|before (deploy|release|push|merge|prod)|temporary|temp)\b/i.test(line)) {
          out.push({ ...at, severity: 'warn', title: 'Reminder left in the code', detail: line.trim().slice(0, 100) });
        } else if (!isTest && !TOOL_DIR.test(rel) && /\bconsole\.(log|debug|dir|table)\s*\(/.test(code)) {
          logCount++;
          if (!firstLog) firstLog = at;
        }
      }
    }

    if (logCount) {
      out.push({
        ...firstLog,
        severity: 'info',
        title: `${logCount} console.log call${logCount > 1 ? 's' : ''} in app code`,
        fix: 'Fine while developing; consider removing them or using a logger before release.',
      });
    }
    return out;
  },
};

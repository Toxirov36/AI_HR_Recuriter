import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// No patched braces release exists. This exception is limited to build-only
// dependencies processing checked-in Tailwind patterns, and expires for review.
const advisory = 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm';
const expires = Date.parse('2026-11-11T00:00:00Z');
const severe = (severity) => severity === 'high' || severity === 'critical';
export function temporaryBuildException(name, report, lock, now = Date.now(), seen = new Set()) {
  const item = report.vulnerabilities?.[name];
  if (now >= expires || !item || item.severity === 'critical' || seen.has(name) || !item.nodes?.length ||
      item.nodes.some((node) => lock.packages?.[node]?.dev !== true)) return false;
  const visited = new Set(seen).add(name);
  const causes = item.via.filter((cause) => typeof cause === 'string' || severe(cause.severity));
  return causes.length > 0 && causes.every((cause) => typeof cause === 'string'
    ? (!severe(report.vulnerabilities?.[cause]?.severity)
      ? !!report.vulnerabilities?.[cause]
      : temporaryBuildException(cause, report, lock, now, visited))
    : cause.url === advisory && cause.name === 'braces' && cause.severity === 'high');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' });
  try {
    const report = JSON.parse(result.stdout);
    if (report.error || !report.vulnerabilities) throw new Error('Audit did not return findings');
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const blockers = [];
    for (const [name, item] of Object.entries(report.vulnerabilities)) {
      if (!severe(item.severity)) continue;
      if (temporaryBuildException(name, report, lock)) {
        console.warn(`Temporary build-only exception: ${name}; ${advisory}; expires 2026-11-11`);
      } else blockers.push(name);
    }
    console.log('Audit severity counts:', JSON.stringify(report.metadata?.vulnerabilities));
    if (blockers.length) { console.error('Blocking vulnerabilities:', blockers.join(', ')); process.exitCode = 1; }
  } catch { console.error('Security audit unavailable or invalid; deployment blocked.'); process.exitCode = 1; }
}

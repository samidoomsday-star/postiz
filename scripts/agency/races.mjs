/** Run actual policy/receipt races repeatedly, deterministic selection order. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
const suites = [
  [
    'tests/agency/approval.api.spec.ts',
    'concurrent edit versus approve|duplicate schedule commands|preserves UNKNOWN|delayed thread parts|pending finalization',
  ],
  [
    'tests/agency/action.api.spec.ts',
    'preserve the successful target|reconciles confirmed evidence|operator updates are nonmaterial|concurrent retry and cancel|older workflow|simultaneous reconcile and cancel',
  ],
];
const seeds = [50501, 50502, 50503],
  reports = [];
for (const seed of seeds) {
  const ordered = seed % 2 ? [...suites].reverse() : suites;
  const fd = openSync(`.agency/results/races-${seed}.log`, 'w', 0o600);
  try {
    for (const [file, pattern] of ordered) {
      execFileSync(
        'pnpm',
        [
          'exec',
          'playwright',
          'test',
          '--config',
          'playwright.agency.config.ts',
          '--project=api',
          file,
          '--grep',
          pattern,
        ],
        { stdio: ['ignore', fd, fd] }
      );
      const stats = JSON.parse(
        readFileSync('.agency/results/integration-results.json', 'utf8')
      ).stats;
      if (!stats.expected || stats.unexpected || stats.skipped || stats.flaky)
        throw Error('Race run was incomplete');
      reports.push({ seed, file, pattern, ...stats });
    }
  } finally {
    closeSync(fd);
  }
}
writeFileSync(
  '.agency/results/races-summary.json',
  JSON.stringify(reports, null, 2) + '\n'
);
console.log(
  JSON.stringify({
    seeds,
    runs: reports.length,
    passed: reports.reduce((sum, r) => sum + r.expected, 0),
    failed: 0,
    skipped: 0,
    flaky: 0,
  })
);
// Seeds define suite order, not deterministic network/OS thread interleaving.

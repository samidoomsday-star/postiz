/** Registry audit through curl (inherits proxy/CA); range-filter locked versions. */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url),
  yaml = require('yaml'),
  semver = require('semver');
const lock = yaml.parse(readFileSync('pnpm-lock.yaml', 'utf8')),
  input = {};
for (const key of Object.keys(lock.packages)) {
  const i = key.lastIndexOf('@'),
    name = key.slice(0, i),
    version = key.slice(i + 1);
  if (semver.valid(version)) (input[name] ||= []).push(version);
}
writeFileSync('.agency/results/advisory-input.json', JSON.stringify(input));
execFileSync('curl', [
  '--max-time',
  '60',
  '--fail',
  '--silent',
  '--show-error',
  'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
  '-H',
  'Content-Type: application/json',
  '--data-binary',
  '@.agency/results/advisory-input.json',
  '-o',
  '.agency/results/advisories.json',
]);
const response = JSON.parse(
    readFileSync('.agency/results/advisories.json', 'utf8')
  ),
  rows = [];
for (const [name, advisories] of Object.entries(response))
  for (const advisory of advisories) {
    const versions = (input[name] || []).filter((v) =>
      semver.satisfies(v, advisory.vulnerable_versions, {
        includePrerelease: true,
      })
    );
    if (versions.length)
      rows.push({
        name,
        versions,
        severity: advisory.severity,
        title: advisory.title,
        url: advisory.url,
        range: advisory.vulnerable_versions,
      });
  }
writeFileSync(
  '.agency/results/affected-advisories.json',
  JSON.stringify(rows, null, 2) + '\n'
);
const counts = {};
for (const r of rows) counts[r.severity] = (counts[r.severity] || 0) + 1;
console.log(
  JSON.stringify({
    date: new Date().toISOString(),
    lockedPackages: Object.keys(input).length,
    affectedAdvisories: rows.length,
    counts,
    highCriticalPackages: [
      ...new Set(
        rows
          .filter((r) => ['high', 'critical'].includes(r.severity))
          .map((r) => r.name)
      ),
    ],
  })
);
// Raw totals are an audit input, not a claim that every feature is reachable.

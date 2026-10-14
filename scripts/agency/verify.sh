#!/usr/bin/env bash
# Complete local candidate gate. Run after setup; all fixtures are synthetic.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
run() { bash scripts/agency/with-env.sh "$@"; }
python3 scripts/agency/plan.py check
run pnpm run lint:agency
run pnpm run typecheck:agency
for component in backend frontend orchestrator; do
  if [[ "$component" == frontend ]]; then config=tsconfig.json; else config=tsconfig.build.json; fi
  run pnpm exec tsc --noEmit --project "apps/$component/$config"
done
run pnpm test
run python3 scripts/agency/rehearse-migration.py
run python3 scripts/agency/runtime.py start
run pnpm exec playwright test --config playwright.agency.config.ts
run node --experimental-require-module scripts/agency/restore-media.mjs
run node scripts/agency/replay.mjs
run node scripts/agency/restart-approval.mjs
run python3 scripts/agency/runtime.py stop
run docker compose -f compose.agency.yaml stop
run docker compose -f compose.agency.yaml up -d --wait
run node scripts/agency/migrate.mjs
run python3 scripts/agency/runtime.py start
# A new real worker publication after the entire service topology restarted.
run node scripts/agency/restart-approval.mjs
git diff --exit-code
echo 'Local candidate checks passed. Apps remain running for owner testing.'

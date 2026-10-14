#!/usr/bin/env bash
# Stable entry point for local IDE agents. No real social credentials required.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
action="${1:-start}"
run() { bash scripts/agency/with-env.sh "$@"; }
usage() {
  echo 'Usage: bash start-local.sh [start|setup|stop|status|check|verify]'
}
if [[ $# -gt 1 ]]; then usage >&2; exit 2; fi
case "$action" in start|setup|stop|status|check|verify) ;; *) usage >&2; exit 2 ;; esac
setup_local() {
  python3 scripts/agency/preflight.py
  if [[ -f .agency/environment.env ]]; then
    run python3 scripts/agency/runtime.py stop
  fi
  # A failed explicit rebuild must never retain an earlier success marker.
  rm -f .agency/local-build-commit
  bash scripts/agency/setup.sh
  git rev-parse HEAD > .agency/local-build-commit
}
case "$action" in
  setup) setup_local ;;
  check) python3 scripts/agency/preflight.py ;;
  stop|status)
    if [[ ! -f .agency/environment.env ]]; then
      echo 'This checkout is not configured. Run: bash start-local.sh'
      exit 0
    fi
    if [[ "$action" == stop ]]; then
      run python3 scripts/agency/runtime.py stop
      run docker compose -f compose.agency.yaml stop
    else
      run python3 scripts/agency/runtime.py status
      run docker compose -f compose.agency.yaml ps
    fi
    ;;
  verify) run bash scripts/agency/verify.sh ;;
  start)
    python3 scripts/agency/preflight.py
    current_commit="$(git rev-parse HEAD)"
    if [[ ! -f .agency/local-build-commit ]] ||
       [[ "$(cat .agency/local-build-commit)" != "$current_commit" ]] ||
       [[ ! -f .agency/environment.env ]] ||
       [[ ! -f .agency/fixture-access.json ]] ||
       [[ ! -x .agency/tools/node/bin/node ]] ||
       [[ ! -f node_modules/.modules.yaml ]] ||
       [[ ! -f apps/frontend/.next/BUILD_ID ]] ||
       [[ ! -f apps/backend/dist/apps/backend/src/main.js ]] ||
       [[ ! -f apps/orchestrator/dist/apps/orchestrator/src/main.js ]]; then
      setup_local
    fi
    run docker compose -f compose.agency.yaml up -d --wait
    run node scripts/agency/migrate.mjs
    run python3 scripts/agency/runtime.py start
    # Real login, tenant scope, publication/rejection, mail and browser workspace.
    run pnpm exec playwright test tests/agency/baseline.api.spec.ts tests/agency/baseline.browser.spec.ts --config playwright.agency.config.ts
    echo 'Local synthetic app started and smoke checks passed.'
    echo 'Frontend: port 4200, /auth/login. Mailpit inbox: port 18025.'
    echo 'Demo owner: owner-a@example.test / LocalFixture123!'
    echo 'Next: docs/agency/LOCAL-TESTING.md. Stop: bash start-local.sh stop'
    ;;
esac

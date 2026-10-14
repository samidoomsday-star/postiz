#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_dir"
python3 scripts/agency/preflight.py
bash scripts/agency/bootstrap.sh
python3 scripts/agency/configure.py
bash scripts/agency/with-env.sh pnpm install --frozen-lockfile --store-dir .agency/pnpm-store
bash scripts/agency/with-env.sh docker compose -f compose.agency.yaml up -d --wait
bash scripts/agency/with-env.sh node scripts/agency/migrate.mjs
bash scripts/agency/with-env.sh node scripts/agency/seed.mjs
bash scripts/agency/with-env.sh pnpm run build
if command -v chromium >/dev/null && [[ "${CI:-}" != 'true' ]]; then
  chromium --version
else
  bash scripts/agency/with-env.sh pnpm exec playwright install --with-deps chromium
fi
echo 'Setup complete. Start apps with: bash scripts/agency/with-env.sh python3 scripts/agency/runtime.py start'

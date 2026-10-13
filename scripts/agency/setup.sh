#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_dir"
bash scripts/agency/bootstrap.sh
python3 scripts/agency/configure.py
bash scripts/agency/with-env.sh pnpm install --frozen-lockfile --store-dir .agency/pnpm-store
bash scripts/agency/with-env.sh docker compose -f compose.agency.yaml up -d --wait
# This bootstrap is explicitly confined to the synthetic database by configure
# and the seed guard. Never use this db-push command on customer databases.
bash scripts/agency/with-env.sh node - <<'JS'
const u=new URL(process.env.DATABASE_URL);
if(process.env.AGENCY_TEST_MODE!=='true'||process.env.AGENCY_TEST_ACK!=='LOCAL_SYNTHETIC_ONLY'||u.pathname!=='/postiz_agency_test'||!['127.0.0.1','localhost'].includes(u.hostname)) throw Error('Unsafe bootstrap database');
JS
bash scripts/agency/with-env.sh pnpm exec prisma db push --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
bash scripts/agency/with-env.sh node scripts/agency/seed.mjs
bash scripts/agency/with-env.sh pnpm run build
if command -v chromium >/dev/null && [[ "${CI:-}" != 'true' ]]; then
  chromium --version
else
  bash scripts/agency/with-env.sh pnpm exec playwright install --with-deps chromium
fi
echo 'Setup complete. Start apps with: bash scripts/agency/with-env.sh python3 scripts/agency/runtime.py start'

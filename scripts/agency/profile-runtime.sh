#!/usr/bin/env bash
# The caller runs in the local 4-vCPU/8-GB Docker application profile.
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_dir"
node --experimental-require-module apps/backend/dist/apps/backend/src/main.js > .agency/logs/phase5-profile-backend.log 2>&1 &
profile_backend=$!
node --experimental-require-module apps/orchestrator/dist/apps/orchestrator/src/main.js > .agency/logs/phase5-profile-worker.log 2>&1 &
profile_worker=$!
(cd apps/frontend; exec node "$repo_dir/node_modules/next/dist/bin/next" start -p 4200 --hostname 127.0.0.1) > .agency/logs/phase5-profile-frontend.log 2>&1 &
profile_frontend=$!
trap 'kill -TERM "$profile_backend" "$profile_worker" "$profile_frontend" 2>/dev/null || true; wait' TERM INT EXIT
wait -n "$profile_backend" "$profile_worker" "$profile_frontend"

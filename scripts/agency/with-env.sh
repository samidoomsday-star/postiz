#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ ! -f "$repo_dir/.agency/environment.env" ]]; then
  echo 'Run python3 scripts/agency/configure.py first.' >&2
  exit 1
fi
export PATH="$repo_dir/.agency/tools/pnpm/node_modules/.bin:$repo_dir/.agency/tools/node/bin:$PATH"
export XDG_CACHE_HOME="$repo_dir/.agency/cache"
export npm_config_cache="$repo_dir/.agency/tools/npm-cache"
export PNPM_HOME="$repo_dir/.agency/pnpm-home"
set -a
source "$repo_dir/.agency/environment.env"
set +a
cd "$repo_dir"
exec "$@"

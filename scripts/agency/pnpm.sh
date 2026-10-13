#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tools_dir="$repo_dir/.agency/tools"
if [[ ! -x "$tools_dir/node/bin/node" ]] || [[ ! -f "$tools_dir/pnpm/node_modules/pnpm/bin/pnpm.cjs" ]]; then
  echo 'Run bash scripts/agency/bootstrap.sh first.' >&2
  exit 1
fi
export PATH="$tools_dir/pnpm/node_modules/.bin:$tools_dir/node/bin:$PATH"
export XDG_CACHE_HOME="$repo_dir/.agency/cache"
export npm_config_cache="$repo_dir/.agency/tools/npm-cache"
export PNPM_HOME="$repo_dir/.agency/pnpm-home"
if [[ "$(node --version)" != "v$(cat "$repo_dir/.nvmrc")" ]]; then
  echo 'Local toolchain does not match .nvmrc; rerun bootstrap.sh.' >&2
  exit 1
fi
cd "$repo_dir"
exec node "$tools_dir/pnpm/node_modules/pnpm/bin/pnpm.cjs" "$@"

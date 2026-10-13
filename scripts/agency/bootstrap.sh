#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tools_dir="$repo_dir/.agency/tools"
node_version="$(cat "$repo_dir/.nvmrc")"
pnpm_version="10.6.1"
platform="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$(uname -m)" in
  x86_64) arch=x64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo 'Unsupported architecture for automatic Node setup' >&2; exit 1 ;;
esac
case "$platform" in linux|darwin) ;; *) echo 'Use Node from .nvmrc and pnpm 10.6.1 on this OS' >&2; exit 1 ;; esac
mkdir -p "$tools_dir"
if [[ ! -x "$tools_dir/node/bin/node" ]] || [[ "$($tools_dir/node/bin/node --version)" != "v$node_version" ]]; then
  archive="node-v${node_version}-${platform}-${arch}.tar.xz"
  download_dir="$(mktemp -d "$tools_dir/download.XXXXXX")"
  trap 'rm -rf "$download_dir"' EXIT
  curl --fail --silent --show-error --location "https://nodejs.org/dist/v${node_version}/${archive}" -o "$download_dir/$archive"
  curl --fail --silent --show-error --location "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt" -o "$download_dir/SHASUMS256.txt"
  (cd "$download_dir"; awk -v archive="$archive" '$2 == archive {print}' SHASUMS256.txt > expected.sha256; test -s expected.sha256; sha256sum --check expected.sha256)
  tar -xJf "$download_dir/$archive" -C "$download_dir"
  if [[ -d "$tools_dir/node" ]]; then
    mv "$tools_dir/node" "$tools_dir/node.previous.$(date +%s)"
  fi
  mv "$download_dir/node-v${node_version}-${platform}-${arch}" "$tools_dir/node"
fi
export PATH="$tools_dir/node/bin:$PATH"
if [[ ! -f "$tools_dir/pnpm/node_modules/pnpm/package.json" ]] || [[ "$(node -p "require('$tools_dir/pnpm/node_modules/pnpm/package.json').version")" != "$pnpm_version" ]]; then
  npm install --prefix "$tools_dir/pnpm" "pnpm@$pnpm_version" --cache "$tools_dir/npm-cache" --no-audit --no-fund
fi
node --version
node "$tools_dir/pnpm/node_modules/pnpm/bin/pnpm.cjs" --version

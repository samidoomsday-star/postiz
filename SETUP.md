# Set up and run locally — IDE agent entry point

Use this document for requests such as “clone this repository and run it locally for testing.” Follow AGENTS.md. The result is a running, smoke-tested synthetic Agency V1 installation, with demo login and stop/restart instructions. This is an operations task; all development phases 0–6 are already complete.

## Paste this prompt into your IDE

> Clone branch release/agency-v1-rc1 from https://github.com/samidoomsday-star/postiz into my local workspace, or use my existing checkout without discarding changes. Read AGENTS.md and SETUP.md first. Detect my OS, prepare the documented prerequisites, then run the supported local setup/start command. Diagnose and fix setup problems until the API and browser smoke tests pass, or explain the exact external prerequisite you cannot satisfy. Leave the app running for my testing and tell me the browser address, demo login, test results and stop/restart commands. Use synthetic providers; do not ask for social credentials, implement features, merge PRs, reset data or deploy anything.

**Owner platform: Windows.** Start with [WINDOWS-SETUP.md](WINDOWS-SETUP.md) for WSL2/Docker Desktop/IDE checks, Linux-filesystem cloning and Windows-browser verification. The general steps below run inside that Linux environment.

## 1. Inspect before changing anything

- Resolve the real checkout root and run `git status --short`, `git branch --show-current`, `git log -1 --oneline`. Use the existing checkout; do not create a worktree or duplicate a configured installation.
- The complete V1 branch is `release/agency-v1-rc1`. Use the [branch-specific repository link](https://github.com/samidoomsday-star/postiz/tree/release/agency-v1-rc1) or clone it explicitly with `git clone --branch release/agency-v1-rc1 --single-branch https://github.com/samidoomsday-star/postiz.git`. The current repository default remains `main`: the connected GitHub integration denied the default-branch update (HTTP 403). The owner can change the repository default branch to `release/agency-v1-rc1` in GitHub settings to make future plain-root-link clones select the app automatically. `main` still contains only the earlier planning foundation; phase PRs remain unmerged. A default-branch change does not merge them.
- If setup scripts are absent in an older `main` clone, inspect local modifications/untracked files and local-only commits first. Preserve them. Fetch `origin release/agency-v1-rc1`; on a clean checkout, switch to the existing local candidate branch or create its tracking branch with `git switch --track origin/release/agency-v1-rc1`. Do not reset, force-switch, auto-stash, overwrite files or merge to solve branch selection. If switching would affect user work, report that specific conflict and continue read-only preparation.
- Read only required configuration names/status for diagnostics; never print .agency/environment.env, fixture-access.json, process environments or raw private logs.

## 2. Select the execution environment

| Host | IDE agent action | Verification status |
| --- | --- | --- |
| Linux x86_64 | Use a local terminal and Docker Engine/Compose v2. Follow the dependency checklist below. | Debian 13 verified. Other distributions need distribution-specific package names and remain unverified. |
| Windows x86_64 | Use a Linux x86_64 WSL2 distribution with Docker Desktop's WSL integration. Open the IDE in that WSL environment, clone inside its Linux filesystem (for example `~/projects`), and run every command there. Git Bash/PowerShell is not the Linux runtime. | WSL2 route documented; not executed in the cloud validation. |
| Intel macOS | Use a Linux x86_64 VM with Docker Engine and the IDE's remote/VM terminal. Run tools and services inside that VM; forward frontend/mail ports to the host only as needed. | VM route documented; native macOS supervisor unsupported. |
| Apple Silicon / Linux ARM / Windows ARM | Current candidate requires a Linux x86_64 environment. Explain this constraint before proposing a VM/emulation change. | Native ARM and x86 emulation unverified. Do not claim automatic native support. |

An IDE agent cannot silently supply OS administrator approval, reboot the machine, enable virtualization, install Docker Desktop/WSL or complete an interactive OS installer. Complete independent preparation and request the precise missing system action only if it blocks progress. Do not ask the user to choose routine implementation defaults. Do not invent a successful platform test.

Linux prerequisites: Git, Bash, Python 3.10+, curl, trusted CA certificates, tar, xz, sha256sum, make, g++, OpenSSL runtime and a working Docker daemon/Compose v2 accessible to the user. System Chromium is the verified browser route. On Debian 13, an administrator can install the ordinary prerequisites with:

```sh
sudo apt-get update
sudo apt-get install -y git curl ca-certificates python3 make g++ xz-utils openssl libssl3t64 chromium
```

Docker Engine/Compose must be installed separately using the official installation procedure for that OS. Do not run remote scripts through sudo, loosen Docker socket permissions to world-writable, disable TLS/checksums or replace an existing Docker context. On Ubuntu, use its matching OpenSSL package name. Browser fallback downloads Playwright Chromium/OS dependencies if system Chromium is absent; it needs network/package permissions and remains distinct from the verified system-browser path.

Allocate 4 CPU cores, 16 GiB available RAM for build and 20 GiB free disk. Required ports: frontend 4200, backend 3000, worker health 3002, PostgreSQL 15432, Redis 16379, Temporal 17233/UI 18080, SMTP 11025/Mailpit 18025. One checkout runs at a time. Identify occupied listeners; never kill an unrelated process or change the fixed ports casually (tests/config also depend on them). Internet access is needed for GitHub, nodejs.org, npm, Prisma engines and Docker registries/CDNs. Retain corporate proxy/CA settings and TLS integrity.

## 3. Run one command

From the repository root in that Linux environment:

```sh
bash start-local.sh
```

No system Node/pnpm, provider credentials or copied .env file is needed. The command checks prerequisites; on first run or after a new Git commit it uses the existing checksum/frozen-lock setup to install pinned tools/dependencies, generate private local configuration, start digest-pinned services, apply versioned migrations, seed synthetic fixtures and build the three applications. It stops only checkout-owned apps before rebuilding and preserves private configuration, volumes and existing work. It then starts the services/apps, reapplies idempotent migrations and runs **12 real-service API/browser smoke scenarios** (login, scope denials, persisted draft, actual worker confirmation/rejection, local mail and desktop/mobile browser workspace).

A repeat start on the same commit with intact artifacts reuses the build. A changed Git commit or missing artifact triggers setup again. After editing source without committing, run `bash start-local.sh setup` before starting; the marker is a Git revision marker, not a detector of every uncommitted edit. If setup/build fails, do not write a success marker or start partial output. Correct the actual failure and rerun the command. Start completion requires a successful nonzero-test runner, not just listening ports.

The command leaves apps running. Failed smoke tests remain failures; inspect/redact the relevant private log, fix the diagnosed setup issue and rerun. Do not weaken tests, skip the worker/browser or switch to an upstream image to make a green result. First setup can take several minutes; wait for successful build completion before startup and keep the owner informed.

## 4. Handoff to the tester

Report the actual clone branch/commit, execution OS, successful/failed/skipped checks and process status. Give the local browser address (frontend port 4200, `/auth/login`) and the public demo login `owner-a@example.test` / `LocalFixture123!`. Mailpit inbox is on port 18025. User/role details and the prepare → review → approve → publish → recover walkthrough are in [LOCAL-TESTING.md](docs/agency/LOCAL-TESTING.md).

```sh
bash start-local.sh status   # process ownership/HTTP + Compose status, not functional proof
bash start-local.sh stop     # owned apps/services; keep data
bash start-local.sh          # restart and run smoke checks
bash start-local.sh check    # prerequisite diagnosis
bash start-local.sh setup    # explicit rebuild/install, leaves apps stopped
bash start-local.sh verify   # full acceptance, including disposable restore/replay/restart
```

Do not run the lengthy full acceptance suite just to start the app; the default smoke is sufficient for startup. Full verification adds synthetic test records and restarts services. See [troubleshooting](docs/agency/LOCAL-TESTING.md#troubleshooting-and-reporting), [known issues](docs/agency/KNOWN-ISSUES.md), [source notice](docs/agency/SOURCE-NOTICE.md) and the phase evidence.

## Preserve these boundaries

Private state is generated under ignored `.agency`; never replace its environment file with the reference example or copy secrets from another machine. Keep the matching Compose project/password and media with its database. Do not run inherited `pnpm dev`, `pm2`, production docker-compose, db-push/reset, `down -v`, broad docker prune, package self-updates or automatic upstream pulls. Use pinned source builds and versioned migrations. No package/lockfile edits are needed for ordinary installation. Archive files are historical, not active instructions.

Synthetic mode cannot publish to real social networks. OAuth/connect and other unsafe inherited surfaces remain server-disabled; no production/live readiness claim follows from a successful local run. Setting up for testing does not authorize V2, merging, tagging, publishing images, production deployment or messaging real people.

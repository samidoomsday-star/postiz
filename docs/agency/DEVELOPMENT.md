# Verified development workflow

Phase 0 verified this workflow on Debian 13 x64, Node 22.23.3, pnpm 10.6.1, Docker 28.4.0, 5 logical CPUs and approximately 33 GiB RAM. The default profile uses synthetic accounts/providers and an isolated database. Live social-account access has not been tested.

## Install and run

From the repository root:

```sh
bash scripts/agency/setup.sh
bash scripts/agency/with-env.sh python3 scripts/agency/runtime.py start
bash scripts/agency/with-env.sh pnpm test
bash scripts/agency/with-env.sh pnpm exec playwright test --config playwright.agency.config.ts
bash scripts/agency/with-env.sh pnpm run lint:agency
bash scripts/agency/with-env.sh pnpm run typecheck:agency
```

`setup.sh` downloads the exact Node version with official SHA-256 verification, installs pinned pnpm, preserves private local configuration, performs a frozen dependency install, starts digest-pinned services, initializes only the isolated synthetic database, seeds fixtures and builds frontend/backend/orchestrator. Run it with apps stopped before rebuilding. It was exercised after an earlier frozen install/build and reused the preserved test data successfully. Phase 1 replaces synthetic db-push bootstrap with versioned migration deployment.

Chromium 154 installed in the cloud was used with Playwright 1.58.2. The harness can use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` explicitly. On a machine without system Chromium, setup invokes Playwright's supported Chromium/dependency installation; that branch requires download access and appropriate OS package permissions. GitHub CI uses Playwright's bundled Chromium. CI configuration is committed; a queued workflow is not local evidence of a CI pass.

The supervisor records only its own Linux process groups and refuses an occupied unrecorded port. It handles process-title changes, PID reuse and exited/zombie children. These scripts are currently verified on Linux; do not claim macOS/Windows compatibility.

## Configuration, services and fixtures

`.agency/environment.env` is generated with mode 0600. Never commit it. It contains locally generated database/JWT secrets and synthetic-only settings, with no real provider credentials. `configure.py` preserves existing values and adds missing nonsecret required defaults. `IS_GENERAL=true` enables the documented Postiz UI mode; `MAIN_URL` and the three backend/frontend URL settings use the local frontend/backend addresses.

| Component | Local port | Persistent state |
| --- | --- | --- |
| Frontend | 4200 | build in apps/frontend/.next |
| Backend | 3000 | PostgreSQL/storage |
| Orchestrator | 3002 | Temporal task state |
| PostgreSQL 17.6 | 15432 | owned Compose volume |
| Redis 7.4.5 | 16379 | disposable development cache |
| Temporal CLI/server dev mode 1.4.1 | 17233 (UI 18080) | owned SQLite volume |
| Mailpit 1.27.8 | SMTP 11025, UI/API 18025 | local mail sink |

Compose service ports bind loopback. Temporal development mode is local-only and is not a production topology. Its volume initializer sets the server's expected ownership; local gRPC addresses are appended to NO_PROXY without disabling the outbound proxy. Full worker functionality is verified by publication/mail tests, not solely health HTTP responses.

The seed provides Agency A/B, two clients/channels per agency, and owner/editor users. Demo emails are `owner-a@example.test`, `editor-a@example.test` and equivalent B identities; password `LocalFixture123!` is an intentionally public synthetic fixture. At the Phase 0 baseline, `synthetic-api-a/b` are test organization credentials; subsequent phases must rotate/disable legacy keys and update fixtures accordingly. All providers are replaced with the local synthetic provider when explicit test mode is enabled. The provider refuses live credentials and writes synthetic side-effect evidence to `.agency/results/provider-calls.jsonl`.

## Build and targeted verification

```sh
bash scripts/agency/with-env.sh pnpm run build
bash scripts/agency/with-env.sh pnpm exec tsc --noEmit --project apps/backend/tsconfig.build.json
bash scripts/agency/with-env.sh pnpm exec tsc --noEmit --project apps/frontend/tsconfig.json
bash scripts/agency/with-env.sh pnpm run test:integration
bash scripts/agency/with-env.sh pnpm run test:browser
bash scripts/agency/with-env.sh node scripts/agency/inventory.mjs
python3 scripts/agency/plan.py check
```

The legacy Jest/Nx configuration references an undeclared package and is not the supported runner. `pnpm test` now runs the scoped Vitest harness with nonzero-test enforcement. External provider boundaries are fake; PostgreSQL, HTTP auth, Temporal workers, email delivery and browser pages are real. Source and test type checks plus scoped lint run separately. Test artifacts/logs under .agency are private local outputs; phase reports retain durable sanitized summaries.

The same licensed font family/styles are bundled locally; builds no longer download Google Fonts. OFL license and checked npm artifact provenance accompany the files. The only dependency graph change in Phase 0 is making the already locked Playwright 1.58.2 package a direct development dependency. The Volta pin now matches .nvmrc; Prisma generation uses the locally locked CLI instead of a second dlx resolution.

## Stop, restart and safety

```sh
bash scripts/agency/with-env.sh python3 scripts/agency/runtime.py stop
bash scripts/agency/with-env.sh docker compose -f compose.agency.yaml stop
bash scripts/agency/with-env.sh docker compose -f compose.agency.yaml up -d --wait
bash scripts/agency/with-env.sh python3 scripts/agency/runtime.py start
```

This was rehearsed with persisted fixture data and followed by the full API/browser suite. Do not add `-v`, volume removal, prisma-reset or force/data-loss options. The inherited production Compose references a moving upstream app image; do not use it to run the derivative. Unknown running processes are preserved.

For diagnostics inspect `.agency/logs/{backend,orchestrator,frontend}.log`; use backend `/auth/can-register`, orchestrator `/health/status` and Temporal cluster health as prerequisites, then execute functional tests. Retry an installation failure only after isolating the cause. In a restricted cloud environment, Prisma requires `binaries.prisma.sh`; GitHub PR operations require `api.github.com`. Keep TLS and artifact verification enabled. Browser/font network requirements can be avoided using installed Chromium and the committed local font.

## Migration handoff and limitations

[upstream-schema.sql](evidence/upstream-schema.sql) records the Prisma 6.5.0 schema diff from empty at the pinned baseline. It is schema-only design evidence, not a migration applied to customer data. Phase 1 must establish versioned migrations, baseline existing databases only after comparing actual schema, preserve Mastra-owned tables, quarantine ambiguous assignments and rehearse recovery/restore. See the decision log.

Phase 0 creates no client permissions, approval enforcement or action dashboard. The baseline remains suitable for isolated development. All real provider/account/media-form readiness remains unverified. Phase 6 owns an independently cloneable local release candidate and OS compatibility claims from actual tests.

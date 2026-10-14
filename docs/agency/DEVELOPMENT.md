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

`setup.sh` downloads the exact Node version with official SHA-256 verification, installs pinned pnpm, preserves private local configuration, performs a frozen dependency install, starts digest-pinned services, initializes only the isolated synthetic database, seeds fixtures and builds frontend/backend/orchestrator. Run it with apps stopped before rebuilding. It was exercised after an earlier frozen install/build and reused the preserved test data successfully. Phase 1 now deploys versioned migrations; it never uses db-push for setup. See MIGRATIONS.md.

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

The seed provides Agency A/B, two clients/channels per agency, and owner/editor/reviewer users. Demo emails are `owner-a@example.test`, `editor-a@example.test` and equivalent B identities; password `LocalFixture123!` is an intentionally public synthetic fixture. Legacy `synthetic-api-a/b` organization keys are disabled. The seed gives owners explicit editor/publisher/reviewer grants and editors only Client 1 access. Random scoped test credentials are stored only in ignored `.agency/fixture-access.json` (0600); the test suites read that file. Never copy these keys into documentation. All providers are replaced with the local synthetic provider when explicit test mode is enabled. The provider refuses live credentials and writes synthetic side-effect evidence to `.agency/results/provider-calls.jsonl`.

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

## Migration and staged limitations

Versioned migration deployment and recovery are documented in [MIGRATIONS.md](MIGRATIONS.md). The migration rehearsal includes interrupted-connection recovery, ownership quarantine, queue pausing, replay and snapshot restore. Production/customer schema migration and live providers remain outside the verified local workflow.

The current authenticated entry is `/agency`. It supports scoped retained editing/calendar, immutable revision review, approved scheduling and private local media uploads/snapshots. Owners manage client access; reviewer-only staff see assigned internal reviews. See [APPROVALS.md](APPROVALS.md) for commands, state/race semantics and staged UI limitations. Legacy HTTP/MCP/widgets/previews/analytics and unsupervised automations remain denied. Verified client invitations and the weekly `/review` portal are implemented in Phase 3; see [REVIEW-PORTAL.md](REVIEW-PORTAL.md). Dashboard recovery remains Phase 4, provider contracts/hardening Phase 5, and independent-clone release verification Phase 6.

Additional Phase 2 verification (with apps running except where the restart script owns shutdown/startup):

```sh
bash scripts/agency/with-env.sh node scripts/agency/replay.mjs
bash scripts/agency/with-env.sh node scripts/agency/restart-approval.mjs
```

Replay consumes persisted synthetic Temporal histories without executing activities. Restart verifies a persisted approved queue reaches exactly one confirmed provider receipt. Wait for a build command to finish successfully before starting apps; a partial emitted worker directory is not runnable build evidence.


## Testing the client portal locally

Sign in as the synthetic owner in `/agency`, choose Client 1, and send an invitation to a `.test` address. The local Mailpit UI/API (port 18025) contains the invitation link and separately requested verification code. Prepare and submit a draft to that reviewer, verify in a separate browser context, decide the exact revision, then schedule as an authorized staff publisher. The portal session cannot sign in to the ordinary staff API or automatically publish.

```sh
bash scripts/agency/with-env.sh pnpm exec playwright test tests/agency/review.api.spec.ts tests/agency/review.browser.spec.ts --config playwright.agency.config.ts
```

All test messages/identities/media are synthetic. No real social or email account is needed for this workflow, and missing real email delivery never enables unverified access. The existing setup/start commands generate/deploy the additional migration and build the new root layout; no new dependency or external service is required.

## Phase 4 operator checks

Open the action dashboard from the client workspace. See [ACTION-DASHBOARD.md](ACTION-DASHBOARD.md) for truthful statuses and the manual recovery path. The synthetic suite uses a two-second due/stall grace; the production projection uses two minutes. This shorter test threshold changes observation timing only, never dispatch eligibility or receipt truth.

Use `bash scripts/agency/with-env.sh python3 scripts/agency/runtime.py status --worker-only` for the checkout-owned worker. `stop/start --worker-only` preserves the HTTP API for diagnosis and uses the existing ownership checks. Do not equate HTTP liveness with polling; the actual tests stop the worker, observe overdue READY work, restart it and require one confirmed synthetic mutation.

Run the Phase 4 API/browser cases with `bash scripts/agency/with-env.sh pnpm exec playwright test --config playwright.agency.config.ts tests/agency/action.api.spec.ts tests/agency/action.browser.spec.ts`; builds must finish before starting apps/tests. The unsupported provider case injects only an inert external contract into the compiled service while using real PostgreSQL policy/evidence. Browser journeys capture synthetic screenshots under docs/agency/evidence/screenshots; private traces/logs remain ignored.

## Phase 5 hardening tools

After the production build and actual services are ready:

```sh
bash scripts/agency/with-env.sh node --experimental-require-module scripts/agency/restore-media.mjs
bash scripts/agency/with-env.sh node scripts/agency/races.mjs
bash scripts/agency/with-env.sh node scripts/agency/advisories.mjs
```

The first two use only the local synthetic environment and private fixture logs. Race seeds select suite order; OS/network interleaving is observed, not deterministic. Each iteration must execute nonzero tests and have no unexpected, skipped or flaky outcomes. The advisory command audits the entire lock and records exact version matches; review reachability using [HARDENING.md](HARDENING.md) and the dependency evidence before deciding release impact. It does not equate audit totals with exploitable app paths or produce a zero-advisory claim. The performance profile and its topology/limits are documented in HARDENING.md; do not run it while another process owns the same ports.

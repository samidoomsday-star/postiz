# Phase 0 — Baseline and test foundation

Status: complete
Started: 12 October 2026; completed: 13 October 2026 (Asia/Dhaka).
Base commit: 7b0e720df24fd7ca55d0aa092fa7e073be02b3e1
Branch: phase/0-baseline
Tested precommit source tree: dbe164ec0f6c6beb422d6b1fb1796952171e48a8 (evidence/state documentation subsequently updated).
Requirement: V1-BASE-001. Acceptance: T00-01, T00-02, T00-03, T00-04.

## Result and implementation

Installed the supported exact toolchain and verified frozen installation/code generation. Prepared digest-pinned PostgreSQL, Redis, persistent Temporal development mode and Mailpit. Built and started the actual frontend, backend and orchestrator. Added isolated synthetic fixtures/provider and meaningful unit/API/browser tests, safe application supervision, scoped lint/types, runnable setup and build/test CI. Client permissions, approvals and dashboard implementation were not included in this phase.

The mutation double records each accepted call separately, so duplicate mutation calls cannot be hidden by fake idempotency. It refuses live identities/credentials and nonlocal/customer databases. Test-mode provider registration replaces the real provider list. Synthetic journal receipts are compared with actual database publication state/release IDs after the real Temporal worker consumes work.

## Executed evidence

Working directory: /workspace/postiz. Tool versions: Node 22.23.3, pnpm 10.6.1, Prisma 6.5.0, Vitest 3.1.4, Playwright 1.58.2, Chromium 154.0.8037.57, Docker 28.4.0. Host: Debian 13 x64, 5 logical CPUs, approximately 33 GiB RAM. All external social providers are mocked; database, Redis, Temporal, HTTP authentication, SMTP sink and browser rendering are real.

| Case/check | Executed command | Result and durable summary |
| --- | --- | --- |
| T00-01 | bash scripts/agency/setup.sh | Exit 0; supported bootstrap, frozen install, Prisma generate, isolated DB/seed and all three required builds completed. This followed an earlier install/build; artifacts/logs: .agency/setup-complete-run.log and install-final.log. |
| T00-02 | bash scripts/agency/with-env.sh pnpm test | Exit 0; 12/12 unit tests passed, 0 failed/skipped. Refusal cases, Unicode receipt evidence, duplicate-call visibility, known rejection, pending result and response-loss reconciliation exercised. JSON: .agency/results/unit-results.json. |
| T00-02 | bash scripts/agency/with-env.sh pnpm exec playwright test --config playwright.agency.config.ts | Exit 0; 12/12 passed (9 API/service + 3 browser), 0 failed/skipped. Real login; key denial; org/channel isolation; draft save/list; empty-content denial; worker publication with one acceptance and matching receipt; republish denial; known-failure ERROR; actual mail delivery; desktop/mobile login; persisted draft rendered through actual calendar expansion. Log: .agency/phase0-all-final.log (13.4s). |
| T00-03 | Unit refusal cases + registered-provider/API checks in the above suites | Passed. No live credentials, live account identities or real provider registry are accepted in the default test profile. Synthetic provider makes no HTTP calls; tests assert that boundary. This is not live-provider verification. |
| T00-04 | runtime.py stop; docker compose stop; docker compose up -d --wait; runtime.py start; full Playwright command above | Exit 0; all 12 API/browser tests passed again (13.1s), 0 failed/skipped, after restarting all owned apps/services without removing volumes or resetting data. Logs: .agency/phase0-after-restart.log. Database/Temporal fixtures and mutation journals retained. |
| Supervisor safety | Temporarily remove only its private registry; attempt start with occupied ports; restore registry | Expected refusal with nonzero exit and no process kill. Registry unchanged. Repeated normal start retained all three owned PIDs and passed readiness. |
| Types/lint | pnpm run lint:agency; pnpm run typecheck:agency through with-env.sh | Exit 0. New test/provider/helper/config code checked. Frontend and backend no-emit checks also passed; required builds type-checked services. Logs: .agency/phase0-lint-final.log, phase0-test-types-final.log, frontend-typecheck.log, backend-typecheck.log. |
| Inventory/design | node scripts/agency/inventory.mjs; prisma migrate diff --from-empty --to-schema-datamodel ... --script | Exit 0. 344 documented surfaces; all source paths and enforcement/case references verified. Schema-only SQL and migration/media/dispatch ADRs prepared for Phase 1. |
| Repo consistency | plan.py check; git diff --check; Compose config --quiet; Python parsing/bash syntax checks | Passed. Application claims above come from executed behavior, not the plan checker. |

The initial integration run was 8 passed/1 failed because the test expected a later controller's empty-content wording; actual DTO rejection occurred earlier. The corrected check still asserts 400 and unchanged database count; focused retest and full suites passed. The initial draft browser assertion missed the calendar's normal three-items-per-hour cap. It now exercises the existing Show more control and asserts both server inclusion and visible content; focused and full retests passed. Neither issue required an app feature change or weaker behavioral assertion.

## Baseline corrections and review

- Node/Volta/cloud version mismatch resolved with verified local tools; cache paths relocated into .agency. Nested pnpm calls use the pinned binary.
- Undeclared @nx/jest made the inherited test entry point fail before discovering tests. Supported pnpm test now uses Vitest; raw legacy Jest configuration is not supported.
- Prisma engine downloads initially met cloud policy denial; required official destination was added and generation succeeded with verification enabled. No checksum/TLS bypass used.
- Temporal initially lacked writable volume ownership, then sent its internal local gRPC traffic through the proxy. Owned-volume initialization and local-only NO_PROXY additions fixed both; sustained worker tests/restart passed.
- Google font build download was blocked. Same-family variable fonts are vendored from a verified npm artifact with OFL/provenance retained, allowing an offline font build.
- Installed Chromium was discovered and functionally verified; additional browser/font download destinations were removed from the cloud draft. No external provider credentials are required.
- Supervisor handles Next process titles, protected proc links and zombie children while checking recorded start tick/UID/process group. Only recorded owned processes are signaled; occupied unrecorded ports are refused.

Reviewed final changes for secret exposure, source/license preservation, unsafe bootstrap commands, fake publication boundaries, unintended dependency refresh and scope creep. Only the already locked Playwright package became a direct dev dependency (three lockfile importer lines); automatic peer refresh changes were discarded. No upstream main merge, existing workflow edit or schema feature change occurred. Main-vs-release research difference was one Instagram error message, documented in ADRs.

## Reusable configuration, limitations and next work

Saved tested install_script/start_skill plus required binaries.prisma.sh/api.github.com destinations. Draft persistence is confirmed; platform snapshot publication and a future-machine run are separate and not claimed. Build/test CI is committed; its hosted result is checked separately after push.

No live publishing, provider app approvals, performance benchmark, customer-data migration or production readiness claim. Existing Postiz client/approval/privacy gaps remain work for the authorized later phases. Phase 1 must replace synthetic db-push bootstrap with versioned migrations, implement scoped access and protect/disable legacy/public bypass paths. User explicitly requested finishing Phase 0 and starting the next phase on 13 October, so Phase 1 is authorized after this gate.

# Phase 2 — Revision approvals and dispatch enforcement

Status: complete
Started/updated (UTC): 2026-10-13; final acceptance began 09:55:26.121Z.
Base: `phase/1-client-access` at `57b5a4f601c3ba4de4c7d3855cd59d10b7ea411f`; PR #2 remains unmerged.
Tested precommit implementation/test/migration/tooling identity: SHA-256 `98d55192bcf1ffecadc7cc43276ca9d7d275f1d25b8c94ae8c3627e25b4dd304`. Private `.agency/phase2-tested-source.json` lists the source paths used for this digest. Application code is delivered with the Phase 2 commit; GitHub handoff is recorded below after creation.
Branch: `phase/2-approvals`. Phases 3–6 remain planned.

## Scope and completed work

V1-APR-001, V1-APR-002 and V1-APR-003: immutable exact publishable revisions, assigned internal review decisions, enforced approvals, current-grant scheduling and atomic dispatch claims. Retained editor/calendar/private media integration is the required Phase 2 prerequisite from ADR-011; it does not add V2 general API/MCP parity. No external invitation portal or agency action dashboard was built.

- Final per-channel copy/settings/account/time and ordered media/parts are frozen and canonically hashed. Decisions, snapshots, revisions and actor-scoped command effects are append-only. New edits create new revisions and Post IDs; stale decisions/operations conflict.
- Explicit reviewer permission and assignment are required. Automation cannot approve; owner role alone does not authorize approval. Current publisher/reviewer grants, expiry, channel/account ownership and source/snapshot bytes are checked at eligibility boundaries.
- Scheduling uses retained V112 workflows with USE_EXISTING signals. Atomic claims serialize against edit/revoke; no lock spans the provider call. Delayed parts and pending finalization have independent current-policy claims. Replay/redelivery cannot repeat claimed/unknown mutations. Confirmed receipts preserve truthful published projection.
- Source-media changes invalidate review/scheduling; private immutable snapshots are authenticated for reviewers and fetched by providers through bounded snapshot/dispatch capabilities. Final provider calls receive frozen copy/bytes. Capabilities and raw pending provider data are absent from public projections/journals.
- `/agency` reuses Postiz's rich editor and month calendar for the scoped internal draft/review/schedule flow. Advanced provider-specific/multipart options remain available through the validated scoped API; the minimal internal first-part editor preserves later parts/settings. Exact state/API and staged UI limits are in [APPROVALS.md](../APPROVALS.md).
- Every inventoried legacy ingestion/publishing/automation surface is gated at shared activities or server-disabled. Repeats, RSS, plugs, mutable legacy scheduling, public previews and MCP stay closed. No workflow-version source was changed.

## Executed checks

All commands ran from `/workspace/postiz`, on 2026-10-13, with pinned Node 22.23.3/pnpm 10.6.1, real local PostgreSQL/Redis/Temporal/Mailpit/HTTP services and system Chromium. Only the synthetic external provider was enabled; no live social account calls occurred. Commands below use `bash scripts/agency/with-env.sh` unless explicitly stated otherwise.

| Gate | Executed command | Exit and result | Evidence |
| --- | --- | --- | --- |
| Resumed baseline | `pnpm exec playwright test --config playwright.agency.config.ts` before Phase 2 changes | 0; 33 passed | `.agency/phase2-baseline.log` |
| Build | `pnpm run build`; final changed backend/orchestrator `pnpm --filter ./apps/backend run build` and `pnpm --filter ./apps/orchestrator run build` | 0; frontend/backend/orchestrator production builds completed; apps started only after final completed builds | `.agency/phase2-build-final.log`, `phase2-backend-release.log`, `phase2-worker-release.log`, `phase2-start-release.log` |
| Unit/policy/hash/provider | `pnpm test` | 0; 17 passed across 3 files; 0 failed/skipped | `.agency/phase2-unit-release.log`; `.agency/results/unit-results.json` |
| Final API/browser acceptance | `pnpm exec playwright test --config playwright.agency.config.ts` | 0; **51 passed** (44 API, 7 browser), 0 failed/skipped/flaky; 111.7s; started 09:55:26.121Z | `.agency/phase2-verification-final.log`; `.agency/results/integration-results.json`; synthetic provider journal |
| T02-01 | Unapproved/internal owner/credential/foreign-resource tests; exhaustive legacy route regression in the executed suite | Owner without explicit reviewer denied, credentials cannot approve, drafts/direct legacy jobs produce zero provider calls; assigned reviewer has no raw draft access | `approval.api.spec.ts`, `access.api.spec.ts` |
| T02-02 | Executed immutable revision/material-edit/media tests plus retained browser edit/review flow | Copy/settings/time changes supersede decisions; SQL material/history edits rejected; source-byte tampering persists INVALIDATED and makes zero calls; private/range/expiry/tamper/foreign media checks pass; failed media edit cleans uncommitted copies | `approval.api.spec.ts`, `approval.browser.spec.ts`, `revision.unit.test.ts` |
| T02-03 | Executed concurrent edit/approve, two-writer and edit/schedule tests | One current revision or 409 conflict; superseded revision makes zero mutations | `approval.api.spec.ts` |
| T02-04 | Executed claim/revoke order and current grant/account tests | Revoke first → zero mutations; claim first → truthful inFlight and one confirmed frozen mutation. Revoked publisher key/reviewer and changed account prevent dispatch | `approval.api.spec.ts`, `access.api.spec.ts` |
| T02-05 | Duplicate commands/redelivery and provider/database failure injection | One decision/dispatch/mutation; known rejection has no acceptance; lost response and real SQL receipt-write failure after acceptance stay UNKNOWN without second mutation; pending probe is read-only | `approval.api.spec.ts`, provider journal |
| T02-06 | Delayed thread cancellation, pending finalization race and legacy automation denials | Retain confirmed first part; canceled child makes zero calls. Valid finalization claims once; revoke before finalize makes zero finalization mutations and terminates promptly. Repeats/RSS/plugs remain disabled | `approval.api.spec.ts`, `access.api.spec.ts`, inventory review |
| Persisted Temporal replay | `node scripts/agency/replay.mjs` | 0; **6 histories** replayed, covering UNKNOWN/PENDING/FAILED/CONFIRMED; replay executes no activities | `.agency/phase2-replay-release.log` |
| Worker/app restart | `node scripts/agency/restart-approval.mjs` | 0; persisted approved queue survives owned app/worker shutdown/start and produces **exactly one** confirmed synthetic mutation | `.agency/phase2-restart-release.log` |
| Migration/restore | `node scripts/agency/migrate.mjs`; `python3 scripts/agency/rehearse-migration.py` | 0; five migrations deployed; **12 gates** passed, including Phase 2 connection interruption rollback, immutable history and real revision/decision/UNKNOWN-receipt dump/restore | `.agency/phase2-structure-migrate.log`, `.agency/phase2-restore-final.log` |
| Static/type checks | `pnpm run lint:agency`; `pnpm run typecheck:agency`; backend/orchestrator `tsconfig.build.json` and frontend `tsconfig.json` no-emit checks | 0; no errors | `.agency/phase2-lint-delivery.log`, `phase2-test-types-release.log`, `phase2-*-types-delivery.log` |
| Entry/source/state review | `node scripts/agency/inventory.mjs`; `git diff --check`; `python3 scripts/agency/plan.py check` | 0; 375 static surfaces (270 HTTP; 11 MCP transports; 20 tools; one media-byte handler; 33 provider bindings; 18 worker/service boundaries; 22 workflows). State/traceability consistent; static coverage is not runtime certification | `entry-paths.csv`; `.agency/phase2-inventory-release.log` |

CI now includes replay/restart as well as migration and API/browser gates. This records local execution; no hosted GitHub CI pass is claimed. Private local logs/artifacts are intentionally ignored, not uploaded as customer-facing evidence.

## Defects and review

[Seven resolved findings and harness corrections](bugs/phase-2-fixes.md) are recorded in `defects.csv`. The initial media-context test failure used authenticated cookies; the corrected test creates an anonymous context and retains strict denial assertions. Browser/calendar accessibility and asynchronous selection failures were fixed. Finalization policy denial no longer enters transient polling. Unknown receipts and confirmed publication are never downgraded to a safe retry.

Reviewed all changed ingestion/dispatch/finalization paths, current and assigned reviewer authorization, actor-scoped idempotency, per-agency lock ordering, exact-revision claims, partial-thread cancellation, receipt uncertainty, immutable source/snapshot integrity, provider capabilities/ranges, audit and pending-data projections, migration preservation/rollback, static entry coverage and V2 boundaries. No unresolved Phase 2 severity 0/1/2 defect remains. Lockfile, package/dependency versions, upstream pin, workflow-version source and AGPL notices are unchanged.

## Migration and operational consequences

See [MIGRATIONS.md](../MIGRATIONS.md), [DEVELOPMENT.md](../DEVELOPMENT.md) and ADR-012. Three additive Phase 2 migrations add review/revision/command/dispatch/snapshot storage, policy locks and immutable Post structure. Old queues are paused, never auto-approved. Restore preserves database history/uncertain receipts; private snapshot files must be restored with the original media and compatible application. Revision test cleanup archives its channels rather than deleting immutable history. No customer database or persistent service volume was discarded.

## Limits and next phase

This is an intermediate V1 development phase, not the full local release candidate. External verified invitations/portal are Phase 3; action dashboard and safe exception resolution Phase 4; provider-specific live OAuth/contracts, performance and security hardening Phase 5; independent-clone handoff Phase 6. Local private storage is the verified media profile. Synthetic evidence does not prove live platform compatibility, app approval or undoing a provider mutation that already won a claim. All V2 enhancements remain deferred.

Phase 2 is complete. Next eligible prompt: **Start phase 3**. Continue from this tested branch if earlier phase PRs are still unmerged; do not treat origin/main as containing them.

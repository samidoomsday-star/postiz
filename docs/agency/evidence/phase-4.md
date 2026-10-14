# Phase 4 — Agency action dashboard and safe recovery

Status: complete
Started/updated (UTC): 2026-10-13; final acceptance started 15:22:57.512Z.
Base: `phase/3-client-review` at `b052549fb22a9184e3d5be375cfbbcbcd522aaf8`; draft PR [#4](https://github.com/samidoomsday-star/postiz/pull/4) remains unmerged (GitHub checked this turn).
Tested implementation/test/migration/tooling identity: SHA-256 `326104f1a033bb9640f03af147117c78f4b5148a9ae5ca334e8de07242f544ea`. Private `.agency/phase4-tested-source.json` lists its 27 sorted source paths and algorithm; documentation/screenshots are excluded.
Tested/delivered implementation commit: `24f14f5792092df554f8d635d958268fe7ddae1b`.
Delivery: branch `phase/4-action-dashboard`, pushed to origin. Draft PR [#5](https://github.com/samidoomsday-star/postiz/pull/5) against main, attached to the task. Earlier phase PRs remain unmerged; the incremental Phase 4 base is recorded above. No PR was merged. This documentation-only follow-up records delivery without changing tested source.

## Scope and completed implementation

V1-DASH-001, V1-DASH-002, V1-DASH-003. The operator queue reuses immutable revisions, review policy and dispatch facts; it adds no competing publishing engine, notification platform or V2 enhancement.

- `/agency/actions` lists exact permitted revisions with client/owner/state/urgency filters and 20-item pages. SQL verifies readable client identity and every target's current agency/client binding before filtering/counts/pagination. Moved channels cannot carry old client metadata into another client scope. Historical dispatch revisions retain their factual outcomes when still readable.
- Detail shows frozen copy/account/time/timezone, exact revision hash, per-target/part/stage receipts, safe receipt URLs, last update, audit history and permitted next actions. Saved, scheduled, processing, confirmed, failed, unknown and partial outcomes remain distinct. Revocation, lost approval permissions, disconnection, overdue READY work and stale claims have explicit reasons.
- Nonmaterial owner/acknowledgment/dismissal/note records are versioned and scoped. Only eligible current staff readers can be assigned. Dismissal needs a note and never changes receipts or hides failed/unknown results. Review sessions and credentials cannot operate the staff dashboard.
- Read-only reconciliation records positive provider evidence or leaves processing/unknown/unsupported/unavailable outcomes unresolved. It never finalizes or resends. Later deliberate UI checks use fresh operation IDs; duplicate in-flight requests remain serialized.
- A single-part FAILED target can retry only after an explicit provider no-side-effect proof, a closed earlier workflow and current exact approval/media/account/publisher checks. Immutable evidence preserves the old attempt; SQL gates monotonic rearming. A unique attempt execution uses retained V112; earlier executions cannot consume it or overwrite its receipt. Successful targets remain untouched.
- Resume applies only to wholly unclaimed targets, reauthorizes the current publisher, audits the action/originating authority and pokes retained workflows without termination. Cancel preserves already claimed/confirmed results. A stopped worker yields stalled queue facts despite healthy HTTP; restoration must produce a real receipt.
- Seventh additive migration adds action/evidence storage and attempt guards, preserving existing receipts at attempt 0. No workflow-version source or dependency version changed. Existing cloud setup remains sufficient; no configuration draft or new credential/service requirement was needed.

## Executed checks

Commands ran from `/workspace/postiz`, 2026-10-13, with Node 22.23.3, pnpm 10.6.1, Prisma 6.5, Playwright 1.58.2, Vitest 3.1.4 and Chromium 154. PostgreSQL/Redis/Temporal/Mailpit/application HTTP services were real local services. Only the synthetic external provider was enabled. Prefix runtime commands below with `bash scripts/agency/with-env.sh`.

| Gate | Command / coverage | Executed result | Artifact / source |
| --- | --- | --- | --- |
| Resumed baseline | `pnpm exec playwright test --config playwright.agency.config.ts` before implementation | 0; 67 passed | `.agency/phase4-baseline.log` |
| Build/start | `pnpm run build`; final frontend build and final changed backend/orchestrator builds, then owned runtime start | 0; complete production builds, apps started only after completion | `.agency/phase4-build-final.log`, `phase4-frontend-delivery.log`, `phase4-backend-scope.log`, `phase4-worker-scope.log`, `phase4-start-scope.log` |
| Unit | `pnpm test` | 0; 27 passed across five files, zero failed/skipped | `.agency/phase4-unit-final.log`; outcome projection, real inherited unsupported capability, synthetic read-only/no-side-effect contracts |
| T04-01 | Executed scoped list/filter/page/count, moved-channel, current grant and status tests | Scope before count/page; invalid/repeated filters denied; empty later-page count preserved; old client metadata absent after channel moves; review/change/invalidation/block states factual | `action.api.spec.ts`; `.agency/phase4-scope-regression-fixed.log` |
| T04-02 | Real worker/channel success plus proved rate-limit rejection; concurrent/repeated retry | Successful receipt retained, only failed target rearmed, one accepted mutation per target; unsupported/multi-stage/uncertain targets cannot retry; FAILED label without proof denied | `action.api.spec.ts`; synthetic journal |
| T04-03 | Accepted timeout, real SQL receipt-write failure, processing upload, unsupported/missing evidence and browser checks | Unknown never resends; positive read-only evidence confirms once; processing upload stays unresolved; unsupported contract uses real DB policy/evidence with an inert external provider; later UI checks obtain fresh evidence | `action.api.spec.ts`, `action.browser.spec.ts`, synthetic unit cases |
| T04-04 | Same/different operation races, reconcile/cancel, retry/cancel, stale workflow and revoked grant | Stable command effects and append-only evidence/audit; exact current authority before cached responses; old execution cannot claim new attempt; acknowledgment remains nonmaterial | `action.api.spec.ts` |
| T04-05 | Disconnection, revoked queued credential, stopped worker while HTTP stays healthy, restoration | Zero mutations while blocked/stopped; explicit current-publisher resume reassigns only unclaimed authority; restarted worker confirms once; no health-only published claim | `action.api.spec.ts`; owned `runtime.py --worker-only` |
| Targeted operator UI | `pnpm exec playwright test --config playwright.agency.config.ts tests/agency/action.browser.spec.ts` after final reconciliation UI fix | 0; four passed: desktop, 360px keyboard, unknown/no resend, processing→fresh evidence | `.agency/phase4-browser-delivery.log` |
| Final fixture/legacy regressions | Targeted mapping/provider-baseline/retained-approval journey | 0; three passed; retained approval journey 44.2s with all state assertions | `.agency/phase4-fixture-regression-final.log` |
| Migration/restore | `node scripts/agency/migrate.mjs`; `python3 scripts/agency/rehearse-migration.py` | 0; seven migrations applied; 22 gates passed, including interrupted Phase 4 rollback, proof/scope/version/immutability guards and real action/recovery dump/restore | `.agency/phase4-migrate.log`, `phase4-migration-rehearsal.log` |
| Persisted replay | `node scripts/agency/replay.mjs` with corrected executed-history selection | 0; six actual UNKNOWN/PENDING/FAILED/CONFIRMED histories; no activities, unchanged workflow source | `.agency/phase4-replay-final.log`; latest replay result recorded below |
| Lint/types | `pnpm run lint:agency`; `pnpm run typecheck:agency`; backend/orchestrator build-tsconfig and frontend tsconfig no-emit | 0; no errors; provider interface included in lint coverage | `.agency/phase4-lint-delivery-final.log`, `phase4-test-types-delivery-final.log`, `phase4-*-types-scope.log`, `phase4-frontend-types-final.log` |
| Staged private-value/source scan | Compare staged source with tested digest and private JWT/fixture credential values | 0; 43 task files staged; no private artifacts or credential values; exact source digest matches | `.agency/phase4-staged-scan.log` |
| Privacy/source inventory | Runtime log scan; `node scripts/agency/inventory.mjs`; `git diff --check` | 0; three application logs contain no raw scoped credential/invitation secrets; 397 static surfaces (292 HTTP, 11 MCP transports, 20 tools, 33 provider bindings, 18 worker/service boundaries, 22 workflows, one media handler) | `.agency/phase4-log-redaction.log`, `phase4-inventory-release.log`; static inventory is not runtime certification |
| Final complete regression | `pnpm exec playwright test --config playwright.agency.config.ts` | 0; **88 passed** (75 API, 13 browser), zero failed/skipped/flaky; started 15:22:57.512Z, duration 459.695s | `.agency/phase4-complete-suite.log`, `phase4-complete-suite-stats.json` |
| Final replay | `node scripts/agency/replay.mjs` | 0; six actual histories across all four outcomes; two unexecuted fixture candidates excluded; actual retry IDs included | `.agency/phase4-replay-release.log` |
| Owned app/worker restart | `node scripts/agency/restart-approval.mjs` | 0; persisted approved queue survives shutdown/start with **exactly one confirmed synthetic mutation**; all HTTP services ready afterward | `.agency/phase4-restart-release.log` |

 Earlier full failures and fixes are retained in the defect report. CI already includes unit/API/browser/migration/replay/restart gates; no hosted GitHub CI pass is claimed. Private logs, mailbox data, credentials, traces and provider journals remain ignored.

## Actual browser evidence

The screenshots contain synthetic identities/content only and were captured by the tested browser flow:

- [Desktop partial](screenshots/phase-4-desktop-partial.png) and [confirmed completion](screenshots/phase-4-desktop-published.png).
- [360px partial](screenshots/phase-4-mobile-partial.png) and [confirmed completion](screenshots/phase-4-mobile-published.png).

The mobile journey verifies no horizontal overflow, explicit labels, enabled/focused keyboard activation, escaped investigation text, truthful acknowledgment and preserved successful receipts. The refreshed processing journey proves two distinct read-only operations and one provider mutation.

## Defects and review

[Seven resolved findings and harness/runtime corrections](bugs/phase-4-fixes.md) are mapped in `defects.csv`. Important fixes include exact client/channel list binding after reassignment, attempt-specific stale-workflow exclusion, processing-vs-publication proof, versioned/count-consistent projections, accessible selects and fresh deliberate reconciliation IDs. Fixture cleanup preserves every immutable history while revoking only temporary editor grants and restoring only test-owned channel bindings. Baseline fixtures now select their named client grant. Longer complete browser journeys use a 120-second total allowance, keeping their state assertions; this is not a performance acceptance claim.

Reviewed authorization before query/idempotency, every target's current scope, per-target receipt/result projection, current grants/approval/media/account at recovery, cancellation/claim ordering, old-attempt writes, atomic proof/rearming and stable workflow identities, read-only probes and unavailable outcomes, append-only evidence, migration restore/interruption, escaped staff notes/safe links, raw provider/token/pending-data omissions, dependency/upstream/license and V2 boundaries. Workflow-version source, lockfile, dependency versions, upstream pin and AGPL notices are unchanged. `package.json` only expands lint coverage.

## Operations and limitations

See [ACTION-DASHBOARD.md](../ACTION-DASHBOARD.md), [MIGRATIONS.md](../MIGRATIONS.md), [DEVELOPMENT.md](../DEVELOPMENT.md), ADR-014 and updated root AGENTS.md. Recovery probes are bounded to five seconds under the shared policy transaction; no publishing mutation holds that lock. The local migration rehearsal used uniquely named disposable databases; no customer database or persistent service volume was reset. Preserve the entire attempt/evidence/command history and matching private media/guarded binary during restore. Restore cannot undo an already accepted remote mutation.

This remains an intermediate V1 development phase. Inherited live providers do not acquire safe retry/unknown reconciliation merely because a generic exception looks unsuccessful. The supported synthetic contract is verified; inherited pending contracts and real OAuth/reconnection/platform rendering/delivery remain unverified. Unsupported evidence requires manual investigation without force resend or manual publication certification. Production due grace is two minutes; only acknowledged local synthetic tests use two seconds. Performance/priority-provider/integrated hardening are Phase 5 gates; independent-clone release acceptance is Phase 6. All V2 enhancements remain deferred.

## Next phase

Phase 4 is complete, with all required local gates evidenced and no unresolved severity 0/1/2 finding. Next eligible prompt: **Start phase 5**. Continue from this tested branch while earlier phase PRs remain unmerged; origin/main does not contain these foundations. Phases 5–6 remain planned. Stop here.

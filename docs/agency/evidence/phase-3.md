# Phase 3 — Client review experience

Status: complete
Started/updated (UTC): 2026-10-13; final acceptance started 12:06:50.269Z.
Base: phase/2-approvals at bc29e5c581ff18749950fd4c56f790757738d7df; unmerged draft PR #3.
Scope: V1-REV-001 and V1-REV-002; verified invitations, narrow review sessions, weekly portal and staff integration.

Tested implementation/test/migration/tooling identity: SHA-256 `21630e8eb858ce732065054dc0e8eacf2b63b6de05c9e61c502733d9e7d36843`. Private `.agency/phase3-tested-source.json` lists the 33 paths and deterministic digest algorithm. Documentation is excluded from that digest.
Delivery: final acceptance complete; branch `phase/3-client-review`. Commit/PR will be recorded in a documentation-only follow-up after delivery.

## Completed implementation

- Administrators invite a client reviewer for all or selected channels, inspect delivery/expiry, renew or revoke access. Passwordless invited identities receive no editor, publisher or administrator grants. Ordinary password login rejects them safely.
- Separate mailbox and browser proof exchanges one invitation into one narrow session. Only hashes/HMACs are stored. Invitations last at most seven days; sessions at most 24 hours. Current reviewer/email, issuer, client and channel policy is rechecked. External decisions remain bound to the original invitation; renewal cannot revive an old approval.
- `/review` has a separate root layout without application analytics. Its weekly UTC list shows immutable per-target copy, account identity, ordered private media/alt text, validated publication settings and proposed time/timezone. Unknown/internal settings, source paths, pending provider data and legacy notes are omitted. Superseded/unavailable items reveal no new draft.
- Clients approve or request changes for exact revisions, receive independent outcomes for bulk decisions, and add append-only client-visible feedback. Staff see feedback in the retained composer, save a new revision, request fresh approval and schedule with explicit publisher permissions. Approval itself does not enqueue publishing.
- Cookie/Origin/CSRF checks, database-backed quotas, private media/ranges, no-store/no-referrer/framing protections and review telemetry exclusion protect the portal. Sensitive mail uses the existing transport directly, outside Temporal history and email console output. Local mail failure cannot create verified access.
- Six additive migrations now exist. New review tables and invitation-bound decisions include foreign keys, scope/lifetime guards, immutable feedback and policy serialization. No publishing workflow-version source was changed.

## Executed check evidence

Commands ran from `/workspace/postiz` on 2026-10-13 with Node 22.23.3, pnpm 10.6.1, Prisma 6.5, Playwright 1.58.2, Vitest 3.1.4 and Chromium 154. PostgreSQL, Redis, Temporal, Mailpit and the application HTTP servers were real local services. External publishing used only the synthetic provider. Prefix runtime commands below with `bash scripts/agency/with-env.sh`.

| Gate | Executed command / coverage | Exit and result | Private artifact / source |
| --- | --- | --- | --- |
| Resumed baseline | `pnpm exec playwright test --config playwright.agency.config.ts` before changes | 0; 51 passed | `.agency/phase3-baseline.log` |
| Production builds | `pnpm run build`, final changed backend/orchestrator builds, then owned runtime start | 0; frontend/backend/orchestrator complete and ready | `.agency/phase3-build-final.log`, `phase3-backend-final.log`, `phase3-worker-final.log`, `phase3-start-final.log` |
| Unit | `pnpm test` | 0; 22 passed across 4 files, zero failed/skipped | `.agency/phase3-unit-final.log`; `review.security.unit.test.ts` |
| Targeted portal journey | `pnpm exec playwright test --config playwright.agency.config.ts tests/agency/review.browser.spec.ts` | 0; both desktop and 360px keyboard journeys passed after harness corrections | `.agency/phase3-browser-keyboard.log` |
| T03-01 | Executed `review.api.spec.ts` and browser journey | Verified exact approval; ordinary login/staff API denied to passwordless reviewer; approved content alone schedules; no decision by GET | Full regression result below |
| T03-02 | Executed review/API security and unit cases | Forwarded/unverified/wrong browser, expired/revoked/renewed access, disabled reviewer/issuer, changed email, racing exchange, CSRF/Origin/automation, bounded guesses/quotas and spoofed forwarding headers covered | `review.api.spec.ts`, `review.security.unit.test.ts` |
| T03-03 | Executed weekly scope, bulk, feedback and private media cases | Filtering precedes pagination; foreign client/channel/agency denied; exact frozen projection, independent stale conflicts and idempotent decisions; feedback leaves approval unchanged | `review.api.spec.ts` |
| T03-04 | Real browser staff/client/staff journey | Invite → mailbox verification → feedback/changes → staff new revision → fresh client approval → publisher keyboard scheduling/cancel; desktop and 360px | `review.browser.spec.ts` |
| Migration and restore | `node scripts/agency/migrate.mjs`; `python3 scripts/agency/rehearse-migration.py` | 0; six migrations deployed; 16 rehearsal gates passed | `.agency/phase3-migration-rehearsal.log` |
| Temporal replay | `node scripts/agency/replay.mjs` | 0; 6 persisted UNKNOWN/PENDING/FAILED/CONFIRMED histories replayed; no activities executed | `.agency/phase3-replay.log` |
| Static and types | `pnpm run lint:agency`; `pnpm run typecheck:agency`; backend/orchestrator build-tsconfig and frontend tsconfig no-emit | 0; no errors | `.agency/phase3-lint-delivery.log`, `phase3-test-types-delivery.log`, `phase3-*-types-final.log` |
| Log redaction | Compare local Mailpit invitation secrets/code text with all three application logs, without displaying proof | 0; 38 invitation-secret and 42 code samples; zero matching proof leaks | `.agency/phase3-log-redaction.log`; telemetry helper unit tests |
| Entry review | `node scripts/agency/inventory.mjs`; `git diff --check` | 0; 391 static surfaces: 286 HTTP, 11 MCP transports, 20 tools, 33 provider bindings, 18 worker/service boundaries, 22 workflows, one media handler | `entry-paths.csv`; static inventory is not runtime certification |
| Final aggregate regression | `pnpm exec playwright test --config playwright.agency.config.ts` | 0; **67 passed** (58 API, 9 browser), zero failed/skipped/flaky; started 12:06:50.269Z, duration 250.438s | `.agency/phase3-full-final.log`, `phase3-full-final-stats.json` |
| Owned app/worker restart | `node scripts/agency/restart-approval.mjs` after runtime probe fix | 0; approved persisted queue survived shutdown/start; exactly one confirmed synthetic mutation; all HTTP services ready | `.agency/phase3-restart-final.log` |
| Final diff/private-value/state review | staged value scan, `git diff --cached --check`, `python3 scripts/agency/plan.py check` | 0; no private JWT/fixture/invitation secrets or ignored artifacts staged; planning/state consistent | `.agency/phase3-staged-secret-scan.log`; planning checker output |

Earlier full run: 66 passed, one failed mobile keyboard harness; it is not acceptance evidence. CI already runs the relevant unit/integration/migration/replay/restart gates; no hosted GitHub CI pass is claimed. Private logs/browser artifacts/local mailbox messages stay ignored.

## Defects and source review

Six resolved implementation/setup findings are in [phase-3-fixes.md](bugs/phase-3-fixes.md) and `defects.csv`: inherited-target string formatting, passwordless login, unknown/private settings projection, renewed invitation availability, unsaved composer/channel-switch state, and a TIME_WAIT-sensitive restart probe. The probe now matches server reuse behavior while retaining active-listener and process-ownership refusal; actual restart is tested below. Application source is unchanged after the green aggregate suite; only this runtime helper was corrected and checked afterward. Harness corrections use the actual synthetic channel label and wait for enabled/focused controls before keyboard actions; workflow assertions remain intact.

Reviewed server-only actor construction, current policy and original decision binding, invitation/session transaction ordering, one-time exchange races, actor-scoped command idempotency, SQL scope/immutability/lifetime guards, scoped weekly/history/private-media projections, mail and telemetry paths, delivery failure, runtime logs, dependency/license/upstream diff and V2 exclusions. Existing dispatch claims and UNKNOWN/no-blind-retry behavior remain enforced. No lockfile, dependency version, upstream pin, workflow version or AGPL notice changes. `package.json` only extends lint coverage.

## Operations and limits

See [REVIEW-PORTAL.md](../REVIEW-PORTAL.md), [MIGRATIONS.md](../MIGRATIONS.md), [DEVELOPMENT.md](../DEVELOPMENT.md) and ADR-013. Rehearsal used uniquely named disposable databases; no customer database or persistent service volume was reset. Connection interruption rolls back Phase 3 before COMMIT; redeployment and dump/restore preserve invitations, verified sessions and public feedback. Restore needs the matching application, original private media/snapshots and verification HMAC secret. Additive rollback/restore follows the migration runbook.

This is an intermediate V1 phase. The preview is a semantic exact-content view, not a guarantee of every network's visual rendering. Actual customer email delivery, OAuth/app approvals and live network behavior remain unverified. Channel onboarding, dashboard/recovery, broader hardening and independent-clone release acceptance retain their assigned phases. Reverse proxies must use the documented cookie/Origin profile; quotas use socket peers. V2 remains deferred.

## Next phase

Phase 3 is complete with no unresolved severity 0/1/2 defect or required local gate. Next eligible prompt: **Start phase 4**. Continue from this tested branch if earlier phase PRs remain unmerged; origin/main does not contain these foundations. Phases 4–6 remain planned; stop here.

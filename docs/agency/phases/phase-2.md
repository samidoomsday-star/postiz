# Phase 2 — Revision approvals and dispatch enforcement

Status lives in [project-state.json](../project-state.json). Read root AGENTS.md, PRODUCT-SPEC.md, TECHNICAL-SPEC.md and TEST-STRATEGY.md before starting.

**Prerequisite:** Phase 1 complete with evidence.

**Requirements:** V1-APR-001, V1-APR-002, V1-APR-003.

Read ADR-011 and the Phase 1 report: the current safe entry is the minimal `/agency` workspace. Integrate retained Postiz editing/calendar/media capabilities through scoped services as a necessary V1 dependency; do not reenable organization-wide APIs by removing the guard. Private provider-fetch media capabilities and pending finalization need revision/client binding before reopening. This is not V2 general REST/MCP editing parity.

## Ordered work

1. Implement immutable publishable revisions, request/decision records and additive migrations. Capture final per-channel text, media versions, settings, account and proposed time; material changes create a new revision.
2. Implement submit, approve, request-changes, revoke and schedule transitions with current authorization and expected-revision checks. Use a minimal authenticated internal surface/API to test them; the external portal comes in Phase 3.
3. Route every ingestion/scheduling path through the same policy. Repeat occurrences and delayed parts must be individually eligible; server-disable bypassing legacy automations until they can be gated.
4. Implement the atomic dispatch claim and immutable-payload handoff around existing Temporal/provider behavior. Serialize revocation/edit vs claim; preserve uncertainty and no-blind-retry semantics. Add only the receipt fields needed to prove eligibility and outcomes.
5. Handle stale versions, duplicate commands, connection reassignment, media mutation/deletion, queued legacy records and partial thread cancellation. No silent auto-approval or owner bypass.
6. Run concurrency and workflow replay/restart cases against real services plus the fake provider. Assert zero external-mutation calls on denial, one approved payload on valid dispatch, and accurate in-flight status after claim.
7. Update state-transition/API documentation, migration instructions, entry-path enforcement coverage and requirement tests.

## Explicit exclusions

External review invitation/portal polish, dashboard product features, general edit/reschedule API parity, V2 intake deduplication and webhook/RSS redesign.

## Validation and bug loop

Execute T02-01, T02-02, T02-03, T02-04, T02-05, T02-06 from [TEST-STRATEGY.md](../TEST-STRATEGY.md), plus relevant regression from previous phases. Record actual commands, targets, versions, counts, failures, fixes and retest evidence. Inspect the final diff and update traceability; do not mark an unrun or mocked live test as passed.

## Completion gate

Every external publishing path uses an approved immutable revision or is explicitly server-disabled. Revocation race semantics and duplicate command behavior are proved by failure-injection tests.

Create/update `docs/agency/evidence/phase-2.md` using the report template. Populate the phase checks in project-state.json. Run the plan checker, commit/push the reviewable result, and stop. The next valid implementation prompt is **Start phase 3**.
